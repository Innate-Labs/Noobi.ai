import { spawn } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type {
  DependencyAction,
  DependencyActionInput,
  DependencyActionResult,
  DependencyInstallation,
  DependencyOutput,
  DesktopDependency,
  DesktopDependencyId,
} from '../shared/types.js';

export type DependencyOutputListener = (output: DependencyOutput) => void;

export interface CommandInvocation {
  executable: string;
  args: readonly string[];
  timeoutMs: number;
  launchDetached?: boolean;
}

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type CommandRunner = (
  invocation: CommandInvocation,
  onOutput?: DependencyOutputListener,
) => Promise<CommandResult>;

export interface ManagedCommandProcess {
  pid?: number;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: 'error', listener: (error: Error) => void): unknown;
  once(event: 'spawn', listener: () => void): unknown;
  once(event: 'close', listener: (exitCode: number | null) => void): unknown;
  unref(): void;
}

export interface CommandSpawnOptions {
  env: NodeJS.ProcessEnv;
  detached: boolean;
  shell: false;
  stdio: 'ignore' | ['ignore', 'pipe', 'pipe'];
  windowsHide: true;
}

export type CommandProcessSpawner = (
  executable: string,
  args: readonly string[],
  options: CommandSpawnOptions,
) => ManagedCommandProcess;

export type ProcessTreeTerminator = (processId: number) => Promise<void>;

export interface ProcessCommandRunnerOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  spawnProcess?: CommandProcessSpawner;
  terminateProcessTree?: ProcessTreeTerminator;
}

export interface DependencyManagerOptions {
  platform?: NodeJS.Platform;
  architecture?: NodeJS.Architecture;
  homeDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  fileExists?: (filePath: string) => Promise<boolean>;
  listDirectory?: (directory: string) => Promise<string[]>;
  readTextFile?: (filePath: string) => Promise<string>;
  runCommand?: CommandRunner;
  spawnProcess?: CommandProcessSpawner;
  terminateProcessTree?: ProcessTreeTerminator;
}

interface DependencyDefinition {
  id: DesktopDependencyId;
  name: string;
  description: string;
  management: DesktopDependency['management'];
}

interface BrewPackage {
  name: string;
  cask: boolean;
}

interface WingetPackage {
  id: string;
  scope: 'user' | 'machine';
}

const ACTION_TIMEOUT_MS = 30 * 60 * 1_000;
const VERSION_TIMEOUT_MS = 8_000;
const MAX_CAPTURE_CHARS = 512_000;
const WINDOWS_ARCHITECTURE = 'x64';
const WINGET_RECOVERY_DETAIL =
  '未检测到 WinGet；请通过 Microsoft App Installer 安装或修复 WinGet。';

const DEPENDENCIES: readonly DependencyDefinition[] = [
  {
    id: 'npx',
    name: 'Node.js / npx',
    description: '运行基于 npm 分发的 MCP Server 与游戏工具。',
    management: 'homebrew',
  },
  {
    id: 'uvx',
    name: 'Python / uvx',
    description: '隔离运行基于 Python 分发的 MCP Server。',
    management: 'homebrew',
  },
  {
    id: 'godot',
    name: 'Godot',
    description: '开源 2D / 3D 游戏引擎与编辑器。',
    management: 'homebrew',
  },
  {
    id: 'blender',
    name: 'Blender',
    description: '3D 建模、动画、材质与资产制作工具。',
    management: 'homebrew',
  },
  {
    id: 'unity-hub',
    name: 'Unity Hub',
    description: '管理 Unity Editor 版本、许可证与平台模块。',
    management: 'homebrew',
  },
  {
    id: 'unity-editor',
    name: 'Unity Editor',
    description: '由 Unity Hub 安装和更新的 Unity 编辑器。',
    management: 'unity-hub',
  },
] as const;

const DEPENDENCY_IDS = new Set<DesktopDependencyId>(
  DEPENDENCIES.map((dependency) => dependency.id),
);
const ACTIONS = new Set<DependencyAction>(['install', 'update', 'open']);

// The package identifier is never accepted from the renderer. This fixed map
// is the complete install/update allowlist for the desktop client.
const BREW_PACKAGES: Readonly<
  Record<Exclude<DesktopDependencyId, 'unity-editor'>, BrewPackage>
> = {
  npx: { name: 'node', cask: false },
  uvx: { name: 'uv', cask: false },
  godot: { name: 'godot', cask: true },
  blender: { name: 'blender', cask: true },
  'unity-hub': { name: 'unity-hub', cask: true },
};

