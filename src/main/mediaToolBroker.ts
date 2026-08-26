import type { AssetStore } from './assetStore.js';
import type { CodexAppServer, DynamicToolSpec, JsonValue } from './codexAppServer.js';
import type { JsonRpcServerRequest } from './jsonRpcPeer.js';
import {
  MediaGenerationPublicError,
  type MediaGenerationResult,
  type MediaGenerationService,
} from './mediaGenerationService.js';
import {
  PROCEDURAL_AUDIO_PRESETS,
  synthesizeProceduralWav,
  type ProceduralAudioPreset,
} from './proceduralAudio.js';
import type { GameAssetKind, GameAssetRecord } from '../shared/contracts.js';

interface DynamicToolCallParams {
  threadId: string;
  turnId: string;
  callId: string;
  namespace: string | null;
  tool: string;
  arguments: JsonValue;
}

interface DynamicToolCallResponse {
  contentItems: Array<{ type: 'inputText'; text: string }>;
  success: boolean;
}

export interface MediaToolProject {
  id: string;
  root: string;
}

export interface MediaToolBrokerOptions {
  server: Pick<CodexAppServer, 'respondToServerRequest'>;
  assetStore: AssetStore;
  generationService?: Pick<MediaGenerationService, 'generate'>;
  resolveProject(threadId: string): Promise<MediaToolProject | null>;
  onAssetsChanged?(projectId: string, assets: GameAssetRecord[]): void | Promise<void>;
  /** Main-process provenance hook; generated image proof must never come from the workspace manifest. */
  onGeneratedAsset?(
    projectId: string,
    asset: GameAssetRecord,
    provider: { id: string; presetId: string; displayName: string; model: string },
  ): void | Promise<void>;
}

const MAX_RESPONSE_BYTES = 32 * 1024;
const MAX_LIST_LIMIT = 100;
const KINDS = ['image', 'audio', 'model3d'] as const;
const AUDIO_PURPOSES = ['music', 'speech', 'vocal-sfx', 'sfx', 'ambience'] as const;

export const MEDIA_DYNAMIC_TOOLS: DynamicToolSpec[] = [
  {
    type: 'function',
    name: 'noobi_asset_list',
    description: 'List validated game assets in this Noobi.ai project. Returns workspace-relative paths only.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: [...KINDS] },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST_LIMIT, default: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'noobi_asset_register',
    description: 'Validate and register an existing asset under public/assets in the current project.',
    inputSchema: {
      type: 'object',
      properties: {
        relativePath: { type: 'string', minLength: 1, maxLength: 1000 },
        name: { type: 'string', minLength: 1, maxLength: 160 },
        kind: { type: 'string', enum: [...KINDS] },
      },
      required: ['relativePath'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'noobi_audio_synthesize',
    description: 'Create a short deterministic procedural game sound as mono PCM16 WAV and register it as an asset.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' },
        preset: { type: 'string', enum: [...PROCEDURAL_AUDIO_PRESETS] },
        durationSeconds: { type: 'number', minimum: 0.05, maximum: 8 },
        seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
      },
      required: ['name', 'preset'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'noobi_image_generate',
    description: 'Generate and register an image using the configured image API. If none is configured, returns an explicit Codex ImageGen fallback instruction.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' },
        prompt: { type: 'string', minLength: 1, maxLength: 4000 },
        model: { type: 'string', minLength: 1, maxLength: 200 },
        width: { type: 'integer', minimum: 256, maximum: 4096 },
        height: { type: 'integer', minimum: 256, maximum: 4096 },
        quality: { type: 'string', enum: ['low', 'medium', 'high', 'auto'] },
        background: { type: 'string', enum: ['transparent', 'opaque', 'auto'] },
      },
      required: ['name', 'prompt'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'noobi_audio_generate',
    description: 'Generate and register audio through the configured provider. Always set purpose. MiniMax Music handles music; MiniMax Speech handles speech and vocal-sfx. For nonverbal vocal-sfx, write actual Speech 2.8 interjection tags such as (groans), (gasps), or (hissing), not descriptive prose. MiniMax accepts mp3/wav and does not honor durationSeconds. Generic sfx and ambience are not claimed as MiniMax capabilities and return a procedural-audio fallback for noobi_audio_synthesize or deterministic Web Audio.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' },
        prompt: { type: 'string', minLength: 1, maxLength: 4000 },
        model: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'API model ID such as music-3.0 or speech-2.8-hd. Omit this field to use the model selected in Settings; do not pass a UI display label.',
        },
        purpose: { type: 'string', enum: [...AUDIO_PURPOSES] },
        instrumental: { type: 'boolean' },
        lyrics: { type: 'string', minLength: 1, maxLength: 3500 },
        durationSeconds: { type: 'number', minimum: 0.05, maximum: 600 },
        voice: { type: 'string', minLength: 1, maxLength: 100 },
        format: { type: 'string', enum: ['wav', 'mp3', 'ogg'] },
      },
      required: ['name', 'prompt', 'purpose'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'noobi_model3d_generate',
    description: 'Generate and register a self-contained GLB through the configured 3D model API.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' },
        prompt: { type: 'string', minLength: 1, maxLength: 4000 },
        model: { type: 'string', minLength: 1, maxLength: 200 },
        animation: { type: 'boolean' },
        textureResolution: { type: 'integer', minimum: 256, maximum: 8192 },
      },
      required: ['name', 'prompt'],
      additionalProperties: false,
    },
  },
];

