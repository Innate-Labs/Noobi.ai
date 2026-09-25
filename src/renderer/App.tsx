import { latestProjectPlan, type PlanDraft } from '../shared/planning';
import { PlanDialog } from './components/PlanDialog';
import { ProductionProgressPanel } from './components/ProductionProgressPanel';
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
  useReducer,
  useRef,
  useState,
  type CSSProperties,
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
import { DeleteProjectModal } from './components/DeleteProjectModal';
import { EventStream } from './components/EventStream';
import { HomeDashboard, type HomeLaunchInput } from './components/HomeDashboard';
import { Inspector } from './components/Inspector';
import { Pipeline } from './components/Pipeline';
import {
  PIXEL_COVER_DURATION_MS,
  PIXEL_REVEAL_DURATION_MS,
  PixelPageTransition,
  type PixelTransitionDirection,
} from './components/PixelPageTransition';
import { ProjectRail } from './components/ProjectRail';
import { RenameProjectModal } from './components/RenameProjectModal';
import { SettingsModal, type SettingsSection } from './components/SettingsModal';
import { PROJECT_STATUS_LABELS, runtimeLabel, toMessage } from './ui';
import {
  WORKSPACE_HOME_TARGET,
  createWorkspaceViewTransitionState,
  workspaceProjectTarget,
  workspaceViewTransitionReducer,
  type WorkspaceViewAnimatedPhase,
} from './workspaceViewTransition';

type EventMap = Record<string, AgentEvent[]>;


