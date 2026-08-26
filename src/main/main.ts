import { randomUUID } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import type {
  AgentEvent,
  AppSettings,
  ApprovalAnswers,
  ApprovalDecision,
  BootstrapPayload,
  CreateProjectInput,
  ExtensionSettingsSnapshot,
  GameAssetRecord,
  McpServerSetting,
  MediaCapability,
  MediaProviderSetting,
  MediaProviderTestResult,
  PipelineStage,
  PromptTemplateId,
  PromptTemplateSetting,
  ProjectInspectorPayload,
  ProjectRecord,
  RunProjectInput,
  RuntimeStatus,
  SaveMcpServerInput,
  SaveMediaProviderInput,
  SkillSetting,
} from '../shared/contracts.js';
import { isTargetFrameRate } from '../shared/contracts.js';
import { AssetStore } from './assetStore.js';
import { ApprovalBroker } from './approvalBroker.js';
import { CodexAppServer } from './codexAppServer.js';
import { EventLog } from './eventLog.js';
import { notificationToEvent, routeThreadId, type ThreadRoute } from './eventMapper.js';
import {
  GameHarness,
  GAME_HARNESS_TOOLSET_VERSION,
  GameHarnessStoppedError,
  reusableImplementerThreadId,
  type GameHarnessStateEvent,
  type GameHarnessThreadEvent,
  type HostAudioGenerationRequirement,
  type HostImageGenerationRequirement,
} from './gameHarness.js';
import { imageGenerationGateFromVerification } from './imageGenerationGate.js';
import { ImageGenerationAttestationStore } from './imageGenerationAttestation.js';
import {
  assertRequiredImageGenerationSkillToggleAllowed,
  resolveRequiredImageGenerationSkill,
} from './imageGenerationSkillPolicy.js';
import { McpConfigManager } from './mcpConfigManager.js';
import { MediaGenerationService } from './mediaGenerationService.js';
import { configuredMediaProviderDiagnostic } from './mediaProviderDiagnostics.js';
import {
  listMediaProviderPresets,
  MediaProviderStore,
  type MediaProviderSummary,
} from './mediaProviderStore.js';
import { MEDIA_DYNAMIC_TOOLS, MediaToolBroker } from './mediaToolBroker.js';
import { PreviewServer } from './previewServer.js';
import { ProjectStore } from './projectStore.js';
import { PromptTemplateStore } from './promptTemplateStore.js';
import { synchronizeWorkspaceHostPolicy } from './workspaceTemplate.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const smokeCapture = process.env.NOOBI_SMOKE_CAPTURE?.trim() || null;
if (smokeCapture) app.setPath('userData', resolve('.noobi-smoke/user-data'));

app.setName('Noobi.ai');

