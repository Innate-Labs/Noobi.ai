/**
 * @license
 * Copyright 2025 OpenGame Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Central, modality-aware provider resolver for OpenGame.
 *
 * OpenGame talks to four kinds of external generative APIs:
 *   - reasoning : a chat/code LLM used for game-design reasoning (GDD,
 *                 archetype classification, ABC notation generation).
 *   - image     : text-to-image and image-edit (sprites, backgrounds, tiles).
 *   - video     : image-to-video and text-to-video (used for animation
 *                 frames and as a source for audio extraction).
 *   - audio     : direct professional music/SFX generation, with legacy
 *                 ABC-notation, video-extraction, and procedural fallbacks.
 *
 * Each modality is configured INDEPENDENTLY so users can mix providers
 * (e.g. DashScope/Tongyi for image, Doubao for video, OpenAI-compat for
 * reasoning, and ElevenLabs for audio).
 *
 * Resolution order, highest priority first:
 *   1. Explicit per-modality environment variables
 *      (OPENGAME_<MOD>_PROVIDER / _API_KEY / _BASE_URL / _MODEL).
 *   2. The `openGame.providers.<mod>` block in ~/.qwen/settings.json
 *      (passed in via the `fromConfig` argument).
 *   3. Legacy environment variables inherited from the upstream code
 *      (DASHSCOPE_API_KEY, IMAGE_MODEL_API_KEY, REASONING_MODEL_API_KEY,
 *      etc.) — kept for backward compatibility, may be removed in a
 *      future release.
 *   4. If none of the above provide a key, throw a `MissingProviderConfigError`
 *      with an actionable message pointing at docs/users/configuration/api-keys.md.
 */

export type Modality = 'reasoning' | 'image' | 'video' | 'audio';

export type StandardProviderName = 'tongyi' | 'doubao' | 'openai-compat';
export type ProfessionalAudioProviderName =
  | 'elevenlabs'
  | 'minimax'
  | 'stability'
  | 'google-lyria'
  | 'mureka';
export type ProviderName = StandardProviderName | ProfessionalAudioProviderName;

export interface ResolvedProviderConfig {
  /** Which provider family this modality talks to. */
  provider: ProviderName;
  /** Bearer token sent to the provider. */
  apiKey: string;
  /** Base URL for the provider (already free of trailing slashes). */
  baseUrl: string;
  /**
   * Default model name for this modality. Tools may override this when the
   * user explicitly passes a different model in their request.
   */
  model: string;
}

/**
 * Optional per-modality configuration block sourced from settings.json.
 * The shape mirrors the env vars below so the two paths are interchangeable.
 */
export interface ProviderSettingsBlock {
  provider?: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface OpenGameProvidersSettings {
  reasoning?: ProviderSettingsBlock;
  image?: ProviderSettingsBlock;
  video?: ProviderSettingsBlock;
  audio?: ProviderSettingsBlock;
}

/**
 * Thrown when no key/provider can be resolved for a modality. Tools should
 * let this bubble up to the user — it carries an actionable message.
 */
export class MissingProviderConfigError extends Error {
  readonly modality: Modality;
  readonly hint: string;
  constructor(modality: Modality, hint: string) {
    super(
      `OpenGame is missing API configuration for the "${modality}" modality.\n\n${hint}\n\nSee docs/users/configuration/api-keys.md for the full list of supported variables.`,
    );
    this.modality = modality;
    this.hint = hint;
    this.name = 'MissingProviderConfigError';
  }
}

// ============== Defaults per provider family ==============
// These are the model names OpenGame uses when the user doesn't override
// them. Each table is keyed by modality so we never mix, e.g., a chat
// model into an image-gen call.

const TONGYI_DEFAULTS: Record<Modality, { baseUrl: string; model: string }> = {
  reasoning: {
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    model: 'deepseek-v3.2',
  },
  image: {
    baseUrl: 'https://dashscope.aliyuncs.com',
    model: 'wan2.5-t2i-preview',
  },
  video: {
    baseUrl: 'https://dashscope.aliyuncs.com',
    model: 'wan2.5-i2v-preview',
  },
  audio: {
    baseUrl: 'https://dashscope.aliyuncs.com',
    model: 'qwen-plus',
  },
};

const DOUBAO_DEFAULTS: Record<Modality, { baseUrl: string; model: string }> = {
  reasoning: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-1-6-251015',
  },
  image: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seedream-4-0-250828',
  },
  video: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seedance-1-0-pro-250528',
  },
  audio: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-1-6-251015',
  },
};

const PROFESSIONAL_AUDIO_DEFAULTS: Record<
  ProfessionalAudioProviderName,
  { baseUrl: string; model: string }