const WINGET_PACKAGES: Readonly<
  Record<Exclude<DesktopDependencyId, 'unity-editor'>, WingetPackage>
> = {
  npx: { id: 'OpenJS.NodeJS.LTS', scope: 'machine' },
  uvx: { id: 'astral-sh.uv', scope: 'user' },
  godot: { id: 'GodotEngine.GodotEngine', scope: 'user' },
  blender: { id: 'BlenderFoundation.Blender', scope: 'machine' },
  'unity-hub': { id: 'Unity.UnityHub', scope: 'machine' },
};

export class DependencyManager {
  private readonly platform: NodeJS.Platform;
  private readonly architecture: NodeJS.Architecture;
  private readonly homeDirectory: string;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly fileExists: (filePath: string) => Promise<boolean>;
  private readonly listDirectory: (directory: string) => Promise<string[]>;
  private readonly readTextFile: (filePath: string) => Promise<string>;
  private readonly runCommand: CommandRunner;

  constructor(options: DependencyManagerOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.architecture = options.architecture ?? process.arch;
    this.homeDirectory = options.homeDirectory ?? homedir();
    this.environment = options.environment ?? process.env;
    this.fileExists = options.fileExists ?? defaultFileExists;
    this.listDirectory = options.listDirectory ?? defaultListDirectory;
    this.readTextFile = options.readTextFile ?? defaultReadTextFile;
    this.runCommand =
      options.runCommand ??
      createProcessCommandRunner({
        platform: this.platform,
        environment: this.environment,
        spawnProcess: options.spawnProcess,
        terminateProcessTree: options.terminateProcessTree,
      });
  }

  async inspectDependencies(): Promise<DesktopDependency[]> {
    if (this.platform === 'win32') {
      if (this.architecture !== WINDOWS_ARCHITECTURE) {
        return DEPENDENCIES.map((definition) => ({
          ...this.windowsDefinition(definition.id),
          status: 'unsupported',
          availableActions: [],
          detail: '当前版本仅支持 Windows 11 x64。',
        }));
      }
      return this.inspectWindowsDependencies();
    }

    if (this.platform !== 'darwin') {
      return DEPENDENCIES.map((definition) => ({
        ...definition,
        status: 'unsupported',
        availableActions: [],
        detail: '当前平台尚不支持桌面依赖管理。',
      }));
    }

    const brewPath = await this.findBrew();
    const unityHubPath = await this.findFirstExisting(
      this.unityHubCandidates(),
    );
    const npxCandidates = [
      ...this.commandCandidates('npx'),
      ...(await this.nvmNpxCandidates()),
    ];

    const [npx, uvx, godot, blender, unityHub, unityEditor] = await Promise.all(
      [
        this.inspectCommand('npx', npxCandidates, ['--version'], brewPath),
        this.inspectCommand(
          'uvx',
          this.commandCandidates('uvx'),
          ['--version'],
          brewPath,
        ),
        this.inspectCommand(
          'godot',
          this.godotCandidates(),
          ['--version'],
          brewPath,
        ),
        this.inspectCommand(
          'blender',
          this.blenderCandidates(),
          ['--version'],
          brewPath,
        ),
        this.inspectUnityHub(unityHubPath, brewPath),
        this.inspectUnityEditor(unityHubPath),
      ],
    );

    return [npx, uvx, godot, blender, unityHub, unityEditor];
  }

  private async inspectWindowsDependencies(): Promise<DesktopDependency[]> {
    const wingetPath = await this.findWinget();
    const unityHubPath = await this.findFirstExisting(
      this.windowsUnityHubCandidates(),
    );
    const npxPath = await this.findFirstExisting(this.windowsNpxCandidates());
    const blenderCandidates = await this.windowsBlenderCandidates();

    const [npx, uvx, godot, blender, unityHub, unityEditor] = await Promise.all(
      [
        this.inspectWindowsNpx(npxPath, wingetPath),
        this.inspectWindowsCommand(
          'uvx',
          this.windowsUvxCandidates(),
          ['--version'],
          wingetPath,
        ),
        this.inspectWindowsCommand(
          'godot',
          this.windowsGodotCandidates(),
          ['--version'],
          wingetPath,
        ),
        this.inspectWindowsCommand(
          'blender',
          blenderCandidates,
          ['--version'],
          wingetPath,
        ),
        this.inspectWindowsUnityHub(unityHubPath, wingetPath),
        this.inspectWindowsUnityEditor(unityHubPath),
      ],
    );

    return [npx, uvx, godot, blender, unityHub, unityEditor];
  }

