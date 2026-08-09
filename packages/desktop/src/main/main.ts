import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AgentRunner } from './agentRunner.js';
import { AgentEventStore } from './agentEventStore.js';
import { ProjectManager, type GameSkillLocations } from './projectManager.js';
import { StateStore } from './store.js';
import { ExtensionManager } from './extensionManager.js';
import { GitHubSkillInstaller } from './githubSkillInstaller.js';
import { collectMcpSecrets, validateMcpServers } from './mcpConfig.js';
import { testProviderConnection as probeProviderConnection } from './providerConnection.js';
import { ApiUsageStore, usageFromProviderProbe } from './apiUsageStore.js';
import { DependencyManager } from './dependencyManager.js';
import type {
  AppSettings,
  CreateProjectInput,
  DependencyActionInput,
  ImportSkillInput,
  InstallGitHubSkillInput,
  ProjectRecord,
  ProviderConnectionInput,
  ProviderEndpoint,
  ProviderSlot,
  StartAgentInput,
} from '../shared/types.js';

const productName = 'Noobi.ai';
// Keep the internal Electron identity stable: macOS safeStorage encryption is
// tied to that identity, so changing it would make existing API keys unreadable.
// User-facing branding is applied through the window, menu and package metadata.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const developmentAppIcon = path.join(app.getAppPath(), 'build', 'icon.png');

let mainWindow: BrowserWindow | null = null;
let store: StateStore;
let projects: ProjectManager;
let runner: AgentRunner;
let agentEvents: AgentEventStore;
let extensions: ExtensionManager;
let githubSkills: GitHubSkillInstaller;
let apiUsage: ApiUsageStore;
let dependencyManager: DependencyManager;
let trustedRendererUrl = '';
let quitInProgress = false;
let quitReady = false;

function installApplicationMenu(): void {
  if (process.platform !== 'darwin') return;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: productName,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      { role: 'help', submenu: [] },
    ]),
  );
}

function isTrustedRendererLocation(candidate: string): boolean {
  if (!trustedRendererUrl) return false;
  try {
    const actual = new URL(candidate);
    const trusted = new URL(trustedRendererUrl);
    if (trusted.protocol !== 'file:') return actual.origin === trusted.origin;
    actual.hash = '';
    trusted.hash = '';
    return actual.href === trusted.href;
  } catch {
    return false;
  }
}

function assertTrustedIpc(event: IpcMainInvokeEvent): void {
  const frameUrl = event.senderFrame?.url;
  if (
    !mainWindow ||
    event.sender.id !== mainWindow.webContents.id ||
    !frameUrl ||
    !isTrustedRendererLocation(frameUrl)
  ) {
    throw new Error('拒绝来自非受信页面的桌面权限请求。');
  }
}

function secureHandle<T extends unknown[], R>(
  channel: string,
  handler: (...args: T) => R | Promise<R>,
): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    assertTrustedIpc(event);
    return handler(...(args as T));
  });
}

function resolvePaths(): {
  repoRoot: string;
  runtimePath?: string;
  gameSkill: GameSkillLocations;
} {
  if (app.isPackaged) {
    return {
      repoRoot: process.resourcesPath,
      runtimePath: path.join(process.resourcesPath, 'runtime', 'cli.js'),
      gameSkill: {
        promptPath: path.join(process.resourcesPath, 'game-skill', 'custom.md'),
        templatesDir: path.join(
          process.resourcesPath,
          'game-skill',
          'templates',
        ),
        docsDir: path.join(process.resourcesPath, 'game-skill', 'docs'),
      },
    };
  }

  const repoRoot = path.resolve(app.getAppPath(), '../..');
  return {
    repoRoot,
    gameSkill: {
      promptPath: path.join(repoRoot, 'agent-test', 'prompts', 'custom.md'),
      templatesDir: path.join(repoRoot, 'agent-test', 'templates'),
      docsDir: path.join(repoRoot, 'agent-test', 'docs'),
    },
  };
}