> = {
  elevenlabs: {
    baseUrl: 'https://api.elevenlabs.io',
    model: 'music_v2',
  },
  minimax: {
    baseUrl: 'https://api.minimaxi.com',
    model: 'music-2.6-free',
  },
  stability: {
    baseUrl: 'https://api.stability.ai',
    model: 'stable-audio-3',
  },
  'google-lyria': {
    baseUrl:
      'https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/us-central1/publishers/google/models',
    model: 'lyria-002',
  },
  mureka: {
    baseUrl: 'https://api.mureka.ai',
    model: 'mureka-9',
  },
};

// openai-compat has no sensible default model — the user MUST supply one,
// because the right choice depends entirely on which compatible API they
// point us at (OpenAI, OpenRouter, Together, Stability proxy, fal, ...).

const ENV_PREFIX = 'OPENGAME';

function envName(modality: Modality, suffix: string): string {
  return `${ENV_PREFIX}_${modality.toUpperCase()}_${suffix}`;
}

/**
 * Legacy env-var fallback chains kept for backwards compatibility with
 * pre-OpenGame setups. We deliberately keep these undocumented in the new
 * docs but read them so existing users don't break.
 */
const LEGACY_KEY_FALLBACKS: Record<Modality, string[]> = {
  reasoning: ['REASONING_MODEL_API_KEY', 'DASHSCOPE_API_KEY', 'OPENAI_API_KEY'],
  image: ['IMAGE_MODEL_API_KEY', 'DASHSCOPE_API_KEY'],
  video: ['VIDEO_MODEL_API_KEY', 'IMAGE_MODEL_API_KEY', 'DASHSCOPE_API_KEY'],
  audio: ['AUDIO_MODEL_API_KEY', 'IMAGE_MODEL_API_KEY', 'DASHSCOPE_API_KEY'],
};

const LEGACY_BASEURL_FALLBACKS: Record<Modality, string[]> = {
  reasoning: ['REASONING_MODEL_BASE_URL'],
  image: ['IMAGE_MODEL_BASE_URL'],
  video: ['VIDEO_MODEL_BASE_URL', 'IMAGE_MODEL_BASE_URL'],
  audio: ['AUDIO_MODEL_BASE_URL', 'IMAGE_MODEL_BASE_URL'],
};

const LEGACY_MODEL_FALLBACKS: Record<Modality, string[]> = {
  reasoning: [
    'REASONING_MODEL_NAME',
    'REASONING_MODEL',
    'CLASSIFIER_MODEL_NAME',
  ],
  image: ['IMAGE_MODEL_NAME'],
  video: ['VIDEO_MODEL_NAME'],
  audio: ['AUDIO_MODEL_NAME', 'CHAT_MODEL_NAME'],
};

