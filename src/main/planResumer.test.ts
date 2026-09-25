import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRecord } from '../shared/contracts.js';
import { latestProjectPlan, type PlanVersion, type ResumeProjectInput } from '../shared/planning.js';
import { PlanStore } from './planStore.js';
import { PlanResumer, continuationPrompt } from './planResumer.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function approved(store: PlanStore, projectId = 'project-1') {
  const draft = await store.create({ request: '保留三维探索、浏览器交付和原有存档', projectId });
  const version: PlanVersion = { id: draft.id, number: 1, createdAt: draft.updatedAt,
    requirements: [{ id: 'R001', text: draft.request }], options: [{ id: 'option-1', title: '原方案',
      approach: '探索', engine: 'godot', dimension: '3d', platform: 'web', coreLoop: ['探索', '修复', '返回'],
      features: ['滑翔'], assumptions: ['单人'], exclusions: ['联网'], requirementIds: ['R001'],
      estimate: { timeRange: null, costRange: null, basis: '待测量' } }],
    model: 'model', threadId: 'planner', turnId: 'turn', analysisDurationMs: 1, analysisUsage: null };
  await store.finish(draft.id, draft.attemptId, version, null);
  await store.reserve({ draftId: draft.id, versionId: version.id, optionId: 'option-1' });
  return store.markRun(draft.id, 'dispatched');
}
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'noobi-resume-')); roots.push(root);
  const file = join(root, 'plans.json'); const store = new PlanStore(file); await store.init();
  const draft = await approved(store);
  const project = { id: 'project-1', status: 'stopped', stage: 'code', threadId: 'existing-implementer' } as ProjectRecord;
  const dispatch = vi.fn(async () => ({ ...project, status: 'running' } as ProjectRecord));
  const dependencies = { getProject: vi.fn(async () => project), dispatch };
  const input: ResumeProjectInput = { projectId: project.id, runId: draft.run!.id, requestId: 'request-1', model: 'model', effort: 'low' };
  return { root, file, store, draft, project, dispatch, dependencies, input, resumer: new PlanResumer(store, dependencies) };
}

