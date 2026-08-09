import {
  AlertTriangle,
  BadgeCheck,
  Blocks,
  CircleCheck,
  Download,
  ExternalLink,
  FolderOpen,
  GitBranch,
  GitFork,
  LoaderCircle,
  Library,
  Plus,
  RefreshCw,
  Save,
  ServerCog,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  ExtensionsSnapshot,
  InstallGitHubSkillInput,
  McpServerDefinition,
  ProjectRecord,
  SecretField,
  SkillLevel,
  SkillSummary,
} from '../../shared/types';
import {
  gameSkillCatalog,
  gameSkillCategoryLabels,
  type GameSkillCatalogItem,
  type GameSkillCategory,
} from '../gameSkillCatalog';
import {
  gameMcpCatalog,
  gameMcpCategoryLabels,
  type GameMcpCategory,
  type GameMcpPreset,
} from '../gameMcpCatalog';
import { CapabilityIcon } from './CapabilityIcon';

interface ExtensionsDialogProps {
  project?: ProjectRecord;
  onClose: () => void;
}

type CapabilityTab = 'skills' | 'mcp';

export function ExtensionsDialog({ project, onClose }: ExtensionsDialogProps) {
  const [tab, setTab] = useState<CapabilityTab>('skills');
  const [snapshot, setSnapshot] = useState<ExtensionsSnapshot>();
  const [servers, setServers] = useState<McpServerDefinition[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId),
    [selectedServerId, servers],
  );

  async function load(clearFeedback = true) {
    setBusy(true);
    if (clearFeedback) setFeedback('');
    try {
      const next = await window.gameAgent.loadExtensions(project?.id);
      setSnapshot(next);
      setServers(next.mcpServers);
      setSelectedServerId((current) =>
        next.mcpServers.some((server) => server.id === current)
          ? current
          : next.mcpServers[0]?.id,
      );
    } catch (error) {
      setFeedback(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // The dialog owns one snapshot for the selected project at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  async function importSkill(level: SkillLevel) {
    setBusy(true);
    setFeedback('');
    try {
      const imported = await window.gameAgent.importSkill({
        level,
        projectId: level === 'project' ? project?.id : undefined,
      });
      if (imported) {
        await load(false);
        setFeedback(`已导入 Skill：${imported.name}`);
      }
    } catch (error) {
      setFeedback(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function installGitHubSkill(
    input: InstallGitHubSkillInput,
  ): Promise<boolean> {
    setBusy(true);
    setFeedback('');
    try {
      const installed = await window.gameAgent.installGitHubSkill(input);
      await load(false);
      setFeedback(`已从 GitHub 安装 Skill：${installed.name}`);
      return true;
    } catch (error) {
      setFeedback(toMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function removeSkill(skillId: string) {
    setBusy(true);
    try {
      await window.gameAgent.removeSkill(project?.id, skillId);
      await load();
    } catch (error) {
      setFeedback(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function addServer() {
    const server = newMcpServer();
    setServers((current) => [...current, server]);
    setSelectedServerId(server.id);
    setTab('mcp');
    setFeedback('');
  }

  function addRecommendedServer(preset: GameMcpPreset) {
    const existing = servers.find(
      (server) => server.name.toLowerCase() === preset.name.toLowerCase(),
    );
    if (existing) {
      setSelectedServerId(existing.id);
      setTab('mcp');
      setFeedback(`${preset.name} 已在 MCP 配置中。`);
      return;
    }

    const server: McpServerDefinition = {
      ...preset,
      id: crypto.randomUUID(),
      args: [...preset.args],
      env: preset.env.map((field) => ({ ...field })),
      headers: preset.headers.map((field) => ({ ...field })),
    };
    setServers((current) => [...current, server]);
    setSelectedServerId(server.id);
    setTab('mcp');
    setFeedback(
      `已添加 ${preset.name} 配置草稿；确认依赖后保存，将在下个 Agent 回合加载。`,
    );
  }

  function updateServer(patch: Partial<McpServerDefinition>) {
    if (!selectedServerId) return;
    setServers((current) =>
      current.map((server) =>
        server.id === selectedServerId ? { ...server, ...patch } : server,
      ),
    );
    setFeedback('');
  }

  async function saveServers() {
    setBusy(true);
    setFeedback('');
    try {
      const saved = await window.gameAgent.saveMcpServers(servers);
      setServers(saved);
      setSnapshot((current) =>
        current ? { ...current, mcpServers: saved } : current,
      );
      setFeedback('MCP 配置已安全保存，将在下一个 Agent 回合加载。');
    } catch (error) {
      setFeedback(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog extensions-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="extensions-title"
      >
        <header>
          <div>
            <span className="dialog-index">RUNTIME / CAPABILITIES</span>
            <h2 id="extensions-title">插件</h2>
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="capability-tabs" role="tablist">
          <button
            className={tab === 'skills' ? 'is-active skills-tab' : 'skills-tab'}
            onClick={() => setTab('skills')}
          >
            <Blocks size={15} />
            <span>Skills</span>
            <small>{snapshot?.skills.length ?? 0}</small>
          </button>
          <button
            className={tab === 'mcp' ? 'is-active mcp-tab' : 'mcp-tab'}
            onClick={() => setTab('mcp')}
          >
            <ServerCog size={15} />
            <span>MCP Servers</span>
            <small>{servers.filter((server) => server.enabled).length}</small>
          </button>
        </div>

        {busy && !snapshot ? (
          <div className="capability-loading">
            <LoaderCircle className="spin" size={20} />
            正在读取 Runtime 能力…
          </div>
        ) : tab === 'skills' ? (
          <SkillsPanel
            snapshot={snapshot}
            project={project}
            busy={busy}
            onRefresh={load}
            onImport={importSkill}
            onInstallGitHub={installGitHubSkill}
            onRemove={removeSkill}
          />
        ) : (
          <McpPanel
            servers={servers}
            selected={selectedServer}
            busy={busy}
            onSelect={setSelectedServerId}
            onAdd={addServer}
            onAddRecommended={addRecommendedServer}
            onUpdate={updateServer}
            onRemove={() => {
              if (!selectedServer) return;
              const remaining = servers.filter(
                (server) => server.id !== selectedServer.id,
              );
              setServers(remaining);
              setSelectedServerId(remaining[0]?.id);
            }}
          />
        )}

        <footer className="extensions-footer">
          <div className="runtime-capability-note">
            <ShieldCheck size={14} />
            <span>
              Skill 在主会话中按需加载；MCP Env/Header 使用系统安全存储加密。
            </span>
          </div>
          <span className="capability-feedback" role="status">
            {feedback}
          </span>
          {tab === 'mcp' ? (
            <button
              className="primary-button"
              onClick={saveServers}
              disabled={busy}
            >
              <Save size={15} />
              {busy ? '保存中…' : '保存 MCP'}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function SkillsPanel({
  snapshot,
  project,
  busy,
  onRefresh,
  onImport,
  onInstallGitHub,
  onRemove,
}: {
  snapshot?: ExtensionsSnapshot;
  project?: ProjectRecord;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onImport: (level: SkillLevel) => Promise<void>;
  onInstallGitHub: (input: InstallGitHubSkillInput) => Promise<boolean>;
  onRemove: (skillId: string) => Promise<void>;
}) {
  const skills = useMemo(() => snapshot?.skills ?? [], [snapshot?.skills]);
  const [skillsView, setSkillsView] = useState<'installed' | 'catalog'>(
    'catalog',
  );
  const [showGitHubForm, setShowGitHubForm] = useState(false);
  const [githubUrl, setGitHubUrl] = useState('');
  const [githubPath, setGitHubPath] = useState('');
  const [githubRef, setGitHubRef] = useState('');
  const [githubLevel, setGitHubLevel] = useState<SkillLevel>('user');
  const [catalogCategory, setCatalogCategory] = useState<
    'all' | GameSkillCategory
  >('all');

  const installedCatalogItems = useMemo(() => {
    const installed = new Map<string, SkillLevel>();
    for (const skill of skills) {
      if (skill.source?.kind === 'github') {
        installed.set(
          `${skill.source.repository.toLowerCase()}:${skill.source.path}`,
          skill.level,
        );
      }
      installed.set(`name:${skill.name}`, skill.level);
    }
    return installed;
  }, [skills]);

  async function submitGitHub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const installed = await onInstallGitHub({
      url: githubUrl,
      path: githubPath || undefined,
      ref: githubRef || undefined,
      level: githubLevel,
      projectId: githubLevel === 'project' ? project?.id : undefined,
    });
    if (installed) {
      setShowGitHubForm(false);
      setGitHubUrl('');
      setGitHubPath('');
      setGitHubRef('');
    }
  }

  return (
    <div className="skills-panel">
      <div className="capability-toolbar">
        <div>
          <strong>
            {skillsView === 'catalog' ? '精选游戏 Skills' : '可用 Skills'}
          </strong>
          <span>
            {skillsView === 'catalog'
              ? '官方优先，社区条目经过许可证与结构审阅'
              : '项目级同名 Skill 优先于用户级 Skill'}
          </span>
        </div>
        <div>
          <button
            className={`secondary-button compact-button capability-view-button ${
              skillsView === 'catalog' ? 'is-selected' : ''
            }`}
            onClick={() => {
              setSkillsView('catalog');
              setShowGitHubForm(false);
            }}
            disabled={busy}
            aria-pressed={skillsView === 'catalog'}
          >
            <Library size={13} />
            精选推荐
          </button>
          <button
            className={`secondary-button compact-button capability-view-button ${
              skillsView === 'installed' ? 'is-selected' : ''
            }`}
            onClick={() => {
              setSkillsView('installed');
              setShowGitHubForm(false);
            }}
            disabled={busy}
            aria-pressed={skillsView === 'installed'}
          >
            <Blocks size={13} /> 已安装 · {skills.length}
          </button>
          <button
            className="secondary-button compact-button github-install-trigger"
            onClick={() => {
              setSkillsView('installed');
              setShowGitHubForm((current) => !current);
            }}
            disabled={busy}
            aria-expanded={showGitHubForm}
          >
            <GitFork size={13} /> 从 GitHub 安装
          </button>
          <button
            className="secondary-button compact-button"
            onClick={() => void onRefresh()}
            disabled={busy}
          >
            <RefreshCw size={13} /> 刷新
          </button>
          <button
            className="secondary-button compact-button"
            onClick={() => void onImport('user')}
            disabled={busy}
          >
            <Upload size={13} /> 导入到用户
          </button>
          <button
            className="secondary-button compact-button"
            onClick={() => void onImport('project')}
            disabled={busy || !project}
            title={project ? '仅当前项目可用' : '请先选择项目'}
          >
            <Upload size={13} /> 导入到项目
          </button>
        </div>
      </div>

      {showGitHubForm ? (
        <form className="github-skill-form" onSubmit={submitGitHub}>
          <div className="github-skill-heading">
            <div>
              <GitFork size={17} />
              <div>
                <strong>GitHub Skill Source</strong>
                <span>粘贴仓库、tree 目录或 SKILL.md 文件地址</span>
              </div>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="关闭 GitHub 安装表单"
              onClick={() => setShowGitHubForm(false)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="github-skill-grid">
            <label className="github-url-field">
              <span>GitHub URL / OWNER/REPO</span>
              <input
                value={githubUrl}
                onChange={(event) => setGitHubUrl(event.target.value)}
                placeholder="https://github.com/owner/repo/tree/main/path/to/skill"
                required
                autoFocus
              />
            </label>
            <label>
              <span>仓库内路径（可选）</span>
              <input
                value={githubPath}
                onChange={(event) => setGitHubPath(event.target.value)}
                placeholder="skills/game-design"
              />
            </label>
            <label>
              <span>分支 / Tag / Commit（可选）</span>
              <div className="github-ref-input">
                <GitBranch size={13} />
                <input
                  value={githubRef}
                  onChange={(event) => setGitHubRef(event.target.value)}
                  placeholder="main"
                />
              </div>
            </label>
            <label>
              <span>安装范围</span>
              <select
                value={githubLevel}
                onChange={(event) =>
                  setGitHubLevel(event.target.value as SkillLevel)
                }
              >
                <option value="user">用户级 · 所有项目可用</option>
                <option value="project" disabled={!project}>
                  项目级 · {project?.name ?? '请先选择项目'}
                </option>
              </select>
            </label>
          </div>
          <div className="github-skill-actions">
            <p>
              仅安装你信任的仓库，Skill 可包含脚本与 Agent 指令。tree/blob
              地址会自动解析 Ref 与路径；私有仓库可复用本机 Git 凭据。
            </p>
            <button className="primary-button" type="submit" disabled={busy}>
              <GitFork size={14} /> {busy ? '下载并校验中…' : '安装 Skill'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="skill-source-strip">
        <button
          onClick={() => void window.gameAgent.revealSkillDirectory('user')}
        >
          <FolderOpen size={12} /> USER · {snapshot?.skillDirectories.user}
        </button>
        {project ? (
          <button
            onClick={() =>
              void window.gameAgent.revealSkillDirectory('project', project.id)
            }
          >
            <FolderOpen size={12} /> PROJECT ·{' '}
            {snapshot?.skillDirectories.project}
          </button>
        ) : null}
      </div>

      {skillsView === 'catalog' ? (
        <GameSkillCatalog
          category={catalogCategory}
          level={githubLevel}
          project={project}
          busy={busy}
          installed={installedCatalogItems}
          onCategoryChange={setCatalogCategory}
          onLevelChange={setGitHubLevel}
          onInstall={onInstallGitHub}
        />
      ) : (
        <div className="skill-list">
          {skills.length ? (
            skills.map((skill) => (
              <article
                className={`skill-card ${skill.valid ? '' : 'is-invalid'}`}
                key={skill.id}
              >
                {skill.valid ? (
                  <CapabilityIcon
                    kind="skill"
                    id={skillCatalogIconId(skill)}
                    compact
                  />
                ) : (
                  <div className="skill-glyph">
                    <AlertTriangle size={16} />
                  </div>
                )}
                <div className="skill-copy">
                  <div>
                    <strong>{skill.name}</strong>
                    <span className={`level-badge level-${skill.level}`}>
                      {skill.level === 'project' ? 'PROJECT' : 'USER'}
                    </span>
                  </div>
                  <p>{skill.valid ? skill.description : skill.error}</p>
                  {skill.source?.kind === 'github' ? (
                    <small className="skill-origin">
                      <GitFork size={10} />
                      {skill.source.repository} · {skill.source.ref} ·{' '}
                      {skill.source.path === '.'
                        ? 'repository root'
                        : skill.source.path}
                    </small>
                  ) : null}
                  <small>{skill.directory}</small>
                </div>
                <div className="skill-actions">
                  <button
                    title="在 Finder 中显示"
                    aria-label={`显示 ${skill.name}`}
                    onClick={() =>
                      void window.gameAgent.revealSkill(project?.id, skill.id)
                    }
                  >
                    <FolderOpen size={13} />
                  </button>
                  <button
                    className="danger-icon"
                    title="移除 Skill"
                    aria-label={`移除 ${skill.name}`}
                    onClick={() => void onRemove(skill.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="capability-empty">
              <Blocks size={24} />
              <strong>还没有 Skill</strong>
              <p>
                从精选库安装成熟的游戏制作 Skill，或选择一个包含 SKILL.md
                的本地目录。
              </p>
              <div className="skill-empty-actions">
                <button
                  className="secondary-button compact-button github-install-trigger"
                  onClick={() => setSkillsView('catalog')}
                  disabled={busy}
                >
                  <Library size={13} /> 浏览精选库
                </button>
                <button
                  className="secondary-button compact-button"
                  onClick={() => setShowGitHubForm(true)}
                  disabled={busy}
                >
                  <GitFork size={13} /> 自定义 GitHub 地址
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GameSkillCatalog({
  category,
  level,
  project,
  busy,
  installed,
  onCategoryChange,
  onLevelChange,
  onInstall,
}: {
  category: 'all' | GameSkillCategory;
  level: SkillLevel;
  project?: ProjectRecord;
  busy: boolean;
  installed: Map<string, SkillLevel>;
  onCategoryChange: (category: 'all' | GameSkillCategory) => void;
  onLevelChange: (level: SkillLevel) => void;
  onInstall: (input: InstallGitHubSkillInput) => Promise<boolean>;
}) {
  const items = gameSkillCatalog.filter(
    (item) => category === 'all' || item.category === category,
  );

  const installedLevel = (item: GameSkillCatalogItem) =>
    installed.get(`${item.repository.toLowerCase()}:${item.path}`) ??
    installed.get(`name:${item.id}`);

  return (
    <div className="game-skill-catalog">
      <div className="catalog-controls">
        <div
          className="catalog-filters"
          role="group"
          aria-label="筛选游戏 Skills"
        >
          {(
            Object.keys(gameSkillCategoryLabels) as Array<
              'all' | GameSkillCategory
            >
          ).map((key) => (
            <button
              key={key}
              className={category === key ? 'is-active' : ''}
              onClick={() => onCategoryChange(key)}
              aria-pressed={category === key}
            >
              {gameSkillCategoryLabels[key]}
            </button>
          ))}
        </div>
        <label className="catalog-level-select">
          <span>安装范围</span>
          <select
            value={level}
            onChange={(event) =>
              onLevelChange(event.target.value as SkillLevel)
            }
          >
            <option value="user">用户级</option>
            <option value="project" disabled={!project}>
              项目级{project ? ` · ${project.name}` : ''}
            </option>
          </select>
        </label>
      </div>

      <div className="catalog-review-note">
        <BadgeCheck size={14} />
        <span>
          2026-08
          审阅：优先官方发布者；社区条目要求许可证明确、结构完整且持续维护。
        </span>
      </div>

      <div className="catalog-grid">
        {items.map((item) => {
          const existingLevel = installedLevel(item);
          const sourceUrl = `https://github.com/${item.repository}/tree/${item.ref}/${item.path}`;
          return (
            <article className="catalog-card" key={item.id}>
              <div className="catalog-card-heading">
                <CapabilityIcon kind="skill" id={item.id} />
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.publisher}</small>
                </div>
                <span className={`trust-badge trust-${item.trust}`}>
                  {item.trust === 'official' ? 'OFFICIAL' : 'REVIEWED'}
                </span>
              </div>
              <p>{item.description}</p>
              <div className="catalog-provenance">
                <span>{item.evidence}</span>
                <span>{item.license}</span>
              </div>
              {item.requirement ? (
                <div className="catalog-requirement">
                  <AlertTriangle size={11} /> {item.requirement}
                </div>
              ) : null}
              <div className="catalog-card-actions">
                <button
                  className="catalog-source-button"
                  onClick={() => void window.gameAgent.openGitHubUrl(sourceUrl)}
                  title="在 GitHub 查看源代码"
                >
                  <ExternalLink size={12} /> 查看来源
                </button>
                <button
                  className={
                    existingLevel
                      ? 'catalog-installed-button'
                      : 'primary-button'
                  }
                  disabled={busy || Boolean(existingLevel)}
                  onClick={() =>
                    void onInstall({
                      url: `https://github.com/${item.repository}`,
                      path: item.path,
                      ref: item.ref,
                      level,
                      projectId: level === 'project' ? project?.id : undefined,
                    })
                  }
                >
                  {existingLevel ? (
                    <>
                      <CircleCheck size={13} /> 已安装 ·{' '}
                      {existingLevel === 'project' ? 'PROJECT' : 'USER'}
                    </>
                  ) : (
                    <>
                      <Download size={13} /> 安装
                    </>
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function McpPanel({
  servers,
  selected,
  busy,
  onSelect,
  onAdd,
  onAddRecommended,
  onUpdate,
  onRemove,
}: {
  servers: McpServerDefinition[];
  selected?: McpServerDefinition;
  busy: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onAddRecommended: (preset: GameMcpPreset) => void;
  onUpdate: (patch: Partial<McpServerDefinition>) => void;
  onRemove: () => void;
}) {
  const [mcpView, setMcpView] = useState<'catalog' | 'configured'>('catalog');
  const [catalogCategory, setCatalogCategory] = useState<
    'all' | GameMcpCategory
  >('all');

  const addBlankServer = () => {
    onAdd();
    setMcpView('configured');
  };

  return (
    <div className="mcp-panel">
      <div className="capability-toolbar">
        <div>
          <strong>{mcpView === 'catalog' ? '推荐游戏 MCP' : 'MCP 配置'}</strong>
          <span>
            {mcpView === 'catalog'
              ? '来源、依赖与传输方式可追溯；添加后仍需确认并保存'
              : '已保存的 Server 会在下一个 Agent 回合注册工具'}
          </span>
        </div>
        <div>
          <button
            className={`secondary-button compact-button capability-view-button ${
              mcpView === 'catalog' ? 'is-selected' : ''
            }`}
            onClick={() => setMcpView('catalog')}
            disabled={busy}
            aria-pressed={mcpView === 'catalog'}
          >
            <Library size={13} /> 推荐 MCP
          </button>
          <button
            className={`secondary-button compact-button capability-view-button ${
              mcpView === 'configured' ? 'is-selected' : ''
            }`}
            onClick={() => setMcpView('configured')}
            disabled={busy}
            aria-pressed={mcpView === 'configured'}
          >
            <ServerCog size={13} /> 已配置 · {servers.length}
          </button>
          <button
            className="secondary-button compact-button"
            onClick={addBlankServer}
            disabled={busy}
          >
            <Plus size={13} /> 新建 Server
          </button>
        </div>
      </div>

      {mcpView === 'catalog' ? (
        <GameMcpCatalog
          category={catalogCategory}
          servers={servers}
          busy={busy}
          onCategoryChange={setCatalogCategory}
          onAdd={(preset) => {
            onAddRecommended(preset);
            setMcpView('configured');
          }}
        />
      ) : (
        <div className="mcp-layout">
          <aside className="mcp-server-list">
            <div className="mcp-list-heading">
              <span>SERVERS</span>
              <button
                onClick={addBlankServer}
                aria-label="添加 MCP Server"
                disabled={busy}
              >
                <Plus size={14} />
              </button>
            </div>
            {servers.map((server) => (
              <button
                className={server.id === selected?.id ? 'is-active' : ''}
                key={server.id}
                onClick={() => onSelect(server.id)}
              >
                <i className={server.enabled ? 'is-enabled' : ''} />
                <CapabilityIcon
                  kind="mcp"
                  id={mcpCatalogIconId(server)}
                  compact
                />
                <span>
                  <strong>{server.name || '未命名 Server'}</strong>
                  <small>{server.transport.toUpperCase()}</small>
                </span>
              </button>
            ))}
            {!servers.length ? (
              <div className="mcp-list-empty">尚未配置 Server</div>
            ) : null}
          </aside>

          {selected ? (
            <div className="mcp-form">
              <div className="mcp-form-heading">
                <div>
                  <CapabilityIcon
                    kind="mcp"
                    id={mcpCatalogIconId(selected)}
                    compact
                  />
                  <span>
                    <strong>{selected.name || 'NEW SERVER'}</strong>
                    <small>下一次启动 Agent 时发现并注册工具</small>
                  </span>
                </div>
                <label className="capability-switch">
                  <input
                    type="checkbox"
                    checked={selected.enabled}
                    onChange={(event) =>
                      onUpdate({ enabled: event.target.checked })
                    }
                  />
                  <span>{selected.enabled ? 'ENABLED' : 'DISABLED'}</span>
                </label>
              </div>

              <div className="mcp-form-grid">
                <label>
                  <span>Name</span>
                  <input
                    value={selected.name}
                    onChange={(event) => onUpdate({ name: event.target.value })}
                    placeholder="filesystem"
                  />
                </label>
                <label>
                  <span>Transport</span>
                  <select
                    value={selected.transport}
                    onChange={(event) =>
                      onUpdate({
                        transport: event.target
                          .value as McpServerDefinition['transport'],
                      })
                    }
                  >
                    <option value="stdio">STDIO</option>
                    <option value="http">Streamable HTTP</option>
                    <option value="sse">SSE</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Description</span>
                <input
                  value={selected.description}
                  onChange={(event) =>
                    onUpdate({ description: event.target.value })
                  }
                  placeholder="提供项目外部工具与数据"
                />
              </label>

              {selected.transport === 'stdio' ? (
                <>
                  <label>
                    <span>Command</span>
                    <input
                      value={selected.command}
                      onChange={(event) =>
                        onUpdate({ command: event.target.value })
                      }
                      placeholder="npx"
                    />
                  </label>
                  <label>
                    <span>Args · 每行一个参数</span>
                    <textarea
                      rows={3}
                      value={selected.args.join('\n')}
                      onChange={(event) =>
                        onUpdate({
                          args: event.target.value
                            .split('\n')
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder={
                        '-y\n@modelcontextprotocol/server-filesystem\n/path'
                      }
                    />
                  </label>
                  <label>
                    <span>Working Directory · 可选</span>
                    <input
                      value={selected.cwd}
                      onChange={(event) =>
                        onUpdate({ cwd: event.target.value })
                      }
                      placeholder="/absolute/path"
                    />
                  </label>
                  <SecretFields
                    title="Environment"
                    fields={selected.env}
                    onChange={(env) => onUpdate({ env })}
                  />
                </>
              ) : (
                <>
                  <label>
                    <span>
                      {selected.transport === 'http' ? 'HTTP URL' : 'SSE URL'}
                    </span>
                    <input
                      value={selected.url}
                      onChange={(event) =>
                        onUpdate({ url: event.target.value })
                      }
                      placeholder="https://mcp.example.com/mcp"
                    />
                  </label>
                  <SecretFields
                    title="Headers"
                    fields={selected.headers}
                    onChange={(headers) => onUpdate({ headers })}
                  />
                </>
              )}

              <div className="mcp-form-grid mcp-options">
                <label>
                  <span>Timeout · ms</span>
                  <input
                    type="number"
                    min={1000}
                    max={600000}
                    value={selected.timeoutMs}
                    onChange={(event) =>
                      onUpdate({ timeoutMs: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="trust-option">
                  <input
                    type="checkbox"
                    checked={selected.trust}
                    onChange={(event) =>
                      onUpdate({ trust: event.target.checked })
                    }
                  />
                  <span>信任该 Server 的工具调用</span>
                </label>
              </div>
              <button className="remove-server-button" onClick={onRemove}>
                <Trash2 size={13} /> 从配置中移除
              </button>
            </div>
          ) : (
            <div className="capability-empty mcp-empty">
              <ServerCog size={25} />
              <strong>连接外部工具</strong>
              <p>支持本地 STDIO、Streamable HTTP 和 SSE MCP Server。</p>
              <button className="secondary-button" onClick={addBlankServer}>
                <Plus size={14} /> 添加 Server
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GameMcpCatalog({
  category,
  servers,
  busy,
  onCategoryChange,
  onAdd,
}: {
  category: 'all' | GameMcpCategory;
  servers: McpServerDefinition[];
  busy: boolean;
  onCategoryChange: (category: 'all' | GameMcpCategory) => void;
  onAdd: (preset: GameMcpPreset) => void;
}) {
  const items = gameMcpCatalog.filter(
    (item) => category === 'all' || item.category === category,
  );
  const configuredNames = new Set(
    servers.map((server) => server.name.toLowerCase()),
  );

  return (
    <div className="game-mcp-catalog">
      <div className="catalog-controls">
        <div className="catalog-filters" role="group" aria-label="筛选推荐 MCP">
          {(
            Object.keys(gameMcpCategoryLabels) as Array<'all' | GameMcpCategory>
          ).map((key) => (
            <button
              key={key}
              className={category === key ? 'is-active' : ''}
              onClick={() => onCategoryChange(key)}
              aria-pressed={category === key}
            >
              {gameMcpCategoryLabels[key]}
            </button>
          ))}
        </div>
        <span className="catalog-transport-key">
          ADD AS DRAFT · SAVE TO ACTIVATE
        </span>
      </div>

      <div className="catalog-review-note mcp-catalog-note">
        <BadgeCheck size={14} />
        <span>
          推荐项只会填入配置草稿，不会自动启动第三方程序；引擎插件、npx 或 uvx
          依赖仍需按卡片说明准备。
        </span>
      </div>

      <div className="catalog-grid">
        {items.map((item) => {
          const isConfigured = configuredNames.has(
            item.config.name.toLowerCase(),
          );
          return (
            <article className="catalog-card mcp-catalog-card" key={item.id}>
              <div className="catalog-card-heading">
                <CapabilityIcon kind="mcp" id={item.id} />
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.publisher}</small>
                </div>
                <span className={`trust-badge trust-${item.trust}`}>
                  {item.trust === 'official' ? 'OFFICIAL' : 'REVIEWED'}
                </span>
              </div>
              <p>{item.description}</p>
              <div className="catalog-provenance mcp-evidence-rail">
                <span>{item.evidence}</span>
                <span>{item.license}</span>
                <span>{mcpTransportLabel(item.config)}</span>
              </div>
              <div className="catalog-requirement">
                <AlertTriangle size={11} /> {item.requirement}
              </div>
              {item.caution ? (
                <div className="mcp-caution">
                  <ShieldCheck size={11} /> {item.caution}
                </div>
              ) : null}
              <div className="catalog-card-actions">
                <button
                  className="catalog-source-button"
                  onClick={() =>
                    void window.gameAgent.openGitHubUrl(
                      `https://github.com/${item.repository}`,
                    )
                  }
                  title="在 GitHub 查看源代码"
                >
                  <ExternalLink size={12} /> 查看来源
                </button>
                <button
                  className={
                    isConfigured ? 'catalog-installed-button' : 'primary-button'
                  }
                  disabled={busy || isConfigured}
                  onClick={() => onAdd(item.config)}
                >
                  {isConfigured ? (
                    <>
                      <CircleCheck size={13} /> 已配置
                    </>
                  ) : (
                    <>
                      <Plus size={13} /> 添加配置
                    </>
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function mcpTransportLabel(preset: GameMcpPreset): string {
  if (preset.transport === 'http') return 'HTTP · LOCAL EDITOR';
  return `STDIO · ${preset.command.toUpperCase()}`;
}

function skillCatalogIconId(skill: SkillSummary): string | undefined {
  const source = skill.source;
  const item = gameSkillCatalog.find((candidate) => {
    if (source?.kind === 'github') {
      return (
        candidate.repository.toLowerCase() ===
          source.repository.toLowerCase() && candidate.path === source.path
      );
    }
    const name = skill.name.trim().toLowerCase();
    return candidate.id === name || candidate.name.toLowerCase() === name;
  });
  return item?.id;
}

function mcpCatalogIconId(server: McpServerDefinition): string | undefined {
  return gameMcpCatalog.find(
    (item) =>
      item.config.name.toLowerCase() === server.name.trim().toLowerCase(),
  )?.id;
}

function SecretFields({
  title,
  fields,
  onChange,
}: {
  title: string;
  fields: SecretField[];
  onChange: (fields: SecretField[]) => void;
}) {
  return (
    <div className="secret-fields">
      <div className="secret-fields-heading">
        <span>{title}</span>
        <button
          onClick={() => onChange([...fields, { name: '', value: '' }])}
          type="button"
        >
          <Plus size={12} /> 添加
        </button>
      </div>
      {fields.map((field, index) => (
        <div className="secret-field-row" key={`${field.name}-${index}`}>
          <input
            aria-label={`${title} 名称`}
            value={field.name}
            onChange={(event) =>
              onChange(
                fields.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, name: event.target.value }
                    : item,
                ),
              )
            }
            placeholder={title === 'Headers' ? 'Authorization' : 'API_TOKEN'}
          />
          <input
            aria-label={`${title} 值`}
            type="password"
            value={field.value}
            onChange={(event) =>
              onChange(
                fields.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, value: event.target.value }
                    : item,
                ),
              )
            }
            placeholder={
              field.configured ? '已安全保存；留空保持不变' : 'value'
            }
            autoComplete="off"
          />
          <button
            type="button"
            aria-label={`移除 ${field.name || title} 字段`}
            onClick={() =>
              onChange(fields.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function newMcpServer(): McpServerDefinition {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    enabled: true,
    transport: 'stdio',
    command: '',
    args: [],
    cwd: '',
    url: '',
    timeoutMs: 30_000,
    trust: false,
    env: [],
    headers: [],
  };
}

function toMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(
    /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
    '',
  );
}
