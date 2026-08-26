import {
  ArrowRight,
  FolderOpen,
  Menu,
  Moon,
  Settings,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type {
  AgentEvent,
  AppSettings,
  ApprovalAnswers,
  ApprovalDecision,
  ApprovalRequest,
  BootstrapPayload,
  CreateProjectInput,
  ProjectRecord,
  RuntimeStatus,
  TargetFrameRate,
} from '../shared/contracts';
import { ApprovalModal } from './components/ApprovalModal';
import { BrandMark } from './components/BrandMark';
import { Composer } from './components/Composer';
import { EventStream } from './components/EventStream';
import { Inspector } from './components/Inspector';
import { NewProjectModal } from './components/NewProjectModal';
import { Pipeline } from './components/Pipeline';
import { ProjectRail } from './components/ProjectRail';
import { SettingsModal } from './components/SettingsModal';
import { PROJECT_STATUS_LABELS, runtimeLabel, toMessage } from './ui';

type EventMap = Record<string, AgentEvent[]>;

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [events, setEvents] = useState<EventMap>({});
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [error, setError] = useState('');
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [loadingError, setLoadingError] = useState('');

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId),
    [projects, selectedId],
  );
  const imageGenerationAvailable = Boolean(
    runtime?.capabilities.imageGeneration || runtime?.capabilities.externalImageGeneration,
  );

  const loadBootstrap = useCallback(async () => {
    setLoadingError('');
    try {
      const state = await window.noobi.bootstrap();
      setBootstrap(state);
      setProjects(state.projects);
      setSettings(state.settings);
      setRuntime(state.runtime);
      setEvents(state.events ?? {});
      setSelectedId((current) =>
        current && state.projects.some((project) => project.id === current)
          ? current
          : state.projects[0]?.id,
      );
    } catch (reason) {
      setLoadingError(toMessage(reason));
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();

    const stopAgentEvents = window.noobi.onAgentEvent((event) => {
      setEvents((current) => ({
        ...current,
        [event.projectId]: mergeEvent(current[event.projectId] ?? [], event),
      }));
      if (event.kind === 'file' || event.kind === 'lifecycle') {
        setRefreshSignal((value) => value + 1);
      }
    });

    const stopProjects = window.noobi.onProjectChanged((project) => {
      setProjects((current) => upsertProject(current, project));
    });

    const stopRuntime = window.noobi.onRuntimeChanged((status) => {
      setRuntime(status);
    });

    const stopApprovals = window.noobi.onApproval((approval) => {
      setApprovals((current) =>
        current.some((item) => item.token === approval.token)
          ? current
          : [...current, approval],
      );
    });
    const stopApprovalClosed = window.noobi.onApprovalClosed((token) => {
      setApprovals((current) => current.filter((item) => item.token !== token));
    });

    return () => {
      stopAgentEvents();
      stopProjects();
      stopRuntime();
      stopApprovals();
      stopApprovalClosed();
    };
  }, [loadBootstrap]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.colorScheme = settings.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', settings.theme === 'dark' ? '#151611' : '#f2f1eb');
  }, [settings]);

  async function createProject(input: CreateProjectInput) {
    const project = await window.noobi.createProject(input);
    setProjects((current) => upsertProject(current, project));
    setSelectedId(project.id);
    setShowCreate(false);
    setRailOpen(false);
  }

  async function runProject(
    prompt: string,
    model: string | null,
    effort: string | null,
    targetFrameRate: TargetFrameRate,
  ) {
    if (!selected || !runtime) return;
    setError('');
    if (runtime.state !== 'ready') {
      setError('Codex App Server 尚未就绪，请先检查运行时或完成登录。');
      setShowSettings(true);
      return;
    }
    if (!runtime.account) {
      setError('请先登录 ChatGPT，再启动游戏 Agent。');
      setShowSettings(true);
      return;
    }
    if (!runtime.capabilities.imageGeneration && !runtime.capabilities.externalImageGeneration) {
      setError('图像 API 与 Codex ImageGen 均不可用，请先在设置中配置图像服务或修复运行时。');
      setShowSettings(true);
      return;
    }
    try {
      const project = await window.noobi.runProject({
        projectId: selected.id,
        prompt,
        model,
        effort,
        targetFrameRate,
      });
      setProjects((current) => upsertProject(current, project));
    } catch (reason) {
      setError(toMessage(reason));
    }
  }

  async function stopProject() {
    if (!selected) return;
    try {
      const project = await window.noobi.stopProject(selected.id);
      setProjects((current) => upsertProject(current, project));
    } catch (reason) {
      setError(toMessage(reason));
    }
  }

  async function toggleTheme() {
    if (!settings) return;
    const theme = settings.theme === 'dark' ? 'light' : 'dark';
    setSettings((current) => (current ? { ...current, theme } : current));
    try {
      setSettings(await window.noobi.saveSettings({ theme }));
    } catch (reason) {
      setError(toMessage(reason));
    }
  }

  async function resolveApproval(
    token: string,
    decision: ApprovalDecision,
    answers?: ApprovalAnswers,
  ) {
    await window.noobi.resolveApproval(token, decision, answers);
    setApprovals((current) => current.filter((item) => item.token !== token));
  }

  if (!bootstrap || !settings || !runtime) {
    return (
      <main className="loading-screen">
        <div className="loading-brand">
          <BrandMark />
          <div><strong>Noobi.ai</strong><small>GAME PRODUCTION SYSTEM</small></div>
        </div>
        {loadingError ? (
          <div className="loading-error" role="alert">
            <strong>无法连接桌面运行时</strong>
            <p>{loadingError}</p>
            <button className="primary-button" type="button" onClick={() => void loadBootstrap()}>
              重试连接
            </button>
          </div>
        ) : (
          <div className="loading-progress"><span /> 正在连接 Codex App Server…</div>
        )}
      </main>
    );
  }

  return (
    <div className="app-shell">
      <ProjectRail
        projects={projects}
        selectedId={selectedId}
        runtime={runtime}
        open={railOpen}
        onClose={() => setRailOpen(false)}
        onHome={() => {
          setSelectedId(undefined);
          setRailOpen(false);
        }}
        onSelect={(project) => {
          setSelectedId(project.id);
          setRailOpen(false);
        }}
        onCreate={() => setShowCreate(true)}
        onSettings={() => setShowSettings(true)}
      />

      <main className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            type="button"
            aria-label="打开项目导航"
            onClick={() => setRailOpen(true)}
          >
            <Menu size={18} />
          </button>
          <button
            className="runtime-status"
            type="button"
            title={runtime.error ?? runtimeLabel(runtime)}
            onClick={() => setShowSettings(true)}
          >
            <span className={`runtime-dot state-${runtime.state}`} />
            <span>{runtimeLabel(runtime)}</span>
          </button>

          <div className="topbar-project">
            <strong>{selected?.name ?? 'Noobi Workspace'}</strong>
            {selected ? (
              <span className={`status-chip status-${selected.status}`}>
                {PROJECT_STATUS_LABELS[selected.status]}
              </span>
            ) : null}
          </div>

          <div className="topbar-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="在 Finder 中打开项目"
              title="在 Finder 中打开项目"
              disabled={!selected}
              onClick={() => selected && void window.noobi.revealProject(selected.id)}
            >
              <FolderOpen size={15} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="切换主题"
              title="切换主题"
              onClick={() => void toggleTheme()}
            >
              {settings.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="打开设置"
              title="打开设置"
              onClick={() => setShowSettings(true)}
            >
              <Settings size={15} />
            </button>
          </div>
        </header>

        {selected ? (
          <div className="production-layout">
            <section className="production-center">
              <Pipeline stage={selected.stage} status={selected.status} />
              <EventStream project={selected} events={events[selected.id] ?? []} />
              <Composer
                project={selected}
                models={runtime.models}
                settings={settings}
                imageGenerationAvailable={imageGenerationAvailable}
                disabled={
                  runtime.state !== 'ready' ||
                  !runtime.account ||
                  !imageGenerationAvailable
                }
                onRun={runProject}
                onStop={stopProject}
              />
            </section>
            <Inspector
              project={selected}
              refreshSignal={refreshSignal}
              onError={setError}
            />
          </div>
        ) : (
          <EmptyWorkspace
            runtime={runtime}
            projectCount={projects.length}
            onCreate={() => setShowCreate(true)}
          />
        )}
      </main>

      {showCreate ? (
        <NewProjectModal
          defaultDirectory={settings.defaultWorkspace}
          defaultModel={settings.defaultModel}
          imageGenerationAvailable={imageGenerationAvailable}
          models={runtime.models}
          onClose={() => setShowCreate(false)}
          onCreate={createProject}
        />
      ) : null}

      {showSettings ? (
        <SettingsModal
          value={settings}
          runtime={runtime}
          onClose={() => setShowSettings(false)}
          onSaved={setSettings}
          onRuntime={setRuntime}
        />
      ) : null}

      {approvals[0] ? (
        <ApprovalModal
          key={approvals[0].token}
          approval={approvals[0]}
          pendingCount={approvals.length}
          onResolve={resolveApproval}
        />
      ) : null}

      {error ? (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button type="button" aria-label="关闭错误提示" onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyWorkspace({
  runtime,
  projectCount,
  onCreate,
}: {
  runtime: RuntimeStatus;
  projectCount: number;
  onCreate: () => void;
}) {
  return (
    <section className="empty-workspace">
      <div className="empty-sequence" aria-hidden="true">
        <span>IDEA</span><i /><span>BUILD</span><i /><span>PLAY</span>
      </div>
      <span className="eyebrow">ONE PROMPT · PLAYABLE OUTPUT</span>
      <h1>从创意到可玩的<br />完整游戏工程。</h1>
      <p>
        Noobi.ai 让 Codex 在受控项目目录中完成策划、工程搭建、代码实现和持续验证。
      </p>
      <button className="hero-button" type="button" onClick={onCreate}>
        <Sparkles size={16} /> 创建游戏 <ArrowRight size={15} />
      </button>
      <dl className="home-metrics">
        <div><dt>PIPELINE</dt><dd>8 个制作阶段</dd></div>
        <div><dt>RUNTIME</dt><dd>{runtime.state === 'ready' ? 'Codex 已就绪' : '需要检查'}</dd></div>
        <div><dt>MEDIA</dt><dd>{runtime.capabilities.imageGeneration || runtime.capabilities.externalImageGeneration ? '图片 · 音频 · 3D' : '音频 · 3D'}</dd></div>
        <div><dt>PROJECTS</dt><dd>{projectCount} 个本地项目</dd></div>
      </dl>
    </section>
  );
}

function upsertProject(
  projects: readonly ProjectRecord[],
  project: ProjectRecord,
): ProjectRecord[] {
  const next = projects.some((item) => item.id === project.id)
    ? projects.map((item) => (item.id === project.id ? project : item))
    : [project, ...projects];
  return [...next].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mergeEvent(events: readonly AgentEvent[], incoming: AgentEvent): AgentEvent[] {
  const index = events.findIndex((event) => event.id === incoming.id);
  const next = [...events];
  if (index >= 0) {
    const previous = next[index]!;
    next[index] = {
      ...previous,
      ...incoming,
      message: incoming.isDelta
        ? `${previous.message}${incoming.message}`.slice(-120_000)
        : incoming.message,
    };
  } else {
    next.push(incoming);
  }
  return next
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-500);
}
