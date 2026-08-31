import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AssetStore } from './assetStore.js';
import {
  normalizeProviderEndpoint,
  validateMiniMaxApiKey,
  type MediaProviderKind,
  type MediaProviderStore,
  type ResolvedMediaProvider,
} from './mediaProviderStore.js';
import { createProceduralModel3dGlb } from './proceduralModel3d.js';
import type { GameAssetRecord, GameAssetSource } from '../shared/contracts.js';

export interface MediaGenerationProject {
  id: string;
  root: string;
}

export interface MediaGenerationInput {
  project: MediaGenerationProject;
  kind: MediaProviderKind;
  name: string;
  prompt: string;
  model?: string;
  options?: Readonly<Record<string, string | number | boolean>>;
}

export interface MediaGenerationAssetResult {
  outcome: 'asset';
  asset: GameAssetRecord;
  provider: {
    id: string;
    presetId: string;
    displayName: string;
    model: string;
    route: 'configured-api' | 'threejs-fallback';
  };
}

export interface MediaGenerationFallbackResult {
  outcome: 'fallback';
  fallback: 'codex-imagegen' | 'procedural-audio' | 'none';
  reason: 'provider-not-configured' | 'purpose-not-supported';
  prompt: string;
}

export type MediaGenerationResult = MediaGenerationAssetResult | MediaGenerationFallbackResult;

/**
 * A deliberately redacted media failure that is safe for the App Server tool result.
 * Raw provider bodies, credentials, URLs, and filesystem errors must never use this type.
 */
export class MediaGenerationPublicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaGenerationPublicError';
  }
}

interface MediaProviderProbeSummary {
  id: string;
  presetId: string;
  displayName: string;
  model: string;
}

export type MediaProviderProbeResult =
  | { outcome: 'ready'; provider: MediaProviderProbeSummary }
  | { outcome: 'not-configured' }
  | { outcome: 'unsupported'; provider: MediaProviderProbeSummary };

export interface MediaGenerationServiceOptions {
  providerStore: Pick<MediaProviderStore, 'withActiveProvider'>;
  assetStore: Pick<AssetStore, 'list' | 'importFiles' | 'registerExisting'>;
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
}

const BYTE_LIMITS: Readonly<Record<MediaProviderKind, number>> = {
  image: 32 * 1024 * 1024,
  audio: 64 * 1024 * 1024,
  model3d: 128 * 1024 * 1024,
};
const MAX_JSON_OVERHEAD_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_PROMPT_LENGTH = 8_000;
const MAX_NAME_LENGTH = 100;
const MAX_MODEL_LENGTH = 200;
const MAX_MINIMAX_MUSIC_PROMPT_LENGTH = 2_000;
const MAX_MINIMAX_LYRICS_LENGTH = 3_500;
const MINIMAX_MUSIC_MODEL = 'music-3.0';
const MINIMAX_SPEECH_MODEL = 'speech-2.8-hd';
const MINIMAX_PROBE_MODEL = 'speech-2.8-turbo';
const MINIMAX_SPEECH_PATH = 'v1/t2a_v2';
const MINIMAX_MUSIC_PATH = 'v1/music_generation';
const MAX_MINIMAX_ERROR_BYTES = 64 * 1024;
const MINIMAX_STATUS_MESSAGES = new Map<number, string>([
  [1000, 'MiniMax 服务返回未知错误，请稍后重试。'],
  [1001, 'MiniMax 请求超时，请稍后重试。'],
  [1002, '请求过于频繁，请稍后重试。'],
  [1004, '鉴权失败：请确认 API Key 有效，并且国际站/中国站区域选择正确。'],
  [1008, '账户余额不足，请在 MiniMax 开放平台充值后重试。'],
  [1024, 'MiniMax 服务内部错误，请稍后重试。'],
  [1026, '输入内容触发 MiniMax 安全策略。'],
  [1027, '输出内容触发 MiniMax 安全策略。'],
  [1033, 'MiniMax 系统错误，请稍后重试。'],
  [1039, '账户的 Token 或用量限制已达到。'],
  [1041, '并发连接数已达到限制。'],
  [1042, '输入包含过多非法或不可见字符。'],
  [2013, '请求参数无效。'],
  [20132, '所选 voice_id 无效。'],
  [2042, '当前账户无权使用所选 voice_id。'],
  [2049, 'API Key 无效或已失效。'],
  [2056, '当前套餐或账户的使用额度已达到限制。'],
  [2153, '当前账户没有 Music API 使用资格；请确认所选区域的音乐 API 权限，或联系 MiniMax 支持。'],
]);

type MiniMaxPurpose = 'music' | 'speech' | 'vocal-sfx' | 'sfx' | 'ambience';

interface GeneratedBytes {
  bytes: Buffer;
  extension: '.png' | '.jpg' | '.webp' | '.wav' | '.mp3' | '.ogg' | '.glb';
  mimeType: string;
}

