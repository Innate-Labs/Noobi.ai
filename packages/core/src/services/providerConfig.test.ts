/**
 * @license
 * Copyright 2025 OpenGame Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  MissingProviderConfigError,
  resolveProviderConfig,
  tryResolveProviderConfig,
  getProviderStatus,
  getAllProvidersStatus,
  ALL_MODALITIES,
} from './providerConfig.js';

describe('resolveProviderConfig', () => {
  it('throws an actionable error when nothing is configured', () => {
    expect(() => resolveProviderConfig('image', undefined, {})).toThrow(
      MissingProviderConfigError,
    );
    expect(() => resolveProviderConfig('image', undefined, {})).toThrow(
      /OPENGAME_IMAGE_PROVIDER/,
    );
  });

  it('returns undefined for tryResolve when nothing is configured', () => {
    expect(tryResolveProviderConfig('image', undefined, {})).toBeUndefined();
  });

  it('reads tongyi config from per-modality env vars', () => {
    const env = {
      OPENGAME_IMAGE_PROVIDER: 'tongyi',
      OPENGAME_IMAGE_API_KEY: 'sk-aliyun',
    };
    const cfg = resolveProviderConfig('image', undefined, env);
    expect(cfg.provider).toBe('tongyi');
    expect(cfg.apiKey).toBe('sk-aliyun');
    expect(cfg.baseUrl).toBe('https://dashscope.aliyuncs.com');
    expect(cfg.model).toBe('wan2.5-t2i-preview');
  });

  it('falls back to settings.json when env vars are absent', () => {
    const cfg = resolveProviderConfig(
      'reasoning',
      {
        reasoning: {
          provider: 'doubao',
          apiKey: 'volc-key',
        },
      },
      {},
    );
    expect(cfg.provider).toBe('doubao');
    expect(cfg.apiKey).toBe('volc-key');
    expect(cfg.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/v3');
    expect(cfg.model).toBe('doubao-seed-1-6-251015');
  });

  it('lets env vars override settings.json field-by-field', () => {
    const cfg = resolveProviderConfig(
      'image',
      {
        image: {
          provider: 'tongyi',
          apiKey: 'settings-key',
          model: 'settings-model',
        },
      },
      { OPENGAME_IMAGE_API_KEY: 'env-key' },
    );
    expect(cfg.apiKey).toBe('env-key');
    expect(cfg.model).toBe('settings-model'); // settings still wins for model
    expect(cfg.provider).toBe('tongyi');
  });

  it('infers tongyi when only the legacy DASHSCOPE_API_KEY is set', () => {
    const cfg = resolveProviderConfig('image', undefined, {
      DASHSCOPE_API_KEY: 'legacy-key',
    });
    expect(cfg.provider).toBe('tongyi');
    expect(cfg.apiKey).toBe('legacy-key');
  });

  it('requires a base URL and model for openai-compat', () => {
    expect(() =>
      resolveProviderConfig('image', undefined, {
        OPENGAME_IMAGE_PROVIDER: 'openai-compat',
        OPENGAME_IMAGE_API_KEY: 'sk-...',
      }),
    ).toThrow(/base URL/);

    expect(() =>
      resolveProviderConfig('image', undefined, {
        OPENGAME_IMAGE_PROVIDER: 'openai-compat',
        OPENGAME_IMAGE_API_KEY: 'sk-...',
        OPENGAME_IMAGE_BASE_URL: 'https://api.openai.com/v1',
      }),
    ).toThrow(/model/);
  });

  it('accepts a fully-specified openai-compat config', () => {
    const cfg = resolveProviderConfig('image', undefined, {
      OPENGAME_IMAGE_PROVIDER: 'openai-compat',
      OPENGAME_IMAGE_API_KEY: 'sk-...',
      OPENGAME_IMAGE_BASE_URL: 'https://api.openai.com/v1/',
      OPENGAME_IMAGE_MODEL: 'dall-e-3',
    });
    expect(cfg.provider).toBe('openai-compat');
    expect(cfg.baseUrl).toBe('https://api.openai.com/v1'); // trailing slash trimmed
    expect(cfg.model).toBe('dall-e-3');
  });

  it('rejects an unknown provider name in env', () => {
    // Unknown providers are ignored and fall through to legacy inference.
    // With no legacy key set, that means we hit MissingProviderConfigError.
    expect(() =>
      resolveProviderConfig('image', undefined, {
        OPENGAME_IMAGE_PROVIDER: 'midjourney',
        OPENGAME_IMAGE_API_KEY: 'sk-...',
      }),
    ).toThrow(MissingProviderConfigError);
  });

  it('resolves all four modalities independently', () => {
    const env = {
      OPENGAME_REASONING_PROVIDER: 'openai-compat',
      OPENGAME_REASONING_API_KEY: 'k1',
      OPENGAME_REASONING_BASE_URL: 'https://api.openai.com/v1',
      OPENGAME_REASONING_MODEL: 'gpt-4o-mini',
      OPENGAME_IMAGE_PROVIDER: 'tongyi',
      OPENGAME_IMAGE_API_KEY: 'k2',
      OPENGAME_VIDEO_PROVIDER: 'doubao',
      OPENGAME_VIDEO_API_KEY: 'k3',
      OPENGAME_AUDIO_PROVIDER: 'tongyi',
      OPENGAME_AUDIO_API_KEY: 'k4',
    };
    expect(resolveProviderConfig('reasoning', undefined, env).provider).toBe(
      'openai-compat',
    );
    expect(resolveProviderConfig('image', undefined, env).provider).toBe(
      'tongyi',
    );
    expect(resolveProviderConfig('video', undefined, env).provider).toBe(
      'doubao',
    );
    expect(resolveProviderConfig('audio', undefined, env).provider).toBe(
      'tongyi',
    );
  });

  it('provides defaults for professional audio providers', () => {
    const cfg = resolveProviderConfig(
      'audio',
      { audio: { provider: 'minimax', apiKey: 'music-key' } },
      {},
    );
    expect(cfg).toMatchObject({
      provider: 'minimax',
      baseUrl: 'https://api.minimaxi.com',
      model: 'music-2.6-free',
    });
  });

  it('rejects audio-only providers for image generation', () => {
    expect(() =>
      resolveProviderConfig(
        'image',
        { image: { provider: 'elevenlabs', apiKey: 'wrong-modality' } },
        {},
      ),
    ).toThrow(MissingProviderConfigError);
  });
});

describe('getProviderStatus', () => {
  it('reports configured=false with a hint when nothing is set', () => {
    const status = getProviderStatus('image', undefined, {});
    expect(status.configured).toBe(false);
    expect(status.missingHint).toMatch(/OPENGAME_IMAGE_PROVIDER/);
    expect(status).not.toHaveProperty('apiKey');
  });

  it('reports configured=true with provider/model and source=env', () => {
    const status = getProviderStatus('image', undefined, {
      OPENGAME_IMAGE_PROVIDER: 'tongyi',
      OPENGAME_IMAGE_API_KEY: 'sk-abc',
    });
    expect(status).toMatchObject({
      modality: 'image',
      configured: true,
      provider: 'tongyi',
      source: 'env',
    });
    expect(status.model).toBeTruthy();
    expect(status.baseUrl).toBeTruthy();
  });

  it('reports source=settings when only settings.json supplies the config', () => {
    const status = getProviderStatus(
      'image',
      { image: { provider: 'tongyi', apiKey: 'sk-from-settings' } },
      {},
    );
    expect(status.configured).toBe(true);
    expect(status.source).toBe('settings');
  });

  it('reports source=legacy-env when only the legacy DASHSCOPE_API_KEY is set', () => {
    const status = getProviderStatus('image', undefined, {
      DASHSCOPE_API_KEY: 'sk-legacy',
    });
    expect(status.configured).toBe(true);
    expect(status.provider).toBe('tongyi');
    expect(status.source).toBe('legacy-env');
  });

  it('never throws — even on totally empty env + settings', () => {
    expect(() => getAllProvidersStatus(undefined, {})).not.toThrow();
    const all = getAllProvidersStatus(undefined, {});
    expect(all).toHaveLength(ALL_MODALITIES.length);
    expect(all.every((s) => s.configured === false)).toBe(true);
  });
});
