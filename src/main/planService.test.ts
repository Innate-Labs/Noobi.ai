import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanService, parsePlanOptions, requirementsFor } from './planService.js';
import { PlanStore } from './planStore.js';
import type { PlanDraft } from '../shared/planning.js';
const context = { cwd: '/tmp/planning', godotAvailable: true };
const request = '制作第三人称 3D 游戏。浏览器游玩';
const draft = { request, projectId: null };
function response() {
  const option = { title: '林间探索', approach: '以收集为核心', engine: 'godot', dimension: '3d', platform: 'web', coreLoop: ['探索', '收集', '回家'], features: ['移动', '相机', '交互'], assumptions: ['键鼠'], exclusions: ['多人'], requirementIds: ['R001', 'R002'], estimate: { timeRange: null, costRange: null, basis: '暂无实测' } };
  return { options: [option, { ...option, title: '机关冒险', approach: '以解谜为核心', coreLoop: ['发现机关', '调整顺序', '打开出口'] }] };
}
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
describe('plan schema and hard requirements', () => {
  it('preserves stable requirement IDs, concrete routes, and unknown cost estimates', () => {
    expect(requirementsFor(request).map(r => r.id)).toEqual(['R001', 'R002']);
    expect(parsePlanOptions(JSON.stringify(response()), draft, context)).toHaveLength(2);
  });
  it.each(['', 'not json', '{}', '{"options":[]}', '{"unsupportedReason":"联网多人未支持"}'])('rejects invalid/unsupported responses: %s', text => {
    expect(() => parsePlanOptions(text, draft, context)).toThrow();
  });
  it('rejects 2D substitutions, missing requirements, duplicate routes and invented prices', () => {
    for (const mutate of [
      (r: any) => r.options[0].dimension = '2d',
      (r: any) => r.options[0].requirementIds = ['R001'],
      (r: any) => r.options[1].coreLoop = r.options[0].coreLoop,
      (r: any) => r.options[0].estimate.costRange = [1, 2],
      (r: any) => r.options[0].platform = 'desktop',
    ]) { const r = response(); mutate(r); expect(() => parsePlanOptions(JSON.stringify(r), draft, context)).toThrow(); }
  });
  it('does not silently downgrade when Godot is unavailable or migrate an existing engine', () => {
    expect(() => parsePlanOptions(JSON.stringify(response()), draft, { ...context, godotAvailable: false })).toThrow('Godot');
    expect(() => parsePlanOptions(JSON.stringify(response()), draft, { ...context, engine: 'web' })).toThrow('引擎');
  });
  it('preserves explicit 3D from the existing game during a small change', () => {
    const r = response(); r.options[0]!.dimension = '2d';
    r.options.forEach(option => { option.requirementIds = ['R001']; });
    expect(() => parsePlanOptions(JSON.stringify(r), { request: '降低速度', projectId: 'existing' }, { ...context, projectBrief: '第三人称 3D 冒险' })).toThrow('3D');
  });
  it('requires multiple new-game options but permits a narrow existing-project adjustment', () => {
    const r = response(); r.options = [r.options[0]!];
    expect(() => parsePlanOptions(JSON.stringify(r), draft, context)).toThrow('2–3');
    r.options[0]!.requirementIds = ['R001'];
    expect(parsePlanOptions(JSON.stringify(r), { request: '降低速度', projectId: 'existing' }, context)).toHaveLength(1);
  });
});
describe('planning lifecycle', () => {
  async function setup(runTurn: any) {
    const dir = await mkdtemp(join(tmpdir(), 'noobi-plan-service-')); dirs.push(dir);
    const store = new PlanStore(join(dir, 'plans.json')); await store.init();
    const runtime = { startThread: vi.fn(async () => 'thread'), runTurn, unsubscribeThread: vi.fn(async () => {}) };
    const service = new PlanService(store, runtime, async () => context);
    const d = await store.create({ request }); return { store, service, runtime, d };
  }
  it('uses only a read-only ephemeral planning turn and persists a validated response', async () => {
    const { store, service, runtime, d } = await setup(vi.fn(async () => ({ status: 'completed', turnId: 'turn', text: JSON.stringify(response()) })));
    await service.generate(d);
    expect(runtime.startThread).toHaveBeenCalledWith(expect.objectContaining({ sandbox: 'read-only', approvalPolicy: 'never', ephemeral: true }));
    const saved = await store.get(d.id); expect(saved.status).toBe('ready'); expect(saved.run).toBeNull(); expect(saved.version?.options).toHaveLength(2);
  });
  it('persists timeout errors for retry instead of fabricating options', async () => {
    const { store, service, d } = await setup(vi.fn(async () => { throw new Error('timed out'); }));
    await service.generate(d); const saved = await store.get(d.id);
    expect(saved.status).toBe('failed'); expect(saved.version).toBeNull();
    expect(saved.analysisAttempts[0]?.status).toBe('failed');
    expect(saved.analysisAttempts[0]?.usage).toBeNull();
    expect((await store.retry(d.id)).status).toBe('generating');
  });
  it('aborts the model request when cancelled and discards late answers', async () => {
    let signal: AbortSignal | undefined; let finish: (() => void) | undefined;
    const { store, service, d } = await setup(vi.fn(async (options: any) => {
      signal = options.signal; await new Promise<void>(r => { finish = r; });
      return { status: 'completed', turnId: 'turn', text: JSON.stringify(response()) };
    }));
    const running = service.generate(d); await vi.waitFor(() => expect(signal).toBeDefined());
    await service.cancel(d.id); expect(signal?.aborted).toBe(true); finish!(); await running;
    expect((await store.get(d.id)).status).toBe('cancelled'); expect((await store.get(d.id)).version).toBeNull();
  });
});