async function createWindow(): Promise<void> {
  const developmentUrl = process.env['GAMEAGENT_RENDERER_URL'];
  const rendererFile = path.join(__dirname, '..', 'renderer', 'index.html');
  trustedRendererUrl = developmentUrl ?? pathToFileURL(rendererFile).href;

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#11120f',
    title: productName,
    icon: app.isPackaged ? undefined : developmentAppIcon,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 18, y: 18 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererLocation(url)) return;
    event.preventDefault();
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
  });

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (developmentUrl) await mainWindow.loadURL(developmentUrl);
  else await mainWindow.loadFile(rendererFile);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getProject(id: string): ProjectRecord {
  const project = store.getProject(id);
  if (!project) throw new Error('项目不存在或已被移除。');
  return project;
}

function requireString(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} 必须是非空字符串。`);
  }
  if (value.length > maxLength) throw new Error(`${label} 内容过长。`);
  return value;
}

function validateCreateProjectInput(value: unknown): CreateProjectInput {
  if (!value || typeof value !== 'object') throw new Error('项目参数无效。');
  const input = value as Record<string, unknown>;
  const directory = requireString(input.directory, '保存目录', 4096);
  if (!path.isAbsolute(directory)) throw new Error('保存目录必须是绝对路径。');
  return {
    name: requireString(input.name, '项目名称', 120),
    directory,
    prompt: requireString(input.prompt, '游戏创意', 200_000),
  };
}

function validateStartAgentInput(value: unknown): StartAgentInput {
  if (!value || typeof value !== 'object') throw new Error('Agent 参数无效。');
  const input = value as Record<string, unknown>;
  return {
    projectId: requireString(input.projectId, '项目 ID', 160),
    prompt: requireString(input.prompt, '提示词', 200_000),
    resume: input.resume === true,
  };
}

const STANDARD_PROVIDERS = new Set(['openai-compat', 'tongyi', 'doubao']);
const AUDIO_PROVIDERS = new Set([
  ...STANDARD_PROVIDERS,
  'elevenlabs',
  'minimax',
  'stability',
  'google-lyria',
  'mureka',
]);
const PROVIDER_SLOTS = new Set<ProviderSlot>([
  'main',
  'reasoning',
  'image',
  'video',
  'audio',
]);

function validateProviderEndpoint(
  value: unknown,
  key: ProviderSlot,
): ProviderEndpoint {
  if (!value || typeof value !== 'object') {
    throw new Error(`${key} 模型设置无效。`);
  }
  const record = value as Record<string, unknown>;
  const supportedProviders =
    key === 'audio' ? AUDIO_PROVIDERS : STANDARD_PROVIDERS;
  if (!supportedProviders.has(String(record.provider))) {
    throw new Error(`${key} Provider 不受支持。`);
  }
  const baseUrl =
    typeof record.baseUrl === 'string' ? record.baseUrl.trim() : '';
  if (!baseUrl) throw new Error(`${key} Base URL 不能为空。`);
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`${key} Base URL 格式无效。`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${key} Base URL 只允许 HTTP(S)。`);
  }
  const model = typeof record.model === 'string' ? record.model.trim() : '';
  if (!model) throw new Error(`${key} Model 不能为空。`);
  const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : '';
  if (baseUrl.length > 2048 || model.length > 256 || apiKey.length > 8192) {
    throw new Error(`${key} 模型设置内容过长。`);
  }
  return {
    provider: record.provider as ProviderEndpoint['provider'],
    baseUrl,
    model,
    apiKey,
    apiKeyConfigured: record.apiKeyConfigured === true,
  };
}

function validateSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') throw new Error('设置参数无效。');
  const input = value as Record<string, unknown>;
  const endpoint = (key: ProviderSlot) =>
    validateProviderEndpoint(input[key], key);

  const defaultWorkspace = requireString(
    input.defaultWorkspace,
    '默认工作目录',
    4096,
  );
  if (!path.isAbsolute(defaultWorkspace)) {
    throw new Error('默认工作目录必须是绝对路径。');
  }

  return {
    main: endpoint('main'),
    reasoning: endpoint('reasoning'),
    image: endpoint('image'),
    video: endpoint('video'),
    audio: endpoint('audio'),
    defaultWorkspace,
    permissionMode: 'yolo',
    developerMode: input.developerMode === true,
  };
}

