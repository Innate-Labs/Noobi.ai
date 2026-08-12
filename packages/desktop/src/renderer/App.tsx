import {
  CircleHelp,
  FolderOpen,
  Moon,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  AgentEvent,
  AppSettings,
  BootstrapState,
  CreateProjectInput,
  ProjectRecord,
  ProviderConnectionInput,
} from '../shared/types';
import { EventStream, type EventHistoryState } from './components/EventStream';
import { Inspector } from './components/Inspector';
import { NewProjectDialog } from './components/NewProjectDialog';
import { Pipeline } from './components/Pipeline';
import { ProjectRail } from './components/ProjectRail';
import { SettingsDialog } from './components/SettingsDialog';
import { ExtensionsDialog } from './components/ExtensionsDialog';
import { mergeAgentEvents } from './history';
import { gameAgentMascot as brandIcon } from './assets';

type EventMap = Record<string, AgentEvent[]>;
type TextMap = Record<string, string>;
type HistoryMap = Record<string, EventHistoryState>;

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [events, setEvents] = useState<EventMap>({});
  const [liveText, setLiveText] = useState<TextMap>({});
  const [history, setHistory] = useState<HistoryMap>({});
  const [instruction, setInstruction] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExtensions, setShowExtensions] = useState(false);
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    localStorage.getItem('gameagent-theme') === 'light' ? 'light' : 'dark',
  );

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId),
    [projects, selectedId],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('gameagent-theme', theme);
  }, [theme]);

  useEffect(() => {
    void window.gameAgent
      .bootstrap()
      .then((state) => {
        setBootstrap(state);
        setProjects(state.projects);
        setSettings(state.settings);
        if (state.projects[0]) setSelectedId(state.projects[0].id);
      })
      .catch((reason) => setError(toMessage(reason)));

    const stopEvents = window.gameAgent.onAgentEvent((event) => {
      if (
        event.type === 'text_delta' ||
        (event.type === 'thought' && event.title === '思考中')
      ) {
        setLiveText((previous) => ({
          ...previous,
          [event.projectId]:
            `${previous[event.projectId] ?? ''}${event.message}`.slice(-12_000),
        }));
        return;
      }

      setLiveText((previous) => ({ ...previous, [event.projectId]: '' }));
      setEvents((previous) => ({
        ...previous,
        [event.projectId]: mergeAgentEvents(previous[event.projectId] ?? [], [
          event,
        ]),
      }));
      if (event.type === 'tool_result' || event.type === 'complete') {
        setRefreshToken((value) => value + 1);
      }
    });

    const stopProjects = window.gameAgent.onProjectUpdated((project) => {
      setProjects((previous) => {
        const next = previous.some((item) => item.id === project.id)
          ? previous.map((item) => (item.id === project.id ? project : item))
          : [project, ...previous];
        return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
    });

    return () => {
      stopEvents();
      stopProjects();
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setHistory((previous) => ({
      ...previous,
      [selectedId]: {
        ...(previous[selectedId] ?? { hasMore: false, source: 'empty' }),
        loading: true,
        error: '',
      },
    }));

    void window.gameAgent
      .loadAgentHistory(selectedId)
      .then((result) => {
        if (cancelled) return;
        setEvents((previous) => ({
          ...previous,
          [selectedId]: mergeAgentEvents(
            result.events,
            previous[selectedId] ?? [],
          ),
        }));
        setHistory((previous) => ({
          ...previous,
          [selectedId]: {
            loading: false,
            hasMore: result.hasMore,
            source: result.source,
            error: '',
          },
        }));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setHistory((previous) => ({
          ...previous,
          [selectedId]: {
            loading: false,
            hasMore: false,
            source: 'empty',
            error: toMessage(reason),
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selected) return;
    setInstruction(selected.status === 'draft' ? selected.prompt : '');
  }, [selected]);

  async function createProject(input: CreateProjectInput) {
    const project = await window.gameAgent.createProject(input);
    setProjects((previous) => [project, ...previous]);
    setSelectedId(project.id);
    setInstruction(project.prompt);
    setShowCreate(false);
  }

  async function startAgent() {
    if (!selected) return;
    const prompt = instruction.trim() || selected.prompt;
    setError('');
    try {
      await window.gameAgent.startAgent({
        projectId: selected.id,
        prompt,
        resume: Boolean(selected.sessionId),
      });
      setInstruction('');
    } catch (reason) {
      const message = toMessage(reason);
      setError(message);
      if (/API Key|模型设置/.test(message)) setShowSettings(true);
    }
  }

  async function stopAgent() {
    if (!selected) return;
    await window.gameAgent.stopAgent(selected.id);
  }

  async function saveSettings(next: AppSettings) {
    const publicSettings = await window.gameAgent.saveSettings(next);
    setSettings(publicSettings);
  }

  async function testProviderConnection(input: ProviderConnectionInput) {
    return window.gameAgent.testProviderConnection(input);
  }

  if (!bootstrap || !settings) {
    return (
      <div className="loading-screen">
        <div className="loading-mark">
          <img src={brandIcon} alt="" />
        </div>
        <strong>Noobi.ai</strong>
        <span>AI GAME AGENT · 正在连接 Runtime…</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <ProjectRail
        projects={projects}
        selectedId={selectedId}
        onHome={() => setSelectedId(undefined)}
        onSelect={(project) => setSelectedId(project.id)}
        onCreate={() => setShowCreate(true)}
        onSettings={() => setShowSettings(true)}
        onExtensions={() => setShowExtensions(true)}
      />

      <main className="workspace">
        <header className="topbar">
          <div className="drag-region" />
          <div className="topbar-copy">
            <span
              className={`runtime-light ${bootstrap.runtimeReady ? 'is-ready' : ''}`}
            />
            <span>{bootstrap.runtimeMessage}</span>
          </div>
          {selected ? (
            <div className="project-heading">
              <strong>{selected.name}</strong>
              <span className={`status-chip status-${selected.status}`}>
                {statusLabel(selected.status)}
              </span>
            </div>
          ) : null}
          <div className="topbar-actions">
            <button
              className="icon-button"
              title="打开项目目录"
              aria-label="打开项目目录"
              disabled={!selected}
              onClick={() =>
                selected && void window.gameAgent.revealProject(selected.id)
              }
            >
              <FolderOpen size={15} />
            </button>
            <button
              className="icon-button"
              title="使用说明"
              aria-label="使用说明"
            >
              <CircleHelp size={15} />
            </button>
            <button
              className="icon-button"
              title="切换主题"
              aria-label="切换主题"
              onClick={() =>
                setTheme((value) => (value === 'dark' ? 'light' : 'dark'))
              }
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>

        {selected ? (
          <div className="production-layout">
            <section className="production-center">
              <Pipeline current={selected.stage} status={selected.status} />
              <EventStream
                project={selected}
                events={events[selected.id] ?? []}
                liveText={liveText[selected.id] ?? ''}
                history={
                  history[selected.id] ?? {
                    loading: true,
                    hasMore: false,
                    source: 'empty',
                  }
                }
              />
              <div className="composer">
                <div className="composer-label">
                  <span>{selected.sessionId ? '继续修改' : '开始制作'}</span>
                  <small>
                    {selected.sessionId
                      ? `SESSION ${selected.sessionId.slice(0, 8)}`
                      : 'NEW SESSION'}
                  </small>
                </div>
                <textarea
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  disabled={selected.status === 'running'}
                  placeholder={
                    selected.sessionId
                      ? '例如：把敌人移动速度降低 20%，然后重新构建…'
                      : '描述你想制作的游戏…'
                  }
                  rows={2}
                  onKeyDown={(event) => {
                    if (
                      (event.metaKey || event.ctrlKey) &&
                      event.key === 'Enter' &&
                      selected.status !== 'running'
                    ) {
                      event.preventDefault();
                      void startAgent();
                    }
                  }}
                />
                {selected.status === 'running' ? (
                  <button className="stop-button" onClick={stopAgent}>
                    <Square size={14} fill="currentColor" />
                    停止
                  </button>
                ) : (
                  <button className="run-button" onClick={startAgent}>
                    {selected.sessionId ? (
                      <RotateCcw size={15} />
                    ) : (
                      <Play size={15} fill="currentColor" />
                    )}
                    {selected.sessionId ? '继续执行' : '启动 Agent'}
                  </button>
                )}
                <div className="composer-hint">
                  Ctrl/⌘ + Enter 执行 · 工具名称与协议保持英文，过程说明使用中文
                </div>
              </div>
            </section>
            <Inspector
              project={selected}
              refreshToken={refreshToken}
              onError={setError}
            />
          </div>
        ) : (
          <EmptyWorkspace onCreate={() => setShowCreate(true)} />
        )}
      </main>

      {showCreate ? (
        <NewProjectDialog
          defaultDirectory={settings.defaultWorkspace}
          onClose={() => setShowCreate(false)}
          onCreate={createProject}
        />
      ) : null}
      {showSettings ? (
        <SettingsDialog
          value={settings}
          project={selected}
          events={selected ? (events[selected.id] ?? []) : []}
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
          onTest={testProviderConnection}
        />
      ) : null}
      {showExtensions ? (
        <ExtensionsDialog
          project={selected}
          onClose={() => setShowExtensions(false)}
        />
      ) : null}
      {error ? (
        <div className="toast-error" role="alert">
          <span>{error}</span>
          <button aria-label="关闭错误提示" onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyWorkspace({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="empty-workspace">
      <div className="empty-sequence" aria-hidden="true">
        <span>IDEA</span>
        <i />
        <span>GDD</span>
        <i />
        <span>GAME</span>
      </div>
      <p className="eyebrow">ONE PROMPT · PLAYABLE OUTPUT</p>
      <h1>
        从创意到可玩的
        <br />
        完整游戏工程。
      </h1>
      <p>Noobi.ai 会选择模板、生成 GDD 与素材、编写代码，并持续构建验证。</p>
      <button className="hero-button" onClick={onCreate}>
        <Sparkles size={16} />
        创建第一个游戏
      </button>
      <div className="capability-strip">
        <span>5 种游戏架构</span>
        <span>4 类生成模型</span>
        <span>可恢复 Agent 会话</span>
        <span>实时游戏预览</span>
      </div>
    </section>
  );
}

function statusLabel(status: ProjectRecord['status']): string {
  return {
    draft: '待启动',
    running: '生成中',
    waiting: '待继续',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止',
  }[status];
}

function toMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(
    /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
    '',
  );
}
