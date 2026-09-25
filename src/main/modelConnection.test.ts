import { describe, expect, it } from 'vitest';
import { connectionRetryDelay, modelConnectionFailure } from './modelConnection.js';
import { notificationToEvent } from './eventMapper.js';

describe('model connection classification', () => {
  it.each([
    'Falling back from WebSockets to HTTPS transport. stream disconnected before completion: URL error: Proxy connection failed: HTTP CONNECT failed with status 503',
    'Reconnecting... waiting for network', 'TLS handshake EOF', 'ECONNREFUSED', 'HTTP 502 Bad Gateway',
    { message: 'retry', codexErrorInfo: { responseStreamConnectionFailed: { httpStatusCode: 503 } } },
    { message: '', codexErrorInfo: 'responseStreamDisconnected' },
  ])('recognizes a recoverable transport failure: %j', value => expect(modelConnectionFailure(value)).not.toBeNull());
  it.each(['HTTP 401 unauthorized', 'HTTP CONNECT failed with status 407', 'Reconnecting: quota exceeded',
    'HTTP 429 rate limit', 'invalid api key', 'Assertion failed', 'model gpt-test is not supported',
    { message: 'stream disconnected', codexErrorInfo: { httpConnectionFailed: { httpStatusCode: 403 } } },
  ])('rejects a non-network failure: %j', value => expect(modelConnectionFailure(value)).toBeNull());
  it('caps retries and labels the screenshot error as recovery rather than a game-code failure', () => {
    expect([1, 2, 3, 4, 5, 10000].map(connectionRetryDelay)).toEqual([5000, 10000, 20000, 40000, 60000, 60000]);
    expect(notificationToEvent({ method: 'error', params: { error: { message: 'HTTP CONNECT failed with status 503' } } },
      { projectId: 'p', role: 'implementer' }, 'code')).toMatchObject({ kind: 'lifecycle', title: '实现 Agent · 网络重连中' });
  });
});
