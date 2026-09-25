import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { latestProjectPlan, type GeneratePlansInput, type PlanDraft, type PlanOption, type PlanVersion, type StartPlanInput, type ResumeProjectInput, type SavePlanEditsInput, type RevisePlansInput } from '../shared/planning.js';
import { lockedPlanChanges, planDifferences, validateEditedOption, validatePlanLocks } from './planEditing.js';
import { PLAN_EDITABLE_FIELDS } from '../shared/planning.js';
import type { SaveReferenceSpecInput } from '../shared/planning.js';
import { validateReferenceSelections, validateReferenceSpec } from './visualReferenceStore.js';
import { validateVideoSelection, validateVideoSpec } from './videoReferenceStore.js';
import type { SaveVideoSpecInput, VideoClip } from '../shared/videoReferences.js';

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
  copyFailedUnbound(id: string): Promise<PlanDraft> {
    return this.#mutate(() => {
      const source = this.#find(id);
      if (source.projectId || source.run?.projectId || source.run?.status !== 'failed' || !source.version || source.status !== 'ready') throw new Error('只可复制尚未绑定项目的启动失败方案');
      const draft: PlanDraft = { ...structuredClone(source), id: randomUUID(), copiedFromDraftId: source.id,
        updatedAt: new Date().toISOString(), run: null, error: null, analysisAttempts: [] };
      // Reuses unchanged model-authored options; original analysis and failed launch remain at source.id.
      this.#drafts.push(draft); return draft;
    });
  }
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
        status: 'generating', attemptId: randomUUID(), analysisAttempts: [], updatedAt: new Date().toISOString(), error: null, version: null, run: null,
        ...(input.references ? { references: validateReferenceSelections(input.references) } : {}) };
      if (input.referenceSpecOverride) draft.referenceSpecOverride = validateReferenceSpec(input.referenceSpecOverride, draft.references ?? []);
      if (input.video) draft.video = validateVideoSelection(input.video);
      // The main process resolves the immutable clip and validates any override.
      if (input.videoSpecOverride) draft.videoSpecOverride = structuredClone(input.videoSpecOverride);
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
  saveEdits(input: SavePlanEditsInput): Promise<PlanDraft> {
    return this.#mutate(() => {
      const draft = this.#editable(input?.draftId, input?.versionId);
      const option = validateEditedOption(input.option, draft);
      const locks = validatePlanLocks(input.locks, draft);
      const options = draft.version!.options.map(o => o.id === option.id ? option : o);
      const retainedLocks = (draft.locks ?? []).filter(lock => locks.some(l => l.optionId === lock.optionId && l.field === lock.field));
      const conflicts = lockedPlanChanges(draft, options, retainedLocks);
      if (conflicts.length) throw new Error(`请先解锁再修改：${conflicts.join('、')}`);
      const previous = draft.version!;
      const changes = planDifferences(previous.options, options);
      const contentChanged = changes.length > 0;
      // Manual decisions survive regeneration. Unlocking is an explicit, versioned action.
      for (const field of PLAN_EDITABLE_FIELDS) {
        if (JSON.stringify(previous.options.find(o => o.id === option.id)?.[field]) !== JSON.stringify(option[field])
          && !locks.some(lock => lock.optionId === option.id && lock.field === field)) locks.push({ optionId: option.id, field });
      }
      if (JSON.stringify(draft.locks ?? []) !== JSON.stringify(locks)) changes.push('更新字段锁定');
      if (!changes.length) return draft;
      draft.history = [...(draft.history ?? []), structuredClone(previous)];
      draft.version = { ...structuredClone(previous), id: randomUUID(), number: previous.number + 1,
        createdAt: new Date().toISOString(), options, authoredBy: 'user', requiresReview: contentChanged || previous.requiresReview, changes, model: null,
        threadId: '', turnId: '', analysisDurationMs: 0, analysisUsage: null };
      draft.locks = locks; draft.updatedAt = draft.version.createdAt; draft.status = 'ready'; draft.error = null;
      return draft;
    });
  }
  saveVideoSpec(input: SaveVideoSpecInput, clip: VideoClip): Promise<PlanDraft> {
    return this.#mutate(() => {
      const draft = this.#editable(input?.draftId, input?.versionId);
      if (draft.video?.clipId !== clip.id) throw new Error('视频片段与方案不一致');
      const spec = validateVideoSpec(input.spec, clip), previous = draft.version!;
      draft.history = [...(draft.history ?? []), structuredClone(previous)];
      draft.videoSpecOverride = spec;
      draft.version = { ...structuredClone(previous), id: randomUUID(), number: previous.number + 1, createdAt: new Date().toISOString(), videoSpec: spec, videoSpecAuthor: 'user', authoredBy: 'user', requiresReview: true,
        changes: ['修正视频理解'], model: null, threadId: '', turnId: '', analysisDurationMs: 0, analysisUsage: null };
      draft.updatedAt = draft.version.createdAt; draft.status = 'ready'; draft.error = null; return draft;
    });
  }
  saveReferenceSpec(input: SaveReferenceSpecInput): Promise<PlanDraft> {
    return this.#mutate(() => {
      const draft = this.#editable(input?.draftId, input?.versionId);
      if (!draft.references?.length) throw new Error('当前方案没有视觉参考');
      const spec = validateReferenceSpec(input.spec, draft.references);
      const previous = draft.version!;
      draft.history = [...(draft.history ?? []), structuredClone(previous)];
      draft.referenceSpecOverride = spec;
      draft.version = { ...structuredClone(previous), id: randomUUID(), number: previous.number + 1, createdAt: new Date().toISOString(), referenceSpec: spec, referenceSpecAuthor: 'user', authoredBy: 'user', requiresReview: true,
        changes: ['修正视觉理解'], model: null, threadId: '', turnId: '', analysisDurationMs: 0, analysisUsage: null };
      draft.updatedAt = draft.version.createdAt; draft.status = 'ready'; draft.error = null; return draft;
    });
  }
  revise(input: RevisePlansInput): Promise<PlanDraft> {
    return this.#mutate(() => {
      const draft = this.#editable(input?.draftId, input?.versionId);
      if (typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 3000) throw new Error('修改说明需要 1–3000 字');
      if (input.importedPlan !== undefined && (typeof input.importedPlan !== 'string' || input.importedPlan.length > 12000 || /\u0000/u.test(input.importedPlan))) throw new Error('导入计划必须是最多 12000 字的文本');
      const merged = input.mergeOptionId ? draft.version!.options.find(o => o.id === input.mergeOptionId) : null;
      if (input.mergeOptionId && !merged) throw new Error('找不到待组合方案');
      draft.revisionRequest = input.instruction.trim();
      draft.mergeOptionId = merged?.id;
      if (input.importedPlan !== undefined) draft.importedPlan = input.importedPlan.trim();
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
      if (version) {
        const previous = draft.version;
        if (previous) draft.history = [...(draft.history ?? []), structuredClone(previous)];
        draft.version = { ...version, authoredBy: 'model', changes: previous ? planDifferences(previous.options, version.options) : [] };
      }
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
      if (version.requiresReview) throw new Error('手动修改已保存，请先校验方案冲突，再开始制作');
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
  #editable(id: string, versionId: string): PlanDraft {
    const draft = this.#find(id);
    if (draft.run) throw new Error('已开始制作的方案不可改写，请从项目提出新修改');
    if (draft.status === 'generating') throw new Error('请等待当前方案生成结束');
    if (!draft.version || draft.version.id !== versionId) throw new Error('方案版本已变化，请刷新后编辑');
    return draft;
  }
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
  const video = draft.version?.videoInput;
  const videoContext = video ? `\n视频参考规格（用户改编优先，未知规则不能冒充已还原）：\n${JSON.stringify(draft.version?.videoSpec)}\n视频来源 SHA256：${video.sourceHash}\n时间证据：${video.frames.map(f => `${f.time}秒 · references/visual/${f.referenceId}.png · SHA256 ${f.sha256}`).join('\n')}` : '';
  return `用户已确认以下制作方案。保留全部原始要求，不得缩减需求；仅实施此选定版本。\n方案版本：${draft.version!.id}\n方案：${option.id} · ${option.title}\n\n原始需求：\n${draft.request}\n\n共同必需要求：\n${draft.version!.requirements.map(r => `${r.id}: ${r.text}`).join('\n')}\n\n选定方案：\n${JSON.stringify(option, null, 2)}\n\n视觉参考规格（观察与推断分开，以用户修正为准）：\n${JSON.stringify(draft.version!.referenceSpec ?? null, null, 2)}\n参考文件：${(draft.version!.visualInputs ?? []).map(r => `references/visual/${r.referenceId}.png · 用途 ${r.purpose} · SHA256 ${r.normalizedHash}`).join("\n")}${videoContext}`;
}
