import { describe, expect, it, vi } from 'vitest';
import { runVisualSampleMilestone } from './visualSampleMilestone.js';

const good = { ok: true, findings: [], sourceHash: 'source-a', buildId: 'build-a', artifactHash: 'artifact-a', evidencePath: 'host/report.json' };
function setup() {
  return { validate: vi.fn(async () => structuredClone(good)), review: vi.fn(async () => ({ ok: true, findings: [] as string[] })),
    implement: vi.fn(), accept: vi.fn(), fingerprint: vi.fn(async () => 'source-a'), assertActive: vi.fn(), progress: vi.fn() };
}
describe('visual sample scheduling barrier', () => {
  it('reviews real evidence before accepting a checkpoint', async () => {
    const s = setup(); await runVisualSampleMilestone(s);
    expect(s.accept).toHaveBeenCalledWith(good); expect(s.implement).not.toHaveBeenCalled();
    expect(s.accept.mock.invocationCallOrder[0]).toBeGreaterThan(s.review.mock.invocationCallOrder[0]!);
  });
  it('does not request aesthetic review before bindings pass', async () => {
    const s = setup(); s.validate.mockResolvedValue({ ...good, ok: false, findings: ['oversized'] } as typeof good);
    await expect(runVisualSampleMilestone(s)).rejects.toThrow('没有进展');
    expect(s.review).not.toHaveBeenCalled(); expect(s.accept).not.toHaveBeenCalled(); expect(s.implement).toHaveBeenCalledOnce();
  });
  it('repairs a rejected screenshot then refreshes host evidence and review', async () => {
    const s = setup(); s.review.mockResolvedValueOnce({ ok: false, findings: ['background seam'] });
    await runVisualSampleMilestone(s);
    expect(s.implement).toHaveBeenCalledWith(1, ['background seam']); expect(s.validate).toHaveBeenCalledTimes(2);
    expect(s.review).toHaveBeenCalledTimes(2); expect(s.accept).toHaveBeenCalledOnce();
  });
  it('rejects edits during read-only review and does not save a stale checkpoint', async () => {
    const s = setup(); s.fingerprint.mockResolvedValue('source-b');
    await expect(runVisualSampleMilestone(s)).rejects.toThrow('源码已变化'); expect(s.accept).not.toHaveBeenCalled();
  });
  it('does not accept missing identity even if numeric checks claim pass', async () => {
    const s = setup(); s.validate.mockResolvedValue({ ...good, artifactHash: '' });
    await expect(runVisualSampleMilestone(s)).rejects.toThrow(); expect(s.review).not.toHaveBeenCalled(); expect(s.accept).not.toHaveBeenCalled();
  });
  it('retains hard findings when a validator inconsistently reports ok', async () => {
    const s = setup(); s.validate.mockResolvedValue({ ...good, findings: ['missing glyph'] } as typeof good);
    await expect(runVisualSampleMilestone(s)).rejects.toThrow('missing glyph');
    expect(s.review).not.toHaveBeenCalled(); expect(s.accept).not.toHaveBeenCalled();
  });
  it('stop after review prevents both checkpoint and subsequent content', async () => {
    const s = setup(); s.review.mockImplementation(async () => {
      s.assertActive.mockImplementation(() => { throw Error('stopped'); }); return { ok: true, findings: [] };
    });
    await expect(runVisualSampleMilestone(s)).rejects.toThrow('stopped'); expect(s.accept).not.toHaveBeenCalled();
  });
  it('bounds changing failures at two writer passes', async () => {
    const s = setup(); let n = 0;
    s.review.mockImplementation(async () => ({ ok: false, findings: [`failure-${++n}`] }));
    await expect(runVisualSampleMilestone(s)).rejects.toThrow('停止内容扩展'); expect(s.implement).toHaveBeenCalledTimes(2);
  });
});

it('preserves repair budget when the host cannot allocate runtime memory', async () => {
 const s = setup();
 s.validate.mockResolvedValue({ ...good, ok: false, findings: ['Failed to allocate memory'] } as typeof good);
 await expect(runVisualSampleMilestone(s)).rejects.toThrow('运行资源故障');
 expect(s.implement).not.toHaveBeenCalled(); expect(s.review).not.toHaveBeenCalled(); expect(s.accept).not.toHaveBeenCalled();
});
