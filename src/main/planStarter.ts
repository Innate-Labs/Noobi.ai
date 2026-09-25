import type { ProjectRecord } from '../shared/contracts.js';
import type { PlanDraft, PlanOption, StartPlanInput } from '../shared/planning.js';
import { PlanStore } from './planStore.js';

/** The only production entry point: reserve selection before any project or harness side effect. */
export class PlanStarter {
  #inFlight = new Map<string, { selection: string; promise: Promise<ProjectRecord> }>();
  constructor(private readonly store: PlanStore, private readonly dependencies: {
    preflight?(draft: PlanDraft, input: StartPlanInput, attachments: unknown[]): Promise<void>;
    prepare(draft: PlanDraft, option: PlanOption, input: StartPlanInput, attachments: unknown[]): Promise<ProjectRecord>;
    dispatch(project: ProjectRecord, draft: PlanDraft): Promise<ProjectRecord>;
    getProject(id: string): Promise<ProjectRecord>;
  }) {}
  start(input: StartPlanInput, attachments: unknown[] = []): Promise<ProjectRecord> {
    if (!input || typeof input.draftId !== 'string' || typeof input.versionId !== 'string' || typeof input.optionId !== 'string') return Promise.reject(new Error('请先选择方案，再点击开始制作'));
    const selection = `${input.versionId}:${input.optionId}`;
    const current = this.#inFlight.get(input.draftId);
    if (current) return current.selection === selection ? current.promise : Promise.reject(new Error('另一方案正在启动'));
    const promise = this.#start(input, attachments).finally(() => this.#inFlight.delete(input.draftId));
    this.#inFlight.set(input.draftId, { selection, promise }); return promise;
  }
  async #start(input: StartPlanInput, attachments: unknown[]): Promise<ProjectRecord> {
    const candidate = await this.store.get(input.draftId);
    if (!candidate.run) await this.dependencies.preflight?.(candidate, input, attachments);
    const { draft, fresh } = await this.store.reserve(input);
    if (!fresh) {
      if (draft.run?.status === 'dispatched' && draft.run.projectId) return this.dependencies.getProject(draft.run.projectId);
      throw new Error(draft.run?.error ?? '该方案已保留启动记录，不能重复制作；请检查项目状态后重新规划');
    }
    try {
      const option = draft.version!.options.find(o => o.id === input.optionId)!;
      const project = await this.dependencies.prepare(draft, option, input, attachments);
      const bound = await this.store.bindProject(draft.id, project.id);
      const running = await this.dependencies.dispatch(project, bound);
      await this.store.markRun(draft.id, 'dispatched');
      return running;
    } catch (error) { await this.store.markRun(draft.id, 'failed', (error as Error).message); throw error; }
  }
}
