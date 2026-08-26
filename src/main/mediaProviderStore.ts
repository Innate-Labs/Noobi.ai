import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, chmod, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

import type { GameAssetKind } from '../shared/contracts.js';

export type MediaProviderKind = GameAssetKind;
export type MediaProviderAdapter =
  | 'openai-image'
  | 'openai-speech'
  | 'elevenlabs-sound'
  | 'minimax-audio'
  | 'generic-json';
export type MediaProviderAuth = 'bearer' | 'x-api-key' | 'none';

export interface MediaProviderPreset {
  id: string;
  kind: MediaProviderKind;
  vendor: string;
  label: string;
  adapter: MediaProviderAdapter;
  auth: MediaProviderAuth;
  defaultEndpoint: string | null;
  defaultModel: string;
  models: readonly string[];
  /** Providers marked customGateway expect a synchronous REST wrapper returning bytes or a download URL. */
  customGateway?: boolean;
}

export const MEDIA_PROVIDER_PRESETS: readonly MediaProviderPreset[] = [
  {
    id: 'openai-image',
    kind: 'image',
    vendor: 'OpenAI',
    label: 'OpenAI Images',
    adapter: 'openai-image',
    auth: 'bearer',
    defaultEndpoint: 'https://api.openai.com/v1/images/generations',
    defaultModel: 'gpt-image-2',
    models: ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1-mini'],
  },
  {
    id: 'stability-image',
    kind: 'image',
    vendor: 'Stability AI',
    label: 'Stability AI Image',
    adapter: 'generic-json',
    auth: 'bearer',
    defaultEndpoint: null,
    defaultModel: 'stable-image-ultra',
    models: ['stable-image-ultra', 'stable-image-core', 'sd3.5-large'],
    customGateway: true,
  },
  {
    id: 'google-imagen',
    kind: 'image',
    vendor: 'Google',
    label: 'Google Imagen',
    adapter: 'generic-json',
    auth: 'bearer',
    defaultEndpoint: null,
    defaultModel: 'imagen-4.0-generate-001',
    models: ['imagen-4.0-generate-001', 'imagen-4.0-fast-generate-001'],
    customGateway: true,
  },
  {
    id: 'fal-flux',
    kind: 'image',
    vendor: 'Black Forest Labs / fal',
    label: 'FLUX Image',
    adapter: 'generic-json',
    auth: 'bearer',
    defaultEndpoint: null,
    defaultModel: 'flux-1.1-pro',
    models: ['flux-1.1-pro', 'flux-kontext-pro', 'flux-dev'],
    customGateway: true,
  },
  {
    id: 'custom-image',
    kind: 'image',
    vendor: 'Custom',
    label: 'Custom Image REST',
    adapter: 'generic-json',
    auth: 'bearer',
    defaultEndpoint: null,
    defaultModel: 'default',
    models: [],
    customGateway: true,
  },
  {
    id: 'openai-audio',
    kind: 'audio',
    vendor: 'OpenAI',
    label: 'OpenAI Speech',
    adapter: 'openai-speech',
    auth: 'bearer',
    defaultEndpoint: 'https://api.openai.com/v1/audio/speech',
    defaultModel: 'gpt-4o-mini-tts',
    models: ['gpt-4o-mini-tts', 'tts-1-hd', 'tts-1'],
  },
  {
    id: 'elevenlabs-sound',
    kind: 'audio',
    vendor: 'ElevenLabs',
    label: 'ElevenLabs Sound Effects',
    adapter: 'elevenlabs-sound',
    auth: 'x-api-key',
    defaultEndpoint: 'https://api.elevenlabs.io/v1/sound-generation',
    defaultModel: 'eleven_text_to_sound_v2',
    models: ['eleven_text_to_sound_v2'],
  },
  {
    id: 'minimax-audio',
    kind: 'audio',
    vendor: 'MiniMax',
    label: 'MiniMax Music & Vocal Audio (Global)',
    adapter: 'minimax-audio',
    auth: 'bearer',
    defaultEndpoint: 'https://api.minimax.io',
    defaultModel: 'music-3.0',
    models: ['music-3.0', 'speech-2.8-hd', 'speech-2.8-turbo'],
  },
  {
    id: 'minimax-audio-cn',
    kind: 'audio',
    vendor: 'MiniMax',
    label: 'MiniMax Music & Vocal Audio (China)',
    adapter: 'minimax-audio',
    auth: 'bearer',
    defaultEndpoint: 'https://api.minimaxi.com',
    defaultModel: 'music-3.0',
    models: ['music-3.0', 'speech-2.8-hd', 'speech-2.8-turbo'],
  },
  {
    id: 'stability-audio',
    kind: 'audio',
    vendor: 'Stability AI',
    label: 'Stable Audio',
    adapter: 'generic-json',
    auth: 'bearer',
    defaultEndpoint: null,
    defaultModel: 'stable-audio-2.5',
    models: ['stable-audio-2.5', 'stable-audio-open'],
    customGateway: true,
  },
  {
    id: 'custom-audio',
    kind: 'audio',
    vendor: 'Custom',
    label: 'Custom Audio REST',
    adapter: 'generic-json',
    auth: 'bearer',
    defaultEndpoint: null,
    defaultModel: 'default',
    models: [],
    customGateway: true,
  },
  {
    id: 'meshy-3d',
    kind: 'model3d',
    vendor: 'Meshy',
    label: 'Meshy Text to 3D',
    adapter: 'generic-json',
    auth: 'bearer',
    defaultEndpoint: null,
    defaultModel: 'meshy-6',
    models: ['meshy-6', 'meshy-5'],
    customGateway: true,
  },
  {
    id: 'tripo-3d',
    kind: 'model3d',
    vendor: 'Tripo AI',
    label: 'Tripo Text to 3D',
    adapter: 'generic-json',
    auth: 'bearer',
    defaultEndpoint: null,
    defaultModel: 'tripo-v2.5',
    models: ['tripo-v2.5', 'tripo-v2.0'],
    customGateway: true,
  },
  {
    id: 'rodin-3d',
    kind: 'model3d',
    vendor: 'Hyper3D',
    label: 'Rodin Text to 3D',
    adapter: 'generic-json',
    auth: 'bearer',
    defaultEndpoint: null,
    defaultModel: 'rodin-gen-2',
    models: ['rodin-gen-2', 'rodin'],
    customGateway: true,
  },
  {
    id: 'custom-model3d',
    kind: 'model3d',
    vendor: 'Custom',
    label: 'Custom 3D REST',
    adapter: 'generic-json',
    auth: 'bearer',
    defaultEndpoint: null,
    defaultModel: 'default',
    models: [],
    customGateway: true,
  },
] as const;

