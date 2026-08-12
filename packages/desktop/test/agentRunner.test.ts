import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppSettings } from '../src/shared/types.js';
import {
  AgentRunner,
  assetIdleTimeoutFromEnv,
  assetOutputDirFromInput,
  buildCredentialPayload,
  inspectAssetProgress,
  isRuntimeFailure,
  PendingToolTracker,
  sanitizeRuntimeEnvironment,
  terminateProcessTree,
  withDesktopToolPaths,
} from '../src/main/agentRunner.js';
import type { ChildProcess } from 'node:child_process';

describe('isRuntimeFailure', () => {
  it('识别 Runtime 显式错误', () => {
    expect(isRuntimeFailure({ is_error: true })).toBe(true);
    expect(isRuntimeFailure({ error: { message: '连接失败' } })).toBe(true);
  });

  it('识别被上游包装成普通 result 的 Provider 错误', () => {
    expect(isRuntimeFailure({ result: '[API Error: 401 Unauthorized]' })).toBe(
      true,
    );
    expect(
      isRuntimeFailure({ result: '[Authentication Error: invalid key]' }),
    ).toBe(true);
  });

  it('保留正常完成结果', () => {
    expect(isRuntimeFailure({ result: '游戏生成完成' })).toBe(false);
    expect(isRuntimeFailure({})).toBe(false);
  });
});

describe('buildCredentialPayload', () => {
  it('同一 Provider 复用密钥，但保留每个服务自己的模型', () => {
    const payload = buildCredentialPayload(makeSettings());

    expect(payload.providers.reasoning).toMatchObject({
      apiKey: 'deepseek-key',
      model: 'deepseek-v4-pro',
    });
    expect(payload.providers.audio).toMatchObject({
      apiKey: 'deepseek-key',
      model: 'deepseek-v4-flash',
    });
    expect(payload.providers.video).toMatchObject({
      apiKey: 'dashscope-key',
      model: 'wan2.5-i2v-preview',
    });
  });

  it('不同 Provider 之间不复用密钥', () => {
    const settings = makeSettings();
    settings.video.provider = 'doubao';
    expect(buildCredentialPayload(settings).providers.video).toBeUndefined();
  });

  it('专业音频 Provider 使用自己的密钥，不复用策划模型密钥', () => {
    const settings = makeSettings();
    settings.audio = {
      provider: 'elevenlabs',
      baseUrl: 'https://api.elevenlabs.io',
      model: 'music_v2',
      apiKey: 'elevenlabs-key',
    };

    expect(buildCredentialPayload(settings).providers.audio).toEqual({
      provider: 'elevenlabs',
      apiKey: 'elevenlabs-key',
      baseUrl: 'https://api.elevenlabs.io',
      model: 'music_v2',
    });

    settings.audio.apiKey = '';
    expect(buildCredentialPayload(settings).providers.audio).toBeUndefined();
  });
});

