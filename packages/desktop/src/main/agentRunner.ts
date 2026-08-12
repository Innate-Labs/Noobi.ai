import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import path from 'node:path';
import type {
  AgentEvent,
  AppSettings,
  McpServerDefinition,
  PipelineStageId,
  ProjectRecord,
  StartAgentInput,
} from '../shared/types.js';
import type { ProjectManager } from './projectManager.js';
import type { StateStore } from './store.js';
import {
  RunLivenessHarness,
  runLivenessPolicyFromEnv,
} from './runLivenessHarness.js';
import {
  collectMcpSecrets,
  toRuntimeMcpServers,
  type RuntimeMcpServerConfig,
} from './mcpConfig.js';
import { usageFromRuntimeResult, type ApiUsageInput } from './apiUsageStore.js';

const MAX_EVENT_TEXT = 12_000;
const MAX_STDERR_TEXT = 4_000;
const DEFAULT_ASSET_IDLE_TIMEOUT_MS = 12 * 60_000;

export interface AssetProgressSnapshot {
  available: boolean;
  fileCount: number;
  latestMtimeMs: number;
}

export function inspectAssetProgress(
  projectPath: string,
  outputDirName = path.join('public', 'assets'),
): AssetProgressSnapshot {
  const assetsDir = path.join(projectPath, outputDirName);
  try {
    let fileCount = 0;
    let latestMtimeMs = 0;
    let available = true;
    for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.endsWith('.tmp')) continue;
      try {
        const info = statSync(path.join(assetsDir, entry.name));
        fileCount += 1;
        latestMtimeMs = Math.max(latestMtimeMs, info.mtimeMs);
      } catch {
        // A file can be atomically replaced between readdir and stat. Mark the
        // snapshot unreliable so the monitor preserves its previous baseline.
        available = false;
      }
    }
    return { available, fileCount, latestMtimeMs };
  } catch {
    return { available: false, fileCount: 0, latestMtimeMs: 0 };
  }
}

export interface PendingToolCall {
  id: string;
  name: string;
  outputDirName?: string;
}

/** Tracks tool calls in runtime execution order and completes them by ID. */
export class PendingToolTracker {
  private readonly calls: PendingToolCall[] = [];
  private anonymousSequence = 0;

  add(name: string, id?: string, outputDirName?: string): PendingToolCall {
    const normalizedId = id?.trim();
    const call: PendingToolCall = {
      id: normalizedId || `anonymous:${++this.anonymousSequence}`,
      name,
      outputDirName,
    };
    const existingIndex = this.calls.findIndex(
      (candidate) => candidate.id === call.id,
    );
    if (existingIndex >= 0) this.calls[existingIndex] = call;
    else this.calls.push(call);
    return call;
  }

  complete(id?: string): PendingToolCall | undefined {
    const normalizedId = id?.trim();
    if (!normalizedId) return this.calls.shift();
    const index = this.calls.findIndex(
      (candidate) => candidate.id === normalizedId,
    );
    if (index < 0) return undefined;
    return this.calls.splice(index, 1)[0];
  }

  current(): PendingToolCall | undefined {
    return this.calls[0];
  }

  clear(): void {
    this.calls.length = 0;
  }
}

export function assetIdleTimeoutFromEnv(env: NodeJS.ProcessEnv): number {
  const candidate = Number(env['GAMEAGENT_ASSET_IDLE_TIMEOUT_MS']);
  if (!Number.isFinite(candidate)) return DEFAULT_ASSET_IDLE_TIMEOUT_MS;
  return Math.min(30 * 60_000, Math.max(4 * 60_000, Math.trunc(candidate)));
}

interface RuntimeLocation {
  command: string;
  prefixArgs: string[];
  extraEnv?: Record<string, string>;
  ready: boolean;
  message: string;
}

interface RunnerOptions {
  repoRoot: string;
  packagedRuntimePath?: string;
  store: StateStore;
  projects: ProjectManager;
  emitEvent: (event: AgentEvent) => void;
  emitProject: (project: ProjectRecord) => void;
  recordApiUsage?: (input: ApiUsageInput) => Promise<void>;
}

interface RuntimeContentBlock {
  id?: string;
  tool_use_id?: string;
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
}

interface RuntimeOutputMessage {
  session_id?: string;
  type?: string;
  event?: {
    delta?: {
      type?: string;
      text?: string;
      thinking?: string;
    };
  };
  message?: {
    content?: RuntimeContentBlock[];
  };
  is_error?: boolean;
  error?: { message?: string };
  result?: string;
  num_turns?: number;
}

