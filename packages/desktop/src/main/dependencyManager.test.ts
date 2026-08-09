import { describe, expect, it, vi } from 'vitest';
import {
  DependencyManager,
  type CommandInvocation,
  type CommandResult,
  type CommandRunner,
} from './dependencyManager.js';
import type { DesktopDependency } from '../shared/types.js';

const HOME = '/Users/tester';
const BREW = '/opt/homebrew/bin/brew';
const UNITY_HUB = '/Applications/Unity Hub.app/Contents/MacOS/Unity Hub';

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

  it('reports all dependencies as unsupported outside macOS', async () => {
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
