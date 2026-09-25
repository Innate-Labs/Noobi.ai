import { useEffect, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import type { PlanDraft } from '../../shared/planning';
import { VIDEO_PURPOSES, type VideoClip, type VideoSelection, type VideoSource, type VideoSpec } from '../../shared/videoReferences';
import { toMessage } from '../ui';
import './visualReferences.css';
const labels = { gameplay: '玩法与动作', style: '美术风格', layout: '场景布局', ui: '游戏界面' };
const kinds = { play: '可见游玩', cut: '疑似剪辑', replay: '疑似回放', cutscene: '疑似过场', uncertain: '尚不确定' };
const time = (value: number) => `${Math.floor(value / 60)}:${(value % 60).toFixed(2).padStart(5, '0')}`;
function ClipPreview({ clip }: { clip: VideoClip }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  return <div className="video-clip-preview">
    <video ref={video} controls muted preload="metadata" src={clip.source.previewUrl} aria-label="参考片段预览" onLoadedMetadata={() => { if (video.current) video.current.currentTime = clip.start; }} onTimeUpdate={() => { if (video.current && video.current.currentTime > clip.end) video.current.pause(); }} onError={() => setError('当前播放器不支持此编码，可通过下面的关键帧定位和检查画面。')} />
    {error && <p role="status">{error}</p>}
    <p>{clip.source.name} · 关注 {time(clip.start)}–{time(clip.end)} · 未分析音频</p>
    <div className="video-frame-strip">{clip.frames.map(f => <button type="button" key={f.id} onClick={() => { if (video.current) { video.current.currentTime = f.time; video.current.pause(); } }} aria-label={`查看视频 ${time(f.time)}`}><img src={f.thumbnail} alt={`关键帧 ${time(f.time)}`} /><span>{time(f.time)}</span></button>)}</div>
    <small>{clip.limitations.join(' ')}</small>
  </div>;
}
export function VideoReferencePicker({ disabled, onChange, onBusy }: { disabled: boolean; onChange(value: VideoSelection | null): void; onBusy(value: boolean): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<VideoSource | null>(null), [clip, setClip] = useState<VideoClip | null>(null);
  const [start, setStart] = useState(0), [end, setEnd] = useState(30), [purpose, setPurpose] = useState<VideoSelection['purpose']>('gameplay');
  const [busy, setBusy] = useState(false), [requestId, setRequestId] = useState(''), [error, setError] = useState('');
  useEffect(() => { onBusy(busy || Boolean(source && !clip)); }, [busy, source, clip, onBusy]);
  async function add(file?: File) {
    if (!file) return; const id = crypto.randomUUID(); setRequestId(id); setBusy(true); setError('');
    try { const record = await window.noobi.importVideoReference(file, id); setSource(record); setClip(null); onChange(null); setStart(0); setEnd(Math.min(120, record.duration)); }
    catch (e) { setError(toMessage(e)); } finally { setBusy(false); setRequestId(''); }
  }
  async function prepare() {
    if (!source) return; const id = crypto.randomUUID(); setRequestId(id); setBusy(true); setError('');
    try { const result = await window.noobi.prepareVideoReference({ sourceId: source.id, start, end, requestId: id }); setClip(result); onChange({ clipId: result.id, purpose }); }
    catch (e) { setError(toMessage(e)); } finally { setBusy(false); setRequestId(''); }
  }
  function rangeChange(setter: (n: number) => void, value: number) { setter(value); setClip(null); onChange(null); }
  return <section className="visual-reference-picker video-reference-picker" aria-label="游戏视频参考">
    <div className="reference-picker-heading"><button type="button" disabled={disabled || busy} onClick={() => input.current?.click()}><Film size={16} />{busy ? '正在处理视频…' : '添加游戏片段'}</button><span>MP4/MOV · 最多 200 MiB · 选择最多 120 秒</span></div>
    <input ref={input} type="file" className="sr-only" aria-label="上传游戏视频参考" accept=".mp4,.mov,video/mp4,video/quicktime" disabled={disabled || busy} onChange={e => { void add(e.target.files?.[0]); e.target.value = ''; }} />
    {error && <p className="plan-error" role="alert">{error}</p>}
    {!source && requestId && <button type="button" onClick={() => void window.noobi.cancelVideoReference(requestId)}>取消读取视频</button>}
    {source && <div className="video-selection">
      <strong>{source.name} · {time(source.duration)} · {source.width} × {source.height}</strong>
      {!clip && <video controls muted preload="metadata" src={source.previewUrl} aria-label="选择关注片段前预览" />}
      <div className="video-range"><label>开始（秒）<input type="number" aria-label="片段开始秒数" min={0} max={source.duration - 1} step="0.1" value={start} disabled={busy || disabled} onChange={e => rangeChange(setStart, Number(e.target.value))} /></label><label>结束（秒）<input type="number" aria-label="片段结束秒数" min={1} max={source.duration} step="0.1" value={end} disabled={busy || disabled} onChange={e => rangeChange(setEnd, Number(e.target.value))} /></label><label>借鉴<select aria-label="视频参考用途" value={purpose} disabled={busy || disabled} onChange={e => { const next = e.target.value as VideoSelection['purpose']; setPurpose(next); if (clip) onChange({ clipId: clip.id, purpose: next }); }}>{VIDEO_PURPOSES.map(p => <option key={p} value={p}>{labels[p]}</option>)}</select></label></div>
      <div className="reference-edit-actions"><button type="button" disabled={busy || disabled} onClick={() => { setSource(null); setClip(null); onChange(null); }}>移除视频</button>{requestId ? <button type="button" onClick={() => void window.noobi.cancelVideoReference(requestId)}>取消处理</button> : <button type="button" disabled={busy || disabled} onClick={() => void prepare()}>{clip ? '重新检查片段' : '提取关键帧'}</button>}</div>
      {clip && <ClipPreview clip={clip} />}
    </div>}
  </section>;
}
export function VideoUnderstanding({ draft, disabled, onSaved, onEditing }: { draft: PlanDraft; disabled: boolean; onSaved(draft: PlanDraft): void; onEditing(value: boolean): void }) {
  const [clip, setClip] = useState<VideoClip | null>(null), [edit, setEdit] = useState<VideoSpec | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; if (draft.video) void window.noobi.getVideoReference(draft.video.clipId).then(c => { if (live) setClip(c); }).catch(e => { if (live) setError(toMessage(e)); }); return () => { live = false; }; }, [draft.video?.clipId]);
  useEffect(() => { onEditing(Boolean(edit)); return () => onEditing(false); }, [Boolean(edit), onEditing]);
  const spec = edit ?? draft.version?.videoSpec;
  async function save() { if (!edit || !draft.version) return; setBusy(true); setError(''); try { onSaved(await window.noobi.saveVideoSpec({ draftId: draft.id, versionId: draft.version.id, spec: edit })); setEdit(null); } catch (e) { setError(toMessage(e)); } finally { setBusy(false); } }
  return <section className="reference-understanding" aria-label="视频理解时间轴">
    <header><div><span>游戏片段 → 制作依据</span><h3>画面发生了什么，哪些还不能确定</h3></div>{spec && !edit && <button type="button" disabled={disabled} onClick={() => setEdit(structuredClone(spec))}>修正视频理解</button>}</header>
    {error && <p role="alert" className="plan-error">{error}</p>}{clip && <ClipPreview clip={clip} />}
    {!spec ? <p>将按时间顺序分析真实关键帧，尚未完成理解。</p> : <>
      <ol className="video-events">{spec.events.map((event, i) => <li key={i}><strong>{time(event.start)}–{time(event.end)} · {kinds[event.kind]}</strong>{edit ? <><textarea aria-label={`修正视频事件 ${i + 1}`} value={event.observation} maxLength={2000} disabled={busy} onChange={e => setEdit({ ...edit, events: edit.events.map((v, j) => j === i ? { ...v, observation: e.target.value } : v) })} /><select aria-label={`事件 ${i + 1} 类别`} value={event.kind} disabled={busy} onChange={e => setEdit({ ...edit, events: edit.events.map((v, j) => j === i ? { ...v, kind: e.target.value as typeof event.kind } : v) })}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></> : <p>{event.observation}</p>}<small>时间证据：{event.frameIds.map(id => time(clip?.frames.find(f => f.id === id)?.time ?? event.start)).join('、')}</small></li>)}</ol>
      <h4>可见变化与规则假设</h4>{spec.rules.map((rule, i) => <div key={i}><strong>{rule.basis === 'visible' ? '可见变化' : rule.frameIds.length ? '规则假设' : '新增建议 · 无直接画面证据'}</strong>{edit ? <><textarea aria-label={`修正视频规则 ${i + 1}`} value={rule.text} maxLength={2000} disabled={busy} onChange={e => setEdit({ ...edit, rules: edit.rules.map((v, j) => j === i ? { ...v, text: e.target.value } : v) })} /><select aria-label={`规则 ${i + 1} 依据`} value={rule.basis} disabled={busy} onChange={e => setEdit({ ...edit, rules: edit.rules.map((v, j) => j === i ? { ...v, basis: e.target.value as typeof rule.basis } : v) })}><option value="visible">可见变化</option><option value="hypothesis">规则假设</option></select></> : <p>{rule.text}</p>}</div>)}
      <h4>尚不确定</h4>{edit ? <textarea aria-label="修正视频未知项" value={edit.unknowns.join('\n')} disabled={busy} onChange={e => setEdit({ ...edit, unknowns: e.target.value.split('\n') })} /> : <ul>{spec.unknowns.map((s, i) => <li key={i}>{s}</li>)}</ul>}
      <h4>按你的要求改编</h4>{edit ? <textarea aria-label="视频改编要求" value={edit.adaptation} maxLength={2000} disabled={busy} onChange={e => setEdit({ ...edit, adaptation: e.target.value })} /> : <p>{spec.adaptation}</p>}
      {edit && <div className="reference-edit-actions"><button type="button" disabled={busy} onClick={() => setEdit(null)}>取消修正</button><button type="button" disabled={busy || disabled} onClick={() => void save()}>保存视频理解并校验方案</button></div>}
    </>}
  </section>;
}
