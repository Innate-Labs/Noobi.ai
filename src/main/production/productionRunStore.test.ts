import { mkdtemp, readFile, writeFile, rm, mkdir, rename, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProductionRunStore } from './productionRunStore.js';

const roots: string[] = [];
const input = { projectId: 'project', planRunId: 'run', planVersionId: 'version', planTitle: '选定探索方案',
  contractKey: 'policy-1', continuation: false, coreLoop: false, visualSample: false };
const turn = { threadId: 'thread', turnId: 'turn', status: 'completed', text: '已检查工程并安排实现与回归' };
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'noobi-progress-')); roots.push(root);
  const file = join(root, 'runs.json'); const store = new ProductionRunStore(file); await store.init(); return { file, store };
}
describe('durable production progress', () => {
  it('persists completed work, marks in-flight work interrupted on restart and does not replay anything', async () => {
    const { store, file } = await setup(); const { session } = await store.begin(input);
    await store.update(session, { id: 'planner', status: 'completed', turn, sourceHash: 'hash' });
    await store.update(session, { id: 'implementer', status: 'running' });
    const reopened = new ProductionRunStore(file); await reopened.init();
    const progress = (await reopened.read('project'))!;
    expect(progress.status).toBe('interrupted');
    expect(progress.tasks.find(task => task.id === 'planner')!.status).toBe('completed');
    expect(progress.tasks.find(task => task.id === 'implementer')!.status).toBe('interrupted');
    expect(progress.attempts[0]!.finishedAt).not.toBeNull();
    const resumed = await reopened.begin({ ...input, continuation: true });
    expect(resumed.recovery?.planner).toEqual(turn);
    expect(resumed.context).toContain('interrupted');
    expect((await reopened.read('project'))!.attempts).toHaveLength(2);
  });
  it('never reuses previous verification, and keeps old failure evidence in history', async () => {
    const { store } = await setup(); const first = await store.begin(input);
    await store.update(first.session, { id: 'planner', status: 'completed', turn, sourceHash: 'hash' });
    await store.update(first.session, { id: 'implementer', status: 'completed', turn: { ...turn, text: '实现完成' }, sourceHash: 'hash2' });
    await store.update(first.session, { id: 'reviewer', status: 'needs-repair', detail: '碰撞不匹配' });
    await store.finish(first.session, 'failed', '修复未完成');
    const resumed = await store.begin({ ...input, continuation: true });
    expect(resumed.recovery?.implementation?.text).toBe('实现完成');
    const progress = (await store.read('project'))!;
    expect(progress.tasks.find(task => task.id === 'reviewer')!.status).toBe('pending');
    expect(progress.tasks.find(task => task.id === 'delivery')!.status).toBe('pending');
    expect(progress.attempts[0]!.tasks.find(task => task.id === 'reviewer')!.detail).toBe('碰撞不匹配');
    expect(progress.attempts[0]!.error).toBe('修复未完成');
    expect(JSON.stringify(progress)).not.toContain('sourceHash');
  });
  it('invalidates saved output when production rules change and separates selected versions', async () => {
    const { store } = await setup(); const first = await store.begin(input);
    await store.update(first.session, { id: 'planner', status: 'completed', turn, sourceHash: 'hash' });
    await store.finish(first.session, 'interrupted');
    const resumed = await store.begin({ ...input, continuation: true, contractKey: 'new-policy' });
    expect(resumed.recovery).toBeNull();
    await store.finish(resumed.session, 'interrupted');
    const another = await store.begin({ ...input, planRunId: 'new-selection', planVersionId: 'new-version', continuation: true });
    expect(another.recovery).toBeNull(); expect(another.context).toBe('');
    expect((await store.read('project', 'run'))!.attempts).toHaveLength(2);
    expect((await store.read('project'))!.planRunId).toBe('new-selection');
  });
  it('rejects a second active execution and ignores late callbacks from a previous attempt', async () => {
    const { store } = await setup(); const first = await store.begin(input);
    await expect(store.begin(input)).rejects.toThrow('正在执行');
    await store.finish(first.session, 'interrupted');
    const second = await store.begin({ ...input, continuation: true });
    expect(await store.update(first.session, { id: 'delivery', status: 'completed' })).toBeNull();
    expect(await store.finish(first.session, 'completed')).toBeNull();
    expect((await store.read('project'))!.attempts.at(-1)!.id).toBe(second.session.attemptId);
  });
  it('cannot mark an incomplete production run delivered', async () => {
    const { store } = await setup(); const { session } = await store.begin(input);
    await expect(store.finish(session, 'completed')).rejects.toThrow('未完成');
    for (const id of ['planner', 'implementer', 'reviewer', 'delivery'] as const) await store.update(session, { id, status: 'completed' });
    expect((await store.finish(session, 'completed'))!.status).toBe('completed');
  });
  it('serializes updates and preserves the last valid state on an invalid update', async () => {
    const { store, file } = await setup(); const { session } = await store.begin(input);
    await Promise.all([store.update(session, { id: 'planner', status: 'running' }), store.update(session, { id: 'planner', status: 'completed', turn, sourceHash: 'hash' })]);
    expect((await store.read('project'))!.tasks[0]!.status).toBe('completed');
    const disk = JSON.parse(await readFile(file, 'utf8')); expect(disk.runs[0].tasks[0].status).toBe('completed');
    await expect(store.update(session, { id: 'invented' as any, status: 'completed' })).rejects.toThrow('未知');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(disk);
  });
  it('rolls back memory on a failed disk write and can retry after the failure is resolved', async () => {
    const { store, file } = await setup(); const { session } = await store.begin(input);
    const before = await store.read('project');
    await rename(file, `${file}.backup`); await mkdir(file);
    await expect(store.update(session, { id: 'planner', status: 'completed', turn, sourceHash: 'hash' })).rejects.toThrow();
    expect(await store.read('project')).toEqual(before);
    expect((await readdir(file + '/..')).some(name => name.endsWith('.tmp'))).toBe(false);
    await rm(file, { recursive: true }); await rename(`${file}.backup`, file);
    await store.update(session, { id: 'planner', status: 'completed', turn, sourceHash: 'hash' });
    await store.flush();
    expect(JSON.parse(await readFile(file, 'utf8')).runs[0].tasks[0].status).toBe('completed');
  });
  it('removes only the deleted project records and persists the removal', async () => {
    const { store, file } = await setup();
    await store.begin(input); await store.begin({ ...input, projectId: 'other' });
    await store.remove('project'); await store.flush();
    const reopened = new ProductionRunStore(file); await reopened.init();
    expect(await reopened.read('project')).toBeNull();
    expect(await reopened.read('other')).not.toBeNull();
  });
  it('does not overwrite a damaged store', async () => {
    const { file } = await setup(); await writeFile(file, '{broken');
    await expect(new ProductionRunStore(file).init()).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe('{broken');
  });
  it('has no invented progress for a legacy project', async () => {
    const { store } = await setup(); expect(await store.read('legacy')).toBeNull();
    const begun = await store.begin({ ...input, continuation: true });
    expect(begun.recovery).toBeNull();
    expect((await store.read('project'))!.budget!.priorUsageUnknown).toBe(true);
    expect((await store.read('project'))!.tasks.filter(task => task.status === 'completed')).toHaveLength(0);
  });
});