const runtime = new CodexAppServer({
  codexHome: join(app.getPath('userData'), 'codex-home'),
});
const harness = new GameHarness(runtime);
const previews = new PreviewServer();
const assetStore = new AssetStore();
const threadRoutes = new Map<string, ThreadRoute>();
const backgroundRuns = new Set<Promise<void>>();
const assetIngestionRuns = new Map<string, Set<Promise<void>>>();
let projectStore: ProjectStore;
let eventLog: EventLog;
let approvalBroker: ApprovalBroker;
let mediaToolBroker: MediaToolBroker;
let mediaProviderStore: MediaProviderStore;
let mediaGenerationService: MediaGenerationService;
let mcpConfigManager: McpConfigManager;
let promptTemplateStore: PromptTemplateStore;
let imageGenerationAttestations: ImageGenerationAttestationStore;
let mainWindow: BrowserWindow | null = null;
let shuttingDown = false;
const mediaProviderTests = new Map<MediaCapability, MediaProviderTestResult>();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.exit(0);
} else {
  void app.whenReady().then(launch).catch((error) => {
    if (smokeCapture) process.stderr.write(`Noobi UI smoke failed: ${asError(error).message}\n`);
    else dialog.showErrorBox('Noobi.ai 无法启动', asError(error).message);
    app.exit(1);
  });
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

app.on('activate', () => {
  if (!mainWindow && !shuttingDown) void createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  void shutdown().finally(() => app.exit(0));
});

async function launch(): Promise<void> {
  if (!app.isPackaged && process.platform === 'darwin') {
    app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png'));
  }

  const userData = app.getPath('userData');
  const defaultWorkspace = smokeCapture
    ? join(userData, 'smoke-projects')
    : join(homedir(), 'Noobi Games');
  projectStore = new ProjectStore({
    storageFile: join(userData, 'projects.json'),
    defaultWorkspace,
  });
  eventLog = new EventLog(join(userData, 'events'));
  imageGenerationAttestations = new ImageGenerationAttestationStore(
    join(userData, 'image-generation-attestations.json'),
  );
  mediaProviderStore = new MediaProviderStore(join(userData, 'media-providers.json'), {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    seal: (plaintext) => `electron-safe-storage:v1:${safeStorage.encryptString(plaintext).toString('base64')}`,
    open: (sealed) => {
      const prefix = 'electron-safe-storage:v1:';
      if (!sealed.startsWith(prefix)) throw new Error('Unsupported safeStorage envelope');
      const encoded = sealed.slice(prefix.length);
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) {
        throw new Error('Invalid safeStorage envelope');
      }
      const encrypted = Buffer.from(encoded, 'base64');
      if (!encrypted.length || encrypted.toString('base64') !== encoded) {
        throw new Error('Invalid safeStorage envelope');
      }
      return safeStorage.decryptString(encrypted);
    },
  });
  mediaGenerationService = new MediaGenerationService({
    providerStore: mediaProviderStore,
    assetStore,
  });
  promptTemplateStore = new PromptTemplateStore(join(userData, 'prompt-templates.json'));
  mcpConfigManager = new McpConfigManager(runtime);
  approvalBroker = new ApprovalBroker(runtime, (threadId) => threadRoutes.get(threadId)?.projectId ?? null);
  mediaToolBroker = new MediaToolBroker({
    server: runtime,
    assetStore,
    generationService: mediaGenerationService,
    resolveProject: async (threadId) => {
      const route = threadRoutes.get(threadId);
      if (!route || route.role !== 'implementer') return null;
      const project = await projectStore.get(route.projectId);
      return { id: project.id, root: project.root };
    },
    onAssetsChanged: (projectId, assets) => {
      broadcast('noobi:event:assets', { projectId, assets });
    },
    onGeneratedAsset: async (projectId, asset, provider) => {
      const isImage = asset.kind === 'image';
      const isMiniMaxAudio = asset.kind === 'audio'
        && isMiniMaxAudioPreset(provider.presetId);
      if (!isImage && !isMiniMaxAudio) return;
      await imageGenerationAttestations.record({
        projectId,
        relativePath: asset.relativePath,
        sha256: asset.sha256,
        provider: `api:${provider.presetId}:${provider.id}`,
      });
      emitAgentEvent({
        id: randomUUID(),
        projectId,
        kind: 'file',
        title: isImage ? '图片 API 素材已保存' : 'MiniMax 音乐素材已保存',
        message: `${asset.name} 已由 ${provider.displayName} / ${provider.model} 生成并加入素材库。`,
        stage: 'assets',
        timestamp: new Date().toISOString(),
        method: isImage ? 'assets/image-api-generated' : 'assets/audio-api-generated',
      });
    },
  });
  await Promise.all([
    projectStore.init(),
    eventLog.init(),
    imageGenerationAttestations.init(),
    mediaProviderStore.init(),
    promptTemplateStore.init(),
  ]);
  await recoverInterruptedProjects();

  bindRuntimeEvents();
  bindHarnessEvents();
  bindIpc();
  await ensureSmokeProject();
  await createWindow();
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1510,
    height: 940,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: '#11120f',
    title: 'Noobi.ai',
    show: false,
    webPreferences: {
      preload: join(moduleDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow = window;

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//iu.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  window.once('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  const rendererUrl = process.env.NOOBI_RENDERER_URL;
  if (rendererUrl) await window.loadURL(rendererUrl);
  else await window.loadFile(join(moduleDirectory, '../renderer/index.html'));

  if (smokeCapture) await captureSmoke(window, smokeCapture);
}

function bindRuntimeEvents(): void {
  runtime.on('status', (status) => {
    if (status.state !== 'ready') approvalBroker.invalidateAll();
    broadcast('noobi:event:runtime', runtimeStatusForUi(status));
  });
  runtime.on('diagnostic', (message: string) => {
    if (process.env.NOOBI_DEBUG === '1') process.stderr.write(`[codex] ${message}\n`);
  });
  runtime.on('serverRequest', (request) => {
    if (!mediaToolBroker.handle(request)) approvalBroker.handle(request);
  });
  runtime.on('notification', (notification: { method: string; params?: unknown }) => {
    if (notification.method === 'serverRequest/resolved') {
      const requestId = readRequestId(asRecord(notification.params)?.requestId);
      if (requestId !== null) approvalBroker.resolveFromServer(requestId);
    }
    const threadId = routeThreadId(notification);
    if (!threadId) return;
    const route = threadRoutes.get(threadId);
    if (!route) return;
    if (route.role === 'implementer' && notification.method === 'item/completed') {
      const task = ingestGeneratedImage(notification, route.projectId).catch((error) => {
        if (process.env.NOOBI_DEBUG === '1') {
          process.stderr.write(`[assets] ${asError(error).message}\n`);
        }
      });
      trackAssetIngestion(route.projectId, task);
    }
    void projectStore.get(route.projectId).then((project) => {
      const event = notificationToEvent(notification, route, project.stage);
      if (event) emitAgentEvent(event);
    }).catch(() => undefined);
  });

  approvalBroker.on('approval', (approval) => broadcast('noobi:event:approval', approval));
  approvalBroker.on('closed', (token: string) => broadcast('noobi:event:approval-closed', token));
  approvalBroker.on('diagnostic', (message: string) => {
    if (process.env.NOOBI_DEBUG === '1') process.stderr.write(`[approval] ${message}\n`);
  });
  approvalBroker.on('expired', (approval) => {
    if (!approval.projectId) return;
    emitAgentEvent({
      id: randomUUID(),
      projectId: approval.projectId,
      kind: 'approval',
      title: '审批已超时',
      message: '该请求已安全拒绝。',
      stage: 'code',
      timestamp: new Date().toISOString(),
      method: 'approval/expired',
    });
  });
}

function bindHarnessEvents(): void {
  harness.on('thread', (event: GameHarnessThreadEvent) => {
    threadRoutes.set(event.threadId, { projectId: event.projectId, role: event.role });
    if (event.role === 'implementer') {
      void updateProject(event.projectId, {
        threadId: event.threadId,
        toolsetVersion: GAME_HARNESS_TOOLSET_VERSION,
      });
    }
  });
  harness.on('threadClosed', ({ threadId }: { threadId: string }) => {
    threadRoutes.delete(threadId);
  });
  harness.on('event', (event: AgentEvent) => emitAgentEvent(event));
  harness.on('state', (event: GameHarnessStateEvent) => {
    // Completion is provisional until the host validates all fixed generated-
    // media requirements after pending outputs have been ingested.
    if (event.state === 'completed') return;
    const stage = stageForHarnessState(event);
    const status =
      event.state === 'failed'
          ? 'failed'
          : event.state === 'stopped'
            ? 'stopped'
            : 'running';
    void updateProject(event.projectId, {
      status,
      stage,
      ...(event.threadId ? { threadId: event.threadId } : {}),
      activeTurnId: event.activeTurnId,
      lastError: event.error,
    });
  });
}

function bindIpc(): void {
  handle('noobi:bootstrap', async (): Promise<BootstrapPayload> => {
    const projects = await projectStore.list();
    const settings = await projectStore.getSettings();
    await runtime.start().catch(() => runtime.status);
    const events = Object.fromEntries(
      await Promise.all(projects.map(async (project) => [project.id, await eventLog.read(project.id)] as const)),
    );
    return { projects, settings, runtime: runtimeStatusForUi(runtime.status), events };
  });

  handle('noobi:runtime:refresh', async () => runtimeStatusForUi(await runtime.refresh()));
  handle('noobi:runtime:login', async () => {
    const result = await runtime.startLogin();
    if (result.authUrl && /^https:\/\//iu.test(result.authUrl)) {
      await shell.openExternal(result.authUrl);
    }
    return result;
  });
  handle('noobi:runtime:logout', async () => runtimeStatusForUi(await runtime.logout()));
  handle('noobi:dialog:directory', async () => {
    const settings = await projectStore.getSettings();
    const options: Electron.OpenDialogOptions = {
      title: '选择游戏项目目录',
      defaultPath: settings.defaultWorkspace,
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  handle('noobi:project:create', async (_event, input: CreateProjectInput) => {
    const project = await projectStore.create(input);
    const initialEvent: AgentEvent = {
      id: randomUUID(),
      projectId: project.id,
      kind: 'user',
      title: '游戏创意',
      message: project.idea,
      stage: 'brief',
      timestamp: project.createdAt,
      method: 'project/created',
    };
    emitAgentEvent(initialEvent);
    broadcast('noobi:event:project', project);
    return project;
  });

  handle('noobi:project:run', async (_event, input: RunProjectInput) => {
    validateRunInput(input);
    const project = await projectStore.get(input.projectId);
    if (harness.isRunning(project.id)) throw new Error('该项目已有正在执行的 Agent');
    const status = await runtime.start();
    if (!status.account) throw new Error('请先登录 ChatGPT，再启动游戏 Agent');
    const settings = await projectStore.getSettings();
    const model = input.model ?? project.model ?? settings.defaultModel ?? defaultModel(status.models);
    const targetFrameRate = input.targetFrameRate ?? project.targetFrameRate;
    const imageProvider = activeMediaProvider('image');
    const audioProvider = activeMediaProvider('audio');
    const miniMaxMusicRequired = Boolean(
      audioProvider && isMiniMaxAudioPreset(audioProvider.presetId),
    );
    const imageGenerationSkill = await resolveImageGenerationSkill();
    if (!imageProvider && (!status.capabilities.imageGeneration || !imageGenerationSkill)) {
      throw new Error('没有可用的图像 API，当前 Codex 运行时也没有 ImageGen 能力；请先在设置中配置图像 API 或修复 Codex ImageGen');
    }
    const imageGenerationRequirement = await resolveHostImageGenerationRequirement(project);
    const audioGenerationRequirement = await resolveHostAudioGenerationRequirement(
      project,
      miniMaxMusicRequired,
    );
    if (audioGenerationRequirement.state === 'fresh-generation-required') {
      try {
        const probe = await mediaGenerationService.probeActiveAudioProvider();
        if (probe.outcome !== 'ready') {
          throw new Error('MiniMax 音频服务未就绪');
        }
      } catch (error) {
        throw new Error(`MiniMax 音乐生成前置检查失败：${asError(error).message}`);
      }
    }
    const promptAdditions = await promptTemplateStore.enabledAdditions();
    const prepared = await updateProject(project.id, {
      model,
      targetFrameRate,
      lastError: null,
    });
    try {
      await synchronizeWorkspaceHostPolicy(prepared.root, prepared);
    } catch (error) {
      const message = `无法同步 ${targetFrameRate} FPS 工作区策略：${asError(error).message}`;
      await updateProject(project.id, {
        status: 'failed',
        activeTurnId: null,
        lastError: message,
      }).catch(() => undefined);
      throw new Error(message);
    }
    const running = await updateProject(project.id, {
      status: 'running',
      activeTurnId: null,
      lastError: null,
    });
    emitAgentEvent({
      id: randomUUID(),
      projectId: project.id,
      kind: 'user',
      title: '制作指令',
      message: input.prompt.trim(),
      stage: running.stage,
      timestamp: new Date().toISOString(),
      method: 'harness/user-request',
    });
    trackBackgroundRun(
      executeHarness(
        running,
        input.prompt.trim(),
        model,
        input.effort ?? settings.defaultEffort,
        imageGenerationSkill,
        imageGenerationRequirement,
        audioGenerationRequirement,
        targetFrameRate,
        imageProvider ? 'configured-api' : 'codex-imagegen',
        promptAdditions,
      ),
    );
    return running;
  });

  handle('noobi:project:stop', async (_event, projectId: string) => {
    validateProjectId(projectId);
    await harness.stop(projectId);
    const project = await projectStore.get(projectId);
    return project.status === 'running'
      ? updateProject(projectId, { status: 'stopped', activeTurnId: null })
      : project;
  });
  handle('noobi:project:reveal', async (_event, projectId: string) => {
    const project = await projectStore.get(validateProjectId(projectId));
    const error = await shell.openPath(project.root);
    if (error) throw new Error(error);
  });
  handle('noobi:project:assets:import', async (_event, projectId: string) => {
    const project = await projectStore.get(validateProjectId(projectId));
    if (harness.isRunning(project.id)) {
      throw new Error('Agent 正在写入项目，请等待当前任务结束后再导入素材');
    }
    const options: Electron.OpenDialogOptions = {
      title: '导入游戏素材',
      defaultPath: project.root,
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '支持的游戏素材', extensions: ['png', 'jpg', 'jpeg', 'webp', 'wav', 'mp3', 'ogg', 'glb'] },
        { name: '图像', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        { name: '音频', extensions: ['wav', 'mp3', 'ogg'] },
        { name: '3D 模型', extensions: ['glb'] },
      ],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return assetStore.list(project.id, project.root);
    }
    return importProjectAssetPaths(project, result.filePaths, '图像、音频或 3D 素材');
  });
  handle('noobi:project:assets:import-paths', async (_event, projectId: string, paths: unknown) => {
    const project = await projectStore.get(validateProjectId(projectId));
    if (harness.isRunning(project.id)) {
      throw new Error('Agent 正在写入项目，请等待当前任务结束后再拖入图片');
    }
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > 50) {
      throw new Error('一次只能拖入 1–50 张图片');
    }
    const imagePaths = paths.map((path) => {
      if (typeof path !== 'string' || !isAbsolute(path) || path.length > 4_000 || path.includes('\0')) {
        throw new Error('拖入图片路径无效');
      }
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extname(path).toLowerCase())) {
        throw new Error('拖拽仅支持 PNG、JPEG 和 WebP 图片');
      }
      return path;
    });
    return importProjectAssetPaths(project, imagePaths, '拖入图片');
  });
  handle('noobi:project:inspect', async (_event, projectId: string): Promise<ProjectInspectorPayload> => {
    const project = await projectStore.get(validateProjectId(projectId));
    const [files, previewUrl, assets] = await Promise.all([
      projectStore.listProjectFiles(project.id),
      previews.start(project.id, project.root).catch(() => ''),
      assetStore.list(project.id, project.root),
    ]);
    const imageGenerationGate = imageGenerationGateFromVerification(
      await verifyHostGeneratedImage(project, assets),
    );
    return { files, previewUrl, assets, imageGenerationGate };
  });
  handle('noobi:project:read', (_event, projectId: string, relativePath: string) => {
    validateProjectId(projectId);
    if (typeof relativePath !== 'string' || relativePath.length > 4_000) {
      throw new Error('无效的项目文件路径');
    }
    return projectStore.readProjectFile(projectId, relativePath);
  });
  handle('noobi:settings:save', (_event, patch: Partial<AppSettings>) =>
    projectStore.saveSettings(validateSettingsPatch(patch)),
  );
  handle('noobi:extensions:get', async (): Promise<ExtensionSettingsSnapshot> => {
    const [skills, mcpServers, promptTemplates] = await Promise.all([
      listSkillSettings(),
      listMcpSettings(),
      listPromptSettings(),
    ]);
    return {
      mediaProviders: listMediaProviderSettings(),
      skills,
      mcpServers,
      promptTemplates,
    };
  });
  handle('noobi:media-provider:save', async (_event, input: SaveMediaProviderInput) => {
    const normalized = validateMediaProviderInput(input);
    // Reuse secrets only for the exact same preset. Carrying an omitted key
    // from one vendor to another could disclose it to the wrong endpoint.
    const existing = mediaProviderStore.list(normalized.capability)
      .find((provider) => provider.presetId === normalized.provider)
      ?? null;
    const saved = await mediaProviderStore.upsert({
      ...(existing ? { id: existing.id } : {}),
      presetId: normalized.provider,
      displayName: listMediaProviderPresets(normalized.capability)
        .find((preset) => preset.id === normalized.provider)?.label,
      endpoint: normalized.endpoint,
      model: normalized.model,
      ...(normalized.apiKey === undefined ? {} : { apiKey: normalized.apiKey }),
      enabled: normalized.enabled,
      setActive: normalized.enabled,
    });
    mediaProviderTests.delete(normalized.capability);
    broadcast('noobi:event:runtime', runtimeStatusForUi(runtime.status));
    return mediaProviderSetting(saved);
  });
  handle('noobi:media-provider:test', async (_event, capability: MediaCapability) => {
    const kind = validateMediaCapability(capability);
    const started = Date.now();
    const provider = activeMediaProvider(kind);
    let ok = Boolean(provider);
    let message = ok
      ? configuredMediaProviderDiagnostic(provider!.displayName)
      : kind === 'image' && runtime.status.capabilities.imageGeneration
        ? '未发现可用图像 API；制作时将回退 Codex ImageGen。'
        : '当前服务未启用，或缺少所需 API Key。';
    if (kind === 'audio' && (provider?.presetId === 'minimax-audio' || provider?.presetId === 'minimax-audio-cn')) {
      try {
        const probe = await mediaGenerationService.probeActiveAudioProvider();
        ok = probe.outcome === 'ready';
        message = probe.outcome === 'ready'
          ? 'MiniMax Speech 鉴权与短音频探测通过；Music 3.0 的账户资格将在首次实际音乐生成时确认。'
          : probe.outcome === 'not-configured'
            ? 'MiniMax 音频服务未启用，或缺少所需 API Key。'
            : '当前音频服务不支持在线鉴权探测。';
      } catch (error) {
        ok = false;
        message = `MiniMax Speech 连通性检查失败：${asError(error).message}`;
      }
    }
    const result: MediaProviderTestResult = {
      capability: kind,
      ok,
      message,
      latencyMs: Date.now() - started,
      testedAt: new Date().toISOString(),
    };
    mediaProviderTests.set(kind, result);
    return result;
  });
  handle('noobi:skills:list', () => listSkillSettings());
  handle('noobi:skills:set-enabled', async (_event, input: { id: string; enabled: boolean }) => {
    if (!input || typeof input !== 'object' || typeof input.id !== 'string' || typeof input.enabled !== 'boolean') {
      throw new Error('无效的 Skill 设置');
    }
    const skills = await runtime.listSkills({ forceReload: true });
    const selected = skills.find((skill) => skill.path === input.id);
    if (!selected) throw new Error('该 Skill 不在当前 Codex 技能目录中');
    await assertRequiredImageGenerationSkillToggleAllowed(
      runtime.status.codexHome,
      selected,
      input.enabled,
    );
    await runtime.setSkillEnabled({ path: selected.path }, input.enabled);
    const refreshed = await listSkillSettings();
    const result = refreshed.find((skill) => skill.id === selected.path);
    if (!result) throw new Error('Skill 状态刷新失败');
    return result;
  });
  handle('noobi:mcp:list', () => listMcpSettings());
  handle('noobi:mcp:save', async (_event, input: SaveMcpServerInput) => {
    await mcpConfigManager.save(input);
    const result = (await listMcpSettings()).find((server) => server.id === input.id);
    if (!result) throw new Error('MCP Server 保存后未出现在 Codex 配置中');
    return result;
  });
  handle('noobi:mcp:remove', async (_event, id: string) => {
    await mcpConfigManager.remove(id);
  });
  handle('noobi:prompts:list', () => listPromptSettings());
  handle('noobi:prompts:save', async (_event, input: {
    id: PromptTemplateId;
    content: string;
    enabled: boolean;
  }) => promptTemplateStore.save(input));
  handle('noobi:prompts:reset', (_event, id: PromptTemplateId) => promptTemplateStore.reset(id));
  handle(
    'noobi:approval:resolve',
    (_event, token: string, decision: ApprovalDecision, answers?: ApprovalAnswers): void => {
      if (typeof token !== 'string' || token.length > 200) throw new Error('无效的审批令牌');
      if (!['accept', 'acceptForSession', 'decline', 'cancel'].includes(decision)) {
        throw new Error('无效的审批决定');
      }
      approvalBroker.resolve(token, decision, answers);
    },
  );
}

async function importProjectAssetPaths(
  project: ProjectRecord,
  paths: readonly string[],
  description: string,
): Promise<GameAssetRecord[]> {
  await assetStore.importFiles(project.id, project.root, [...paths]);
  const assets = await assetStore.list(project.id, project.root);
  broadcast('noobi:event:assets', { projectId: project.id, assets });
  emitAgentEvent({
    id: randomUUID(),
    projectId: project.id,
    kind: 'file',
    title: '素材已导入',
    message: `已安全导入 ${paths.length} 个${description}。`,
    stage: 'assets',
    timestamp: new Date().toISOString(),
    method: 'assets/imported',
  });
  return assets;
}

function listMediaProviderSettings(): MediaProviderSetting[] {
  return (['image', 'audio', 'model3d'] as const).map((capability) => {
    const providers = mediaProviderStore.list(capability);
    const provider = providers.find((candidate) => candidate.active) ?? providers[0] ?? null;
    if (provider) return mediaProviderSetting(provider);
    const preset = listMediaProviderPresets(capability)[0]!;
    return {
      capability,
      provider: preset.id,
      model: preset.defaultModel,
      endpoint: preset.defaultEndpoint ?? '',
      enabled: false,
      hasApiKey: false,
      keyHint: null,
      status: 'unconfigured',
      statusMessage: capability === 'image'
        ? '未配置外部 API；将使用 Codex ImageGen。'
        : '尚未配置生成服务。',
      lastTestedAt: null,
    };
  });
}

function mediaProviderSetting(provider: MediaProviderSummary): MediaProviderSetting {
  const test = mediaProviderTests.get(provider.kind);
  const usable = provider.active
    && provider.enabled
    && (provider.auth === 'none' || provider.hasApiKey);
  return {
    capability: provider.kind,
    provider: provider.presetId,
    model: provider.model,
    endpoint: provider.endpoint,
    enabled: provider.enabled,
    hasApiKey: provider.hasApiKey,
    keyHint: null,
    status: test ? (test.ok ? 'ready' : 'error') : usable ? 'untested' : 'unconfigured',
    statusMessage: test?.message
      ?? (usable ? '已配置；等待实际生成验证。' : '服务未启用或缺少 API Key。'),
    lastTestedAt: test?.testedAt ?? null,
  };
}

function activeMediaProvider(kind: MediaCapability): MediaProviderSummary | null {
  const provider = mediaProviderStore.list(kind).find((candidate) => candidate.active) ?? null;
  if (!provider || !provider.enabled || (provider.auth !== 'none' && !provider.hasApiKey)) return null;
  return provider;
}

function isMiniMaxAudioPreset(presetId: string): boolean {
  return presetId === 'minimax-audio' || presetId === 'minimax-audio-cn';
}

function validateMediaCapability(value: unknown): MediaCapability {
  if (value !== 'image' && value !== 'audio' && value !== 'model3d') {
    throw new Error('未知媒体能力');
  }
  return value;
}

function validateMediaProviderInput(input: SaveMediaProviderInput): SaveMediaProviderInput {
  if (!input || typeof input !== 'object') throw new Error('无效的媒体服务设置');
  const capability = validateMediaCapability(input.capability);
  if (typeof input.provider !== 'string'
    || !listMediaProviderPresets(capability).some((preset) => preset.id === input.provider)) {
    throw new Error('媒体服务提供商与能力类型不匹配');
  }
  if (typeof input.model !== 'string' || !input.model.trim() || input.model.length > 200) {
    throw new Error('媒体模型 ID 无效');
  }
  if (typeof input.endpoint !== 'string' || input.endpoint.length > 2_000) {
    throw new Error('媒体 API Endpoint 无效');
  }
  if (typeof input.enabled !== 'boolean') throw new Error('媒体服务 enabled 无效');
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 16_384)) {
    throw new Error('媒体 API Key 无效');
  }
  return {
    ...input,
    capability,
    provider: input.provider,
    model: input.model.trim(),
    endpoint: input.endpoint.trim(),
    ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey.trim() }),
  };
}

