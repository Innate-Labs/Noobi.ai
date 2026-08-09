import { app, safeStorage } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  AppSettings,
  McpServerDefinition,
  ProjectRecord,
  ProviderEndpoint,
  SecretField,
} from '../shared/types.js';

type ProviderSecretKey = 'main' | 'reasoning' | 'image' | 'video' | 'audio';
type SecretKey = ProviderSecretKey | 'mcpServers';

interface PersistedSettings {
  main: Omit<
    ProviderEndpoint,
    'apiKey' | 'apiKeyConfigured' | 'apiKeyInherited'
  >;
  reasoning: Omit<
    ProviderEndpoint,
    'apiKey' | 'apiKeyConfigured' | 'apiKeyInherited'
  >;
  image: Omit<
    ProviderEndpoint,
    'apiKey' | 'apiKeyConfigured' | 'apiKeyInherited'
  >;
  video: Omit<
    ProviderEndpoint,
    'apiKey' | 'apiKeyConfigured' | 'apiKeyInherited'
  >;
  audio: Omit<
    ProviderEndpoint,
    'apiKey' | 'apiKeyConfigured' | 'apiKeyInherited'
  >;
  defaultWorkspace: string;
  permissionMode: 'auto-edit' | 'yolo';
  developerMode: boolean;
}

interface PersistedState {
  projects: ProjectRecord[];
  settings: PersistedSettings;
  secrets: Partial<Record<SecretKey, string>>;
}

const endpoint = (
  provider: ProviderEndpoint['provider'],
  baseUrl: string,
  model: string,
): ProviderEndpoint => ({ provider, baseUrl, model, apiKey: '' });

export function defaultSettings(): AppSettings {
  return {
    main: endpoint(
      'openai-compat',
      'https://api.deepseek.com',
      'deepseek-v4-flash',
    ),
    reasoning: endpoint(
      'openai-compat',
      'https://api.deepseek.com',
      'deepseek-v4-pro',
    ),
    image: endpoint(
      'tongyi',
      'https://dashscope.aliyuncs.com',
      'wan2.5-t2i-preview',
    ),
    video: endpoint(
      'tongyi',
      'https://dashscope.aliyuncs.com',
      'wan2.5-i2v-preview',
    ),
    audio: endpoint(
      'openai-compat',
      'https://api.deepseek.com',
      'deepseek-v4-flash',
    ),
    defaultWorkspace: path.join(app.getPath('documents'), 'Noobi.ai Games'),
    permissionMode: 'yolo',
    developerMode: false,
  };
}