interface PersistMetadata {
  name: string;
  prompt: string;
  provider: string;
  model: string;
  presetId: string;
  source?: GameAssetSource;
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Calls configured media APIs and imports only validated files through AssetStore.
 * Provider JSON/base64 is consumed privately and is never returned to App Server JSON-RPC.
 */
export class MediaGenerationService {
  readonly #options: MediaGenerationServiceOptions;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: MediaGenerationServiceOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.#requestTimeoutMs) || this.#requestTimeoutMs < 1_000 || this.#requestTimeoutMs > 600_000) {
      throw new Error('Media request timeout must be between 1 and 600 seconds');
    }
  }

  async generate(input: MediaGenerationInput): Promise<MediaGenerationResult> {
    const name = requiredText(input.name, 'name', MAX_NAME_LENGTH);
    const prompt = requiredText(input.prompt, 'prompt', MAX_PROMPT_LENGTH);
    const modelOverride = input.model === undefined ? undefined : requiredText(input.model, 'model', MAX_MODEL_LENGTH);
    const options = validateOptions(input.options);
    const result = await this.#options.providerStore.withActiveProvider(input.kind, async (provider) => {
      const unsupportedFallback = providerFallback(provider, input.kind, prompt, options);
      if (unsupportedFallback) return unsupportedFallback;
      const model = resolveModel(provider, modelOverride, options);
      const generated = await this.#requestGeneratedMedia(provider, input.kind, prompt, model, options);
      const asset = await this.#persist(input.project, generated, {
        name,
        prompt,
        provider: `${provider.preset.vendor}:${provider.displayName}`,
        model,
        presetId: provider.preset.id,
      });
      return {
        outcome: 'asset',
        asset,
        provider: {
          id: provider.id,
          presetId: provider.preset.id,
          displayName: provider.displayName,
          model,
          route: 'configured-api',
        },
      } satisfies MediaGenerationAssetResult;
    });
    if (result) return result;
    if (input.kind === 'model3d') {
      const procedural = await createProceduralModel3dGlb({
        name,
        prompt,
        animation: options.animation === true,
      });
      const model = procedural.generator;
      const presetId = 'threejs-procedural';
      const displayName = 'Three.js Procedural GLB';
      const asset = await this.#persist(input.project, {
        bytes: procedural.bytes,
        extension: '.glb',
        mimeType: 'model/gltf-binary',
      }, {
        name,
        prompt,
        provider: `Noobi:${displayName}`,
        model,
        presetId,
        source: 'procedural',
        metadata: {
          route: 'threejs-fallback',
          generator: procedural.generator,
          preset: procedural.preset,
          rigged: procedural.rigged,
          animated: procedural.animated,
          animations: procedural.animations,
          vertexCount: procedural.vertexCount,
          triangleCount: procedural.triangleCount,
          promptSha256: procedural.promptSha256,
          selfContained: true,
        },
      });
      return {
        outcome: 'asset',
        asset,
        provider: {
          id: 'builtin-threejs',
          presetId,
          displayName,
          model,
          route: 'threejs-fallback',
        },
      } satisfies MediaGenerationAssetResult;
    }
    return {
      outcome: 'fallback',
      fallback: input.kind === 'image'
        ? 'codex-imagegen'
        : input.kind === 'audio'
          ? 'procedural-audio'
          : 'none',
      reason: 'provider-not-configured',
      prompt,
    };
  }

  /**
   * Performs a deliberately tiny, redacted connectivity check for the active audio provider.
   * MiniMax uses its low-cost speech turbo model; other vendors are never charged implicitly.
   */
  async probeActiveAudioProvider(): Promise<MediaProviderProbeResult> {
    const result = await this.#options.providerStore.withActiveProvider('audio', async (provider) => {
      const providerSummary = (model: string): MediaProviderProbeSummary => ({
        id: provider.id,
        presetId: provider.preset.id,
        displayName: provider.displayName,
        model,
      });
      if (provider.preset.adapter !== 'minimax-audio') {
        return { outcome: 'unsupported', provider: providerSummary(provider.model) } satisfies MediaProviderProbeResult;
      }
      await this.#requestGeneratedMedia(provider, 'audio', 'OK.', MINIMAX_PROBE_MODEL, {
        purpose: 'speech',
        format: 'mp3',
        voice: provider.preset.id === 'minimax-audio-cn'
          ? 'male-qn-qingse'
          : 'English_expressive_narrator',
        sampleRate: 16_000,
        bitrate: 32_000,
      });
      return { outcome: 'ready', provider: providerSummary(MINIMAX_PROBE_MODEL) } satisfies MediaProviderProbeResult;
    });
    return result ?? { outcome: 'not-configured' };
  }

  async #requestGeneratedMedia(
    provider: Readonly<ResolvedMediaProvider>,
    kind: MediaProviderKind,
    prompt: string,
    model: string,
    options: Readonly<Record<string, string | number | boolean>>,
  ): Promise<GeneratedBytes> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#requestTimeoutMs);
    try {
      const endpoint = requestEndpoint(provider, options);
      const response = await this.#fetch(endpoint, {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers: requestHeaders(provider, kind),
        body: JSON.stringify(requestBody(provider, kind, prompt, model, options)),
      });
      assertNoRedirect(response);
      if (!response.ok) {
        if (provider.preset.adapter === 'minimax-audio') throw await miniMaxHttpError(response);
        throw new Error(`Media provider returned HTTP ${response.status}`);
      }
      return await this.#readProviderResponse(
        response,
        kind,
        provider.preset.adapter,
        endpoint,
        controller.signal,
        options,
      );
    } catch (error) {
      if (controller.signal.aborted) {
        throw new MediaGenerationPublicError('Media provider request timed out');
      }
      throw publicMediaRequestError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  async #readProviderResponse(
    response: Response,
    kind: MediaProviderKind,
    adapter: ResolvedMediaProvider['preset']['adapter'],
    providerEndpoint: string,
    signal: AbortSignal,
    options: Readonly<Record<string, string | number | boolean>>,
  ): Promise<GeneratedBytes> {
    const contentType = normalizeContentType(response.headers.get('content-type'));
    if (isMediaContentType(contentType)) {
      if (adapter === 'minimax-audio') {
        throw new Error('MiniMax response must use the requested JSON hex format');
      }
      const bytes = await readBoundedBody(response, BYTE_LIMITS[kind]);
      return validateGeneratedBytes(bytes, kind, contentType);
    }

    const encodedLimit = adapter === 'minimax-audio'
      ? BYTE_LIMITS[kind] * 2 + MAX_JSON_OVERHEAD_BYTES
      : Math.ceil(BYTE_LIMITS[kind] * 4 / 3) + MAX_JSON_OVERHEAD_BYTES;
    const jsonBytes = await readBoundedBody(response, encodedLimit);
    let value: unknown;
    try {
      value = JSON.parse(jsonBytes.toString('utf8'));
    } catch {
      throw new Error('Media provider returned neither supported media nor JSON');
    }

    const inline = findInlineMedia(value, adapter, kind, options);
    if (inline) {
      const bytes = inline.encoding === 'hex'
        ? decodeBoundedHex(inline.data, BYTE_LIMITS[kind])
        : decodeBoundedBase64(inline.data, BYTE_LIMITS[kind]);
      const generated = validateGeneratedBytes(bytes, kind, inline.mimeType);
      if (inline.expectedExtension && generated.extension !== inline.expectedExtension) {
        throw new Error('Generated audio format does not match the requested format');
      }
      return generated;
    }

    if (adapter === 'minimax-audio') {
      throw new Error('MiniMax response did not include completed audio data');
    }

    const outputUrl = findOutputUrl(value);
    if (!outputUrl) throw new Error('Media provider response did not include media bytes or a download URL');
    return this.#downloadGeneratedMedia(outputUrl, providerEndpoint, kind, signal);
  }

  async #downloadGeneratedMedia(
    urlValue: string,
    providerEndpoint: string,
    kind: MediaProviderKind,
    signal: AbortSignal,
  ): Promise<GeneratedBytes> {
    const safeUrl = normalizeProviderEndpoint(urlValue);
    if (new URL(safeUrl).origin !== new URL(providerEndpoint).origin) {
      throw new Error('Generated media download URL must share the configured provider endpoint origin');
    }
    const response = await this.#fetch(safeUrl, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: { Accept: acceptFor(kind) },
    });
    assertNoRedirect(response);
    if (!response.ok) throw new Error(`Generated media download returned HTTP ${response.status}`);
    const contentType = normalizeContentType(response.headers.get('content-type'));
    const bytes = await readBoundedBody(response, BYTE_LIMITS[kind]);
    return validateGeneratedBytes(bytes, kind, contentType);
  }

  async #persist(
    project: MediaGenerationProject,
    generated: GeneratedBytes,
    metadata: PersistMetadata,
  ): Promise<GameAssetRecord> {
    const before = new Set((await this.#options.assetStore.list(project.id, project.root)).map((asset) => asset.relativePath));
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'noobi-media-generation-'));
    const hashPrefix = createHash('sha256').update(generated.bytes).digest('hex').slice(0, 12);
    const temporaryPath = join(temporaryRoot, `${safeStem(metadata.name)}-${hashPrefix}-${randomUUID()}${generated.extension}`);
    try {
      await writeFile(temporaryPath, generated.bytes, { flag: 'wx', mode: 0o600 });
      const [imported] = await this.#options.assetStore.importFiles(project.id, project.root, [temporaryPath]);
      if (!imported) throw new Error('AssetStore did not return an imported media asset');
      if (before.has(imported.relativePath)) return imported;
      return this.#options.assetStore.registerExisting({
        projectId: project.id,
        root: project.root,
        relativePath: imported.relativePath,
        name: metadata.name,
        source: metadata.source ?? 'generated',
        prompt: metadata.prompt,
        provider: metadata.provider,
        metadata: {
          model: metadata.model,
          presetId: metadata.presetId,
          mediaGeneration: true,
          ...metadata.metadata,
        },
      });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

