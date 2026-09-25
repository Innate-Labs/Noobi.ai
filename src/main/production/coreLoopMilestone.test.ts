import { describe, expect, it, vi } from 'vitest';
import { runCoreLoopMilestone } from './coreLoopMilestone.js';

function setup(validate = vi.fn(async () => ({ ok: true, findings: [] as string[] }))) {
  return { validate, implement: vi.fn(async (_attempt: number, _findings: string[]) => {}),
    progress: vi.fn(), assertActive: vi.fn() };
}

describe('core-loop production barrier', () => {
  it('revalidates an existing loop and reuses it without another implementation turn', async () => {
    const s = setup();
    await runCoreLoopMilestone(s);
    expect(s.validate).toHaveBeenCalledOnce();
    expect(s.implement).not.toHaveBeenCalled();
    expect(s.progress).toHaveBeenLastCalledWith('passed', expect.stringContaining('仍需验收'));
  });
  it('requires fresh host evidence after every repair before permitting full production', async () => {
    const s = setup(vi.fn().mockResolvedValueOnce({ ok: false, findings: ['No win'] })
      .mockResolvedValueOnce({ ok: true, findings: [] }));
    await runCoreLoopMilestone(s);
    expect(s.implement).toHaveBeenCalledWith(1, ['No win']);
    expect(s.validate).toHaveBeenCalledTimes(2);
    expect(s.validate.mock.invocationCallOrder[1]).toBeGreaterThan(s.implement.mock.invocationCallOrder[0]!);
  });
  it('stops unchanged failures without spending the second repair', async () => {
    const s = setup(vi.fn(async () => ({ ok: false, findings: ['Invisible platform'] })));
    await expect(runCoreLoopMilestone({ ...s, fingerprint: async () => 'same' })).rejects.toThrow('没有进展');
    expect(s.implement).toHaveBeenCalledOnce();
    expect(s.progress).not.toHaveBeenCalledWith('passed', expect.anything());
  });
  it('bounds repairs even when the writer keeps changing files or the failure', async () => {
    const s = setup(vi.fn(async () => ({ ok: false, findings: ['Missing terminal state'] })));
    await expect(runCoreLoopMilestone(s)).rejects.toThrow('两次有界修复');
    expect(s.implement).toHaveBeenCalledTimes(2);
  });
  it('does not start writing after a stop during validation', async () => {
    const s = setup(vi.fn(async () => ({ ok: false, findings: ['No manifest'] })));
    s.assertActive.mockImplementationOnce(() => {}).mockImplementation(() => { throw new Error('Stopped'); });
    await expect(runCoreLoopMilestone(s)).rejects.toThrow('Stopped');
    expect(s.implement).not.toHaveBeenCalled();
  });
});

it('does not spend a code-repair attempt on resource exhaustion', async () => {
 const s = setup(vi.fn(async () => ({ ok: false, findings: ['Failed to allocate memory'] })));
 await expect(runCoreLoopMilestone(s)).rejects.toThrow('运行资源故障');
 expect(s.implement).not.toHaveBeenCalled();
});
