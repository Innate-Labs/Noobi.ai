import {
  Box,
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
  PackageOpen,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';

import type {
  FileNode,
  FileReadResult,
  GameAssetRecord,
  ProjectInspectorPayload,
  ProjectRecord,
} from '../../shared/contracts';
import { toMessage } from '../ui';

interface InspectorProps {
  project: ProjectRecord;
  refreshSignal: number;
  onError: (message: string) => void;
}

type InspectorTab = 'preview' | 'assets' | 'files';

export function Inspector({ project, refreshSignal, onError }: InspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('preview');
  const [payload, setPayload] = useState<ProjectInspectorPayload>({
    files: [],
    previewUrl: '',
    assets: [],
    imageGenerationGate: { state: 'missing', relativePaths: [] },
  });
  const [selectedFile, setSelectedFile] = useState<FileReadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [assetNotice, setAssetNotice] = useState<{
    message: string;
    tone: 'success' | 'neutral';
  } | null>(null);
  const dragDepth = useRef(0);
  const imageGate = payload.imageGenerationGate;
  const hasGeneratedImage = imageGate.state === 'trusted-referenced';
  const terminal = ['completed', 'failed', 'stopped'].includes(project.status);
  const requirementState = hasGeneratedImage
    ? 'is-satisfied'
    : terminal
      ? 'is-error'
      : 'is-pending';

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
    void refresh();
  }, [project.id, refresh]);

  useEffect(() => {
    if (refreshSignal > 0) void refresh();
  }, [refresh, refreshSignal]);

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
          <span>{payload.assets.length}</span>
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
            ? 'LOCAL GAME PREVIEW'
            : tab === 'assets'
              ? 'GAME ASSET LIBRARY'
              : 'PROJECT FILES'}
        </span>
        <div className="inspector-toolbar-actions">
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
          {payload.previewUrl ? (
            <iframe
              key={`${payload.previewUrl}:${previewRevision}`}
              src={`${payload.previewUrl}?noobi=${previewRevision}`}
              title={`${project.name} 游戏预览`}
              sandbox="allow-scripts allow-same-origin allow-pointer-lock"
            />
          ) : (
            <div className="preview-empty">
              <Eye size={28} />
              <strong>等待可运行版本</strong>
              <p>Agent 写入网页入口并通过检查后，游戏会在这里出现。</p>
              <button className="secondary-button" type="button" onClick={() => void refresh()}>
                <RefreshCw size={14} /> 重新检测
              </button>
            </div>
          )}
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
          previewUrl={payload.previewUrl}
          importing={importing}
          importDisabled={project.status === 'running'}
          projectStatus={project.status}
          targetFrameRate={project.targetFrameRate}
          imageGenerationGate={imageGate}
          onImport={importAssets}
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

function AssetStudio({
  assets,
  previewUrl,
  importing,
  importDisabled,
  projectStatus,
  targetFrameRate,
  imageGenerationGate,
  onImport,
}: {
  assets: GameAssetRecord[];
  previewUrl: string;
  importing: boolean;
  importDisabled: boolean;
  projectStatus: ProjectRecord['status'];
  targetFrameRate: ProjectRecord['targetFrameRate'];
  imageGenerationGate: ProjectInspectorPayload['imageGenerationGate'];
  onImport: () => Promise<void>;
}) {
  const groups = {
    image: assets.filter((asset) => asset.kind === 'image'),
    audio: assets.filter((asset) => asset.kind === 'audio'),
    model3d: assets.filter((asset) => asset.kind === 'model3d'),
  };
  const hasGeneratedImage = imageGenerationGate.state === 'trusted-referenced';
  const hasTrustedUnreferencedImage = imageGenerationGate.state === 'trusted-unreferenced';
  const terminal = ['completed', 'failed', 'stopped'].includes(projectStatus);

  if (assets.length === 0) {
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
        previewUrl={previewUrl}
        targetFrameRate={targetFrameRate}
      />
      <AssetSection
        title="音频"
        icon={<Music2 size={13} />}
        assets={groups.audio}
        previewUrl={previewUrl}
        targetFrameRate={targetFrameRate}
      />
      <AssetSection
        title="3D 模型"
        icon={<Box size={13} />}
        assets={groups.model3d}
        previewUrl={previewUrl}
        targetFrameRate={targetFrameRate}
      />
    </div>
  );
}

function AssetSection({
  title,
  icon,
  assets,
  previewUrl,
  targetFrameRate,
}: {
  title: string;
  icon: ReactNode;
  assets: GameAssetRecord[];
  previewUrl: string;
  targetFrameRate: ProjectRecord['targetFrameRate'];
}) {
  if (assets.length === 0) return null;
  return (
    <section className="asset-section">
      <header>
        <span>{icon}{title}</span>
        <small>{assets.length.toString().padStart(2, '0')}</small>
      </header>
      <div className="asset-grid">
        {assets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} previewUrl={previewUrl} targetFrameRate={targetFrameRate} />
        ))}
      </div>
    </section>
  );
}

function AssetCard({
  asset,
  previewUrl,
  targetFrameRate,
}: {
  asset: GameAssetRecord;
  previewUrl: string;
  targetFrameRate: ProjectRecord['targetFrameRate'];
}) {
  const sourceUrl = assetPreviewUrl(previewUrl, asset.relativePath);
  const sourceLabel = asset.source === 'generated' ? 'AI 生成' : asset.source === 'procedural' ? '程序生成' : '已导入';
  const targetFps = numericMetadata(asset, 'targetFps') ?? numericMetadata(asset, 'targetFrameRate');
  const sourceFps = numericMetadata(asset, 'sourceAnimationFps');
  const frameCount = numericMetadata(asset, 'frameCount');
  const durationMs = numericMetadata(asset, 'durationMs');
  const timingMode = textMetadata(asset, 'timingMode');
  const variantId = textMetadata(asset, 'variantGroup') ?? textMetadata(asset, 'variantId') ?? textMetadata(asset, 'groupId');
  const targetMatches = targetFps === null || targetFps === targetFrameRate;
  return (
    <article className={`asset-card asset-card-${asset.kind}`} title={asset.prompt || asset.relativePath}>
      {asset.kind === 'image' ? (
        <div className="asset-card-media">
          {sourceUrl ? (
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
        <strong>{asset.name}</strong>
        <span>{sourceLabel} · {formatBytes(asset.size)}</span>
        {targetFps !== null || sourceFps !== null || frameCount !== null || durationMs !== null || timingMode || variantId ? (
          <div className="asset-timing-tags" aria-label="动画素材帧率元数据">
            {targetFps !== null ? (
              <span className={targetMatches ? 'is-current' : 'is-stale'} title={targetMatches ? `匹配项目 ${targetFrameRate} FPS` : `项目当前为 ${targetFrameRate} FPS，需要替换或重新验证此变体`}>
                TARGET {targetFps} FPS · {targetMatches ? 'CURRENT' : 'STALE'}
              </span>
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
