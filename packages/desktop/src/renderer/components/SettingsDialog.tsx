import {
  Activity,
  Blocks,
  Braces,
  CheckCircle2,
  Clock3,
  Download,
  Gauge,
  KeyRound,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  Save,
  ServerCog,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  AgentEvent,
  ApiUsageRecord,
  ApiUsageSnapshot,
  AppSettings,
  DependencyAction,
  DesktopDependency,
  DesktopDependencyId,
  ProjectRecord,
  ProviderConnectionInput,
  ProviderConnectionResult,
  ProviderEndpoint,
  ProviderSlot,
} from '../../shared/types';

interface SettingsDialogProps {
  value: AppSettings;
  project?: ProjectRecord;
  events: AgentEvent[];
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
  onTest: (input: ProviderConnectionInput) => Promise<ProviderConnectionResult>;
}

type SettingsSection = 'api' | 'developer' | 'dependencies';
type DeveloperView = 'prompts' | 'functions' | 'scheduler';

const PROVIDERS: Array<{
  key: ProviderSlot;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: 'main',
    label: '主 Agent',
    shortLabel: 'AGENT',
    description: '规划、编码和工具调用',
  },
  {
    key: 'reasoning',
    label: '策划模型',
    shortLabel: 'PLAN',
    description: '类型识别与 GDD',
  },
  {
    key: 'image',
    label: '图像模型',
    shortLabel: 'IMAGE',
    description: '背景、角色与图块',
  },
  {
    key: 'video',
    label: '视频模型',
    shortLabel: 'VIDEO',
    description: '动画帧与视频素材',
  },
  {
    key: 'audio',
    label: '音频模型',
    shortLabel: 'AUDIO',
    description: 'BGM、音效与合成',
  },
];

const STANDARD_PROVIDER_OPTIONS = [
  { value: 'openai-compat', label: 'OpenAI Compatible' },
  { value: 'tongyi', label: '通义 / DashScope' },
  { value: 'doubao', label: '豆包 / ARK' },
] as const;

const PROFESSIONAL_AUDIO_OPTIONS = [
  { value: 'elevenlabs', label: 'ElevenLabs Music + SFX' },
  { value: 'minimax', label: 'MiniMax Music' },
  { value: 'stability', label: 'Stable Audio' },
  { value: 'google-lyria', label: 'Google Lyria 2' },
  { value: 'mureka', label: 'Mureka Instrumental' },
] as const;

const AUDIO_PRESETS: Partial<
  Record<
    ProviderEndpoint['provider'],
    Pick<ProviderEndpoint, 'baseUrl' | 'model'>
  >
> = {
  'openai-compat': {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
  },
  tongyi: {
    baseUrl: 'https://dashscope.aliyuncs.com',
    model: 'qwen-plus',
  },
  doubao: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-1-6-251015',
  },
  elevenlabs: {
    baseUrl: 'https://api.elevenlabs.io',
    model: 'music_v2',
  },
  minimax: {
    baseUrl: 'https://api.minimaxi.com',
    model: 'music-2.6-free',
  },
  stability: {
    baseUrl: 'https://api.stability.ai',
    model: 'stable-audio-3',
  },
  'google-lyria': {
    baseUrl:
      'https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/us-central1/publishers/google/models',
    model: 'lyria-002',
  },
  mureka: {
    baseUrl: 'https://api.mureka.ai',
    model: 'mureka-9',
  },
};

const SECTION_NAV: Array<{
  key: SettingsSection;
  label: string;
  description: string;
  icon: typeof Gauge;
}> = [
  {
    key: 'api',
    label: 'API 与用量',
    description: '服务、测速、Token',
    icon: Gauge,
  },
  {
    key: 'developer',
    label: '开发者',
    description: '提示词与调用链',
    icon: Braces,
  },
  {
    key: 'dependencies',
    label: '依赖',
    description: '引擎与本机工具',
    icon: PackageOpen,
  },
];