function publicMediaRequestError(error: unknown): MediaGenerationPublicError {
  if (error instanceof MediaGenerationPublicError) return error;
  const message = error instanceof Error ? error.message : '';
  const safePrefixes = [
    'MiniMax ',
    'MiniMax 请求失败',
    'Provider ',
    'Media provider ',
    'Generated ',
    'Encoded media ',
  ];
  if (message && safePrefixes.some((prefix) => message.startsWith(prefix))) {
    return new MediaGenerationPublicError(message);
  }
  return new MediaGenerationPublicError('Media provider request failed before receiving a valid response');
}

function providerFallback(
  provider: Readonly<ResolvedMediaProvider>,
  kind: MediaProviderKind,
  prompt: string,
  options: Readonly<Record<string, string | number | boolean>>,
): MediaGenerationFallbackResult | null {
  if (provider.preset.adapter !== 'minimax-audio') return null;
  if (kind !== 'audio') throw new Error('MiniMax audio adapter cannot generate this media kind');
  const purpose = miniMaxPurpose(options);
  if (purpose !== 'sfx' && purpose !== 'ambience') return null;
  return {
    outcome: 'fallback',
    fallback: 'procedural-audio',
    reason: 'purpose-not-supported',
    prompt,
  };
}

function resolveModel(
  provider: Readonly<ResolvedMediaProvider>,
  modelOverride: string | undefined,
  options: Readonly<Record<string, string | number | boolean>>,
): string {
  if (provider.preset.adapter !== 'minimax-audio') return modelOverride ?? provider.model;
  const purpose = miniMaxPurpose(options);
  const configured = modelOverride ?? provider.model;
  if (purpose === 'music') {
    if (modelOverride && !configured.startsWith('music-')) {
      throw new MediaGenerationPublicError(
        'MiniMax music model must use an API ID such as music-3.0; omit model to use the selection from Settings',
      );
    }
    return configured.startsWith('music-') ? configured : MINIMAX_MUSIC_MODEL;
  }
  if (purpose === 'speech' || purpose === 'vocal-sfx') {
    if (modelOverride && !configured.startsWith('speech-')) {
      throw new MediaGenerationPublicError(
        'MiniMax speech model must use an API ID such as speech-2.8-hd; omit model to use the selection from Settings',
      );
    }
    return configured.startsWith('speech-') ? configured : MINIMAX_SPEECH_MODEL;
  }
  return configured;
}

