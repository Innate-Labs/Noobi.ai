import {
  Box,
  Cable,
  Check,
  ChevronRight,
  CircleAlert,
  FileCode2,
  Image,
  KeyRound,
  Music2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { toMessage } from '../ui';

export type MediaCapability = 'image' | 'audio' | 'model3d';
export type ConnectionStatus = 'unconfigured' | 'untested' | 'testing' | 'ready' | 'error';

export interface MediaProviderSetting {
  capability: MediaCapability;
  provider: string;
  model: string;
  endpoint: string;
  enabled: boolean;
  hasApiKey: boolean;
  keyHint: string | null;
  status: ConnectionStatus;
  statusMessage: string | null;
  lastTestedAt: string | null;
}

export interface SaveMediaProviderInput {
  capability: MediaCapability;
  provider: string;
  model: string;
  endpoint: string;
  enabled: boolean;
  /** Write-only. Omit to retain the persisted secret. */
  apiKey?: string;
}

export interface MediaProviderTestResult {
  capability: MediaCapability;
  ok: boolean;
  message: string;
  latencyMs?: number;
  testedAt: string;
}

export interface SkillSetting {
  id: string;
  name: string;
  description: string;
  source: 'built-in' | 'user' | 'plugin' | 'workspace';
  path: string | null;
  enabled: boolean;
}

export interface McpServerSetting {
  id: string;
  transport: 'stdio' | 'http';
  command: string | null;
  args: string[];
  url: string | null;
  enabled: boolean;
  bearerTokenEnvVar: string | null;
  status: 'connected' | 'starting' | 'stopped' | 'error';
  statusMessage: string | null;
}

export interface SaveMcpServerInput {
  id: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
  /** Name of a host-process environment variable. Never send its value through IPC. */
  bearerTokenEnvVar?: string;
}

export type PromptTemplateId = 'planner' | 'implementer' | 'reviewer' | 'repair';

export interface PromptTemplateSetting {
  id: PromptTemplateId;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  customized: boolean;
}

export interface ExtensionSettingsSnapshot {
  mediaProviders: MediaProviderSetting[];
  skills: SkillSetting[];
  mcpServers: McpServerSetting[];
  promptTemplates: PromptTemplateSetting[];
}

/** Proposed preload surface. All methods are optional until the host bridge is upgraded. */
export interface SettingsExtensionsApi {
  getExtensionSettings(): Promise<ExtensionSettingsSnapshot>;
  saveMediaProvider(input: SaveMediaProviderInput): Promise<MediaProviderSetting>;
  testMediaProvider(capability: MediaCapability): Promise<MediaProviderTestResult>;
  listSkills(): Promise<SkillSetting[]>;
  setSkillEnabled(input: { id: string; enabled: boolean }): Promise<SkillSetting>;
  listMcpServers(): Promise<McpServerSetting[]>;
  saveMcpServer(input: SaveMcpServerInput): Promise<McpServerSetting>;
  removeMcpServer(id: string): Promise<void>;
  listPromptTemplates(): Promise<PromptTemplateSetting[]>;
  savePromptTemplate(input: { id: PromptTemplateId; content: string; enabled: boolean }): Promise<PromptTemplateSetting>;
  resetPromptTemplate(id: PromptTemplateId): Promise<PromptTemplateSetting>;
}

type OptionalExtensionsApi = Partial<SettingsExtensionsApi>;

const CAPABILITIES: MediaCapability[] = ['image', 'audio', 'model3d'];

const EMPTY_MEDIA: MediaProviderSetting[] = CAPABILITIES.map((capability) => ({
  capability,
  provider: capability === 'image' ? 'openai-image' : capability === 'audio' ? 'openai-audio' : 'meshy-3d',
  model: capability === 'image' ? 'gpt-image-2' : capability === 'audio' ? 'gpt-4o-mini-tts' : 'meshy-6',
  endpoint: capability === 'image'
    ? 'https://api.openai.com/v1/images/generations'
    : capability === 'audio'
      ? 'https://api.openai.com/v1/audio/speech'
      : '',
  enabled: false,
  hasApiKey: false,
  keyHint: null,
  status: 'unconfigured',
  statusMessage: null,
  lastTestedAt: null,
}));

const EMPTY_SNAPSHOT: ExtensionSettingsSnapshot = {
  mediaProviders: EMPTY_MEDIA,
  skills: [],
  mcpServers: [],
  promptTemplates: [],
};

interface ProviderPreset {
  id: string;
  label: string;
  endpoint: string;
  models: Array<{ id: string; label: string }>;
}

const PROVIDERS: Record<MediaCapability, ProviderPreset[]> = {
  image: [
    {
      id: 'openai-image',
      label: 'OpenAI Images',
      endpoint: 'https://api.openai.com/v1/images/generations',
      models: [
        { id: 'gpt-image-2', label: 'GPT Image 2' },
        { id: 'gpt-image-1.5', label: 'GPT Image 1.5' },
        { id: 'gpt-image-1-mini', label: 'GPT Image 1 mini' },
      ],
    },
    {
      id: 'stability-image',
      label: 'Stability AI · 同步 REST 网关',
      endpoint: '',
      models: [
        { id: 'stable-image-ultra', label: 'Stable Image Ultra' },
        { id: 'stable-image-core', label: 'Stable Image Core' },
        { id: 'sd3.5-large', label: 'Stable Diffusion 3.5 Large' },
      ],
    },
    {
      id: 'google-imagen',
      label: 'Google Imagen · 同步 REST 网关',
      endpoint: '',
      models: [
        { id: 'imagen-4.0-generate-001', label: 'Imagen 4' },
        { id: 'imagen-4.0-fast-generate-001', label: 'Imagen 4 Fast' },
      ],
    },
    {
      id: 'fal-flux',
      label: 'FLUX / fal · 同步 REST 网关',
      endpoint: '',
      models: [
        { id: 'flux-1.1-pro', label: 'FLUX 1.1 Pro' },
        { id: 'flux-kontext-pro', label: 'FLUX Kontext Pro' },
        { id: 'flux-dev', label: 'FLUX Dev' },
      ],
    },
    { id: 'custom-image', label: 'Custom image REST', endpoint: '', models: [] },
  ],
  audio: [
    {
      id: 'openai-audio',
      label: 'OpenAI Speech',
      endpoint: 'https://api.openai.com/v1/audio/speech',
      models: [
        { id: 'gpt-4o-mini-tts', label: 'GPT-4o mini TTS' },
        { id: 'tts-1-hd', label: 'TTS-1 HD' },
        { id: 'tts-1', label: 'TTS-1' },
      ],
    },
    {
      id: 'elevenlabs-sound',
      label: 'ElevenLabs Sound Effects',
      endpoint: 'https://api.elevenlabs.io/v1/sound-generation',
      models: [
        { id: 'eleven_text_to_sound_v2', label: 'Sound Effects v2' },
      ],
    },
    {
      id: 'minimax-audio',
      label: 'MiniMax 国际站 · 音乐 / 人声音效 / 语音',
      endpoint: 'https://api.minimax.io',
      models: [
        { id: 'music-3.0', label: 'Music 3.0 · 音乐' },
        { id: 'speech-2.8-hd', label: 'Speech 2.8 HD · 高品质人声音效 / 语音' },
        { id: 'speech-2.8-turbo', label: 'Speech 2.8 Turbo · 低延迟人声音效 / 语音' },
      ],
    },
    {
      id: 'minimax-audio-cn',
      label: 'MiniMax 中国站 · 音乐 / 人声音效 / 语音',
      endpoint: 'https://api.minimaxi.com',
      models: [
        { id: 'music-3.0', label: 'Music 3.0 · 音乐' },
        { id: 'speech-2.8-hd', label: 'Speech 2.8 HD · 高品质人声音效 / 语音' },
        { id: 'speech-2.8-turbo', label: 'Speech 2.8 Turbo · 低延迟人声音效 / 语音' },
      ],
    },
    {
      id: 'stability-audio',
      label: 'Stability Audio · 同步 REST 网关',
      endpoint: '',
      models: [
        { id: 'stable-audio-2.5', label: 'Stable Audio 2.5' },
        { id: 'stable-audio-open', label: 'Stable Audio Open' },
      ],
    },
    { id: 'custom-audio', label: 'Custom audio REST', endpoint: '', models: [] },
  ],
  model3d: [
    {
      id: 'meshy-3d',
      label: 'Meshy · 同步 REST 网关',
      endpoint: '',
      models: [
        { id: 'meshy-6', label: 'Meshy 6' },
        { id: 'meshy-5', label: 'Meshy 5' },
      ],
    },
    {
      id: 'tripo-3d',
      label: 'Tripo · 同步 REST 网关',
      endpoint: '',
      models: [
        { id: 'tripo-v2.5', label: 'Tripo v2.5' },
        { id: 'tripo-v2.0', label: 'Tripo v2.0' },
      ],
    },
    {
      id: 'rodin-3d',
      label: 'Hyper3D Rodin · 同步 REST 网关',
      endpoint: '',
      models: [
        { id: 'rodin-gen-2', label: 'Rodin Gen-2' },
        { id: 'rodin', label: 'Rodin' },
      ],
    },
    { id: 'custom-model3d', label: 'Custom 3D REST', endpoint: '', models: [] },
  ],
};

export function useExtensionSettings(onMessage: (message: string) => void) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const api = window.noobi as typeof window.noobi & OptionalExtensionsApi;
  const supported = typeof api.getExtensionSettings === 'function';

  useEffect(() => {
    let cancelled = false;
    if (!api.getExtensionSettings) {
      setLoading(false);
      return;
    }
    api.getExtensionSettings()
      .then((result) => {
        if (!cancelled) setSnapshot(normalizeSnapshot(result));
      })
      .catch((error) => {
        if (!cancelled) onMessage(toMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function saveMedia(input: SaveMediaProviderInput) {
    if (!api.saveMediaProvider) return unsupported(onMessage);
    try {
      const saved = await api.saveMediaProvider(input);
      setSnapshot((current) => ({
        ...current,
        mediaProviders: upsert(current.mediaProviders, saved, (item) => item.capability),
      }));
      onMessage('媒体服务配置已保存；API Key 由系统 Keychain 加密保管。');
    } catch (error) {
      onMessage(toMessage(error));
      throw error;
    }
  }

  async function testMedia(capability: MediaCapability) {
    if (!api.testMediaProvider) return unsupported(onMessage);
    setSnapshot((current) => ({
      ...current,
      mediaProviders: current.mediaProviders.map((item) => item.capability === capability
        ? { ...item, status: 'testing' }
        : item),
    }));
    try {
      const result = await api.testMediaProvider(capability);
      setSnapshot((current) => ({
        ...current,
        mediaProviders: current.mediaProviders.map((item) => item.capability === capability
          ? {
            ...item,
            status: result.ok ? 'ready' : 'error',
            statusMessage: result.message,
            lastTestedAt: result.testedAt,
          }
          : item),
      }));
      onMessage(result.latencyMs ? `${result.message} · ${result.latencyMs}ms` : result.message);
    } catch (error) {
      onMessage(toMessage(error));
      setSnapshot((current) => ({
        ...current,
        mediaProviders: current.mediaProviders.map((item) => item.capability === capability
          ? { ...item, status: 'error', statusMessage: toMessage(error) }
          : item),
      }));
    }
  }

  async function toggleSkill(id: string, enabled: boolean) {
    if (!api.setSkillEnabled) return unsupported(onMessage);
    try {
      const saved = await api.setSkillEnabled({ id, enabled });
      setSnapshot((current) => ({
        ...current,
        skills: upsert(current.skills, saved, (item) => item.id),
      }));
      onMessage(`${saved.name} 已${saved.enabled ? '启用' : '停用'}。`);
    } catch (error) {
      onMessage(toMessage(error));
    }
  }

  async function saveMcp(input: SaveMcpServerInput) {
    if (!api.saveMcpServer) return unsupported(onMessage);
    try {
      const saved = await api.saveMcpServer(input);
      setSnapshot((current) => ({
        ...current,
        mcpServers: upsert(current.mcpServers, saved, (item) => item.id),
      }));
      onMessage(`${saved.id} 已保存。`);
    } catch (error) {
      onMessage(toMessage(error));
      throw error;
    }
  }

  async function removeMcp(id: string) {
    if (!api.removeMcpServer) return unsupported(onMessage);
    try {
      await api.removeMcpServer(id);
      setSnapshot((current) => ({
        ...current,
        mcpServers: current.mcpServers.filter((item) => item.id !== id),
      }));
      onMessage('MCP Server 已移除。');
    } catch (error) {
      onMessage(toMessage(error));
    }
  }

  async function savePrompt(input: { id: PromptTemplateId; content: string; enabled: boolean }) {
    if (!api.savePromptTemplate) return unsupported(onMessage);
    try {
      const saved = await api.savePromptTemplate(input);
      setSnapshot((current) => ({
        ...current,
        promptTemplates: upsert(current.promptTemplates, saved, (item) => item.id),
      }));
      onMessage(`${saved.name} 已保存。`);
    } catch (error) {
      onMessage(toMessage(error));
    }
  }

  async function resetPrompt(id: PromptTemplateId) {
    if (!api.resetPromptTemplate) return unsupported(onMessage);
    try {
      const saved = await api.resetPromptTemplate(id);
      setSnapshot((current) => ({
        ...current,
        promptTemplates: upsert(current.promptTemplates, saved, (item) => item.id),
      }));
      onMessage(`${saved.name} 已恢复产品默认补充词。`);
      return saved;
    } catch (error) {
      onMessage(toMessage(error));
      return undefined;
    }
  }

  return {
    snapshot,
    loading,
    supported,
    saveMedia,
    testMedia,
    toggleSkill,
    saveMcp,
    removeMcp,
    savePrompt,
    resetPrompt,
  };
}

export type ExtensionSettingsController = ReturnType<typeof useExtensionSettings>;

export function MediaApiSettings({ controller }: { controller: ExtensionSettingsController }) {
  return (
    <section>
      <SettingsPanelHeading
        eyebrow="GENERATION ROUTER"
        title="媒体生成 API"
        description="为图像、音频与 3D 选择首选服务。新密钥仅在提交时经隔离 IPC 交给 Main，并由系统 Keychain 加密后落盘；保存后 Renderer 只得到已配置状态，不会回传或回显明文，游戏 Agent 永远拿不到密钥。"
      />
      {!controller.supported ? <BridgeNotice /> : null}
      <div className="provider-rack">
        {CAPABILITIES.map((capability, index) => (
          <ProviderModule
            key={capability}
            index={index + 1}
            value={controller.snapshot.mediaProviders.find((item) => item.capability === capability) ?? EMPTY_MEDIA[index]!}
            disabled={!controller.supported}
            onSave={controller.saveMedia}
            onTest={controller.testMedia}
          />
        ))}
      </div>
      <div className="routing-rule" role="note">
        <Sparkles size={16} />
        <div>
          <strong>媒体路由与连接检查</strong>
          <span>已启用且包含必要密钥的图像 API 优先，失败时由可用的 Codex ImageGen 接管。MiniMax 仅负责音乐、语音和人声音效；枪声、爆炸等通用 SFX 使用程序化回退。MiniMax 音频检查会发起一次极短 Speech 鉴权探测，但 Music 3.0 账户资格仍在首次实际音乐生成时确认。其他服务的实际模型可用性也在生成时确认。</span>
        </div>
      </div>
    </section>
  );
}

function ProviderModule({
  index,
  value,
  disabled,
  onSave,
  onTest,
}: {
  index: number;
  value: MediaProviderSetting;
  disabled: boolean;
  onSave: (input: SaveMediaProviderInput) => Promise<void>;
  onTest: (capability: MediaCapability) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  useEffect(() => setDraft(value), [value]);

  const definition = capabilityDefinition(value.capability);
  const presets = PROVIDERS[value.capability];
  const provider = presets.find((item) => item.id === draft.provider) ?? presets.at(-1)!;
  const isMiniMax = provider.id === 'minimax-audio' || provider.id === 'minimax-audio-cn';
  const models = provider.models;
  const modelKnown = models.some((item) => item.id === draft.model);
  const hasSavedKeyForDraft = draft.provider === value.provider && value.hasApiKey;
  const dirty = draft.provider !== value.provider
    || draft.model.trim() !== value.model.trim()
    || draft.endpoint.trim() !== value.endpoint.trim()
    || draft.enabled !== value.enabled
    || apiKey.trim().length > 0;
  const apiKeyError = isMiniMax && apiKey.trim().length > 0 && !/^[A-Za-z0-9._~+\/-]+=*$/u.test(apiKey.trim())
    ? 'MiniMax API Key 只能包含原始 Bearer Token 字符；请移除说明文字、空格和 Markdown 反斜杠。'
    : null;
  const Icon = definition.icon;

  function chooseProvider(providerId: string) {
    const next = presets.find((item) => item.id === providerId)!;
    setDraft((current) => ({
      ...current,
      provider: providerId,
      endpoint: next.endpoint,
      model: next.models[0]?.id ?? '',
      status: 'untested',
    }));
    setApiKey('');
  }

  async function save() {
    setBusy('save');
    try {
      await onSave({
        capability: draft.capability,
        provider: draft.provider,
        model: draft.model.trim(),
        endpoint: draft.endpoint.trim(),
        enabled: draft.enabled,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      setApiKey('');
    } catch {
      // The controller has already surfaced the host error; retain the key draft for retry.
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test');
    try {
      await onTest(draft.capability);
    } finally {
      setBusy(null);
    }
  }

  async function clearSavedKey() {
    if (!hasSavedKeyForDraft || dirty) return;
    if (!window.confirm('清除这个媒体服务已保存的 API Key？清除后服务会停用，直到重新保存密钥。')) return;
    setBusy('save');
    try {
      await onSave({
        capability: draft.capability,
        provider: draft.provider,
        model: draft.model.trim(),
        endpoint: draft.endpoint.trim(),
        enabled: false,
        apiKey: '',
      });
      setApiKey('');
    } catch {
      // The controller has already surfaced the host error.
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className={`provider-module status-${dirty ? 'untested' : value.status}`}>
      <header>
        <span className="module-index">0{index}</span>
        <span className="module-icon"><Icon size={17} /></span>
        <div>
          <span>{definition.kicker}</span>
          <strong>{definition.title}</strong>
        </div>
        <StatusBadge status={dirty ? 'untested' : value.status} label={dirty ? '未保存更改' : undefined} />
      </header>
      <div className="provider-form-grid">
        <label>
          <span>服务提供商</span>
          <select disabled={disabled || busy !== null} value={draft.provider} onChange={(event) => chooseProvider(event.target.value)}>
            {presets.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span>模型</span>
          {models.length ? (
            <select
              disabled={disabled || busy !== null}
              value={modelKnown ? draft.model : '__custom'}
              onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value === '__custom' ? '' : event.target.value, status: 'untested' }))}
            >
              {models.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
              <option value="__custom">自定义模型 ID…</option>
            </select>
          ) : (
            <input disabled={disabled || busy !== null} value={draft.model} placeholder="provider/model-id" onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value, status: 'untested' }))} />
          )}
        </label>
        {models.length && !modelKnown ? (
          <label className="provider-custom-model">
            <span>自定义模型 ID</span>
            <input disabled={disabled || busy !== null} value={draft.model} placeholder="provider/model-id" onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value, status: 'untested' }))} />
          </label>
        ) : null}
        <label className="provider-endpoint">
          <span>API Endpoint</span>
          <input
            disabled={disabled || busy !== null}
            readOnly={isMiniMax}
            inputMode="url"
            value={draft.endpoint}
            placeholder="https://api.example.com/v1"
            title={isMiniMax ? `MiniMax 凭据仅发送到官方 ${new URL(provider.endpoint).host}` : undefined}
            onChange={(event) => setDraft((current) => ({ ...current, endpoint: event.target.value, status: 'untested' }))}
          />
        </label>
        <label className="provider-key">
          <span>API Key · Keychain 加密</span>
          <div className="secret-input">
            <KeyRound size={14} aria-hidden="true" />
            <input
              disabled={disabled || busy !== null}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={apiKey}
              placeholder={hasSavedKeyForDraft ? `已由 Keychain 加密${value.keyHint ? ` · ••••${value.keyHint}` : ''}` : '粘贴新密钥'}
              aria-describedby={`${value.capability}-secret-help`}
              aria-invalid={apiKeyError ? true : undefined}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
          <small id={`${value.capability}-secret-help`}>{apiKeyError ?? (hasSavedKeyForDraft ? '留空将保留当前密钥；密钥不会回显。' : '仅发往主进程，经系统 Keychain 加密后落盘。')}</small>
        </label>
      </div>
      <footer>
        <label className="switch-control">
          <input type="checkbox" checked={draft.enabled} disabled={disabled || busy !== null} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked, status: 'untested' }))} />
          <span aria-hidden="true" />
          <strong>启用首选服务</strong>
        </label>
        <div className="provider-actions">
          {hasSavedKeyForDraft ? (
            <button
              className="danger-button compact"
              type="button"
              disabled={disabled || busy !== null || dirty}
              onClick={() => void clearSavedKey()}
            >
              清除密钥
            </button>
          ) : null}
          <button
            className="secondary-button compact"
            type="button"
            disabled={disabled || busy !== null || dirty || !hasSavedKeyForDraft}
            title={dirty
              ? '请先保存更改，再检查服务'
              : isMiniMax
                ? '使用已保存的加密凭据调用一次极短 MiniMax Speech Turbo 鉴权探测；不会生成音乐素材'
                : '检查已保存的服务配置；实际模型可用性将在生成时确认'}
            onClick={() => void test()}
          >
            <RefreshCw size={13} className={busy === 'test' ? 'spin' : ''} /> {busy === 'test' ? '检查中' : '检查服务'}
          </button>
          <button className="primary-button compact" type="button" disabled={disabled || busy !== null || Boolean(apiKeyError) || !draft.endpoint.trim() || !draft.model.trim()} onClick={() => void save()}>
            <Save size={13} /> {busy === 'save' ? '保存中' : '保存'}
          </button>
        </div>
      </footer>
      {value.statusMessage ? <p className="module-message">{value.statusMessage}</p> : null}
      {dirty ? <p className="module-message is-dirty">当前更改尚未保存；保存后才能检查服务。</p> : null}
    </article>
  );
}