  async runAction(
    input: DependencyActionInput,
    onOutput?: DependencyOutputListener,
  ): Promise<DependencyActionResult> {
    const id = this.validateDependencyId(input.id);
    const action = this.validateAction(input.action);
    if (this.platform !== 'darwin' && this.platform !== 'win32') {
      throw new Error('当前平台不支持依赖安装与更新。');
    }
    if (
      this.platform === 'win32' &&
      this.architecture !== WINDOWS_ARCHITECTURE
    ) {
      throw new Error('依赖安装与更新目前仅支持 Windows 11 x64。');
    }

    const plan =
      this.platform === 'win32'
        ? await this.windowsActionPlan(id, action)
        : await this.actionPlan(id, action);
    emitOutput(onOutput, {
      stream: 'system',
      text: `开始执行：${plan.displayCommand}\n`,
    });

    try {
      const result = await this.runCommand(plan.invocation, onOutput);
      const success = result.exitCode === 0 && !result.timedOut;
      const message = result.timedOut
        ? '操作超时，已停止对应进程。'
        : success
          ? plan.successMessage
          : `操作失败（退出码 ${result.exitCode ?? '未知'}）。`;
      emitOutput(onOutput, {
        stream: 'system',
        text: `${message}\n`,
      });
      return {
        id,
        action,
        success,
        message,
        command: plan.displayCommand,
        output: joinOutput(result.stdout, result.stderr),
        exitCode: result.exitCode,
        timedOut: result.timedOut,
      };
    } catch (error) {
      const message = `无法执行操作：${error instanceof Error ? error.message : String(error)}`;
      emitOutput(onOutput, { stream: 'system', text: `${message}\n` });
      return {
        id,
        action,
        success: false,
        message,
        command: plan.displayCommand,
        output: '',
        exitCode: null,
        timedOut: false,
      };
    }
  }

  private async inspectWindowsNpx(
    executable: string | undefined,
    wingetPath: string | undefined,
  ): Promise<DesktopDependency> {
    const installed = executable !== undefined;
    return {
      ...this.windowsDefinition('npx'),
      status: installed ? 'installed' : 'missing',
      path: executable,
      version: executable
        ? await this.readWindowsNpxVersion(executable)
        : undefined,
      availableActions: this.wingetActions(installed, wingetPath),
      detail: wingetPath ? undefined : WINGET_RECOVERY_DETAIL,
    };
  }

  private async inspectWindowsCommand(
    id: Exclude<DesktopDependencyId, 'npx' | 'unity-hub' | 'unity-editor'>,
    candidates: readonly string[],
    versionArgs: readonly string[],
    wingetPath: string | undefined,
  ): Promise<DesktopDependency> {
    const executable = await this.findFirstExisting(candidates);
    const installed = executable !== undefined;
    return {
      ...this.windowsDefinition(id),
      status: installed ? 'installed' : 'missing',
      path: executable,
      version: executable
        ? await this.readCommandVersion(executable, versionArgs)
        : undefined,
      availableActions: this.wingetActions(installed, wingetPath),
      detail: wingetPath ? undefined : WINGET_RECOVERY_DETAIL,
    };
  }

  private async inspectWindowsUnityHub(
    executable: string | undefined,
    wingetPath: string | undefined,
  ): Promise<DesktopDependency> {
    const installed = executable !== undefined;
    return {
      ...this.windowsDefinition('unity-hub'),
      status: installed ? 'installed' : 'missing',
      path: executable,
      version: executable
        ? await this.readCommandVersion(executable, ['--version'])
        : undefined,
      availableActions: installed
        ? [...this.wingetActions(true, wingetPath), 'open']
        : this.wingetActions(false, wingetPath),
      detail: wingetPath ? undefined : WINGET_RECOVERY_DETAIL,
    };
  }