function requestEndpoint(
  provider: Readonly<ResolvedMediaProvider>,
  options: Readonly<Record<string, string | number | boolean>>,
): string {
  const endpoint = normalizeProviderEndpoint(provider.endpoint);
  if (provider.preset.adapter !== 'minimax-audio') return endpoint;
  const purpose = miniMaxPurpose(options);
  const path = purpose === 'music' ? MINIMAX_MUSIC_PATH : MINIMAX_SPEECH_PATH;
  const url = new URL(endpoint);
  const basePath = url.pathname
    .replace(/\/v1\/(?:music_generation|t2a_v2)\/?$/u, '')
    .replace(/\/+$/u, '');
  url.pathname = `${basePath}/${path}`;
  url.search = '';
  return normalizeProviderEndpoint(url.toString());
}

function requestHeaders(
  provider: Readonly<ResolvedMediaProvider>,
  kind: MediaProviderKind,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: `${acceptFor(kind)}, application/json`,
  };
  if (provider.preset.adapter === 'minimax-audio') {
    if (provider.auth !== 'bearer' || !provider.apiKey) throw new Error('MiniMax requires Bearer authentication');
    headers.Authorization = `Bearer ${validateMiniMaxApiKey(provider.apiKey)}`;
    return headers;
  }
  if (provider.auth === 'bearer' && provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  if (provider.auth === 'x-api-key' && provider.apiKey) headers['xi-api-key'] = provider.apiKey;
  return headers;
}