function validateDependencyActionInput(value: unknown): DependencyActionInput {
  if (!value || typeof value !== 'object') {
    throw new Error('依赖操作参数无效。');
  }
  const input = value as Record<string, unknown>;
  return {
    id: requireString(input.id, '依赖标识', 80),
    action: requireString(input.action, '依赖操作', 40),
  };
}

function validateProviderConnectionInput(
  value: unknown,
): ProviderConnectionInput {
  if (!value || typeof value !== 'object') {
    throw new Error('连接测试参数无效。');
  }
  const input = value as Record<string, unknown>;
  const slot = input.slot;
  if (typeof slot !== 'string' || !PROVIDER_SLOTS.has(slot as ProviderSlot)) {
    throw new Error('连接测试的模型类型无效。');
  }
  return {
    slot: slot as ProviderSlot,
    endpoint: validateProviderEndpoint(input.endpoint, slot as ProviderSlot),
  };
}

function hydrateTestCredential(
  input: ProviderConnectionInput,
): ProviderEndpoint {
  if (input.endpoint.apiKey) return input.endpoint;
  const runtime = store.getRuntimeSettings();
  const fallbacks: Partial<Record<ProviderSlot, ProviderSlot[]>> = {
    reasoning: ['main'],
    video: ['image'],
    audio: ['reasoning', 'main'],
  };
  const candidates = [input.slot, ...(fallbacks[input.slot] ?? [])];
  for (const candidate of candidates) {
    const saved = runtime[candidate];
    if (saved.provider === input.endpoint.provider && saved.apiKey) {
      return { ...input.endpoint, apiKey: saved.apiKey };
    }
  }
  throw new Error('请先填写 API Key，再测试连接。');
}