export function App() {
  const [planDialog, setPlanDialog] = useState<{ draft: PlanDraft; files: readonly File[] } | null>(null);
  const planFiles = useRef(new Map<string, readonly File[]>());
  const [savedPlans, setSavedPlans] = useState<PlanDraft[]>([]);
  const refreshPlans = useCallback(async () => { setSavedPlans(await window.noobi.listPlans()); }, []);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [viewTransition, dispatchViewTransition] = useReducer(
    workspaceViewTransitionReducer,
    undefined,
    () => createWorkspaceViewTransitionState(
      WORKSPACE_HOME_TARGET,
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  );
  const [events, setEvents] = useState<EventMap>({});
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [homeFocusSignal, setHomeFocusSignal] = useState(0);
  const [homeLaunching, setHomeLaunching] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('account');
  const [railOpen, setRailOpen] = useState(false);
  const [homeRailCollapsed, setHomeRailCollapsed] = useState(false);
  const [error, setError] = useState('');
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [loadingError, setLoadingError] = useState('');
  const [renameTarget, setRenameTarget] = useState<ProjectRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const [projectActionBusy, setProjectActionBusy] = useState(false);
  const workspaceRef = useRef<HTMLElement>(null);
  const focusHomeCreatorRef = useRef(false);

  const selectedId = viewTransition.visible.kind === 'project'
    ? viewTransition.visible.projectId
    : undefined;

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId),
    [projects, selectedId],
  );
  const selectedEvents = selected ? (events[selected.id] ?? []) : [];
  const selectedPlan = selected ? latestProjectPlan(savedPlans, selected.id) : null;
  const resumePlanTitle = selectedPlan?.run?.status === 'dispatched'
    ? selectedPlan.version?.options.find(option => option.id === selectedPlan.run!.optionId)?.title : undefined;
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
      void refreshPlans().catch(() => undefined);
      setProjects(state.projects);
      setSettings(state.settings);
      setRuntime(state.runtime);
      setEvents(state.events ?? {});
      dispatchViewTransition({
        type: 'SYNC_PROJECTS',
        projectIds: state.projects.map((project) => project.id),
      });
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

  useEffect(() => {
    dispatchViewTransition({
      type: 'SYNC_PROJECTS',
      projectIds: projects.map((project) => project.id),
    });
  }, [projects]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => {
      dispatchViewTransition({
        type: 'SET_REDUCED_MOTION',
        enabled: preference.matches,
      });
    };
    preference.addEventListener('change', syncPreference);
    return () => preference.removeEventListener('change', syncPreference);
  }, []);

  function openSettings(initialSection: SettingsSection = 'account') {
    setSettingsInitialSection(initialSection);
    setShowSettings(true);
  }

  function navigateHome() {
    focusHomeCreatorRef.current = false;
    dispatchViewTransition({ type: 'NAVIGATE', target: WORKSPACE_HOME_TARGET });
    setRailOpen(false);
  }

  function navigateToProject(project: ProjectRecord) {
    focusHomeCreatorRef.current = false;
    dispatchViewTransition({ type: 'NAVIGATE', target: workspaceProjectTarget(project.id) });
    setRailOpen(false);
  }

  function openHomeCreator() {
    focusHomeCreatorRef.current = true;
    dispatchViewTransition({ type: 'NAVIGATE', target: WORKSPACE_HOME_TARGET });
    setRailOpen(false);
    setHomeFocusSignal((value) => value + 1);
  }

  const completeViewTransition = useCallback((
    phase: WorkspaceViewAnimatedPhase,
    runId: number,
  ) => {
    dispatchViewTransition({ type: 'PHASE_COMPLETE', phase, runId });
    if (phase === 'revealing') {
      const creatorWillOwnFocus = viewTransition.visible.kind === 'home'
        && focusHomeCreatorRef.current;
      focusHomeCreatorRef.current = false;
      if (!creatorWillOwnFocus) {
        window.requestAnimationFrame(() => workspaceRef.current?.focus({ preventScroll: true }));
      }
    }
  }, [viewTransition.visible.kind]);

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
    return true;
  }

  async function runProjectFor(project: ProjectRecord, prompt: string, model: string | null, effort: string | null) {
    if (!ensureRunReady()) return;
    try {
      const draft = await window.noobi.generatePlans({ request: prompt, projectId: project.id, model, effort });
      setPlanDialog({ draft, files: [] });
      await refreshPlans();
    } catch (reason) { setError(toMessage(reason)); throw reason; }
  }

  async function resumeProject(model: string | null, effort: string | null) {
    if (!selected || !ensureRunReady()) return;
    try {
      if (!selectedPlan?.run || !resumePlanTitle) throw new Error('没有可继续的已选方案，请先输入修改要求生成方案');
      const project = await window.noobi.resumeProject({ projectId: selected.id, runId: selectedPlan.run.id,
        requestId: crypto.randomUUID(), model, effort });
      setProjects(current => upsertProject(current, project));
      await refreshPlans();
    } catch (reason) { setError(toMessage(reason)); throw reason; }
  }

  async function launchFromHome(input: HomeLaunchInput) {
    if (!settings || homeLaunching || !ensureRunReady()) return;
    setHomeLaunching(true); setError('');
    try {
      const draft = await window.noobi.generatePlans({ request: input.idea, model: input.model, effort: input.effort, attachmentCount: input.attachments.length, references: input.references });
      planFiles.current.set(draft.id, input.attachments);
      setPlanDialog({ draft, files: input.attachments });
      await refreshPlans();
    } catch (reason) { setError(toMessage(reason)); }
    finally { setHomeLaunching(false); }
  }

  async function revealProject(projectId: string) {
    setError('');
    try {
      const relocated = await window.noobi.revealProject(projectId);
      if (relocated) setProjects((current) => upsertProject(current, relocated));
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

  async function renameProject(name: string) {
    if (!renameTarget || projectActionBusy) return;
    setProjectActionBusy(true);
    setError('');
    try {
      const project = await window.noobi.renameProject(renameTarget.id, name);
      setProjects((current) => upsertProject(current, project));
      setRenameTarget(null);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setProjectActionBusy(false);
    }
  }

  async function toggleProjectPinned(project: ProjectRecord) {
    setError('');
    try {
      const updated = await window.noobi.setProjectPinned(project.id, !project.pinned);
      setProjects((current) => upsertProject(current, updated));
    } catch (reason) {
      setError(toMessage(reason));
    }
  }

  async function deleteProject() {
    if (!deleteTarget || projectActionBusy) return;
    const projectId = deleteTarget.id;
    setProjectActionBusy(true);
    setError('');
    try {
      await window.noobi.deleteProject(projectId);
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setEvents((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      setDeleteTarget(null);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setProjectActionBusy(false);
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

  const transitionDirection: PixelTransitionDirection = viewTransition.phase === 'covering'
    ? viewTransition.visible.kind === 'home' ? 'forward' : 'backward'
    : viewTransition.visible.kind === 'project' ? 'forward' : 'backward';
  const transitionClass = viewTransition.phase === 'idle'
    ? ''
    : ` is-page-transitioning phase-${viewTransition.phase} direction-${transitionDirection}`;
  const transitionStyle = viewTransition.phase === 'idle'
    ? undefined
    : {
        '--pixel-phase-duration': `${viewTransition.phase === 'covering'
          ? PIXEL_COVER_DURATION_MS
          : PIXEL_REVEAL_DURATION_MS}ms`,
      } as CSSProperties;

  return (
    <div
      className={`app-shell ${selected ? 'view-workbench' : 'view-home'}${transitionClass}`}
      style={transitionStyle}
    >
      <ProjectRail
        projects={projects}
        selectedId={selectedId}
        runtime={runtime}
        open={railOpen}
        collapsed={!selected && homeRailCollapsed}
        variant={selected ? 'workbench' : 'dashboard'}
        onOpen={() => setRailOpen(true)}
        onClose={() => setRailOpen(false)}
        onToggleCollapse={() => setHomeRailCollapsed((current) => !current)}
        onHome={navigateHome}
        onSelect={navigateToProject}
        onRename={setRenameTarget}
        onTogglePinned={(project) => void toggleProjectPinned(project)}
        onDelete={setDeleteTarget}
        onCreate={openHomeCreator}
        onSettings={openSettings}
      />

      <main ref={workspaceRef} className="workspace" tabIndex={-1}>
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
              onClick={() => selected && void revealProject(selected.id)}
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
                    title="重命名游戏"
                    aria-label={`重命名 ${selected.name}`}
                    onClick={() => setRenameTarget(selected)}
                  >
                    {selected.name}
                  </button>
                  <small>{selected.status === 'running' ? '正在持续制作与验证' : '可以继续提出修改要求'}</small>
                </div>
                <span className={`status-chip status-${selected.status}`}>
                  {PROJECT_STATUS_LABELS[selected.status]}
                </span>
              </header>
              <ProductionProgressPanel key={`${selected.id}:${selectedPlan?.run?.id ?? ''}`} projectId={selected.id}
                planRunId={selectedPlan?.run?.id} projectStatus={selected.status} />
              <EventStream project={selected} events={selectedEvents} />
              <Composer
                key={selected.id}
                project={selected}
                models={runtime.models}
                settings={settings}
                imageGenerationAvailable={imageGenerationAvailable}
                disabled={
                  runtime.state !== 'ready' ||
                  !runtime.account
                }
                onRun={runProject}
                onResume={resumeProject}
                resumePlanTitle={resumePlanTitle}
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
                onRevealProject={() => revealProject(selected.id)}
                onProjectUpdated={(project) => {
                  setProjects((current) => upsertProject(current, project));
                }}
                onProjectRestored={(project) => {
                  setProjects(current => upsertProject(current, project));
                  void refreshPlans(); navigateToProject(project);
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
            onOpenProject={navigateToProject}
            onOpenRail={() => setRailOpen(true)}
            onOpenSettings={openSettings}
            onToggleTheme={() => void toggleTheme()}
          />
        )}
      </main>

      {savedPlans.some(d => d.status !== 'cancelled' && d.run?.status !== 'dispatched') && !planDialog && (
        <details className="saved-plans"><summary>已保存的制作方案</summary><div>{savedPlans.filter(d => d.status !== 'cancelled' && d.run?.status !== 'dispatched').slice().reverse().map(d => <button key={d.id} type="button" onClick={() => void window.noobi.getPlan(d.id).then(draft => setPlanDialog({ draft, files: planFiles.current.get(draft.id) ?? [] })).catch(e => setError(toMessage(e)))}>{d.request.slice(0, 70)} · {d.status === 'generating' ? '生成中' : d.status === 'failed' ? '可重试' : '待选择'}</button>)}</div></details>
      )}
      {planDialog && <PlanDialog key={planDialog.draft.id} initial={planDialog.draft} files={planDialog.files}
        onClose={(draft, files) => { planFiles.current.set(draft.id, files); setPlanDialog(null); void refreshPlans().catch(e => setError(toMessage(e))); }}
        onStarted={project => { setProjects(current => upsertProject(current, project)); setPlanDialog(null); navigateToProject(project); void refreshPlans().catch(e => setError(toMessage(e))); }} />}

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

      {renameTarget ? (
        <RenameProjectModal
          project={renameTarget}
          busy={projectActionBusy}
          onClose={() => setRenameTarget(null)}
          onRename={(name) => void renameProject(name)}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteProjectModal
          project={deleteTarget}
          busy={projectActionBusy}
          onClose={() => setDeleteTarget(null)}
          onDelete={() => void deleteProject()}
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

      {viewTransition.phase !== 'idle' ? (
        <PixelPageTransition
          direction={transitionDirection}
          phase={viewTransition.phase}
          runId={viewTransition.runId}
          onComplete={completeViewTransition}
        />
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
  return [...next].sort((a, b) => Number(b.pinned) - Number(a.pinned)
    || b.updatedAt.localeCompare(a.updatedAt));
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
