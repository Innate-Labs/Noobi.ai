import {
  AlertTriangle,
  Box,
  CircleDashed,
  CheckCircle2,
  ChevronRight,
  Code2,
  ExternalLink,
  Eye,
  File,
  Files,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Music2,
  MonitorPlay,
  PackageOpen,
  PlayCircle,
  RotateCw,
  Square,
  RefreshCw,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';

import type {
  AssetPlanRecord,
  AppSettings,
  FileNode,
  FileReadResult,
  GameAssetRecord,
  GameplayExperienceCheck,
  GameplayExperienceReport,
  PipelineStage,
  NoobiCrewMember,
  ProjectInspectorPayload,
  ProjectRecord,
} from '../../shared/contracts';
import {
  DEFAULT_NOOBI_CREW,
  DEFAULT_NOOBI_SCENE_ID,
} from '../../shared/contracts';
import { toMessage } from '../ui';
import { ProductionDiorama } from './ProductionDiorama';
import {
  NoobiCrewPicker,
  NOOBI_CREW_ROLE_OPTIONS,
} from './NoobiCrewPicker';
import { NOOBI_PACK_OPTIONS } from './NoobiPackPicker';

interface InspectorProps {
  project: ProjectRecord;
  settings: AppSettings;
  activityStage: PipelineStage;
  refreshSignal: number;
  onError: (message: string) => void;
  onRegenerate: (plan: AssetPlanRecord) => Promise<void>;
  onProjectUpdated: (project: ProjectRecord) => void;
}

type InspectorTab = 'preview' | 'assets' | 'files';

export function Inspector({
  project,
  settings,
  activityStage,
  refreshSignal,
  onError,
  onRegenerate,
  onProjectUpdated,
}: InspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('preview');
  const [payload, setPayload] = useState<ProjectInspectorPayload>({
    files: [],
    previewUrl: '',
    assets: [],
    assetPlans: [],
    imageGenerationGate: { state: 'missing', relativePaths: [] },
    experienceReport: null,
  });
  const [selectedFile, setSelectedFile] = useState<FileReadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [retryingPlanId, setRetryingPlanId] = useState<string | null>(null);
  const [evaluatingExperience, setEvaluatingExperience] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [showBuildPreview, setShowBuildPreview] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [crewSaving, setCrewSaving] = useState(false);
  const [crewEditorOpen, setCrewEditorOpen] = useState(false);
  const [assetNotice, setAssetNotice] = useState<{
    message: string;
    tone: 'success' | 'neutral';
  } | null>(null);
  const dragDepth = useRef(0);
  const crewToggleRef = useRef<HTMLButtonElement>(null);
  const experienceCancelRequested = useRef(false);
  const previousProjectStatus = useRef(project.status);
  const imageGate = payload.imageGenerationGate;
  const hasGeneratedImage = imageGate.state === 'trusted-referenced';
  const terminal = ['completed', 'failed', 'stopped'].includes(project.status);
  const requirementState = hasGeneratedImage
    ? 'is-satisfied'
    : terminal
      ? 'is-error'
      : 'is-pending';
  const showExperienceReport = evaluatingExperience
    || project.status === 'completed'
    || (project.status === 'failed' && payload.experienceReport !== null);
  const showProductionScene = !payload.previewUrl
    || (project.status === 'running' && !showBuildPreview);
  const resolvedNoobiPackId = project.noobiPackOverrideId
    ?? settings.defaultNoobiPackId
    ?? 'classic';
  const globalNoobiCrew = settings.defaultNoobiCrew ?? DEFAULT_NOOBI_CREW;
  const resolvedNoobiCrew = project.noobiCrewOverride ?? globalNoobiCrew;
  const resolvedNoobiSceneId = settings.defaultNoobiSceneId ?? DEFAULT_NOOBI_SCENE_ID;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPayload(await window.noobi.inspectProject(project.id));
      setPreviewRevision((value) => value + 1);
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setLoading(false);
    }
  }, [onError, project.id]);

  useEffect(() => {
    setSelectedFile(null);
    setTab('preview');
    setAssetNotice(null);
    setShowBuildPreview(false);
    setCrewEditorOpen(false);
    void refresh();
  }, [project.id, refresh]);

  useEffect(() => {
    if (project.status === 'running' && previousProjectStatus.current !== 'running') {
      setShowBuildPreview(false);
    }
    previousProjectStatus.current = project.status;
  }, [project.status]);

  useEffect(() => {
    if (refreshSignal > 0) void refresh();
  }, [refresh, refreshSignal]);

  useEffect(() => {
    if (tab !== 'preview') setCrewEditorOpen(false);
  }, [tab]);

  useEffect(() => {
    if (project.status === 'completed' || project.status === 'failed' || project.status === 'stopped') {
      void refresh();
    }
  }, [project.status, refresh]);

  useEffect(
    () =>
      window.noobi.onAssetsChanged(({ projectId, assets }) => {
        if (projectId !== project.id) return;
        setPayload((current) => ({ ...current, assets }));
        // Asset events do not carry the host-owned generation gate. Reinspect so
        // the UI never infers trust from public manifest fields.
        void refresh();
      }),
    [project.id, refresh],
  );

  useEffect(
    () =>
      window.noobi.onAssetPlansChanged(({ projectId, assetPlans }) => {
        if (projectId !== project.id) return;
        setPayload((current) => ({ ...current, assetPlans }));
      }),
    [project.id],
  );

  async function regenerate(plan: AssetPlanRecord) {
    setRetryingPlanId(plan.id);
    try {
      await onRegenerate(plan);
    } finally {
      setRetryingPlanId(null);
    }
  }

  async function selectNoobiCrew(noobiCrewOverride: readonly NoobiCrewMember[] | null) {
    if (project.status === 'running' || crewSaving) return;
    setCrewSaving(true);
    try {
      onProjectUpdated(await window.noobi.saveProjectNoobiCrew(project.id, noobiCrewOverride));
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setCrewSaving(false);
    }
  }

  async function openFile(relativePath: string) {
    try {
      setSelectedFile(
        await window.noobi.readProjectFile(project.id, relativePath),
      );
    } catch (error) {
      onError(toMessage(error));
    }
  }

  async function importAssets() {
    setAssetNotice(null);
    setImporting(true);
    try {
      const assets = await window.noobi.importProjectAssets(project.id);
      setPayload((current) => ({ ...current, assets }));
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setImporting(false);
    }
  }

  async function evaluateExperience() {
    experienceCancelRequested.current = false;
    setEvaluatingExperience(true);
    try {
      const experienceReport = await window.noobi.evaluateProjectExperience(project.id);
      setPayload((current) => ({ ...current, experienceReport }));
      setPreviewRevision((value) => value + 1);
    } catch (error) {
      if (!experienceCancelRequested.current) onError(toMessage(error));
    } finally {
      experienceCancelRequested.current = false;
      setEvaluatingExperience(false);
    }
  }

  async function cancelExperience() {
    experienceCancelRequested.current = true;
    try {
      await window.noobi.cancelProjectExperience(project.id);
    } catch (error) {
      experienceCancelRequested.current = false;
      onError(toMessage(error));
    }
  }

  async function importDroppedImages(files: readonly File[]) {
    setAssetNotice(null);
    if (project.status === 'running') {
      onError('Agent 运行期间不可拖入图片。');
      return;
    }
    const images = files.filter((file) =>
      /^image\/(?:png|jpeg|webp)$/iu.test(file.type)
      || /\.(?:jpe?g|png|webp)$/iu.test(file.name));
    if (images.length === 0) {
      onError('拖拽仅支持 PNG、JPEG 和 WebP 图片。');
      return;
    }
    const ignoredCount = files.length - images.length;
    setImporting(true);
    try {
      const assets = await window.noobi.importDroppedProjectAssets(project.id, images);
      setPayload((current) => ({ ...current, assets }));
      setTab('assets');
      setAssetNotice({
        message: `已导入 ${images.length} 张图片${ignoredCount > 0 ? `，忽略 ${ignoredCount} 个非图片文件` : ''}。`,
        tone: ignoredCount > 0 ? 'neutral' : 'success',
      });
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setImporting(false);
    }
  }

  function hasDraggedFiles(event: DragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes('Files');
  }

  return (
    <aside
      className={`inspector${dragActive ? ' is-dragging-assets' : ''}`}
      onDragEnter={(event) => {
        if (!hasDraggedFiles(event) || project.status === 'running') return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragActive(true);
      }}
      onDragOver={(event) => {
        if (!hasDraggedFiles(event) || project.status === 'running') return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (!hasDraggedFiles(event)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragActive(false);
      }}
      onDrop={(event) => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragActive(false);
        void importDroppedImages(Array.from(event.dataTransfer.files));
      }}
    >
      {dragActive ? (
        <div className="asset-drop-overlay" role="status" aria-live="polite">
          <Upload size={28} />
          <strong>松开以导入图片</strong>
          <span>PNG · JPEG · WEBP / 最多 50 张</span>
        </div>
      ) : null}
      <div className="inspector-tabs" role="tablist" aria-label="项目检查器">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'preview'}
          className={tab === 'preview' ? 'is-active' : ''}
          onClick={() => setTab('preview')}
        >
          <Eye size={14} /> 预览
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'assets'}
          className={tab === 'assets' ? 'is-active' : ''}
          onClick={() => setTab('assets')}
        >
          <PackageOpen size={14} /> 素材
          <span>{expandedAssetCount(payload.assets) + unresolvedPlans(payload.assetPlans).length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'files'}
          className={tab === 'files' ? 'is-active' : ''}
          onClick={() => setTab('files')}
        >
          <Files size={14} /> 文件
          <span>{payload.files.length}</span>
        </button>
      </div>

      <div className="inspector-toolbar">
        <span>
          {tab === 'preview'
            ? showProductionScene ? 'NOOBI PRODUCTION STUDIO' : 'LOCAL GAME PREVIEW'
            : tab === 'assets'
              ? 'GAME ASSET LIBRARY'
              : 'PROJECT FILES'}
        </span>
        <div className="inspector-toolbar-actions">
          {tab === 'preview' ? (
            <>
              <button
                className="inspector-crew-toggle"
                type="button"
                ref={crewToggleRef}
                aria-expanded={crewEditorOpen}
                aria-controls="project-noobi-crew-editor"
                title="编辑项目 Noobi 制作编队"
                onClick={() => setCrewEditorOpen((open) => !open)}
              >
                <Users size={13} aria-hidden="true" />
                <span className="inspector-crew-avatars" aria-hidden="true">
                  {resolvedNoobiCrew.map((member) => {
                    const pack = NOOBI_PACK_OPTIONS.find((option) => option.id === member.packId);
                    return pack ? (
                      <i data-role={member.role} key={member.packId}>
                        <img src={pack.avatarImage} alt="" draggable={false} />
                      </i>
                    ) : null;
                  })}
                </span>
                <strong>{resolvedNoobiCrew.length}人</strong>
              </button>
            </>
          ) : null}
          {tab === 'preview' && project.status === 'running' && payload.previewUrl ? (
            <button
              className="preview-mode-toggle"
              type="button"
              aria-pressed={showBuildPreview}
              onClick={() => setShowBuildPreview((value) => !value)}
            >
              <MonitorPlay size={12} /> {showBuildPreview ? '制作场景' : '当前构建'}
            </button>
          ) : null}
          {tab === 'assets' ? (
            <>
              <span
                className={`asset-requirement-chip ${requirementState}`}
                title={imageGate.state === 'trusted-referenced'
                  ? '宿主已验证生成来源及生产代码引用'
                  : imageGate.state === 'trusted-unreferenced'
                    ? '宿主已验证生成来源，但游戏尚未引用'
                    : '宿主私有证明中尚无可信生成图片'}
              >
                AI IMAGE · {hasGeneratedImage ? '宿主已验证' : imageGate.state === 'trusted-unreferenced' ? '待接入' : terminal ? '未满足' : '待生成'}
              </span>
              <button
                className="asset-import-button"
                type="button"
                disabled={importing || project.status === 'running'}
                title={project.status === 'running' ? 'Agent 运行期间不可导入素材' : '导入图像、音频或 GLB'}
                onClick={() => void importAssets()}
              >
                <Upload size={12} /> {importing ? '导入中' : '导入'}
              </button>
            </>
          ) : null}
          <button
            className="icon-button compact"
            type="button"
            aria-label="刷新检查器"
            title="刷新检查器"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {tab === 'preview' && crewEditorOpen ? (
        <aside
          className="inspector-crew-panel"
          id="project-noobi-crew-editor"
          aria-label="项目 Noobi 制作编队"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setCrewEditorOpen(false);
            crewToggleRef.current?.focus();
          }}
        >
          <header>
            <div>
              <small>PROJECT CREW</small>
              <strong>项目制作编队</strong>
              <span>{project.noobiCrewOverride === null ? '当前跟随全局默认编队' : '当前使用项目专属编队'}</span>
            </div>
            <div>
              <button
                className="crew-inherit-button"
                type="button"
                aria-pressed={project.noobiCrewOverride === null}
                disabled={project.status === 'running' || crewSaving || project.noobiCrewOverride === null}
                onClick={() => void selectNoobiCrew(null)}
              >
                跟随全局
              </button>
              <button
                className="icon-button compact"
                type="button"
                aria-label="关闭编队编辑器"
                onClick={() => setCrewEditorOpen(false)}
              >
                <X size={13} />
              </button>
            </div>
          </header>
          <NoobiCrewPicker
            value={resolvedNoobiCrew}
            disabled={project.status === 'running'}
            busy={crewSaving}
            label="项目 Noobi 制作编队"
            onChange={(crew) => void selectNoobiCrew(crew)}
          />
          <footer>
            {project.status === 'running'
              ? 'Agent 工作期间编队已锁定；停止本轮后可以调整。'
              : project.noobiCrewOverride === null
                ? '修改任意角色或岗位后，会自动建立项目专属编队。'
                : `${resolvedNoobiCrew.map((member) => {
                    const role = NOOBI_CREW_ROLE_OPTIONS.find((item) => item.id === member.role);
                    const pack = NOOBI_PACK_OPTIONS.find((item) => item.id === member.packId);
                    return `${role?.label ?? member.role} · ${pack?.avatarLabel ?? member.packId}`;
                  }).join('　')}`}
          </footer>
        </aside>
      ) : null}

      {tab === 'assets' && assetNotice ? (
        <div className={`asset-import-notice is-${assetNotice.tone}`} role="status">
          {assetNotice.tone === 'neutral'
            ? <Info size={14} aria-hidden="true" />
            : <CheckCircle2 size={14} aria-hidden="true" />}
          <span>{assetNotice.message}</span>
          <button type="button" aria-label="关闭导入提示" onClick={() => setAssetNotice(null)}>关闭</button>
        </div>
      ) : null}

      {tab === 'preview' ? (
        <div className="preview-pane">
          {!showProductionScene && payload.previewUrl ? (
            <iframe
              key={`${payload.previewUrl}:${previewRevision}`}
              src={`${payload.previewUrl}?noobi=${previewRevision}`}
              title={`${project.name} 游戏预览`}
              sandbox="allow-scripts allow-same-origin allow-pointer-lock"
            />
          ) : (
            <ProductionDiorama
              key={`${resolvedNoobiPackId}:${resolvedNoobiSceneId}`}
              packId={resolvedNoobiPackId}
              crew={resolvedNoobiCrew}
              sceneId={resolvedNoobiSceneId}
              stage={activityStage}
              status={project.status}
            />
          )}
          {showExperienceReport ? (
            <ExperienceReport
              report={payload.experienceReport}
              evaluating={evaluatingExperience}
              disabled={project.status === 'running' || !payload.previewUrl}
              onEvaluate={() => void evaluateExperience()}
              onCancel={() => void cancelExperience()}
              onOpenReport={(relativePath) => {
                setTab('files');
                void openFile(relativePath);
              }}
            />
          ) : null}
          <footer className="inspector-footer">
            <button
              type="button"
              onClick={() => void window.noobi.revealProject(project.id)}
            >
              <FolderOpen size={13} /> 在 Finder 中显示
            </button>
            {payload.previewUrl ? (
              <a href={payload.previewUrl} target="_blank" rel="noreferrer">
                新窗口 <ExternalLink size={12} />
              </a>
            ) : null}
          </footer>
        </div>
      ) : tab === 'assets' ? (
        <AssetStudio
          assets={payload.assets}
          assetPlans={payload.assetPlans}
          previewUrl={payload.previewUrl}
          importing={importing}
          importDisabled={project.status === 'running'}
          projectStatus={project.status}
          imageGenerationGate={imageGate}
          onImport={importAssets}
          onRegenerate={regenerate}
          retryingPlanId={retryingPlanId}
        />
      ) : (
        <div className="file-browser">
          <nav className="file-tree" aria-label="项目文件">
            {payload.files.length ? (
              payload.files.map((node) => (
                <FileTreeNode
                  key={node.relativePath}
                  node={node}
                  selectedPath={selectedFile?.relativePath}
                  depth={0}
                  onSelect={openFile}
                />
              ))
            ) : (
              <div className="file-empty">项目中暂无文件</div>
            )}
          </nav>
          <section className="code-viewer">
            {selectedFile ? (
              <>
                <header>
                  <Code2 size={13} />
                  <span>{selectedFile.relativePath}</span>
                </header>
                {selectedFile.binary ? (
                  <div className="code-empty">
                    <File size={20} />
                    二进制文件无法在此预览
                  </div>
                ) : (
                  <pre>
                    <code>{selectedFile.content}</code>
                  </pre>
                )}
                {selectedFile.truncated ? (
                  <small>文件较大，当前仅显示安全读取范围。</small>
                ) : null}
              </>
            ) : (
              <div className="code-empty">
                <Code2 size={20} />
                选择文件查看内容
              </div>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}

function ExperienceReport({
  report,
  evaluating,
  disabled,
  onEvaluate,
  onCancel,
  onOpenReport,
}: {
  report: GameplayExperienceReport | null;
  evaluating: boolean;
  disabled: boolean;
  onEvaluate: () => void;
  onCancel: () => void;
  onOpenReport: (relativePath: string) => void;
}) {
  if (evaluating) {
    return (
      <section className="experience-report is-running" aria-label="体验评测运行中" aria-busy="true">
        <header className="experience-report-header">
          <div>
            <span>PLAYTEST / EXPERIENCE</span>
            <strong>体验评测</strong>
          </div>
          <span className="experience-verdict is-running">
            <CircleDashed size={12} className="spin" aria-hidden="true" /> RUNNING
          </span>
        </header>
        <div className="experience-report-empty" role="status" aria-live="polite">
          <PlayCircle size={18} aria-hidden="true" />
          <div>
            <strong>正在自动试玩正式构建</strong>
            <span>{report ? `上次结果 ${report.score}/100；本次完成前不沿用旧结论。` : '正在执行操作、动画、暂停与重开检查。'}</span>
          </div>
          <button type="button" className="experience-evaluate-button is-stop" onClick={onCancel}>
            <Square size={10} fill="currentColor" aria-hidden="true" /> 停止评测
          </button>
        </div>
      </section>
    );
  }

  if (!report) {
    return (
      <section className="experience-report is-waiting" aria-label="体验评测">
        <header className="experience-report-header">
          <div>
            <span>PLAYTEST / EXPERIENCE</span>
            <strong>体验评测</strong>
          </div>
          <span className="experience-verdict is-waiting">
            <CircleDashed size={12} aria-hidden="true" /> WAITING
          </span>
        </header>
        <div className="experience-report-empty" role="status">
          <PlayCircle size={18} aria-hidden="true" />
          <div>
            <strong>等待首次体验评测</strong>
            <span>可运行版本就绪后，Agent 会自动加载、操作并重新开始游戏。</span>
          </div>
          <button
            type="button"
            className="experience-evaluate-button"
            disabled={disabled}
            onClick={onEvaluate}
          >
            <PlayCircle size={11} aria-hidden="true" />
            立即评测
          </button>
        </div>
      </section>
    );
  }

  const score = Math.max(0, Math.min(100, Math.round(report.score)));
  const checkedAt = formatExperienceTime(report.checkedAt);

  return (
    <section
      className={`experience-report is-${report.verdict}`}
      aria-label={`体验评测：${report.verdict === 'pass' ? '通过' : '需要修复'}`}
    >
      <header className="experience-report-header">
        <div>
          <span>PLAYTEST / EXPERIENCE</span>
          <strong>体验评测</strong>
        </div>
        <div className="experience-score" aria-label={`体验评分 ${score} 分`}>
          <strong>{score}</strong>
          <span>/100</span>
        </div>
        <span className={`experience-verdict is-${report.verdict}`}>
          {report.verdict === 'pass'
            ? <CheckCircle2 size={12} aria-hidden="true" />
            : <AlertTriangle size={12} aria-hidden="true" />}
          {report.verdict === 'pass' ? 'PASS' : 'REPAIR'}
        </span>
      </header>

      <div className="experience-checks" role="list" aria-label="体验评测检查项">
        {report.checks.map((check) => (
          <ExperienceCheckRow key={check.id} check={check} />
        ))}
      </div>

      {report.summary ? <p className="experience-summary">{report.summary}</p> : null}

      <footer className="experience-report-meta">
        <span>{checkedAt}{formatExperienceDuration(report.durationMs)}</span>
        <span title={report.reportPath}>REPORT · {report.reportPath}</span>
        <button
          type="button"
          className="experience-evaluate-button"
          onClick={() => onOpenReport(report.reportPath)}
        >
          <File size={10} aria-hidden="true" />
          查看报告
        </button>
        <button
          type="button"
          className="experience-evaluate-button"
          disabled={disabled}
          onClick={onEvaluate}
        >
          <RefreshCw size={10} aria-hidden="true" />
          重新评测
        </button>
      </footer>
    </section>
  );
}

function ExperienceCheckRow({ check }: { check: GameplayExperienceCheck }) {
  const statusLabel = check.status === 'pass'
    ? 'PASS'
    : check.status === 'repair'
      ? 'REPAIR'
      : 'SKIPPED';

  return (
    <div
      className={`experience-check is-${check.status}`}
      role="listitem"
      title={check.message}
    >
      {check.status === 'pass'
        ? <CheckCircle2 size={12} aria-hidden="true" />
        : check.status === 'repair'
          ? <AlertTriangle size={12} aria-hidden="true" />
          : <CircleDashed size={12} aria-hidden="true" />}
      <div>
        <strong>{check.label}</strong>
        <span>{check.message}</span>
      </div>
      <small>{statusLabel}{formatExperienceDuration(check.durationMs)}</small>
    </div>
  );
}

function formatExperienceTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatExperienceDuration(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return '';
  if (value < 1_000) return ` · ${Math.round(value)}ms`;
  return ` · ${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}s`;
}

function AssetStudio({
  assets,
  assetPlans,
  previewUrl,
  importing,
  importDisabled,
  projectStatus,
  imageGenerationGate,
  onImport,
  onRegenerate,
  retryingPlanId,
}: {
  assets: GameAssetRecord[];
  assetPlans: AssetPlanRecord[];
  previewUrl: string;
  importing: boolean;
  importDisabled: boolean;
  projectStatus: ProjectRecord['status'];
  imageGenerationGate: ProjectInspectorPayload['imageGenerationGate'];
  onImport: () => Promise<void>;
  onRegenerate: (plan: AssetPlanRecord) => Promise<void>;
  retryingPlanId: string | null;
}) {
  const pendingPlans = unresolvedPlans(assetPlans);
  const groups = {
    image: assets.filter((asset) => asset.kind === 'image'),
    audio: assets.filter((asset) => asset.kind === 'audio'),
    model3d: assets.filter((asset) => asset.kind === 'model3d'),
  };
  const planGroups = {
    image: pendingPlans.filter((plan) => plan.kind === 'image'),
    audio: pendingPlans.filter((plan) => plan.kind === 'audio'),
    model3d: pendingPlans.filter((plan) => plan.kind === 'model3d'),
  };
  const hasGeneratedImage = imageGenerationGate.state === 'trusted-referenced';
  const hasTrustedUnreferencedImage = imageGenerationGate.state === 'trusted-unreferenced';
  const terminal = ['completed', 'failed', 'stopped'].includes(projectStatus);

  if (assets.length === 0 && pendingPlans.length === 0) {
    const emptyTitle = terminal
      ? hasTrustedUnreferencedImage ? '可信图片尚未接入游戏' : 'AI 图片素材门禁未满足'
      : projectStatus === 'running'
        ? '正在等待图像生成服务'
        : hasTrustedUnreferencedImage ? '可信图片等待接入' : '启动后将强制生成图片';
    const emptyDescription = terminal
      ? hasTrustedUnreferencedImage
        ? '宿主已验证图片来源，但生产代码或构建输出尚未引用该图片；继续制作并完成真实接入。'
        : '宿主私有证明中没有可信生成图片；请检查图像 API 或 Codex ImageGen 后继续制作并重新验证。'
      : hasTrustedUnreferencedImage
        ? '宿主已验证图片来源，下一步需要让游戏生产代码真实加载并显示它。'
        : 'Noobi 优先使用已配置图像 API，否则回退 Codex ImageGen；成功后会自动出现在这里。';
    return (
      <div className={`asset-empty requirement-imagegen${terminal ? ' is-error' : ''}`}>
        <ImageIcon size={28} />
        <strong>{emptyTitle}</strong>
        <p>{emptyDescription}</p>
        <button
          className="secondary-button"
          type="button"
          disabled={importing || importDisabled}
          onClick={() => void onImport()}
        >
          <Upload size={14} /> {importing ? '正在导入…' : '选择素材'}
        </button>
        <span className="asset-drop-hint">也可以把 PNG、JPEG 或 WebP 直接拖到这里</span>
        {importDisabled ? <small>Agent 运行结束后即可导入。</small> : null}
      </div>
    );
  }

  return (
    <div className="asset-studio">
      {!hasGeneratedImage ? (
        <div className={`asset-requirement-notice${terminal ? ' is-error' : ' is-pending'}`} role="status">
          <ImageIcon size={17} />
          <div>
            <strong>{hasTrustedUnreferencedImage ? '可信图片尚未接入游戏' : terminal ? '必须生图尚未满足' : '仍在等待 AI 生成图片'}</strong>
            <p>{hasTrustedUnreferencedImage
              ? `宿主已验证生成来源，但尚未发现生产引用${imageGenerationGate.relativePaths.length ? `：${imageGenerationGate.relativePaths.join('、')}` : ''}。`
              : '手动导入图片不计入生成门禁；必须由配置的图像 API 或 Codex ImageGen 生成，并由宿主验证后实际接入游戏。'}</p>
          </div>
        </div>
      ) : null}
      <AssetSection
        title="图像"
        icon={<ImageIcon size={13} />}
        assets={groups.image}
        plans={planGroups.image}
        previewUrl={previewUrl}
        projectRunning={projectStatus === 'running'}
        retryingPlanId={retryingPlanId}
        onRegenerate={onRegenerate}
      />
      <AssetSection
        title="音频"
        icon={<Music2 size={13} />}
        assets={groups.audio}
        plans={planGroups.audio}
        previewUrl={previewUrl}
        projectRunning={projectStatus === 'running'}
        retryingPlanId={retryingPlanId}
        onRegenerate={onRegenerate}
      />
      <AssetSection
        title="3D 模型"
        icon={<Box size={13} />}
        assets={groups.model3d}
        plans={planGroups.model3d}
        previewUrl={previewUrl}
        projectRunning={projectStatus === 'running'}
        retryingPlanId={retryingPlanId}
        onRegenerate={onRegenerate}
      />
    </div>
  );
}

function AssetSection({
  title,
  icon,
  assets,
  plans,
  previewUrl,
  projectRunning,
  retryingPlanId,
  onRegenerate,
}: {
  title: string;
  icon: ReactNode;
  assets: GameAssetRecord[];
  plans: AssetPlanRecord[];
  previewUrl: string;
  projectRunning: boolean;
  retryingPlanId: string | null;
  onRegenerate: (plan: AssetPlanRecord) => Promise<void>;
}) {
  if (assets.length === 0 && plans.length === 0) return null;
  const displayItems = assets.flatMap<AssetDisplayItem>((asset) => {
    const slices = atlasDisplaySlices(asset);
    return slices.length > 0
      ? slices.map((slice) => ({ key: `${asset.id}:${slice.index}`, asset, slice }))
      : [{ key: asset.id, asset, slice: null }];
  });
  return (
    <section className="asset-section">
      <header>
        <span>{icon}{title}</span>
        <small>{(displayItems.length + plans.length).toString().padStart(2, '0')}</small>
      </header>
      <div className="asset-grid">
        {displayItems.map(({ key, asset, slice }) => (
          <AssetCard key={key} asset={asset} atlasSlice={slice} previewUrl={previewUrl} />
        ))}
        {plans.map((plan) => (
          <AssetPlanCard
            key={plan.id}
            plan={plan}
            disabled={projectRunning || retryingPlanId !== null}
            retrying={retryingPlanId === plan.id}
            onRegenerate={onRegenerate}
          />
        ))}
      </div>
    </section>
  );
}

function AssetCard({
  asset,
  atlasSlice,
  previewUrl,
}: {
  asset: GameAssetRecord;
  atlasSlice: AtlasDisplaySlice | null;
  previewUrl: string;
}) {
  const sourceUrl = assetPreviewUrl(previewUrl, asset.relativePath);
  const sourceLabel = asset.source === 'generated' ? 'AI 生成' : asset.source === 'procedural' ? '程序生成' : '已导入';
  const targetFps = numericMetadata(asset, 'targetFps') ?? numericMetadata(asset, 'targetFrameRate');
  const sourceFps = numericMetadata(asset, 'sourceAnimationFps');
  const frameCount = numericMetadata(asset, 'frameCount');
  const durationMs = numericMetadata(asset, 'durationMs');
  const timingMode = textMetadata(asset, 'timingMode');
  const variantId = textMetadata(asset, 'variantGroup') ?? textMetadata(asset, 'variantId') ?? textMetadata(asset, 'groupId');
  return (
    <article className={`asset-card asset-card-${asset.kind}`} title={atlasSlice?.subject ?? asset.prompt ?? asset.relativePath}>
      {asset.kind === 'image' ? (
        <div className="asset-card-media">
          {sourceUrl && atlasSlice ? (
            <div
              className="asset-atlas-slice"
              role="img"
              aria-label={`${atlasSlice.subject} 卡牌插画`}
              style={{
                backgroundImage: `url("${sourceUrl}")`,
                backgroundSize: `${atlasSlice.columns * 100}% ${atlasSlice.rows * 100}%`,
                backgroundPosition: `${atlasSlice.columnPercent}% ${atlasSlice.rowPercent}%`,
              }}
            />
          ) : sourceUrl ? (
            <img src={sourceUrl} alt={asset.name} loading="lazy" decoding="async" />
          ) : (
            <ImageIcon size={22} aria-hidden="true" />
          )}
        </div>
      ) : asset.kind === 'audio' ? (
        <div className="asset-audio-preview">
          <Music2 size={18} />
          {sourceUrl ? <audio controls preload="metadata" src={sourceUrl}>浏览器不支持音频预览。</audio> : null}
        </div>
      ) : (
        <div className="asset-model-preview" aria-label={`${asset.name} GLB 模型`}>
          <Box size={28} />
          <span>GLB</span>
        </div>
      )}
      <div className="asset-card-meta">
        <strong>{atlasSlice?.subject ?? asset.name}</strong>
        <span>{sourceLabel} · {formatBytes(asset.size)}</span>
        {atlasSlice ? <span>卡面图集 · {atlasSlice.index + 1}/{atlasSlice.total}</span> : null}
        {targetFps !== null || sourceFps !== null || frameCount !== null || durationMs !== null || timingMode || variantId ? (
          <div className="asset-timing-tags" aria-label="动画素材帧率元数据">
            {targetFps !== null ? (
              <span>BAKED {targetFps} FPS</span>
            ) : null}
            {sourceFps !== null ? <span>SOURCE {sourceFps} FPS</span> : null}
            {frameCount !== null ? <span>{frameCount} FRAMES</span> : null}
            {durationMs !== null ? <span>{durationMs} MS</span> : null}
            {timingMode ? <span title={timingMode}>MODE {timingMode}</span> : null}
            {variantId ? <span title={variantId}>GROUP {variantId}</span> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

const ASSET_PLAN_STATUS: Record<AssetPlanRecord['status'], { label: string; detail: string }> = {
  planned: { label: '已规划', detail: '等待 Agent 领取素材工单' },
  queued: { label: '已排队', detail: '将在本轮制作中重新生成' },
  generating: { label: '生成中', detail: '素材服务正在处理' },
  'waiting-agent': { label: '等待 Agent', detail: '需要 Codex 完成生成或接入' },
  generated: { label: '待接入', detail: '文件已生成，尚未通过生产引用验证' },
  ready: { label: '已就绪', detail: '素材已生成并接入游戏' },
  failed: { label: '生成失败', detail: '工单已保留，可随时重新生成' },
};

function AssetPlanCard({
  plan,
  disabled,
  retrying,
  onRegenerate,
}: {
  plan: AssetPlanRecord;
  disabled: boolean;
  retrying: boolean;
  onRegenerate: (plan: AssetPlanRecord) => Promise<void>;
}) {
  const status = ASSET_PLAN_STATUS[plan.status];
  const canRegenerate = ['failed', 'waiting-agent', 'generated'].includes(plan.status);
  const icon = plan.kind === 'image'
    ? <ImageIcon size={24} />
    : plan.kind === 'audio'
      ? <Music2 size={24} />
      : <Box size={24} />;
  return (
    <article className={`asset-plan-card is-${plan.status}`} aria-label={`${plan.name}，${status.label}`}>
      <div className="asset-plan-visual" aria-hidden="true">
        <span>{icon}</span>
        <i /><i /><i /><i />
      </div>
      <div className="asset-plan-body">
        <header>
          <span className="asset-plan-status"><CircleDashed size={11} /> {status.label}</span>
          <small>{plan.required ? 'REQUIRED' : 'OPTIONAL'}</small>
        </header>
        <strong title={plan.name}>{plan.name}</strong>
        <p>{status.detail}</p>
        {plan.error ? (
          <div className="asset-plan-error" role="status" title={plan.error.message}>
            <span>{plan.error.code}</span>
            {plan.error.message}
          </div>
        ) : plan.prompt ? (
          <div className="asset-plan-prompt" title={plan.prompt}>{plan.prompt}</div>
        ) : null}
        <footer>
          <span>ATTEMPT {plan.attemptCount.toString().padStart(2, '0')}</span>
          {plan.route ? <span>{plan.route.toUpperCase()}</span> : null}
          {canRegenerate ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => void onRegenerate(plan)}
            >
              <RotateCw size={12} className={retrying ? 'spin' : ''} />
              {retrying ? '排队中' : plan.status === 'generated' ? '重新接入' : '重新生成'}
            </button>
          ) : null}
        </footer>
      </div>
    </article>
  );
}

interface AtlasDisplaySlice {
  index: number;
  total: number;
  subject: string;
  columns: number;
  rows: number;
  columnPercent: number;
  rowPercent: number;
}

interface AssetDisplayItem {
  key: string;
  asset: GameAssetRecord;
  slice: AtlasDisplaySlice | null;
}

function atlasDisplaySlices(asset: GameAssetRecord): AtlasDisplaySlice[] {
  if (asset.kind !== 'image' || textMetadata(asset, 'role') !== 'card-art-atlas') return [];
  const columns = numericMetadata(asset, 'columns');
  const rows = numericMetadata(asset, 'rows');
  const subjects = textMetadata(asset, 'subjects')
    ?.split(',')
    .map((subject) => subject.trim())
    .filter(Boolean) ?? [];
  if (!columns || !rows || subjects.length < 2 || columns * rows < subjects.length) return [];
  return subjects.map((subject, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      index,
      total: subjects.length,
      subject,
      columns,
      rows,
      columnPercent: columns === 1 ? 50 : (column / (columns - 1)) * 100,
      rowPercent: rows === 1 ? 50 : (row / (rows - 1)) * 100,
    };
  });
}

function expandedAssetCount(assets: GameAssetRecord[]): number {
  return assets.reduce((total, asset) => total + Math.max(1, atlasDisplaySlices(asset).length), 0);
}

function unresolvedPlans(plans: AssetPlanRecord[]): AssetPlanRecord[] {
  return plans.filter((plan) => plan.status !== 'ready');
}

function assetPreviewUrl(previewUrl: string, relativePath: string): string {
  if (!previewUrl) return '';
  const publicPath = relativePath.startsWith('public/') ? relativePath.slice('public/'.length) : relativePath;
  const encodedPath = publicPath.split('/').map(encodeURIComponent).join('/');
  return `${previewUrl.replace(/\/$/u, '')}/${encodedPath}`;
}

function FileTreeNode({
  node,
  selectedPath,
  depth,
  onSelect,
}: {
  node: FileNode;
  selectedPath?: string;
  depth: number;
  onSelect: (relativePath: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(depth === 0);
  const directory = node.type === 'directory';
  return (
    <div>
      <button
        type="button"
        className={`file-node ${node.relativePath === selectedPath ? 'is-active' : ''}`}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        onClick={() => {
          if (directory) setOpen((value) => !value);
          else void onSelect(node.relativePath);
        }}
      >
        {directory ? (
          <ChevronRight size={12} className={open ? 'is-open' : ''} />
        ) : (
          <span className="file-indent" />
        )}
        {directory ? <Folder size={13} /> : <File size={13} />}
        <span>{node.name}</span>
        {!directory && typeof node.size === 'number' ? (
          <small>{formatBytes(node.size)}</small>
        ) : null}
      </button>
      {directory && open
        ? node.children?.map((child) => (
            <FileTreeNode
              key={child.relativePath}
              node={child}
              selectedPath={selectedPath}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}

function numericMetadata(asset: GameAssetRecord, key: string): number | null {
  const value = asset.metadata?.[key];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/u.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textMetadata(asset: GameAssetRecord, key: string): string | null {
  const value = asset.metadata?.[key];
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
