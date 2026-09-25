import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CodexAppServer, StartThreadOptions, StartTurnOptions } from './codexAppServer.js';
import { JsonRpcRequestError } from './jsonRpcPeer.js';
import { CONNECTION_RETRY_TIMEOUT_MS, GameHarness, GameHarnessConnectionError, GameHarnessStoppedError, GameHarnessTurnTimeoutError } from './gameHarness.js';

class Runtime extends EventEmitter {
  threads: StartThreadOptions[] = [];
  turns: StartTurnOptions[] = [];
  active = new Map<string, string>();
  interrupts = 0;
  stops = 0;
  confirmInterrupt = true;
  async startThread(options: StartThreadOptions) { this.threads.push(options); return `thread-${this.threads.length}`; }
  async startTurn(options: StartTurnOptions) {
    if (this.active.has(options.threadId)) throw new Error('A second writer started before the first stopped');
    this.turns.push(options);
    const id = `turn-${this.turns.length}`;
    this.active.set(options.threadId, id);
    return id;
  }
  async unsubscribeThread() {}
  async stop() { this.stops++; this.active.clear(); this.emit('status', { state: 'stopped' }); }
  notify(method: string, fields: Record<string, unknown> = {}) {
    const threadId = this.turns.at(-1)!.threadId;
    this.emit('notification', { method, params: { threadId, turnId: this.active.get(threadId), ...fields } });
  }
  complete(text = '', status = 'completed', error?: unknown) {
    const threadId = this.turns.at(-1)!.threadId;
    const id = this.active.get(threadId)!;
    if (status === 'completed') this.notify('item/completed', { item: { type: 'agentMessage', text } });
    this.active.delete(threadId);
    this.notify('turn/completed', { turnId: id, turn: { id, status, error } });
  }
  async interruptTurn(threadId: string, turnId: string) {
    this.interrupts++;
    if (this.confirmInterrupt) {
      this.active.delete(threadId);
      this.emit('notification', { method: 'turn/completed', params: { threadId, turnId, turn: { id: turnId, status: 'interrupted' } } });
    }
  }
}

afterEach(() => vi.useRealTimers());
async function start() {
  vi.useFakeTimers();
  const runtime = new Runtime();
  const harness = new GameHarness(runtime as unknown as CodexAppServer);
  const events: Array<{ method: string; message: string }> = [];
  const states: Array<{ state: string; phase: string; error: string | null }> = [];
  harness.on('event', e => events.push(e));
  harness.on('state', e => states.push(e));
  const result = harness.run({ projectId: 'pilot', cwd: '/tmp/noobi-pilot', prompt: 'Build a game',
    model: 'gpt-6-astra', effort: 'medium', imageGenerationRoute: 'configured-api' }).catch(error => error);
  await vi.advanceTimersByTimeAsync(0);
  return { runtime, harness, result, events, states };
}
const network = { message: 'Proxy connection failed: HTTP CONNECT failed with status 503' };

