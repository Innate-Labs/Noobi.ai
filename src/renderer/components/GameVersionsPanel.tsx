import React, { useEffect, useRef, useState } from 'react';
import type { ProjectRecord } from '../../shared/contracts';
import type { GameVersion } from '../../shared/gameVersions';
import './gameVersions.css';
const labels = { passed: '交付检查通过', failed: '制作失败', backup: '工程备份 · 未验收', legacy: '历史构建 · 非完整版本' };
export function GameVersionsPanel({ project, refreshSignal, onRestored }: { project: ProjectRecord; refreshSignal: number; onRestored: (project: ProjectRecord) => void }) {
  const [versions, setVersions] = useState<GameVersion[]>([]); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const pending = useRef(false);
  const [exported, setExported] = useState('');
  const [preview, setPreview] = useState<{ version: GameVersion; url: string } | null>(null);
  const [confirm, setConfirm] = useState<GameVersion | null>(null);
  const request = useRef<{ versionId: string; id: string } | null>(null);
  const selection = useRef(project.id); selection.current = project.id;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    void window.noobi.listGameVersions(project.id).then(next => { if (active) setVersions(next); }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [project.id, project.status, refreshSignal]);
  const perform = async (operation: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await operation(); } catch (e) { if (mounted.current && selection.current === project.id) setError(String(e)); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const play = (version: GameVersion) => void perform(async () => {
    const url = await window.noobi.previewGameVersion(project.id, version.id);
    if (mounted.current && selection.current === project.id) setPreview({ version, url });
  });
  const backup = () => void perform(async () => {
    await window.noobi.backupGameVersion(project.id);
    const next = await window.noobi.listGameVersions(project.id); if (mounted.current && selection.current === project.id) setVersions(next);
  });
  const exportWeb = (version: GameVersion) => void perform(async () => {
    setExported('');
    const result = await window.noobi.exportGameVersionWeb(project.id, version.id);
    if (result && mounted.current && selection.current === project.id) setExported(`已导出 ${result.files} 个文件：${result.path}。这是 Web 试玩包，请按包内说明通过 HTTP 服务打开。`);
  });
  const restore = () => void perform(async () => {
    if (!confirm) return;
    if (request.current?.versionId !== confirm.id) request.current = { versionId: confirm.id, id: crypto.randomUUID() };
    const result = await window.noobi.restoreGameVersion({ projectId: project.id, versionId: confirm.id, requestId: request.current.id });
    if (mounted.current && selection.current === project.id) { setConfirm(null); onRestored(result.project); }
  });
  const latest = versions.find(version => version.kind === 'passed' && version.canPreview);
  return <details className="game-versions">
    <summary>版本历史与恢复 <small>{versions.length} 条记录</small></summary>
    <div className="game-versions-content">
      <p>当前工程可能包含尚未通过检查的修改。历史试玩使用保存的产物，不修改当前工程。</p>
      <div className="version-actions">
        <button type="button" disabled={!latest || busy} onClick={() => latest && play(latest)}>试玩最后通过检查的版本</button>
        <button type="button" disabled={busy || project.status === 'running'} onClick={backup}>保存当前工程备份</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {exported && <p role="status">{exported}</p>}
      {!versions.length && <p>尚无完整版本记录。可先保存备份；之后成功交付会自动存档。</p>}
      <ol>{versions.map(version => <li key={version.id}>
        <div><strong>{version.title}</strong><small>{labels[version.kind]} · {new Date(version.createdAt).toLocaleString('zh-CN')}</small></div>
        <p>{version.planTitle ? `方案：${version.planTitle}` : '没有完整方案绑定'} · {version.fileCount} 个文件</p>
        <p>{version.summary}</p>
        {version.changes && <p>相对上一工程存档：新增 {version.changes.added}、修改 {version.changes.modified}、删除 {version.changes.removed} 个文件</p>}
        {version.error && <p role="note" className="version-error">{version.error}</p>}
        <div className="version-actions">
          <button type="button" disabled={busy || !version.canPreview} onClick={() => play(version)}>试玩此存档</button>
          <button type="button" disabled={busy || !version.canPreview} onClick={() => exportWeb(version)}>导出 Web 试玩包</button>
          <button type="button" disabled={busy || !version.canRestore || project.status === 'running'} onClick={() => { request.current = null; setConfirm(version); }}>恢复为独立副本</button>
        </div>
      </li>)}</ol>
      {confirm && <section className="version-confirm" aria-label="确认恢复版本">
        <strong>恢复「{confirm.title}」</strong>
        <p>将先备份当前工程，再创建包含此版本代码、方案和素材的独立副本。原项目及后来上传的资料保留在原处；副本不会自动开始制作。</p>
        <div className="version-actions"><button type="button" disabled={busy} onClick={() => setConfirm(null)}>取消</button>
          <button type="button" disabled={busy} onClick={restore}>{busy ? '正在恢复…' : '保存备份并创建恢复副本'}</button></div>
      </section>}
      {preview && <section className="version-playback">
        <p>正在试玩：{preview.version.title} · {labels[preview.version.kind]}。历史检查不代表当前工程已通过。</p>
        <button type="button" onClick={() => setPreview(null)}>关闭历史试玩</button>
        <iframe title="历史版本试玩" src={preview.url} sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="autoplay; fullscreen; gamepad" />
      </section>}
    </div>
  </details>;
}