async function listSkillSettings(): Promise<SkillSetting[]> {
  const skills = await runtime.listSkills({ forceReload: false });
  const unique = new Map<string, SkillSetting>();
  for (const skill of skills) {
    if (!skill.path || unique.has(skill.path)) continue;
    const source: SkillSetting['source'] = skill.path.includes(`${sep}plugins${sep}`)
      ? 'plugin'
      : skill.scope === 'system' || skill.scope === 'admin'
        ? 'built-in'
        : skill.scope === 'repo'
          ? 'workspace'
          : 'user';
    unique.set(skill.path, {
      id: skill.path,
      name: skill.name,
      description: skill.description,
      source,
      path: skill.path,
      enabled: skill.enabled,
    });
  }
  return [...unique.values()].sort((left, right) =>
    Number(right.enabled) - Number(left.enabled) || left.name.localeCompare(right.name));
}

async function listMcpSettings(): Promise<McpServerSetting[]> {
  return (await mcpConfigManager.list()).map((server) => ({
    id: server.id,
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.url,
    enabled: server.enabled,
    bearerTokenEnvVar: server.bearerTokenEnvVar,
    status: server.connected ? 'connected' : 'stopped',
    statusMessage: server.connected
      ? `${server.toolCount} 个工具 · ${server.authStatus}`
      : server.enabled
        ? '尚未建立连接；保存后已请求 Codex 重载。'
        : '已停用',
  }));
}