const TOOL_STAGE: Array<[RegExp, PipelineStageId, string]> = [
  [/todo|plan/i, 'brief', '拆解制作任务'],
  [/classify.game.type|game.type.classifier/i, 'classify', '识别游戏类型'],
  [/copy.template|scaffold/i, 'scaffold', '搭建项目骨架'],
  [/generate.gdd/i, 'gdd', '生成游戏设计文档'],
  [/generate.game.assets|generate.assets/i, 'assets', '生成游戏素材'],
  [/generate.tilemap/i, 'tilemap', '生成地图'],
  [/write.file|replace|edit|smart.edit/i, 'code', '编写游戏代码'],
  [/shell|run.*command|test|build/i, 'verify', '构建与验证'],
];

export class AgentRunner {
  private active: {
    projectId: string;
    child: ChildProcess;
    stoppedByUser: boolean;
    timedOut: boolean;
    liveness: RunLivenessHarness;
    monitor: NodeJS.Timeout | null;
    providerLabel: string;
    provider: string;
    model: string;
    pendingTools: PendingToolTracker;
    assetProgress?: {
      toolId: string;
      outputDirName: string;
      snapshot: AssetProgressSnapshot;
    };
  } | null = null;
  private startingProjectId: string | null = null;
  private activeSecrets: string[] = [];
  private readonly assetIdleTimeoutMs = assetIdleTimeoutFromEnv(process.env);

  constructor(private readonly options: RunnerOptions) {}

  inspectRuntime(): RuntimeLocation {
    const packaged = this.options.packagedRuntimePath;
    if (packaged) {
      const runtimeRoot = path.dirname(packaged);
      const requiredFiles = [
        packaged,
        path.join(runtimeRoot, 'node_modules', 'tiktoken', 'package.json'),
        path.join(
          runtimeRoot,
          'node_modules',
          '@imgly',
          'background-removal-node',
          'package.json',
        ),
        path.join(runtimeRoot, 'node_modules', 'sharp', 'package.json'),
      ];
      const missing = requiredFiles.filter((file) => !existsSync(file));
      return {
        command: process.execPath,
        prefixArgs: [packaged],
        extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
        ready: missing.length === 0,
        message:
          missing.length === 0
            ? '使用应用内置 Agent Runtime'
            : `内置 Agent Runtime 不完整：缺少 ${path.relative(runtimeRoot, missing[0])}`,
      };
    }

    const bundledCli = path.join(this.options.repoRoot, 'dist', 'cli.js');
    if (existsSync(bundledCli)) {
      return {
        command: process.env['npm_node_execpath'] || 'node',
        prefixArgs: [bundledCli],
        ready: true,
        message: 'Agent Runtime 已构建',
      };
    }

    const tsxCli = path.join(
      this.options.repoRoot,
      'node_modules',
      'tsx',
      'dist',
      'cli.mjs',
    );
    const sourceCli = path.join(
      this.options.repoRoot,
      'packages',
      'cli',
      'index.ts',
    );
    if (existsSync(tsxCli) && existsSync(sourceCli)) {
      return {
        command: process.env['npm_node_execpath'] || 'node',
        prefixArgs: [tsxCli, sourceCli],
        ready: true,
        message: '使用 TypeScript 开发 Runtime',
      };
    }

    return {
      command: '',
      prefixArgs: [],
      ready: false,
      message:
        'Agent Runtime 尚未构建，请先在项目根目录运行 npm install && npm run build。',
    };
  }