function requestBody(
  provider: Readonly<ResolvedMediaProvider>,
  kind: MediaProviderKind,
  prompt: string,
  model: string,
  options: Readonly<Record<string, string | number | boolean>>,
): Record<string, unknown> {
  switch (provider.preset.adapter) {
    case 'openai-image': {
      const width = typeof options.width === 'number' ? options.width : undefined;
      const height = typeof options.height === 'number' ? options.height : undefined;
      return {
        model,
        prompt,
        ...(width && height ? { size: `${width}x${height}` } : {}),
        ...(typeof options.quality === 'string' ? { quality: options.quality } : {}),
        ...(typeof options.background === 'string' ? { background: options.background } : {}),
      };
    }
    case 'openai-speech':
      return {
        model,
        input: prompt,
        voice: typeof options.voice === 'string' ? options.voice : 'alloy',
        response_format: typeof options.format === 'string' ? options.format : 'wav',
        ...(typeof options.speed === 'number' ? { speed: options.speed } : {}),
      };
    case 'elevenlabs-sound':
      return {
        text: prompt,
        model_id: model,
        ...(typeof options.durationSeconds === 'number' ? { duration_seconds: options.durationSeconds } : {}),
        ...(typeof options.promptInfluence === 'number' ? { prompt_influence: options.promptInfluence } : {}),
      };
    case 'minimax-audio':
      return miniMaxRequestBody(kind, prompt, model, options);
    case 'generic-json':
      return { kind, prompt, model, options };
  }
}

function miniMaxRequestBody(
  kind: MediaProviderKind,
  prompt: string,
  model: string,
  options: Readonly<Record<string, string | number | boolean>>,
): Record<string, unknown> {
  if (kind !== 'audio') throw new Error('MiniMax audio adapter cannot generate this media kind');
  const purpose = miniMaxPurpose(options);
  if (options.durationSeconds !== undefined) {
    throw new Error('MiniMax audio does not support durationSeconds; control music looping and playback duration in the game');
  }
  const format = miniMaxFormat(options);
  if (purpose === 'music') {
    if (prompt.length > MAX_MINIMAX_MUSIC_PROMPT_LENGTH) {
      throw new Error(`MiniMax music prompt exceeds ${MAX_MINIMAX_MUSIC_PROMPT_LENGTH} characters`);
    }
    const lyrics = typeof options.lyrics === 'string' ? options.lyrics : undefined;
    if (lyrics && lyrics.length > MAX_MINIMAX_LYRICS_LENGTH) {
      throw new Error(`MiniMax lyrics exceed ${MAX_MINIMAX_LYRICS_LENGTH} characters`);
    }
    const instrumental = typeof options.instrumental === 'boolean' ? options.instrumental : !lyrics;
    return {
      model,
      prompt,
      stream: false,
      output_format: 'hex',
      is_instrumental: instrumental,
      ...(instrumental
        ? {}
        : lyrics
          ? { lyrics }
          : { lyrics: '', lyrics_optimizer: true }),
      audio_setting: {
        sample_rate: 44_100,
        bitrate: 256_000,
        format,
      },
    };
  }
  if (purpose !== 'speech' && purpose !== 'vocal-sfx') {
    throw new Error('MiniMax purpose must be handled by procedural audio');
  }
  const sampleRate = numericOption(options.sampleRate, 16_000, 48_000, 32_000);
  const bitrate = numericOption(options.bitrate, 32_000, 256_000, 128_000);
  return {
    model,
    text: prompt,
    stream: false,
    output_format: 'hex',
    language_boost: 'auto',
    voice_setting: {
      voice_id: typeof options.voice === 'string' ? options.voice : 'English_expressive_narrator',
      speed: 1,
      vol: 1,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: sampleRate,
      bitrate,
      format,
      channel: 1,
    },
  };
}

function acceptFor(kind: MediaProviderKind): string {
  if (kind === 'image') return 'image/png, image/jpeg, image/webp';
  if (kind === 'audio') return 'audio/wav, audio/mpeg, audio/ogg';
  return 'model/gltf-binary, application/octet-stream';
}

function assertNoRedirect(response: Response): void {
  if (response.status >= 300 && response.status < 400) {
    throw new Error('Media provider redirects are not allowed');
  }
}

async function readBoundedBody(response: Response, maximumBytes: number): Promise<Buffer> {
  const declared = response.headers.get('content-length');
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > maximumBytes) {
      throw new Error('Media provider response exceeds the byte limit');
    }
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Media provider response exceeds the byte limit');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

function findInlineMedia(
  value: unknown,
  adapter: ResolvedMediaProvider['preset']['adapter'],
  kind: MediaProviderKind,
  options: Readonly<Record<string, string | number | boolean>>,
): {
  data: string;
  encoding: 'base64' | 'hex';
  mimeType: string;
  expectedExtension?: GeneratedBytes['extension'];
} | null {
  const record = asRecord(value);
  if (adapter === 'minimax-audio') {
    if (kind !== 'audio') throw new Error('MiniMax returned media for an unsupported kind');
    assertMiniMaxResponseStatus(value);
    const data = asRecord(record?.data);
    if (data?.status !== 2 || typeof data.audio !== 'string' || data.audio.length === 0) {
      throw new Error('MiniMax response did not include completed audio data');
    }
    const format = miniMaxFormat(options);
    return {
      data: data.audio,
      encoding: 'hex',
      mimeType: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      expectedExtension: format === 'wav' ? '.wav' : '.mp3',
    };
  }
  if (kind !== 'image') return null;
  const first = Array.isArray(record?.data) ? asRecord(record.data[0]) : null;
  const b64 = typeof first?.b64_json === 'string' ? first.b64_json : null;
  if (!b64 || (adapter !== 'openai-image' && adapter !== 'generic-json')) return null;
  return { data: b64, encoding: 'base64', mimeType: 'image/png' };
}

