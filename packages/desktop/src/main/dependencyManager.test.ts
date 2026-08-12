import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  createProcessCommandRunner,
  DependencyManager,
  type CommandInvocation,
  type CommandProcessSpawner,
  type CommandResult,
  type CommandRunner,
  type DependencyManagerOptions,
  type ManagedCommandProcess,
} from './dependencyManager.js';
import type { DesktopDependency } from '../shared/types.js';

const HOME = '/Users/tester';
const BREW = '/opt/homebrew/bin/brew';
const UNITY_HUB = '/Applications/Unity Hub.app/Contents/MacOS/Unity Hub';
const WIN_HOME = String.raw`C:\Users\测试 User`;
const LOCAL_APP_DATA = String.raw`C:\Users\测试 User\AppData\Local`;
const PROGRAM_FILES = String.raw`C:\Program Files`;
const WINGET = String.raw`C:\Users\测试 User\AppData\Local\Microsoft\WindowsApps\winget.exe`;
const WIN_NPX = String.raw`C:\Program Files\nodejs\npx.cmd`;
const WIN_NODE = String.raw`C:\Program Files\nodejs\node.exe`;
const WIN_NPX_CLI = String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js`;
const WIN_UVX = String.raw`C:\Users\测试 User\AppData\Local\Microsoft\WinGet\Links\uvx.exe`;
const WIN_GODOT = String.raw`C:\Users\测试 User\AppData\Local\Microsoft\WinGet\Links\godot.exe`;
const WIN_BLENDER_ROOT = String.raw`C:\Program Files\Blender Foundation`;
const WIN_BLENDER = String.raw`C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`;
const WIN_UNITY_HUB = String.raw`C:\Program Files\Unity Hub\Unity Hub.exe`;
const WIN_UNITY_EDITOR_ROOT = String.raw`C:\Program Files\Unity\Hub\Editor`;

describe('DependencyManager inspection', () => {
  it('detects command tools, app bundles, and all Unity Editor installations', async () => {
    const existing = new Set([
      BREW,
      '/opt/homebrew/bin/npx',
      `${HOME}/.local/bin/uvx`,
      '/Applications/Godot.app/Contents/MacOS/Godot',
      UNITY_HUB,
      '/Applications/Unity/Hub/Editor/2022.3.50f1/Unity.app/Contents/MacOS/Unity',
      '/Applications/Unity/Hub/Editor/6000.1.2f1/Unity.app/Contents/MacOS/Unity',
    ]);
    const runCommand: CommandRunner = async ({ executable }) =>
      commandResult(
        executable.endsWith('/npx')
          ? '10.8.2\n'
          : executable.endsWith('/uvx')
            ? 'uvx 0.8.8\n'
            : executable.endsWith('/Godot')
              ? '4.7.1.stable.official\n'
              : '',
      );
    const manager = new DependencyManager({
      platform: 'darwin',
      homeDirectory: HOME,
      fileExists: async (filePath) => existing.has(filePath),
      listDirectory: async (directory) => {
        if (directory === '/Applications/Unity/Hub/Editor') {
          return ['2022.3.50f1', '6000.1.2f1', '../unsafe'];
        }
        return [];
      },
      readTextFile: async () =>
        '<plist><dict><key>CFBundleShortVersionString</key><string>3.19.5</string></dict></plist>',
      runCommand,
    });

    const dependencies = await manager.inspectDependencies();

    expect(find(dependencies, 'npx')).toMatchObject({
      status: 'installed',
      path: '/opt/homebrew/bin/npx',
      version: '10.8.2',
      availableActions: ['update'],
    });
    expect(find(dependencies, 'uvx')).toMatchObject({
      status: 'installed',
      path: `${HOME}/.local/bin/uvx`,
      version: 'uvx 0.8.8',
    });
    expect(find(dependencies, 'godot')).toMatchObject({
      status: 'installed',
      version: '4.7.1.stable.official',
    });
    expect(find(dependencies, 'blender')).toMatchObject({
      status: 'missing',
      availableActions: ['install'],
    });
    expect(find(dependencies, 'unity-hub')).toMatchObject({
      status: 'installed',
      version: '3.19.5',
      availableActions: ['update', 'open'],
    });
    expect(find(dependencies, 'unity-editor')).toMatchObject({
      status: 'installed',
      version: '6000.1.2f1',
      availableActions: ['open'],
      installations: [
        {
          version: '6000.1.2f1',
          path: '/Applications/Unity/Hub/Editor/6000.1.2f1/Unity.app/Contents/MacOS/Unity',
        },
        {
          version: '2022.3.50f1',
          path: '/Applications/Unity/Hub/Editor/2022.3.50f1/Unity.app/Contents/MacOS/Unity',
        },
      ],
    });
  });

  it('does not advertise install actions when Homebrew is absent', async () => {
    const manager = new DependencyManager({
      platform: 'darwin',
      homeDirectory: HOME,
      fileExists: async () => false,
      listDirectory: async () => [],
      runCommand: async () => commandResult(''),
    });

    const dependencies = await manager.inspectDependencies();

    expect(find(dependencies, 'godot')).toMatchObject({
      status: 'missing',
      availableActions: [],
      detail: '需要先安装 Homebrew。',
    });
    expect(find(dependencies, 'unity-editor')).toMatchObject({
      status: 'missing',
      availableActions: [],
    });
  });

  it('detects Windows commands, engine applications, and every Unity Editor version', async () => {
    const editor2022 = String.raw`C:\Program Files\Unity\Hub\Editor\2022.3.50f1\Editor\Unity.exe`;
    const editor6000 = String.raw`C:\Program Files\Unity\Hub\Editor\6000.1.2f1\Editor\Unity.exe`;
    const existing = new Set([
      WINGET,
      WIN_NPX,
      WIN_NODE,
      WIN_NPX_CLI,
      WIN_UVX,
      WIN_GODOT,
      WIN_BLENDER,
      WIN_UNITY_HUB,
      editor2022,
      editor6000,
    ]);
    const invocations: CommandInvocation[] = [];
    const manager = new DependencyManager({
      platform: 'win32',
      architecture: 'x64',
      homeDirectory: WIN_HOME,
      environment: {
        LOCALAPPDATA: LOCAL_APP_DATA,
        ProgramFiles: PROGRAM_FILES,
      },
      fileExists: async (filePath) => existing.has(filePath),
      listDirectory: async (directory) => {
        if (directory === WIN_BLENDER_ROOT) {
          return ['Blender 4.5', '..', 'unsafe\\name'];
        }
        if (directory === WIN_UNITY_EDITOR_ROOT) {
          return ['2022.3.50f1', '6000.1.2f1', '../unsafe'];
        }
        return [];
      },
      runCommand: async (invocation) => {
        invocations.push(invocation);
        if (invocation.executable === WIN_NODE)
          return commandResult('10.9.2\r\n');
        if (invocation.executable === WIN_UVX)
          return commandResult('uvx 0.8.8\r\n');
        if (invocation.executable === WIN_GODOT) {
          return commandResult('4.5.stable.official\r\n');
        }
        if (invocation.executable === WIN_BLENDER) {
          return commandResult('Blender 4.5.0\r\n');
        }
        if (invocation.executable === WIN_UNITY_HUB) {
          return commandResult('Unity Hub 3.12.1\r\n');
        }
        return commandResult('');
      },
    });

    const dependencies = await manager.inspectDependencies();

    expect(find(dependencies, 'npx')).toMatchObject({
      management: 'winget',
      status: 'installed',
      path: WIN_NPX,
      version: '10.9.2',
      availableActions: ['update'],
    });
    expect(invocations).toContainEqual({
      executable: WIN_NODE,
      args: [WIN_NPX_CLI, '--version'],
      timeoutMs: 8_000,
    });
    expect(invocations).not.toContainEqual(
      expect.objectContaining({ executable: WIN_NPX }),
    );
    expect(find(dependencies, 'uvx')).toMatchObject({
      management: 'winget',
      status: 'installed',
      path: WIN_UVX,
      version: 'uvx 0.8.8',
    });
    expect(find(dependencies, 'godot')).toMatchObject({
      management: 'winget',
      status: 'installed',
      path: WIN_GODOT,
      version: '4.5.stable.official',
    });
    expect(find(dependencies, 'blender')).toMatchObject({
      management: 'winget',
      status: 'installed',
      path: WIN_BLENDER,
      version: 'Blender 4.5.0',
    });
    expect(find(dependencies, 'unity-hub')).toMatchObject({
      management: 'winget',
      status: 'installed',
      path: WIN_UNITY_HUB,
      version: 'Unity Hub 3.12.1',
      availableActions: ['update', 'open'],
    });
    expect(find(dependencies, 'unity-editor')).toMatchObject({
      management: 'unity-hub',
      status: 'installed',
      version: '6000.1.2f1',
      availableActions: ['open'],
      installations: [
        { version: '6000.1.2f1', path: editor6000 },
        { version: '2022.3.50f1', path: editor2022 },
      ],
    });
  });

  it('keeps Windows dependency statuses usable but offers only recovery guidance without WinGet', async () => {
    const manager = windowsManager({
      fileExists: async () => false,
      runCommand: async () => commandResult(''),
    });

    const dependencies = await manager.inspectDependencies();

    expect(dependencies).toHaveLength(6);
    expect(
      dependencies.every((dependency) => dependency.status === 'missing'),
    ).toBe(true);
    expect(
      dependencies.every(
        (dependency) => dependency.availableActions.length === 0,
      ),
    ).toBe(true);
    expect(find(dependencies, 'godot').detail).toContain(
      'Microsoft App Installer',
    );
    await expect(
      manager.runAction({ id: 'godot', action: 'install' }),
    ).rejects.toThrow('WinGet');
  });

  it('reports Linux dependencies as unsupported', async () => {
    const manager = new DependencyManager({ platform: 'linux' });
    const dependencies = await manager.inspectDependencies();

    expect(dependencies).toHaveLength(6);
    expect(
      dependencies.every((dependency) => dependency.status === 'unsupported'),
    ).toBe(true);
    expect(
      dependencies.every(
        (dependency) => dependency.availableActions.length === 0,
      ),
    ).toBe(true);
  });
});

describe('DependencyManager action allowlist', () => {
  it('maps a Godot install to one exact Homebrew executable and argument list', async () => {
    const invocations: CommandInvocation[] = [];
    const runCommand: CommandRunner = async (invocation, onOutput) => {
      invocations.push(invocation);
      onOutput?.({ stream: 'stdout', text: 'installed\n' });
      return commandResult('installed\n');
    };
    const manager = actionManager(runCommand);
    const output = vi.fn();

    const result = await manager.runAction(
      { id: 'godot', action: 'install' },
      output,
    );

    expect(invocations).toEqual([
      {
        executable: BREW,
        args: ['install', '--cask', 'godot'],
        timeoutMs: 1_800_000,
      },
    ]);
    expect(result).toMatchObject({
      id: 'godot',
      action: 'install',
      success: true,
      command: 'brew install --cask godot',
    });
    expect(output).toHaveBeenCalledWith({
      stream: 'stdout',
      text: 'installed\n',
    });
  });

  it('uses fixed formula names for npx and uvx updates', async () => {
    const invocations: CommandInvocation[] = [];
    const manager = actionManager(async (invocation) => {
      invocations.push(invocation);
      return commandResult('updated\n');
    });

    await manager.runAction({ id: 'npx', action: 'update' });
    await manager.runAction({ id: 'uvx', action: 'update' });

    expect(
      invocations.map(({ executable, args }) => ({ executable, args })),
    ).toEqual([
      { executable: BREW, args: ['upgrade', 'node'] },
      { executable: BREW, args: ['upgrade', 'uv'] },
    ]);
  });

  it('maps every supported Windows install and update to an exact WinGet allowlist', async () => {
    const invocations: CommandInvocation[] = [];
    const manager = windowsManager({
      fileExists: async (filePath) => filePath === WINGET,
      runCommand: async (invocation) => {
        invocations.push(invocation);
        return commandResult('done\r\n');
      },
    });

    for (const id of ['npx', 'uvx', 'godot', 'blender', 'unity-hub'] as const) {
      await manager.runAction({ id, action: 'install' });
      await manager.runAction({ id, action: 'update' });
    }

    const expected = [
      ['npx', 'OpenJS.NodeJS.LTS', 'machine'],
      ['uvx', 'astral-sh.uv', 'user'],
      ['godot', 'GodotEngine.GodotEngine', 'user'],
      ['blender', 'BlenderFoundation.Blender', 'machine'],
      ['unity-hub', 'Unity.UnityHub', 'machine'],
    ] as const;
    expect(invocations).toHaveLength(expected.length * 2);
    expected.forEach(([, packageId, scope], index) => {
      expect(invocations[index * 2]).toEqual({
        executable: WINGET,
        args: wingetArgs('install', packageId, scope),
        timeoutMs: 1_800_000,
      });
      expect(invocations[index * 2 + 1]).toEqual({
        executable: WINGET,
        args: wingetArgs('upgrade', packageId, scope),
        timeoutMs: 1_800_000,
      });
    });
  });

  it('opens Windows Unity management only through the verified Hub executable', async () => {
    const invocations: CommandInvocation[] = [];
    const manager = windowsManager({
      fileExists: async (filePath) =>
        filePath === WINGET || filePath === WIN_UNITY_HUB,
      runCommand: async (invocation) => {
        invocations.push(invocation);
        return commandResult('');
      },
    });

    await manager.runAction({ id: 'unity-hub', action: 'open' });
    await manager.runAction({ id: 'unity-editor', action: 'open' });

    expect(invocations).toEqual([
      {
        executable: WIN_UNITY_HUB,
        args: [],
        timeoutMs: 8_000,
        launchDetached: true,
      },
      {
        executable: WIN_UNITY_HUB,
        args: [],
        timeoutMs: 8_000,
        launchDetached: true,
      },
    ]);
    await expect(
      manager.runAction({ id: 'unity-editor', action: 'install' }),
    ).rejects.toThrow('只能通过 Unity Hub');
    await expect(
      manager.runAction({ id: 'unity-editor', action: 'update' }),
    ).rejects.toThrow('只能通过 Unity Hub');
    expect(invocations).toHaveLength(2);
  });

  it('rejects Windows renderer injection before looking up or spawning WinGet', async () => {
    const runCommand = vi.fn(async () => commandResult(''));
    const fileExists = vi.fn(async () => true);
    const manager = windowsManager({ fileExists, runCommand });

    await expect(
      manager.runAction({
        id: 'godot --source attacker',
        action: 'install',
      }),
    ).rejects.toThrow('允许列表');
    await expect(
      manager.runAction({ id: 'godot', action: 'install & calc.exe' }),
    ).rejects.toThrow('允许列表');
    expect(runCommand).not.toHaveBeenCalled();
    expect(fileExists).not.toHaveBeenCalled();
  });

  it('only opens Unity Editor management through the detected Unity Hub bundle', async () => {
    const invocations: CommandInvocation[] = [];
    const manager = actionManager(async (invocation) => {
      invocations.push(invocation);
      return commandResult('');
    }, true);

    const result = await manager.runAction({
      id: 'unity-editor',
      action: 'open',
    });

    expect(invocations).toEqual([
      {
        executable: '/usr/bin/open',
        args: ['/Applications/Unity Hub.app'],
        timeoutMs: 8_000,
      },
    ]);
    expect(result.success).toBe(true);
    await expect(
      manager.runAction({ id: 'unity-editor', action: 'install' }),
    ).rejects.toThrow('只能通过 Unity Hub');
    await expect(
      manager.runAction({ id: 'unity-editor', action: 'update' }),
    ).rejects.toThrow('只能通过 Unity Hub');
    expect(invocations).toHaveLength(1);
  });

  it('rejects unknown dependency IDs and action strings before execution', async () => {
    const runCommand = vi.fn(async () => commandResult(''));
    const manager = actionManager(runCommand);

    await expect(
      manager.runAction({ id: 'godot; touch /tmp/pwned', action: 'install' }),
    ).rejects.toThrow('允许列表');
    await expect(
      manager.runAction({ id: 'godot', action: 'install --cask anything' }),
    ).rejects.toThrow('允许列表');
    await expect(
      manager.runAction({ id: 'godot', action: 'open' }),
    ).rejects.toThrow('不支持打开');
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('refuses install and update when a fixed Homebrew path is unavailable', async () => {
    const runCommand = vi.fn(async () => commandResult(''));
    const manager = new DependencyManager({
      platform: 'darwin',
      fileExists: async () => false,
      listDirectory: async () => [],
      runCommand,
    });

    await expect(
      manager.runAction({ id: 'blender', action: 'install' }),
    ).rejects.toThrow('Homebrew');
    expect(runCommand).not.toHaveBeenCalled();
  });
});

describe('Windows command timeout cleanup', () => {
  it('spawns with shell disabled and terminates the entire Windows process tree', async () => {
    const child = new EventEmitter() as EventEmitter & ManagedCommandProcess;
    child.pid = 4_242;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn(() => true);
    const spawnProcess = vi.fn(() => child) as unknown as CommandProcessSpawner;
    const terminateProcessTree = vi.fn(async () => {
      queueMicrotask(() => child.emit('close', 1));
    });
    const runner = createProcessCommandRunner({
      platform: 'win32',
      environment: { SystemRoot: String.raw`C:\Windows` },
      spawnProcess,
      terminateProcessTree,
    });

    const result = await runner({
      executable: WINGET,
      args: ['--version'],
      timeoutMs: 5,
    });

    expect(spawnProcess).toHaveBeenCalledWith(
      WINGET,
      ['--version'],
      expect.objectContaining({
        detached: false,
        shell: false,
        windowsHide: true,
      }),
    );
    expect(terminateProcessTree).toHaveBeenCalledWith(4_242);
    expect(child.kill).not.toHaveBeenCalled();
    expect(result).toMatchObject({ exitCode: 1, timedOut: true });
  });

  it('resolves a detached GUI launch after spawn without waiting for process exit', async () => {
    const child = new EventEmitter() as EventEmitter & ManagedCommandProcess;
    child.stdout = null;
    child.stderr = null;
    child.kill = vi.fn(() => true);
    child.unref = vi.fn();
    const spawnProcess = vi.fn(() => {
      queueMicrotask(() => child.emit('spawn'));
      return child;
    }) as unknown as CommandProcessSpawner;
    const runner = createProcessCommandRunner({
      platform: 'win32',
      spawnProcess,
    });

    await expect(
      runner({
        executable: WIN_UNITY_HUB,
        args: [],
        timeoutMs: 8_000,
        launchDetached: true,
      }),
    ).resolves.toEqual({
      exitCode: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
    });
    expect(spawnProcess).toHaveBeenCalledWith(
      WIN_UNITY_HUB,
      [],
      expect.objectContaining({
        detached: true,
        stdio: 'ignore',
        shell: false,
      }),
    );
    expect(child.unref).toHaveBeenCalledOnce();
    expect(child.kill).not.toHaveBeenCalled();
  });
});

function actionManager(
  runCommand: CommandRunner,
  includeUnityHub = false,
): DependencyManager {
  return new DependencyManager({
    platform: 'darwin',
    homeDirectory: HOME,
    fileExists: async (filePath) =>
      filePath === BREW || (includeUnityHub && filePath === UNITY_HUB),
    listDirectory: async () => [],
    runCommand,
  });
}

function windowsManager(
  options: Partial<
    Pick<
      DependencyManagerOptions,
      'fileExists' | 'listDirectory' | 'runCommand'
    >
  > = {},
): DependencyManager {
  return new DependencyManager({
    platform: 'win32',
    architecture: 'x64',
    homeDirectory: WIN_HOME,
    environment: {
      LOCALAPPDATA: LOCAL_APP_DATA,
      ProgramFiles: PROGRAM_FILES,
    },
    fileExists: options.fileExists ?? (async () => false),
    listDirectory: options.listDirectory ?? (async () => []),
    runCommand: options.runCommand ?? (async () => commandResult('')),
  });
}

function wingetArgs(
  verb: 'install' | 'upgrade',
  packageId: string,
  scope: 'user' | 'machine',
): string[] {
  return [
    verb,
    '--id',
    packageId,
    '--exact',
    '--source',
    'winget',
    '--scope',
    scope,
    '--architecture',
    'x64',
    '--silent',
    ...(verb === 'install' ? ['--no-upgrade'] : []),
    '--accept-source-agreements',
    '--accept-package-agreements',
    '--disable-interactivity',
  ];
}

function commandResult(stdout: string, stderr = ''): CommandResult {
  return { exitCode: 0, stdout, stderr, timedOut: false };
}

function find(
  dependencies: DesktopDependency[],
  id: DesktopDependency['id'],
): DesktopDependency {
  const dependency = dependencies.find((entry) => entry.id === id);
  if (!dependency) throw new Error(`Missing dependency ${id}`);
  return dependency;
}