  async start(input: StartAgentInput): Promise<{ accepted: boolean }> {
    if (this.active || this.startingProjectId) {
      throw new Error('已有 Agent 任务正在启动或运行，请先停止。');
    }
    this.startingProjectId = input.projectId;

    let runningProject: ProjectRecord | undefined;
    try {
      const project = this.options.store.getProject(input.projectId);
      if (!project) throw new Error('项目不存在。');

      const prompt = input.prompt.trim();
      if (!prompt) throw new Error('提示词不能为空。');
      if (input.resume && !project.sessionId) {
        throw new Error('当前项目没有可恢复的会话，请创建新会话。');
      }

      const settings = this.options.store.getRuntimeSettings();
      const mcpServers = this.options.store.getRuntimeMcpServers();
      if (!settings.main.apiKey) {
        throw new Error('请先在模型设置中填写或重新保存主 Agent API Key。');
      }
      if (!settings.main.baseUrl || !settings.main.model) {
        throw new Error('主 Agent 的 Base URL 和模型名称不能为空。');
      }
      if (settings.permissionMode !== 'yolo') {
        throw new Error('完整游戏工作流需要“完整自动化”执行权限。');
      }

      const runtime = this.inspectRuntime();
      if (!runtime.ready) throw new Error(runtime.message);
      await this.options.projects.prepareSystemPrompt(project.path);

      const args = [
        ...runtime.prefixArgs,
        '--output-format',
        'stream-json',
        '--include-partial-messages',
        '--approval-mode',
        'yolo',
        '--auth-type',
        'openai',
        '--chat-recording',
        '--experimental-skills',
        '--model',
        settings.main.model,
      ];

      if (input.resume) args.push('--resume', project.sessionId!);

      runningProject = {
        ...project,
        prompt,
        status: 'running',
        stage: input.resume ? project.stage : 'brief',
        updatedAt: new Date().toISOString(),
      };
      await this.updateProject(runningProject);

      const env = this.buildEnvironment(runtime.extraEnv);
      const child = spawn(runtime.command, args, {
        cwd: project.path,
        env,
        stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true,
      });
      const providerLabel = settings.main.baseUrl
        .toLowerCase()
        .includes('api.deepseek.com')
        ? 'DeepSeek'
        : '模型';
      const liveness = new RunLivenessHarness(
        runLivenessPolicyFromEnv(process.env),
      );
      this.active = {
        projectId: project.id,
        child,
        stoppedByUser: false,
        timedOut: false,
        liveness,
        monitor: null,
        providerLabel,
        provider: settings.main.provider,
        model: settings.main.model,
        pendingTools: new PendingToolTracker(),
      };
      this.active.monitor = setInterval(
        () => this.monitorActiveRun(project.id, child),
        15_000,
      );
      this.active.monitor.unref();
      this.activeSecrets = collectSecrets(settings, mcpServers);

      let parseChain: Promise<void> = Promise.resolve();
      const queue = (task: () => Promise<void>) => {
        parseChain = parseChain.then(task).catch((error: unknown) => {
          const latest =
            this.options.store.getProject(project.id) ?? runningProject!;
          this.emit(
            latest,
            'error',
            '事件处理失败',
            error instanceof Error ? error.message : String(error),
            undefined,
            true,
          );
        });
      };

      const stdout = createInterface({
        input: child.stdout!,
        crlfDelay: Infinity,
      });
      stdout.on('line', (line) => {
        queue(() => this.handleStdoutLine(runningProject!, line));
      });

      child.stderr?.on('data', (chunk: Buffer | string) => {
        const message = String(chunk).trim();
        if (!message) return;
        const currentTool =
          this.active?.child === child
            ? this.active.pendingTools.current()
            : undefined;
        // Provider polling logs are not proof that an asset request is making
        // progress. Asset runs use structured output and real file changes.
        if (
          this.active?.child === child &&
          !isGenerateAssetsTool(currentTool?.name)
        ) {
          this.active.liveness.touch();
        }
        this.emit(
          this.options.store.getProject(project.id) ?? runningProject!,
          'stderr',
          'Runtime 日志',
          truncate(message, MAX_STDERR_TEXT),
        );
      });

      child.stdin?.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EPIPE') return;
        this.emit(
          this.options.store.getProject(project.id) ?? runningProject!,
          'stderr',
          '输入流异常',
          error.message,
        );
      });