  private async inspectWindowsUnityEditor(
    unityHubPath: string | undefined,
  ): Promise<DesktopDependency> {
    const installations: DependencyInstallation[] = [];
    const seen = new Set<string>();
    for (const editorRoot of this.windowsUnityEditorRoots()) {
      const versions = await this.safeListDirectory(editorRoot);
      for (const version of versions) {
        if (!isSafeVersionDirectory(version)) continue;
        const executable = path.win32.join(
          editorRoot,
          version,
          'Editor',
          'Unity.exe',
        );
        const normalized = executable.toLowerCase();
        if (seen.has(normalized) || !(await this.fileExists(executable)))
          continue;
        seen.add(normalized);
        installations.push({ version, path: executable });
      }
    }
    sortInstallations(installations);
    const primary = installations[0];
    return {
      ...this.windowsDefinition('unity-editor'),
      status: primary ? 'installed' : 'missing',
      path: primary?.path,
      version: primary?.version,
      installations,
      availableActions: unityHubPath ? ['open'] : [],
      detail: unityHubPath
        ? installations.length > 1
          ? `检测到 ${installations.length} 个版本；安装与更新请使用 Unity Hub。`
          : '安装、更新和平台模块由 Unity Hub 管理。'
        : '请先安装 Unity Hub，再通过 Hub 管理 Editor。',
    };
  }

  private async readWindowsNpxVersion(
    executable: string,
  ): Promise<string | undefined> {
    const installDirectory = path.win32.dirname(executable);
    const nodeExecutable = path.win32.join(installDirectory, 'node.exe');
    const npxCli = path.win32.join(
      installDirectory,
      'node_modules',
      'npm',
      'bin',
      'npx-cli.js',
    );
    if (
      (await this.fileExists(nodeExecutable)) &&
      (await this.fileExists(npxCli))
    ) {
      return this.readCommandVersion(nodeExecutable, [npxCli, '--version']);
    }
    // `.cmd` files cannot be executed safely with shell disabled. Detection is
    // still useful, but version probing is omitted unless the trusted Node entry
    // point beside the wrapper is available.
    return undefined;
  }

  private async inspectCommand(
    id: Exclude<DesktopDependencyId, 'unity-hub' | 'unity-editor'>,
    candidates: readonly string[],
    versionArgs: readonly string[],
    brewPath: string | undefined,
  ): Promise<DesktopDependency> {
    const definition = this.definition(id);
    const executable = await this.findFirstExisting(candidates);
    const installed = executable !== undefined;
    return {
      ...definition,
      status: installed ? 'installed' : 'missing',
      path: executable,
      version: executable
        ? await this.readCommandVersion(executable, versionArgs)
        : undefined,
      availableActions: this.brewActions(installed, brewPath),
      detail: !installed && !brewPath ? '需要先安装 Homebrew。' : undefined,
    };
  }

  private async inspectUnityHub(
    executable: string | undefined,
    brewPath: string | undefined,
  ): Promise<DesktopDependency> {
    const definition = this.definition('unity-hub');
    const installed = executable !== undefined;
    const bundlePath = executable ? appBundlePath(executable) : undefined;
    return {
      ...definition,
      status: installed ? 'installed' : 'missing',
      path: executable,
      version: bundlePath
        ? await this.readBundleVersion(bundlePath)
        : undefined,
      availableActions: installed
        ? [...this.brewActions(true, brewPath), 'open']
        : this.brewActions(false, brewPath),
      detail: !installed && !brewPath ? '需要先安装 Homebrew。' : undefined,
    };
  }