export function SkillsSettings({ controller }: { controller: ExtensionSettingsController }) {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const skills = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return controller.snapshot.skills;
    return controller.snapshot.skills.filter((item) => `${item.name} ${item.description} ${item.source}`.toLowerCase().includes(term));
  }, [controller.snapshot.skills, query]);

  async function toggle(item: SkillSetting) {
    setPending(item.id);
    try {
      await controller.toggleSkill(item.id, !item.enabled);
    } finally {
      setPending(null);
    }
  }

  return (
    <section>
      <SettingsPanelHeading
        eyebrow="AGENT CAPABILITY RACK"
        title="Skills"
        description="决定游戏 Agent 可以主动调用的专业工作流。关闭 Skill 不会删除本地文件。"
      />
      {!controller.supported ? <BridgeNotice /> : null}
      <div className="settings-toolbar">
        <label className="settings-search">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">搜索 Skills</span>
          <input value={query} placeholder="搜索名称、能力或来源…" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <span className="settings-count">{skills.length.toString().padStart(2, '0')} / {controller.snapshot.skills.length.toString().padStart(2, '0')}</span>
      </div>
      <div className="extension-list" aria-live="polite">
        {skills.map((item) => {
          const requiredByNoobi = item.name.trim().toLowerCase() === 'imagegen';
          return (
            <article className={`extension-row${requiredByNoobi ? ' is-required' : ''}`} key={item.id}>
              <span className="extension-glyph"><FileCode2 size={16} /></span>
              <div className="extension-copy">
                <div>
                  <strong>{item.name}</strong>
                  <span className={`source-badge source-${item.source}`}>{sourceLabel(item.source)}</span>
                  {requiredByNoobi ? <span className="source-badge noobi-required-badge">NOOBI REQUIRED</span> : null}
                </div>
                <p>{requiredByNoobi ? 'Noobi 的默认图片生成与 API 失败回退依赖此 Skill；游戏制作流程中始终保持启用。' : item.description || '此 Skill 未提供说明。'}</p>
                {item.path ? <code title={item.path}>{item.path}</code> : null}
              </div>
              <label className="switch-control compact-switch" title={requiredByNoobi ? 'Noobi 游戏制作必需，无法在这里停用' : undefined}>
                <span className="sr-only">{requiredByNoobi ? `${item.name} 是 Noobi 必需 Skill，始终启用` : `${item.enabled ? '停用' : '启用'} ${item.name}`}</span>
                <input
                  type="checkbox"
                  checked={requiredByNoobi || item.enabled}
                  disabled={requiredByNoobi || !controller.supported || pending === item.id}
                  onChange={() => void toggle(item)}
                />
                <span aria-hidden="true" />
              </label>
            </article>
          );
        })}
        {!skills.length ? <EmptyExtensionState icon={FileCode2} title={query ? '没有匹配的 Skill' : '尚未发现 Skills'} description={query ? '换一个名称或来源关键词。' : 'Host Bridge 接通后会列出 Codex、本地与插件 Skills。'} /> : null}
      </div>
    </section>
  );
}