export function SettingsDialog({
  value,
  project,
  events,
  onClose,
  onSave,
  onTest,
}: SettingsDialogProps) {
  const [settings, setSettings] = useState<AppSettings>(structuredClone(value));
  const [section, setSection] = useState<SettingsSection>('api');
  const [activeProvider, setActiveProvider] = useState<ProviderSlot>('main');
  const [developerView, setDeveloperView] = useState<DeveloperView>('prompts');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'warning' | 'error' | 'progress';
    message: string;
  }>();
  const [usage, setUsage] = useState<ApiUsageSnapshot>();
  const [usageLoading, setUsageLoading] = useState(true);
  const [dependencies, setDependencies] = useState<DesktopDependency[]>();
  const [dependencyLoading, setDependencyLoading] = useState(false);
  const [dependencyBusy, setDependencyBusy] = useState<DesktopDependencyId>();
  const [dependencyLog, setDependencyLog] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);

  const current = settings[activeProvider];
  const functionEvents = useMemo(
    () =>
      events
        .filter(
          (event) => event.type === 'tool_call' || event.type === 'tool_result',
        )
        .slice(-60)
        .reverse(),
    [events],
  );
  const configuredProviders = PROVIDERS.filter(
    (provider) => settings[provider.key].apiKeyConfigured,
  ).length;
  const installedDependencies =
    dependencies?.filter((dependency) => dependency.status === 'installed')
      .length ?? 0;

  useEffect(() => {
    void refreshUsage();
    const unsubscribe = window.gameAgent.onDependencyOutput((output) => {
      setDependencyLog((previous) =>
        `${previous}${output.text}`.slice(-60_000),
      );
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (section !== 'dependencies' || dependencies) return;
    void refreshDependencies();
  }, [section, dependencies]);

  useEffect(() => {
    if (section !== 'developer' || !settings.developerMode || !project) {
      setSystemPrompt('');
      return;
    }
    let cancelled = false;
    setPromptLoading(true);
    void window.gameAgent
      .readFile(project.id, '.qwen/system.md')
      .then((file) => {
        if (!cancelled) setSystemPrompt(file.content);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSystemPrompt(`无法读取项目系统提示词：${toMessage(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) setPromptLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, section, settings.developerMode]);

  function updateEndpoint(patch: Partial<ProviderEndpoint>) {
    setFeedback(undefined);
    setSettings((previous) => ({
      ...previous,
      [activeProvider]: { ...previous[activeProvider], ...patch },
    }));
  }

  function selectProvider(provider: ProviderEndpoint['provider']) {
    const changed = provider !== current.provider;
    updateEndpoint({
      provider,
      ...(activeProvider === 'audio' ? AUDIO_PRESETS[provider] : {}),
      ...(changed
        ? { apiKey: '', apiKeyConfigured: false, apiKeyInherited: false }
        : {}),
    });
  }

  async function save() {
    setBusy(true);
    setFeedback(undefined);
    try {
      await onSave(settings);
      setFeedback({ tone: 'success', message: '设置已安全保存' });
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setFeedback({ tone: 'progress', message: '正在执行基础测速…' });
    try {
      const result = await onTest({ slot: activeProvider, endpoint: current });
      setFeedback({
        tone: result.status,
        message: `${result.message}（${result.latencyMs} ms）`,
      });
      await refreshUsage();
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setTesting(false);
    }
  }

  async function refreshUsage() {
    setUsageLoading(true);
    try {
      setUsage(await window.gameAgent.loadApiUsage());
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setUsageLoading(false);
    }
  }

  async function refreshDependencies() {
    setDependencyLoading(true);
    try {
      setDependencies(await window.gameAgent.inspectDependencies());
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setDependencyLoading(false);
    }
  }

  async function runDependencyAction(
    dependency: DesktopDependency,
    action: DependencyAction,
  ) {
    setDependencyBusy(dependency.id);
    setDependencyLog('');
    setFeedback({
      tone: 'progress',
      message:
        action === 'open'
          ? `正在打开 ${dependency.name}…`
          : `正在${action === 'install' ? '安装' : '更新'} ${dependency.name}…`,
    });
    try {
      const result = await window.gameAgent.runDependencyAction({
        id: dependency.id,
        action,
      });
      if (!result) {
        setFeedback({ tone: 'warning', message: '依赖操作已取消' });
        return;
      }
      setDependencyLog((previous) =>
        `${previous}${result.output ? `\n${result.output}` : ''}`.slice(
          -60_000,
        ),
      );
      setFeedback({
        tone: result.success ? 'success' : 'error',
        message: result.message,
      });
      await refreshDependencies();
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setDependencyBusy(undefined);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog settings-dialog settings-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header>
          <div>
            <span className="dialog-index">SYSTEM / CONTROL CENTER</span>
            <h2 id="settings-title">设置</h2>
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="settings-center-layout">
          <nav className="settings-center-nav" aria-label="设置分类">
            <div className="settings-nav-caption">SETTINGS</div>
            {SECTION_NAV.map((item) => {
              const Icon = item.icon;
              const meta =
                item.key === 'api'
                  ? `${configuredProviders}/5`
                  : item.key === 'developer'
                    ? settings.developerMode
                      ? 'ON'
                      : 'OFF'
                    : dependencies
                      ? `${installedDependencies}/${dependencies.length}`
                      : '—';
              return (
                <button
                  key={item.key}
                  className={section === item.key ? 'is-active' : ''}
                  aria-current={section === item.key ? 'page' : undefined}
                  onClick={() => {
                    setSection(item.key);
                    setFeedback(undefined);
                  }}
                >
                  <Icon size={17} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <i>{meta}</i>
                </button>
              );
            })}
            <div className="settings-nav-note">
              <ShieldCheck size={15} />
              <span>密钥由系统安全存储加密，开发者视图不显示凭据。</span>
            </div>
          </nav>

          <div
            className={`settings-center-content ${
              section === 'api' ? 'is-api-scroll-locked' : ''
            }`}
          >
            {section === 'api' ? (
              <ApiPanel
                settings={settings}
                active={activeProvider}
                current={current}
                usage={usage}
                usageLoading={usageLoading}
                project={project}
                events={events}
                onActiveChange={setActiveProvider}
                onProviderChange={selectProvider}
                onEndpointChange={updateEndpoint}
                onRefresh={() => void refreshUsage()}
              />
            ) : null}
            {section === 'developer' ? (
              <DeveloperPanel
                enabled={settings.developerMode}
                view={developerView}
                project={project}
                events={events}
                functionEvents={functionEvents}
                systemPrompt={systemPrompt}
                promptLoading={promptLoading}
                onEnabledChange={(enabled) => {
                  setSettings((previous) => ({
                    ...previous,
                    developerMode: enabled,
                  }));
                  setFeedback({
                    tone: 'warning',
                    message: '点击“保存设置”后生效',
                  });
                }}
                onViewChange={setDeveloperView}
              />
            ) : null}
            {section === 'dependencies' ? (
              <DependenciesPanel
                dependencies={dependencies}
                loading={dependencyLoading}
                busyId={dependencyBusy}
                log={dependencyLog}
                onRefresh={() => void refreshDependencies()}
                onAction={(dependency, action) =>
                  void runDependencyAction(dependency, action)
                }
              />
            ) : null}
          </div>
        </div>

        <footer className="settings-footer settings-center-footer">
          <div className="settings-footer-note">
            {section === 'dependencies' ? (
              <>
                <Wrench size={14} />{' '}
                安装与更新使用固定白名单，并在执行前再次确认。
              </>
            ) : section === 'developer' ? (
              <>
                <Braces size={14} /> 开发者模式只增加可观测性，不提升 Agent
                权限。
              </>
            ) : (
              <>
                <Activity size={14} /> 用量为本机累计，不包含费用估算。
              </>
            )}
          </div>
          <span
            className={`save-message ${feedback?.tone ?? ''}`}
            role="status"
          >
            {feedback?.message}
          </span>
          {section !== 'dependencies' ? (
            <div className="settings-actions">
              {section === 'api' ? (
                <button
                  className="secondary-button"
                  onClick={() => void testConnection()}
                  disabled={busy || testing}
                >
                  {testing ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Zap size={15} />
                  )}
                  {testing ? '测速中…' : '基础测速'}
                </button>
              ) : null}
              <button
                className="primary-button"
                onClick={() => void save()}
                disabled={busy || testing}
              >
                <Save size={15} />
                {busy ? '保存中…' : '保存设置'}
              </button>
            </div>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

interface ApiPanelProps {
  settings: AppSettings;
  active: ProviderSlot;
  current: ProviderEndpoint;
  usage?: ApiUsageSnapshot;
  usageLoading: boolean;
  project?: ProjectRecord;
  events: AgentEvent[];
  onActiveChange: (slot: ProviderSlot) => void;
  onProviderChange: (provider: ProviderEndpoint['provider']) => void;
  onEndpointChange: (patch: Partial<ProviderEndpoint>) => void;
  onRefresh: () => void;
}

function ApiPanel({
  settings,
  active,
  current,
  usage,
  usageLoading,
  project,
  events,
  onActiveChange,
  onProviderChange,
  onEndpointChange,
  onRefresh,
}: ApiPanelProps) {
  const [activityView, setActivityView] = useState<'work' | 'usage'>('work');
  const totals = usage?.totals;
  const successRate = totals?.runs
    ? Math.round((totals.successes / totals.runs) * 100)
    : 0;
  const workEvents = events
    .filter((event) =>
      [
        'user',
        'assistant',
        'tool_call',
        'tool_result',
        'error',
        'complete',
      ].includes(event.type),
    )
    .slice(-20)
    .reverse();
  return (
    <section className="settings-page api-settings-page">
      <div className="settings-page-heading">
        <div>
          <span>API CONTROL / LOCAL TELEMETRY</span>
          <h3>API 管理与调用</h3>
          <p>
            配置服务、执行基础测速，并查看 Noobi.ai 在本机记录的调用与 Token。
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={onRefresh}
          disabled={usageLoading}
        >
          <RefreshCw className={usageLoading ? 'spin' : ''} size={14} />
          刷新用量
        </button>
      </div>

      <div className="usage-metrics" aria-label="API 用量摘要">
        <MetricCard
          label="API CALLS"
          value={formatNumber(totals?.calls ?? 0)}
          detail={`${formatNumber(totals?.runs ?? 0)} 个 Agent 回合 / 测速`}
          icon={<Activity size={16} />}
        />
        <MetricCard
          label="SUCCESS RATE"
          value={`${successRate}%`}
          detail={`${totals?.failures ?? 0} 次失败 · ${totals?.warnings ?? 0} 次警告`}
          icon={<CheckCircle2 size={16} />}
          tone="green"
        />
        <MetricCard
          label="AVG LATENCY"
          value={formatLatency(totals?.averageDurationMs ?? 0)}
          detail="正式调用与测速的平均值"
          icon={<Clock3 size={16} />}
        />
        <MetricCard
          label="TOTAL TOKENS"
          value={formatCompactNumber(totals?.totalTokens ?? 0)}
          detail={`IN ${formatCompactNumber(totals?.inputTokens ?? 0)} · OUT ${formatCompactNumber(totals?.outputTokens ?? 0)}`}
          icon={<Gauge size={16} />}
          tone="accent"
        />
      </div>

      <div
        className="provider-slot-strip"
        role="tablist"
        aria-label="API 服务类型"
      >
        {PROVIDERS.map((provider) => (
          <button
            key={provider.key}
            role="tab"
            aria-selected={active === provider.key}
            className={active === provider.key ? 'is-active' : ''}
            onClick={() => onActiveChange(provider.key)}
          >
            <small>{provider.shortLabel}</small>
            <strong>{provider.label}</strong>
            <span
              className={
                settings[provider.key].apiKeyConfigured ? 'is-ready' : ''
              }
            >
              {settings[provider.key].apiKeyConfigured ? '已配置' : '未配置'}
            </span>
          </button>
        ))}
      </div>

      <div className="api-control-grid">
        <div className="provider-form api-provider-form">
          <div className="provider-heading">
            <KeyRound size={18} />
            <div>
              <strong>
                {PROVIDERS.find((item) => item.key === active)?.label}
              </strong>
              <span>
                {current.apiKeyInherited
                  ? inheritedCredentialMessage(active)
                  : current.apiKeyConfigured
                    ? '密钥已保存在系统安全存储中'
                    : '尚未配置密钥'}
              </span>
            </div>
          </div>
          <div className="provider-field-grid">
            <label>
              <span>Provider</span>
              <select
                value={current.provider}
                onChange={(event) =>
                  onProviderChange(
                    event.target.value as ProviderEndpoint['provider'],
                  )
                }
              >
                {(active === 'audio'
                  ? [
                      ...PROFESSIONAL_AUDIO_OPTIONS,
                      ...STANDARD_PROVIDER_OPTIONS,
                    ]
                  : STANDARD_PROVIDER_OPTIONS
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Model</span>
              <input
                value={current.model}
                onChange={(event) =>
                  onEndpointChange({ model: event.target.value })
                }
                placeholder="deepseek-chat"
              />
            </label>
            <label className="provider-wide-field">
              <span>Base URL</span>
              <input
                value={current.baseUrl}
                onChange={(event) =>
                  onEndpointChange({ baseUrl: event.target.value })
                }
                placeholder="https://api.deepseek.com"
              />
            </label>
            <label className="provider-wide-field">
              <span>API Key</span>
              <input
                type="password"
                value={current.apiKey}
                onChange={(event) =>
                  onEndpointChange({ apiKey: event.target.value })
                }
                placeholder={
                  current.apiKeyConfigured ? '已配置；留空则保持不变' : 'sk-…'
                }
                autoComplete="off"
              />
            </label>
          </div>
          <div className="security-note">
            <ShieldCheck size={14} />
            API Key 仅传给内置 Agent Runtime；项目 Shell
            会自动移除凭据，调用记录也不保存密钥、URL 或提示词。
          </div>
          {active === 'audio' && current.provider === 'google-lyria' ? (
            <div className="security-note warning">
              请把 Base URL 中的 PROJECT_ID 替换为 Google Cloud 项目，并在 API
              Key 栏填写 OAuth Access Token。
            </div>
          ) : null}
        </div>

        <div className="api-activity-panel">
          <div className="panel-section-heading api-activity-heading">
            <div>
              <span>RECENT ACTIVITY</span>
              <strong>
                {activityView === 'work' ? '实际工作调用' : 'API 计量记录'}
              </strong>
            </div>
            <div
              className="activity-view-toggle"
              role="tablist"
              aria-label="最近调用视图"
            >
              <button
                role="tab"
                aria-selected={activityView === 'work'}
                className={activityView === 'work' ? 'is-active' : ''}
                onClick={() => setActivityView('work')}
              >
                工作调用
              </button>
              <button
                role="tab"
                aria-selected={activityView === 'usage'}
                className={activityView === 'usage' ? 'is-active' : ''}
                onClick={() => setActivityView('usage')}
              >
                API 计量
              </button>
            </div>
          </div>
          {activityView === 'work' ? (
            project ? (
              workEvents.length ? (
                <div
                  className="work-call-list"
                  role="region"
                  aria-label="实际工作调用记录"
                  tabIndex={0}
                >
                  {workEvents.map((event, index) => (
                    <WorkCallRow
                      key={event.id}
                      event={event}
                      defaultOpen={index === 0}
                    />
                  ))}
                </div>
              ) : (
                <div className="settings-empty-state compact">
                  <SquareTerminal size={22} />
                  <strong>还没有实际工作调用</strong>
                  <span>
                    启动当前项目的 Agent 后，用户指令、回复和 Function Calling
                    会按执行顺序显示。
                  </span>
                </div>
              )
            ) : (
              <div className="settings-empty-state compact">
                <SquareTerminal size={22} />
                <strong>请先选择一个项目</strong>
                <span>
                  实际工作调用以当前项目为上下文，不会混入其他项目内容。
                </span>
              </div>
            )
          ) : usageLoading ? (
            <div className="settings-inline-loading">
              <LoaderCircle className="spin" size={18} /> 正在读取本机用量…
            </div>
          ) : usage?.recent.length ? (
            <div
              className="api-call-list"
              role="region"
              aria-label="API 计量记录"
              tabIndex={0}
            >
              {usage.recent.map((record) => (
                <ApiCallRow key={record.id} record={record} />
              ))}
            </div>
          ) : (
            <div className="settings-empty-state compact">
              <Activity size={22} />
              <strong>还没有调用记录</strong>
              <span>启动 Agent 或执行一次基础测速后，这里会显示真实数据。</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function WorkCallRow({
  event,
  defaultOpen,
}: {
  event: AgentEvent;
  defaultOpen: boolean;
}) {
  return (
    <details
      className={`work-call-row type-${event.type} ${event.isError ? 'is-error' : ''}`}
      open={defaultOpen ? true : undefined}
    >
      <summary>
        <span className="work-call-type">{workCallTypeLabel(event.type)}</span>
        <div className="work-call-copy">
          <strong>{event.toolName || event.title}</strong>
          <span>{event.message}</span>
        </div>
        <time>{formatTimestamp(event.timestamp)}</time>
      </summary>
      <pre>{event.message}</pre>
    </details>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone?: 'default' | 'green' | 'accent';
}) {
  return (
    <div className={`usage-metric tone-${tone}`}>
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ApiCallRow({ record }: { record: ApiUsageRecord }) {
  const tokens = record.totalTokens
    ? formatCompactNumber(record.totalTokens)
    : '—';
  return (
    <div className="api-call-row">
      <span
        className={`api-status-mark is-${record.status}`}
        aria-hidden="true"
      />
      <div className="api-call-main">
        <strong>{providerDisplayName(record.provider)}</strong>
        <small>{record.model || providerSlotLabel(record.slot)}</small>
      </div>
      <div className="api-call-stats">
        <span>{formatLatency(record.durationMs)}</span>
        <span>{tokens} TOK</span>
      </div>
      <div className="api-call-meta">
        <span>{record.source === 'connection-test' ? '测速' : 'Agent'}</span>
        <time>{formatTimestamp(record.occurredAt)}</time>
      </div>
    </div>
  );
}

interface DeveloperPanelProps {
  enabled: boolean;
  view: DeveloperView;
  project?: ProjectRecord;
  events: AgentEvent[];
  functionEvents: AgentEvent[];
  systemPrompt: string;
  promptLoading: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onViewChange: (view: DeveloperView) => void;
}

function DeveloperPanel({
  enabled,
  view,
  project,
  events,
  functionEvents,
  systemPrompt,
  promptLoading,
  onEnabledChange,
  onViewChange,
}: DeveloperPanelProps) {
  const toolCalls = events.filter((event) => event.type === 'tool_call');
  const toolFailures = events.filter(
    (event) => event.type === 'tool_result' && event.isError,
  );
  const latestToolCall = [...toolCalls].reverse()[0];
  const latestToolResult = [...events]
    .reverse()
    .find((event) => event.type === 'tool_result');
  const currentTool =
    project?.status === 'running' &&
    latestToolCall &&
    (!latestToolResult || latestToolCall.timestamp > latestToolResult.timestamp)
      ? latestToolCall
      : undefined;
  return (
    <section className="settings-page developer-settings-page">
      <div className="settings-page-heading">
        <div>
          <span>DEVELOPER / OBSERVABILITY</span>
          <h3>开发者模式</h3>
          <p>
            检查项目提示词、Function Calling 与桌面 Agent 的单任务调度状态。
          </p>
        </div>
      </div>

      <div className={`developer-mode-switch ${enabled ? 'is-enabled' : ''}`}>
        <div className="developer-switch-icon">
          <Braces size={21} />
        </div>
        <div>
          <strong>{enabled ? '开发者模式已开启' : '开发者模式已关闭'}</strong>
          <span>
            {enabled
              ? '诊断信息仅在本机展示，并沿用现有脱敏规则。'
              : '开启后可以查看提示词、工具调用与调度状态。'}
          </span>
        </div>
        <button
          className="switch-control"
          role="switch"
          aria-checked={enabled}
          aria-label="开发者模式"
          onClick={() => onEnabledChange(!enabled)}
        >
          <i />
          <span>{enabled ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {!enabled ? (
        <div className="developer-locked-state">
          <div className="developer-lock-grid" aria-hidden="true">
            <span>PROMPT</span>
            <span>FUNCTION</span>
            <span>SCHEDULER</span>
          </div>
          <SquareTerminal size={28} />
          <strong>诊断界面保持隐藏</strong>
          <p>
            开启开发者模式并保存设置后即可查看。它不会开启 Chromium
            DevTools，也不会改变 Agent 的执行权限。
          </p>
        </div>
      ) : (
        <>
          <div
            className="developer-tabs"
            role="tablist"
            aria-label="开发者诊断类型"
          >
            <button
              role="tab"
              aria-selected={view === 'prompts'}
              className={view === 'prompts' ? 'is-active' : ''}
              onClick={() => onViewChange('prompts')}
            >
              <Blocks size={14} /> 提示词
            </button>
            <button
              role="tab"
              aria-selected={view === 'functions'}
              className={view === 'functions' ? 'is-active' : ''}
              onClick={() => onViewChange('functions')}
            >
              <Braces size={14} /> Function Calling
              <i>{functionEvents.length}</i>
            </button>
            <button
              role="tab"
              aria-selected={view === 'scheduler'}
              className={view === 'scheduler' ? 'is-active' : ''}
              onClick={() => onViewChange('scheduler')}
            >
              <ServerCog size={14} /> 调度器
            </button>
          </div>

          {view === 'prompts' ? (
            project ? (
              <div className="prompt-inspector-grid">
                <PromptInspector
                  label="LATEST USER PROMPT"
                  value={project.prompt}
                  meta={`${project.name} · ${formatTimestamp(project.updatedAt)}`}
                />
                <PromptInspector
                  label="PROJECT SYSTEM PROMPT"
                  value={
                    promptLoading ? '正在读取 .qwen/system.md…' : systemPrompt
                  }
                  meta=".qwen/system.md · 启动 Agent 前刷新"
                />
                <div className="developer-data-note">
                  这里展示项目级系统提示词；Runtime 动态注入的工具
                  schema、memory 与 MCP 协议不在此文本内。
                </div>
              </div>
            ) : (
              <DeveloperProjectEmpty />
            )
          ) : null}

          {view === 'functions' ? (
            project ? (
              functionEvents.length ? (
                <div className="function-call-list">
                  {functionEvents.map((event) => (
                    <div
                      className={`function-call-item ${event.isError ? 'is-error' : ''}`}
                      key={event.id}
                    >
                      <span className="function-call-kind">
                        {event.type === 'tool_call'
                          ? 'CALL'
                          : event.isError
                            ? 'ERROR'
                            : 'RESULT'}
                      </span>
                      <div>
                        <strong>{event.toolName || event.title}</strong>
                        <pre>{event.message}</pre>
                      </div>
                      <time>{formatTimestamp(event.timestamp)}</time>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="settings-empty-state">
                  <Braces size={24} />
                  <strong>还没有 Function Calling</strong>
                  <span>
                    当前项目产生工具调用后，这里会展示脱敏后的输入与结果。
                  </span>
                </div>
              )
            ) : (
              <DeveloperProjectEmpty />
            )
          ) : null}

          {view === 'scheduler' ? (
            project ? (
              <div className="scheduler-panel">
                <div className="scheduler-state-rail">
                  <div className="scheduler-state-copy">
                    <span
                      className={`scheduler-pulse status-${project.status}`}
                    />
                    <div>
                      <small>ACTIVE SCHEDULER</small>
                      <strong>
                        {project.status === 'running'
                          ? '正在执行单任务'
                          : '调度器空闲'}
                      </strong>
                    </div>
                  </div>
                  <span className="scheduler-mode">SERIAL / 1 SLOT</span>
                </div>
                <div className="scheduler-metrics">
                  <SchedulerDatum label="PROJECT" value={project.name} />
                  <SchedulerDatum
                    label="PIPELINE STAGE"
                    value={stageLabel(project.stage)}
                  />
                  <SchedulerDatum
                    label="STATUS"
                    value={projectStatusLabel(project.status)}
                  />
                  <SchedulerDatum
                    label="SESSION"
                    value={
                      project.sessionId
                        ? project.sessionId.slice(0, 12)
                        : 'NEW SESSION'
                    }
                    mono
                  />
                  <SchedulerDatum
                    label="TOOL CALLS"
                    value={String(toolCalls.length)}
                  />
                  <SchedulerDatum
                    label="FAILURES"
                    value={String(toolFailures.length)}
                  />
                </div>
                <div className="scheduler-current-tool">
                  <SquareTerminal size={17} />
                  <div>
                    <span>CURRENT TOOL</span>
                    <strong>{currentTool?.toolName || '无待执行工具'}</strong>
                    <small>
                      {currentTool
                        ? currentTool.message
                        : 'Noobi.ai 当前采用全应用单任务互斥；没有后台隐藏队列。'}
                    </small>
                  </div>
                </div>
              </div>
            ) : (
              <DeveloperProjectEmpty />
            )
          ) : null}
        </>
      )}
    </section>
  );
}

function PromptInspector({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="prompt-inspector">
      <div>
        <span>{label}</span>
        <small>{meta}</small>
      </div>
      <pre>{value || '暂无内容'}</pre>
    </div>
  );
}

function SchedulerDatum({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong className={mono ? 'is-mono' : ''}>{value}</strong>
    </div>
  );
}

function DeveloperProjectEmpty() {
  return (
    <div className="settings-empty-state">
      <SquareTerminal size={24} />
      <strong>请先选择一个项目</strong>
      <span>提示词、Function Calling 与调度器都以当前项目为上下文。</span>
    </div>
  );
}

interface DependenciesPanelProps {
  dependencies?: DesktopDependency[];
  loading: boolean;
  busyId?: DesktopDependencyId;
  log: string;
  onRefresh: () => void;
  onAction: (dependency: DesktopDependency, action: DependencyAction) => void;
}

function DependenciesPanel({
  dependencies,
  loading,
  busyId,
  log,
  onRefresh,
  onAction,
}: DependenciesPanelProps) {
  const toolchain = dependencies?.filter(
    (item) => item.id === 'npx' || item.id === 'uvx',
  );
  const engines = dependencies?.filter(
    (item) => item.id !== 'npx' && item.id !== 'uvx',
  );
  return (
    <section className="settings-page dependency-settings-page">
      <div className="settings-page-heading">
        <div>
          <span>LOCAL RUNTIME / DEPENDENCIES</span>
          <h3>依赖安装与更新</h3>
          <p>检测 Agent 工具链和游戏引擎，并通过严格白名单执行安装或更新。</p>
        </div>
        <button
          className="secondary-button"
          onClick={onRefresh}
          disabled={loading || Boolean(busyId)}
        >
          <RefreshCw className={loading ? 'spin' : ''} size={14} />
          重新检测
        </button>
      </div>

      {loading && !dependencies ? (
        <div className="settings-inline-loading dependency-loading">
          <LoaderCircle className="spin" size={20} /> 正在检测 npx、uvx
          与本机引擎…
        </div>
      ) : (
        <div className="dependency-groups">
          <DependencyGroup
            label="AGENT TOOLCHAIN"
            title="Agent 工具链"
            dependencies={toolchain ?? []}
            busyId={busyId}
            onAction={onAction}
          />
          <DependencyGroup
            label="GAME PRODUCTION"
            title="游戏制作环境"
            dependencies={engines ?? []}
            busyId={busyId}
            onAction={onAction}
          />
        </div>
      )}

      {busyId || log ? (
        <div className="dependency-log-panel">
          <div>
            <span>INSTALL LOG</span>
            <strong>{busyId ? '操作进行中' : '最近一次操作'}</strong>
            {busyId ? <LoaderCircle className="spin" size={14} /> : null}
          </div>
          <pre>{log || '等待命令输出…'}</pre>
        </div>
      ) : null}
    </section>
  );
}

function DependencyGroup({
  label,
  title,
  dependencies,
  busyId,
  onAction,
}: {
  label: string;
  title: string;
  dependencies: DesktopDependency[];
  busyId?: DesktopDependencyId;
  onAction: (dependency: DesktopDependency, action: DependencyAction) => void;
}) {
  return (
    <div className="dependency-group">
      <div className="panel-section-heading">
        <div>
          <span>{label}</span>
          <strong>{title}</strong>
        </div>
        <small>
          {dependencies.filter((item) => item.status === 'installed').length}/
          {dependencies.length} READY
        </small>
      </div>
      <div className="dependency-list">
        {dependencies.map((dependency) => (
          <DependencyRow
            key={dependency.id}
            dependency={dependency}
            busy={busyId === dependency.id}
            disabled={Boolean(busyId)}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  );
}

function DependencyRow({
  dependency,
  busy,
  disabled,
  onAction,
}: {
  dependency: DesktopDependency;
  busy: boolean;
  disabled: boolean;
  onAction: (dependency: DesktopDependency, action: DependencyAction) => void;
}) {
  const Icon = dependencyIcon(dependency.id);
  return (
    <div className="dependency-row">
      <div className={`dependency-icon dependency-${dependency.id}`}>
        <Icon size={19} />
      </div>
      <div className="dependency-copy">
        <div>
          <strong>{dependency.name}</strong>
          <span className={`dependency-status is-${dependency.status}`}>
            {dependencyStatusLabel(dependency.status)}
          </span>
        </div>
        <p>{dependency.description}</p>
        <small title={dependency.path}>
          {dependency.version || dependency.detail || '未检测到版本'}
          {dependency.path ? ` · ${dependency.path}` : ''}
          {` · ${dependencyManagementLabel(dependency.management)}`}
        </small>
      </div>
      <div className="dependency-actions">
        {dependency.availableActions.map((action) => (
          <button
            key={action}
            className={
              action === 'install' ? 'primary-button' : 'secondary-button'
            }
            disabled={disabled}
            onClick={() => onAction(dependency, action)}
          >
            {busy ? (
              <LoaderCircle className="spin" size={14} />
            ) : action === 'open' ? (
              <Settings size={14} />
            ) : (
              <Download size={14} />
            )}
            {busy ? '处理中…' : dependencyActionLabel(action)}
          </button>
        ))}
        {!dependency.availableActions.length ? (
          <span className="dependency-no-action">
            {dependency.management === 'unity-hub'
              ? '由 Unity Hub 管理'
              : '仅检测'}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function dependencyIcon(id: DesktopDependencyId) {
  if (id === 'npx' || id === 'uvx') return SquareTerminal;
  if (id === 'blender') return Wrench;
  if (id === 'unity-hub' || id === 'unity-editor') return PackageOpen;
  return ServerCog;
}

function inheritedCredentialMessage(endpoint: ProviderSlot): string {
  if (endpoint === 'video') return '将安全复用图像模型的同一服务密钥';
  if (endpoint === 'reasoning') return '将安全复用主 Agent 的同一服务密钥';
  return '将安全复用已配置的同一服务密钥';
}

function dependencyStatusLabel(status: DesktopDependency['status']): string {
  if (status === 'installed') return '已安装';
  if (status === 'unsupported') return '当前系统不支持';
  return '未安装';
}

function dependencyManagementLabel(
  management: DesktopDependency['management'],
): string {
  if (management === 'homebrew') return 'Homebrew 白名单';
  if (management === 'winget') return 'WinGet 白名单';
  if (management === 'unity-hub') return 'Unity Hub 管理';
  return '仅检测';
}

function dependencyActionLabel(action: DependencyAction): string {
  if (action === 'install') return '安装';
  if (action === 'update') return '更新';
  return '打开 Unity Hub';
}

function providerDisplayName(provider: string): string {
  return (
    {
      'openai-compat': 'OpenAI Compatible',
      tongyi: '通义 / DashScope',
      doubao: '豆包 / ARK',
      elevenlabs: 'ElevenLabs',
      minimax: 'MiniMax',
      stability: 'Stability AI',
      'google-lyria': 'Google Lyria',
      mureka: 'Mureka',
    }[provider] ?? provider
  );
}

function workCallTypeLabel(type: AgentEvent['type']): string {
  return {
    user: 'PROMPT',
    assistant: 'RESPONSE',
    tool_call: 'FUNCTION',
    tool_result: 'RESULT',
    error: 'ERROR',
    complete: 'COMPLETE',
    lifecycle: 'STATE',
    thought: 'THOUGHT',
    text_delta: 'STREAM',
    stderr: 'LOG',
  }[type];
}

function providerSlotLabel(slot?: string): string {
  return PROVIDERS.find((provider) => provider.key === slot)?.label ?? 'API';
}

function projectStatusLabel(status: ProjectRecord['status']): string {
  return {
    draft: '待启动',
    running: '生成中',
    waiting: '待继续',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止',
  }[status];
}

function stageLabel(stage: ProjectRecord['stage']): string {
  return {
    brief: '需求拆解',
    classify: '类型识别',
    scaffold: '工程脚手架',
    gdd: '游戏设计',
    assets: '素材生成',
    tilemap: '地图生成',
    code: '代码实现',
    verify: '构建验证',
    complete: '完成',
  }[stage];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    notation: value >= 1_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatLatency(value: number): string {
  if (!value) return '—';
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)} s`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