describe('automatic model reconnection', () => {
  it('ends a stuck native retry, waits, then continues the same thread without starting a repair', async () => {
    const { runtime, harness, result, events, states } = await start();
    runtime.notify('error', { willRetry: true, error: { message: 'Reconnecting... 2/5' } });
    await vi.advanceTimersByTimeAsync(40_000);
    runtime.notify('warning', { turnId: undefined, message: 'stream disconnected before completion: tls handshake eof' });
    runtime.notify('error', { willRetry: true, error: { message: 'Reconnecting... waiting for network' } });
    await vi.advanceTimersByTimeAsync(CONNECTION_RETRY_TIMEOUT_MS - 40_000);
    expect(runtime.interrupts).toBe(1);
    expect(runtime.turns).toHaveLength(1);
    expect(harness.isRunning('pilot')).toBe(true);
    expect(events.find(e => e.method === 'harness/connection/waiting')?.message).toContain('tls handshake eof');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runtime.turns).toHaveLength(2);
    expect(runtime.turns[1]).toMatchObject({ threadId: 'thread-1', model: 'gpt-6-astra', effort: 'medium', approvalPolicy: 'never' });
    expect(runtime.turns[1]!.prompt).toContain('<network_recovery>');
    expect(states.some(s => s.state === 'failed')).toBe(false);
    expect(events.some(e => e.method.startsWith('harness/repair'))).toBe(false);
    await harness.stop('pilot');
    expect(await result).toBeInstanceOf(GameHarnessStoppedError);
    expect(runtime.listenerCount('notification')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears retries only on real model progress, not heartbeats or echoed user input', async () => {
    const { runtime, harness, result, events } = await start();
    runtime.notify('error', { error: network });
    await vi.advanceTimersByTimeAsync(20_000);
    runtime.notify('turn/started');
    runtime.notify('item/started', { item: { type: 'userMessage' } });
    runtime.notify('item/agentMessage/delta', { delta: 'I can inspect the workspace now.' });
    await vi.advanceTimersByTimeAsync(CONNECTION_RETRY_TIMEOUT_MS);
    expect(runtime.interrupts).toBe(0);
    expect(events.filter(e => e.method === 'harness/connection/restored')).toHaveLength(1);
    await harness.stop('pilot');
    expect(await result).toBeInstanceOf(GameHarnessStoppedError);
  });

  it('does not let empty deltas or reasoning metadata extend a dead connection', async () => {
    const { runtime, harness, result } = await start();
    runtime.notify('error', { error: network });
    await vi.advanceTimersByTimeAsync(40_000);
    runtime.notify('item/agentMessage/delta', { delta: '' });
    runtime.notify('item/reasoning/summaryTextDelta', { delta: '   ' });
    runtime.notify('item/reasoning/summaryPartAdded');
    runtime.notify('item/started', { item: { type: 'reasoning' } });
    await vi.advanceTimersByTimeAsync(CONNECTION_RETRY_TIMEOUT_MS - 40_000);
    expect(runtime.interrupts).toBe(1);
    await harness.stop('pilot');
    expect(await result).toBeInstanceOf(GameHarnessStoppedError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps tool output and another turn’s error outside transport recovery', async () => {
    const { runtime, harness, result } = await start();
    runtime.notify('item/completed', { item: { type: 'commandExecution', output: 'TLS handshake failed in a test fixture' } });
    runtime.notify('error', { turnId: 'old-turn', error: { message: 'waiting for network' } });
    runtime.notify('warning', { turnId: 'old-turn', message: 'TLS handshake failed' });
    runtime.notify('error', { error: { message: 'A script assertion failed', codexErrorInfo: 'other' } });
    await vi.advanceTimersByTimeAsync(CONNECTION_RETRY_TIMEOUT_MS);
    expect(runtime.interrupts).toBe(0);
    await harness.stop('pilot');
    expect(await result).toBeInstanceOf(GameHarnessStoppedError);
  });

  it('keeps the host work timeout distinct from a network outage', async () => {
    const { runtime, result } = await start();
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(await result).toBeInstanceOf(GameHarnessTurnTimeoutError);
    expect(runtime.interrupts).toBe(1);
    expect(runtime.turns).toHaveLength(1);
  });

  it('continues the interrupted Implementer and finishes all stages without spending a repair attempt', async () => {
    const { runtime, result, events } = await start();
    runtime.complete('Original plan');
    await vi.advanceTimersByTimeAsync(0);
    runtime.notify('item/agentMessage/delta', { delta: 'Files and assets already created.' });
    // Terminal-only error: some transports do not send a preceding error notification.
    runtime.complete('', 'failed', network);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runtime.turns).toHaveLength(3);
    expect(runtime.turns[2]!.threadId).toBe(runtime.turns[1]!.threadId);
    expect(runtime.turns[2]!.approvalPolicy).toBe('on-request');
    expect(runtime.turns[2]!.prompt).toContain('asset-plan ledger');
    expect(runtime.threads).toHaveLength(2);
    runtime.complete('Continued existing implementation');
    await vi.advanceTimersByTimeAsync(0);
    runtime.complete(JSON.stringify({ verdict: 'pass', summary: 'Verified', findings: [] }));
    expect(await result).toMatchObject({ repairAttempts: 0, implementation: { threadId: 'thread-2' } });
    expect(events.some(e => e.method === 'harness/connection/restored')).toBe(true);
    expect(runtime.active.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a prolonged outage with capped backoff until explicitly stopped', async () => {
    const { runtime, harness, result } = await start();
    for (const delay of [5_000, 10_000, 20_000, 40_000, 60_000, 60_000]) {
      const count = runtime.turns.length;
      runtime.complete('', 'failed', network);
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(runtime.turns).toHaveLength(count);
      await vi.advanceTimersByTimeAsync(1);
      expect(runtime.turns).toHaveLength(count + 1);
    }
    runtime.complete('', 'failed', network);
    await vi.advanceTimersByTimeAsync(0);
    await harness.stop('pilot');
    expect(await result).toBeInstanceOf(GameHarnessStoppedError);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(runtime.turns).toHaveLength(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { message: 'HTTP 401: authentication required' },
    { message: 'usage limit reached', codexErrorInfo: 'usageLimitExceeded' },
    { message: 'retry', codexErrorInfo: { httpConnectionFailed: { httpStatusCode: 403 } } },
    { message: 'Script Parse Error' },
  ])('does not retry permanent errors: %j', async error => {
    const { runtime, result } = await start();
    runtime.complete('', 'failed', error);
    expect(await result).toBeInstanceOf(Error);
    expect(await result).not.toBeInstanceOf(GameHarnessConnectionError);
    expect(runtime.turns).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lets an authentication failure supersede earlier network errors', async () => {
    const { runtime, result } = await start();
    runtime.notify('error', { error: network });
    runtime.complete('', 'failed', { message: 'HTTP 401 unauthorized' });
    expect(await result).not.toBeInstanceOf(GameHarnessConnectionError);
    expect(runtime.turns).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never starts a replacement writer if interruption was not confirmed', async () => {
    const { runtime, result } = await start();
    runtime.confirmInterrupt = false;
    runtime.notify('error', { error: network });
    await vi.advanceTimersByTimeAsync(CONNECTION_RETRY_TIMEOUT_MS + 5_000);
    expect(await result).toBeInstanceOf(GameHarnessConnectionError);
    expect((await result).retryable).toBe(false);
    expect(runtime.turns).toHaveLength(1);
    expect(runtime.stops).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a confirmed RPC rejection but never an ambiguous turn/start timeout', async () => {
    const { runtime, harness, result } = await start();
    runtime.complete('', 'failed', network);
    const startTurn = vi.spyOn(runtime, 'startTurn');
    startTurn.mockRejectedValueOnce(new JsonRpcRequestError('turn/start', { code: -32000, message: 'HTTP 503 unavailable' }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(startTurn).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(startTurn).toHaveBeenCalledTimes(2);
    runtime.complete('', 'failed', network);
    startTurn.mockRejectedValueOnce(new Error('turn/start timed out after 30000ms'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await result).message).toContain('turn/start timed out');
    expect(harness.isRunning('pilot')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