export interface MediaProviderInput {
  id?: string;
  presetId: string;
  displayName?: string;
  endpoint?: string | null;
  model?: string | null;
  auth?: MediaProviderAuth;
  apiKey?: string | null;
  enabled?: boolean;
  setActive?: boolean;
}

export interface MediaProviderSummary {
  id: string;
  presetId: string;
  kind: MediaProviderKind;
  displayName: string;
  endpoint: string;
  model: string;
  auth: MediaProviderAuth;
  enabled: boolean;
  active: boolean;
  hasApiKey: boolean;
  updatedAt: string;
}

/** Secret-bearing provider configuration. Keep inside the main process and never serialize it to IPC or JSON-RPC. */
export interface ResolvedMediaProvider {
  id: string;
  preset: MediaProviderPreset;
  displayName: string;
  endpoint: string;
  model: string;
  auth: MediaProviderAuth;
  apiKey: string | null;
}

/**
 * Host-provided, OS-backed secret sealing. Implementations must never return
 * plaintext from `seal`; the store deliberately has no insecure fallback.
 */
export interface MediaProviderSecretCodec {
  isAvailable(): boolean;
  seal(plaintext: string): string;
  open(sealed: string): string;
}

interface StoredProvider {
  id: string;
  presetId: string;
  displayName: string;
  endpoint: string | null;
  model: string | null;
  auth: MediaProviderAuth | null;
  sealedApiKey: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MediaProviderDocument {
  version: 2;
  active: Partial<Record<MediaProviderKind, string>>;
  providers: StoredProvider[];
}

interface ApiKeyBinding {
  presetId: string;
  endpointOrigin: string;
  auth: MediaProviderAuth;
}

interface BoundApiKeyPayload extends ApiKeyBinding {
  version: 1;
  apiKey: string;
}

const DOCUMENT_VERSION = 2 as const;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_PROVIDERS = 64;
const MAX_API_KEY_LENGTH = 16_384;
const MAX_SEALED_API_KEY_LENGTH = 128 * 1024;
const MAX_TEXT_LENGTH = 500;
// Newlines are forbidden in API keys, so a legacy raw key cannot be confused with a bound payload.
const BOUND_API_KEY_PREFIX = 'noobi-media-provider-secret\nv1\n';

/**
 * App-private provider persistence. Public methods expose only redacted summaries;
 * the only secret access path is a callback that does not let the store leak a key accidentally.
 */
export class MediaProviderStore {
  readonly #storageFile: string;
  readonly #secretCodec: MediaProviderSecretCodec;
  #document: MediaProviderDocument = emptyDocument();
  #tail: Promise<void> = Promise.resolve();
  #initialized = false;