function assertMiniMaxResponseStatus(value: unknown): void {
  const failure = miniMaxFailureMessage(value);
  if (failure) throw new Error(failure);
}

function miniMaxFailureMessage(value: unknown, missingIsFailure = true): string | null {
  const record = asRecord(value);
  const baseResponse = asRecord(record?.base_resp);
  const rawCode = baseResponse?.status_code;
  if (rawCode === 0) return null;
  if (rawCode === undefined && !missingIsFailure) return null;
  if (typeof rawCode !== 'number' || !Number.isSafeInteger(rawCode) || rawCode < 0) {
    return 'MiniMax 返回了无效的业务状态码。';
  }
  const detail = MINIMAX_STATUS_MESSAGES.get(rawCode)
    ?? 'MiniMax 拒绝请求，请核对账户区域、余额、模型权限和请求参数。';
  const traceId = typeof record?.trace_id === 'string' && /^[0-9a-f]{16,64}$/iu.test(record.trace_id)
    ? ` Trace ID: ${record.trace_id}`
    : '';
  return `MiniMax 请求失败（status_code: ${rawCode}）：${detail}${traceId}`;
}

async function miniMaxHttpError(response: Response): Promise<Error> {
  const contentType = normalizeContentType(response.headers.get('content-type'));
  if (contentType === 'application/json' || contentType.endsWith('+json')) {
    try {
      const bytes = await readBoundedBody(response, MAX_MINIMAX_ERROR_BYTES);
      const failure = miniMaxFailureMessage(JSON.parse(bytes.toString('utf8')), false);
      if (failure) return new Error(failure);
    } catch {
      // Never surface a provider error body. Fall through to a safe HTTP-only message.
    }
  }
  const detail = response.status === 401 || response.status === 403
    ? '鉴权失败：请确认 API Key 有效，并且国际站/中国站区域选择正确。'
    : response.status === 429
      ? '请求过于频繁，请稍后重试。'
      : response.status >= 500
        ? 'MiniMax 服务暂时不可用，请稍后重试。'
        : 'MiniMax 拒绝了请求。';
  return new Error(`MiniMax 请求失败（HTTP ${response.status}）：${detail}`);
}

function decodeBoundedBase64(encoded: string, maximumBytes: number): Buffer {
  if (!encoded || encoded.length > Math.ceil(maximumBytes * 4 / 3) + 4) {
    throw new Error('Encoded media exceeds the byte limit');
  }
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) {
    throw new Error('Media provider returned invalid base64');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.length > maximumBytes) throw new Error('Encoded media exceeds the byte limit');
  return bytes;
}

function decodeBoundedHex(encoded: string, maximumBytes: number): Buffer {
  if (!encoded || encoded.length % 2 !== 0 || !/^[0-9a-f]+$/iu.test(encoded)) {
    throw new Error('MiniMax returned invalid hex audio');
  }
  if (encoded.length / 2 > maximumBytes) throw new Error('Encoded media exceeds the byte limit');
  const bytes = Buffer.from(encoded, 'hex');
  if (bytes.length === 0 || bytes.length > maximumBytes) throw new Error('Encoded media exceeds the byte limit');
  return bytes;
}

function findOutputUrl(value: unknown): string | null {
  const queue: unknown[] = [value];
  let visited = 0;
  while (queue.length && visited < 200) {
    const current = queue.shift();
    visited += 1;
    if (Array.isArray(current)) {
      queue.push(...current.slice(0, 20));
      continue;
    }
    const record = asRecord(current);
    if (!record) continue;
    for (const key of ['url', 'download_url', 'output_url', 'model_url', 'glb_url']) {
      if (typeof record[key] === 'string') return record[key];
    }
    for (const [key, nested] of Object.entries(record)) {
      if (key === 'b64_json') continue;
      if (nested && typeof nested === 'object') queue.push(nested);
    }
  }
  return null;
}

