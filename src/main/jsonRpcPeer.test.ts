import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { JsonRpcPeer, JsonRpcRequestError } from './jsonRpcPeer.js';

function makePeer() {
  const input = new PassThrough();
  const output = new PassThrough();
  output.setEncoding('utf8');
  const peer = new JsonRpcPeer(input, output);
  peer.start();
  return { input, output, peer };
}

describe('JsonRpcPeer', () => {
  it('matches a response with its pending request', async () => {
    const { input, output, peer } = makePeer();
    const written = new Promise<string>((resolve) => output.once('data', resolve));
    const pending = peer.request<{ ok: boolean }>('account/read', { refreshToken: false });

    const request = JSON.parse(await written) as { id: number; method: string };
    expect(request.method).toBe('account/read');
    input.write(`${JSON.stringify({ id: request.id, result: { ok: true } })}\n`);

    await expect(pending).resolves.toEqual({ ok: true });
    peer.close();
  });

  it('decodes notifications and interleaved server requests', async () => {
    const { input, peer } = makePeer();
    const notification = vi.fn();
    const serverRequest = vi.fn();
    peer.on('notification', notification);
    peer.on('serverRequest', serverRequest);

    input.write('{"method":"turn/started","params":{"turnId":"turn-1"}}\n');
    input.write('{"id":"approval-1","method":"item/commandExecution/requestApproval","params":{}}\n');

    await new Promise((resolve) => setImmediate(resolve));
    expect(notification).toHaveBeenCalledWith({
      method: 'turn/started',
      params: { turnId: 'turn-1' },
    });
    expect(serverRequest).toHaveBeenCalledWith({
      id: 'approval-1',
      method: 'item/commandExecution/requestApproval',
      params: {},
    });
    peer.close();
  });

  it('rejects protocol errors returned by App Server', async () => {
    const { input, output, peer } = makePeer();
    const written = new Promise<string>((resolve) => output.once('data', resolve));
    const pending = peer.request('thread/start');
    const request = JSON.parse(await written) as { id: number };
    input.write(`${JSON.stringify({
      id: request.id,
      error: { code: -32602, message: 'invalid params' },
    })}\n`);

    await expect(pending).rejects.toBeInstanceOf(JsonRpcRequestError);
    peer.close();
  });

  it('reports malformed JSON without terminating the stream', async () => {
    const { input, peer } = makePeer();
    const protocolError = vi.fn();
    const notification = vi.fn();
    peer.on('protocolError', protocolError);
    peer.on('notification', notification);

    input.write('{not-json}\n');
    input.write('{"method":"warning","params":{"message":"still alive"}}\n');
    await new Promise((resolve) => setImmediate(resolve));

    expect(protocolError).toHaveBeenCalledOnce();
    expect(notification).toHaveBeenCalledOnce();
    peer.close();
  });
});