  private async inspectUnityEditor(
    unityHubPath: string | undefined,
  ): Promise<DesktopDependency> {
    const definition = this.definition('unity-editor');
    const editorRoot = '/Applications/Unity/Hub/Editor';
    const versions = await this.safeListDirectory(editorRoot);
    const installations: DependencyInstallation[] = [];
    for (const version of versions) {
      if (!isSafeVersionDirectory(version)) continue;
      const executable = path.posix.join(
        editorRoot,
        version,
        'Unity.app',
        'Contents',
        'MacOS',
        'Unity',
      );
      if (await this.fileExists(executable)) {
        installations.push({ version, path: executable });
      }
    }
    installations.sort((left, right) =>
      (right.version ?? '').localeCompare(left.version ?? '', undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    );
    const primary = installations[0];
    return {
      ...definition,
      status: primary ? 'installed' : 'missing',
      path: primary?.path,
      version: primary?.version,
      installations,
      availableActions: unityHubPath ? ['open'] : [],
      detail: unityHubPath
        ? installations.length > 1
          ? `检测到 ${installations.length} 个版本；安装与更新请使用 Unity Hub。`
          : '安装、更新和平台模块由 Unity Hub 管理。'
        : '请先安装 Unity Hub，再通过 Hub 管理 Editor。',
    };
  }

  private async actionPlan(
    id: DesktopDependencyId,
    action: DependencyAction,
  ): Promise<{
    invocation: CommandInvocation;
    displayCommand: string;
    successMessage: string;
  }> {
    if (action === 'open') {
      if (id !== 'unity-hub' && id !== 'unity-editor') {
        throw new Error(`依赖 ${id} 不支持打开操作。`);
      }
      const unityHubPath = await this.findFirstExisting(
        this.unityHubCandidates(),
      );
      if (!unityHubPath) throw new Error('未检测到 Unity Hub，请先安装。');
      const bundlePath = appBundlePath(unityHubPath);
      if (!bundlePath) throw new Error('Unity Hub 应用路径无效。');
      return {
        invocation: {
          executable: '/usr/bin/open',
          args: [bundlePath],
          timeoutMs: VERSION_TIMEOUT_MS,
        },
        displayCommand: `open ${quoteForDisplay(bundlePath)}`,
        successMessage: '已打开 Unity Hub。',
      };
    }

    if (id === 'unity-editor') {
      throw new Error('Unity Editor 只能通过 Unity Hub 安装和更新。');
    }
    const brewPath = await this.findBrew();
    if (!brewPath) {
      throw new Error('未检测到 Homebrew，无法执行安装或更新。');
    }
    const packageDefinition = BREW_PACKAGES[id];
    const verb = action === 'install' ? 'install' : 'upgrade';
    const args = packageDefinition.cask
      ? [verb, '--cask', packageDefinition.name]
      : [verb, packageDefinition.name];
    return {
      invocation: {
        executable: brewPath,
        args,
        timeoutMs: ACTION_TIMEOUT_MS,
      },
      displayCommand: `brew ${args.join(' ')}`,
      successMessage:
        action === 'install' ? '依赖安装完成。' : '依赖更新完成。',
    };
  }

  private async windowsActionPlan(
    id: DesktopDependencyId,
    action: DependencyAction,
  ): Promise<{
    invocation: CommandInvocation;
    displayCommand: string;
    successMessage: string;
  }> {
    if (action === 'open') {
      if (id !== 'unity-hub' && id !== 'unity-editor') {
        throw new Error(`依赖 ${id} 不支持打开操作。`);
      }
      const unityHubPath = await this.findFirstExisting(
        this.windowsUnityHubCandidates(),
      );
      if (!unityHubPath) throw new Error('未检测到 Unity Hub，请先安装。');
      return {
        invocation: {
          executable: unityHubPath,
          args: [],
          timeoutMs: VERSION_TIMEOUT_MS,
          launchDetached: true,
        },
        displayCommand: quoteForDisplay(unityHubPath),
        successMessage: '已打开 Unity Hub。',
      };
    }

    if (id === 'unity-editor') {
      throw new Error('Unity Editor 只能通过 Unity Hub 安装和更新。');
    }
    const wingetPath = await this.findWinget();
    if (!wingetPath) {
      throw new Error(
        '未检测到 WinGet，无法执行安装或更新；请先安装或修复 Microsoft App Installer。',
      );
    }
    const packageDefinition = WINGET_PACKAGES[id];
    const verb = action === 'install' ? 'install' : 'upgrade';
    const args = [
      verb,
      '--id',
      packageDefinition.id,
      '--exact',
      '--source',
      'winget',
      '--scope',
      packageDefinition.scope,
      '--architecture',
      WINDOWS_ARCHITECTURE,
      '--silent',
      ...(action === 'install' ? ['--no-upgrade'] : []),
      '--accept-source-agreements',
      '--accept-package-agreements',
      '--disable-interactivity',
    ];
    return {
      invocation: {
        executable: wingetPath,
        args,
        timeoutMs: ACTION_TIMEOUT_MS,
      },
      displayCommand: `winget ${args.join(' ')}`,
      successMessage:
        action === 'install' ? '依赖安装完成。' : '依赖更新完成。',
    };
  }

  private brewActions(
    installed: boolean,
    brewPath: string | undefined,
  ): DependencyAction[] {
    if (!brewPath) return [];
    return installed ? ['update'] : ['install'];
  }

  private wingetActions(
    installed: boolean,
    wingetPath: string | undefined,
  ): DependencyAction[] {
    if (!wingetPath) return [];
    return installed ? ['update'] : ['install'];
  }

  private async readCommandVersion(
    executable: string,
    args: readonly string[],
  ): Promise<string | undefined> {
    try {
      const result = await this.runCommand({
        executable,
        args,
        timeoutMs: VERSION_TIMEOUT_MS,
      });
      return firstUsefulLine(result.stdout || result.stderr);
    } catch {
      return undefined;
    }
  }

  private async readBundleVersion(
    bundlePath: string,
  ): Promise<string | undefined> {
    try {
      const plist = await this.readTextFile(
        path.posix.join(bundlePath, 'Contents', 'Info.plist'),
      );
      return (
        plistValue(plist, 'CFBundleShortVersionString') ??
        plistValue(plist, 'CFBundleVersion')
      );
    } catch {
      return undefined;
    }
  }

  private async findBrew(): Promise<string | undefined> {
    return this.findFirstExisting([
      '/opt/homebrew/bin/brew',
      '/usr/local/bin/brew',
    ]);
  }

  private async findWinget(): Promise<string | undefined> {
    const localAppData = this.windowsLocalAppData();
    return this.findFirstExisting([
      path.win32.join(localAppData, 'Microsoft', 'WindowsApps', 'winget.exe'),
    ]);
  }

  private async findFirstExisting(
    candidates: readonly string[],
  ): Promise<string | undefined> {
    for (const candidate of candidates) {
      if (await this.fileExists(candidate)) return candidate;
    }
    return undefined;
  }

  private commandCandidates(command: 'npx' | 'uvx'): string[] {
    const shared = [
      `/opt/homebrew/bin/${command}`,
      `/usr/local/bin/${command}`,
      `/usr/bin/${command}`,
      path.posix.join(this.homeDirectory, '.local', 'bin', command),
      path.posix.join(this.homeDirectory, '.volta', 'bin', command),
    ];
    if (command === 'uvx') {
      shared.push(
        path.posix.join(this.homeDirectory, '.cargo', 'bin', command),
      );
    }
    return shared;
  }

  private async nvmNpxCandidates(): Promise<string[]> {
    const root = path.posix.join(
      this.homeDirectory,
      '.nvm',
      'versions',
      'node',
    );
    const versions = await this.safeListDirectory(root);
    return versions
      .filter(isSafeVersionDirectory)
      .sort((left, right) =>
        right.localeCompare(left, undefined, { numeric: true }),
      )
      .map((version) => path.posix.join(root, version, 'bin', 'npx'));
  }

  private godotCandidates(): string[] {
    return [
      '/Applications/Godot.app/Contents/MacOS/Godot',
      path.posix.join(
        this.homeDirectory,
        'Applications',
        'Godot.app',
        'Contents',
        'MacOS',
        'Godot',
      ),
      '/opt/homebrew/bin/godot',
      '/usr/local/bin/godot',
    ];
  }

  private blenderCandidates(): string[] {
    return [
      '/Applications/Blender.app/Contents/MacOS/Blender',
      path.posix.join(
        this.homeDirectory,
        'Applications',
        'Blender.app',
        'Contents',
        'MacOS',
        'Blender',
      ),
      '/opt/homebrew/bin/blender',
      '/usr/local/bin/blender',
    ];
  }

  private unityHubCandidates(): string[] {
    return [
      '/Applications/Unity Hub.app/Contents/MacOS/Unity Hub',
      path.posix.join(
        this.homeDirectory,
        'Applications',
        'Unity Hub.app',
        'Contents',
        'MacOS',
        'Unity Hub',
      ),
    ];
  }

  private windowsNpxCandidates(): string[] {
    const candidates = this.windowsProgramFilesRoots().map((root) =>
      path.win32.join(root, 'nodejs', 'npx.cmd'),
    );
    const nvmSymlink = this.environmentValue('NVM_SYMLINK');
    if (nvmSymlink) candidates.push(path.win32.join(nvmSymlink, 'npx.cmd'));
    candidates.push(
      path.win32.join(
        this.windowsLocalAppData(),
        'Programs',
        'nodejs',
        'npx.cmd',
      ),
      path.win32.join(this.windowsAppData(), 'npm', 'npx.cmd'),
    );
    return uniqueWindowsPaths(candidates);
  }

  private windowsUvxCandidates(): string[] {
    const localAppData = this.windowsLocalAppData();
    return uniqueWindowsPaths([
      path.win32.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'uvx.exe'),
      path.win32.join(localAppData, 'Programs', 'uv', 'uvx.exe'),
      path.win32.join(this.homeDirectory, '.local', 'bin', 'uvx.exe'),
      path.win32.join(this.homeDirectory, '.cargo', 'bin', 'uvx.exe'),
    ]);
  }

