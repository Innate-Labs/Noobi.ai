import { describe, expect, it, vi } from 'vitest';
import type { ProviderEndpoint } from '../shared/types.js';
import { testProviderConnection } from './providerConnection.js';

describe('testProviderConnection', () => {
  it('validates MiniMax credentials without generating music', async () => {
    let calledUrl = '';
    let calledRequest: RequestInit | undefined;
    const fetchMock: typeof fetch = async (input, request) => {
      calledUrl = String(input);
      calledRequest = request;
      return jsonResponse(200, {
        base_resp: { status_code: 2013, status_msg: 'invalid params' },
      });
    };

    const result = await testProviderConnection(
      endpoint('minimax', 'https://api.minimaxi.com', 'music-2.6-free'),
      fetchMock,
    );

    expect(result.status).toBe('success');
    expect(result.message).toContain('未触发音乐生成');
    expect(calledUrl).toBe('https://api.minimaxi.com/v1/music_generation');
    expect(JSON.parse(String(calledRequest?.body))).toMatchObject({
      model: 'music-2.6-free',
      prompt: '',
      is_instrumental: true,
      stream: false,
    });
  });

  it('reports MiniMax authentication failures embedded in a 200 response', async () => {
    const result = await testProviderConnection(
      endpoint('minimax', 'https://api.minimaxi.com', 'music-2.6-free'),
      async () =>
        jsonResponse(200, {
          base_resp: { status_code: 1004, status_msg: 'token invalid' },
        }),
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('鉴权失败');
  });

  it('uses the ElevenLabs account endpoint for a cost-free check', async () => {
    let calledUrl = '';
    let calledRequest: RequestInit | undefined;
    const fetchMock: typeof fetch = async (input, request) => {
      calledUrl = String(input);
      calledRequest = request;
      return jsonResponse(200, { user_id: 'user' });
    };
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.io', 'music_v2'),
      fetchMock,
    );

    expect(result.status).toBe('success');
    expect(calledUrl).toBe('https://api.elevenlabs.io/v1/user');
    expect(calledRequest).toMatchObject({
      method: 'GET',
      headers: { 'xi-api-key': 'test-secret-key' },
    });
  });

  it('distinguishes valid credentials with unavailable billing', async () => {
    const result = await testProviderConnection(
      endpoint('stability', 'https://api.stability.ai', 'stable-audio-3'),
      async () => jsonResponse(402, { message: 'payment required' }),
    );

    expect(result.status).toBe('warning');
    expect(result.message).toContain('余额或套餐');
  });

  it('treats validation errors from generation probes as connected', async () => {
    const result = await testProviderConnection(
      endpoint('mureka', 'https://api.mureka.ai', 'mureka-9'),
      async () => jsonResponse(422, { detail: 'n must be greater than zero' }),
    );

    expect(result.status).toBe('success');
    expect(result.message).toContain('未触发素材生成');
  });

  it('rejects an unconfigured Google Lyria project URL before networking', async () => {
    const fetchMock = vi.fn();
    const result = await testProviderConnection(
      endpoint(
        'google-lyria',
        'https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/us-central1/publishers/google/models',
        'lyria-002',
      ),
      fetchMock as typeof fetch,
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('PROJECT_ID');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function endpoint(
  provider: ProviderEndpoint['provider'],
  baseUrl: string,
  model: string,
): ProviderEndpoint {
  return {
    provider,
    baseUrl,
    model,
    apiKey: 'test-secret-key',
  };
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
