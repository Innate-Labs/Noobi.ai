import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssetStore } from './assetStore.js';
import { MediaGenerationService } from './mediaGenerationService.js';
import { MediaProviderStore, type MediaProviderSecretCodec } from './mediaProviderStore.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('media generation service', () => {
  it('represents safe built-in fallbacks when no API provider is configured', async () => {
    const providerStore = {
      withActiveProvider: vi.fn(async () => null),
    };
    const assetStore = {
      list: vi.fn(),
      importFiles: vi.fn(),
      registerExisting: vi.fn(),
    };
    const fetchMock = vi.fn();
    const service = new MediaGenerationService({
      providerStore: providerStore as never,
      assetStore: assetStore as never,
      fetch: fetchMock as never,
    });
    const project = { id: 'project-fallback', root: '/unused' };

    await expect(service.generate({ project, kind: 'image', name: 'hero', prompt: 'Pixel hero' })).resolves.toEqual({
      outcome: 'fallback',
      fallback: 'codex-imagegen',
      reason: 'provider-not-configured',
      prompt: 'Pixel hero',
    });
    await expect(service.generate({ project, kind: 'audio', name: 'hit', prompt: 'Heavy impact' })).resolves.toMatchObject({
      outcome: 'fallback',
      fallback: 'procedural-audio',
    });
    await expect(service.generate({ project, kind: 'model3d', name: 'crate', prompt: 'Wood crate' })).resolves.toMatchObject({
      outcome: 'fallback',
      fallback: 'none',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(assetStore.importFiles).not.toHaveBeenCalled();
  });

  it('prefers a configured OpenAI image API, decodes bounded base64 privately, and persists through AssetStore', async () => {
    const { root, providerStore } = await configuredStore({
      presetId: 'openai-image',
      apiKey: 'sk-private-image-key',
    });
    const png = tinyPng();
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-private-image-key');
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body).toMatchObject({ model: 'gpt-image-2', prompt: 'A complete hero sprite' });
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const service = new MediaGenerationService({
      providerStore,
      assetStore: new AssetStore(),
      fetch: fetchMock as typeof fetch,
    });

    const result = await service.generate({
      project: { id: 'project-image', root },
      kind: 'image',
      name: 'hero-sprite',
      prompt: 'A complete hero sprite',
    });
    expect(result).toMatchObject({
      outcome: 'asset',
      asset: {
        name: 'hero-sprite',
        kind: 'image',
        source: 'generated',
        mimeType: 'image/png',
        provider: 'OpenAI:OpenAI Images',
        metadata: { model: 'gpt-image-2', presetId: 'openai-image', mediaGeneration: true },
      },
      provider: { presetId: 'openai-image', model: 'gpt-image-2' },
    });
    expect(JSON.stringify(result)).not.toContain('b64_json');
    expect(JSON.stringify(result)).not.toContain(png.toString('base64'));
    expect(JSON.stringify(result)).not.toContain('sk-private-image-key');
  });

  it('fetches a returned media URL without forwarding credentials and validates its signature', async () => {
    const { root, providerStore } = await configuredStore({
      presetId: 'custom-audio',
      endpoint: 'https://generation.example.com/audio',
      apiKey: 'audio-secret',
    });
    const wav = tinyWav();
    const fetchMock = vi.fn()
      .mockImplementationOnce(async (_url: string | URL | Request, init?: RequestInit) => {
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer audio-secret');
        return new Response(JSON.stringify({ output: { download_url: 'https://generation.example.com/output.wav' } }), {
          headers: { 'content-type': 'application/json' },
        });
      })
      .mockImplementationOnce(async (url: string | URL | Request, init?: RequestInit) => {
        expect(String(url)).toBe('https://generation.example.com/output.wav');
        expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
        return new Response(wav, { headers: { 'content-type': 'audio/wav' } });
      });
    const service = new MediaGenerationService({
      providerStore,
      assetStore: new AssetStore(),
      fetch: fetchMock as typeof fetch,
    });

    const result = await service.generate({
      project: { id: 'project-audio', root },
      kind: 'audio',
      name: 'battle-theme',
      prompt: 'Energetic battle loop',
      options: { durationSeconds: 3 },
    });
    expect(result).toMatchObject({ outcome: 'asset', asset: { kind: 'audio', mimeType: 'audio/wav' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects truncated MP3, empty WAV, and incomplete OGG while accepting complete OGG pages', async () => {
    const invalidAudio = [
      {
        bytes: Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
        contentType: 'audio/mpeg',
      },
      { bytes: emptyWav(), contentType: 'audio/wav' },
      { bytes: truncatedOgg(), contentType: 'audio/ogg' },
    ];

    for (const [index, scenario] of invalidAudio.entries()) {
      const { root, providerStore } = await configuredStore({
        presetId: 'custom-audio',
        endpoint: `https://invalid-audio-${index}.example.test/generate`,
        apiKey: 'invalid-audio-secret',
      });
      const assetStore = new AssetStore();
      const service = new MediaGenerationService({
        providerStore,
        assetStore,
        fetch: vi.fn(async () => new Response(scenario.bytes, {
          headers: { 'content-type': scenario.contentType },
        })) as unknown as typeof fetch,
      });

      await expect(service.generate({
        project: { id: `project-invalid-audio-${index}`, root },
        kind: 'audio',
        name: 'invalid-audio',
        prompt: 'Provider returned structurally invalid audio',
        options: { purpose: 'sfx' },
      })).rejects.toThrow(/contents do not match audio/u);
      expect(await assetStore.list(`project-invalid-audio-${index}`, root)).toEqual([]);
    }

    const { root, providerStore } = await configuredStore({
      presetId: 'custom-audio',
      endpoint: 'https://valid-ogg.example.test/generate',
      apiKey: 'valid-ogg-secret',
    });
    const service = new MediaGenerationService({
      providerStore,
      assetStore: new AssetStore(),
      fetch: vi.fn(async () => new Response(tinyOgg(), {
        headers: { 'content-type': 'audio/ogg' },
      })) as unknown as typeof fetch,
    });
    await expect(service.generate({
      project: { id: 'project-valid-ogg', root },
      kind: 'audio',
      name: 'valid-ogg',
      prompt: 'A structurally complete OGG test asset',
      options: { purpose: 'sfx' },
    })).resolves.toMatchObject({
      outcome: 'asset',
      asset: { mimeType: 'audio/ogg' },
    });
  });

  it('does not let a provider redirect a secondary download to another localhost origin', async () => {
    const { root, providerStore } = await configuredStore({
      presetId: 'custom-image',
      endpoint: 'http://127.0.0.1:8787/generate',
      apiKey: 'local-gateway-secret',
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      url: 'http://127.0.0.1:8788/private.png',
    }), { headers: { 'content-type': 'application/json' } }));
    const service = new MediaGenerationService({
      providerStore,
      assetStore: new AssetStore(),
      fetch: fetchMock as typeof fetch,
    });

    await expect(service.generate({
      project: { id: 'project-local-origin', root },
      kind: 'image',
      name: 'local-image',
      prompt: 'Generate through the local gateway',
    })).rejects.toThrow(/provider endpoint origin/u);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects redirects, insecure download URLs, oversized bodies, and kind/signature mismatches', async () => {
    const scenarios: Array<{ response: Response; message: RegExp }> = [
      {
        response: new Response(null, { status: 302, headers: { location: 'https://other.example.com/result.png' } }),
        message: /redirects/u,
      },
      {
        response: new Response(JSON.stringify({ url: 'http://cdn.example.com/result.png' }), {
          headers: { 'content-type': 'application/json' },
        }),
        message: /HTTPS/u,
      },
      {
        response: new Response(JSON.stringify({ url: 'https://cdn.example.com/result.png' }), {
          headers: { 'content-type': 'application/json' },
        }),
        message: /provider endpoint origin/u,
      },
      {
        response: new Response(null, {
          headers: { 'content-type': 'image/png', 'content-length': String(32 * 1024 * 1024 + 1) },
        }),
        message: /byte limit/u,
      },
      {
        response: new Response(tinyWav(), { headers: { 'content-type': 'audio/wav' } }),
        message: /do not match image/u,
      },
    ];

    for (const [index, scenario] of scenarios.entries()) {
      const { root, providerStore } = await configuredStore({
        presetId: 'custom-image',
        endpoint: `https://generation${index}.example.com/image`,
        apiKey: 'secret',
      });
      const service = new MediaGenerationService({
        providerStore,
        assetStore: new AssetStore(),
        fetch: vi.fn(async () => scenario.response) as unknown as typeof fetch,
      });
      await expect(service.generate({
        project: { id: `project-${index}`, root },
        kind: 'image',
        name: 'unsafe',
        prompt: 'Unsafe provider result',
      })).rejects.toThrow(scenario.message);
    }
  });

  it('routes MiniMax music to music_generation with non-streaming hex and preserves authored lyrics', async () => {
    const { root, providerStore } = await configuredStore({
      presetId: 'minimax-audio',
      apiKey: 'minimax-test-secret',
    });
    const mp3 = tinyMp3(0x31);
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.minimax.io/v1/music_generation');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer minimax-test-secret');
      expect(JSON.parse(init?.body as string)).toEqual({
        model: 'music-3.0',
        prompt: 'Dark survival synth, tense and cinematic',
        stream: false,
        output_format: 'hex',
        is_instrumental: false,
        lyrics: '[Verse]\nRun through the night',
        audio_setting: {
          sample_rate: 44_100,
          bitrate: 256_000,
          format: 'mp3',
        },
      });
      return miniMaxResponse(mp3);
    });
    const service = new MediaGenerationService({
      providerStore,
      assetStore: new AssetStore(),
      fetch: fetchMock as typeof fetch,
    });

    const result = await service.generate({
      project: { id: 'project-minimax-music', root },
      kind: 'audio',
      name: 'survival-theme',
      prompt: 'Dark survival synth, tense and cinematic',
      options: {
        purpose: 'music',
        format: 'mp3',
        instrumental: false,
        lyrics: '[Verse]\nRun through the night',
      },
    });

    expect(result).toMatchObject({
      outcome: 'asset',
      asset: {
        kind: 'audio',
        mimeType: 'audio/mpeg',
        provider: 'MiniMax:MiniMax Music & Vocal Audio (Global)',
        metadata: { model: 'music-3.0', presetId: 'minimax-audio', mediaGeneration: true },
      },
      provider: { presetId: 'minimax-audio', model: 'music-3.0' },
    });
    expect(JSON.stringify(result)).not.toContain(mp3.toString('hex'));
    expect(JSON.stringify(result)).not.toContain('minimax-test-secret');
  });

  it('defaults prompt-only MiniMax music to an instrumental track', async () => {
    const { root, providerStore } = await configuredStore({
      presetId: 'minimax-audio',
      apiKey: 'minimax-instrumental-secret',
    });
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(init?.body as string)).toEqual({
        model: 'music-3.0',
        prompt: 'Seamless exploration loop with distant metallic percussion',
        stream: false,
        output_format: 'hex',
        is_instrumental: true,
        audio_setting: {
          sample_rate: 44_100,
          bitrate: 256_000,
          format: 'wav',
        },
      });
      return miniMaxResponse(tinyWav());
    });
    const service = new MediaGenerationService({
      providerStore,
      assetStore: new AssetStore(),
      fetch: fetchMock as typeof fetch,
    });

    await expect(service.generate({
      project: { id: 'project-minimax-instrumental', root },
      kind: 'audio',
      name: 'exploration-loop',
      prompt: 'Seamless exploration loop with distant metallic percussion',
      options: { purpose: 'music', format: 'wav' },
    })).resolves.toMatchObject({
      outcome: 'asset',
      asset: { mimeType: 'audio/wav' },
    });
  });

  it.each(['speech', 'vocal-sfx'] as const)(
    'routes MiniMax %s through t2a_v2 with the selected voice and speech default model',
    async (purpose) => {
      const { root, providerStore } = await configuredStore({
        presetId: 'minimax-audio',
        apiKey: 'minimax-speech-secret',
      });
      const wav = tinyWav();
      const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        expect(String(url)).toBe('https://api.minimax.io/v1/t2a_v2');
        expect(JSON.parse(init?.body as string)).toEqual({
          model: 'speech-2.8-hd',
          text: 'Enemy approaching!',
          stream: false,
          output_format: 'hex',
          language_boost: 'auto',
          voice_setting: {
            voice_id: 'English_expressive_narrator',
            speed: 1,
            vol: 1,
            pitch: 0,
          },
          audio_setting: {
            sample_rate: 32_000,
            bitrate: 128_000,
            format: 'wav',
            channel: 1,
          },
        });
        return miniMaxResponse(wav);
      });
      const service = new MediaGenerationService({
        providerStore,
        assetStore: new AssetStore(),
        fetch: fetchMock as typeof fetch,
      });

      await expect(service.generate({
        project: { id: `project-minimax-${purpose}`, root },
        kind: 'audio',
        name: `${purpose}-line`,
        prompt: 'Enemy approaching!',
        options: { purpose, voice: 'English_expressive_narrator', format: 'wav' },
      })).resolves.toMatchObject({
        outcome: 'asset',
        asset: { kind: 'audio', mimeType: 'audio/wav' },
        provider: { model: 'speech-2.8-hd' },
      });
    },
  );

  it.each(['sfx', 'ambience'] as const)(
    'returns an explicit procedural fallback for MiniMax %s without sending a fake API request',
    async (purpose) => {
      const { root, providerStore } = await configuredStore({
        presetId: 'minimax-audio',
        apiKey: 'unused-minimax-secret',
      });
      const fetchMock = vi.fn();
      const assetStore = {
        list: vi.fn(),
        importFiles: vi.fn(),
        registerExisting: vi.fn(),
      };
      const service = new MediaGenerationService({
        providerStore,
        assetStore: assetStore as never,
        fetch: fetchMock as never,
      });

      await expect(service.generate({
        project: { id: `project-minimax-${purpose}`, root },
        kind: 'audio',
        name: `${purpose}-asset`,
        prompt: 'A sharp impact with a concrete tail',
        options: { purpose },
      })).resolves.toEqual({
        outcome: 'fallback',
        fallback: 'procedural-audio',
        reason: 'purpose-not-supported',
        prompt: 'A sharp impact with a concrete tail',
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(assetStore.importFiles).not.toHaveBeenCalled();
    },
  );

  it('rejects MiniMax duration and OGG options instead of silently ignoring unsupported controls', async () => {
    const { root, providerStore } = await configuredStore({
      presetId: 'minimax-audio',
      apiKey: 'minimax-option-secret',
    });
    const fetchMock = vi.fn();
    const service = new MediaGenerationService({
      providerStore,
      assetStore: new AssetStore(),
      fetch: fetchMock as never,
    });

    await expect(service.generate({
      project: { id: 'project-minimax-duration', root },
      kind: 'audio',
      name: 'fixed-duration',
      prompt: 'A seamless exploration loop',
      options: { purpose: 'music', durationSeconds: 30 },
    })).rejects.toThrow(/does not support durationSeconds/u);
    await expect(service.generate({
      project: { id: 'project-minimax-ogg', root },
      kind: 'audio',
      name: 'ogg-track',
      prompt: 'A seamless exploration loop',
      options: { purpose: 'music', format: 'ogg' },
    })).rejects.toThrow(/format must be mp3 or wav/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('strictly rejects MiniMax API status, incomplete data, malformed hex, format mismatches, and oversized JSON', async () => {
    const scenarios: Array<{ response: Response; message: RegExp }> = [
      {
        response: miniMaxJson({
          data: { audio: tinyMp3().toString('hex'), status: 2 },
          base_resp: { status_code: 1001, status_msg: 'invalid' },
        }),
        message: /status_code: 1001.*请求超时/u,
      },
      {
        response: miniMaxJson({ data: { audio: tinyMp3().toString('hex'), status: 1 }, base_resp: { status_code: 0 } }),
        message: /completed audio data/u,
      },
      {
        response: miniMaxJson({ data: { audio: 'abc', status: 2 }, base_resp: { status_code: 0 } }),
        message: /invalid hex audio/u,
      },
      {
        response: miniMaxJson({ data: { audio: 'zz', status: 2 }, base_resp: { status_code: 0 } }),
        message: /invalid hex audio/u,
      },
      {
        response: miniMaxResponse(tinyWav()),
        message: /requested format/u,
      },
      {
        response: new Response(tinyMp3(), { headers: { 'content-type': 'audio/mpeg' } }),
        message: /JSON hex format/u,
      },
      {
        response: new Response(null, {
          headers: { 'content-type': 'application/json', 'content-length': String(129 * 1024 * 1024 + 1) },
        }),
        message: /byte limit/u,
      },
      {
        response: new Response('{}', { status: 429, headers: { 'content-type': 'application/json' } }),
        message: /HTTP 429.*请求过于频繁/u,
      },
    ];

    for (const [index, scenario] of scenarios.entries()) {
      const { root, providerStore } = await configuredStore({
        presetId: 'minimax-audio',
        apiKey: 'minimax-error-secret',
      });
      const service = new MediaGenerationService({
        providerStore,
        assetStore: new AssetStore(),
        fetch: vi.fn(async () => scenario.response) as unknown as typeof fetch,
      });
      await expect(service.generate({
        project: { id: `project-minimax-error-${index}`, root },
        kind: 'audio',
        name: 'invalid-audio',
        prompt: 'Minimal music test',
        options: { purpose: 'music', format: 'mp3' },
      })).rejects.toThrow(scenario.message);
    }
  });

  it('surfaces safe MiniMax business codes without leaking provider messages and parses non-2xx JSON', async () => {
    for (const scenario of [
      {
        status: 200,
        code: 1004,
        expected: /status_code: 1004.*区域选择正确/u,
      },
      {
        status: 401,
        code: 2049,
        expected: /status_code: 2049.*API Key 无效/u,
      },
      {
        status: 200,
        code: 1008,
        expected: /status_code: 1008.*余额不足/u,
      },
      {
        status: 410,
        code: 2153,
        expected: /status_code: 2153.*Music API 使用资格/u,
      },
    ]) {
      const { root, providerStore } = await configuredStore({
        presetId: 'minimax-audio',
        apiKey: 'minimax-safe-error-secret',
      });
      const providerMessage = 'do-not-expose-provider-message-or-key';
      const response = new Response(JSON.stringify({
        data: null,
        trace_id: '0123456789abcdef0123456789abcdef',
        base_resp: { status_code: scenario.code, status_msg: providerMessage },
      }), {
        status: scenario.status,
        headers: { 'content-type': 'application/json' },
      });
      const service = new MediaGenerationService({
        providerStore,
        assetStore: new AssetStore(),
        fetch: vi.fn(async () => response) as unknown as typeof fetch,
      });
      const error = await service.generate({
        project: { id: `project-minimax-safe-error-${scenario.code}`, root },
        kind: 'audio',
        name: 'safe-error',
        prompt: 'Minimal music test',
        options: { purpose: 'music', format: 'mp3' },
      }).then(() => null, (reason: unknown) => reason instanceof Error ? reason : new Error(String(reason)));
      expect(error?.message).toMatch(scenario.expected);
      expect(error?.message).toContain('Trace ID: 0123456789abcdef0123456789abcdef');
      expect(error?.message).not.toContain(providerMessage);
      expect(error?.message).not.toContain('minimax-safe-error-secret');
    }
  });

  it('probes MiniMax with the turbo speech model and low bitrate without persisting or exposing audio', async () => {
    const { providerStore } = await configuredStore({
      presetId: 'minimax-audio',
      apiKey: 'minimax-probe-secret',
    });
    const mp3 = tinyMp3(0x42);
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.minimax.io/v1/t2a_v2');
      expect(JSON.parse(init?.body as string)).toMatchObject({
        model: 'speech-2.8-turbo',
        text: 'OK.',
        stream: false,
        output_format: 'hex',
        audio_setting: { sample_rate: 16_000, bitrate: 32_000, format: 'mp3', channel: 1 },
      });
      return miniMaxResponse(mp3);
    });
    const assetStore = {
      list: vi.fn(),
      importFiles: vi.fn(),
      registerExisting: vi.fn(),
    };
    const service = new MediaGenerationService({
      providerStore,
      assetStore: assetStore as never,
      fetch: fetchMock as typeof fetch,
    });

    const result = await service.probeActiveAudioProvider();
    expect(result).toEqual({
      outcome: 'ready',
      provider: {
        id: expect.any(String),
        presetId: 'minimax-audio',
        displayName: 'MiniMax Music & Vocal Audio (Global)',
        model: 'speech-2.8-turbo',
      },
    });
    expect(JSON.stringify(result)).not.toContain(mp3.toString('hex'));
    expect(JSON.stringify(result)).not.toContain('minimax-probe-secret');
    expect(assetStore.importFiles).not.toHaveBeenCalled();
  });

  it('routes a China-region MiniMax key only to the official minimaxi.com Speech endpoint', async () => {
    const { providerStore } = await configuredStore({
      presetId: 'minimax-audio-cn',
      apiKey: 'sk-api-china_dummy-key',
    });
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.minimaxi.com/v1/t2a_v2');
      expect(JSON.parse(init?.body as string)).toMatchObject({
        model: 'speech-2.8-turbo',
        voice_setting: { voice_id: 'male-qn-qingse' },
      });
      return miniMaxResponse(tinyMp3(0x52));
    });
    const service = new MediaGenerationService({
      providerStore,
      assetStore: new AssetStore(),
      fetch: fetchMock as typeof fetch,
    });

    await expect(service.probeActiveAudioProvider()).resolves.toMatchObject({
      outcome: 'ready',
      provider: { presetId: 'minimax-audio-cn', model: 'speech-2.8-turbo' },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts a timed-out MiniMax request without leaking provider data', async () => {
    vi.useFakeTimers();
    try {
      const { root, providerStore } = await configuredStore({
        presetId: 'minimax-audio',
        apiKey: 'minimax-timeout-secret',
      });
      const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      }));
      const service = new MediaGenerationService({
        providerStore,
        assetStore: new AssetStore(),
        fetch: fetchMock as typeof fetch,
        requestTimeoutMs: 1_000,
      });
      const pending = expect(service.generate({
        project: { id: 'project-minimax-timeout', root },
        kind: 'audio',
        name: 'timeout-audio',
        prompt: 'Minimal music timeout test',
        options: { purpose: 'music' },
      })).rejects.toThrow('Media provider request timed out');
      await vi.advanceTimersByTimeAsync(1_000);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
});

async function configuredStore(input: {
  presetId: string;
  endpoint?: string;
  apiKey: string;
}): Promise<{ root: string; providerStore: MediaProviderStore }> {
  const root = await mkdtemp(join(tmpdir(), 'noobi-generation-test-'));
  roots.push(root);
  const providerStore = new MediaProviderStore(join(root, '.noobi-private', 'providers.json'), fakeSecretCodec());
  await providerStore.init();
  await providerStore.upsert({ ...input, setActive: true });
  return { root, providerStore };
}

function tinyPng(): Buffer {
  return Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
}

function tinyWav(): Buffer {
  const bytes = Buffer.alloc(46);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(38, 4);
  bytes.write('WAVE', 8, 'ascii');
  bytes.write('fmt ', 12, 'ascii');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8_000, 24);
  bytes.writeUInt32LE(16_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'ascii');
  bytes.writeUInt32LE(2, 40);
  bytes.writeInt16LE(0, 44);
  return bytes;
}

