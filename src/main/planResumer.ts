import type { ProjectRecord } from '../shared/contracts.js';
import type { PlanDraft, ResumeProjectInput } from '../shared/planning.js';
import { PlanStore } from './planStore.js';

/** Explicit continuation of a host-owned selection; never accepts a new production prompt. */
export class PlanResumer {
  #pending = new Map<string, { selection: string; promise: Promise<ProjectRecord> }>();
  constructor(private readonly store: PlanStore, private readonly dependencies: {
    getProject(id: string): Promise<ProjectRecord>;
    dispatch(project: ProjectRecord, draft: PlanDraft, input: ResumeProjectInput): Promise<ProjectRecord>;
  }) {}

  resume(input: ResumeProjectInput): Promise<ProjectRecord> {
    if (!input || typeof input !== 'object'
      || Object.keys(input).some(key => !['projectId', 'runId', 'requestId', 'model', 'effort'].includes(key))
      || ['projectId', 'runId', 'requestId'].some(key => typeof input[key as keyof ResumeProjectInput] !== 'string'
        || !/^[a-zA-Z0-9_-]{1,200}$/u.test(input[key as keyof ResumeProjectInput] as string))
      || ['model', 'effort'].some(key => input[key as keyof ResumeProjectInput] != null
        && (typeof input[key as keyof ResumeProjectInput] !== 'string' || input[key as keyof ResumeProjectInput]!.length > 200))) {
      return Promise.reject(new Error('继续制作参数无效；新要求必须先生成方案'));
    }
    const selection = JSON.stringify([input.runId, input.model ?? null, input.effort ?? null]);
    const pending = this.#pending.get(input.projectId);
    if (pending) return pending.selection === selection ? pending.promise : Promise.reject(new Error('该项目正在恢复另一制作请求'));
    const promise = this.#resume(input).finally(() => this.#pending.delete(input.projectId));
    this.#pending.set(input.projectId, { selection, promise });
    return promise;
  }

  async #resume(input: ResumeProjectInput): Promise<ProjectRecord> {
    const { draft, fresh } = await this.store.reserveResume(input);
    if (!fresh) {
      const attempt = draft.run!.resumeAttempts!.find(attempt => attempt.id === input.requestId)!;
      if (attempt.status === 'dispatched') return this.dependencies.getProject(input.projectId);
      throw new Error(attempt.error ?? '恢复请求已记录，请检查项目状态后重新点击继续');
    }
    try {
      const project = await this.dependencies.getProject(input.projectId);
      if (!['stopped', 'failed', 'waiting'].includes(project.status)) throw new Error('只有已停止或需处理的制作可以继续');
      const result = await this.dependencies.dispatch(project, draft, input);
      await this.store.finishResume(draft.id, input.requestId, 'dispatched');
      return result;
    } catch (error) {
      await this.store.finishResume(draft.id, input.requestId, 'failed', (error as Error).message);
      throw error;
    }
  }
}

export function continuationPrompt(project: ProjectRecord, draft: PlanDraft): string {
  return `${draft.run!.prompt}\n\n继续执行上面已经选定的同一方案，不生成新的候选方向，不扩展范围。`
    + `\n中断前记录的阶段：${project.stage}。先检查当前工程、已生成素材、已有构建和验证记录，确认实际剩余工作。`
    + '\n保留已完成内容，复用仍有效的素材和构建；只修复问题和完成剩余要求。历史报告不能验收变更后的代码。'
    + '\n沿用可用的实现会话；若无法恢复，明确报告原因，不能把失败写成完成。';
}
