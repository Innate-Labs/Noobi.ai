import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdKeyboardInput } from './heldKeyboardInput.js';

afterEach(() => vi.useRealTimers());
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Aborted')); }, { once: true });
});

describe('real-input timing independent of screenshots', () => {
  it('releases a held key on time even when a screenshot takes longer than the hold', async () => {
    vi.useFakeTimers();
    const events: Array<[string, number]> = [];
    const signal = new AbortController().signal;
    const started = Date.now();
    const capture = vi.fn(async () => { await sleep(500, signal); });
    const run = holdKeyboardInput({ holdMs: 300, signal, sleep, capture,
      down: repeat => events.push([repeat ? 'repeat' : 'down', Date.now() - started]),
      up: () => events.push(['up', Date.now() - started]),
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(events).toEqual([['down', 0], ['up', 300]]);
    await vi.advanceTimersByTimeAsync(400);
    expect(await run).toBe(true);
    expect(capture).toHaveBeenCalledOnce();
    expect(events).toHaveLength(2);
  });

  it('captures both intervals for a fast capture and releases exactly once', async () => {
    vi.useFakeTimers();
    const down = vi.fn(); const up = vi.fn(); const capture = vi.fn(async () => {});
    const run = holdKeyboardInput({ holdMs: 300, signal: new AbortController().signal, sleep, down, up, capture });
    await vi.advanceTimersByTimeAsync(300);
    expect(await run).toBe(true);
    expect(capture.mock.calls).toEqual([[1], [2]]);
    expect(down.mock.calls).toEqual([[false], [true]]);
    expect(up).toHaveBeenCalledOnce();
  });

  it('releases on cancellation and never leaves a key stuck', async () => {
    vi.useFakeTimers();
    const controller = new AbortController(); const up = vi.fn();
    const run = holdKeyboardInput({ holdMs: 500, signal: controller.signal, sleep, down: vi.fn(), up });
    const rejected = expect(run).rejects.toThrow('Aborted');
    controller.abort();
    await rejected;
    expect(up).toHaveBeenCalledOnce();
  });
});