      const credentialPipe = child.stdio[3] as NodeJS.WritableStream | null;
      credentialPipe?.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EPIPE') return;
        this.emit(
          this.options.store.getProject(project.id) ?? runningProject!,
          'stderr',
          '凭据通道异常',
          error.message,
        );
      });

      child.once('error', (error) => {
        queue(async () => {
          const latest =
            this.options.store.getProject(project.id) ?? runningProject!;
          this.emit(
            latest,
            'error',
            '启动失败',
            error.message,
            undefined,
            true,
          );
          await this.finishProject(latest, 'failed');
        });
      });

      child.once('close', (code) => {
        void (async () => {
          stdout.close();
          await parseChain;
          const active = this.active?.child === child ? this.active : null;
          if (active?.monitor) clearInterval(active.monitor);
          if (active) this.active = null;
          const latest =
            this.options.store.getProject(project.id) ?? runningProject!;
          if (active?.stoppedByUser) {
            this.emit(
              latest,
              'lifecycle',
              '任务已停止',
              'Agent 已由用户停止。',
            );
            await this.finishProject(latest, 'stopped');
          } else if (active?.timedOut) {
            await this.finishProject(latest, 'failed');
          } else if (code !== 0 && latest.status !== 'failed') {
            this.emit(
              latest,
              'error',
              'Runtime 异常退出',
              `Agent 进程退出码：${code ?? 'unknown'}`,
              undefined,
              true,
            );
            await this.finishProject(latest, 'failed');
          } else if (latest.status === 'running') {
            await this.finishProject(latest, 'completed');
          }
          this.activeSecrets = [];
        })().catch((error: unknown) => {
          console.error('[GameAgent] Failed to finalize Agent process:', error);
        });
      });

      if (!credentialPipe) {
        await terminateProcessTree(child, true).catch((error: unknown) => {
          console.error(
            '[Noobi.ai] Failed to stop rejected Agent process:',
            error,
          );
        });
        throw new Error('无法创建 Agent 凭据通道。');
      }
      credentialPipe.end(
        JSON.stringify(buildCredentialPayload(settings, mcpServers)),
      );
      child.stdin?.end(prompt);
      this.emit(runningProject, 'user', '用户指令', prompt);
      this.emit(
        runningProject,
        'lifecycle',
        `${providerLabel} Harness 已启动`,
        '正在理解你的游戏创意；长请求会报告等待状态，无输出超时会自动停止并允许恢复。',
      );
      return { accepted: true };
    } catch (error) {
      if (runningProject && !this.active) {
        this.emit(
          runningProject,
          'error',
          '启动失败',
          error instanceof Error ? error.message : String(error),
          undefined,
          true,
        );
        await this.finishProject(runningProject, 'failed');
      }
      throw error;
    } finally {
      this.startingProjectId = null;
    }
  }

  async stop(projectId: string): Promise<void> {
    if (!this.active || this.active.projectId !== projectId) return;
    this.active.stoppedByUser = true;
    const child = this.active.child;
    await terminateProcessTreeWithEscalation(child);
  }

  async shutdown(): Promise<void> {
    const active = this.active;
    if (!active) return;
    await this.stop(active.projectId);
  }

  private monitorActiveRun(projectId: string, child: ChildProcess): void {
    const active = this.active;
    if (!active || active.projectId !== projectId || active.child !== child)
      return;
    const latest = this.options.store.getProject(projectId);
    if (!latest) return;
    this.syncAssetProgress(latest);
    const currentTool = active.pendingTools.current();
    const generatingAssets = isGenerateAssetsTool(currentTool?.name);

    if (generatingAssets && active.assetProgress) {
      const progress = inspectAssetProgress(
        latest.path,
        active.assetProgress.outputDirName,
      );
      const previous = active.assetProgress.snapshot;
      if (progress.available) active.assetProgress.snapshot = progress;
      if (
        progress.available &&
        (progress.fileCount > previous.fileCount ||
          progress.latestMtimeMs > previous.latestMtimeMs)
      ) {
        active.liveness.touch();
        this.emit(
          latest,
          'lifecycle',
          '素材生成进行中',
          `检测到新的素材文件，当前目录共 ${progress.fileCount} 个文件；Noobi.ai 将自动复用已有文件并继续补齐缺失项。`,
          currentTool?.name,
        );
      }
    }

    const state = active.liveness.inspect(
      Date.now(),
      generatingAssets ? this.assetIdleTimeoutMs : undefined,
    );

    if (state.kind === 'notice') {
      this.emit(
        latest,
        'lifecycle',
        generatingAssets
          ? '素材工具仍在处理'
          : `${active.providerLabel} 仍在处理`,
        generatingAssets
          ? `已连续 ${formatDuration(state.idleMs)} 没有检测到新的素材文件或工具输出；Noobi.ai 正在监控，素材阶段最长空闲 ${formatDuration(this.assetIdleTimeoutMs)}。`
          : `已连续 ${formatDuration(state.idleMs)} 没有收到新输出；Harness 正在监控，达到硬超时会自动结束本轮。`,
      );
      return;
    }

    if (state.kind !== 'timeout' || active.timedOut) return;
    active.timedOut = true;
    if (active.monitor) {
      clearInterval(active.monitor);
      active.monitor = null;
    }
    this.emit(
      latest,
      'error',
      generatingAssets
        ? '素材工具无进度超时'
        : `${active.providerLabel} Harness 无输出超时`,
      generatingAssets
        ? `连续 ${formatDuration(state.idleMs)} 没有检测到新的素材文件或工具输出。本轮已停止；已有素材和会话 ID 均已保留，继续时只会补齐缺失项。`
        : `连续 ${formatDuration(state.idleMs)} 没有收到模型或工具输出。本轮已停止，项目文件和会话 ID 均已保留，可直接继续执行。`,
      undefined,
      true,
    );
    void terminateProcessTreeWithEscalation(child).catch((error: unknown) => {
      console.error(
        '[Noobi.ai] Failed to stop timed-out Agent process:',
        error,
      );
    });
  }

  private async handleStdoutLine(
    project: ProjectRecord,
    line: string,
  ): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message: RuntimeOutputMessage;
    try {
      message = JSON.parse(trimmed) as RuntimeOutputMessage;
    } catch {
      this.emit(
        project,
        'lifecycle',
        'Runtime 输出',
        truncate(trimmed, MAX_EVENT_TEXT),
      );
      return;
    }

    if (this.active?.projectId === project.id) {
      this.active.liveness.touch();
    }

    const latest = this.options.store.getProject(project.id) ?? project;
    if (
      typeof message.session_id === 'string' &&
      message.session_id !== latest.sessionId
    ) {
      await this.updateProject({
        ...latest,
        sessionId: message.session_id,
        updatedAt: new Date().toISOString(),
      });
    }

    if (message.type === 'stream_event') {
      const delta = message.event?.delta;
      if (delta?.type === 'text_delta' && delta.text) {
        this.emit(
          latest,
          'text_delta',
          'Agent',
          truncate(String(delta.text), 2000),
        );
      } else if (delta?.type === 'thinking_delta' && delta.thinking) {
        this.emit(
          latest,
          'thought',
          '思考中',
          truncate(String(delta.thinking), 2000),
        );
      }
      return;
    }

    if (message.type === 'assistant') {
      for (const block of message.message?.content ?? []) {
        if (block.type === 'text' && block.text?.trim()) {
          this.emit(
            latest,
            'assistant',
            'Agent 回复',
            truncate(block.text, MAX_EVENT_TEXT),
          );
        } else if (block.type === 'thinking' && block.thinking?.trim()) {
          this.emit(
            latest,
            'thought',
            'Agent 思考',
            truncate(block.thinking, MAX_EVENT_TEXT),
          );
        } else if (block.type === 'tool_use') {
          await this.handleToolCall(latest, block);
        }
      }
      return;
    }

    if (message.type === 'user' && Array.isArray(message.message?.content)) {
      for (const block of message.message.content) {
        if (block.type !== 'tool_result') continue;
        let completedTool: PendingToolCall | undefined;
        if (this.active?.projectId === latest.id) {
          completedTool = this.active.pendingTools.complete(block.tool_use_id);
          this.syncAssetProgress(latest);
        }
        const text = summarizeToolResult(block.content);
        this.emit(
          latest,
          'tool_result',
          block.is_error ? '工具执行失败' : '工具执行完成',
          text,
          completedTool?.name,
          Boolean(block.is_error),
        );
      }
      return;
    }

    if (message.type === 'result') {
      const active =
        this.active?.projectId === latest.id ? this.active : undefined;
      if (active && this.options.recordApiUsage) {
        const usage = usageFromRuntimeResult(message, {
          provider: active.provider,
          model: active.model,
          slot: 'main',
          projectId: latest.id,
        });
        if (usage) {
          try {
            await this.options.recordApiUsage(usage);
          } catch (error) {
            console.error('[Noobi.ai] Failed to persist API usage:', error);
          }
        }
      }
      if (this.active?.projectId === latest.id) {
        this.active.pendingTools.clear();
        this.active.assetProgress = undefined;
      }
      if (isRuntimeFailure(message)) {
        const errorText =
          message.error?.message || message.result || 'Agent 执行失败';
        this.emit(
          latest,
          'error',
          '生成失败',
          truncate(String(errorText), MAX_EVENT_TEXT),
          undefined,
          true,
        );
        await this.finishProject(latest, 'failed');
      } else {
        const summary =
          message.result || `完成 ${message.num_turns ?? 0} 轮 Agent 执行`;
        this.emit(
          latest,
          'complete',
          '游戏生成完成',
          truncate(String(summary), MAX_EVENT_TEXT),
        );
        await this.finishProject(latest, 'completed');
      }
    }
  }

  private async handleToolCall(
    project: ProjectRecord,
    block: RuntimeContentBlock,
  ): Promise<void> {
    const toolName = String(block.name ?? 'unknown');
    if (this.active?.projectId === project.id) {
      this.active.pendingTools.add(
        toolName,
        block.id,
        isGenerateAssetsTool(toolName)
          ? assetOutputDirFromInput(block.input)
          : undefined,
      );
      this.syncAssetProgress(project);
    }
    const matched = TOOL_STAGE.find(([pattern]) => pattern.test(toolName));
    const stage = matched?.[1] ?? project.stage;
    const title = matched?.[2] ?? '调用工具';
    const updated: ProjectRecord = {
      ...project,
      stage,
      updatedAt: new Date().toISOString(),
    };
    await this.updateProject(updated);
    this.emit(
      updated,
      'tool_call',
      title,
      compactToolInput(block.input),
      toolName,
    );
  }

  private syncAssetProgress(project: ProjectRecord): void {
    const active = this.active;
    if (!active || active.projectId !== project.id) return;
    const currentTool = active.pendingTools.current();
    if (!currentTool || !isGenerateAssetsTool(currentTool.name)) {
      active.assetProgress = undefined;
      return;
    }

    const outputDirName =
      currentTool.outputDirName || path.join('public', 'assets');
    if (
      active.assetProgress?.toolId === currentTool.id &&
      active.assetProgress.outputDirName === outputDirName
    ) {
      return;
    }
    active.assetProgress = {
      toolId: currentTool.id,
      outputDirName,
      snapshot: inspectAssetProgress(project.path, outputDirName),
    };
  }

  private buildEnvironment(
    extraEnv?: Record<string, string>,
  ): NodeJS.ProcessEnv {
    const { templatesDir, docsDir } = this.options.projects.locationsInfo;
    const env: NodeJS.ProcessEnv = {
      ...getSanitizedRuntimeEnvironment(),
      ...extraEnv,
      NO_COLOR: '1',
      NO_BROWSER: '1',
      QWEN_SYSTEM_MD: '1',
      QWEN_CODE_NO_RELAUNCH: 'true',
      GAMEAGENT_CREDENTIAL_FD: '3',
      NODE_OPTIONS: withHeapLimit(process.env['NODE_OPTIONS']),
      GAME_TEMPLATES_DIR: templatesDir,
      GAME_DOCS_DIR: docsDir,
      // Keep one provider attempt shorter than the outer liveness watchdog so
      // the runtime can surface a recoverable API error instead of appearing
      // frozen for the SDK default timeout/retry window.
      MODEL_REQUEST_TIMEOUT: '180000',
      MODEL_MAX_RETRIES: '1',
    };

    return env;
  }

  private emit(
    project: ProjectRecord,
    type: AgentEvent['type'],
    title: string,
    message: string,
    toolName?: string,
    isError = false,
  ): void {
    const safeMessage = redactSensitiveText(message, this.activeSecrets);
    this.options.emitEvent({
      id: randomUUID(),
      projectId: project.id,
      type,
      stage: project.stage,
      title,
      message: truncate(safeMessage, MAX_EVENT_TEXT),
      toolName,
      isError,
      timestamp: new Date().toISOString(),
    });
  }

  private async finishProject(
    project: ProjectRecord,
    status: ProjectRecord['status'],
  ): Promise<void> {
    const latest = this.options.store.getProject(project.id) ?? project;
    const finished: ProjectRecord = {
      ...latest,
      status,
      stage: status === 'completed' ? 'complete' : latest.stage,
      updatedAt: new Date().toISOString(),
    };
    await this.updateProject(finished);
  }

  private async updateProject(project: ProjectRecord): Promise<void> {
    await this.options.store.upsertProject(project);
    this.options.emitProject(project);
  }
}