describe('desktop tool PATH', () => {
  it('adds Finder-missing tool directories without duplicating entries', () => {
    const entries = withDesktopToolPaths(
      '/usr/bin:/custom/bin:/opt/homebrew/bin',
    ).split(path.delimiter);
    expect(entries.slice(0, 2)).toEqual([
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ]);
    expect(entries).toContain('/custom/bin');
    expect(
      entries.filter((entry) => entry === '/opt/homebrew/bin'),
    ).toHaveLength(1);
  });

  it('preserves one Windows PATH key and adds trusted user tool locations', () => {
    const environment = sanitizeRuntimeEnvironment(
      {
        Path: 'C:\\Windows\\System32;C:\\Custom',
        PATH: 'C:\\ignored-duplicate',
        LOCALAPPDATA: 'C:\\Users\\测试 用户\\AppData\\Local',
        APPDATA: 'C:\\Users\\测试 用户\\AppData\\Roaming',
        ProgramFiles: 'C:\\Program Files',
        API_KEY: 'must-not-leak',
      },
      'win32',
      'C:\\Users\\测试 用户',
    );

    expect(environment).not.toHaveProperty('Path');
    expect(environment).not.toHaveProperty('API_KEY');
    const entries = environment.PATH?.split(';') ?? [];
    expect(entries).toContain('C:\\Windows\\System32');
    expect(entries).toContain(
      'C:\\Users\\测试 用户\\AppData\\Local\\Microsoft\\WinGet\\Links',
    );
    expect(entries).toContain('C:\\Users\\测试 用户\\AppData\\Roaming\\npm');
    expect(entries).not.toContain('/opt/homebrew/bin');
  });

  it('preserves the exact POSIX PATH without collapsing an unrelated Path key', () => {
    const environment = sanitizeRuntimeEnvironment(
      { Path: '/mixed-case-value', PATH: '/expected/bin' },
      'darwin',
      '/Users/tester',
    );

    expect(environment.Path).toBe('/mixed-case-value');
    expect(environment.PATH?.split(':')).toContain('/expected/bin');
  });

  it('uses the tsx JavaScript entry instead of a Windows cmd shim', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'noobi-runtime-'));
    try {
      const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
      const sourceCli = path.join(root, 'packages', 'cli', 'index.ts');
      await mkdir(path.dirname(tsxCli), { recursive: true });
      await mkdir(path.dirname(sourceCli), { recursive: true });
      await Promise.all([writeFile(tsxCli, ''), writeFile(sourceCli, '')]);
      const runner = new AgentRunner({
        repoRoot: root,
      } as ConstructorParameters<typeof AgentRunner>[0]);

      expect(runner.inspectRuntime()).toMatchObject({
        prefixArgs: [tsxCli, sourceCli],
        ready: true,
      });
      expect(runner.inspectRuntime().command).not.toMatch(/\.cmd$/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses the absolute system taskkill with shell disabled', async () => {
    const child = fakeChild(4242);
    const spawnCommand = vi.fn(() => closingCommand(0));

    await terminateProcessTree(child, true, {
      platform: 'win32',
      environment: { SystemRoot: String.raw`C:\Windows` },
      spawnCommand,
    });

    expect(spawnCommand).toHaveBeenCalledWith(
      String.raw`C:\Windows\System32\taskkill.exe`,
      ['/pid', '4242', '/t', '/f'],
      { stdio: 'ignore', windowsHide: true, shell: false },
    );
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('reports tree termination as failed when taskkill exits unsuccessfully', async () => {
    const child = fakeChild(4242);

    await expect(
      terminateProcessTree(child, false, {
        platform: 'win32',
        environment: { SYSTEMROOT: String.raw`D:\Windows` },
        spawnCommand: () => closingCommand(5),
      }),
    ).rejects.toThrow('无法确认 Windows Agent 进程树已终止');

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});

function fakeChild(pid: number): ChildProcess {
  const emitter = new EventEmitter() as ChildProcess;
  Object.assign(emitter, {
    pid,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(() => true),
  });
  return emitter;
}

function closingCommand(exitCode: number) {
  const command = new EventEmitter();
  queueMicrotask(() => command.emit('close', exitCode));
  return command;
}

describe('asset generation liveness', () => {
  it('detects real file progress without reading file contents', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'noobi-assets-'));
    try {
      const assets = path.join(root, 'public', 'assets');
      await mkdir(assets, { recursive: true });
      expect(inspectAssetProgress(root)).toEqual({
        available: true,
        fileCount: 0,
        latestMtimeMs: 0,
      });

      await writeFile(path.join(assets, 'hero.png'), 'png');
      const progress = inspectAssetProgress(root);
      expect(progress.fileCount).toBe(1);
      expect(progress.latestMtimeMs).toBeGreaterThan(0);

      const customAssets = path.join(root, 'generated', 'sprites');
      await mkdir(customAssets, { recursive: true });
      await writeFile(path.join(customAssets, 'enemy.png'), 'png');
      expect(
        inspectAssetProgress(root, path.join('generated', 'sprites')).fileCount,
      ).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('bounds the asset-specific idle timeout', () => {
    expect(assetIdleTimeoutFromEnv({})).toBe(12 * 60_000);
    expect(
      assetIdleTimeoutFromEnv({ GAMEAGENT_ASSET_IDLE_TIMEOUT_MS: '1000' }),
    ).toBe(4 * 60_000);
    expect(
      assetIdleTimeoutFromEnv({
        GAMEAGENT_ASSET_IDLE_TIMEOUT_MS: String(60 * 60_000),
      }),
    ).toBe(30 * 60_000);
  });

  it('tracks multiple tools by call ID and starts asset monitoring only at the queue head', () => {
    const tracker = new PendingToolTracker();
    tracker.add('todo_write', 'tool-1');
    tracker.add(
      'generate_game_assets',
      'tool-2',
      assetOutputDirFromInput({ output_dir_name: 'generated/assets' }),
    );
    tracker.add('write_file', 'tool-3');

    expect(tracker.current()?.name).toBe('todo_write');
    expect(tracker.complete('unknown')).toBeUndefined();
    expect(tracker.current()?.name).toBe('todo_write');

    tracker.complete('tool-1');
    expect(tracker.current()).toMatchObject({
      id: 'tool-2',
      name: 'generate_game_assets',
      outputDirName: 'generated/assets',
    });

    tracker.complete('tool-2');
    expect(tracker.current()?.name).toBe('write_file');
  });
});

function makeSettings(): AppSettings {
  return {
    main: {
      provider: 'openai-compat',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiKey: 'deepseek-key',
    },
    reasoning: {
      provider: 'openai-compat',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-pro',
      apiKey: '',
    },
    image: {
      provider: 'tongyi',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'wan2.5-t2i-preview',
      apiKey: 'dashscope-key',
    },
    video: {
      provider: 'tongyi',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'wan2.5-i2v-preview',
      apiKey: '',
    },
    audio: {
      provider: 'openai-compat',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiKey: '',
    },
    defaultWorkspace: '/tmp/gameagent-test',
    permissionMode: 'yolo',
    developerMode: false,
  };
}