/** Routes App Server dynamic media calls without allowing raw binary protocol output. */
export class MediaToolBroker {
  readonly #options: MediaToolBrokerOptions;

  constructor(options: MediaToolBrokerOptions) {
    this.#options = options;
  }

  handle(request: JsonRpcServerRequest): boolean {
    if (request.method !== 'item/tool/call') return false;
    void this.#handle(request).catch(() => undefined);
    return true;
  }

  async #handle(request: JsonRpcServerRequest): Promise<void> {
    let project: MediaToolProject | null = null;
    try {
      const params = readCallParams(request.params);
      project = await this.#options.resolveProject(params.threadId);
      if (!project) throw new ToolInputError('This tool call is not attached to an active Noobi.ai project');

      let payload: unknown;
      switch (params.tool) {
        case 'noobi_asset_list':
          payload = await this.#list(project, params.arguments);
          break;
        case 'noobi_asset_register':
          payload = await this.#register(project, params.arguments);
          break;
        case 'noobi_audio_synthesize':
          payload = await this.#synthesize(project, params.arguments);
          break;
        case 'noobi_image_generate':
          payload = await this.#generate(project, 'image', params.arguments);
          break;
        case 'noobi_audio_generate':
          payload = await this.#generate(project, 'audio', params.arguments);
          break;
        case 'noobi_model3d_generate':
          payload = await this.#generate(project, 'model3d', params.arguments);
          break;
        default:
          throw new ToolInputError('Unknown Noobi.ai media tool');
      }
      this.#respond(request.id, payload, true);
    } catch (error) {
      this.#respond(request.id, { error: safeError(error, project?.root) }, false);
    }
  }

  async #list(project: MediaToolProject, rawArguments: JsonValue): Promise<unknown> {
    const args = objectArguments(rawArguments);
    assertOnlyKeys(args, ['kind', 'limit']);
    const kind = optionalKind(args.kind);
    const limit = optionalInteger(args.limit, 'limit', 1, MAX_LIST_LIMIT) ?? 50;
    const allAssets = await this.#options.assetStore.list(project.id, project.root);
    const matching = kind ? allAssets.filter((asset) => asset.kind === kind) : allAssets;
    const assets: Array<Record<string, unknown>> = [];
    for (const asset of matching.slice(0, limit)) {
      const next = [...assets, publicAsset(asset)];
      const candidate = {
        total: matching.length,
        shown: next.length,
        truncated: matching.length > next.length,
        assets: next,
      };
      if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') > MAX_RESPONSE_BYTES) break;
      assets.push(next[next.length - 1]!);
    }
    return {
      total: matching.length,
      shown: assets.length,
      truncated: matching.length > assets.length,
      assets,
    };
  }

  async #register(project: MediaToolProject, rawArguments: JsonValue): Promise<unknown> {
    const args = objectArguments(rawArguments);
    assertOnlyKeys(args, ['relativePath', 'name', 'kind']);
    const relativePath = requiredString(args.relativePath, 'relativePath', 1_000);
    if (!relativePath.startsWith('public/assets/')) {
      throw new ToolInputError('Registered assets must be inside public/assets');
    }
    const name = optionalString(args.name, 'name', 160);
    const expectedKind = optionalKind(args.kind);
    const inferredKind = kindForAssetPath(relativePath);
    if (expectedKind && inferredKind && expectedKind !== inferredKind) {
      throw new ToolInputError(`Asset kind is ${inferredKind}, not ${expectedKind}`);
    }
    const asset = await this.#options.assetStore.registerExisting({
      projectId: project.id,
      root: project.root,
      relativePath,
      ...(name ? { name } : {}),
      source: 'procedural',
      provider: 'workspace-agent',
    });
    if (expectedKind && asset.kind !== expectedKind) {
      throw new ToolInputError(`Asset kind is ${asset.kind}, not ${expectedKind}`);
    }
    await this.#notify(project);
    return { asset: publicAsset(asset) };
  }

  async #synthesize(project: MediaToolProject, rawArguments: JsonValue): Promise<unknown> {
    const args = objectArguments(rawArguments);
    assertOnlyKeys(args, ['name', 'preset', 'durationSeconds', 'seed']);
    const name = requiredString(args.name, 'name', 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(name)) {
      throw new ToolInputError('Audio name must use 1-64 letters, numbers, underscores, or hyphens');
    }
    const preset = requiredPreset(args.preset);
    const durationSeconds = optionalNumber(args.durationSeconds, 'durationSeconds', 0.05, 8);
    const seed = optionalInteger(args.seed, 'seed', 0, 0xffff_ffff);
    const generated = await synthesizeProceduralWav({
      root: project.root,
      name,
      preset,
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
      ...(seed === undefined ? {} : { seed }),
    });
    const asset = await this.#options.assetStore.registerExisting({
      projectId: project.id,
      root: project.root,
      relativePath: generated.relativePath,
      name,
      source: 'procedural',
      provider: 'noobi-procedural-audio',
      metadata: {
        preset: generated.preset,
        durationSeconds: generated.durationSeconds,
        sampleRate: generated.sampleRate,
        seed: generated.seed,
        channels: 1,
        bitDepth: 16,
      },
    });
    await this.#notify(project);
    return { asset: publicAsset(asset) };
  }

  async #generate(
    project: MediaToolProject,
    kind: GameAssetKind,
    rawArguments: JsonValue,
  ): Promise<unknown> {
    if (!this.#options.generationService) throw new ToolInputError('Media API generation is not configured');
    const args = objectArguments(rawArguments);
    const allowed = kind === 'image'
      ? ['name', 'prompt', 'model', 'width', 'height', 'quality', 'background']
      : kind === 'audio'
        ? ['name', 'prompt', 'model', 'purpose', 'instrumental', 'lyrics', 'durationSeconds', 'voice', 'format']
        : ['name', 'prompt', 'model', 'animation', 'textureResolution'];
    assertOnlyKeys(args, allowed);
    const name = requiredGenerationName(args.name);
    const prompt = requiredString(args.prompt, 'prompt', 4_000);
    const model = optionalString(args.model, 'model', 200);
    const options: Record<string, string | number | boolean> = {};
    if (kind === 'image') {
      const width = optionalInteger(args.width, 'width', 256, 4_096);
      const height = optionalInteger(args.height, 'height', 256, 4_096);
      const quality = optionalEnum(args.quality, 'quality', ['low', 'medium', 'high', 'auto']);
      const background = optionalEnum(args.background, 'background', ['transparent', 'opaque', 'auto']);
      if ((width === undefined) !== (height === undefined)) {
        throw new ToolInputError('width and height must be provided together');
      }
      if (width !== undefined) options.width = width;
      if (height !== undefined) options.height = height;
      if (quality) options.quality = quality;
      if (background) options.background = background;
    } else if (kind === 'audio') {
      const purpose = optionalEnum(args.purpose, 'purpose', AUDIO_PURPOSES);
      if (!purpose) throw new ToolInputError('purpose is required for audio generation');
      const instrumental = optionalBoolean(args.instrumental, 'instrumental');
      const lyrics = optionalMultilineString(args.lyrics, 'lyrics', 3_500);
      const durationSeconds = optionalNumber(args.durationSeconds, 'durationSeconds', 0.05, 600);
      const voice = optionalString(args.voice, 'voice', 100);
      const format = optionalEnum(args.format, 'format', ['wav', 'mp3', 'ogg']);
      options.purpose = purpose;
      if (instrumental !== undefined) options.instrumental = instrumental;
      if (lyrics) options.lyrics = lyrics;
      if (durationSeconds !== undefined) options.durationSeconds = durationSeconds;
      if (voice) options.voice = voice;
      if (format) options.format = format;
    } else {
      const animation = optionalBoolean(args.animation, 'animation');
      const textureResolution = optionalInteger(args.textureResolution, 'textureResolution', 256, 8_192);
      if (animation !== undefined) options.animation = animation;
      if (textureResolution !== undefined) options.textureResolution = textureResolution;
    }
    const result = await this.#options.generationService.generate({
      project,
      kind,
      name,
      prompt,
      ...(model ? { model } : {}),
      ...(Object.keys(options).length ? { options } : {}),
    });
    if (result.outcome === 'asset') {
      if (this.#options.onGeneratedAsset) {
        await this.#options.onGeneratedAsset(project.id, result.asset, result.provider);
      }
      await this.#notify(project);
    }
    return publicGenerationResult(result);
  }

  async #notify(project: MediaToolProject): Promise<void> {
    if (!this.#options.onAssetsChanged) return;
    try {
      const assets = await this.#options.assetStore.list(project.id, project.root);
      await this.#options.onAssetsChanged(project.id, assets);
    } catch {
      // UI refresh is best-effort and must not turn a completed tool action into a failure.
    }
  }

  #respond(requestId: string | number, payload: unknown, success: boolean): void {
    const response: DynamicToolCallResponse = {
      contentItems: [{ type: 'inputText', text: boundedJson(payload) }],
      success,
    };
    this.#options.server.respondToServerRequest(requestId, response);
  }
}