describe('persistent execution budgets and repeated failures', () => {
  it('persists reservations across restarts and stops concurrent callers at the exact limit', async () => {
    const { store, file } = await setup(); const first = await store.begin(input);
    const results = await Promise.allSettled(Array.from({ length: 9 }, () => store.reserve(first.session, 'reconnects')));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(6);
    expect((await store.read('project'))!.failure?.category).toBe('budget');
    const reopened = new ProductionRunStore(file); await reopened.init();
    const next = await reopened.begin({ ...input, continuation: true });
    await expect(reopened.reserve(next.session, 'reconnects')).rejects.toThrow('执行预算用尽');
    expect((await reopened.read('project'))!.budget!.used.reconnects).toBe(6);
    await expect(reopened.reserve(first.session, 'turns')).rejects.toThrow('会话已失效');
    expect((await reopened.read('project'))!.budget!.used.turns).toBe(0);
  });
  it('does not reset consumed budgets when the model or production rules change', async () => {
    const { store } = await setup(); const first = await store.begin(input);
    await store.reserve(first.session, 'turns'); await store.finish(first.session, 'failed', 'HTTP 401 unauthorized');
    const second = await store.begin({ ...input, continuation: true, contractKey: 'new-model-policy' });
    await store.reserve(second.session, 'turns');
    const run = (await store.read('project'))!;
    expect(run.budget!.used.turns).toBe(2); expect(run.attempts[0]!.budgetUsed!.turns).toBe(1);
    expect(run.attempts[0]!.failure?.category).toBe('account');
  });
  it('blocks the same failed repair after restart but permits changed source or changed findings', async () => {
    const { store, file } = await setup(); const first = await store.begin(input);
    await store.beforeRepair(first.session, 'delivery', ['broken jump', 'collision'], 'hash');
    await store.repairCompleted(first.session, 'delivery', ['broken jump', 'collision'], 'hash');
    await store.finish(first.session, 'failed', '修复没有进展');
    const reopened = new ProductionRunStore(file); await reopened.init();
    const second = await reopened.begin({ ...input, continuation: true });
    await expect(reopened.beforeRepair(second.session, 'delivery', ['collision', 'AUTHORITATIVE_HOST: broken  jump'], 'hash')).rejects.toThrow('无进展');
    expect((await reopened.read('project'))!.budget!.used.repairs).toBe(1);
    await reopened.beforeRepair(second.session, 'delivery', ['broken jump', 'collision'], 'new-source');
    await reopened.beforeRepair(second.session, 'delivery', ['new problem'], 'hash');
    expect((await reopened.read('project'))!.budget!.used.repairs).toBe(3);
  });
  it('does not treat an interrupted or failed repair dispatch as a completed no-op', async () => {
    const { store } = await setup(); const first = await store.begin(input);
    await store.beforeRepair(first.session, 'delivery', ['collision'], 'hash');
    await store.finish(first.session, 'interrupted', '用户停止');
    const second = await store.begin({ ...input, continuation: true });
    await expect(store.beforeRepair(second.session, 'delivery', ['collision'], 'hash')).resolves.toBeUndefined();
    expect((await store.read('project'))!.budget!.used.repairs).toBe(2);
  });
  it('extends limits once per revision without dispatching work or erasing usage and failures', async () => {
    const { store } = await setup(); const first = await store.begin(input);
    await store.reserve(first.session, 'turns');
    let progress = (await store.read('project'))!;
    await expect(store.extendBudget('project', 'run', progress.revision)).rejects.toThrow('停止或失败');
    await store.finish(first.session, 'failed', '修复没有进展'); progress = (await store.read('project'))!;
    const results = await Promise.allSettled([store.extendBudget('project', 'run', progress.revision), store.extendBudget('project', 'run', progress.revision)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const next = (await store.read('project'))!;
    expect(next.budget!.limits).toEqual({ turns: 60, repairs: 9, reconnects: 9 });
    expect(next.budget!.used.turns).toBe(1); expect(next.budget!.grants).toHaveLength(1);
    expect(next.attempts).toHaveLength(1); expect(next.status).toBe('failed'); expect(next.failure?.category).toBe('no-progress');
  });
  it('migrates old records honestly and rejects corrupted counters instead of resetting them', async () => {
    const { store, file } = await setup(); await store.begin(input);
    const old = JSON.parse(await readFile(file, 'utf8')); delete old.runs[0].budget;
    await writeFile(file, JSON.stringify(old)); const reopened = new ProductionRunStore(file); await reopened.init();
    expect((await reopened.read('project'))!.budget!.priorUsageUnknown).toBe(true);
    const corrupt = JSON.parse(await readFile(file, 'utf8')); corrupt.runs[0].budget.used.turns = -1;
    const serialized = JSON.stringify(corrupt); await writeFile(file, serialized);
    await expect(new ProductionRunStore(file).init()).rejects.toThrow('损坏');
    expect(await readFile(file, 'utf8')).toBe(serialized);
  });
  it('stops repair scheduling at the shared core/sample/delivery repair budget', async () => {
    const { store } = await setup(); const { session } = await store.begin(input);
    for (let index = 0; index < 6; index++) await store.beforeRepair(session, ['core-loop', 'visual-sample', 'delivery'][index % 3]!, ['issue'], `hash-${index}`);
    await expect(store.beforeRepair(session, 'delivery', ['new issue'], 'new-source')).rejects.toThrow('预算用尽');
    expect((await store.read('project'))!.budget!.used.repairs).toBe(6);
  });
});

describe('phase dependencies and execution receipts', () => {
  const evidence = { sourceHash: 'a'.repeat(64), assetsHash: 'b'.repeat(64) };
  it('enforces enabled gates, one executing step, immutable plan selection and no verification reuse', async () => {
    const { store } = await setup(); const first = await store.begin({ ...input, coreLoop: true, visualSample: true, requirementIds: ['R01', 'R02'] });
    await expect(store.update(first.session, { id: 'implementer', status: 'running' })).rejects.toThrow('依赖未完成');
    await expect(store.update(first.session, { id: 'core-loop', status: 'not-needed' })).rejects.toThrow('不能跳过');
    await store.update(first.session, { id: 'planner', status: 'running', evidence });
    await expect(store.update(first.session, { id: 'planner', status: 'running', evidence })).rejects.toThrow('重复');
    await store.update(first.session, { id: 'planner', status: 'completed', evidence });
    await expect(store.update(first.session, { id: 'visual-sample', status: 'running' })).rejects.toThrow('核心玩法');
    for (const id of ['core-loop', 'visual-sample', 'implementer'] as const) await store.update(first.session, { id, status: 'completed', evidence });
    await expect(store.update(first.session, { id: 'delivery', status: 'running', evidence })).rejects.toThrow('独立评审');
    await expect(store.update(first.session, { id: 'reviewer', status: 'completed', reused: true, evidence })).rejects.toThrow('验证必须重新执行');
    expect((await store.read('project'))!.tasks[0]!.contract?.requirementIds).toEqual(['R01', 'R02']);
    await store.finish(first.session, 'interrupted');
    await expect(store.begin({ ...input, planVersionId: 'changed', continuation: true })).rejects.toThrow('版本已变化');
  });
  it('rejects stale review and build evidence atomically, including changes between steps', async () => {
    const { store } = await setup(); const { session } = await store.begin(input);
    await store.update(session, { id: 'planner', status: 'completed', evidence });
    await store.update(session, { id: 'implementer', status: 'completed', evidence });
    const changed = { sourceHash: 'c'.repeat(64) };
    await expect(store.update(session, { id: 'reviewer', status: 'running', evidence: changed })).rejects.toThrow('前一步完成后工程已变化');
    await store.update(session, { id: 'reviewer', status: 'running', evidence });
    const before = await store.read('project');
    await expect(store.update(session, { id: 'reviewer', status: 'completed', evidence: changed })).rejects.toThrow('只读步骤');
    await expect(store.update(session, { id: 'reviewer', status: 'completed', evidence: { ...evidence, build: { id: 'old', sourceHash: changed.sourceHash, artifactHash: 'd'.repeat(64) } } })).rejects.toThrow('源码版本不一致');
    expect(await store.read('project')).toEqual(before);
  });
  it('unrolls repair and fresh host review into an acyclic graph and retains interrupted receipts on disk', async () => {
    const { store, file } = await setup(); const { session } = await store.begin(input);
    for (const id of ['planner', 'implementer'] as const) await store.update(session, { id, status: 'completed', evidence });
    await store.update(session, { id: 'reviewer', status: 'needs-repair', evidence, detail: '真实输入未触发' });
    await store.update(session, { id: 'reviewer', status: 'pending' });
    await store.update(session, { id: 'repair', status: 'running', evidence });
    const repaired = { sourceHash: 'c'.repeat(64) };
    await store.update(session, { id: 'repair', status: 'completed', evidence: repaired, turn });
    await store.update(session, { id: 'delivery', status: 'running', evidence: repaired });
    await store.update(session, { id: 'delivery', status: 'completed', evidence: repaired });
    await store.update(session, { id: 'reviewer', status: 'running', evidence: repaired });
    const reopened = new ProductionRunStore(file); await reopened.init();
    const progress = (await reopened.read('project'))!;
    const receipts = progress.attempts[0]!.executions!;
    expect(receipts.map(item => item.taskId)).toEqual(['planner', 'implementer', 'reviewer', 'repair', 'delivery', 'reviewer']);
    const seen = new Set<string>();
    for (const receipt of receipts) { expect(receipt.dependencies.every(id => seen.has(id))).toBe(true); seen.add(receipt.id); }
    expect(receipts[2]!.detail).toBe('真实输入未触发');
    expect(receipts[3]!.input?.sourceHash).toBe(evidence.sourceHash); expect(receipts[3]!.output?.sourceHash).toBe(repaired.sourceHash);
    expect(receipts.at(-1)!.status).toBe('interrupted'); expect(receipts.at(-1)!.output).toBeUndefined();
    const damaged = JSON.parse(await readFile(file, 'utf8')); damaged.runs[0].attempts[0].executions[0].dependencies = [receipts.at(-1)!.id];
    await writeFile(file, JSON.stringify(damaged));
    await expect(new ProductionRunStore(file).init()).rejects.toThrow('损坏');
  });
});
