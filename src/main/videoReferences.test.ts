import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleTimes, validateVideoSpec, validateVideoSelection, videoCommand, VideoReferenceStore } from './videoReferenceStore.js';
import { VisualReferenceStore } from './visualReferenceStore.js';
import { PlanStore, approvedPlanPrompt } from './planStore.js';
import { PlanService } from './planService.js';
import type { VideoClip } from '../shared/videoReferences.js';
const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), 'noobi-video-')); roots.push(path); return path; }
afterEach(async () => { await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true }))); });
const clip: VideoClip = { id: `clip-${'a'.repeat(64)}`, source: { id: `video-${'b'.repeat(64)}`, sha256: 'b'.repeat(64), name: 'test.mp4', size: 100, duration: 10, width: 640, height: 360, codec: 'h264', previewUrl: 'file:///test.mp4' }, start: 2, end: 8, processorVersion: 'sample-v1', boundaries: [], limitations: ['抽帧'], frames: [2, 4, 6, 7.9].map((time, i) => ({ id: `frame-${i}`, referenceId: `ref-${String(i).repeat(64)}`, time, sha256: 'c'.repeat(64), thumbnail: '', reason: 'overview' })) };
const spec = { events: [{ start: 2, end: 4, frameIds: ['frame-0', 'frame-1'], observation: '画面中角色改变位置', kind: 'play' as const }], rules: [{ text: '绿色条减少；无法确定消耗公式', basis: 'visible' as const, frameIds: ['frame-0', 'frame-1'] }], unknowns: ['控制按键未知'], adaptation: '保留翻滚和体力，改成探索' };
describe('video references with bounded decoding and temporal evidence', () => {
  it('keeps coverage frames and dense samples around a visual change', () => {
    const bytes = Buffer.alloc(48 * 27 * 3 * 12); bytes.fill(220, 48 * 27 * 3 * 5);
    const samples = sampleTimes(bytes, 10, 16);
    expect(samples.length).toBeLessThanOrEqual(10); expect(samples[0]!.time).toBe(10);
    expect(samples.at(-1)!.time).toBe(15.9); expect(samples.filter(s => s.reason === 'change').map(s => s.time)).toEqual([12.3, 12.5, 12.7]);
    expect(samples.every(s => s.time >= 10 && s.time < 16)).toBe(true);
  });
  it('rejects forged frame sources, out-of-clip events and unlabeled rules', () => {
    expect(validateVideoSpec(spec, clip)).toEqual(spec);
    expect(() => validateVideoSelection({ clipId: '../escape', purpose: 'gameplay' })).toThrow();
    expect(() => validateVideoSpec({ ...spec, events: [{ ...spec.events[0], end: 12 }] }, clip)).toThrow('时间');
    expect(() => validateVideoSpec({ ...spec, events: [{ ...spec.events[0], frameIds: ['frame-3'] }] }, clip)).toThrow('时段');
    expect(() => validateVideoSpec({ ...spec, rules: [{ text: '推测', basis: 'confirmed', frameIds: ['frame-0'] }] }, clip)).toThrow('假设');
    expect(() => validateVideoSpec({ ...spec, rules: [{ ...spec.rules[0], frameIds: ['nonexistent'] }] }, clip)).toThrow('来源');
    expect(() => validateVideoSpec({ ...spec, rules: [{ ...spec.rules[0], frameIds: [] }] }, clip)).toThrow('来源');
    expect(validateVideoSpec({ ...spec, rules: [{ text: '新增探索玩法，没有画面证据', basis: 'hypothesis', frameIds: [] }] }, clip).rules[0]!.frameIds).toEqual([]);
  });
  it('kills timed-out, cancelled or oversized subprocesses before settling', async () => {
    const script = ['-e', 'setInterval(()=>{},1000)'];
    await expect(videoCommand(process.execPath, script, undefined, 100, 30)).rejects.toThrow('超时');
    const abort = new AbortController(); const pending = videoCommand(process.execPath, script, abort.signal); abort.abort();
    await expect(pending).rejects.toThrow('取消');
    await expect(videoCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(4096))'], undefined, 100)).rejects.toThrow('超限');
    await expect(videoCommand('/missing/noobi-codec', [])).rejects.toThrow();
  });
  it('rejects bad video inputs and clears failed processing reservations', async () => {
    const dir = await root(); const images = new VisualReferenceStore(join(dir, 'images'), bytes => ({ png: bytes, thumbnail: bytes }));
    const videos = new VideoReferenceStore(join(dir, 'video'), images);
    await expect(videos.import(join(dir, 'image.png'))).rejects.toThrow('MP4');
    await expect(videos.get('../escape')).rejects.toThrow('ID');
    await expect(videos.prepare({ sourceId: 'invalid', start: 0, end: 10, requestId: randomUUID() })).rejects.toThrow();
    expect(videos.jobs.size).toBe(0);
  });
  it('passes actual temporal image inputs into plans, persists user corrections and blocks stale edits', async () => {
    const dir = await root(); const plans = new PlanStore(join(dir, 'plans.json')); await plans.init();
    let draft = await plans.create({ request: '保留翻滚和体力，改成探索', video: { clipId: clip.id, purpose: 'gameplay' } });
    const result = { videoSpec: spec, options: [1, 2].map(i => ({ title: `探索${i}`, approach: `不同的探索${i}`, engine: 'web', dimension: '2d', platform: 'web', coreLoop: ['出发', `探索${i}`, '返回'], features: ['体力', '翻滚', '探索'], assumptions: ['单人'], exclusions: ['联机'], requirementIds: ['R001'], estimate: { timeRange: null, costRange: null, basis: '未知' } })) };
    const runtime = { startThread: vi.fn(async () => 'thread'), unsubscribeThread: vi.fn(async () => {}), runTurn: vi.fn(async (_input: unknown) => ({ status: 'completed', turnId: 'turn', raw: {}, text: JSON.stringify(result) })) };
    const paths = clip.frames.map(f => join(dir, `${f.id}.png`));
    const service = new PlanService(plans, runtime, async () => ({ cwd: dir, godotAvailable: false, video: { clip, paths } }));
    await service.generate(draft); draft = await plans.get(draft.id);
    expect(draft.status).toBe('ready'); expect((runtime.runTurn.mock.calls[0]![0] as any).imagePaths).toEqual(paths);
    expect(draft.version!.videoInput!.sourceHash).toBe(clip.source.sha256);
    expect(approvedPlanPrompt(draft, draft.version!.options[0]!)).toContain('保留翻滚和体力');
    const duplicate = await plans.create({ request: draft.request, video: draft.video });
    await service.generate(duplicate);
    expect(runtime.runTurn).toHaveBeenCalledTimes(1);
    expect((await plans.get(duplicate.id)).version!.reusedAnalysis!.versionId).toBe(draft.version!.id);
    const changed = await plans.create({ request: draft.request, video: { clipId: clip.id, purpose: 'style' } });
    await service.generate(changed); expect(runtime.runTurn).toHaveBeenCalledTimes(2);
    const old = draft.version!.id;
    draft = await plans.saveVideoSpec({ draftId: draft.id, versionId: old, spec: { ...spec, adaptation: '探索森林，保留体力和翻滚' } }, clip);
    expect(draft.version!.requiresReview).toBe(true);
    await expect(plans.saveVideoSpec({ draftId: draft.id, versionId: old, spec }, clip)).rejects.toThrow();
    draft = await plans.retry(draft.id); await service.generate(draft);
    expect((await plans.get(draft.id)).error).toContain('改变了');
    result.videoSpec = { ...spec, adaptation: '探索森林，保留体力和翻滚' };
    draft = await plans.retry(draft.id); await service.generate(draft);
    expect((await plans.get(draft.id)).version!.videoSpecAuthor).toBe('user');
    const restored = new PlanStore(join(dir, 'plans.json')); await restored.init();
    expect((await restored.get(draft.id)).version!.videoSpec!.adaptation).toBe(result.videoSpec.adaptation);
  });
  it('does not start a text-only fallback if video frames are missing', async () => {
    const dir = await root(); const plans = new PlanStore(join(dir, 'plans.json')); await plans.init();
    const draft = await plans.create({ request: '参考片段', video: { clipId: clip.id, purpose: 'gameplay' } });
    const runtime = { startThread: vi.fn(), runTurn: vi.fn(), unsubscribeThread: vi.fn() };
    await new PlanService(plans, runtime, async () => ({ cwd: dir, godotAvailable: true })).generate(draft);
    expect(runtime.startThread).not.toHaveBeenCalled(); expect((await plans.get(draft.id)).error).toContain('关键帧');
  });
});