function registerIpc(): void {
  secureHandle('app:bootstrap', () => {
    const runtime = runner.inspectRuntime();
    return {
      projects: store.getProjects(),
      settings: store.getPublicSettings(),
      version: app.getVersion(),
      runtimeReady: runtime.ready,
      runtimeMessage: runtime.message,
    };
  });

  secureHandle('dialog:choose-directory', async () => {
    const settings = store.getPublicSettings();
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择 Noobi.ai 项目保存目录',
      defaultPath: settings.defaultWorkspace,
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  secureHandle('project:create', async (input: unknown) => {
    const project = await projects.create(validateCreateProjectInput(input));
    mainWindow?.webContents.send('project:updated', project);
    return project;
  });

  secureHandle('settings:save', (settings: unknown) =>
    store.saveSettings(validateSettings(settings)),
  );

  secureHandle('settings:test-provider', async (input: unknown) => {
    const validated = validateProviderConnectionInput(input);
    const result = await probeProviderConnection(
      hydrateTestCredential(validated),
    );
    try {
      await apiUsage.record(
        usageFromProviderProbe({
          provider: validated.endpoint.provider,
          model: validated.endpoint.model,
          slot: validated.slot,
          status: result.status,
          latencyMs: result.latencyMs,
        }),
      );
    } catch (error) {
      console.error('[Noobi.ai] Failed to persist provider probe:', error);
    }
    return result;
  });

  secureHandle('settings:api-usage', () => apiUsage.snapshot());

  secureHandle('settings:inspect-dependencies', () =>
    dependencyManager.inspectDependencies(),
  );

  secureHandle('settings:run-dependency-action', async (value: unknown) => {
    const input = validateDependencyActionInput(value);
    if (input.action !== 'open') {
      const dependencies = await dependencyManager.inspectDependencies();
      const dependency = dependencies.find((item) => item.id === input.id);
      if (
        !dependency ||
        !dependency.availableActions.some((action) => action === input.action)
      ) {
        throw new Error('当前依赖不支持该操作。');
      }
      const confirmation = await dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        title: `${input.action === 'install' ? '安装' : '更新'} ${dependency.name}`,
        message: `确认${input.action === 'install' ? '安装' : '更新'} ${dependency.name}？`,
        detail:
          'Noobi.ai 只会执行内置白名单中的 Homebrew 命令；过程可能持续数分钟。',
        buttons: ['取消', input.action === 'install' ? '开始安装' : '开始更新'],
        defaultId: 0,
        cancelId: 0,
      });
      if (confirmation.response !== 1) return null;
    }
    return dependencyManager.runAction(input, (output) => {
      mainWindow?.webContents.send('settings:dependency-output', output);
    });
  });

  secureHandle('agent:start', (input: unknown) =>
    runner.start(validateStartAgentInput(input)),
  );

  secureHandle('agent:stop', (projectId: unknown) =>
    runner.stop(requireString(projectId, '项目 ID', 160)),
  );

  secureHandle('agent:history', (projectId: unknown) => {
    const project = getProject(requireString(projectId, '项目 ID', 160));
    return agentEvents.load(project, getHistorySecrets());
  });

  secureHandle('project:list-files', (projectId: unknown) =>
    projects.listFiles(getProject(requireString(projectId, '项目 ID', 160))),
  );

  secureHandle('project:read-file', (projectId: unknown, filePath: unknown) =>
    projects.readProjectFile(
      getProject(requireString(projectId, '项目 ID', 160)),
      requireString(filePath, '文件路径', 4096),
    ),
  );

  secureHandle('project:start-preview', (projectId: unknown) =>
    projects.startPreview(getProject(requireString(projectId, '项目 ID', 160))),
  );

  secureHandle('project:reveal', async (projectId: unknown) => {
    await shell.openPath(
      getProject(requireString(projectId, '项目 ID', 160)).path,
    );
  });

  secureHandle('extensions:load', async (projectId?: unknown) => {
    const project =
      typeof projectId === 'string' && projectId
        ? getProject(requireString(projectId, '项目 ID', 160))
        : undefined;
    return {
      skills: await extensions.listSkills(project),
      skillDirectories: {
        user: extensions.skillsDirectory('user'),
        project: project
          ? extensions.skillsDirectory('project', project)
          : undefined,
      },
      mcpServers: store.getPublicMcpServers(),
    };
  });

  secureHandle('extensions:save-mcp', async (value: unknown) => {
    const servers = validateMcpServers(value);
    return store.saveMcpServers(servers);
  });

  secureHandle('extensions:import-skill', async (value: unknown) => {
    const input = validateImportSkillInput(value);
    const project = input.projectId ? getProject(input.projectId) : undefined;
    if (input.level === 'project' && !project) {
      throw new Error('请选择项目后再导入项目级 Skill。');
    }
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择包含 SKILL.md 的 Skill 目录',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return extensions.importSkill(result.filePaths[0], input.level, project);
  });

  secureHandle('extensions:install-github-skill', async (value: unknown) => {
    const input = validateGitHubSkillInput(value);
    const project = input.projectId ? getProject(input.projectId) : undefined;
    if (input.level === 'project' && !project) {
      throw new Error('请选择项目后再安装项目级 Skill。');
    }
    return githubSkills.install(input, project);
  });

  secureHandle(
    'extensions:remove-skill',
    async (projectId: unknown, skillId: unknown) => {
      const project =
        typeof projectId === 'string' && projectId
          ? getProject(requireString(projectId, '项目 ID', 160))
          : undefined;
      const id = requireString(skillId, 'Skill ID', 512);
      const directory = await extensions.resolveSkillDirectory(id, project);
      const confirmation = await dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        title: '移除 Skill',
        message: `将 “${path.basename(directory)}” 移到废纸篓？`,
        detail: '运行中的 Agent 不受影响；下一回合将不再加载该 Skill。',
        buttons: ['取消', '移到废纸篓'],
        defaultId: 0,
        cancelId: 0,
      });
      if (confirmation.response === 1) await shell.trashItem(directory);
    },
  );

  secureHandle(
    'extensions:reveal-skill',
    async (projectId: unknown, skillId: unknown) => {
      const project =
        typeof projectId === 'string' && projectId
          ? getProject(requireString(projectId, '项目 ID', 160))
          : undefined;
      const directory = await extensions.resolveSkillDirectory(
        requireString(skillId, 'Skill ID', 512),
        project,
      );
      await shell.openPath(directory);
    },
  );

  secureHandle(
    'extensions:reveal-skill-directory',
    async (level: unknown, projectId?: unknown) => {
      if (level !== 'project' && level !== 'user') {
        throw new Error('Skill 级别无效。');
      }
      const project =
        typeof projectId === 'string' && projectId
          ? getProject(requireString(projectId, '项目 ID', 160))
          : undefined;
      const directory = await extensions.ensureSkillsDirectory(level, project);
      await shell.openPath(directory);
    },
  );

  secureHandle('extensions:open-github-url', async (value: unknown) => {
    const url = new URL(requireString(value, 'GitHub 地址', 2_048));
    if (
      url.protocol !== 'https:' ||
      (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') ||
      url.username ||
      url.password ||
      url.port
    ) {
      throw new Error('只允许打开 github.com 的 HTTPS 地址。');
    }
    await shell.openExternal(url.href);
  });
}