export class StateStore {
  private statePath = path.join(app.getPath('userData'), 'state.json');
  private state: PersistedState | null = null;
  private flushChain: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    await mkdir(path.dirname(this.statePath), { recursive: true });
    try {
      const parsed = JSON.parse(
        await readFile(this.statePath, 'utf8'),
      ) as PersistedState;
      const defaults = this.toPersistedSettings(defaultSettings());
      const parsedSettings = parsed.settings ?? defaults;
      const parsedSecrets = parsed.secrets ?? {};
      const mergeEndpoint = (key: ProviderSecretKey) => {
        const merged = {
          ...defaults[key],
          ...(parsedSettings[key] ?? {}),
        };

        if (
          merged.provider === 'openai-compat' &&
          merged.baseUrl.includes('api.deepseek.com')
        ) {
          merged.baseUrl = 'https://api.deepseek.com';
          if (merged.model === 'deepseek-chat') {
            merged.model = 'deepseek-v4-flash';
          } else if (merged.model === 'deepseek-reasoner') {
            merged.model = 'deepseek-v4-pro';
          }
        }

        if (
          (key === 'image' || key === 'video') &&
          !parsedSecrets[key] &&
          (!merged.baseUrl || !merged.model)
        ) {
          return { ...defaults[key] };
        }

        return merged;
      };
      const now = new Date().toISOString();
      this.state = {
        projects: Array.isArray(parsed.projects)
          ? parsed.projects.map((project) =>
              project.status === 'running' || project.status === 'waiting'
                ? {
                    ...project,
                    status: 'stopped' as const,
                    updatedAt: now,
                  }
                : project,
            )
          : [],
        settings: {
          main: mergeEndpoint('main'),
          reasoning: mergeEndpoint('reasoning'),
          image: mergeEndpoint('image'),
          video: mergeEndpoint('video'),
          audio: mergeEndpoint('audio'),
          defaultWorkspace:
            parsedSettings.defaultWorkspace || defaults.defaultWorkspace,
          // A headless one-shot runtime has no interactive approval channel;
          // the complete game pipeline therefore runs only in autonomous mode.
          permissionMode: 'yolo',
          developerMode: parsedSettings.developerMode === true,
        },
        secrets: parsedSecrets,
      };
      await this.flush();
    } catch {
      this.state = {
        projects: [],
        settings: this.toPersistedSettings(defaultSettings()),
        secrets: {},
      };
      await this.flush();
    }
  }

  getProjects(): ProjectRecord[] {
    return [...this.requireState().projects].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  getProject(id: string): ProjectRecord | undefined {
    return this.requireState().projects.find((project) => project.id === id);
  }

  async upsertProject(project: ProjectRecord): Promise<void> {
    const state = this.requireState();
    const index = state.projects.findIndex((item) => item.id === project.id);
    if (index >= 0) state.projects[index] = project;
    else state.projects.push(project);
    await this.flush();
  }

  getPublicSettings(): AppSettings {
    const state = this.requireState();
    const hydrate = (key: ProviderSecretKey): ProviderEndpoint => ({
      ...state.settings[key],
      apiKey: '',
      apiKeyConfigured: Boolean(this.decrypt(state.secrets[key])),
    });

    const main = hydrate('main');
    const reasoning = inheritCredential(hydrate('reasoning'), main);
    const image = hydrate('image');
    const video = inheritCredential(hydrate('video'), image);
    const audio = inheritCredential(hydrate('audio'), reasoning);

    return {
      main,
      reasoning,
      image,
      video,
      audio,
      defaultWorkspace: state.settings.defaultWorkspace,
      permissionMode: state.settings.permissionMode,
      developerMode: state.settings.developerMode,
    };
  }

  getRuntimeSettings(): AppSettings {
    const publicSettings = this.getPublicSettings();
    for (const key of [
      'main',
      'reasoning',
      'image',
      'video',
      'audio',
    ] as ProviderSecretKey[]) {
      publicSettings[key].apiKey = this.decrypt(
        this.requireState().secrets[key],
      );
    }
    return publicSettings;
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const state = this.requireState();
    const previousProviders = Object.fromEntries(
      (
        ['main', 'reasoning', 'image', 'video', 'audio'] as ProviderSecretKey[]
      ).map((key) => [key, state.settings[key].provider]),
    ) as Record<SecretKey, ProviderEndpoint['provider']>;
    state.settings = this.toPersistedSettings({
      ...settings,
      permissionMode: 'yolo',
    });

    for (const key of [
      'main',
      'reasoning',
      'image',
      'video',
      'audio',
    ] as ProviderSecretKey[]) {
      const nextKey = settings[key].apiKey.trim();
      if (nextKey) state.secrets[key] = this.encrypt(nextKey);
      else if (settings[key].provider !== previousProviders[key]) {
        delete state.secrets[key];
      }
    }

    await this.flush();
    return this.getPublicSettings();
  }

  getPublicMcpServers(): McpServerDefinition[] {
    return this.getRuntimeMcpServers().map((server) => ({
      ...server,
      env: hideSecretFields(server.env),
      headers: hideSecretFields(server.headers),
    }));
  }

  getRuntimeMcpServers(): McpServerDefinition[] {
    const raw = this.decrypt(this.requireState().secrets.mcpServers);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as McpServerDefinition[]) : [];
    } catch {
      return [];
    }
  }

  async saveMcpServers(
    servers: McpServerDefinition[],
  ): Promise<McpServerDefinition[]> {
    const state = this.requireState();
    const previous = new Map(
      this.getRuntimeMcpServers().map((server) => [server.id, server]),
    );
    const merged = servers.map((server) => {
      const existing = previous.get(server.id);
      return {
        ...server,
        env: mergeSecretFields(server.env, existing?.env),
        headers: mergeSecretFields(server.headers, existing?.headers),
      };
    });
    if (merged.length) {
      state.secrets.mcpServers = this.encrypt(JSON.stringify(merged));
    } else {
      delete state.secrets.mcpServers;
    }
    await this.flush();
    return this.getPublicMcpServers();
  }

  private toPersistedSettings(settings: AppSettings): PersistedSettings {
    const strip = ({
      apiKey: _apiKey,
      apiKeyConfigured: _configured,
      apiKeyInherited: _inherited,
      ...rest
    }: ProviderEndpoint) => rest;
    return {
      main: strip(settings.main),
      reasoning: strip(settings.reasoning),
      image: strip(settings.image),
      video: strip(settings.video),
      audio: strip(settings.audio),
      defaultWorkspace: settings.defaultWorkspace,
      permissionMode: settings.permissionMode,
      developerMode: settings.developerMode,
    };
  }

  private encrypt(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统安全存储暂不可用，无法保存敏感配置。');
    }
    return safeStorage.encryptString(value).toString('base64');
  }

  private decrypt(value?: string): string {
    if (!value || !safeStorage.isEncryptionAvailable()) return '';
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'));
    } catch {
      return '';
    }
  }

  private requireState(): PersistedState {
    if (!this.state) throw new Error('StateStore 尚未初始化');
    return this.state;
  }

  private async flush(): Promise<void> {
    const snapshot = JSON.stringify(this.requireState(), null, 2);
    const temporaryPath = `${this.statePath}.tmp`;
    const operation = this.flushChain
      .catch(() => undefined)
      .then(async () => {
        await writeFile(temporaryPath, snapshot, 'utf8');
        await rename(temporaryPath, this.statePath);
      });
    this.flushChain = operation;
    await operation;
  }
}

function inheritCredential(
  endpoint: ProviderEndpoint,
  fallback: ProviderEndpoint,
): ProviderEndpoint {
  if (
    endpoint.apiKeyConfigured ||
    !fallback.apiKeyConfigured ||
    endpoint.provider !== fallback.provider
  ) {
    return endpoint;
  }
  return { ...endpoint, apiKeyConfigured: true, apiKeyInherited: true };
}

function hideSecretFields(fields: SecretField[]): SecretField[] {
  return fields.map((field) => ({
    name: field.name,
    value: '',
    configured: Boolean(field.value),
  }));
}

function mergeSecretFields(
  fields: SecretField[],
  previous: SecretField[] = [],
): SecretField[] {
  const previousValues = new Map(
    previous.map((field) => [field.name, field.value]),
  );
  return fields.map((field) => ({
    name: field.name,
    value:
      field.value ||
      (field.configured ? (previousValues.get(field.name) ?? '') : ''),
  }));
}