  constructor(storageFile: string, secretCodec: MediaProviderSecretCodec) {
    if (!isAbsolute(storageFile)) throw new Error('Media provider storage path must be absolute');
    if (!secretCodec
      || typeof secretCodec.isAvailable !== 'function'
      || typeof secretCodec.seal !== 'function'
      || typeof secretCodec.open !== 'function') {
      throw new Error('Media provider secret codec is required');
    }
    this.#storageFile = storageFile;
    this.#secretCodec = secretCodec;
  }

  async init(): Promise<void> {
    await this.#exclusive(async () => {
      await mkdir(dirname(this.#storageFile), { recursive: true, mode: 0o700 });
      await chmod(dirname(this.#storageFile), 0o700).catch(() => undefined);
      try {
        const info = await lstat(this.#storageFile);
        if (info.isSymbolicLink() || !info.isFile()) throw new Error('Media provider storage must be a regular file');
        if (info.size > MAX_FILE_BYTES) throw new Error('Media provider storage exceeds 1 MiB');
        const parsed = parseDocument(await readFile(this.#storageFile, 'utf8'), this.#secretCodec);
        this.#document = parsed.document;
        await chmod(this.#storageFile, 0o600).catch(() => undefined);
        if (parsed.migrated) await this.#write();
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) throw error;
        this.#document = emptyDocument();
        await this.#write();
      }
      this.#initialized = true;
    });
  }

  list(kind?: MediaProviderKind): MediaProviderSummary[] {
    this.#assertInitialized();
    return this.#document.providers
      .filter((provider) => !kind || presetFor(provider.presetId).kind === kind)
      .map((provider) => this.#summary(provider));
  }

  get(id: string): MediaProviderSummary | null {
    this.#assertInitialized();
    const provider = this.#document.providers.find((candidate) => candidate.id === id);
    return provider ? this.#summary(provider) : null;
  }

  async upsert(input: MediaProviderInput): Promise<MediaProviderSummary> {
    return this.#exclusive(async () => {
      this.#assertInitialized();
      const preset = presetFor(input.presetId);
      const id = input.id ?? randomUUID();
      const existing = this.#document.providers.find((provider) => provider.id === id);
      if (existing && presetFor(existing.presetId).kind !== preset.kind) {
        throw new Error('A provider cannot change media kind');
      }
      if (this.#document.providers.length >= MAX_PROVIDERS && !existing) {
        throw new Error(`No more than ${MAX_PROVIDERS} media providers can be configured`);
      }

      const now = new Date().toISOString();
      const endpointInput = input.endpoint === undefined ? existing?.endpoint : input.endpoint;
      const endpoint = endpointInput === null || endpointInput === undefined || endpointInput === ''
        ? preset.defaultEndpoint
        : normalizeProviderEndpoint(endpointInput);
      if (!endpoint) throw new Error(`${preset.label} requires a custom REST endpoint`);
      assertPresetEndpointOrigin(preset, endpoint);
      const model = cleanRequiredText(input.model ?? existing?.model ?? preset.defaultModel, 'model', 200);
      const displayName = cleanRequiredText(
        input.displayName ?? existing?.displayName ?? preset.label,
        'displayName',
        160,
      );
      const auth = input.auth ?? existing?.auth ?? preset.auth;
      if (!['bearer', 'x-api-key', 'none'].includes(auth)) throw new Error('Unsupported provider authentication type');
      const presetChanged = Boolean(existing && existing.presetId !== preset.id);
      const existingPreset = existing ? presetFor(existing.presetId) : null;
      const existingEndpoint = existing
        ? existing.endpoint ?? existingPreset?.defaultEndpoint ?? null
        : null;
      const existingAuth = existing
        ? existing.auth ?? existingPreset?.auth ?? null
        : null;
      const secretBoundaryChanged = presetChanged
        || Boolean(existingEndpoint && new URL(existingEndpoint).origin !== new URL(endpoint).origin)
        || Boolean(existingAuth && existingAuth !== auth);
      const binding = apiKeyBinding(preset.id, endpoint, auth);
      const submittedApiKey = input.apiKey === undefined || input.apiKey === null || input.apiKey === ''
        ? input.apiKey
        : validateProviderApiKey(preset, input.apiKey);
      const sealedApiKey = updateSealedApiKey(
        submittedApiKey,
        secretBoundaryChanged ? null : existing?.sealedApiKey ?? null,
        this.#secretCodec,
        binding,
      );
      const provider: StoredProvider = {
        id,
        presetId: preset.id,
        displayName,
        endpoint,
        model,
        auth,
        sealedApiKey,
        enabled: input.enabled ?? existing?.enabled ?? true,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      if (existing) Object.assign(existing, provider);
      else this.#document.providers.push(provider);
      if (input.setActive || !this.#document.active[preset.kind]) this.#document.active[preset.kind] = id;
      await this.#write();
      return this.#summary(provider);
    });
  }

  async setActive(kind: MediaProviderKind, id: string | null): Promise<void> {
    await this.#exclusive(async () => {
      this.#assertInitialized();
      if (id === null) delete this.#document.active[kind];
      else {
        const provider = this.#document.providers.find((candidate) => candidate.id === id);
        if (!provider || presetFor(provider.presetId).kind !== kind) throw new Error('Provider does not match media kind');
        this.#document.active[kind] = id;
      }
      await this.#write();
    });
  }

  async remove(id: string): Promise<void> {
    await this.#exclusive(async () => {
      this.#assertInitialized();
      const index = this.#document.providers.findIndex((provider) => provider.id === id);
      if (index < 0) return;
      this.#document.providers.splice(index, 1);
      for (const kind of ['image', 'audio', 'model3d'] as const) {
        if (this.#document.active[kind] === id) delete this.#document.active[kind];
      }
      await this.#write();
    });
  }

  async withActiveProvider<T>(
    kind: MediaProviderKind,
    operation: (provider: Readonly<ResolvedMediaProvider>) => Promise<T>,
  ): Promise<T | null> {
    this.#assertInitialized();
    const activeId = this.#document.active[kind];
    const provider = this.#document.providers.find((candidate) => candidate.id === activeId);
    if (!provider || !provider.enabled) return null;
    const preset = presetFor(provider.presetId);
    if (preset.kind !== kind) return null;
    const endpoint = provider.endpoint ?? preset.defaultEndpoint;
    if (!endpoint) return null;
    const auth = provider.auth ?? preset.auth;
    if (auth !== 'none' && !provider.sealedApiKey) return null;
    const openedApiKey = provider.sealedApiKey
      ? openApiKey(
        provider.sealedApiKey,
        this.#secretCodec,
        apiKeyBinding(preset.id, endpoint, auth),
      ).apiKey
      : null;
    const apiKey = openedApiKey === null ? null : validateProviderApiKey(preset, openedApiKey);
    return operation(Object.freeze({
      id: provider.id,
      preset,
      displayName: provider.displayName,
      endpoint,
      model: provider.model ?? preset.defaultModel,
      auth,
      apiKey,
    }));
  }

  #summary(provider: StoredProvider): MediaProviderSummary {
    const preset = presetFor(provider.presetId);
    return {
      id: provider.id,
      presetId: preset.id,
      kind: preset.kind,
      displayName: provider.displayName,
      endpoint: provider.endpoint ?? preset.defaultEndpoint ?? '',
      model: provider.model ?? preset.defaultModel,
      auth: provider.auth ?? preset.auth,
      enabled: provider.enabled,
      active: this.#document.active[preset.kind] === provider.id,
      hasApiKey: Boolean(provider.sealedApiKey),
      updatedAt: provider.updatedAt,
    };
  }

  async #write(): Promise<void> {
    const serialized = `${JSON.stringify(this.#document, null, 2)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_FILE_BYTES) throw new Error('Media provider storage exceeds 1 MiB');
    const temporary = join(dirname(this.#storageFile), `.media-providers-${process.pid}-${randomUUID()}.tmp`);
    await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try {
      await rename(temporary, this.#storageFile);
      await chmod(this.#storageFile, 0o600).catch(() => undefined);
    } catch (error) {
      await import('node:fs/promises').then(({ rm }) => rm(temporary, { force: true })).catch(() => undefined);
      throw error;
    }
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  #assertInitialized(): void {
    if (!this.#initialized) throw new Error('Media provider store is not initialized');
  }
}

export function listMediaProviderPresets(kind?: MediaProviderKind): MediaProviderPreset[] {
  return MEDIA_PROVIDER_PRESETS
    .filter((preset) => !kind || preset.kind === kind)
    .map((preset) => ({ ...preset, models: [...preset.models] }));
}

export function normalizeProviderEndpoint(value: string): string {
  const raw = cleanRequiredText(value, 'endpoint', 2_000);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Provider endpoint must be a valid URL');
  }
  if (url.username || url.password) throw new Error('Provider URLs cannot contain credentials');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('Provider URLs must use HTTPS; HTTP is allowed only for localhost');
  }
  url.hash = '';
  return url.toString();
}

function presetFor(id: string): MediaProviderPreset {
  const preset = MEDIA_PROVIDER_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error('Unknown media provider preset');
  return preset;
}

function assertPresetEndpointOrigin(preset: MediaProviderPreset, endpoint: string): void {
  if (preset.adapter === 'minimax-audio'
    && new URL(endpoint).origin !== new URL(preset.defaultEndpoint!).origin) {
    throw new Error(`The MiniMax preset only accepts its official ${new URL(preset.defaultEndpoint!).host} origin`);
  }
}

function validateApiKey(value: unknown): string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_API_KEY_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('API key is invalid');
  }
  return value;
}

/**
 * MiniMax uses an RFC 6750 bearer token. Keep the credential byte-for-byte while
 * rejecting pasted labels, whitespace, Unicode, and Markdown escape characters.
 */
export function validateMiniMaxApiKey(value: unknown): string {
  const apiKey = validateApiKey(value);
  if (!/^[A-Za-z0-9._~+\/-]+=*$/u.test(apiKey)) {
    throw new Error('MiniMax API Key 格式无效：请只粘贴控制台中的原始 Key，不要包含 Bearer、API：、空格或 Markdown 反斜杠');
  }
  return apiKey;
}

function validateProviderApiKey(preset: MediaProviderPreset, value: unknown): string {
  return preset.adapter === 'minimax-audio' ? validateMiniMaxApiKey(value) : validateApiKey(value);
}

function updateSealedApiKey(
  value: string | null | undefined,
  existing: string | null,
  codec: MediaProviderSecretCodec,
  binding: ApiKeyBinding,
): string | null {
  if (value === undefined) return existing;
  if (value === null || value === '') return null;
  return sealApiKey(validateApiKey(value), codec, binding);
}

function sealApiKey(
  apiKey: string,
  codec: MediaProviderSecretCodec,
  binding: ApiKeyBinding,
): string {
  assertSecretCodecAvailable(codec);
  const payload: BoundApiKeyPayload = {
    version: 1,
    apiKey,
    presetId: binding.presetId,
    endpointOrigin: binding.endpointOrigin,
    auth: binding.auth,
  };
  const plaintext = `${BOUND_API_KEY_PREFIX}${JSON.stringify(payload)}`;
  let sealed: string;
  try {
    sealed = codec.seal(plaintext);
  } catch {
    throw new Error('API key could not be encrypted by the OS credential store');
  }
  if (typeof sealed !== 'string'
    || sealed.length === 0
    || sealed.length > MAX_SEALED_API_KEY_LENGTH
    || sealed === plaintext) {
    throw new Error('OS credential encryption returned an invalid sealed secret');
  }
  return sealed;
}

function openApiKey(
  sealed: string,
  codec: MediaProviderSecretCodec,
  expectedBinding: ApiKeyBinding,
  allowLegacy = false,
): { apiKey: string; legacy: boolean } {
  if (typeof sealed !== 'string' || sealed.length === 0 || sealed.length > MAX_SEALED_API_KEY_LENGTH) {
    throw new Error('Stored API key ciphertext is invalid');
  }
  assertSecretCodecAvailable(codec);
  let plaintext: unknown;
  try {
    plaintext = codec.open(sealed);
  } catch {
    throw new Error('Stored API key ciphertext could not be decrypted');
  }
  if (typeof plaintext === 'string' && plaintext.startsWith(BOUND_API_KEY_PREFIX)) {
    return {
      apiKey: parseBoundApiKeyPayload(plaintext.slice(BOUND_API_KEY_PREFIX.length), expectedBinding),
      legacy: false,
    };
  }
  if (!allowLegacy) throw new Error('Stored API key is not bound to its provider configuration');
  try {
    return { apiKey: validateApiKey(plaintext), legacy: true };
  } catch {
    throw new Error('Stored API key ciphertext could not be decrypted');
  }
}

function parseBoundApiKeyPayload(serialized: string, expected: ApiKeyBinding): string {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('Stored API key binding is invalid');
  }
  const record = asRecord(value);
  if (!record
    || Object.keys(record).length !== 5
    || record.version !== 1
    || record.presetId !== expected.presetId
    || record.endpointOrigin !== expected.endpointOrigin
    || record.auth !== expected.auth) {
    throw new Error('Stored API key binding does not match provider configuration');
  }
  try {
    return validateApiKey(record.apiKey);
  } catch {
    throw new Error('Stored API key binding is invalid');
  }
}

function apiKeyBinding(presetId: string, endpoint: string, auth: MediaProviderAuth): ApiKeyBinding {
  return {
    presetId,
    endpointOrigin: new URL(endpoint).origin,
    auth,
  };
}

function assertSecretCodecAvailable(codec: MediaProviderSecretCodec): void {
  let available = false;
  try {
    available = codec.isAvailable();
  } catch {
    // Credential-store failures are closed; plaintext persistence is never an option.
  }
  if (!available) throw new Error('OS credential encryption is unavailable');
}

function cleanRequiredText(value: string, field: string, maximum = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string') throw new Error(`${field} must be text`);
  const clean = value.trim();
  if (!clean || clean.length > maximum || /[\u0000-\u001f\u007f]/u.test(clean)) {
    throw new Error(`${field} is invalid`);
  }
  return clean;
}

function emptyDocument(): MediaProviderDocument {
  return { version: DOCUMENT_VERSION, active: {}, providers: [] };
}

function parseDocument(
  serialized: string,
  codec: MediaProviderSecretCodec,
): { document: MediaProviderDocument; migrated: boolean } {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('Media provider storage is not valid JSON');
  }
  const record = asRecord(value);
  const version = record?.version;
  if (!record || (version !== 1 && version !== DOCUMENT_VERSION) || !Array.isArray(record.providers)) {
    throw new Error('Media provider storage has an unsupported schema');
  }
  if (record.providers.length > MAX_PROVIDERS) throw new Error('Media provider storage contains too many providers');
  const activeRecord = asRecord(record.active) ?? {};
  const active: Partial<Record<MediaProviderKind, string>> = {};
  for (const kind of ['image', 'audio', 'model3d'] as const) {
    if (typeof activeRecord[kind] === 'string') active[kind] = activeRecord[kind];
  }
  const ids = new Set<string>();
  const providers: StoredProvider[] = [];
  let migrated = version === 1;
  for (const candidate of record.providers) {
    const parsed = parseStoredProvider(candidate, ids, version, codec);
    providers.push(parsed.provider);
    migrated ||= parsed.migrated;
  }
  return {
    document: { version: DOCUMENT_VERSION, active, providers },
    migrated,
  };
}

function parseStoredProvider(
  value: unknown,
  ids: Set<string>,
  version: 1 | typeof DOCUMENT_VERSION,
  codec: MediaProviderSecretCodec,
): { provider: StoredProvider; migrated: boolean } {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string' || ids.has(record.id) || typeof record.presetId !== 'string') {
    throw new Error('Media provider storage contains an invalid provider');
  }
  ids.add(record.id);
  const preset = presetFor(record.presetId);
  const displayName = cleanRequiredText(record.displayName as string, 'displayName', 160);
  const endpoint = record.endpoint === null ? null : normalizeProviderEndpoint(record.endpoint as string);
  const model = record.model === null ? null : cleanRequiredText(record.model as string, 'model', 200);
  const auth = record.auth === null ? null : record.auth;
  if (auth !== null && auth !== 'bearer' && auth !== 'x-api-key' && auth !== 'none') {
    throw new Error('Media provider storage contains invalid authentication');
  }
  const resolvedEndpoint = endpoint ?? preset.defaultEndpoint;
  if (!resolvedEndpoint) throw new Error('Stored provider has no endpoint');
  assertPresetEndpointOrigin(preset, resolvedEndpoint);
  const resolvedAuth = auth ?? preset.auth;
  const binding = apiKeyBinding(preset.id, resolvedEndpoint, resolvedAuth);
  let sealedApiKey: string | null;
  let migrated = version === 1;
  if (version === 1) {
    if (!Object.hasOwn(record, 'apiKey')) throw new Error('Media provider storage contains an invalid provider');
    if (record.apiKey === null) sealedApiKey = null;
    else sealedApiKey = sealApiKey(validateApiKey(record.apiKey), codec, binding);
  } else {
    if (!Object.hasOwn(record, 'sealedApiKey') || Object.hasOwn(record, 'apiKey')) {
      throw new Error('Media provider storage contains an invalid provider');
    }
    if (record.sealedApiKey === null) sealedApiKey = null;
    else {
      if (typeof record.sealedApiKey !== 'string') throw new Error('Stored API key ciphertext is invalid');
      const opened = openApiKey(record.sealedApiKey, codec, binding, true);
      sealedApiKey = opened.legacy
        ? sealApiKey(opened.apiKey, codec, binding)
        : record.sealedApiKey;
      migrated ||= opened.legacy;
    }
  }
  if (typeof record.enabled !== 'boolean' || typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') {
    throw new Error('Media provider storage contains invalid fields');
  }
  return {
    provider: {
      id: record.id,
      presetId: preset.id,
      displayName,
      endpoint,
      model,
      auth,
      sealedApiKey,
      enabled: record.enabled,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
    migrated,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}