  private windowsGodotCandidates(): string[] {
    const localAppData = this.windowsLocalAppData();
    return uniqueWindowsPaths([
      path.win32.join(
        localAppData,
        'Microsoft',
        'WinGet',
        'Links',
        'godot.exe',
      ),
      path.win32.join(localAppData, 'Programs', 'Godot', 'Godot.exe'),
      ...this.windowsProgramFilesRoots().map((root) =>
        path.win32.join(root, 'Godot', 'Godot.exe'),
      ),
    ]);
  }

  private async windowsBlenderCandidates(): Promise<string[]> {
    const candidates: string[] = [];
    for (const programFiles of this.windowsProgramFilesRoots()) {
      const blenderRoot = path.win32.join(programFiles, 'Blender Foundation');
      candidates.push(path.win32.join(blenderRoot, 'Blender', 'blender.exe'));
      for (const directory of await this.safeListDirectory(blenderRoot)) {
        if (!isSafeWindowsDirectoryName(directory)) continue;
        candidates.push(path.win32.join(blenderRoot, directory, 'blender.exe'));
      }
    }
    candidates.push(
      path.win32.join(
        this.windowsLocalAppData(),
        'Programs',
        'Blender Foundation',
        'Blender',
        'blender.exe',
      ),
    );
    return uniqueWindowsPaths(candidates);
  }