function tinyMp3(marker = 0): Buffer {
  const id3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const firstFrame = Buffer.alloc(104);
  firstFrame.set([0xff, 0xfb, 0x10, 0x00]);
  firstFrame[4] = marker;
  const secondFrame = Buffer.from(firstFrame);
  secondFrame[4] = marker ^ 0xff;
  return Buffer.concat([id3, firstFrame, secondFrame]);
}

function emptyWav(): Buffer {
  const bytes = tinyWav().subarray(0, 44);
  bytes.writeUInt32LE(36, 4);
  bytes.writeUInt32LE(0, 40);
  return bytes;
}

function tinyOgg(): Buffer {
  return Buffer.concat([
    oggPage(Buffer.from('OpusHead', 'ascii'), 0x02, 0),
    oggPage(Buffer.from([0xf8, 0xff, 0xfe]), 0x04, 1),
  ]);
}

function truncatedOgg(): Buffer {
  const bytes = Buffer.alloc(29);
  bytes.write('OggS', 0, 'ascii');
  bytes[4] = 0;
  bytes[26] = 1;
  bytes[27] = 10;
  bytes[28] = 0xff;
  return bytes;
}

function oggPage(payload: Buffer, headerType: number, sequence: number): Buffer {
  if (payload.length > 255) throw new Error('tiny OGG payload must fit one segment');
  const page = Buffer.alloc(28 + payload.length);
  page.write('OggS', 0, 'ascii');
  page[4] = 0;
  page[5] = headerType;
  page.writeUInt32LE(1, 14);
  page.writeUInt32LE(sequence, 18);
  page[26] = 1;
  page[27] = payload.length;
  payload.copy(page, 28);
  return page;
}

function miniMaxResponse(audio: Buffer): Response {
  return miniMaxJson({
    data: { audio: audio.toString('hex'), status: 2 },
    base_resp: { status_code: 0, status_msg: 'success' },
  });
}

function miniMaxJson(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function fakeSecretCodec(): MediaProviderSecretCodec {
  return {
    isAvailable: () => true,
    seal: (plaintext) => `sealed:${Buffer.from(plaintext, 'utf8').toString('base64')}`,
    open: (sealed) => Buffer.from(sealed.slice('sealed:'.length), 'base64').toString('utf8'),
  };
}