async function listPromptSettings(): Promise<PromptTemplateSetting[]> {
  return promptTemplateStore.list();
}

function runtimeStatusForUi(status: RuntimeStatus): RuntimeStatus {
  return {
    ...status,
    capabilities: {
      ...status.capabilities,
      externalImageGeneration: Boolean(mediaProviderStore && activeMediaProvider('image')),
    },
  };
}

async function executeHarness(
  project: ProjectRecord,
  prompt: string,
  model: string | null,
  effort: string,
  imageGenerationSkill: { name: string; path: string } | null,
  imageGenerationRequirement: HostImageGenerationRequirement,
  audioGenerationRequirement: HostAudioGenerationRequirement,
  targetFrameRate: ProjectRecord['targetFrameRate'],
  imageGenerationRoute: 'configured-api' | 'codex-imagegen',
  promptAdditions: Parameters<GameHarness['run']>[0]['promptAdditions'],
): Promise<void> {
  try {
    const result = await harness.run({
      projectId: project.id,
      cwd: project.root,
      prompt,
      model,
      effort,
      threadId: reusableImplementerThreadId(project.threadId, project.toolsetVersion),
      dynamicTools: MEDIA_DYNAMIC_TOOLS,
      ...(imageGenerationSkill ? { imageGenerationSkill } : {}),
      imageGenerationRequirement,
      audioGenerationRequirement,
      imageGenerationRoute,
      targetFrameRate,
      promptAdditions,
      refreshImageGenerationRequirement: async () => {
        await waitForAssetIngestions(project.id);
        return resolveHostImageGenerationRequirement(project);
      },
      refreshAudioGenerationRequirement: async () => {
        await waitForAssetIngestions(project.id);
        return resolveHostAudioGenerationRequirement(
          project,
          audioGenerationRequirement.state !== 'not-required',
        );
      },
    });
    await previews.stop(project.id).catch(() => undefined);
    await waitForAssetIngestions(project.id);
    const assets = await assetStore.list(project.id, project.root);
    const codexHome = runtime.status.codexHome;
    if (codexHome) {
      await imageGenerationAttestations.bootstrapFromManagedOutputs({
        projectId: project.id,
        root: project.root,
        generatedImagesRoot: join(codexHome, 'generated_images'),
        assets,
      });
    }
    const imageVerification = await imageGenerationAttestations.verify({
      projectId: project.id,
      root: project.root,
      assets,
    });
    if (!imageVerification.ok) {
      const detail = imageVerification.reason === 'missing-attestation'
        ? '没有宿主签发的图像 API / Codex ImageGen 生成证明'
        : imageVerification.reason === 'asset-mismatch'
          ? '当前图片文件的路径或 SHA-256 与宿主生成证明不匹配'
          : '受信图片的完整资源路径没有出现在生产源码或构建产物中';
      const message = `强制生图校验失败：${detail}。任务不能标记为完成；请调用配置的图像 API（无 API 时使用 Codex ImageGen）、保留宿主入库素材，并在游戏生产代码中引用它。`;
      emitAgentEvent({
        id: randomUUID(),
        projectId: project.id,
        kind: 'error',
        title: '生成图片校验未通过',
        message,
        stage: 'verify',
        timestamp: new Date().toISOString(),
        method: 'assets/imagegen-required-failed',
      });
      throw new Error(message);
    }
    if (audioGenerationRequirement.state !== 'not-required') {
      const audioVerification = await imageGenerationAttestations.verifyAudio({
        projectId: project.id,
        root: project.root,
        assets,
      });
      if (!audioVerification.ok) {
        const detail = audioVerification.reason === 'missing-attestation'
          ? '没有宿主签发的 MiniMax 音乐生成证明'
          : audioVerification.reason === 'asset-mismatch'
            ? '当前音频文件的路径或 SHA-256 与宿主 MiniMax 生成证明不匹配'
            : '受信 MiniMax 音乐的完整资源路径没有出现在生产源码或构建产物中';
        const message = `强制 MiniMax 音乐校验失败：${detail}。任务不能标记为完成；请调用 noobi_audio_generate（purpose=music），保留宿主入库音频，并由游戏生产代码实际加载播放。`;
        emitAgentEvent({
          id: randomUUID(),
          projectId: project.id,
          kind: 'error',
          title: 'MiniMax 音乐校验未通过',
          message,
          stage: 'verify',
          timestamp: new Date().toISOString(),
          method: 'assets/minimax-music-required-failed',
        });
        throw new Error(message);
      }
    }
    await updateProject(project.id, {
      status: 'completed',
      stage: 'complete',
      threadId: result.threadId,
      activeTurnId: null,
      lastError: null,
    });
  } catch (error) {
    if (error instanceof GameHarnessStoppedError) return;
    await updateProject(project.id, {
      status: 'failed',
      activeTurnId: null,
      lastError: asError(error).message,
    }).catch(() => undefined);
  }
}