function validateGeneratedBytes(
  bytes: Buffer,
  expectedKind: MediaProviderKind,
  declaredContentType: string,
): GeneratedBytes {
  if (bytes.length === 0 || bytes.length > BYTE_LIMITS[expectedKind]) {
    throw new Error('Generated media is empty or exceeds the byte limit');
  }
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString('ascii');
  const candidates: Array<GeneratedBytes & { kind: MediaProviderKind }> = [];
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    candidates.push({ bytes, extension: '.png', mimeType: 'image/png', kind: 'image' });
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    candidates.push({ bytes, extension: '.jpg', mimeType: 'image/jpeg', kind: 'image' });
  } else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    candidates.push({ bytes, extension: '.webp', mimeType: 'image/webp', kind: 'image' });
  } else if (isPlayableWav(bytes)) {
    candidates.push({ bytes, extension: '.wav', mimeType: 'audio/wav', kind: 'audio' });
  } else if (hasCompleteMp3Frame(bytes)) {
    candidates.push({ bytes, extension: '.mp3', mimeType: 'audio/mpeg', kind: 'audio' });
  } else if (hasCompleteOggPages(bytes)) {
    candidates.push({ bytes, extension: '.ogg', mimeType: 'audio/ogg', kind: 'audio' });
  } else if (ascii(0, 4) === 'glTF' && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length) {
    candidates.push({ bytes, extension: '.glb', mimeType: 'model/gltf-binary', kind: 'model3d' });
  }
  const detected = candidates[0];
  if (!detected || detected.kind !== expectedKind) {
    throw new Error(`Generated media contents do not match ${expectedKind}`);
  }
  if (declaredContentType && isMediaContentType(declaredContentType) && !contentTypeMatchesKind(declaredContentType, expectedKind)) {
    throw new Error('Generated media content type does not match the requested kind');
  }
  return { bytes, extension: detected.extension, mimeType: detected.mimeType };
}

function isPlayableWav(bytes: Buffer): boolean {
  if (bytes.length < 12
    || bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
    || bytes.subarray(8, 12).toString('ascii') !== 'WAVE') {
    return false;
  }
  const riffEnd = bytes.readUInt32LE(4) + 8;
  if (riffEnd < 12 || riffEnd > bytes.length) return false;
  let offset = 12;
  let blockAlign = 0;
  let dataBytes = 0;
  let validFormat = false;
  while (offset < riffEnd) {
    if (offset + 8 > riffEnd) return false;
    const chunkId = bytes.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;
    if (!Number.isSafeInteger(dataEnd) || dataEnd > riffEnd) return false;
    if (chunkId === 'fmt ') {
      if (chunkSize < 16) return false;
      const audioFormat = bytes.readUInt16LE(dataStart);
      const channels = bytes.readUInt16LE(dataStart + 2);
      const sampleRate = bytes.readUInt32LE(dataStart + 4);
      const byteRate = bytes.readUInt32LE(dataStart + 8);
      const candidateBlockAlign = bytes.readUInt16LE(dataStart + 12);
      const bitsPerSample = bytes.readUInt16LE(dataStart + 14);
      if (audioFormat === 0
        || channels === 0
        || sampleRate === 0
        || byteRate === 0
        || candidateBlockAlign === 0
        || bitsPerSample === 0) {
        return false;
      }
      blockAlign = candidateBlockAlign;
      validFormat = true;
    } else if (chunkId === 'data') {
      dataBytes = Math.max(dataBytes, chunkSize);
    }
    offset = dataEnd + (chunkSize & 1);
    if (offset > riffEnd) return false;
  }
  return offset === riffEnd && validFormat && blockAlign > 0 && dataBytes >= blockAlign;
}

function hasCompleteMp3Frame(bytes: Buffer): boolean {
  let start = 0;
  if (bytes.subarray(0, 3).toString('ascii') === 'ID3') {
    if (bytes.length < 10) return false;
    const majorVersion = bytes[3]!;
    const sizeBytes = bytes.subarray(6, 10);
    if (majorVersion < 2 || majorVersion > 4 || [...sizeBytes].some((value) => value > 0x7f)) return false;
    const tagSize = ((sizeBytes[0]! << 21)
      | (sizeBytes[1]! << 14)
      | (sizeBytes[2]! << 7)
      | sizeBytes[3]!) >>> 0;
    const footerSize = majorVersion === 4 && (bytes[5]! & 0x10) !== 0 ? 10 : 0;
    start = 10 + tagSize + footerSize;
    if (start > bytes.length) return false;
  }
  const scanEnd = Math.min(bytes.length - 4, start + 4_096);
  for (let offset = start; offset <= scanEnd; offset += 1) {
    const frameLength = mpegLayer3FrameLength(bytes, offset);
    if (frameLength !== null && offset + frameLength <= bytes.length) return true;
  }
  return false;
}

