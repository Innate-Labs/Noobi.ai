import { describe, expect, it, vi } from 'vitest';
import { CodexAppServer } from './codexAppServer.js';

describe('Codex planning turn cancellation', () => {
  it('does not start a turn when its request is already cancelled', async () => {
    const runtime = new CodexAppServer();
    const start = vi.spyOn(runtime, 'startTurn');
    const controller = new AbortController(); controller.abort();
    await expect(runtime.runTurn({ threadId: 'thread', prompt: 'plan', signal: controller.signal })).rejects.toThrow();
    expect(start).not.toHaveBeenCalled();
  });
  it('interrupts an active server turn and rejects its pending result', async () => {
    const runtime = new CodexAppServer();
    vi.spyOn(runtime, 'startTurn').mockResolvedValue('turn');
    const interrupt = vi.spyOn(runtime, 'interruptTurn').mockResolvedValue();
    const controller = new AbortController();
    const turn = runtime.runTurn({ threadId: 'thread', prompt: 'plan', signal: controller.signal });
    const rejected = expect(turn).rejects.toThrow('取消');
    await Promise.resolve(); controller.abort(); await rejected;
    expect(interrupt).toHaveBeenCalledExactlyOnceWith('thread', 'turn');
  });
  it('interrupts a turn when cancellation races with the server accepting it', async () => {
    const runtime = new CodexAppServer(); const controller = new AbortController();
    vi.spyOn(runtime, 'startTurn').mockImplementation(async () => { controller.abort(); return 'late-turn'; });
    const interrupt = vi.spyOn(runtime, 'interruptTurn').mockResolvedValue();
    await expect(runtime.runTurn({ threadId: 'thread', prompt: 'plan', signal: controller.signal })).rejects.toThrow();
    expect(interrupt).toHaveBeenCalledExactlyOnceWith('thread', 'late-turn');
  });
});
