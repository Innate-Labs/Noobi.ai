import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import {
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import type {
  EnvironmentToolSource,
  EnvironmentToolStatus,
  GodotExportTemplatesStatus,
} from '../shared/contracts.js';

const GODOT_REQUIRED_MAJOR = 4;
const MAX_PATH_LENGTH = 4_000;
const MAX_PRESET_LENGTH = 200;
const MAX_PROCESS_OUTPUT_BYTES = 1_048_576;
const FATAL_GODOT_OUTPUT = /(?:^|\n)\s*(?:ERROR:|SCRIPT ERROR:)|handle_crash|Project export .* failed/iu;

interface StoredGodotEnvironment {
  version: 1;
  binaryPath: string | null;
}

interface GodotCandidate {
  path: string;
  source: EnvironmentToolSource;
}

export interface GodotProcessOptions {
  cwd?: string;
  timeoutMs: number;
}

export interface GodotProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export type GodotProcessRunner = (
  binaryPath: string,
  args: readonly string[],
  options: GodotProcessOptions,
) => Promise<GodotProcessResult>;

export interface GodotEnvironmentInspection {
  tool: EnvironmentToolStatus;
  exportTemplates: GodotExportTemplatesStatus;
  canCreateProjects: boolean;
  canExportProjects: boolean;
  checkedAt: string;
}

export type GodotHeadlessTask =
  | { kind: 'import'; projectPath: string }
  | { kind: 'validate'; projectPath: string }
  | {
    kind: 'export';
    projectPath: string;
    preset: string;
    outputPath: string;
    debug?: boolean;
  };

export interface GodotHeadlessResult extends GodotProcessResult {
  ok: boolean;
  task: GodotHeadlessTask['kind'];
  artifacts: string[];
}

export interface GodotEnvironmentServiceOptions {
  storageFile: string;
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  templateRoots?: string[];
  processRunner?: GodotProcessRunner;
  now?: () => Date;
}

/**
 * Detects and configures a Godot 4 editor without exposing a generic process or
 * shell primitive. Project operations are a closed union and are always passed
 * as an argv array to `spawn` with `shell: false`.
 */
export class GodotEnvironmentService {
  readonly #storageFile: string;
  readonly #platform: NodeJS.Platform;
  readonly #environment: NodeJS.ProcessEnv;
  readonly #homeDirectory: string;
  readonly #templateRoots: string[] | null;
  readonly #processRunner: GodotProcessRunner;
  readonly #now: () => Date;
  #configuredPath: string | null = null;
  #configurationError: string | null = null;
  #inspection: GodotEnvironmentInspection | null = null;

  constructor(options: GodotEnvironmentServiceOptions) {
    if (!isAbsolute(options.storageFile)) {
      throw new Error('Godot environment storage path must be absolute');
    }
    this.#storageFile = resolve(options.storageFile);
    this.#platform = options.platform ?? process.platform;
    this.#environment = { ...(options.environment ?? process.env) };
    this.#homeDirectory = resolve(options.homeDirectory ?? this.#environment.HOME ?? homedir());
    this.#templateRoots = options.templateRoots?.map((root) => resolve(root)) ?? null;
    this.#processRunner = options.processRunner ?? runGodotProcess;
    this.#now = options.now ?? (() => new Date());
  }

  get configuredPath(): string | null {
    return this.#configuredPath;
  }

  async init(): Promise<GodotEnvironmentInspection> {
    await this.#readConfiguration();
    return this.refresh();
  }

  async getStatus(): Promise<GodotEnvironmentInspection> {
    return structuredClone(this.#inspection ?? await this.refresh());
  }

  async refresh(): Promise<GodotEnvironmentInspection> {
    const tool = await this.#detectTool();
    const exportTemplates = await this.#inspectExportTemplates(tool);
    this.#inspection = {
      tool,
      exportTemplates,
      canCreateProjects: tool.state === 'ready',
      canExportProjects: tool.state === 'ready'
        && exportTemplates.state === 'ready'
        && exportTemplates.targets.web,
      checkedAt: this.#now().toISOString(),
    };
    return structuredClone(this.#inspection);
  }

  async saveBinaryPath(binaryPath: string | null): Promise<GodotEnvironmentInspection> {
    const normalized = binaryPath === null || !binaryPath.trim()
      ? null
      : validateAbsolutePath(binaryPath, 'Godot 可执行文件');
    if (normalized) {
      const candidates = await configuredCandidates(normalized, this.#platform);
      const inspected = await this.#inspectCandidates(candidates, true);
      if (!inspected || inspected.state !== 'ready') {
        throw new Error(inspected?.message ?? 'Godot 可执行文件不存在或不可运行');
      }
    }
    await this.#writeConfiguration({ version: 1, binaryPath: normalized });
    this.#configuredPath = normalized;
    this.#configurationError = null;
    return this.refresh();
  }

  async execute(task: GodotHeadlessTask): Promise<GodotHeadlessResult> {
    const status = await this.getStatus();
    const binaryPath = status.tool.binaryPath;
    if (status.tool.state !== 'ready' || !binaryPath) {
      throw new Error('Godot 4 环境未就绪，无法执行项目任务');
    }
    const projectPath = validateAbsolutePath(task.projectPath, 'Godot 项目目录');
    await access(join(projectPath, 'project.godot'), constants.R_OK).catch(() => {
      throw new Error('所选目录不是有效的 Godot 项目（缺少 project.godot）');
    });

    let args: string[];
    let timeoutMs: number;
    let expectedArtifacts: string[] = [];
    if (task.kind === 'import') {
      // Godot 4.7.1 can crash in the dedicated --import command-line path on
      // macOS. Opening the editor headlessly and quitting after the first
      // iteration performs the initial import without entering that path.
      args = ['--headless', '--recovery-mode', '--path', projectPath, '--editor', '--quit'];
      timeoutMs = 120_000;
    } else if (task.kind === 'validate') {
      args = [
        '--headless',
        '--recovery-mode',
        '--path', projectPath,
        '--editor',
        '--quit-after', '1',
      ];
      timeoutMs = 60_000;
    } else {
      const preset = validatePreset(task.preset);
      const outputPath = validateOutputPath(projectPath, task.outputPath);
      args = [
        '--headless',
        '--recovery-mode',
        '--path', projectPath,
        task.debug ? '--export-debug' : '--export-release',
        preset,
        outputPath,
      ];
      timeoutMs = 10 * 60_000;
      expectedArtifacts = exportArtifacts(outputPath);
      // Never accept a previous build as evidence for this export attempt.
      // Targets are fixed, validated project-contained files, not directories.
      await removeExistingArtifacts(expectedArtifacts);
    }

    const result = await this.#processRunner(binaryPath, args, { cwd: projectPath, timeoutMs });
    const outputHasFatalError = FATAL_GODOT_OUTPUT.test(`${result.stdout}\n${result.stderr}`);
    const artifacts = task.kind === 'export'
      ? await existingFiles(expectedArtifacts)
      : [];
    const artifactsComplete = task.kind !== 'export' || artifacts.length === expectedArtifacts.length;
    return {
      ...result,
      ok: result.exitCode === 0 && !result.timedOut && !outputHasFatalError && artifactsComplete,
      task: task.kind,
      artifacts,
    };
  }

  async #readConfiguration(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.#storageFile, 'utf8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('配置不是对象');
      }
      const document = parsed as Partial<StoredGodotEnvironment>;
      if (document.version !== 1 || (document.binaryPath !== null && typeof document.binaryPath !== 'string')) {
        throw new Error('配置版本或字段无效');
      }
      this.#configuredPath = document.binaryPath
        ? validateAbsolutePath(document.binaryPath, 'Godot 可执行文件')
        : null;
      this.#configurationError = null;
    } catch (error) {
      if (asNodeError(error).code === 'ENOENT') {
        this.#configuredPath = null;
        this.#configurationError = null;
        return;
      }
      this.#configuredPath = null;
      this.#configurationError = `Godot 环境配置无法读取：${asError(error).message}`;
    }
  }

  async #writeConfiguration(document: StoredGodotEnvironment): Promise<void> {
    await mkdir(dirname(this.#storageFile), { recursive: true, mode: 0o700 });
    const temporary = `${this.#storageFile}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, this.#storageFile);
  }

  async #detectTool(): Promise<EnvironmentToolStatus> {
    if (this.#configuredPath) {
      const candidates = await configuredCandidates(this.#configuredPath, this.#platform);
      return await this.#inspectCandidates(candidates, true) ?? missingGodotTool(
        this.#configuredPath,
        '配置的 Godot 可执行文件不存在或不可运行。',
      );
    }

    const candidates = await automaticCandidates(
      this.#platform,
      this.#environment,
      this.#homeDirectory,
    );
    const inspected = await this.#inspectCandidates(candidates, false);
    if (inspected) return inspected;
    return missingGodotTool(
      null,
      this.#configurationError ?? '未检测到 Godot 4；请安装 Godot 或选择可执行文件。',
    );
  }

  async #inspectCandidates(
    candidates: GodotCandidate[],
    stopAfterFirstRunnable: boolean,
  ): Promise<EnvironmentToolStatus | null> {
    let fallback: EnvironmentToolStatus | null = null;
    for (const candidate of deduplicateCandidates(candidates)) {
      const executable = await runnableRealPath(candidate.path);
      if (!executable) continue;
      const result = await this.#processRunner(executable, ['--version'], { timeoutMs: 5_000 });
      const version = readGodotVersion(`${result.stdout}\n${result.stderr}`);
      const major = version ? Number.parseInt(version, 10) : null;
      const state: EnvironmentToolStatus['state'] = result.exitCode !== 0 || result.timedOut
        ? 'error'
        : major === GODOT_REQUIRED_MAJOR
          ? 'ready'
          : 'incompatible';
      const message = state === 'ready'
        ? `Godot ${version} 已就绪。`
        : state === 'incompatible'
          ? version
            ? `检测到 Godot ${version}；Noobi.ai 当前需要 Godot 4.x。`
            : '该文件可以运行，但没有返回有效的 Godot 版本。'
          : result.timedOut
            ? '读取 Godot 版本超时。'
            : `Godot 版本检查失败${result.stderr.trim() ? `：${result.stderr.trim().slice(0, 300)}` : '。'}`;
      const tool: EnvironmentToolStatus = {
        id: 'godot',
        label: 'Godot Engine',
        state,
        version,
        binaryPath: executable,
        configuredPath: this.#configuredPath,
        source: candidate.source,
        message,
      };
      if (state === 'ready' || stopAfterFirstRunnable) return tool;
      fallback ??= tool;
    }
    return fallback;
  }

  async #inspectExportTemplates(
    tool: EnvironmentToolStatus,
  ): Promise<GodotExportTemplatesStatus> {
    const emptyTargets = { web: false, macos: false, windows: false, linux: false };
    if (tool.state !== 'ready' || !tool.binaryPath || !tool.version) {
      return {
        state: 'unknown',
        expectedVersion: null,
        basePath: null,
        versionPath: null,
        installedVersions: [],
        targets: emptyTargets,
        issues: ['需要先配置兼容的 Godot 4 才能检查导出模板。'],
      };
    }
    const expectedVersion = templateVersionForGodot(tool.version);
    if (!expectedVersion) {
      return {
        state: 'unknown',
        expectedVersion: null,
        basePath: null,
        versionPath: null,
        installedVersions: [],
        targets: emptyTargets,
        issues: [`无法从 Godot ${tool.version} 推导导出模板版本。`],
      };
    }

    const roots = this.#templateRoots ?? defaultTemplateRoots(
      this.#platform,
      this.#environment,
      this.#homeDirectory,
      tool.binaryPath,
    );
    const installedVersions = new Set<string>();
    let discoveredBasePath: string | null = null;
    let basePath: string | null = null;
    let versionPath: string | null = null;
    for (const root of deduplicate(roots)) {
      const entries = await directoryNames(root);
      if (entries.length > 0 && !discoveredBasePath) discoveredBasePath = root;
      for (const entry of entries) installedVersions.add(entry);
      if (!versionPath && entries.includes(expectedVersion)) {
        basePath = root;
        versionPath = join(root, expectedVersion);
      }
    }

    if (!versionPath) {
      const versions = [...installedVersions].sort();
      const detail = versions.length
        ? `Godot 需要 ${expectedVersion}，但只检测到 ${versions.join('、')}。`
        : `未安装 Godot ${expectedVersion} 的导出模板。`;
      return {
        state: 'missing',
        expectedVersion,
        basePath: discoveredBasePath ?? roots.at(-1) ?? null,
        versionPath: null,
        installedVersions: versions,
        targets: emptyTargets,
        issues: [detail],
      };
    }

    const files = await fileNames(versionPath);
    const targets = {
      web: files.some((file) => /^web(?:_[a-z0-9-]+)*_(?:debug|release)\.zip$/iu.test(file)),
      macos: files.some((file) => /^macos(?:\.[a-z0-9_-]+)?\.zip$/iu.test(file)),
      windows: files.some((file) => /^windows_.*(?:debug|release).*\.exe$/iu.test(file)),
      linux: files.some((file) => /^linux_.*(?:debug|release)/iu.test(file)),
    };
    const issues: string[] = [];
    if (!targets.web) issues.push('缺少 Web 导出模板。');
    if (!targets.macos) issues.push('缺少 macOS 导出模板。');
    if (!targets.windows) issues.push('缺少 Windows 导出模板。');
    if (!targets.linux) issues.push('缺少 Linux 导出模板。');
    const anyTarget = Object.values(targets).some(Boolean);
    return {
      state: anyTarget ? 'ready' : 'missing',
      expectedVersion,
      basePath,
      versionPath,
      installedVersions: [...installedVersions].sort(),
      targets,
      issues: anyTarget ? issues : [`${versionPath} 中没有可识别的导出模板。`],
    };
  }
}

export async function runGodotProcess(
  binaryPath: string,
  args: readonly string[],
  options: GodotProcessOptions,
): Promise<GodotProcessResult> {
  const startedAt = Date.now();
  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const child = spawn(binaryPath, [...args], {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      env: godotProcessEnvironment(process.env),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);
    const finish = (exitCode: number | null, error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) stderr = appendProcessOutput(stderr, error.message);
      resolvePromise({
        exitCode,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    };
    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout = appendProcessOutput(stdout, String(chunk));
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr = appendProcessOutput(stderr, String(chunk));
    });
    child.once('error', (error) => finish(null, error));
    child.once('close', (code) => finish(code));
  });
}

export function templateVersionForGodot(version: string): string | null {
  const match = /^(\d+\.\d+(?:\.\d+)?)\.(stable|rc\d+|beta\d+|alpha\d+|dev\d+)(?:\.(mono))?/iu.exec(version);
  if (!match) return null;
  return `${match[1]}.${match[2].toLowerCase()}${match[3] ? '.mono' : ''}`;
}

/** Keep host API keys and Electron/Codex internals out of generated projects. */
export function godotProcessEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = new Set([
    'APPDATA',
    'HOME',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'LOCALAPPDATA',
    'PATH',
    'PATHEXT',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'TMPDIR',
    'USERPROFILE',
    'WINDIR',
    'XDG_CACHE_HOME',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
  ]);
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && allowed.has(key.toUpperCase())) result[key] = value;
  }
  return result;
}

function readGodotVersion(output: string): string | null {
  const match = /(?:^|\s)v?(\d+\.\d+(?:\.\d+)?(?:\.[A-Za-z0-9_-]+)*)/u.exec(output.trim());
  return match?.[1] ?? null;
}

async function automaticCandidates(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  homeDirectory: string,
): Promise<GodotCandidate[]> {
  const candidates: GodotCandidate[] = [];
  if (environment.NOOBI_GODOT_BIN) {
    try {
      candidates.push(...await configuredCandidates(environment.NOOBI_GODOT_BIN, platform, 'environment'));
    } catch {
      // A malformed optional override must not prevent ordinary discovery.
    }
  }
  candidates.push(...await applicationCandidates(platform, homeDirectory));
  const executableNames = platform === 'win32'
    ? ['godot4.exe', 'godot.exe']
    : ['godot4', 'godot'];
  for (const directory of (environment.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const name of executableNames) {
      candidates.push({ path: join(directory, name), source: 'path' });
    }
  }
  if (platform === 'linux') {
    candidates.push(
      { path: '/var/lib/flatpak/exports/bin/org.godotengine.Godot', source: 'application' },
      { path: join(homeDirectory, '.local/share/flatpak/exports/bin/org.godotengine.Godot'), source: 'application' },
    );
  }
  return candidates;
}

async function applicationCandidates(
  platform: NodeJS.Platform,
  homeDirectory: string,
): Promise<GodotCandidate[]> {
  if (platform === 'darwin') {
    const roots = ['/Applications', join(homeDirectory, 'Applications')];
    const candidates: GodotCandidate[] = [];
    for (const root of roots) {
      let entries: string[] = [];
      try {
        entries = (await readdir(root)).filter((entry) => /^Godot.*\.app$/iu.test(entry));
      } catch {
        // Optional application directory.
      }
      for (const entry of entries.sort()) {
        candidates.push(
          { path: join(root, entry, 'Contents/MacOS/Godot'), source: 'application' },
          { path: join(root, entry, 'Contents/MacOS/Godot_mono'), source: 'application' },
        );
      }
    }
    return candidates;
  }
  if (platform === 'win32') {
    return [
      { path: join(homeDirectory, 'Applications', 'Godot', 'Godot.exe'), source: 'application' },
    ];
  }
  return [];
}

async function configuredCandidates(
  configuredPath: string,
  platform: NodeJS.Platform,
  source: EnvironmentToolSource = 'configured',
): Promise<GodotCandidate[]> {
  const normalized = validateAbsolutePath(configuredPath, 'Godot 可执行文件');
  if (platform === 'darwin' && normalized.toLowerCase().endsWith('.app')) {
    return [
      { path: join(normalized, 'Contents/MacOS/Godot'), source },
      { path: join(normalized, 'Contents/MacOS/Godot_mono'), source },
    ];
  }
  return [{ path: normalized, source }];
}

function defaultTemplateRoots(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  homeDirectory: string,
  binaryPath: string,
): string[] {
  const selfContained = join(dirname(binaryPath), 'editor_data', 'export_templates');
  if (platform === 'darwin') {
    return [
      selfContained,
      join(homeDirectory, 'Library/Application Support/Godot/export_templates'),
    ];
  }
  if (platform === 'win32') {
    return [
      selfContained,
      join(environment.APPDATA ?? join(homeDirectory, 'AppData/Roaming'), 'Godot/export_templates'),
    ];
  }
  return [
    selfContained,
    join(environment.XDG_DATA_HOME ?? join(homeDirectory, '.local/share'), 'godot/export_templates'),
  ];
}

function missingGodotTool(configuredPath: string | null, message: string): EnvironmentToolStatus {
  return {
    id: 'godot',
    label: 'Godot Engine',
    state: 'missing',
    version: null,
    binaryPath: null,
    configuredPath,
    source: configuredPath ? 'configured' : null,
    message,
  };
}

function validateAbsolutePath(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PATH_LENGTH || trimmed.includes('\0') || !isAbsolute(trimmed)) {
    throw new Error(`${label}必须是有效的绝对路径`);
  }
  return resolve(trimmed);
}

function validatePreset(value: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed
    || trimmed.length > MAX_PRESET_LENGTH
    || trimmed.startsWith('-')
    || /[\0\r\n]/u.test(trimmed)) {
    throw new Error('Godot 导出预设名称无效');
  }
  return trimmed;
}

function validateOutputPath(projectPath: string, outputPath: string): string {
  const output = validateAbsolutePath(outputPath, 'Godot 导出路径');
  const withinProject = relative(projectPath, output);
  if (!withinProject || withinProject === '..' || withinProject.startsWith(`..${sep}`) || isAbsolute(withinProject)) {
    throw new Error('Godot 导出路径必须位于项目目录内');
  }
  return output;
}

function exportArtifacts(outputPath: string): string[] {
  if (extname(outputPath).toLowerCase() !== '.html') return [outputPath];
  const base = outputPath.slice(0, -'.html'.length);
  return [outputPath, `${base}.wasm`, `${base}.pck`];
}

async function removeExistingArtifacts(paths: string[]): Promise<void> {
  await Promise.all(paths.map(async (path) => {
    try {
      await unlink(path);
    } catch (error) {
      if (asNodeError(error).code !== 'ENOENT') throw error;
    }
  }));
}

async function existingFiles(paths: string[]): Promise<string[]> {
  const checks = await Promise.all(paths.map(async (path) => {
    try {
      const details = await stat(path);
      return details.isFile() && details.size > 0 ? path : null;
    } catch {
      return null;
    }
  }));
  return checks.filter((path): path is string => Boolean(path));
}

async function runnableRealPath(path: string): Promise<string | null> {
  try {
    await access(path, constants.X_OK);
    const details = await stat(path);
    if (!details.isFile()) return null;
    return await realpath(path);
  } catch {
    return null;
  }
}

async function directoryNames(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function fileNames(path: string): Promise<string[]> {
  try {
    const entries = (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isFile());
    const usable = await Promise.all(entries.map(async (entry) => {
      try {
        return (await stat(join(path, entry.name))).size > 0 ? entry.name : null;
      } catch {
        return null;
      }
    }));
    return usable.filter((name): name is string => name !== null);
  } catch {
    return [];
  }
}

function deduplicateCandidates(candidates: GodotCandidate[]): GodotCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.path;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicate(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function appendProcessOutput(current: string, next: string): string {
  if (Buffer.byteLength(current, 'utf8') >= MAX_PROCESS_OUTPUT_BYTES) return current;
  const remaining = MAX_PROCESS_OUTPUT_BYTES - Buffer.byteLength(current, 'utf8');
  const appended = Buffer.from(next, 'utf8').subarray(0, remaining).toString('utf8');
  return current + appended;
}

function asNodeError(value: unknown): NodeJS.ErrnoException {
  return value instanceof Error ? value as NodeJS.ErrnoException : new Error(String(value));
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