  private windowsUnityHubCandidates(): string[] {
    return uniqueWindowsPaths([
      ...this.windowsProgramFilesRoots().map((root) =>
        path.win32.join(root, 'Unity Hub', 'Unity Hub.exe'),
      ),
      path.win32.join(
        this.windowsLocalAppData(),
        'Programs',
        'Unity Hub',
        'Unity Hub.exe',
      ),
    ]);
  }

  private windowsUnityEditorRoots(): string[] {
    return uniqueWindowsPaths(
      this.windowsProgramFilesRoots().map((root) =>
        path.win32.join(root, 'Unity', 'Hub', 'Editor'),
      ),
    );
  }

  private windowsProgramFilesRoots(): string[] {
    return uniqueWindowsPaths(
      [
        this.environmentValue('ProgramW6432'),
        this.environmentValue('ProgramFiles'),
        this.environmentValue('ProgramFiles(x86)'),
        String.raw`C:\Program Files`,
      ].filter((value): value is string => Boolean(value)),
    );
  }

  private windowsLocalAppData(): string {
    return (
      this.environmentValue('LOCALAPPDATA') ??
      path.win32.join(this.homeDirectory, 'AppData', 'Local')
    );
  }

  private windowsAppData(): string {
    return (
      this.environmentValue('APPDATA') ??
      path.win32.join(this.homeDirectory, 'AppData', 'Roaming')
    );
  }

  private environmentValue(name: string): string | undefined {
    const target = name.toLowerCase();
    for (const [key, value] of Object.entries(this.environment)) {
      if (key.toLowerCase() === target && value?.trim()) return value.trim();
    }
    return undefined;
  }

  private async safeListDirectory(directory: string): Promise<string[]> {
    try {
      return await this.listDirectory(directory);
    } catch {
      return [];
    }
  }

  private definition(id: DesktopDependencyId): DependencyDefinition {
    const definition = DEPENDENCIES.find((entry) => entry.id === id);
    if (!definition) throw new Error(`未知依赖：${id}`);
    return definition;
  }

  private windowsDefinition(id: DesktopDependencyId): DependencyDefinition {
    return {
      ...this.definition(id),
      management: id === 'unity-editor' ? 'unity-hub' : 'winget',
    };
  }

  private validateDependencyId(value: string): DesktopDependencyId {
    if (!DEPENDENCY_IDS.has(value as DesktopDependencyId)) {
      throw new Error('依赖标识不在允许列表中。');
    }
    return value as DesktopDependencyId;
  }

  private validateAction(value: string): DependencyAction {
    if (!ACTIONS.has(value as DependencyAction)) {
      throw new Error('依赖操作不在允许列表中。');
    }
    return value as DependencyAction;
  }
}