function firstEnv(env: NodeJS.ProcessEnv, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (value && value.trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function trimSlashes(url: string): string {
  return url.replace(/\/+$/g, '');
}

function isProviderName(
  value: unknown,
  modality: Modality,
): value is ProviderName {
  if (value === 'tongyi' || value === 'doubao' || value === 'openai-compat') {
    return true;
  }
  return (
    modality === 'audio' &&
    (value === 'elevenlabs' ||
      value === 'minimax' ||
      value === 'stability' ||
      value === 'google-lyria' ||
      value === 'mureka')
  );
}

/**
 * Resolve the provider configuration for a single modality. Throws
 * `MissingProviderConfigError` if no key is available.
 */
export function resolveProviderConfig(
  modality: Modality,
  fromConfig?: OpenGameProvidersSettings,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedProviderConfig {
  const settingsBlock = fromConfig?.[modality];

  // -- 1. Determine the provider family -------------------------------
  const providerFromEnv = env[envName(modality, 'PROVIDER')];
  let provider: ProviderName | undefined;
  if (providerFromEnv && isProviderName(providerFromEnv, modality)) {
    provider = providerFromEnv;
  } else if (
    settingsBlock?.provider &&
    isProviderName(settingsBlock.provider, modality)
  ) {
    provider = settingsBlock.provider;
  } else {
    // No explicit choice. If the user has only set a legacy DashScope-style
    // key, we infer "tongyi" rather than failing — that keeps every
    // pre-existing OpenGame demo working without code changes.
    const legacyKey = firstEnv(env, LEGACY_KEY_FALLBACKS[modality]);
    if (legacyKey) {
      provider = 'tongyi';
    }
  }

  if (!provider) {
    throw new MissingProviderConfigError(
      modality,
      `Set ${envName(modality, 'PROVIDER')} to a supported provider name ` +
        `or add an "openGame.providers.${modality}.provider" entry to your settings.json.`,
    );
  }

  // -- 2. API key -----------------------------------------------------
  const apiKey =
    env[envName(modality, 'API_KEY')] ??
    settingsBlock?.apiKey ??
    firstEnv(env, LEGACY_KEY_FALLBACKS[modality]) ??
    '';

  if (!apiKey) {
    throw new MissingProviderConfigError(
      modality,
      `No API key found for "${modality}". Set ${envName(modality, 'API_KEY')} ` +
        `or add "openGame.providers.${modality}.apiKey" to your settings.json.`,
    );
  }

  // -- 3. Base URL + default model -----------------------------------
  const defaults =
    provider === 'doubao'
      ? DOUBAO_DEFAULTS[modality]
      : provider === 'tongyi'
        ? TONGYI_DEFAULTS[modality]
        : modality === 'audio' && provider !== 'openai-compat'
          ? PROFESSIONAL_AUDIO_DEFAULTS[provider]
          : undefined;

  const baseUrl =
    env[envName(modality, 'BASE_URL')] ??
    settingsBlock?.baseUrl ??
    firstEnv(env, LEGACY_BASEURL_FALLBACKS[modality]) ??
    defaults?.baseUrl;

  if (!baseUrl) {
    // Only reachable for openai-compat, which has no built-in default.
    throw new MissingProviderConfigError(
      modality,
      `No base URL configured for "${modality}". Set ${envName(modality, 'BASE_URL')} ` +
        `(e.g. https://api.openai.com/v1) or add ` +
        `"openGame.providers.${modality}.baseUrl" to your settings.json.`,
    );
  }

  const model =
    env[envName(modality, 'MODEL')] ??
    settingsBlock?.model ??
    firstEnv(env, LEGACY_MODEL_FALLBACKS[modality]) ??
    defaults?.model;

  if (!model) {
    throw new MissingProviderConfigError(
      modality,
      `No model name configured for "${modality}". Set ${envName(modality, 'MODEL')} ` +
        `(e.g. gpt-4o-mini, dall-e-3) or add ` +
        `"openGame.providers.${modality}.model" to your settings.json.`,
    );
  }

  return {
    provider,
    apiKey,
    baseUrl: trimSlashes(baseUrl),
    model,
  };
}

/**
 * Like `resolveProviderConfig` but returns `undefined` instead of throwing
 * when configuration is missing. Useful for code paths that want to
 * gracefully degrade (e.g. asset generation falling back to placeholders).
 */
export function tryResolveProviderConfig(
  modality: Modality,
  fromConfig?: OpenGameProvidersSettings,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedProviderConfig | undefined {
  try {
    return resolveProviderConfig(modality, fromConfig, env);
  } catch (error) {
    if (error instanceof MissingProviderConfigError) {
      return undefined;
    }
    throw error;
  }
}

// =============================================================
// Status reporting (used by `/setup` and the startup banner).
// These never throw and never read the API key value itself, so
// they are safe to call from UI code on every render.
// =============================================================

export type ProviderConfigSource = 'env' | 'settings' | 'legacy-env';

export interface ProviderStatus {
  modality: Modality;
  configured: boolean;
  provider?: ProviderName;
  baseUrl?: string;
  model?: string;
  /** Where the resolved config primarily came from. */
  source?: ProviderConfigSource;
  /** Actionable, multi-line hint when `configured` is false. */
  missingHint?: string;
}

export const ALL_MODALITIES: readonly Modality[] = [
  'reasoning',
  'image',
  'video',
  'audio',
] as const;

function detectSource(
  modality: Modality,
  fromConfig: OpenGameProvidersSettings | undefined,
  env: NodeJS.ProcessEnv,
): ProviderConfigSource {
  const explicitEnv =
    env[envName(modality, 'PROVIDER')] ??
    env[envName(modality, 'API_KEY')] ??
    env[envName(modality, 'BASE_URL')] ??
    env[envName(modality, 'MODEL')];
  if (explicitEnv && explicitEnv.trim() !== '') return 'env';

  const block = fromConfig?.[modality];
  if (block?.provider || block?.apiKey || block?.baseUrl || block?.model) {
    return 'settings';
  }

  return 'legacy-env';
}

/**
 * Inspect a single modality and report whether it is configured. Never
 * throws — missing config is reported via `configured: false` and a
 * `missingHint` message that can be shown directly to the user.
 *
 * The returned object never contains the API key itself, so it is safe
 * to log or render in the UI.
 */
export function getProviderStatus(
  modality: Modality,
  fromConfig?: OpenGameProvidersSettings,
  env: NodeJS.ProcessEnv = process.env,
): ProviderStatus {
  try {
    const resolved = resolveProviderConfig(modality, fromConfig, env);
    return {
      modality,
      configured: true,
      provider: resolved.provider,
      baseUrl: resolved.baseUrl,
      model: resolved.model,
      source: detectSource(modality, fromConfig, env),
    };
  } catch (error) {
    if (error instanceof MissingProviderConfigError) {
      return {
        modality,
        configured: false,
        missingHint: error.message,
      };
    }
    throw error;
  }
}

/** Convenience: status for every modality, in display order. */
export function getAllProvidersStatus(
  fromConfig?: OpenGameProvidersSettings,
  env: NodeJS.ProcessEnv = process.env,
): ProviderStatus[] {
  return ALL_MODALITIES.map((m) => getProviderStatus(m, fromConfig, env));
}
