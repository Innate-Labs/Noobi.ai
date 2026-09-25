import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { latestProjectPlan, type GeneratePlansInput, type PlanDraft, type PlanOption, type PlanVersion, type StartPlanInput, type ResumeProjectInput } from '../shared/planning.js';

/** Host-owned, serialized atomic snapshots. A persisted run reservation is never replayed automatically. */
export class PlanStore {
  #drafts: PlanDraft[] = [];
  #queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly file: string) {}
  async init(): Promise<void> {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.drafts)) throw new Error('方案存储格式无效');
      this.#drafts = data.drafts;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await this.#mutate(() => {
      for (const draft of this.#drafts) {
        for (const attempt of draft.run?.resumeAttempts ?? []) if (attempt.status === 'starting') {
          attempt.status = 'interrupted'; attempt.error = '继续制作被应用退出中断；请检查项目后显式继续。';
        }
        draft.attachmentCount ??= 0;
        draft.analysisAttempts ??= [];
        for (const attempt of draft.analysisAttempts) if (attempt.status === 'generating') attempt.status = 'interrupted';
        if (draft.status === 'generating') { draft.status = 'failed'; draft.error = '规划被应用退出中断，请重新生成。'; }
        if (draft.run?.status === 'starting') {
          draft.run.status = 'interrupted'; draft.run.error = '启动被中断；请检查关联项目，系统不会自动重复制作。';
        }
      }
    });
  }
  async list(): Promise<PlanDraft[]> { await this.#queue; return structuredClone(this.#drafts); }
  importRestored(source: PlanDraft, projectId: string): Promise<PlanDraft> {
    return this.#mutate(() => {
      if (!source.version || !source.run || source.run.versionId !== source.version.id
        || !source.version.options.some(option => option.id === source.run!.optionId)) throw new Error('版本缺少完整已选方案');
      const timestamp = new Date().toISOString();
      const draft: PlanDraft = { ...structuredClone(source), id: randomUUID(), projectId, status: 'ready', error: null, updatedAt: timestamp,
        run: { ...structuredClone(source.run), id: randomUUID(), projectId, status: 'dispatched', error: null, createdAt: timestamp, resumeAttempts: [] } };
      this.#drafts.push(draft); return draft;
    });
  }
  removeProject(projectId: string): Promise<void> {
    return this.#mutate(() => { this.#drafts = this.#drafts.filter(d => d.projectId !== projectId && d.run?.projectId !== projectId); });
  }
  async get(id: string): Promise<PlanDraft> {
    await this.#queue;
    return structuredClone(this.#find(id));
  }
  create(input: GeneratePlansInput): Promise<PlanDraft> {
    if (!input || typeof input.request !== 'string' || !input.request.trim() || input.request.length > 12000) throw new Error('请填写 1–12000 字的游戏需求');
    if (input.attachmentCount != null && (!Number.isInteger(input.attachmentCount) || input.attachmentCount < 0 || input.attachmentCount > 50)) throw new Error('附件数量无效');
    for (const key of ['model', 'effort', 'projectId'] as const) {
      if (input[key] != null && (typeof input[key] !== 'string' || input[key]!.length > 200)) throw new Error('方案参数无效');
    }
    return this.#mutate(() => {
      const draft: PlanDraft = { id: randomUUID(), projectId: input.projectId ?? null,
        request: input.request.trim(), attachmentCount: input.attachmentCount ?? 0, model: input.model ?? null, effort: input.effort ?? null,
        status: 'generating', attemptId: randomUUID(), analysisAttempts: [], updatedAt: new Date().toISOString(), error: null, version: null, run: null };
      draft.analysisAttempts.push({ id: draft.attemptId, startedAt: draft.updatedAt, durationMs: null, usage: null, status: 'generating' });
      this.#drafts.push(draft); return draft;
    });
  }
  retry(id: string): Promise<PlanDraft> {
    return this.#mutate(() => {
      const draft = this.#find(id);
      if (draft.run) throw new Error('方案已经启动，不能重新生成此版本');
      if (draft.status === 'generating') throw new Error('方案仍在生成');
      draft.status = 'generating'; draft.attemptId = randomUUID(); draft.error = null; draft.updatedAt = new Date().toISOString();
      draft.analysisAttempts.push({ id: draft.attemptId, startedAt: draft.updatedAt, durationMs: null, usage: null, status: 'generating' });
      return draft;
    });
  }
  finish(id: string, attemptId: string, version: PlanVersion | null, error: string | null): Promise<PlanDraft> {
    return this.#mutate(() => {
      const draft = this.#find(id);
      if (draft.attemptId !== attemptId || draft.status !== 'generating') return draft;
      draft.status = version ? 'ready' : 'failed'; draft.error = error;
      if (version) draft.version = version;
      draft.updatedAt = new Date().toISOString(); return draft;
    });
  }
  recordAnalysis(id: string, attemptId: string, durationMs: number, usage: PlanVersion['analysisUsage'], status: 'completed' | 'failed' | 'cancelled'): Promise<void> {
    return this.#mutate(() => {
      const attempt = this.#find(id).analysisAttempts.find(a => a.id === attemptId);
      if (attempt) Object.assign(attempt, { durationMs, usage, status });
    });
  }
  cancel(id: string): Promise<PlanDraft> {
    return this.#mutate(() => {
      const draft = this.#find(id);
      if (draft.run) throw new Error('制作已启动，请在项目中停止制作');
      draft.status = 'cancelled'; draft.error = null; draft.updatedAt = new Date().toISOString(); return draft;
    });
  }
  reserve(input: StartPlanInput): Promise<{ draft: PlanDraft; fresh: boolean }> {
    return this.#mutate(() => {
      if (!input || typeof input.draftId !== 'string') throw new Error('请先选择制作方案');
      const draft = this.#find(input.draftId);
      const version = draft.version;
      if (draft.status !== 'ready' || !version || version.id !== input.versionId) throw new Error('方案版本已变化，请重新查看并选择');
      const option = version.options.find(o => o.id === input.optionId);
      if (!option) throw new Error('请选择当前版本中的一个方案');
      if (draft.run) {
        if (draft.run.versionId !== input.versionId || draft.run.optionId !== input.optionId) throw new Error('此需求已经使用另一方案启动');
        return { draft, fresh: false };
      }
      draft.run = { id: randomUUID(), versionId: version.id, optionId: option.id, status: 'starting', projectId: draft.projectId,
        prompt: approvedPlanPrompt(draft, option), createdAt: new Date().toISOString(), error: null };
      return { draft, fresh: true };
    });
  }
  bindProject(id: string, projectId: string): Promise<PlanDraft> {
    return this.#mutate(() => { const draft = this.#find(id); if (!draft.run) throw new Error('缺少制作运行'); draft.run.projectId = projectId; return draft; });
  }
  markRun(id: string, status: 'dispatched' | 'failed', error: string | null = null): Promise<PlanDraft> {
    return this.#mutate(() => { const draft = this.#find(id); if (!draft.run) throw new Error('缺少制作运行'); draft.run.status = status; draft.run.error = error; return draft; });
  }
  reserveResume(input: ResumeProjectInput): Promise<{ draft: PlanDraft; fresh: boolean }> {
    return this.#mutate(() => {
      const draft = latestProjectPlan(this.#drafts, input.projectId);
      if (!draft?.run || draft.run.id !== input.runId) throw new Error('已选方案已变化，请刷新后继续');
      if (draft.run.status !== 'dispatched' || draft.version?.id !== draft.run.versionId
        || !draft.version.options.some(option => option.id === draft.run!.optionId)) {
        throw new Error('没有已启动的有效方案，请先选择制作方案');
      }
      const attempts = draft.run.resumeAttempts ??= [];
      const existing = attempts.find(attempt => attempt.id === input.requestId);
      if (existing) {
        if (existing.model !== (input.model ?? null) || existing.effort !== (input.effort ?? null)) throw new Error('恢复请求参数已变化');
        return { draft, fresh: false };
      }
      attempts.push({ id: input.requestId, createdAt: new Date().toISOString(), status: 'starting', error: null,
        model: input.model ?? null, effort: input.effort ?? null });
      return { draft, fresh: true };
    });
  }
  finishResume(draftId: string, requestId: string, status: 'dispatched' | 'failed', error: string | null = null): Promise<void> {
    return this.#mutate(() => {
      const attempt = this.#find(draftId).run?.resumeAttempts?.find(attempt => attempt.id === requestId);
      if (!attempt) throw new Error('找不到继续制作记录');
      attempt.status = status; attempt.error = error;
    });
  }
  #find(id: string): PlanDraft { const d = this.#drafts.find(d => d.id === id); if (!d) throw new Error('找不到制作方案'); return d; }
  #mutate<T>(operation: () => T): Promise<T> {
    const pending = this.#queue.then(async () => {
      const before = structuredClone(this.#drafts);
      try {
        const result = operation();
        await mkdir(dirname(this.file), { recursive: true });
        const tmp = `${this.file}.${randomUUID()}.tmp`;
        await writeFile(tmp, JSON.stringify({ version: 1, drafts: this.#drafts }), { mode: 0o600 });
        await rename(tmp, this.file);
        return structuredClone(result);
      } catch (error) { this.#drafts = before; throw error; }
    });
    this.#queue = pending.catch(() => undefined); return pending;
  }
}
export function approvedPlanPrompt(draft: PlanDraft, option: PlanOption): string {
  return `用户已确认以下制作方案。保留全部原始要求，不得缩减需求；仅实施此选定版本。\n方案版本：${draft.version!.id}\n方案：${option.id} · ${option.title}\n\n原始需求：\n${draft.request}\n\n共同必需要求：\n${draft.version!.requirements.map(r => `${r.id}: ${r.text}`).join('\n')}\n\n选定方案：\n${JSON.stringify(option, null, 2)}`;
}
