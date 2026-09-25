import { useState } from 'react';
import type { PlanDesign, PlanDraft, PlanEditableField, PlanFieldLock, PlanOption } from '../../shared/planning';
import { toMessage } from '../ui';
import './planEditing.css';

const labels: Record<PlanEditableField, string> = { title: '方案名称', approach: '玩法方向', engine: '引擎', dimension: '维度', platform: '游玩平台', coreLoop: '核心循环', features: '制作范围', assumptions: '假设与待确认项', exclusions: '不包含的内容', design: '镜头与美术等制作细节' };
const designLabels: Record<keyof PlanDesign, string> = { camera: '镜头', regions: '区域与关卡', characters: '角色', style: '美术风格', budget: '预算与范围约束' };
export const planFieldLabel = (field: string) => labels[field as PlanEditableField] ?? field;
export function PlanEditor({ draft, option, onSaved, onCancel }: { draft: PlanDraft; option: PlanOption; onSaved(draft: PlanDraft): void; onCancel(): void }) {
  const [value, setValue] = useState(() => structuredClone(option));
  const [locks, setLocks] = useState<PlanFieldLock[]>(() => structuredClone(draft.locks ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = (field: PlanEditableField) => locks.some(l => l.optionId === option.id && l.field === field);
  const patch = (field: PlanEditableField, next: unknown) => setValue(v => ({ ...v, [field]: next }));
  const lockControl = (field: PlanEditableField) => <label className="plan-lock"><input type="checkbox" checked={locked(field)} disabled={busy} onChange={e => setLocks(current => e.target.checked ? [...current, { optionId: option.id, field }] : current.filter(l => l.optionId !== option.id || l.field !== field))} />锁定{labels[field]}</label>;
  async function save() {
    if (busy) return; setBusy(true); setError('');
    try { onSaved(await window.noobi.savePlanEdits({ draftId: draft.id, versionId: draft.version!.id, option: value, locks })); }
    catch (e) { setError(toMessage(e)); }
    finally { setBusy(false); }
  }
  return <section className="plan-editor" aria-label={`编辑${option.title}`}>
    <p>保存会形成新版本，并自动锁定你改过的字段。保存后先校验冲突，再开始制作；后续要调整这些字段时请先解锁。</p>
    {error && <p role="alert" className="plan-error">{error}</p>}
    {(['title', 'approach'] as const).map(field => <div className="plan-edit-field" key={field}><label>{labels[field]}<textarea aria-label={labels[field]} value={value[field]} maxLength={2000} disabled={busy || locked(field)} onChange={e => patch(field, e.target.value)} /></label>{lockControl(field)}</div>)}
    <div className="plan-edit-grid">{(['dimension', 'platform', 'engine'] as const).map(field => <div className="plan-edit-field" key={field}><label>{labels[field]}<select aria-label={labels[field]} value={value[field]} disabled={busy || locked(field) || (field === 'engine' && !!draft.projectId)} onChange={e => patch(field, e.target.value)}>{(field === 'dimension' ? [['2d', '2D'], ['3d', '3D']] : field === 'platform' ? [['web', '浏览器'], ['desktop', '桌面']] : [['godot', 'Godot'], ['web', 'Web']]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{lockControl(field)}</div>)}</div>
    {(['coreLoop', 'features', 'assumptions', 'exclusions'] as const).map(field => <div className="plan-edit-field" key={field}><label>{labels[field]}（每行一项）<textarea aria-label={labels[field]} rows={4} value={value[field].join('\n')} disabled={busy || locked(field)} maxLength={16000} onChange={e => patch(field, e.target.value.split('\n'))} /></label>{lockControl(field)}</div>)}
    <fieldset><legend>制作细节</legend>{lockControl('design')}{(Object.keys(designLabels) as Array<keyof PlanDesign>).map(field => <label className="plan-design-field" key={field}>{designLabels[field]}<textarea aria-label={designLabels[field]} maxLength={2000} rows={2} disabled={busy || locked('design')} value={value.design?.[field] ?? ''} placeholder="未指定，沿用原需求；不会编造费用估算" onChange={e => patch('design', { camera: '沿用原需求，具体待确认', regions: '沿用原需求，具体待确认', characters: '沿用原需求，具体待确认', style: '沿用原需求，具体待确认', budget: '费用未知，按原范围制作', ...value.design, [field]: e.target.value })} /></label>)}</fieldset>
    <div className="plan-edit-actions"><button type="button" disabled={busy} onClick={onCancel}>取消未保存编辑</button><button type="button" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存为新版本'}</button></div>
  </section>;
}

export function PlanRevisionEditor({ draft, busy, onRevise }: { draft: PlanDraft; busy: boolean; onRevise(input: { instruction: string; importedPlan?: string; mergeOptionId?: string }): Promise<void> }) {
  const [instruction, setInstruction] = useState('');
  const [importedPlan, setImportedPlan] = useState('');
  const [mergeOptionId, setMerge] = useState('');
  const [error, setError] = useState('');
  async function read(file: File | undefined) {
    if (!file) return; setError('');
    try {
      if (!/\.(md|txt)$/iu.test(file.name) || file.size > 48000) throw new Error('请选择不超过 48 KB 的 Markdown 或 TXT 计划');
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (!content.trim() || content.length > 12000 || content.includes('\0')) throw new Error('计划需为 1–12000 字的 UTF-8 文本');
      setImportedPlan(content);
    } catch (e) { setError(toMessage(e)); }
  }
  return <details className="plan-revision"><summary>用文字调整、组合方案或导入我的计划</summary>
    <p>会调用当前模型生成新版本。保留原始要求和锁定字段；存在冲突时先说明，不能直接开始制作。</p>
    {error && <p className="plan-error" role="alert">{error}</p>}
    <label>修改说明<textarea aria-label="方案修改说明" value={instruction} maxLength={3000} rows={3} disabled={busy} placeholder="例如：保留 A 的自由探索，加入 B 的方向提示，不增加地图" onChange={e => setInstruction(e.target.value)} /></label>
    <label>参考组合方案<select aria-label="参考组合方案" disabled={busy} value={mergeOptionId} onChange={e => setMerge(e.target.value)}><option value="">不组合</option>{draft.version?.options.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</select></label>
    <label>导入文本计划<input type="file" accept=".md,.txt,text/plain,text/markdown" aria-label="导入文本计划" disabled={busy} onChange={e => void read(e.target.files?.[0])} /></label>
    <label>我的计划（可直接粘贴）<textarea aria-label="我的文本计划" rows={5} maxLength={12000} value={importedPlan} disabled={busy} onChange={e => setImportedPlan(e.target.value)} /></label>
    <button type="button" disabled={busy || !instruction.trim()} onClick={() => void onRevise({ instruction, ...(importedPlan.trim() ? { importedPlan } : {}), ...(mergeOptionId ? { mergeOptionId } : {}) })}>生成修改后的方案</button>
  </details>;
}
