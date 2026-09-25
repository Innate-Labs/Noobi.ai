import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, LoaderCircle, X } from 'lucide-react';
import type { PlanDraft } from '../../shared/planning';
import type { ProjectRecord } from '../../shared/contracts';
import { toMessage } from '../ui';
import { PlanEditor, PlanRevisionEditor, planFieldLabel } from './PlanEditor';

export function PlanDialog({ initial, files = [], onClose, onStarted }: {
  initial: PlanDraft; files?: readonly File[]; onClose(draft: PlanDraft, files: readonly File[]): void; onStarted(project: ProjectRecord): void;
}) {
  const [draft, setDraft] = useState(initial);
  const [attachedFiles, setAttachedFiles] = useState<readonly File[]>(files);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const actionInFlight = useRef(false);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { previouslyFocused?.focus(); };
  }, []);
  useEffect(() => {
    if (draft.status !== 'generating') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const latest = await window.noobi.getPlan(draft.id); if (!stopped) setDraft(latest); }
      catch (e) { if (!stopped) setError(toMessage(e)); }
      if (!stopped) timer = setTimeout(poll, 1000);
    };
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [draft.id, draft.status]);
  useEffect(() => setSelected(null), [draft.version?.id]);
  async function action(callback: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true; setBusy(true); setError('');
    try { await callback(); } catch (e) { setError(toMessage(e)); }
    finally { actionInFlight.current = false; setBusy(false); }
  }
  async function start() {
    if (!selected || !draft.version) return;
    if (!draft.projectId && attachedFiles.length !== draft.attachmentCount) { setError(`请重新添加 ${draft.attachmentCount} 个参考附件`); return; }
    await action(async () => {
      const projectDirectory = draft.projectId ? undefined : await window.noobi.chooseProjectDirectory();
      if (projectDirectory === null) return;
      try {
        const project = await window.noobi.startPlan({ draftId: draft.id, versionId: draft.version!.id, optionId: selected, ...(projectDirectory ? { projectDirectory } : {}) }, attachedFiles);
        onStarted(project);
      } catch (e) { setDraft(await window.noobi.getPlan(draft.id)); throw e; }
    });
  }
  const generating = draft.status === 'generating';
  const ready = draft.status === 'ready' && draft.version !== null && !draft.run;
  const chosen = draft.version?.options.find(o => o.id === selected);
  return (
    <dialog className="plan-dialog" ref={dialog} aria-labelledby="plan-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(draft, attachedFiles); }}>
      <header className="plan-heading">
        <div><span className="plan-eyebrow">NOOBI · 制作前规划</span><h2 id="plan-title">先选一条玩法路线</h2><p>方案可以先比较、稍后再决定。点击开始制作后才会建立游戏并执行。</p></div>
        <button type="button" className="icon-button" aria-label="稍后选择，关闭方案" disabled={busy} onClick={() => onClose(draft, attachedFiles)}><X size={20} /></button>
      </header>
      <div className="plan-scroll">
        <blockquote className="plan-request">{draft.request}</blockquote>
        <p className="plan-analysis-note">生成方案会调用当前模型，计入分析消耗；此时不生成游戏代码或素材。{draft.attachmentCount > 0 ? ` 本次 ${draft.attachmentCount} 个附件将在开始制作时导入，当前方案仅依据文字；关闭应用后需重新添加附件。` : ''}</p>
        {draft.attachmentCount > 0 && !draft.projectId && <label className="plan-analysis-note">已附加 {attachedFiles.length}/{draft.attachmentCount} 个文件 · 重新添加参考附件 <input type="file" multiple aria-label="重新添加参考附件" disabled={busy || !!draft.run} onChange={e => setAttachedFiles(Array.from(e.target.files ?? []))} /></label>}
        {(error || draft.error || draft.run?.error) && <p className="plan-error" role="alert">{error || draft.error || draft.run?.error}</p>}
        {draft.version?.requiresReview && !generating && <p className="plan-analysis-note" role="status">手动修改已保存并锁定。请点击“校验编辑后的方案”，检查平台、玩法和预算是否冲突；通过后才能开始制作。校验会调用当前模型。</p>}
        {generating && <div className="plan-loading" role="status"><LoaderCircle className="spin" size={26} /><h3>正在整理不同的玩法路线</h3><p>保留你的必需要求，比较核心循环、制作范围与假设。</p><p>尚未开始制作 · 每次规划最多等待 2 分钟</p></div>}
        {!generating && !draft.run && draft.version && <>
          <section className="plan-requirements" aria-label="所有方案的共同必需要求"><h3>每套方案都需保留</h3><ul>{draft.version.requirements.map(r => <li key={r.id}><Check size={14} /><span>{r.text}</span></li>)}</ul></section>
          <fieldset className="plan-options"><legend>比较并选择一套方案</legend>
            {draft.version.options.map((option, index) => <article key={option.id} className={`plan-option${selected === option.id ? ' is-selected' : ''}${editingId === option.id ? ' is-editing' : ''}`}>
              <label className="plan-option-select"><input type="radio" name="game-plan" value={option.id} checked={selected === option.id} disabled={busy || editingId !== null} onChange={() => setSelected(option.id)} /><span className="plan-number">0{index + 1}</span><h3>{option.title}</h3></label>
              <p className="plan-approach">{option.approach}</p>
              <div className="plan-tags"><span>{option.dimension.toUpperCase()}</span><span>{option.platform === 'web' ? '浏览器游玩' : '桌面游玩'}</span></div>
              <h4>核心玩法循环</h4><ol>{option.coreLoop.map((text, i) => <li key={i}>{text}</li>)}</ol>
              <h4>制作范围</h4><ul>{option.features.map((text, i) => <li key={i}>{text}</li>)}</ul>
              {option.design && <dl>{Object.entries(option.design).map(([key, value]) => <div key={key}><dt>{{camera:'镜头',regions:'区域',characters:'角色',style:'风格',budget:'预算与范围'}[key]}</dt><dd>{value}</dd></div>)}</dl>}
              {(draft.locks ?? []).some(l => l.optionId === option.id) && <p>已锁定：{draft.locks!.filter(l => l.optionId === option.id).map(l => planFieldLabel(l.field)).join('、')}</p>}
              {editingId === option.id ? <PlanEditor draft={draft} option={option} onCancel={() => setEditingId(null)} onSaved={next => { setDraft(next); setEditingId(null); setSelected(null); }} /> : <button type="button" disabled={busy || editingId !== null} onClick={() => setEditingId(option.id)}>编辑此方案</button>}
              <details><summary>查看假设、边界与估算</summary><h4>关键假设</h4><ul>{option.assumptions.map((text, i) => <li key={i}>{text}</li>)}</ul><h4>不包含的内容</h4><ul>{option.exclusions.map((text, i) => <li key={i}>{text}</li>)}</ul><p className="plan-estimate">耗时 / 费用：待估算。{option.estimate.basis}</p></details>
            </article>)}
          </fieldset>
          {draft.version.impact && <section className="plan-impact" aria-label="变更影响"><h3>这次修改会影响什么</h3><p>范围：{draft.version.impact.scope.join('；')}</p><p>系统：{draft.version.impact.systems.join('、')}</p><p>存档：{draft.version.impact.saveCompatibility}</p><h4>需要重新验证</h4><ul>{draft.version.impact.regression.map((item, i) => <li key={i}>{item}</li>)}</ul><p>已绑定规划时的工程版本；工程变化后需重新规划。</p></section>}
          {!editingId && <PlanRevisionEditor key={draft.version.id} draft={draft} busy={busy} onRevise={input => action(async () => { setSelected(null); setDraft(await window.noobi.revisePlans({ draftId: draft.id, versionId: draft.version!.id, ...input })); })} />}
          <p className="plan-version">已保存 · 第 {draft.version.number} 版 · {draft.version.authoredBy === 'user' ? '你手动编辑 · 未调用模型' : <>分析用时 {Math.ceil(draft.version.analysisDurationMs / 1000)} 秒 · {draft.version.model ?? '默认模型'} · {draft.version.analysisUsage ? `${draft.version.analysisUsage.totalTokens} tokens` : '模型未上报 token 用量'}</>}</p>
          {!!draft.history?.length && <details className="plan-version-history"><summary>版本历史与差异 · {draft.history.length + 1} 版</summary>{[...draft.history, draft.version].slice().reverse().map(version => <details key={version.id}><summary>第 {version.number} 版 · {version.authoredBy === 'user' ? '手动编辑' : '模型生成'}</summary><p>{new Date(version.createdAt).toLocaleString()}</p><ul>{(version.changes ?? []).map((change, i) => <li key={i}>{change.split(' · ').map(planFieldLabel).join(' · ')}</li>)}</ul>{version.options.map(option => <div key={option.id}><strong>{option.title}</strong><p>{option.approach}</p><ol>{option.coreLoop.map((step, i) => <li key={i}>{step}</li>)}</ol></div>)}</details>)}</details>}
        </>}
        {!generating && !ready && !draft.error && !draft.run && <div className="plan-loading"><h3>规划已取消</h3><p>你的文字需求已保存，可以重新生成。</p></div>}
        {draft.run && <p className="plan-analysis-note">此版本已保留一次启动记录。{draft.run.status === 'dispatched' ? '对应制作任务已经启动，请到项目查看。' : '请先检查项目状态，再重新规划；不会重复创建制作任务。'}</p>}
      </div>
      <footer className="plan-footer">
        <div>{chosen && ready ? <><strong>{chosen.title}</strong><small>将按当前显示的方案版本制作</small></> : <><strong>{generating ? '正在分析需求' : '由你决定什么时候开始'}</strong><small>选择方案不会自动启动</small></>}</div>
        <div className="plan-actions">
          {generating ? <button type="button" disabled={busy} onClick={() => void action(async () => setDraft(await window.noobi.cancelPlan(draft.id)))}>取消生成</button> : !draft.run ? <button type="button" disabled={busy || editingId !== null} onClick={() => void action(async () => { setSelected(null); setDraft(await window.noobi.retryPlan(draft.id)); })}>{draft.version?.requiresReview ? '校验编辑后的方案' : '重新生成'}</button> : null}
          {draft.run && draft.run.status !== 'dispatched' && <button type="button" disabled={busy} onClick={() => void action(async () => {
            setSelected(null); setDraft(await window.noobi.generatePlans({ request: draft.request, projectId: draft.run?.projectId ?? draft.projectId, model: draft.model, effort: draft.effort, attachmentCount: draft.run?.projectId ? 0 : draft.attachmentCount }));
          })}>重新规划</button>}
          <button type="button" className="plan-start" disabled={!ready || draft.version?.requiresReview || !selected || busy || editingId !== null} onClick={() => void start()}>{busy ? <LoaderCircle size={16} className="spin" /> : <ChevronRight size={16} />} {busy ? '正在启动…' : '按此方案开始制作'}</button>
        </div>
      </footer>
    </dialog>
  );
}