function mpegLayer3FrameLength(bytes: Buffer, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  const header = bytes.readUInt32BE(offset);
  if (((header & 0xffe0_0000) >>> 0) !== 0xffe0_0000) return null;
  const versionBits = (header >>> 19) & 0b11;
  const layerBits = (header >>> 17) & 0b11;
  const bitrateIndex = (header >>> 12) & 0b1111;
  const sampleRateIndex = (header >>> 10) & 0b11;
  if (versionBits === 0b01
    || layerBits !== 0b01
    || bitrateIndex === 0
    || bitrateIndex === 0b1111
    || sampleRateIndex === 0b11) {
    return null;
  }
  const mpeg1 = versionBits === 0b11;
  const bitrateKbps = (mpeg1
    ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrateIndex];
  if (!bitrateKbps) return null;
  const baseSampleRate = [44_100, 48_000, 32_000][sampleRateIndex]!;
  const sampleRate = versionBits === 0b10
    ? baseSampleRate / 2
    : versionBits === 0b00
      ? baseSampleRate / 4
      : baseSampleRate;
  const padding = (header >>> 9) & 1;
  const coefficient = mpeg1 ? 144 : 72;
  const frameLength = Math.floor(coefficient * bitrateKbps * 1_000 / sampleRate) + padding;
  return frameLength > 4 ? frameLength : null;
}

function hasCompleteOggPages(bytes: Buffer): boolean {
  let offset = 0;
  let pageCount = 0;
  let payloadBytes = 0;
  while (offset < bytes.length) {
    if (offset + 27 > bytes.length
      || bytes.subarray(offset, offset + 4).toString('ascii') !== 'OggS'
      || bytes[offset + 4] !== 0) {
      return false;
    }
    const segmentCount = bytes[offset + 26]!;
    const segmentTableStart = offset + 27;
    const payloadStart = segmentTableStart + segmentCount;
    if (payloadStart > bytes.length) return false;
    let pagePayloadBytes = 0;
    for (let index = 0; index < segmentCount; index += 1) {
      pagePayloadBytes += bytes[segmentTableStart + index]!;
    }
    const pageEnd = payloadStart + pagePayloadBytes;
    if (!Number.isSafeInteger(pageEnd) || pageEnd > bytes.length) return false;
    pageCount += 1;
    payloadBytes += pagePayloadBytes;
    offset = pageEnd;
  }
  return pageCount > 0 && payloadBytes > 0;
}

function contentTypeMatchesKind(contentType: string, kind: MediaProviderKind): boolean {
  if (kind === 'image') return contentType.startsWith('image/');
  if (kind === 'audio') return contentType.startsWith('audio/');
  return contentType === 'model/gltf-binary' || contentType === 'application/octet-stream';
}

function isMediaContentType(value: string): boolean {
  return value.startsWith('image/') || value.startsWith('audio/') || value === 'model/gltf-binary' || value === 'application/octet-stream';
}

function normalizeContentType(value: string | null): string {
  return (value ?? '').split(';', 1)[0]!.trim().toLowerCase();
}

function validateOptions(
  value: Readonly<Record<string, string | number | boolean>> | undefined,
): Readonly<Record<string, string | number | boolean>> {
  if (!value) return {};
  if (Object.keys(value).length > 24) throw new Error('Media generation options contain too many fields');
  const result: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(key)) throw new Error('Media generation option name is invalid');
    if (typeof item === 'string') {
      result[key] = key === 'lyrics'
        ? requiredMultilineText(item, key, 4_000)
        : requiredText(item, key, 500);
    }
    else if (typeof item === 'number' && Number.isFinite(item)) result[key] = item;
    else if (typeof item === 'boolean') result[key] = item;
    else throw new Error('Media generation option value is invalid');
  }
  return result;
}

function miniMaxPurpose(options: Readonly<Record<string, string | number | boolean>>): MiniMaxPurpose {
  const purpose = options.purpose;
  if (purpose === 'music' || purpose === 'speech' || purpose === 'vocal-sfx' || purpose === 'sfx' || purpose === 'ambience') {
    return purpose;
  }
  throw new Error('MiniMax audio requires purpose: music, speech, vocal-sfx, sfx, or ambience');
}

function miniMaxFormat(options: Readonly<Record<string, string | number | boolean>>): 'mp3' | 'wav' {
  const format = options.format ?? 'mp3';
  if (format !== 'mp3' && format !== 'wav') throw new Error('MiniMax audio format must be mp3 or wav');
  return format;
}

function numericOption(value: string | number | boolean | undefined, minimum: number, maximum: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error('MiniMax audio setting is invalid');
  }
  return value;
}

function requiredText(value: string, field: string, maximum: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be text`);
  const clean = value.trim();
  if (!clean || clean.length > maximum || /[\u0000-\u001f\u007f]/u.test(clean)) throw new Error(`${field} is invalid`);
  return clean;
}

function requiredMultilineText(value: string, field: string, maximum: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be text`);
  const clean = value.trim();
  if (!clean || clean.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(clean)) {
    throw new Error(`${field} is invalid`);
  }
  return clean;
}

function safeStem(value: string): string {
  const stem = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 70);
  return stem || 'generated';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