async function resolveHostImageGenerationRequirement(
  project: ProjectRecord,
): Promise<HostImageGenerationRequirement> {
  const assets = await assetStore.list(project.id, project.root);
  const verification = await verifyHostGeneratedImage(project, assets);
  if (verification.ok) {
    return {
      state: 'trusted-and-referenced',
      relativePath: verification.asset.relativePath,
    };
  }
  if (verification.reason === 'missing-production-reference') {
    return {
      state: 'trusted-reference-required',
      relativePaths: verification.candidatePaths,
    };
  }
  return { state: 'fresh-generation-required' };
}

async function resolveHostAudioGenerationRequirement(
  project: ProjectRecord,
  miniMaxMusicRequired: boolean,
): Promise<HostAudioGenerationRequirement> {
  if (!miniMaxMusicRequired) return { state: 'not-required' };
  const assets = await assetStore.list(project.id, project.root);
  const verification = await imageGenerationAttestations.verifyAudio({
    projectId: project.id,
    root: project.root,
    assets,
  });
  if (verification.ok) {
    return {
      state: 'trusted-and-referenced',
      relativePath: verification.asset.relativePath,
    };
  }
  if (verification.reason === 'missing-production-reference') {
    return {
      state: 'trusted-reference-required',
      relativePaths: verification.candidatePaths,
    };
  }
  return { state: 'fresh-generation-required' };
}

