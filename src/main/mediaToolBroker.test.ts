import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetStore } from './assetStore.js';
import {
  MEDIA_DYNAMIC_TOOLS,
  MediaToolBroker,
  type MediaToolProject,
} from './mediaToolBroker.js';
import type { CodexAppServer } from './codexAppServer.js';
import type { JsonRpcServerRequest } from './jsonRpcPeer.js';
import {
  MediaGenerationPublicError,
  MediaGenerationService,
} from './mediaGenerationService.js';
import { MEDIA_PROVIDER_PRESETS } from './mediaProviderStore.js';
import type { GameAssetRecord } from '../shared/contracts.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('media tool broker', () => {
  it('publishes bounded top-level asset and generation function tools', () => {
    expect(MEDIA_DYNAMIC_TOOLS.map((tool) => tool.type)).toEqual(Array(6).fill('function'));
    expect(MEDIA_DYNAMIC_TOOLS.map((tool) => tool.name)).toEqual([
      'noobi_asset_list',
      'noobi_asset_register',
      'noobi_audio_synthesize',
      'noobi_image_generate',
      'noobi_audio_generate',
      'noobi_model3d_generate',
    ]);
    expect(JSON.stringify(MEDIA_DYNAMIC_TOOLS)).not.toContain('inputImage');
    expect(JSON.stringify(MEDIA_DYNAMIC_TOOLS)).not.toContain('inputAudio');
    const audioTool = MEDIA_DYNAMIC_TOOLS.find((tool) => tool.name === 'noobi_audio_generate');
    expect(audioTool).toMatchObject({
      description: expect.stringContaining('MiniMax Music'),
      inputSchema: {
        required: ['name', 'prompt', 'purpose'],
        properties: {
          purpose: { type: 'string', enum: ['music', 'speech', 'vocal-sfx', 'sfx', 'ambience'] },
          instrumental: { type: 'boolean' },
          lyrics: { type: 'string', minLength: 1, maxLength: 3500 },
        },
      },
    });
    expect(audioTool?.description).toContain('procedural-audio fallback');
    expect(audioTool?.description).toContain('(groans)');
    expect(audioTool?.description).toContain('does not honor durationSeconds');
    expect(audioTool?.inputSchema.properties?.model).toMatchObject({
      description: expect.stringContaining('music-3.0'),
    });
  });

  it('ignores non-tool requests and safely rejects malformed calls', async () => {
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const broker = brokerWith({
      responses,
      assetStore: new AssetStore(),
      resolveProject: async () => null,
    });

    expect(broker.handle({ id: 1, method: 'item/fileChange/requestApproval' })).toBe(false);
    expect(responses).toHaveLength(0);
    expect(broker.handle({ id: 2, method: 'item/tool/call', params: { nope: true } })).toBe(true);
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    expect(readToolResponse(responses[0]!.result)).toMatchObject({
      success: false,
      payload: { error: 'Invalid dynamic tool request' },
    });
  });

  it('lists only compact public asset fields and caps protocol output', async () => {
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const assets = Array.from({ length: 100 }, (_, index) => fakeAsset(index));
    const assetStore = {
      list: vi.fn(async () => assets),
    } as unknown as AssetStore;
    const broker = brokerWith({
      responses,
      assetStore,
      resolveProject: async () => ({ id: 'project-1', root: '/private/workspace' }),
    });

    broker.handle(toolRequest(3, 'noobi_asset_list', { kind: 'image', limit: 100 }));
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    const raw = responses[0]!.result as { contentItems: Array<{ text: string }> };
    expect(Buffer.byteLength(raw.contentItems[0]!.text, 'utf8')).toBeLessThanOrEqual(32 * 1024);
    expect(raw.contentItems[0]!.text).not.toContain('sha256');
    expect(raw.contentItems[0]!.text).not.toContain('secret prompt');
    expect(raw.contentItems[0]!.text).not.toContain('/private/workspace');
  });

  it('creates and registers a short procedural WAV through a dynamic call', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-media-broker-'));
    roots.push(root);
    const project: MediaToolProject = { id: 'project-audio', root };
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const changed = vi.fn();
    const broker = brokerWith({
      responses,
      assetStore: new AssetStore(),
      resolveProject: async (threadId) => (threadId === 'thread-1' ? project : null),
      onAssetsChanged: changed,
    });

    const request = toolRequest(4, 'noobi_audio_synthesize', {
      name: 'game_pickup',
      preset: 'pickup',
      durationSeconds: 0.1,
      seed: 99,
    });
    delete (request.params as Record<string, unknown>).namespace;
    broker.handle(request);
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    const response = readToolResponse(responses[0]!.result);
    expect(response.success).toBe(true);
    expect(response.payload).toMatchObject({
      asset: {
        name: 'game_pickup',
        kind: 'audio',
        source: 'procedural',
        relativePath: 'public/assets/audio/game_pickup.wav',
        mimeType: 'audio/wav',
      },
    });
    const wav = await readFile(join(root, 'public/assets/audio/game_pickup.wav'));
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(changed).toHaveBeenCalledOnce();
  });

  it('rejects traversal and invalid names without exposing absolute paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-media-safe-'));
    roots.push(root);
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const broker = brokerWith({
      responses,
      assetStore: new AssetStore(),
      resolveProject: async () => ({ id: 'project-safe', root }),
    });

    broker.handle(toolRequest(5, 'noobi_asset_register', {
      relativePath: 'public/assets/../../outside.wav',
    }));
    broker.handle(toolRequest(6, 'noobi_audio_synthesize', {
      name: '../outside',
      preset: 'hit',
    }));
    await vi.waitFor(() => expect(responses).toHaveLength(2));
    for (const response of responses) {
      const parsed = readToolResponse(response.result);
      expect(parsed.success).toBe(false);
      expect(JSON.stringify(parsed.payload)).not.toContain(root);
    }
  });

  it('returns an explicit Codex ImageGen fallback without placing binary data in JSON-RPC', async () => {
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const generationService = {
      generate: vi.fn(async () => ({
        outcome: 'fallback' as const,
        fallback: 'codex-imagegen' as const,
        reason: 'provider-not-configured' as const,
        prompt: 'Four-frame fox run sprite sheet',
      })),
    };
    const broker = brokerWith({
      responses,
      assetStore: new AssetStore(),
      generationService,
      resolveProject: async () => ({ id: 'project-image', root: '/private/workspace' }),
    });

    broker.handle(toolRequest(7, 'noobi_image_generate', {
      name: 'fox_run',
      prompt: 'Four-frame fox run sprite sheet',
      width: 1024,
      height: 1024,
      background: 'transparent',
    }));
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    const response = readToolResponse(responses[0]!.result);
    expect(response).toMatchObject({
      success: true,
      payload: {
        fallback: {
          type: 'codex-imagegen',
          reason: 'provider-not-configured',
          prompt: 'Four-frame fox run sprite sheet',
        },
      },
    });
    expect(JSON.stringify(response)).not.toContain('base64');
    expect(generationService.generate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'image',
      options: { width: 1024, height: 1024, background: 'transparent' },
    }));
  });

  it('routes audio and 3D API generation and only returns compact public asset fields', async () => {
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const generated = fakeAsset(1);
    generated.kind = 'model3d';
    generated.relativePath = 'public/assets/models/ship.glb';
    generated.mimeType = 'model/gltf-binary';
    const generationService = {
      generate: vi.fn(async () => ({
        outcome: 'asset' as const,
        asset: generated,
        provider: { id: 'provider-3d', presetId: 'meshy-3d', displayName: 'Meshy', model: 'meshy-6' },
      })),
    };
    const changed = vi.fn();
    const assetStore = {
      list: vi.fn(async () => [generated]),
    } as unknown as AssetStore;
    const broker = brokerWith({
      responses,
      assetStore,
      generationService,
      resolveProject: async () => ({ id: 'project-model', root: '/private/workspace' }),
      onAssetsChanged: changed,
    });

    broker.handle(toolRequest(8, 'noobi_model3d_generate', {
      name: 'player_ship',
      prompt: 'Low-poly player ship with an animation-ready hierarchy',
      animation: true,
      textureResolution: 2048,
    }));
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    const response = readToolResponse(responses[0]!.result);
    expect(response).toMatchObject({
      success: true,
      payload: {
        asset: {
          kind: 'model3d',
          relativePath: 'public/assets/models/ship.glb',
        },
        provider: { presetId: 'meshy-3d', model: 'meshy-6' },
      },
    });
    expect(JSON.stringify(response.payload)).not.toContain('sha256');
    expect(JSON.stringify(response.payload)).not.toContain('secret prompt');
    expect(changed).toHaveBeenCalledOnce();
  });

  it('passes explicit MiniMax audio purpose, instrumental mode, and lyrics as provider options', async () => {
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const generationService = {
      generate: vi.fn(async () => ({
        outcome: 'fallback' as const,
        fallback: 'procedural-audio' as const,
        reason: 'provider-not-configured' as const,
        prompt: 'Tense survival-horror title music',
      })),
    };
    const broker = brokerWith({
      responses,
      assetStore: new AssetStore(),
      generationService,
      resolveProject: async () => ({ id: 'project-minimax-music', root: '/private/workspace' }),
    });

    broker.handle(toolRequest(10, 'noobi_audio_generate', {
      name: 'title_music',
      prompt: 'Tense survival-horror title music',
      purpose: 'music',
      instrumental: false,
      lyrics: '[Verse]\nThe city is sleeping',
      durationSeconds: 45,
      format: 'mp3',
    }));
    await vi.waitFor(() => expect(responses).toHaveLength(1));

    expect(readToolResponse(responses[0]!.result)).toMatchObject({
      success: true,
      payload: {
        fallback: {
          type: 'procedural-audio',
          reason: 'provider-not-configured',
        },
      },
    });
    expect(generationService.generate).toHaveBeenCalledWith({
      project: { id: 'project-minimax-music', root: '/private/workspace' },
      kind: 'audio',
      name: 'title_music',
      prompt: 'Tense survival-horror title music',
      options: {
        purpose: 'music',
        instrumental: false,
        lyrics: '[Verse]\nThe city is sleeping',
        durationSeconds: 45,
        format: 'mp3',
      },
    });
  });

  it('rejects unsupported audio purposes before invoking a provider', async () => {
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const generationService = { generate: vi.fn() };
    const broker = brokerWith({
      responses,
      assetStore: new AssetStore(),
      generationService,
      resolveProject: async () => ({ id: 'project-invalid-audio', root: '/private/workspace' }),
    });

    broker.handle(toolRequest(11, 'noobi_audio_generate', {
      name: 'rifle_shot',
      prompt: 'A sharp rifle report',
      purpose: 'weapon-sfx',
    }));
    await vi.waitFor(() => expect(responses).toHaveLength(1));

    expect(readToolResponse(responses[0]!.result)).toMatchObject({
      success: false,
      payload: { error: 'purpose must be one of: music, speech, vocal-sfx, sfx, ambience' },
    });
    expect(generationService.generate).not.toHaveBeenCalled();
  });

  it('rejects a missing audio purpose before invoking a provider', async () => {
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const generationService = { generate: vi.fn() };
    const broker = brokerWith({
      responses,
      assetStore: new AssetStore(),
      generationService,
      resolveProject: async () => ({ id: 'project-missing-audio-purpose', root: '/private/workspace' }),
    });

    broker.handle(toolRequest(111, 'noobi_audio_generate', {
      name: 'mystery_audio',
      prompt: 'An unspecified audio asset',
    }));
    await vi.waitFor(() => expect(responses).toHaveLength(1));

    expect(readToolResponse(responses[0]!.result)).toMatchObject({
      success: false,
      payload: { error: 'purpose is required for audio generation' },
    });
    expect(generationService.generate).not.toHaveBeenCalled();
  });

  it('returns an actionable procedural fallback for generic SFX that MiniMax does not support', async () => {
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const generationService = {
      generate: vi.fn(async () => ({
        outcome: 'fallback' as const,
        fallback: 'procedural-audio' as const,
        reason: 'purpose-not-supported' as const,
        prompt: 'Close-range rifle shot with concrete echo',
      })),
    };
    const broker = brokerWith({
      responses,
      assetStore: new AssetStore(),
      generationService,
      resolveProject: async () => ({ id: 'project-minimax-sfx', root: '/private/workspace' }),
    });

    broker.handle(toolRequest(12, 'noobi_audio_generate', {
      name: 'rifle_shot',
      prompt: 'Close-range rifle shot with concrete echo',
      purpose: 'sfx',
    }));
    await vi.waitFor(() => expect(responses).toHaveLength(1));

    const response = readToolResponse(responses[0]!.result);
    expect(response).toMatchObject({
      success: true,
      payload: {
        fallback: {
          type: 'procedural-audio',
          reason: 'purpose-not-supported',
          instruction: expect.stringContaining('Do not claim MiniMax generated generic SFX'),
        },
      },
    });
    expect(generationService.generate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'audio',
      options: { purpose: 'sfx' },
    }));
  });

  it('rejects incomplete image dimensions before calling a provider', async () => {
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const generationService = { generate: vi.fn() };
    const broker = brokerWith({
      responses,
      assetStore: new AssetStore(),
      generationService,
      resolveProject: async () => ({ id: 'project-invalid', root: '/private/workspace' }),
    });

    broker.handle(toolRequest(9, 'noobi_image_generate', {
      name: 'hero',
      prompt: 'Hero',
      width: 1024,
    }));
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    expect(readToolResponse(responses[0]!.result)).toMatchObject({
      success: false,
      payload: { error: 'width and height must be provided together' },
    });
    expect(generationService.generate).not.toHaveBeenCalled();
  });

  it('surfaces only trusted redacted media failures and keeps unexpected errors opaque', async () => {
    const root = '/private/workspace';
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const safeService = {
      generate: vi.fn(async () => {
        throw new MediaGenerationPublicError(
          `MiniMax 请求失败（status_code: 2153）：Music API 未开通 ${root} sk-api-secret_value_123456`,
        );
      }),
    };
    const safeBroker = brokerWith({
      responses,
      assetStore: new AssetStore(),
      generationService: safeService,
      resolveProject: async () => ({ id: 'project-safe-provider-error', root }),
    });

    safeBroker.handle(toolRequest(91, 'noobi_audio_generate', {
      name: 'safe_error',
      prompt: 'Minimal music test',
      purpose: 'music',
    }));
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    const safeResponse = readToolResponse(responses[0]!.result);
    expect(safeResponse.success).toBe(false);
    expect(safeResponse.payload.error).toContain('status_code: 2153');
    expect(safeResponse.payload.error).toContain('[workspace]');
    expect(safeResponse.payload.error).toContain('[redacted]');
    expect(JSON.stringify(safeResponse)).not.toContain(root);
    expect(JSON.stringify(safeResponse)).not.toContain('sk-api-secret_value_123456');

    responses.length = 0;
    const opaqueBroker = brokerWith({
      responses,
      assetStore: new AssetStore(),
      generationService: { generate: vi.fn(async () => { throw new Error('raw provider body secret'); }) },
      resolveProject: async () => ({ id: 'project-opaque-provider-error', root }),
    });
    opaqueBroker.handle(toolRequest(92, 'noobi_audio_generate', {
      name: 'opaque_error',
      prompt: 'Minimal music test',
      purpose: 'music',
    }));
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    expect(readToolResponse(responses[0]!.result)).toMatchObject({
      success: false,
      payload: { error: 'Media tool failed safely' },
    });
  });

  it('passes a real MiniMax business failure through service and broker without provider secrets', async () => {
    const root = '/private/workspace';
    const responses: Array<{ id: string | number; result: unknown }> = [];
    const preset = MEDIA_PROVIDER_PRESETS.find((item) => item.id === 'minimax-audio-cn')!;
    const provider = {
      id: 'provider-minimax-cn',
      preset,
      displayName: 'MiniMax China',
      endpoint: preset.defaultEndpoint!,
      model: 'music-3.0',
      auth: 'bearer' as const,
      apiKey: 'sk-api-integration_test_secret',
    };
    const providerStore = {
      withActiveProvider: async (
        _kind: unknown,
        operation: (resolved: typeof provider) => Promise<unknown>,
      ) => operation(provider),
    };
    const providerMessage = 'raw-provider-secret-status-message';
    const generationService = new MediaGenerationService({
      providerStore: providerStore as never,
      assetStore: new AssetStore(),
      fetch: vi.fn(async () => new Response(JSON.stringify({
        data: null,
        trace_id: '0123456789abcdef0123456789abcdef',
        base_resp: { status_code: 2153, status_msg: providerMessage },
      }), { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch,
    });
    const broker = brokerWith({
      responses,
      assetStore: new AssetStore(),
      generationService,
      resolveProject: async () => ({ id: 'project-real-minimax-error', root }),
    });

    broker.handle(toolRequest(93, 'noobi_audio_generate', {
      name: 'music_entitlement',
      prompt: 'Minimal music test',
      purpose: 'music',
      format: 'mp3',
    }));
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    const response = readToolResponse(responses[0]!.result);
    expect(response).toMatchObject({
      success: false,
      payload: {
        error: expect.stringMatching(/status_code: 2153.*Music API.*Trace ID/u),
      },
    });
    expect(JSON.stringify(response)).not.toContain(providerMessage);
    expect(JSON.stringify(response)).not.toContain(provider.apiKey);
    expect(JSON.stringify(response)).not.toContain(root);
  });
});

function brokerWith(options: {
  responses: Array<{ id: string | number; result: unknown }>;
  assetStore: AssetStore;
  generationService?: Pick<MediaGenerationService, 'generate'>;
  resolveProject(threadId: string): Promise<MediaToolProject | null>;
  onAssetsChanged?(projectId: string, assets: GameAssetRecord[]): void | Promise<void>;
}): MediaToolBroker {
  const server = {
    respondToServerRequest: (id: string | number, result: unknown) => options.responses.push({ id, result }),
  } as Pick<CodexAppServer, 'respondToServerRequest'>;
  return new MediaToolBroker({
    server,
    assetStore: options.assetStore,
    ...(options.generationService ? { generationService: options.generationService } : {}),
    resolveProject: options.resolveProject,
    ...(options.onAssetsChanged ? { onAssetsChanged: options.onAssetsChanged } : {}),
  });
}

function toolRequest(id: number, tool: string, args: Record<string, unknown>): JsonRpcServerRequest {
  return {
    id,
    method: 'item/tool/call',
    params: {
      threadId: 'thread-1',
      turnId: 'turn-1',
      callId: `call-${id}`,
      namespace: null,
      tool,
      arguments: args,
    },
  };
}

function readToolResponse(value: unknown): { success: boolean; payload: Record<string, unknown> } {
  const response = value as { success: boolean; contentItems: Array<{ type: string; text: string }> };
  return {
    success: response.success,
    payload: JSON.parse(response.contentItems[0]!.text) as Record<string, unknown>,
  };
}

function fakeAsset(index: number): GameAssetRecord {
  return {
    id: `asset-${index}`,
    name: `A very long but valid asset name ${index}`,
    kind: 'image',
    source: 'generated',
    relativePath: `public/assets/images/${'x'.repeat(500)}-${index}.png`,
    mimeType: 'image/png',
    size: 100,
    sha256: 'a'.repeat(64),
    createdAt: new Date(0).toISOString(),
    prompt: 'secret prompt',
    provider: 'codex-imagegen',
  };
}
