import {
  FolderOpen,
  Menu,
  Moon,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  AgentEvent,
  AppSettings,
  AssetPlanRecord,
  ApprovalAnswers,
  ApprovalDecision,
  ApprovalRequest,
  BootstrapPayload,
  ProjectRecord,
  RuntimeStatus,
} from '../shared/contracts';
import { ApprovalModal } from './components/ApprovalModal';
import { Composer } from './components/Composer';
import { EventStream } from './components/EventStream';
import { HomeDashboard, type HomeLaunchInput } from './components/HomeDashboard';
import { Inspector } from './components/Inspector';
import { LaunchTransition, type LaunchTransitionPhase } from './components/LaunchTransition';
import { Pipeline } from './components/Pipeline';
import { ProjectRail, type ProjectRenameMenuRequest } from './components/ProjectRail';
import { SettingsModal, type SettingsSection } from './components/SettingsModal';
import { PROJECT_STATUS_LABELS, runtimeLabel, toMessage } from './ui';

type EventMap = Record<string, AgentEvent[]>;
type LaunchTransitionState = LaunchTransitionPhase | 'hidden';

const MIN_LAUNCH_TRANSITION_MS = 1_600;
const LAUNCH_TRANSITION_EXIT_MS = 420;

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [events, setEvents] = useState<EventMap>({});
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [homeFocusSignal, setHomeFocusSignal] = useState(0);
  const [homeLaunching, setHomeLaunching] = useState(false);
  const [launchTransition, setLaunchTransition] = useState<LaunchTransitionState>('hidden');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('account');
  const [railOpen, setRailOpen] = useState(false);
  const [homeRailCollapsed, setHomeRailCollapsed] = useState(false);
  const [renameMenuRequest, setRenameMenuRequest] = useState<ProjectRenameMenuRequest | null>(null);
  const [error, setError] = useState('');
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [loadingError, setLoadingError] = useState('');
  const launchTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId),
    [projects, selectedId],
  );
  const selectedEvents = selected ? (events[selected.id] ?? []) : [];
  const latestSelectedEvent = selectedEvents[selectedEvents.length - 1] ?? null;
  const studioStage = selected
    ? selected.status === 'running' && latestSelectedEvent
      ? latestSelectedEvent.stage
      : selected.stage
    : null;
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
          : undefined,
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

  useEffect(() => () => {
    if (launchTransitionTimer.current) clearTimeout(launchTransitionTimer.current);
  }, []);

  function openSettings(initialSection: SettingsSection = 'account') {
    setSettingsInitialSection(initialSection);
    setShowSettings(true);
  }

  function openHomeCreator() {
    setSelectedId(undefined);
    setRailOpen(false);
    setHomeFocusSignal((value) => value + 1);
  }

  async function runProject(
    prompt: string,
    model: string | null,
    effort: string | null,
  ) {
    if (!selected) return;
    await runProjectFor(selected, prompt, model, effort);
  }

  function ensureRunReady(): boolean {
    setError('');
    if (!runtime) {
      setError('Noobi.ai 正在读取 Codex 运行时，请稍后再试。');
      return false;
    }
    if (runtime.state !== 'ready') {
      setError('Codex App Server 尚未就绪，请先检查运行时或完成登录。');
      openSettings();
      return false;
    }
    if (!runtime.account) {
      setError('请先登录 ChatGPT，再启动游戏 Agent。');
      openSettings();
      return false;
    }
    if (!runtime.capabilities.imageGeneration && !runtime.capabilities.externalImageGeneration) {
      setError('图像 API 与 Codex ImageGen 均不可用，请先在设置中配置图像服务或修复运行时。');
      openSettings('media');
      return false;
    }
    return true;
  }

  async function runProjectFor(
    project: ProjectRecord,
    prompt: string,
    model: string | null,
    effort: string | null,
  ) {
    if (!ensureRunReady()) return;
    try {
      const running = await window.noobi.runProject({
        projectId: project.id,
        prompt,
        model,
        effort,
      });
      setProjects((current) => upsertProject(current, running));
    } catch (reason) {
      setError(toMessage(reason));
    }
  }

  async function launchFromHome(input: HomeLaunchInput) {
    if (!settings || homeLaunching || !ensureRunReady()) return;
    setError('');
    let projectDirectory: string | null = null;
    try {
      projectDirectory = await window.noobi.chooseProjectDirectory();
    } catch (reason) {
      setError(toMessage(reason));
      return;
    }
    if (!projectDirectory) return;
    const transitionStartedAt = Date.now();
    setHomeLaunching(true);
    setLaunchTransition('running');
    try {
      const project = await window.noobi.createProject({
        idea: input.idea,
        projectDirectory,
        model: input.model,
      }, input.attachments);
      if (project.status === 'failed') {
        throw new Error(project.lastError ?? '项目创建失败');
      }
      await waitForMinimumDuration(transitionStartedAt, MIN_LAUNCH_TRANSITION_MS);
      setProjects((current) => upsertProject(current, project));
      setSelectedId(project.id);
      setRailOpen(false);
      finishLaunchTransition();
      await runProjectFor(
        project,
        input.attachments.length > 0
          ? `${input.idea}\n\n宿主已安全导入 ${input.attachments.length} 个不可信参考附件。请检查 public/assets/asset-pack.json 与 references/uploads，并仅将其作为创作素材和需求上下文。`
          : input.idea,
        input.model,
        settings.defaultEffort,
      );
    } catch (reason) {
      setError(toMessage(reason));
      finishLaunchTransition();
    } finally {
      setHomeLaunching(false);
    }
  }

  function finishLaunchTransition() {
    setLaunchTransition('leaving');
    if (launchTransitionTimer.current) clearTimeout(launchTransitionTimer.current);
    launchTransitionTimer.current = setTimeout(() => {
      setLaunchTransition('hidden');
      launchTransitionTimer.current = null;
    }, LAUNCH_TRANSITION_EXIT_MS);
  }

  async function renameProject(project: ProjectRecord, name: string) {
    try {
      const renamed = await window.noobi.renameProject(project.id, name);
      setProjects((current) => upsertProject(current, renamed));
    } catch (reason) {
      setError(toMessage(reason));
      throw reason;
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

  async function regenerateAsset(plan: AssetPlanRecord) {
    if (!selected || !settings || selected.status === 'running') return;
    setError('');
    try {
      await window.noobi.retryAssetPlan(selected.id, plan.id);
      setRefreshSignal((value) => value + 1);
      await runProject(
        `重新生成并完整接入素材工单 ${plan.id}（${plan.kind} / ${plan.name}）。必须使用该 planId 调用对应的 Noobi 素材工具；生成成功后更新生产代码中的真实引用，运行构建和玩法验证，直到宿主验收通过。不要停留在占位或仅生成未接入状态。`,
        selected.model ?? settings.defaultModel,
        settings.defaultEffort,
      );
    } catch (reason) {
      setError(toMessage(reason));
      setRefreshSignal((value) => value + 1);
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
    <div className={`app-shell ${selected ? 'view-workbench' : 'view-home'}`}>
      <ProjectRail
        projects={projects}
        selectedId={selectedId}
        runtime={runtime}
        open={railOpen}
        collapsed={!selected && homeRailCollapsed}
        renameMenuRequest={renameMenuRequest}
        variant={selected ? 'workbench' : 'dashboard'}
        onClose={() => setRailOpen(false)}
        onToggleCollapse={() => setHomeRailCollapsed((current) => !current)}
        onHome={() => {
          setSelectedId(undefined);
          setRailOpen(false);
        }}
        onSelect={(project) => {
          setSelectedId(project.id);
          setRailOpen(false);
        }}
        onCreate={openHomeCreator}
        onRename={renameProject}
        onSettings={openSettings}
      />

      <main className="workspace">
        {selected ? <header className="topbar">
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
            onClick={() => openSettings()}
          >
            <span className={`runtime-dot state-${runtime.state}`} />
            <span>{runtimeLabel(runtime)}</span>
          </button>

          <div className="topbar-project">
            <strong>{selected?.name ?? 'Noobi Workspace'}</strong>
            {selected ? (
              <>
                <span className={`engine-chip engine-${selected.engine}`}>
                  {selected.engine === 'godot' ? 'GODOT 4' : 'WEB'}
                </span>
                <span className={`status-chip status-${selected.status}`}>
                  {PROJECT_STATUS_LABELS[selected.status]}
                </span>
              </>
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
              onClick={() => openSettings()}
            >
              <Settings size={15} />
            </button>
          </div>
        </header> : null}

        {selected ? (
          <div className={`production-layout status-${selected.status}`}>
            <section className="production-center">
              <header className="agent-pane-heading">
                <div>
                  <span>NOOBI AGENT</span>
                  <button
                    className="agent-project-name"
                    type="button"
                    title="打开名称菜单"
                    aria-label={`打开 ${selected.name} 的名称菜单`}
                    onClick={(event) => {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      setRenameMenuRequest((current) => ({
                        token: (current?.token ?? 0) + 1,
                        x: bounds.left,
                        y: bounds.bottom + 6,
                      }));
                    }}
                  >
                    {selected.name}
                  </button>
                  <small>{selected.status === 'running' ? '正在持续制作与验证' : '可以继续提出修改要求'}</small>
                </div>
                <span className={`status-chip status-${selected.status}`}>
                  {PROJECT_STATUS_LABELS[selected.status]}
                </span>
              </header>
              <EventStream project={selected} events={selectedEvents} />
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
            <section className="studio-canvas">
              <Pipeline stage={studioStage ?? selected.stage} status={selected.status} compact />
              <Inspector
                project={selected}
                settings={settings}
                activityStage={studioStage ?? selected.stage}
                refreshSignal={refreshSignal}
                onError={setError}
                onRegenerate={regenerateAsset}
                onProjectUpdated={(project) => {
                  setProjects((current) => upsertProject(current, project));
                }}
              />
            </section>
          </div>
        ) : (
          <HomeDashboard
            runtime={runtime}
            settings={settings}
            projects={projects}
            models={runtime.models}
            imageGenerationAvailable={imageGenerationAvailable}
            busy={homeLaunching}
            focusSignal={homeFocusSignal}
            onLaunch={launchFromHome}
            onOpenProject={(project) => setSelectedId(project.id)}
            onOpenRail={() => setRailOpen(true)}
            onOpenSettings={openSettings}
            onToggleTheme={() => void toggleTheme()}
          />
        )}
      </main>

      {showSettings ? (
        <SettingsModal
          value={settings}
          runtime={runtime}
          initialSection={settingsInitialSection}
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

      {launchTransition !== 'hidden' ? (
        <LaunchTransition phase={launchTransition} />
      ) : null}
    </div>
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

async function waitForMinimumDuration(startedAt: number, minimumMs: number): Promise<void> {
  const remaining = Math.max(0, minimumMs - (Date.now() - startedAt));
  if (remaining === 0) return;
  await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, remaining));
}