async function verifyHostGeneratedImage(
  project: ProjectRecord,
  assets: readonly GameAssetRecord[],
) {
  const codexHome = runtime.status.codexHome;
  if (codexHome) {
    await imageGenerationAttestations.bootstrapFromManagedOutputs({
      projectId: project.id,
      root: project.root,
      generatedImagesRoot: join(codexHome, 'generated_images'),
      assets,
    });
  }
  return imageGenerationAttestations.verify({
    projectId: project.id,
    root: project.root,
    assets,
  });
}

async function resolveImageGenerationSkill(): Promise<{ name: string; path: string } | null> {
  return resolveRequiredImageGenerationSkill(runtime, runtime.status);
}

async function ingestGeneratedImage(
  notification: { method: string; params?: unknown },
  projectId: string,
): Promise<void> {
  if (notification.method !== 'item/completed') return;
  const item = asRecord(asRecord(notification.params)?.item);
  if (item?.type !== 'imageGeneration' || readString(item.status) !== 'completed') return;
  const sourcePath = readString(item.savedPath);
  if (!sourcePath) return;

  const codexHome = runtime.status.codexHome;
  if (!codexHome) throw new Error('Codex image output arrived without a managed CODEX_HOME');
  const [canonicalHome, canonicalSource] = await Promise.all([
    realpath(codexHome),
    realpath(sourcePath),
  ]);
  const sourceRelative = relative(canonicalHome, canonicalSource);
  if (
    !sourceRelative
    || sourceRelative === '..'
    || sourceRelative.startsWith(`..${sep}`)
    || isAbsolute(sourceRelative)
  ) {
    throw new Error('Rejected an image output outside the managed Codex home');
  }

  const project = await projectStore.get(projectId);
  const asset = await assetStore.ingestGeneratedImage({
    projectId,
    root: project.root,
    sourcePath: canonicalSource,
    ...(readString(item.revisedPrompt) ? { prompt: readString(item.revisedPrompt)! } : {}),
    provider: 'codex-imagegen',
  });
  await imageGenerationAttestations.record({
    projectId,
    relativePath: asset.relativePath,
    sha256: asset.sha256,
    provider: 'codex-imagegen',
  });
  const assets = await assetStore.list(projectId, project.root);
  broadcast('noobi:event:assets', { projectId, assets });
  emitAgentEvent({
    id: randomUUID(),
    projectId,
    kind: 'file',
    title: '图片素材已保存',
    message: `${asset.name} 已加入项目素材库：${asset.relativePath}`,
    stage: 'assets',
    timestamp: new Date().toISOString(),
    method: 'assets/image-generated',
  });
}