function kindForAssetPath(relativePath: string): GameAssetKind | null {
  const extension = /(?:^|\/)(?:[^/]+)(\.[^./]+)$/u.exec(relativePath)?.[1]?.toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension ?? '')) return 'image';
  if (['.wav', '.mp3', '.ogg'].includes(extension ?? '')) return 'audio';
  if (extension === '.glb') return 'model3d';
  return null;
}

function readCallParams(value: unknown): DynamicToolCallParams {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.threadId !== 'string' ||
    typeof record.turnId !== 'string' ||
    typeof record.callId !== 'string' ||
    (record.namespace !== undefined && record.namespace !== null && typeof record.namespace !== 'string') ||
    typeof record.tool !== 'string' ||
    !isJsonValue(record.arguments)
  ) {
    throw new ToolInputError('Invalid dynamic tool request');
  }
  return {
    threadId: record.threadId,
    turnId: record.turnId,
    callId: record.callId,
    namespace: typeof record.namespace === 'string' ? record.namespace : null,
    tool: record.tool,
    arguments: record.arguments as JsonValue,
  };
}

function objectArguments(value: JsonValue): Record<string, JsonValue> {
  const record = asRecord(value);
  if (!record) throw new ToolInputError('Tool arguments must be a JSON object');
  return record as Record<string, JsonValue>;
}