export function McpSettings({ controller }: { controller: ExtensionSettingsController }) {
  const [editor, setEditor] = useState<McpDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  async function save() {
    if (!editor) return;
    setBusy(true);
    try {
      await controller.saveMcp({
        id: editor.name.trim(),
        transport: editor.transport,
        enabled: editor.enabled,
        ...(editor.transport === 'stdio'
          ? { command: editor.target.trim(), args: splitArgs(editor.args) }
          : { url: editor.target.trim() }),
        ...(editor.transport === 'http' && editor.bearerTokenEnvVar.trim()
          ? { bearerTokenEnvVar: editor.bearerTokenEnvVar.trim() }
          : {}),
      });
      setEditor(null);
    } catch {
      // Preserve the draft so the user can correct the rejected configuration.
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SettingsPanelHeading
        eyebrow="MODEL CONTEXT PROTOCOL"
        title="MCP Servers"
        description="连接本地进程或远程服务，为 Agent 增加工具与数据源。修改会在下一次 Agent 回合生效。"
        action={
          <button className="primary-button compact" type="button" disabled={!controller.supported || Boolean(editor)} onClick={() => setEditor(emptyMcpDraft())}>
            <Plus size={13} /> 添加 Server
          </button>
        }
      />
      {!controller.supported ? <BridgeNotice /> : null}
      {editor ? (
        <McpEditor value={editor} busy={busy} onChange={setEditor} onCancel={() => setEditor(null)} onSave={() => void save()} />
      ) : null}
      <div className="mcp-list">
        {controller.snapshot.mcpServers.map((item) => (
          <article className="mcp-row" key={item.id}>
            <span className={`mcp-status status-${item.status}`} title={item.statusMessage ?? item.status} />
            <div>
              <span>{item.transport.toUpperCase()}</span>
              <strong>{item.id}</strong>
              <code>{item.transport === 'stdio' ? [item.command, ...item.args].filter(Boolean).join(' ') : item.url}</code>
            </div>
            <span className="mcp-state-label">{mcpStatusLabel(item.status)}</span>
            <div className="row-actions">
              <button className="icon-button compact" type="button" aria-label={`编辑 ${item.id}`} title="编辑" disabled={Boolean(editor)} onClick={() => setEditor(toMcpDraft(item))}><Pencil size={14} /></button>
              <button
                className={`icon-button compact ${confirmRemove === item.id ? 'confirm-remove' : ''}`}
                type="button"
                aria-label={confirmRemove === item.id ? `确认移除 ${item.id}` : `移除 ${item.id}`}
                title={confirmRemove === item.id ? '再次点击确认移除' : '移除'}
                disabled={Boolean(editor)}
                onBlur={() => setConfirmRemove(null)}
                onClick={() => {
                  if (confirmRemove === item.id) {
                    setConfirmRemove(null);
                    void controller.removeMcp(item.id);
                  } else {
                    setConfirmRemove(item.id);
                  }
                }}
              >
                {confirmRemove === item.id ? <Check size={14} /> : <Trash2 size={14} />}
              </button>
            </div>
          </article>
        ))}
        {!controller.snapshot.mcpServers.length ? <EmptyExtensionState icon={Cable} title="尚未添加 MCP Server" description="添加 stdio 命令或 HTTP Endpoint，接入游戏资产、知识库和制作工具。" /> : null}
      </div>
    </section>
  );
}

interface McpDraft {
  originalId?: string;
  name: string;
  transport: 'stdio' | 'http';
  target: string;
  args: string;
  enabled: boolean;
  bearerTokenEnvVar: string;
}

function McpEditor({ value, busy, onChange, onCancel, onSave }: {
  value: McpDraft;
  busy: boolean;
  onChange: (value: McpDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mcp-editor">
      <header><div><span>SERVER CONFIG</span><strong>{value.originalId ? '编辑 MCP Server' : '添加 MCP Server'}</strong></div><span className="draft-badge">DRAFT</span></header>
      <div className="mcp-editor-grid">
        <label><span>名称</span><input autoFocus disabled={Boolean(value.originalId)} value={value.name} placeholder="例如：blender" onChange={(event) => onChange({ ...value, name: event.target.value })} /></label>
        <label><span>Transport</span><select value={value.transport} onChange={(event) => onChange({ ...value, transport: event.target.value as McpDraft['transport'], target: '', args: '' })}><option value="stdio">STDIO</option><option value="http">HTTP</option></select></label>
        <label className="mcp-target"><span>{value.transport === 'stdio' ? 'Command' : 'URL'}</span><input value={value.target} placeholder={value.transport === 'stdio' ? 'npx' : 'https://mcp.example.com'} onChange={(event) => onChange({ ...value, target: event.target.value })} /></label>
        {value.transport === 'stdio' ? <label className="mcp-target"><span>Arguments · 每行一个</span><textarea rows={3} value={value.args} placeholder={'--workspace\n/path/to/project'} onChange={(event) => onChange({ ...value, args: event.target.value })} /></label> : null}
        {value.transport === 'http' ? <label className="mcp-target"><span>Bearer Token 环境变量名</span><input spellCheck={false} value={value.bearerTokenEnvVar} placeholder="例如：MY_MCP_BEARER_TOKEN" onChange={(event) => onChange({ ...value, bearerTokenEnvVar: event.target.value })} /><small>这里只保存变量名；Token 明文不会进入 Renderer 或 IPC。</small></label> : null}
      </div>
      <footer>
        <label className="switch-control"><input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} /><span aria-hidden="true" /><strong>启用 Server</strong></label>
        <div><button className="secondary-button compact" type="button" disabled={busy} onClick={onCancel}>取消</button><button className="primary-button compact" type="button" disabled={busy || !value.name.trim() || !value.target.trim()} onClick={onSave}><Save size={13} /> {busy ? '保存中' : '保存 Server'}</button></div>
      </footer>
    </div>
  );
}

export function PromptSettings({
  controller,
  onDirtyChange,
  onBusyChange,
}: {
  controller: ExtensionSettingsController;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const templates = controller.snapshot.promptTemplates;
  const [selectedId, setSelectedId] = useState<PromptTemplateId | null>(null);
  const selected = templates.find((item) => item.id === selectedId) ?? templates[0] ?? null;
  const [draft, setDraft] = useState({ content: '', enabled: true });
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null);

  useEffect(() => {
    if (!selectedId && templates[0]) setSelectedId(templates[0].id);
  }, [templates, selectedId]);
  useEffect(() => {
    if (selected) setDraft({ content: selected.content, enabled: selected.enabled });
  }, [selected?.id, selected?.content, selected?.enabled]);

  const dirty = Boolean(selected && (selected.content !== draft.content || selected.enabled !== draft.enabled));

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    onBusyChange?.(busy !== null);
  }, [busy, onBusyChange]);
  useEffect(() => () => {
    onDirtyChange?.(false);
    onBusyChange?.(false);
  }, [onBusyChange, onDirtyChange]);

  function selectTemplate(id: PromptTemplateId) {
    if (id === selected?.id || busy !== null) return;
    if (dirty && !window.confirm('当前提示词有未保存更改。切换角色会放弃这些更改，是否继续？')) return;
    setSelectedId(id);
  }

  async function save() {
    if (!selected) return;
    setBusy('save');
    try {
      await controller.savePrompt({ id: selected.id, content: draft.content, enabled: draft.enabled });
    } catch {
      // Keep the edited prompt in place; the controller reports the failure.
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!selected) return;
    if (!window.confirm(`将“${selected.name}”恢复为产品默认补充词？当前自定义内容将被覆盖。`)) return;
    setBusy('reset');
    try {
      const restored = await controller.resetPrompt(selected.id);
      if (restored) setDraft({ content: restored.content, enabled: restored.enabled });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <SettingsPanelHeading
        eyebrow="AGENT INSTRUCTION LAYERS"
        title="提示词管理"
        description="按制作阶段管理 Host 注入的补充提示词。用户请求高于自定义补充词；System 安全规则与宿主生产门禁不可覆盖。"
      />
      {!controller.supported ? <BridgeNotice /> : null}
      {selected ? (
        <div className="prompt-workspace">
          <nav aria-label="提示词模板">
            {templates.map((item, index) => (
              <button
                type="button"
                className={item.id === selected.id ? 'is-active' : ''}
                key={item.id}
                disabled={busy !== null}
                aria-current={item.id === selected.id ? 'page' : undefined}
                onClick={() => selectTemplate(item.id)}
              >
                <span>{(index + 1).toString().padStart(2, '0')}</span>
                <div><strong>{item.name}</strong><small>{promptRoleLabel(item.id)} · {item.enabled ? 'ON' : 'OFF'}</small></div>
                <ChevronRight size={14} />
              </button>
            ))}
          </nav>
          <div className="prompt-editor">
            <header><div><span>{promptRoleLabel(selected.id)} LAYER</span><strong>{selected.name}</strong><small>{selected.description}</small></div><label className="switch-control compact-switch"><span className="sr-only">启用 {selected.name}</span><input type="checkbox" checked={draft.enabled} disabled={busy !== null} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /><span aria-hidden="true" /></label></header>
            <label className="prompt-content"><span>补充提示词内容 · 最多 20,000 字符</span><textarea maxLength={20_000} spellCheck={false} value={draft.content} disabled={busy !== null} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} /></label>
            <footer>
              <span>{draft.content.length.toLocaleString()} / 20,000 {dirty ? '· 未保存' : selected.customized ? '· 已自定义' : '· 产品默认'}</span>
              <div><button className="secondary-button compact" type="button" disabled={busy !== null || (!dirty && !selected.customized)} onClick={() => void reset()}><RotateCcw size={13} /> {busy === 'reset' ? '恢复中' : '恢复默认'}</button><button className="primary-button compact" type="button" disabled={busy !== null || !dirty} onClick={() => void save()}><Save size={13} /> {busy === 'save' ? '保存中' : '保存模板'}</button></div>
            </footer>
          </div>
        </div>
      ) : <EmptyExtensionState icon={FileCode2} title="尚无提示词模板" description="Host Bridge 接通后会提供 System、Planner、Implementer 与 Reviewer 默认模板。" />}
    </section>
  );
}

function SettingsPanelHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="settings-page-heading"><div><span>{eyebrow}</span><h3>{title}</h3><p>{description}</p></div>{action}</header>;
}

function StatusBadge({ status, label }: { status: ConnectionStatus; label?: string }) {
  const labels: Record<ConnectionStatus, string> = { unconfigured: '未配置', untested: '待检查', testing: '检查中', ready: '检查通过', error: '异常' };
  return <span className={`connection-badge status-${status}`}>{status === 'ready' ? <ShieldCheck size={12} /> : status === 'error' ? <CircleAlert size={12} /> : null}{label ?? labels[status]}</span>;
}

function BridgeNotice() {
  return <div className="bridge-notice" role="status"><Cable size={15} /><div><strong>等待 Host Bridge</strong><span>界面已就绪；升级主进程后即可读取和持久化这些设置。</span></div></div>;
}

function EmptyExtensionState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="empty-extension-state"><Icon size={20} /><strong>{title}</strong><span>{description}</span></div>;
}

function capabilityDefinition(capability: MediaCapability): { kicker: string; title: string; icon: LucideIcon } {
  if (capability === 'image') return { kicker: 'VISUAL ASSET SERVICE', title: '图像生成', icon: Image };
  if (capability === 'audio') return { kicker: 'VOICE · SFX · MUSIC', title: '音频与音效', icon: Music2 };
  return { kicker: 'MESH · TEXTURE · GLB', title: '3D 模型', icon: Box };
}