app
  .whenReady()
  .then(async () => {
    installApplicationMenu();
    if (process.platform === 'darwin' && !app.isPackaged && app.dock) {
      app.dock.setIcon(developmentAppIcon);
    }
    const paths = resolvePaths();
    store = new StateStore();
    await store.initialize();
    agentEvents = new AgentEventStore({
      directory: path.join(app.getPath('userData'), 'agent-history', 'v1'),
    });
    await agentEvents.initialize();
    apiUsage = new ApiUsageStore({
      directory: path.join(app.getPath('userData'), 'api-usage', 'v1'),
    });
    await apiUsage.initialize();
    dependencyManager = new DependencyManager();
    extensions = new ExtensionManager();
    githubSkills = new GitHubSkillInstaller(extensions);
    projects = new ProjectManager(store, paths.gameSkill);
    runner = new AgentRunner({
      repoRoot: paths.repoRoot,
      packagedRuntimePath: paths.runtimePath,
      store,
      projects,
      emitEvent: (event) => {
        void agentEvents
          .append(event, getHistorySecrets())
          .catch((error: unknown) =>
            console.error('[GameAgent] Failed to persist Agent event:', error),
          );
        mainWindow?.webContents.send('agent:event', event);
      },
      emitProject: (project) =>
        mainWindow?.webContents.send('project:updated', project),
      recordApiUsage: (input) => apiUsage.record(input).then(() => undefined),
    });
    registerIpc();
    await createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  })
  .catch((error: unknown) => {
    console.error('[GameAgent] Desktop startup failed:', error);
    app.quit();
  });

app.on('window-all-closed', () => {
  projects?.stopAllPreviews();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (quitReady) return;
  event.preventDefault();
  if (quitInProgress) return;
  quitInProgress = true;
  void (async () => {
    await runner?.shutdown();
    await agentEvents?.flush();
    await apiUsage?.flushPending();
    projects?.stopAllPreviews();
    quitReady = true;
    app.quit();
  })().catch((error: unknown) => {
    console.error('[GameAgent] Shutdown cleanup failed:', error);
    quitReady = true;
    app.quit();
  });
});

function getHistorySecrets(): string[] {
  const settings = store.getRuntimeSettings();
  const mcpServers = store.getRuntimeMcpServers();
  return [
    settings.main.apiKey,
    settings.reasoning.apiKey,
    settings.image.apiKey,
    settings.video.apiKey,
    settings.audio.apiKey,
    ...collectMcpSecrets(mcpServers),
  ].filter((value): value is string => Boolean(value && value.length >= 8));
}

function validateImportSkillInput(value: unknown): ImportSkillInput {
  if (!value || typeof value !== 'object') throw new Error('Skill 参数无效。');
  const input = value as Record<string, unknown>;
  if (input.level !== 'project' && input.level !== 'user') {
    throw new Error('Skill 级别无效。');
  }
  return {
    level: input.level,
    projectId:
      typeof input.projectId === 'string' && input.projectId
        ? requireString(input.projectId, '项目 ID', 160)
        : undefined,
  };
}

function validateGitHubSkillInput(value: unknown): InstallGitHubSkillInput {
  const base = validateImportSkillInput(value);
  const input = value as Record<string, unknown>;
  const optionalString = (candidate: unknown, label: string, max: number) => {
    if (candidate === undefined || candidate === null || candidate === '') {
      return undefined;
    }
    return requireString(candidate, label, max).trim();
  };
  return {
    ...base,
    url: requireString(input.url, 'GitHub 地址', 2_048).trim(),
    path: optionalString(input.path, '仓库内路径', 2_000),
    ref: optionalString(input.ref, 'Git Ref', 300),
  };
}
