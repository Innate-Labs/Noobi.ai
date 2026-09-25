import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanStore } from './planStore.js';
import { PlanStarter } from './planStarter.js';
import type { PlanVersion, StartPlanInput } from '../shared/planning.js';
import type { ProjectRecord } from '../shared/contracts.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'noobi-plans-')); dirs.push(root);
  const file = join(root, 'plans.json'); const store = new PlanStore(file); await store.init();
  return { store, file };
}
export function version(id = 'version-1'): PlanVersion {
  return { id, number: 1, createdAt: new Date().toISOString(), requirements: [{ id: 'R001', text: '真实 3D 森林探索' }],
    options: [{ id: 'option-1', title: '森林路线', approach: '探索', engine: 'godot', dimension: '3d', platform: 'web',
      coreLoop: ['探索', '收集', '返回'], features: ['镜头', '道具', '出口'], assumptions: ['单人'], exclusions: ['联网'], requirementIds: ['R001'], estimate: { timeRange: null, costRange: null, basis: '尚无实测' } }],
    model: 'test-model', threadId: 'thread-1', turnId: 'turn-1', analysisDurationMs: 20, analysisUsage: null };
}
async function ready(store: PlanStore) {
  const d = await store.create({ request: '真实 3D 森林探索' });
  await store.finish(d.id, d.attemptId, version(), null);
  return { draftId: d.id, versionId: 'version-1', optionId: 'option-1' } satisfies StartPlanInput;
}
describe('PlanStore and production reservation', () => {
  it('rejects missing selection and stale versions before creating a project', async () => {
    const { store } = await setup(); const input = await ready(store);
    const prepare = vi.fn(); const starter = new PlanStarter(store, { prepare, dispatch: vi.fn(), getProject: vi.fn() });
    await expect(starter.start(undefined as any)).rejects.toThrow('选择方案');
    await expect(starter.start({ ...input, versionId: 'old' })).rejects.toThrow('版本');
    await expect(starter.start({ ...input, optionId: 'invented' })).rejects.toThrow('请选择');
    expect(prepare).not.toHaveBeenCalled();
  });
  it('atomically persists the selected version before one dispatch, including duplicate clicks and restart', async () => {
    const { store, file } = await setup(); const input = await ready(store);
    const project = { id: 'game-1' } as ProjectRecord;
    const prepare = vi.fn(async () => project);
    const dispatch = vi.fn(async (_project, draft) => {
      const disk = JSON.parse(await readFile(file, 'utf8')).drafts[0];
      expect(disk.run.versionId).toBe('version-1'); expect(disk.run.projectId).toBe('game-1');
      expect(draft.run.prompt).toContain('真实 3D 森林探索'); expect(draft.run.prompt).toContain('森林路线');
      return project;
    });
    const dependencies = { prepare, dispatch, getProject: vi.fn(async () => project) };
    const starter = new PlanStarter(store, dependencies);
    await Promise.all([starter.start(input), starter.start(input), starter.start(input)]);
    expect(prepare).toHaveBeenCalledTimes(1); expect(dispatch).toHaveBeenCalledTimes(1);
    const reopened = new PlanStore(file); await reopened.init();
    await new PlanStarter(reopened, dependencies).start(input);
    expect(dispatch).toHaveBeenCalledTimes(1);
    await expect(reopened.retry(input.draftId)).rejects.toThrow('已经启动');
  });
  it('rejects another option while the first selection is starting', async () => {
    const { store } = await setup(); const d = await store.create({ request: '3D 森林' });
    const v = version(); v.options.push({ ...v.options[0]!, id: 'option-2', title: '第二方案' });
    await store.finish(d.id, d.attemptId, v, null);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const project = { id: 'game' } as ProjectRecord;
    const prepare = vi.fn(async () => { await gate; return project; });
    const starter = new PlanStarter(store, { prepare, dispatch: vi.fn(async () => project), getProject: vi.fn() });
    const input = { draftId: d.id, versionId: v.id, optionId: 'option-1' };
    const first = starter.start(input);
    await expect(starter.start({ ...input, optionId: 'option-2' })).rejects.toThrow('另一方案');
    release(); await first; expect(prepare).toHaveBeenCalledTimes(1);
  });
  it('refuses a stale choice while regeneration wins the race', async () => {
    const { store } = await setup(); const input = await ready(store);
    const regenerated = await store.retry(input.draftId);
    await expect(store.reserve(input)).rejects.toThrow('版本');
    await store.finish(input.draftId, regenerated.attemptId, version('version-2'), null);
    await expect(store.reserve(input)).rejects.toThrow('版本');
    expect((await store.reserve({ ...input, versionId: 'version-2' })).fresh).toBe(true);
  });
  it('keeps cancellation authoritative over a late model response and accepts a new attempt', async () => {
    const { store } = await setup(); const d = await store.create({ request: '3D 森林' });
    await store.cancel(d.id); await store.finish(d.id, d.attemptId, version(), null);
    expect((await store.get(d.id)).status).toBe('cancelled');
    const retry = await store.retry(d.id);
    await store.finish(d.id, d.attemptId, version('late'), null);
    expect((await store.get(d.id)).status).toBe('generating');
    await store.finish(d.id, retry.attemptId, version(), null);
    expect((await store.get(d.id)).status).toBe('ready');
  });
  it('recovers interrupted planning and never automatically replays a reserved run', async () => {
    const { store, file } = await setup(); const input = await ready(store); await store.reserve(input);
    const generating = await store.create({ request: '未完成的规划' });
    const reopened = new PlanStore(file); await reopened.init();
    expect((await reopened.get(input.draftId)).run?.status).toBe('interrupted');
    expect((await reopened.get(generating.id)).status).toBe('failed');
    const dispatch = vi.fn(); const starter = new PlanStarter(reopened, { dispatch, prepare: vi.fn(), getProject: vi.fn() });
    await expect(starter.start(input)).rejects.toThrow('中断'); expect(dispatch).not.toHaveBeenCalled();
  });
  it('does not replay when a dispatch fails after a project was created', async () => {
    const { store } = await setup(); const input = await ready(store);
    const prepare = vi.fn(async () => ({ id: 'preserved-project' } as ProjectRecord));
    const dispatch = vi.fn(async () => { throw new Error('环境不可用'); });
    const starter = new PlanStarter(store, { prepare, dispatch, getProject: vi.fn() });
    await expect(starter.start(input)).rejects.toThrow('环境不可用');
    await expect(starter.start(input)).rejects.toThrow('环境不可用');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect((await store.get(input.draftId)).run?.projectId).toBe('preserved-project');
  });
});
