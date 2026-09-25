import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import type { ReferenceSelection, ReferenceSpec, VisualReference } from '../../shared/visualReferences';
import { REFERENCE_PURPOSES } from '../../shared/visualReferences';
import type { PlanDraft } from '../../shared/planning';
import { toMessage } from '../ui';
import './visualReferences.css';
const purposeLabels = { style: '美术风格', character: '角色造型', layout: '场景布局', ui: '游戏界面' };
const specLabels = { style: '美术风格', camera: '镜头与视角', scene: '场景与空间', ui: '游戏界面' };

export function VisualReferencePicker({ value, disabled, onChange, onBusy }: { value: ReferenceSelection[]; disabled: boolean; onChange(value: ReferenceSelection[]): void; onBusy(value: boolean): void }) {
  const [records, setRecords] = useState<VisualReference[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function add(files: File[]) {
    if (busy || disabled || !files.length) return;
    if (value.length + files.length > 5) { setError('最多 5 张参考图，请先移除不需要的图片'); return; }
    setBusy(true); onBusy(true); setError('');
    try {
      const imported = await window.noobi.importVisualReferences(files);
      const fresh = imported.filter((record, index) => !value.some(v => v.id === record.id) && imported.findIndex(r => r.id === record.id) === index);
      setRecords(current => [...current, ...fresh]);
      onChange([...value, ...fresh.map(record => ({ id: record.id, purpose: 'style' as const }))]);
    } catch (e) { setError(toMessage(e)); }
    finally { setBusy(false); onBusy(false); }
  }
  return <section className="visual-reference-picker" aria-label="游戏视觉参考">
    <div className="reference-picker-heading"><button type="button" disabled={disabled || busy || value.length >= 5} onClick={() => input.current?.click()}><ImagePlus size={16} />{busy ? '正在读取参考图…' : '添加游戏参考图'}</button><span>先看图规划 · 可指定借鉴的部分</span></div>
    <input ref={input} className="sr-only" type="file" multiple accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" aria-label="上传游戏视觉参考" disabled={disabled || busy} onChange={e => { void add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
    {error && <p className="plan-error" role="alert">{error}</p>}
    {!!value.length && <div className="reference-strip">{value.map(selection => {
      const record = records.find(r => r.id === selection.id);
      return <article className="reference-card" key={selection.id}>
        {record && <img src={record.thumbnail} alt={`参考图：${record.name}`} />}
        <div><strong>{record?.name ?? '参考图片'}</strong><small>{record ? `${record.width} × ${record.height} · 已保存` : '已保存'}</small><label>借鉴<select aria-label={`${record?.name ?? '图片'}的参考用途`} disabled={disabled || busy} value={selection.purpose} onChange={e => onChange(value.map(v => v.id === selection.id ? { ...v, purpose: e.target.value as ReferenceSelection['purpose'] } : v))}>{REFERENCE_PURPOSES.map(p => <option key={p} value={p}>{purposeLabels[p]}</option>)}</select></label></div>
        <button type="button" className="reference-remove" aria-label={`移除参考图 ${record?.name ?? ''}`} disabled={disabled || busy} onClick={() => onChange(value.filter(v => v.id !== selection.id))}><X size={15} /></button>
      </article>;
    })}</div>}
  </section>;
}

export function ReferenceUnderstanding({ draft, disabled, onSaved, onEditing }: { draft: PlanDraft; disabled: boolean; onSaved(draft: PlanDraft): void; onEditing(value: boolean): void }) {
  const [records, setRecords] = useState<VisualReference[]>([]);
  const [edit, setEdit] = useState<ReferenceSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { onEditing(Boolean(edit)); return () => onEditing(false); }, [Boolean(edit), onEditing]);
  useEffect(() => {
    let live = true;
    void window.noobi.getVisualReferences((draft.references ?? []).map(r => r.id)).then(r => { if (live) setRecords(r); }).catch(e => { if (live) setError(toMessage(e)); });
    return () => { live = false; };
  }, [draft.id]);
  const spec = draft.version?.referenceSpec;
  async function save() {
    if (!edit || !draft.version || busy) return;
    setBusy(true); setError('');
    try { onSaved(await window.noobi.saveReferenceSpec({ draftId: draft.id, versionId: draft.version.id, spec: edit })); setEdit(null); }
    catch (e) { setError(toMessage(e)); } finally { setBusy(false); }
  }
  return <section className="reference-understanding" aria-label="参考图理解">
    <header><div><span>你的图片 → 制作依据</span><h3>先确认我们看到了什么</h3></div>{spec && !edit && <button type="button" disabled={disabled || busy} onClick={() => setEdit(structuredClone(spec))}>修正理解</button>}</header>
    {error && <p className="plan-error" role="alert">{error}</p>}
    <div className="reference-strip">{records.map(record => <figure className="reference-evidence" key={record.id}><img src={record.thumbnail} alt={record.name} /><figcaption>{record.name}<small>{purposeLabels[draft.references!.find(r => r.id === record.id)!.purpose]} · {record.width} × {record.height}</small></figcaption></figure>)}</div>
    {!spec ? <p>这些图片将作为实际图像输入交给规划模型；分析尚未完成。</p> : edit ? <>
      <p>修正会保存为新版本，并用于重新校验方案。图片未展示的玩法请放在推断或未知项中。</p>
      {(Object.keys(specLabels) as Array<keyof typeof specLabels>).map(key => <label key={key}>{specLabels[key]}<textarea aria-label={`修正${specLabels[key]}`} value={edit[key]} maxLength={2000} disabled={busy || disabled} onChange={e => setEdit({ ...edit, [key]: e.target.value })} /></label>)}
      <h4>可见事实</h4>{edit.facts.map((fact, i) => <label key={i}>{records.find(r => r.id === fact.referenceId)?.name ?? '参考图'}<textarea aria-label={`修正观察事实 ${i + 1}`} value={fact.observation} maxLength={2000} disabled={busy || disabled} onChange={e => setEdit({ ...edit, facts: edit.facts.map((f, j) => i === j ? { ...f, observation: e.target.value } : f) })} /></label>)}
      {(['inferences', 'unknowns'] as const).map(key => <label key={key}>{key === 'inferences' ? '玩法推断与设计建议' : '尚不确定'}（每行一项）<textarea aria-label={`修正${key}`} rows={3} value={edit[key].join('\n')} maxLength={12000} disabled={busy || disabled} onChange={e => setEdit({ ...edit, [key]: e.target.value.split('\n') })} /></label>)}
      <div className="reference-edit-actions"><button type="button" disabled={busy} onClick={() => setEdit(null)}>取消修正</button><button type="button" disabled={busy || disabled} onClick={() => void save()}>{busy ? '保存中…' : '保存理解并用于下一版方案'}</button></div>
    </> : <>
      <dl className="reference-spec-grid">{(Object.keys(specLabels) as Array<keyof typeof specLabels>).map(key => <div key={key}><dt>{specLabels[key]}</dt><dd>{spec[key]}</dd></div>)}</dl>
      <div className="reference-observations"><section><h4>可见事实</h4><ul>{spec.facts.map((fact, i) => <li key={i}>{fact.observation}<small>来自 {records.find(r => r.id === fact.referenceId)?.name ?? '参考图'}</small></li>)}</ul></section><section><h4>玩法推断与建议</h4><ul>{spec.inferences.map((s, i) => <li key={i}>{s}</li>)}</ul><h4>尚不确定</h4><ul>{spec.unknowns.map((s, i) => <li key={i}>{s}</li>)}</ul></section></div>
      <p className="reference-source-note">{draft.version?.referenceSpecAuthor === 'user' ? '已采用你的修正' : '模型依据实际图片整理'} · 单张截图不能证明完整玩法或隐藏规则。</p>
    </>}
  </section>;
}