describe('explicit approved-plan continuation', () => {
  it('continues the same persisted selection and implementer, recording the attempt before dispatch', async () => {
    const s = await setup();
    s.dispatch.mockImplementation(async () => {
      const disk = JSON.parse(await readFile(s.file, 'utf8')).drafts[0];
      expect(disk.run.resumeAttempts[0].status).toBe('starting');
      return { ...s.project, status: 'running' };
    });
    await s.resumer.resume(s.input);
    const [project, draft] = s.dispatch.mock.calls[0] as unknown as [ProjectRecord, typeof s.draft];
    expect(project.threadId).toBe('existing-implementer');
    expect(draft.run!.id).toBe(s.input.runId);
    expect(continuationPrompt(project, draft)).toContain(s.draft.run!.prompt);
    expect(continuationPrompt(project, draft)).toContain('阶段：code');
    expect((await s.store.get(s.draft.id)).run!.resumeAttempts![0].status).toBe('dispatched');
  });
  it('coalesces rapid clicks and never replays the same request after reopening the store', async () => {
    const s = await setup();
    await Promise.all([s.resumer.resume(s.input), s.resumer.resume(s.input), s.resumer.resume({ ...s.input, requestId: 'double-click' })]);
    expect(s.dispatch).toHaveBeenCalledTimes(1);
    const reopened = new PlanStore(s.file); await reopened.init();
    await new PlanResumer(reopened, s.dependencies).resume(s.input);
    expect(s.dispatch).toHaveBeenCalledTimes(1);
  });
  it('rejects an unapproved project and an obsolete selection without dispatching', async () => {
    const s = await setup();
    await expect(s.resumer.resume({ ...s.input, projectId: 'other-project' })).rejects.toThrow('方案已变化');
    await approved(s.store);
    await expect(s.resumer.resume(s.input)).rejects.toThrow('方案已变化');
    expect(s.dispatch).not.toHaveBeenCalled();
  });
  it('does not fall back to an older plan when the newest selected plan failed', async () => {
    const s = await setup(); const latest = await approved(s.store);
    await s.store.markRun(latest.id, 'failed', '环境不可用');
    expect(latestProjectPlan(await s.store.list(), s.project.id)?.id).toBe(latest.id);
    await expect(s.resumer.resume(s.input)).rejects.toThrow('方案已变化');
    await expect(s.resumer.resume({ ...s.input, runId: latest.run!.id })).rejects.toThrow('有效方案');
    expect(s.dispatch).not.toHaveBeenCalled();
  });
  it.each(['running', 'completed', 'draft'] as const)('does not resume a %s project', async status => {
    const s = await setup(); s.project.status = status;
    await expect(s.resumer.resume(s.input)).rejects.toThrow('已停止');
    expect(s.dispatch).not.toHaveBeenCalled();
  });
  it('records a dispatch failure and requires a fresh explicit request for another attempt', async () => {
    const s = await setup(); s.dispatch.mockRejectedValueOnce(new Error('环境未就绪'));
    await expect(s.resumer.resume(s.input)).rejects.toThrow('环境未就绪');
    await expect(s.resumer.resume(s.input)).rejects.toThrow('环境未就绪');
    expect(s.dispatch).toHaveBeenCalledTimes(1);
    await s.resumer.resume({ ...s.input, requestId: 'request-2' });
    expect(s.dispatch).toHaveBeenCalledTimes(2);
    expect((await s.store.get(s.draft.id)).run!.resumeAttempts!.map(attempt => attempt.status)).toEqual(['failed', 'dispatched']);
  });
  it('marks a pending recovery interrupted on restart without silently dispatching it', async () => {
    const s = await setup(); await s.store.reserveResume(s.input);
    const reopened = new PlanStore(s.file); await reopened.init();
    const resumer = new PlanResumer(reopened, s.dependencies);
    await expect(resumer.resume(s.input)).rejects.toThrow('退出中断');
    expect(s.dispatch).not.toHaveBeenCalled();
    await resumer.resume({ ...s.input, requestId: 'explicit-retry' });
    expect(s.dispatch).toHaveBeenCalledTimes(1);
  });
  it('rejects attempts to inject a new prompt or change an idempotent request', async () => {
    const s = await setup();
    await expect(s.resumer.resume({ ...s.input, prompt: '换成另一款游戏' } as any)).rejects.toThrow('新要求');
    await expect(s.resumer.resume({ ...s.input, requestId: '' })).rejects.toThrow('参数无效');
    await s.resumer.resume(s.input);
    await expect(s.resumer.resume({ ...s.input, model: 'different' })).rejects.toThrow('参数已变化');
    expect(s.dispatch).toHaveBeenCalledTimes(1);
  });
  it('rejects changing the selection settings during an active recovery', async () => {
    const s = await setup(); let release!: () => void;
    s.dispatch.mockImplementation(async () => { await new Promise<void>(resolve => { release = resolve; }); return s.project; });
    const first = s.resumer.resume(s.input);
    await expect(s.resumer.resume({ ...s.input, effort: 'high' })).rejects.toThrow('另一制作请求');
    await vi.waitFor(() => expect(release).toBeTypeOf('function')); release(); await first;
  });
  it('selects by reservation time rather than analysis time, ignoring unselected drafts', async () => {
    const s = await setup(); const other = await approved(s.store);
    const list = await s.store.list(); list[0]!.run!.createdAt = '2999-01-01T00:00:00Z';
    expect(latestProjectPlan(list, s.project.id)?.id).toBe(s.draft.id);
    const unselected = { ...other, id: 'unselected', run: null, updatedAt: '9999-01-01T00:00:00Z' };
    expect(latestProjectPlan([...list, unselected], s.project.id)?.id).toBe(s.draft.id);
  });
});
