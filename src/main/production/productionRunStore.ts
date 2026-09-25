import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BUDGET_LABELS, DEFAULT_PRODUCTION_LIMITS, PRODUCTION_BUDGET_EXTENSION, type ProductionBudget, type ProductionBudgetKind } from '../../shared/productionPolicy.js';
import { ProductionBudgetError, ProductionNoProgressError, productionFailure, repairInputKey } from './productionPolicy.js';
import { PRODUCTION_TASK_TITLES, type ProductionProgress, type ProductionSession, type ProductionTaskId,
  type ProductionTaskUpdate, type ProductionRecovery } from '../../shared/productionProgress.js';

interface StoredRun extends ProductionProgress { contractKey: string; recovery: ProductionRecovery | null; repairInputs?: Record<string, string> }
const newBudget = (priorUsageUnknown: boolean): ProductionBudget => ({ used: { turns: 0, repairs: 0, reconnects: 0 },
  limits: { ...DEFAULT_PRODUCTION_LIMITS }, trackingSince: new Date().toISOString(), priorUsageUnknown, grants: [] });
const validBudget = (budget: ProductionBudget) => budget && ['used', 'limits'].every(field =>
  Object.keys(DEFAULT_PRODUCTION_LIMITS).every(key => Number.isSafeInteger((budget as any)[field]?.[key]) && (budget as any)[field][key] >= 0))
  && typeof budget.trackingSince === 'string' && Array.isArray(budget.grants);
interface State { version: 1; revision: number; runs: StoredRun[] }
const now = () => new Date().toISOString();
const validId = (value: string) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/u.test(value);
const validTurn = (value: any) => value && value.status === 'completed'
  && ['threadId', 'turnId', 'text'].every(key => typeof value[key] === 'string');
const validTasks = (tasks: any) => Array.isArray(tasks) && tasks.every(task => task && Object.hasOwn(PRODUCTION_TASK_TITLES, task.id)
  && ['pending', 'running', 'completed', 'needs-repair', 'failed', 'interrupted', 'not-needed'].includes(task.status)
  && typeof task.detail === 'string' && Number.isInteger(task.attempts));
function publicProgress(run: StoredRun): ProductionProgress {
  const { contractKey: _contract, recovery: _recovery, repairInputs: _inputs, ...progress } = structuredClone(run);
  return progress;
}