export function isRuntimeFailure(
  message: Pick<RuntimeOutputMessage, 'is_error' | 'error' | 'result'>,
): boolean {
  if (message.is_error || message.error?.message) return true;
  return /^\s*\[(?:API|Auth(?:entication)?|Network|Model|Provider) Error\b/i.test(
    message.result ?? '',
  );
}

interface RuntimeProviderCredential {
  provider: AppSettings['main']['provider'];
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface DesktopCredentialPayload {
  main: RuntimeProviderCredential;
  providers: {
    reasoning?: RuntimeProviderCredential;
    image?: RuntimeProviderCredential;
    video?: RuntimeProviderCredential;
    audio?: RuntimeProviderCredential;
  };
  mcpServers: Record<string, RuntimeMcpServerConfig>;
}

export function buildCredentialPayload(
  settings: AppSettings,
  mcpServers: McpServerDefinition[] = [],
): DesktopCredentialPayload {
  const toProvider = (
    endpoint: AppSettings['main'],
    fallback?: AppSettings['main'],
  ) => {
    const compatibleFallback =
      fallback?.provider === endpoint.provider ? fallback : undefined;
    const apiKey = endpoint.apiKey || compatibleFallback?.apiKey;
    if (!apiKey) return undefined;
    return {
      provider: endpoint.provider,
      apiKey,
      baseUrl: endpoint.baseUrl || compatibleFallback?.baseUrl || '',
      model: endpoint.model || compatibleFallback?.model || '',
    };
  };

  const reasoning = toProvider(settings.reasoning, settings.main);
  const audioFallback = settings.reasoning.apiKey
    ? settings.reasoning
    : settings.main;
  return {
    main: {
      provider: settings.main.provider,
      apiKey: settings.main.apiKey,
      baseUrl: settings.main.baseUrl,
      model: settings.main.model,
    },
    providers: {
      reasoning,
      image: toProvider(settings.image),
      video: toProvider(settings.video, settings.image),
      audio: toProvider(settings.audio, audioFallback),
    },
    mcpServers: toRuntimeMcpServers(mcpServers),
  };
}

function compactToolInput(input: unknown): string {
  if (!input || typeof input !== 'object')
    return input ? String(input) : '无参数';
  const compact = JSON.stringify(
    input,
    (key, value) => {
      if (/api.?key|token|secret|authorization/i.test(key)) return '[已隐藏]';
      if (key === 'content' && typeof value === 'string')
        return `[文件内容：${value.length} 字符]`;
      if (typeof value === 'string' && value.length > 800)
        return `${value.slice(0, 800)}…`;
      return value;
    },
    2,
  );
  return truncate(compact, 3000);
}

function summarizeToolResult(content: unknown): string {
  if (typeof content === 'string') return truncate(content, 5000);
  if (Array.isArray(content)) {
    return truncate(
      content
        .map((item) =>
          item && typeof item === 'object' && 'text' in item
            ? String((item as { text: unknown }).text)
            : JSON.stringify(item),
        )
        .join('\n'),
      5000,
    );
  }
  return truncate(JSON.stringify(content ?? '工具未返回文本'), 5000);
}

function truncate(value: string, limit: number): string {
  return value.length > limit
    ? `${value.slice(0, limit)}\n…[已截断 ${value.length - limit} 字符]`
    : value;
}

function isGenerateAssetsTool(toolName?: string): boolean {
  return Boolean(
    toolName && /generate[._]?(?:game[._]?)?assets/i.test(toolName),
  );
}

export function assetOutputDirFromInput(input: unknown): string {
  if (input && typeof input === 'object') {
    const candidate = (input as Record<string, unknown>)['output_dir_name'];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return path.join('public', 'assets');
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

function withHeapLimit(existing?: string): string {
  if (existing?.includes('--max-old-space-size')) return existing;
  return [existing, '--max-old-space-size=12288'].filter(Boolean).join(' ');
}

function getSanitizedRuntimeEnvironment(): NodeJS.ProcessEnv {
  return sanitizeRuntimeEnvironment(process.env);
}

export function sanitizeRuntimeEnvironment(
  source: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  userHome: string = homedir(),
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  let existingPath: string | undefined;
  const sensitiveName =
    /(^|_)(API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTH|AUTHORIZATION|CREDENTIALS?)($|_)/i;
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const isPathKey =
      platform === 'win32' ? name.toLowerCase() === 'path' : name === 'PATH';
    if (isPathKey) {
      existingPath ??= value;
      continue;
    }
    if (!sensitiveName.test(name)) result[name] = value;
  }
  result.PATH = withDesktopToolPaths(existingPath, platform, source, userHome);
  return result;
}

export function withDesktopToolPaths(
  existingPath?: string,
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  userHome: string = homedir(),
): string {
  const delimiter = platform === 'win32' ? ';' : ':';
  const preferred =
    platform === 'win32'
      ? windowsToolPaths(environment, userHome)
      : [
          '/opt/homebrew/bin',
          '/usr/local/bin',
          path.posix.join(userHome, '.local', 'bin'),
          path.posix.join(userHome, '.cargo', 'bin'),
          path.posix.join(userHome, '.volta', 'bin'),
          '/usr/bin',
          '/bin',
          '/usr/sbin',
          '/sbin',
        ];
  const entries = [...preferred, ...(existingPath?.split(delimiter) ?? [])]
    .map((entry) => entry.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return entries
    .filter((entry) => {
      const key = platform === 'win32' ? entry.toLowerCase() : entry;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(delimiter);
}

function windowsToolPaths(
  environment: NodeJS.ProcessEnv,
  userHome: string,
): string[] {
  const localAppData = environment['LOCALAPPDATA'];
  const roamingAppData = environment['APPDATA'];
  const programFiles =
    environment['ProgramFiles'] ?? environment['PROGRAMFILES'];
  return [
    localAppData &&
      path.win32.join(localAppData, 'Microsoft', 'WinGet', 'Links'),
    roamingAppData && path.win32.join(roamingAppData, 'npm'),
    programFiles && path.win32.join(programFiles, 'nodejs'),
    programFiles && path.win32.join(programFiles, 'WinGet', 'Links'),
    path.win32.join(userHome, '.local', 'bin'),
    path.win32.join(userHome, '.cargo', 'bin'),
    path.win32.join(userHome, '.volta', 'bin'),
  ].filter((entry): entry is string => Boolean(entry));
}

function collectSecrets(
  settings: AppSettings,
  mcpServers: McpServerDefinition[] = [],
): string[] {
  return [
    settings.main.apiKey,
    settings.reasoning.apiKey,
    settings.image.apiKey,
    settings.video.apiKey,
    settings.audio.apiKey,
    ...collectMcpSecrets(mcpServers),
  ].filter((value): value is string => Boolean(value && value.length >= 8));
}

function redactSensitiveText(value: string, secrets: string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    redacted = redacted.split(secret).join('[已隐藏密钥]');
  }
  return redacted
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [已隐藏密钥]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[已隐藏密钥]');
}

export interface ProcessTreeTerminationOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  spawnCommand?: (
    executable: string,
    args: readonly string[],
    options: {
      stdio: 'ignore';
      windowsHide: true;
      shell: false;
    },
  ) => {
    once(event: 'error', listener: (error: Error) => void): unknown;
    once(event: 'close', listener: (exitCode: number | null) => void): unknown;
  };
}

export async function terminateProcessTree(
  child: ChildProcess,
  force: boolean,
  options: ProcessTreeTerminationOptions = {},
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  const platform = options.platform ?? process.platform;
  if (platform === 'win32') {
    if (!child.pid) {
      if (!child.kill(force ? 'SIGKILL' : 'SIGTERM')) {
        throw new Error('Agent 进程没有可用 PID，且直接终止失败。');
      }
      return;
    }
    const args = ['/pid', String(child.pid), '/t'];
    if (force) args.push('/f');
    const environment = options.environment ?? process.env;
    const systemRoot =
      environmentValueCaseInsensitive(environment, 'SystemRoot') ??
      String.raw`C:\Windows`;
    const taskkill = path.win32.join(systemRoot, 'System32', 'taskkill.exe');
    const spawnCommand =
      options.spawnCommand ??
      ((executable, commandArgs, spawnOptions) =>
        spawn(executable, [...commandArgs], spawnOptions));
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const killer = spawnCommand(taskkill, args, {
          stdio: 'ignore',
          windowsHide: true,
          shell: false,
        });
        killer.once('error', (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
        killer.once('close', (exitCode) => {
          if (settled) return;
          settled = true;
          if (exitCode === 0) resolve();
          else reject(new Error(`taskkill 退出码：${exitCode ?? '未知'}`));
        });
      });
      return;
    } catch (error) {
      child.kill(force ? 'SIGKILL' : 'SIGTERM');
      throw new Error(
        `无法确认 Windows Agent 进程树已终止：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  try {
    if (child.pid) process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
    else if (!child.kill(force ? 'SIGKILL' : 'SIGTERM')) {
      throw new Error('直接终止 Agent 进程失败。');
    }
  } catch {
    if (!child.kill(force ? 'SIGKILL' : 'SIGTERM')) {
      throw new Error('无法终止 Agent 进程。');
    }
  }
}

async function terminateProcessTreeWithEscalation(
  child: ChildProcess,
): Promise<void> {
  await terminateProcessTree(child, false);
  if (await waitForChildExit(child, 5_000)) return;
  await terminateProcessTree(child, true);
  if (await waitForChildExit(child, 1_500)) return;
  throw new Error('Agent 进程树在强制终止后仍未退出。');
}

async function waitForChildExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const onClose = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    };
    child.once('close', onClose);
    if (child.exitCode !== null || child.signalCode !== null) {
      child.off('close', onClose);
      settled = true;
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.off('close', onClose);
      resolve(false);
    }, timeoutMs);
    timer.unref();
  });
}

function environmentValueCaseInsensitive(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(environment)) {
    if (key.toLowerCase() === target && value?.trim()) return value.trim();
  }
  return undefined;
}
