import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GodotEnvironmentService,
  godotProcessEnvironment,
  templateVersionForGodot,
  type GodotProcessRunner,
  type GodotProcessResult,
} from './godotEnvironmentService.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('GodotEnvironmentService', () => {
  it('requires the exact export-template version instead of accepting a nearby install', async () => {
    const root = await temporaryRoot('noobi-godot-mismatch-');
    const binary = await fakeExecutable(root, 'bin/godot');
    const templateRoot = join(root, 'export_templates');
    await mkdir(join(templateRoot, '4.7.stable'), { recursive: true });
    await writeFile(join(templateRoot, '4.7.stable', 'web_nothreads_release.zip'), 'wrong-version');
    const service = new GodotEnvironmentService({
      storageFile: join(root, 'settings/godot.json'),
      platform: 'darwin',
      environment: { NOOBI_GODOT_BIN: binary, PATH: '' },
      homeDirectory: root,
      templateRoots: [templateRoot],
      processRunner: versionRunner('4.7.1.stable.official.a13da4feb'),
    });

    const status = await service.init();

    expect(status.tool).toMatchObject({
      state: 'ready',
      version: '4.7.1.stable.official.a13da4feb',
      source: 'environment',
    });
    expect(status.exportTemplates).toMatchObject({
      state: 'missing',
      expectedVersion: '4.7.1.stable',
      basePath: templateRoot,
      versionPath: null,
      installedVersions: ['4.7.stable'],
      targets: { web: false, macos: false, windows: false, linux: false },
    });
    expect(status.exportTemplates.issues[0]).toContain('4.7.1.stable');
    expect(status.canCreateProjects).toBe(true);
    expect(status.canExportProjects).toBe(false);
  });

  it('reports platform targets from the exact template directory', async () => {
    const root = await temporaryRoot('noobi-godot-templates-');
    const binary = await fakeExecutable(root, 'bin/godot');
    const versionPath = join(root, 'templates/4.7.1.stable');
    await mkdir(versionPath, { recursive: true });
    await Promise.all([
      writeFile(join(versionPath, 'web_nothreads_release.zip'), 'web'),
      writeFile(join(versionPath, 'macos.zip'), 'mac'),
      writeFile(join(versionPath, 'windows_release_x86_64.exe'), 'windows'),
      writeFile(join(versionPath, 'linux_release.x86_64'), 'linux'),
    ]);
    const service = new GodotEnvironmentService({
      storageFile: join(root, 'godot.json'),
      platform: 'linux',
      environment: { NOOBI_GODOT_BIN: binary, PATH: '' },
      homeDirectory: root,
      templateRoots: [join(root, 'templates')],
      processRunner: versionRunner('4.7.1.stable.official.a13da4feb'),
    });

    const status = await service.init();

    expect(status.exportTemplates).toMatchObject({
      state: 'ready',
      expectedVersion: '4.7.1.stable',
      versionPath,
      targets: { web: true, macos: true, windows: true, linux: true },
      issues: [],
    });
    expect(status.canExportProjects).toBe(true);
  });

  it('requires a Web template for the Noobi integrated export capability', async () => {
    const root = await temporaryRoot('noobi-godot-native-only-');
    const binary = await fakeExecutable(root, 'bin/godot');
    const versionPath = join(root, 'templates/4.7.1.stable');
    await mkdir(versionPath, { recursive: true });
    await writeFile(join(versionPath, 'macos.zip'), 'mac');
    await writeFile(join(versionPath, 'web_nothreads_release.zip'), '');
    const service = new GodotEnvironmentService({
      storageFile: join(root, 'godot.json'),
      platform: 'darwin',
      environment: { NOOBI_GODOT_BIN: binary, PATH: '' },
      homeDirectory: root,
      templateRoots: [join(root, 'templates')],
      processRunner: versionRunner('4.7.1.stable.official.demo'),
    });

    const status = await service.init();

    expect(status.exportTemplates).toMatchObject({
      state: 'ready',
      targets: { web: false, macos: true },
    });
    expect(status.canExportProjects).toBe(false);
  });

  it('accepts a selected macOS app bundle, stores the override, and resolves its real executable', async () => {
    const root = await temporaryRoot('noobi-godot-app-');
    const appBundle = join(root, 'Godot.app');
    const binary = await fakeExecutable(appBundle, 'Contents/MacOS/Godot');
    const storageFile = join(root, 'settings/godot.json');
    const options = {
      storageFile,
      platform: 'darwin' as const,
      environment: { PATH: '' },
      homeDirectory: root,
      templateRoots: [join(root, 'templates')],
      processRunner: versionRunner('4.4.1.stable.official.demo'),
    };
    const service = new GodotEnvironmentService(options);
    await service.init();

    const saved = await service.saveBinaryPath(appBundle);

    expect(saved.tool).toMatchObject({
      state: 'ready',
      configuredPath: appBundle,
      binaryPath: await realpath(binary),
      source: 'configured',
    });
    expect(JSON.parse(await readFile(storageFile, 'utf8'))).toEqual({
      version: 1,
      binaryPath: appBundle,
    });
    const reopened = new GodotEnvironmentService(options);
    expect((await reopened.init()).tool.configuredPath).toBe(appBundle);
  });

  it('rejects relative, non-Godot, and incompatible configured executables', async () => {
    const root = await temporaryRoot('noobi-godot-invalid-');
    const binary = await fakeExecutable(root, 'bin/not-godot');
    const service = new GodotEnvironmentService({
      storageFile: join(root, 'godot.json'),
      platform: 'linux',
      environment: { PATH: '' },
      homeDirectory: root,
      processRunner: versionRunner('3.5.3.stable.official.demo'),
    });
    await service.init();

    await expect(service.saveBinaryPath('relative/godot')).rejects.toThrow('绝对路径');
    await expect(service.saveBinaryPath(binary)).rejects.toThrow('Godot 3.5.3');
    expect(service.configuredPath).toBeNull();
  });

  it('ignores a malformed optional environment override and continues PATH discovery', async () => {
    const root = await temporaryRoot('noobi-godot-path-');
    await fakeExecutable(root, 'bin/godot4');
    const service = new GodotEnvironmentService({
      storageFile: join(root, 'godot.json'),
      platform: 'linux',
      environment: { NOOBI_GODOT_BIN: 'relative/not-godot', PATH: join(root, 'bin') },
      homeDirectory: root,
      processRunner: versionRunner('4.3.stable.official.demo'),
    });

    await expect(service.init()).resolves.toMatchObject({
      tool: { state: 'ready', source: 'path' },
    });
  });

  it('runs only fixed headless tasks and verifies Web export artifacts', async () => {
    const root = await temporaryRoot('noobi-godot-execute-');
    const binary = await fakeExecutable(root, 'bin/godot');
    const projectPath = join(root, 'game');
    await mkdir(projectPath, { recursive: true });
    await writeFile(join(projectPath, 'project.godot'), '[application]\n');
    const calls: Array<{ binaryPath: string; args: readonly string[]; cwd?: string }> = [];
    const runner: GodotProcessRunner = vi.fn(async (binaryPath, args, options) => {
      calls.push({ binaryPath, args: [...args], cwd: options.cwd });
      if (args[0] === '--version') return result({ stdout: '4.4.1.stable.official.demo\n' });
      if (args.includes('--export-release')) {
        const output = args.at(-1)!;
        const base = output.slice(0, -'.html'.length);
        await mkdir(join(projectPath, 'build/web'), { recursive: true });
        await Promise.all([
          writeFile(output, '<html></html>'),
          writeFile(`${base}.wasm`, 'wasm'),
          writeFile(`${base}.pck`, 'pck'),
        ]);
      }
      return result();
    });
    const service = new GodotEnvironmentService({
      storageFile: join(root, 'godot.json'),
      platform: 'linux',
      environment: { NOOBI_GODOT_BIN: binary, PATH: '' },
      homeDirectory: root,
      processRunner: runner,
    });
    await service.init();

    const imported = await service.execute({ kind: 'import', projectPath });
    const outputPath = join(projectPath, 'build/web/index.html');
    const exported = await service.execute({
      kind: 'export',
      projectPath,
      preset: 'Web',
      outputPath,
    });

    expect(imported.ok).toBe(true);
    expect(calls[1]).toEqual({
      binaryPath: await realpath(binary),
      args: ['--headless', '--recovery-mode', '--path', projectPath, '--editor', '--quit'],
      cwd: projectPath,
    });
    expect(calls[2]?.args).toEqual([
      '--headless',
      '--recovery-mode',
      '--path', projectPath,
      '--export-release',
      'Web',
      outputPath,
    ]);
    expect(exported).toMatchObject({
      ok: true,
      task: 'export',
      artifacts: [outputPath, outputPath.replace(/\.html$/u, '.wasm'), outputPath.replace(/\.html$/u, '.pck')],
    });
    await expect(service.execute({
      kind: 'export',
      projectPath,
      preset: '--path',
      outputPath,
    })).rejects.toThrow('预设名称');
    await expect(service.execute({
      kind: 'export',
      projectPath,
      preset: 'Web',
      outputPath: join(root, 'escaped.html'),
    })).rejects.toThrow('项目目录内');
  });

  it('fails closed on Godot crash markers and missing export artifacts even with exit code zero', async () => {
    const root = await temporaryRoot('noobi-godot-fail-closed-');
    const binary = await fakeExecutable(root, 'bin/godot');
    const projectPath = join(root, 'game');
    await mkdir(projectPath, { recursive: true });
    await writeFile(join(projectPath, 'project.godot'), '[application]\n');
    const staleBase = join(projectPath, 'build/index');
    await mkdir(join(projectPath, 'build'), { recursive: true });
    await Promise.all([
      writeFile(`${staleBase}.html`, 'stale'),
      writeFile(`${staleBase}.wasm`, 'stale'),
      writeFile(`${staleBase}.pck`, 'stale'),
    ]);
    const runner = vi.fn<GodotProcessRunner>(async (_binaryPath, args) => {
      if (args[0] === '--version') return result({ stdout: '4.4.stable.official.demo\n' });
      if (args.includes('--quit')) return result({ stderr: 'ERROR: cannot write editor settings\nhandle_crash\n' });
      return result();
    });
    const service = new GodotEnvironmentService({
      storageFile: join(root, 'godot.json'),
      platform: 'linux',
      environment: { NOOBI_GODOT_BIN: binary, PATH: '' },
      homeDirectory: root,
      processRunner: runner,
    });
    await service.init();

    await expect(service.execute({ kind: 'import', projectPath })).resolves.toMatchObject({ ok: false });
    await expect(service.execute({
      kind: 'export',
      projectPath,
      preset: 'Web',
      outputPath: join(projectPath, 'build/index.html'),
    })).resolves.toMatchObject({ ok: false, artifacts: [] });
  });
});