async function updateProject(
  projectId: string,
  patch: Parameters<ProjectStore['update']>[1],
): Promise<ProjectRecord> {
  const project = await projectStore.update(projectId, patch);
  broadcast('noobi:event:project', project);
  return project;
}

function emitAgentEvent(event: AgentEvent): void {
  void eventLog.append(event).catch((error) => {
    if (process.env.NOOBI_DEBUG === '1') process.stderr.write(`[event-log] ${asError(error).message}\n`);
  });
  broadcast('noobi:event:agent', event);
}

function handle(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedRenderer(event);
    if (shuttingDown) throw new Error('Noobi.ai 正在退出');
    return listener(event, ...args);
  });
}

function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('Rejected IPC from an untrusted renderer');
  }
  const source = event.senderFrame.url;
  const expected = process.env.NOOBI_RENDERER_URL;
  if (expected ? !source.startsWith(expected) : !source.startsWith('file:')) {
    throw new Error('Rejected IPC from an unexpected origin');
  }
}

function broadcast(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

async function ensureSmokeProject(): Promise<void> {
  if (!smokeCapture || (await projectStore.list()).length > 0) return;
  const settings = await projectStore.getSettings();
  await projectStore.create({
    name: 'Signal Garden',
    idea: '操控信号采集器，在移动障碍中收集五个能量节点并完成一局可立即重玩的游戏。',
    parentDirectory: settings.defaultWorkspace,
    model: null,
  });
}

async function captureSmoke(window: BrowserWindow, target: string): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_500));
  const healthy = await window.webContents.executeJavaScript(
    `Boolean(document.querySelector('.app-shell')) && !document.querySelector('.loading-error')`,
    true,
  ) as boolean;
  if (!healthy) throw new Error('Renderer did not reach the Noobi workbench');
  const image = await window.webContents.capturePage();
  const output = resolve(target);
  await mkdir(dirname(output), { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(output, image.toPNG());
  process.stdout.write(`Noobi UI smoke captured ${output}\n`);
  app.quit();
}

async function shutdown(): Promise<void> {
  approvalBroker?.closeAll();
  const projects = projectStore ? await projectStore.list().catch(() => []) : [];
  const stopRuns = Promise.allSettled(projects.map((project) => harness.stop(project.id)));
  await Promise.race([stopRuns, delay(5_000)]);
  await Promise.allSettled([previews.stopAll(), runtime.stop()]);
  await Promise.race([Promise.allSettled([...backgroundRuns]), delay(2_000)]);
  await projectStore?.list().catch(() => undefined);
  await eventLog?.flush().catch(() => undefined);
}

async function recoverInterruptedProjects(): Promise<void> {
  const projects = await projectStore.list();
  await Promise.all(
    projects
      .filter((project) => project.status === 'running')
      .map((project) => projectStore.update(project.id, {
        status: 'stopped',
        activeTurnId: null,
        lastError: 'Noobi.ai 上次退出时，该任务没有确认完成。请检查文件后再继续。',
      })),
  );
}

function trackBackgroundRun(run: Promise<void>): void {
  backgroundRuns.add(run);
  const release = (): void => { backgroundRuns.delete(run); };
  void run.then(release, release);
}

function trackAssetIngestion(projectId: string, run: Promise<void>): void {
  const runs = assetIngestionRuns.get(projectId) ?? new Set<Promise<void>>();
  runs.add(run);
  assetIngestionRuns.set(projectId, runs);
  const release = (): void => {
    runs.delete(run);
    if (runs.size === 0) assetIngestionRuns.delete(projectId);
  };
  void run.then(release, release);
  trackBackgroundRun(run);
}

async function waitForAssetIngestions(projectId: string): Promise<void> {
  while (assetIngestionRuns.has(projectId)) {
    await Promise.allSettled([...(assetIngestionRuns.get(projectId) ?? [])]);
  }
}

function stageForHarnessState(event: GameHarnessStateEvent): PipelineStage {
  if (event.state === 'completed') return 'complete';
  if (event.phase === 'planner') return 'brief';
  if (event.phase === 'reviewer') return 'verify';
  return 'code';
}

function validateRunInput(value: RunProjectInput): void {
  if (!value || typeof value !== 'object') throw new Error('无效的执行参数');
  validateProjectId(value.projectId);
  if (typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 50_000) {
    throw new Error('制作指令必须为 1–50000 个字符');
  }
  if (value.model !== undefined && value.model !== null && typeof value.model !== 'string') {
    throw new Error('无效的模型');
  }
  if (value.targetFrameRate !== undefined && !isTargetFrameRate(value.targetFrameRate)) {
    throw new Error('目标帧率必须是 30、60 或 120 FPS');
  }
}

function validateProjectId(value: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/u.test(value)) {
    throw new Error('无效的项目 ID');
  }
  return value;
}

function validateSettingsPatch(value: Partial<AppSettings>): Partial<AppSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效的设置');
  const allowed = new Set(['defaultWorkspace', 'defaultModel', 'defaultEffort', 'theme']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`未知设置：${key}`);
  return value;
}

function defaultModel(models: Array<{ model: string; isDefault: boolean }>): string | null {
  return models.find((model) => model.isDefault)?.model ?? models[0]?.model ?? null;
}

function readRequestId(value: unknown): string | number | null {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
    ? value
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, milliseconds);
    timer.unref();
  });
}