export function createProcessCommandRunner(
  options: ProcessCommandRunnerOptions = {},
): CommandRunner {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const spawnProcess = options.spawnProcess ?? defaultSpawnProcess;
  const terminateProcessTree =
    options.terminateProcessTree ??
    ((processId: number) =>
      terminateWindowsProcessTree(processId, environment));

  return (
    invocation: CommandInvocation,
    onOutput?: DependencyOutputListener,
  ): Promise<CommandResult> =>
    new Promise((resolve, reject) => {
      const launchDetached = invocation.launchDetached === true;
      const child = spawnProcess(invocation.executable, invocation.args, {
        env: environment,
        detached: launchDetached,
        shell: false,
        stdio: launchDetached ? 'ignore' : ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      if (launchDetached) {
        let settled = false;
        child.once('error', (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
        child.once('spawn', () => {
          if (settled) return;
          settled = true;
          child.unref();
          resolve({
            exitCode: 0,
            stdout: '',
            stderr: '',
            timedOut: false,
          });
        });
        return;
      }
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;
      const timer = setTimeout(() => {
        timedOut = true;
        if (platform === 'win32' && child.pid) {
          void terminateProcessTree(child.pid).catch(() => {
            child.kill('SIGKILL');
          });
        } else {
          child.kill(platform === 'win32' ? 'SIGKILL' : 'SIGTERM');
        }
      }, invocation.timeoutMs);

      child.stdout?.on('data', (chunk: Buffer | string) => {
        const text = String(chunk);
        stdout = appendCaptured(stdout, text);
        emitOutput(onOutput, { stream: 'stdout', text });
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        const text = String(chunk);
        stderr = appendCaptured(stderr, text);
        emitOutput(onOutput, { stream: 'stderr', text });
      });
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode, stdout, stderr, timedOut });
      });
    });
}

const defaultSpawnProcess: CommandProcessSpawner = (
  executable,
  args,
  options,
) =>
  spawn(executable, [...args], {
    env: options.env,
    detached: options.detached,
    shell: false,
    stdio: options.stdio,
    windowsHide: true,
  });

async function terminateWindowsProcessTree(
  processId: number,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const systemRoot =
    environmentEntry(environment, 'SystemRoot') ?? String.raw`C:\Windows`;
  const taskkill = path.win32.join(systemRoot, 'System32', 'taskkill.exe');
  await new Promise<void>((resolve, reject) => {
    const killer = spawn(taskkill, ['/pid', String(processId), '/t', '/f'], {
      env: environment,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.once('error', reject);
    killer.once('close', (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`taskkill 退出码：${exitCode ?? '未知'}`));
    });
  });
}

async function defaultFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function defaultListDirectory(directory: string): Promise<string[]> {
  return readdir(directory);
}

async function defaultReadTextFile(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8');
}

function appBundlePath(executable: string): string | undefined {
  const marker = '/Contents/MacOS/';
  const markerIndex = executable.indexOf(marker);
  return markerIndex >= 0 ? executable.slice(0, markerIndex) : undefined;
}

function plistValue(plist: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = plist.match(
    new RegExp(
      `<key>\\s*${escaped}\\s*</key>\\s*<string>([^<]+)</string>`,
      'i',
    ),
  );
  return match?.[1]?.trim() || undefined;
}

function firstUsefulLine(output: string): string | undefined {
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);
  return line ? line.slice(0, 160) : undefined;
}

function isSafeVersionDirectory(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 80 &&
    /^[a-z\d][a-z\d._+-]*$/i.test(value)
  );
}

function isSafeWindowsDirectoryName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 120 &&
    value !== '.' &&
    value !== '..' &&
    !/[<>:"/\\|?*]/.test(value) &&
    !/\p{Cc}/u.test(value) &&
    !/[. ]$/.test(value)
  );
}

function sortInstallations(installations: DependencyInstallation[]): void {
  installations.sort((left, right) =>
    (right.version ?? '').localeCompare(left.version ?? '', undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );
}

function uniqueWindowsPaths(candidates: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed) unique.set(trimmed.toLowerCase(), trimmed);
  }
  return [...unique.values()];
}

function environmentEntry(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(environment)) {
    if (key.toLowerCase() === target && value?.trim()) return value.trim();
  }
  return undefined;
}

function appendCaptured(current: string, chunk: string): string {
  if (current.length >= MAX_CAPTURE_CHARS) return current;
  return (current + chunk).slice(0, MAX_CAPTURE_CHARS);
}

function joinOutput(stdout: string, stderr: string): string {
  if (!stdout) return stderr;
  if (!stderr) return stdout;
  return `${stdout}${stdout.endsWith('\n') ? '' : '\n'}${stderr}`;
}

function quoteForDisplay(value: string): string {
  return value.includes(' ') ? `"${value.replaceAll('"', '\\"')}"` : value;
}

function emitOutput(
  listener: DependencyOutputListener | undefined,
  output: DependencyOutput,
): void {
  try {
    listener?.(output);
  } catch {
    // Renderer-side logging must never interrupt a dependency action.
  }
}