describe('godotProcessEnvironment', () => {
  it('keeps only runtime essentials and strips host credentials', () => {
    expect(godotProcessEnvironment({
      HOME: '/Users/test',
      PATH: '/usr/bin',
      LANG: 'zh_CN.UTF-8',
      OPENAI_API_KEY: 'secret',
      MINIMAX_API_KEY: 'secret',
      NOOBI_CODEX_BIN: '/private/codex',
      NODE_OPTIONS: '--require malicious.js',
    })).toEqual({
      HOME: '/Users/test',
      PATH: '/usr/bin',
      LANG: 'zh_CN.UTF-8',
    });
  });
});

describe('templateVersionForGodot', () => {
  it('keeps patch/channel and mono flavor while removing the official build suffix', () => {
    expect(templateVersionForGodot('4.7.1.stable.official.a13da4feb')).toBe('4.7.1.stable');
    expect(templateVersionForGodot('4.4.stable.mono.official.demo')).toBe('4.4.stable.mono');
    expect(templateVersionForGodot('unknown')).toBeNull();
  });
});

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function fakeExecutable(root: string, relativePath: string): Promise<string> {
  const path = join(root, relativePath);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, '#!/bin/sh\nexit 0\n');
  await chmod(path, 0o755);
  return path;
}

function versionRunner(version: string): GodotProcessRunner {
  return vi.fn(async (_binaryPath, args) => args[0] === '--version'
    ? result({ stdout: `${version}\n` })
    : result());
}

function result(patch: Partial<GodotProcessResult> = {}): GodotProcessResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 1,
    ...patch,
  };
}