function normalizeSnapshot(value: ExtensionSettingsSnapshot): ExtensionSettingsSnapshot {
  const mediaProviders = value.mediaProviders ?? [];
  return {
    mediaProviders: CAPABILITIES.map((capability, index) => mediaProviders.find((item) => item.capability === capability) ?? EMPTY_MEDIA[index]!),
    skills: value.skills ?? [],
    mcpServers: (value.mcpServers ?? []).map((item) => ({
      ...item,
      status: item.status ?? 'stopped',
      statusMessage: item.statusMessage ?? null,
      bearerTokenEnvVar: item.bearerTokenEnvVar ?? null,
    })),
    promptTemplates: value.promptTemplates ?? [],
  };
}

function upsert<T>(items: T[], value: T, key: (item: T) => string): T[] {
  return items.some((item) => key(item) === key(value))
    ? items.map((item) => key(item) === key(value) ? value : item)
    : [...items, value];
}

function unsupported(onMessage: (message: string) => void): Promise<void> {
  onMessage('当前应用版本尚未接通 Settings Host Bridge。');
  return Promise.resolve();
}

function sourceLabel(source: SkillSetting['source']): string {
  return { 'built-in': 'BUILT-IN', user: 'USER', plugin: 'PLUGIN', workspace: 'WORKSPACE' }[source];
}

function mcpStatusLabel(status: McpServerSetting['status']): string {
  return { connected: '已连接', starting: '启动中', stopped: '已停止', error: '异常' }[status];
}

function promptRoleLabel(role: PromptTemplateId): string {
  return { planner: 'Planner', implementer: 'Implementer', reviewer: 'Reviewer', repair: 'Repair' }[role];
}

function emptyMcpDraft(): McpDraft {
  return { name: '', transport: 'stdio', target: '', args: '', enabled: true, bearerTokenEnvVar: '' };
}

function toMcpDraft(value: McpServerSetting): McpDraft {
  return {
    originalId: value.id,
    name: value.id,
    transport: value.transport,
    target: value.transport === 'stdio' ? value.command ?? '' : value.url ?? '',
    args: value.args.join('\n'),
    enabled: value.enabled,
    bearerTokenEnvVar: value.bearerTokenEnvVar ?? '',
  };
}

function splitArgs(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}