/** Host-owned records. Critical task boundaries are awaited before subsequent work. */
export class ProductionRunStore {
  #state: State = { version: 1, revision: 0, runs: [] };
  #queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly file: string) {}
  async init(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.file, 'utf8'));
      if (value.version !== 1 || !Number.isInteger(value.revision) || !Array.isArray(value.runs)
        || value.runs.some((run: StoredRun) => !validId(run.projectId) || !validId(run.planRunId)
          || !validTasks(run.tasks) || !Array.isArray(run.attempts)
          || (run.budget !== undefined && !validBudget(run.budget))
          || (run.repairInputs !== undefined && (!run.repairInputs || typeof run.repairInputs !== 'object'
            || Object.values(run.repairInputs).some(value => typeof value !== 'string')))
          || run.attempts.some(attempt => !validId(attempt.id) || !validTasks(attempt.tasks))
          || (run.recovery && (!validTurn(run.recovery.planner) || typeof run.recovery.sourceHash !== 'string'
            || !run.recovery.sourceHash || (run.recovery.implementation && !validTurn(run.recovery.implementation)))))) throw new Error('制作进度存储损坏，未覆盖原记录');
      this.#state = value;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await this.#mutate(() => {
      for (const run of this.#state.runs) { run.budget ??= newBudget(true); run.repairInputs ??= {}; }
      for (const run of this.#state.runs) if (run.status === 'running') this.#finish(run, 'interrupted', '应用退出中断；已完成记录保留，请显式继续');
    });
  }
  async read(projectId: string, planRunId?: string): Promise<ProductionProgress | null> {
    if (!validId(projectId) || (planRunId !== undefined && !validId(planRunId))) throw new Error('项目或方案 ID 无效');
    await this.#queue;
    const run = this.#state.runs.filter(run => run.projectId === projectId && (!planRunId || run.planRunId === planRunId))
      .sort((a, b) => b.revision - a.revision)[0];
    return run ? publicProgress(run) : null;
  }
  async flush(): Promise<void> { await this.#queue; }
  remove(projectId: string): Promise<void> {
    return this.#mutate(() => { this.#state.runs = this.#state.runs.filter(run => run.projectId !== projectId); });
  }
  begin(input: { projectId: string; planRunId: string; planVersionId: string; planTitle: string; contractKey: string;
    continuation: boolean; coreLoop: boolean; visualSample: boolean }): Promise<{ session: ProductionSession; recovery: ProductionRecovery | null; context: string }> {
    if (![input.projectId, input.planRunId, input.planVersionId].every(validId)) throw new Error('制作进度 ID 无效');
    return this.#mutate(() => {
      let run = this.#state.runs.find(run => run.projectId === input.projectId && run.planRunId === input.planRunId);
      if (run?.status === 'running') throw new Error('该方案仍有正在执行的制作任务');
      const context = run ? JSON.stringify({ previousStatus: run.status, tasks: run.tasks.map(task => ({ task: task.title, status: task.status, detail: task.detail.slice(0, 500) })),
        lastError: run.attempts.at(-1)?.error?.slice(0, 2000) ?? null }) : '';
      const recovery = input.continuation && run?.contractKey === input.contractKey ? structuredClone(run.recovery) : null;
      const tasks = (Object.keys(PRODUCTION_TASK_TITLES) as ProductionTaskId[]).map(id => ({
        id, title: PRODUCTION_TASK_TITLES[id], status: (id === 'repair' || (id === 'core-loop' && !input.coreLoop)
          || (id === 'visual-sample' && !input.visualSample)) ? 'not-needed' as const : 'pending' as const,
        attempts: run?.tasks.find(task => task.id === id)?.attempts ?? 0, reused: false, detail: '', updatedAt: now(),
      }));
      if (!run) {
        run = { projectId: input.projectId, planRunId: input.planRunId, planVersionId: input.planVersionId,
          planTitle: input.planTitle, revision: 0, updatedAt: now(), status: 'running', tasks, attempts: [],
          contractKey: input.contractKey, recovery: null, recoveryNote: '' };
        run.budget = newBudget(input.continuation); run.repairInputs = {};
        this.#state.runs.push(run);
      }
      run.tasks = tasks; run.status = 'running'; run.contractKey = input.contractKey; run.recovery = recovery;
      run.failure = null;
      run.recoveryNote = input.continuation ? recovery ? '正在核对工程版本，决定是否复用已完成回合' : '无匹配检查点，先核对现有工程并保留已有内容' : '按已选方案开始制作';
      const attempt = { id: randomUUID(), startedAt: now(), finishedAt: null, status: 'running' as const, error: null, tasks: [] };
      run.attempts.push(attempt); this.#touch(run);
      return { session: { projectId: run.projectId, planRunId: run.planRunId, attemptId: attempt.id }, recovery, context };
    });
  }
  update(session: ProductionSession, update: ProductionTaskUpdate): Promise<ProductionProgress | null> {
    return this.#mutate(() => {
      const run = this.#active(session); if (!run) return null;
      const task = run.tasks.find(task => task.id === update.id); if (!task) throw new Error('未知制作任务');
      if (update.status === 'running') task.attempts += 1;
      Object.assign(task, { status: update.status, detail: (update.detail ?? '').slice(0, 8000), reused: update.reused ?? false, updatedAt: now() });
      if (update.reused) run.recoveryNote = '已核对工程与制作规则，复用完成回合；评审和交付验证重新执行';
      if (update.id === 'planner' && update.status === 'completed' && update.turn && update.sourceHash) {
        run.recovery = { ...(update.reused ? run.recovery : null), planner: { ...update.turn, text: update.turn.text.slice(0, 32000) }, sourceHash: update.sourceHash };
      }
      if ((update.id === 'implementer' || update.id === 'repair') && update.status === 'completed' && update.turn && update.sourceHash && run.recovery) {
        run.recovery.implementation = { ...update.turn, text: update.turn.text.slice(0, 32000) };
        run.recovery.sourceHash = update.sourceHash;
      }
      this.#touch(run); return publicProgress(run);
    });
  }
  invalidate(session: ProductionSession, reason: string): Promise<ProductionProgress | null> {
    return this.#mutate(() => { const run = this.#active(session); if (!run) return null;
      run.recovery = null; run.recoveryNote = reason; this.#touch(run); return publicProgress(run); });
  }
  /** Reserve before a model request; even an uncertain/failed dispatch remains charged. */
  async reserve(session: ProductionSession, kind: ProductionBudgetKind): Promise<void> {
    const error = await this.#mutate(() => {
      const run = this.#active(session); if (!run) throw new Error('制作会话已失效，不能继续执行');
      const budget = run.budget!;
      if (budget.used[kind] >= budget.limits[kind]) {
        const message = `执行预算用尽：${BUDGET_LABELS[kind]}已使用 ${budget.used[kind]}/${budget.limits[kind]} 次。`;
        run.failure = productionFailure(message); this.#touch(run); return message;
      }
      budget.used[kind] += 1; this.#touch(run); return null;
    });
    if (error) throw new ProductionBudgetError(error);
  }
  async beforeRepair(session: ProductionSession, stage: string, findings: readonly string[], sourceHash?: string): Promise<void> {
    const error = await this.#mutate(() => {
      const run = this.#active(session); if (!run) throw new Error('制作会话已失效，不能继续修复');
      const key = sourceHash ? repairInputKey(sourceHash, findings) : null;
      if (key && run.repairInputs?.[stage] === key) {
        const label = stage === 'core-loop' ? '核心玩法' : stage === 'visual-sample' ? '画面样板' : '交付检查';
        const message = `重复失败且无进展：${label}的工程和验收问题均未变化，已停止重复修复。`;
        run.failure = productionFailure(message); this.#touch(run); return { type: 'no-progress', message };
      }
      const budget = run.budget!;
      if (budget.used.repairs >= budget.limits.repairs) {
        const message = `执行预算用尽：修复回合已使用 ${budget.used.repairs}/${budget.limits.repairs} 次。`;
        run.failure = productionFailure(message); this.#touch(run); return { type: 'budget', message };
      }
      budget.used.repairs += 1; this.#touch(run); return null;
    });
    if (error) throw error.type === 'budget' ? new ProductionBudgetError(error.message) : new ProductionNoProgressError(error.message);
  }
  async repairCompleted(session: ProductionSession, stage: string, findings: readonly string[], sourceHash?: string): Promise<void> {
    await this.#mutate(() => {
      const run = this.#active(session); if (!run) throw new Error('制作会话已失效，不能保存修复结果');
      if (sourceHash) (run.repairInputs ??= {})[stage] = repairInputKey(sourceHash, findings);
      this.#touch(run);
    });
  }
  extendBudget(projectId: string, planRunId: string, revision: number): Promise<ProductionProgress> {
    return this.#mutate(() => {
      const run = this.#state.runs.find(run => run.projectId === projectId && run.planRunId === planRunId);
      if (!run || run.revision !== revision) throw new Error('制作记录已变化，请刷新后再增加预算');
      if (run.status === 'running' || run.status === 'completed') throw new Error('仅可为停止或失败的制作增加预算');
      for (const kind of Object.keys(PRODUCTION_BUDGET_EXTENSION) as ProductionBudgetKind[]) {
        const next = run.budget!.limits[kind] + PRODUCTION_BUDGET_EXTENSION[kind];
        if (!Number.isSafeInteger(next)) throw new Error('执行预算超出可记录范围');
        run.budget!.limits[kind] = next;
      }
      run.budget!.grants.push({ at: now(), added: { ...PRODUCTION_BUDGET_EXTENSION } });
      this.#touch(run); return publicProgress(run);
    });
  }
  finish(session: ProductionSession, status: 'completed' | 'failed' | 'interrupted', error: string | null = null): Promise<ProductionProgress | null> {
    return this.#mutate(() => { const run = this.#active(session); if (!run) return null;
      if (status === 'completed' && run.tasks.some(task => !['completed', 'not-needed'].includes(task.status))) throw new Error('还有未完成的制作任务，不能标记交付完成');
      this.#finish(run, status, error); return publicProgress(run); });
  }
  #active(session: ProductionSession): StoredRun | undefined {
    return this.#state.runs.find(run => run.projectId === session.projectId && run.planRunId === session.planRunId
      && run.attempts.at(-1)?.id === session.attemptId && run.status === 'running');
  }
  #finish(run: StoredRun, status: 'completed' | 'failed' | 'interrupted', error: string | null): void {
    const detail = error?.slice(0, 8000) ?? null;
    const stage = run.tasks.find(task => task.status === 'running')?.id ?? run.tasks.find(task => task.status === 'needs-repair')?.id;
    run.failure = detail ? productionFailure(detail, stage) : null;
    for (const task of run.tasks) if (task.status === 'running') {
      task.status = status === 'interrupted' ? 'interrupted' : 'failed'; task.detail = detail ?? ''; task.updatedAt = now();
    }
    run.status = status;
    const attempt = run.attempts.at(-1);
    if (attempt) Object.assign(attempt, { status, finishedAt: now(), error: detail, tasks: structuredClone(run.tasks),
      failure: run.failure, budgetUsed: structuredClone(run.budget?.used) });
    this.#touch(run);
  }
  #touch(run: StoredRun): void { run.revision = ++this.#state.revision; run.updatedAt = now(); }
  #mutate<T>(fn: () => T): Promise<T> {
    const operation = this.#queue.then(async () => {
      const before = structuredClone(this.#state);
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        const result = fn(); await mkdir(dirname(this.file), { recursive: true });
        await writeFile(temporary, JSON.stringify(this.#state), { mode: 0o600 }); await rename(temporary, this.file);
        return structuredClone(result);
      } catch (error) { this.#state = before; await rm(temporary, { force: true }).catch(() => undefined); throw error; }
    });
    this.#queue = operation.catch(() => undefined); return operation;
  }
}
