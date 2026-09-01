import {
  ArrowUp,
  ArrowRight,
  Bot,
  FileText,
  Gamepad2,
  ImagePlus,
  Menu,
  Moon,
  Paperclip,
  Settings,
  Sparkles,
  Square,
  Sun,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';

import type {
  AppSettings,
  ModelOption,
  ProjectRecord,
  RuntimeStatus,
} from '../../shared/contracts';
import { formatRelative, PROJECT_STATUS_LABELS } from '../ui';
import { ModelPicker } from './ModelPicker';
import { RotatingIdeaInput } from './RotatingIdeaInput';

const IDEA_STARTERS = [
  {
    label: '平台动作',
    prompt: '制作一个横版平台动作游戏，拥有流畅移动、冲刺、收集目标和可立即重玩的完整关卡。',
  },
  {
    label: '射击',
    prompt: '制作一个俯视角生存射击游戏，包含武器切换、敌人波次、受击反馈和完整胜负循环。',
  },
  {
    label: '竞速',
    prompt: '制作一个有漂移、计时、检查点和对手车辆的街机竞速游戏。',
  },
  {
    label: 'RPG',
    prompt: '制作一个小型动作 RPG，包含探索、战斗、装备成长、任务目标和 Boss 战。',
  },
  {
    label: '卡牌',
    prompt: '制作一个卡牌策略游戏，卡牌拥有独立素材、出牌动效、回合反馈和可完成的一局。',
  },
  {
    label: '3D 冒险',
    prompt: '制作一个第三人称 3D 冒险游戏，包含移动、镜头、交互、敌人和完整目标。',
  },
] as const;

const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
const FILE_ACCEPT = '.pdf,.md,.txt,.json,.csv,.wav,.mp3,.ogg,.glb';
const SUPPORTED_ATTACHMENT = /\.(?:png|jpe?g|webp|pdf|md|txt|json|csv|wav|mp3|ogg|glb)$/iu;
const MAX_HOME_ATTACHMENTS = 20;

export interface HomeLaunchInput {
  idea: string;
  model: string | null;
  attachments: readonly File[];
}

interface HomeDashboardProps {
  runtime: RuntimeStatus;
  settings: AppSettings;
  projects: readonly ProjectRecord[];
  models: readonly ModelOption[];
  imageGenerationAvailable: boolean;
  busy: boolean;
  focusSignal: number;
  onLaunch: (input: HomeLaunchInput) => Promise<void>;
  onOpenProject: (project: ProjectRecord) => void;
  onOpenRail: () => void;
  onOpenSettings: (section?: 'account' | 'environment' | 'media') => void;
  onToggleTheme: () => void;
}

export function HomeDashboard({
  runtime,
  settings,
  projects,
  models,
  imageGenerationAvailable,
  busy,
  focusSignal,
  onLaunch,
  onOpenProject,
  onOpenRail,
  onOpenSettings,
  onToggleTheme,
}: HomeDashboardProps) {
  const [idea, setIdea] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const ideaInputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [model, setModel] = useState(
    settings.defaultModel ?? models.find((item) => item.isDefault)?.model ?? models[0]?.model ?? '',
  );
  const activeModel = useMemo(
    () => models.find((item) => item.model === model) ?? models[0] ?? null,
    [model, models],
  );
  const accountName = accountDisplayName(runtime);
  const runtimeReady = runtime.state === 'ready' && Boolean(runtime.account);
  const launchReady = runtimeReady && imageGenerationAvailable && idea.trim().length > 0 && !busy;

  useEffect(() => {
    if (models.length === 0) {
      setModel('');
      return;
    }
    if (!models.some((item) => item.model === model)) {
      setModel(settings.defaultModel ?? models.find((item) => item.isDefault)?.model ?? models[0]?.model ?? '');
    }
  }, [model, models, settings.defaultModel]);

  useEffect(() => {
    if (focusSignal === 0) return;
    ideaInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ideaInputRef.current?.focus({ preventScroll: true });
  }, [focusSignal]);

  async function submit() {
    if (!launchReady) return;
    await onLaunch({
      idea: idea.trim(),
      model: activeModel?.model ?? null,
      attachments,
    });
  }

  function addAttachments(files: readonly File[]) {
    if (busy || files.length === 0) return;
    const supported = files.filter((file) => SUPPORTED_ATTACHMENT.test(file.name));
    const unsupportedCount = files.length - supported.length;
    const known = new Set(attachments.map(attachmentKey));
    const added: File[] = [];
    for (const file of supported) {
      if (attachments.length + added.length >= MAX_HOME_ATTACHMENTS) break;
      const key = attachmentKey(file);
      if (known.has(key)) continue;
      known.add(key);
      added.push(file);
    }
    if (added.length > 0) setAttachments((current) => [...current, ...added]);
    const messages = [
      added.length > 0 ? `已添加 ${added.length} 个附件` : '',
      unsupportedCount > 0 ? `忽略 ${unsupportedCount} 个不支持的文件` : '',
      attachments.length + supported.length > MAX_HOME_ATTACHMENTS ? `最多 ${MAX_HOME_ATTACHMENTS} 个` : '',
    ].filter(Boolean);
    setAttachmentNotice(messages.join('；'));
  }

  function removeAttachment(file: File) {
    const key = attachmentKey(file);
    setAttachments((current) => current.filter((item) => attachmentKey(item) !== key));
    setAttachmentNotice('');
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    addAttachments(Array.from(event.dataTransfer.files));
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && launchReady) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <section className="home-dashboard">
      <header className="home-toolbar">
        <button
          className="home-mobile-menu"
          type="button"
          aria-label="打开导航"
          onClick={onOpenRail}
        >
          <Menu size={18} />
        </button>
        <div className="home-toolbar-actions">
          <button type="button" aria-label="切换主题" title="切换主题" onClick={onToggleTheme}>
            {settings.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button type="button" aria-label="设置" title="设置" onClick={() => onOpenSettings()}>
            <Settings size={17} />
          </button>
        </div>
      </header>

      <div className="home-scroll">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-content">
            <span className={`home-loop-status ${runtimeReady ? 'is-ready' : 'is-attention'}`}>
              <i /> {runtimeReady ? 'LOOP MODE 已就绪' : '完成运行时设置后开始'} <ArrowRight size={13} />
            </span>
            <h1 id="home-title">今天想做什么游戏，{accountName}？</h1>
            <p>描述玩法、美术和你最在意的体验。Noobi 会持续制作、试玩、评测和修复，直到得到可交付成品。</p>

            <div
              className={`home-prompt-card${dragActive ? ' is-dragging' : ''}`}
              onDragEnter={handleDragEnter}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes('Files')) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
              }}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={imageInputRef}
                className="sr-only"
                type="file"
                accept={IMAGE_ACCEPT}
                multiple
                tabIndex={-1}
                onChange={(event) => {
                  addAttachments(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept={FILE_ACCEPT}
                multiple
                tabIndex={-1}
                onChange={(event) => {
                  addAttachments(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
              <RotatingIdeaInput
                ref={ideaInputRef}
                value={idea}
                busy={busy}
                onChange={(event) => setIdea(event.target.value)}
                onKeyDown={handlePromptKeyDown}
              />
              {attachments.length > 0 ? (
                <div className="home-attachment-list" aria-label="已添加的参考附件">
                  {attachments.map((file) => (
                    <div className="home-attachment" key={attachmentKey(file)}>
                      <AttachmentPreview file={file} />
                      <span>
                        <strong title={file.name}>{file.name}</strong>
                        <small>{formatFileSize(file.size)}</small>
                      </span>
                      <button
                        type="button"
                        aria-label={`移除 ${file.name}`}
                        disabled={busy}
                        onClick={() => removeAttachment(file)}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {attachmentNotice ? <div className="home-attachment-notice" role="status">{attachmentNotice}</div> : null}
              <div className="home-prompt-controls">
                <div className="home-attachment-actions">
                  <button type="button" disabled={busy} onClick={() => imageInputRef.current?.click()}>
                    <ImagePlus size={15} /> 图片
                  </button>
                  <button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()}>
                    <Paperclip size={15} /> 文件
                  </button>
                </div>
                <span className="home-engine-advisor" title="Agent 会根据玩法、维度、动画和物理需求自动选择 Web 或 Godot">
                  <Bot size={15} /> 引擎由 Agent 判断
                </span>
                <ModelPicker
                  models={models}
                  value={activeModel?.model ?? ''}
                  disabled={busy}
                  onChange={setModel}
                />
                <button
                  className="home-create-button"
                  type="button"
                  aria-label={busy ? '正在创建游戏' : '发送游戏创意'}
                  disabled={!launchReady}
                  title={!runtimeReady
                    ? '请先让 Codex 运行时就绪并完成登录'
                    : !imageGenerationAvailable
                      ? '请先配置图像服务或修复 Codex ImageGen'
                      : idea.trim() ? '创建项目并启动 Agent' : '先描述游戏创意'}
                  onClick={() => void submit()}
                >
                  {busy
                    ? <Square size={12} fill="currentColor" />
                    : <ArrowUp size={20} strokeWidth={2.2} />}
                </button>
              </div>
              {dragActive ? (
                <div className="home-attachment-drop" role="status">
                  <Paperclip size={22} />
                  <strong>松开即可添加到游戏需求</strong>
                  <span>支持图片、PDF、文本、音频和 GLB</span>
                </div>
              ) : null}
            </div>

            <div className="home-idea-starters" aria-label="游戏创意快捷选项">
              {IDEA_STARTERS.map((starter) => (
                <button key={starter.label} type="button" onClick={() => setIdea(starter.prompt)}>
                  {starter.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="home-projects" aria-labelledby="recent-projects-title">
          <header>
            <div>
              <span>YOUR GAMES</span>
              <h2 id="recent-projects-title">继续最近的制作</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setIdea('');
                ideaInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                ideaInputRef.current?.focus({ preventScroll: true });
              }}
            >
              写一个新创意 <ArrowRight size={14} />
            </button>
          </header>
          {projects.length > 0 ? (
            <div className="home-project-grid">
              {projects.slice(0, 6).map((project, index) => (
                <button key={project.id} type="button" onClick={() => onOpenProject(project)}>
                  <span className={`home-project-art art-${index % 4}`}>
                    <Gamepad2 size={22} />
                    <i className={`status-dot status-${project.status}`} />
                  </span>
                  <span className="home-project-copy">
                    <strong>{project.name}</strong>
                    <small>{project.engine === 'godot' ? 'GODOT 4' : 'WEB'} · {PROJECT_STATUS_LABELS[project.status]}</small>
                    <time dateTime={project.updatedAt}>{formatRelative(project.updatedAt)}</time>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="home-project-empty">
              <Sparkles size={20} />
              <strong>第一个游戏会出现在这里</strong>
              <span>从上面的一句话开始，Noobi 会建立完整工程。</span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function AttachmentPreview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  const image = /^image\//iu.test(file.type) || /\.(?:png|jpe?g|webp)$/iu.test(file.name);

  useEffect(() => {
    if (!image) {
      setUrl('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, image]);

  return url ? <img src={url} alt="" /> : <span><FileText size={15} /></span>;
}

function attachmentKey(file: File): string {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function accountDisplayName(runtime: RuntimeStatus): string {
  const email = runtime.account?.email?.trim();
  if (!email) return '创作者';
  const local = email.split('@')[0]?.trim();
  return local || '创作者';
}