function assertOnlyKeys(record: Record<string, JsonValue>, allowed: readonly string[]): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw new ToolInputError('Tool arguments contain unsupported fields');
  }
}

function requiredString(value: JsonValue | undefined, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new ToolInputError(`${field} must be a non-empty string no longer than ${maxLength} characters`);
  }
  return value;
}

function optionalString(value: JsonValue | undefined, field: string, maxLength: number): string | undefined {
  return value === undefined ? undefined : requiredString(value, field, maxLength);
}

function optionalMultilineString(
  value: JsonValue | undefined,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    throw new ToolInputError(`${field} must be non-empty text no longer than ${maxLength} characters`);
  }
  return value;
}

function optionalNumber(
  value: JsonValue | undefined,
  field: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ToolInputError(`${field} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function optionalInteger(
  value: JsonValue | undefined,
  field: string,
  minimum: number,
  maximum: number,
): number | undefined {
  const number = optionalNumber(value, field, minimum, maximum);
  if (number !== undefined && !Number.isSafeInteger(number)) {
    throw new ToolInputError(`${field} must be an integer`);
  }
  return number;
}

function optionalBoolean(value: JsonValue | undefined, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new ToolInputError(`${field} must be true or false`);
  return value;
}

function optionalEnum<T extends string>(
  value: JsonValue | undefined,
  field: string,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ToolInputError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function optionalKind(value: JsonValue | undefined): GameAssetKind | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !KINDS.includes(value as GameAssetKind)) {
    throw new ToolInputError('kind must be image, audio, or model3d');
  }
  return value as GameAssetKind;
}

function requiredPreset(value: JsonValue | undefined): ProceduralAudioPreset {
  if (typeof value !== 'string' || !PROCEDURAL_AUDIO_PRESETS.includes(value as ProceduralAudioPreset)) {
    throw new ToolInputError(`preset must be one of: ${PROCEDURAL_AUDIO_PRESETS.join(', ')}`);
  }
  return value as ProceduralAudioPreset;
}

function requiredGenerationName(value: JsonValue | undefined): string {
  const name = requiredString(value, 'name', 64);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(name)) {
    throw new ToolInputError('Asset name must use 1-64 letters, numbers, underscores, or hyphens');
  }
  return name;
}

function publicAsset(asset: GameAssetRecord): Record<string, unknown> {
  return {
    name: asset.name,
    kind: asset.kind,
    source: asset.source,
    relativePath: asset.relativePath,
    mimeType: asset.mimeType,
    size: asset.size,
  };
}

function publicGenerationResult(result: MediaGenerationResult): Record<string, unknown> {
  if (result.outcome === 'asset') {
    return {
      asset: publicAsset(result.asset),
      provider: result.provider,
    };
  }
  return {
    fallback: {
      type: result.fallback,
      reason: result.reason,
      prompt: result.prompt,
      ...(result.fallback === 'codex-imagegen'
        ? { instruction: 'Invoke the Codex $imagegen skill now, then register the generated image with Noobi.ai.' }
        : result.fallback === 'procedural-audio'
          ? { instruction: 'Use noobi_audio_synthesize for a short deterministic effect, deterministic Web Audio for a custom/ambient fallback, or import a licensed WAV/MP3/OGG. Do not claim MiniMax generated generic SFX or ambience.' }
          : { instruction: 'Configure a 3D generation provider or create and register a validated GLB in the workspace.' }),
    },
  };
}

function boundedJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') <= MAX_RESPONSE_BYTES) return serialized;
  return JSON.stringify({ error: 'Media tool response exceeded the 32 KiB limit' });
}

function safeError(error: unknown, projectRoot?: string): string {
  if (!(error instanceof ToolInputError) && !(error instanceof MediaGenerationPublicError)) {
    return 'Media tool failed safely';
  }
  let message = error.message.replace(/[\u0000-\u001f\u007f]/gu, ' ').slice(0, 500);
  if (projectRoot) message = message.split(projectRoot).join('[workspace]');
  message = message.replace(/\b(?:sk-api-|sk-)[A-Za-z0-9_-]{12,}\b/gu, '[redacted]');
  return message;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  const record = asRecord(value);
  return Boolean(record) && Object.values(record!).every(isJsonValue);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

class ToolInputError extends Error {}
