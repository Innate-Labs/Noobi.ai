import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parse, type DefaultTreeAdapterMap } from 'parse5';

const BUILD_TIME_TOLERANCE_MS = 2_000;
const EXCLUDED_INPUT_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'artifacts',
  'build',
  'release',
  'coverage',
  'out',
  '.next',
  '.vite',
  '.cache',
  '.git',
  '.noobi',
  '.codex',
  '.idea',
  '.vscode',
]);
const SOURCE_DIRECTORY_NAMES = new Set(['src', 'public', 'scripts', 'assets', 'static']);
const PACKAGE_INPUT_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'deno.lock',
]);
const WEB_INPUT_EXTENSIONS = new Set([
  '.avif', '.bmp', '.cjs', '.css', '.csv', '.cts', '.eot', '.fbx', '.flac', '.frag',
  '.gif', '.glb', '.gltf', '.glsl', '.htm', '.html', '.ico', '.jpeg', '.jpg', '.js',
  '.json', '.json5', '.jsx', '.less', '.m4a', '.mjs', '.mp3', '.mts', '.obj', '.ogg',
  '.otf', '.png', '.sass', '.scss', '.stl', '.svg', '.toml', '.ts', '.tsx', '.ttf',
  '.vert', '.wasm', '.wav', '.webm', '.webmanifest', '.webp', '.woff', '.woff2', '.yaml',
  '.yml',
]);
const DEFAULT_LIMITS: WebProductionBuildLimits = {
  maxDepth: 32,
  maxFiles: 25_000,
  maxDirectories: 4_096,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
};

export type WebProductionBuildReason =
  | 'ready'
  | 'invalid-project-root'
  | 'missing-dist'
  | 'empty-dist'
  | 'missing-index'
  | 'empty-index'
  | 'unsafe-symlink'
  | 'unsafe-reference'
  | 'missing-output'
  | 'limit-exceeded'
  | 'unstable-build'
  | 'stale-dist'
  | 'io-error';

export interface WebProductionBuildLimits {
  maxDepth: number;
  maxFiles: number;
  maxDirectories: number;
  maxTotalBytes: number;
}

export interface WebProductionBuildOptions {
  signal?: AbortSignal;
  /** Limits may only tighten, never raise, the host defaults. */
  limits?: Partial<WebProductionBuildLimits>;
}

export interface WebProductionBuildVerification {
  ok: boolean;
  stale: boolean;
  reason: WebProductionBuildReason;
  detail: string;
  inputsChecked: number;
  productionFilesChecked: number;
  latestInputPath: string | null;
  buildMarkerPath: string | null;
  buildMarkerMtimeMs: number | null;
  buildIdentity: string | null;
}

interface FileStamp {
  absolutePath: string;
  relativePath: string;
  mtimeMs: number;
  size: number;
}

interface ScanOptions {
  mode: 'output' | 'input';
  depth: number;
  signal?: AbortSignal;
  budget: ScanBudget;
}

class VerificationIssue extends Error {
  constructor(
    readonly reason: Exclude<WebProductionBuildReason, 'ready' | 'stale-dist' | 'io-error'>,
    message: string,
  ) {
    super(message);
  }
}

class ScanBudget {
  private files = 0;
  private directories = 0;
  private totalBytes = 0;

  constructor(private readonly limits: WebProductionBuildLimits) {}

  enterDirectory(path: string, depth: number): void {
    if (depth > this.limits.maxDepth) {
      throw new VerificationIssue(
        'limit-exceeded',
        `项目目录深度超过安全上限 ${this.limits.maxDepth}：${path}`,
      );
    }
    this.directories += 1;
    if (this.directories > this.limits.maxDirectories) {
      throw new VerificationIssue(
        'limit-exceeded',
        `项目目录数量超过安全上限 ${this.limits.maxDirectories}。`,
      );
    }
  }

  visitFile(path: string, size: number, countBytes: boolean): void {
    this.files += 1;
    if (this.files > this.limits.maxFiles) {
      throw new VerificationIssue(
        'limit-exceeded',
        `项目文件数量超过安全上限 ${this.limits.maxFiles}：${path}`,
      );
    }
    if (!countBytes) return;
    this.totalBytes += size;
    if (!Number.isSafeInteger(this.totalBytes) || this.totalBytes > this.limits.maxTotalBytes) {
      throw new VerificationIssue(
        'limit-exceeded',
        `待检查文件总大小超过安全上限 ${formatBytes(this.limits.maxTotalBytes)}：${path}`,
      );
    }
  }
}

/**
 * Read-only host verification for a Web project's production output. This
 * deliberately never runs package-manager scripts: the caller must build the
 * project first, then use this function as a deterministic delivery gate.
 */
export async function verifyWebProductionBuild(
  projectRoot: string,
  options: WebProductionBuildOptions = {},
): Promise<WebProductionBuildVerification> {
  let inputs: FileStamp[] = [];
  let outputs: FileStamp[] = [];
  let latestInput: FileStamp | null = null;
  let buildMarker: FileStamp | null = null;
  let buildIdentity: string | null = null;

  const result = (
    ok: boolean,
    stale: boolean,
    reason: WebProductionBuildReason,
    detail: string,
  ): WebProductionBuildVerification => ({
    ok,
    stale,
    reason,
    detail,
    inputsChecked: inputs.length,
    productionFilesChecked: outputs.length,
    latestInputPath: latestInput?.relativePath ?? null,
    buildMarkerPath: buildMarker?.relativePath ?? null,
    buildMarkerMtimeMs: buildMarker?.mtimeMs ?? null,
    buildIdentity,
  });

  try {
    throwIfAborted(options.signal);
    const budget = new ScanBudget(resolveLimits(options.limits));
    if (typeof projectRoot !== 'string' || projectRoot.trim().length === 0) {
      return result(false, false, 'invalid-project-root', 'Web 项目根目录为空。');
    }

    const requestedRoot = resolve(projectRoot);
    const rootStat = await lstatOrNull(requestedRoot);
    throwIfAborted(options.signal);
    if (!rootStat) {
      return result(false, false, 'invalid-project-root', `Web 项目根目录不存在或不是目录：${requestedRoot}`);
    }
    if (rootStat.isSymbolicLink()) {
      return result(false, false, 'unsafe-symlink', `Web 项目根目录不能是软链接：${requestedRoot}`);
    }
    if (!rootStat.isDirectory()) {
      return result(false, false, 'invalid-project-root', `Web 项目根目录不存在或不是目录：${requestedRoot}`);
    }
    const root = await realpath(requestedRoot);
    throwIfAborted(options.signal);
    const distRoot = resolve(root, 'dist');
    const distStat = await lstatOrNull(distRoot);
    throwIfAborted(options.signal);
    if (!distStat) {
      return result(false, false, 'missing-dist', '未找到 Web 生产构建目录 dist。');
    }
    if (distStat.isSymbolicLink()) {
      return result(false, false, 'unsafe-symlink', 'Web 生产构建目录 dist 不能是软链接。');
    }
    if (!distStat.isDirectory()) {
      return result(false, false, 'missing-dist', 'Web 生产构建路径 dist 不是目录。');
    }

    outputs = await scanTree(distRoot, root, {
      mode: 'output',
      depth: 0,
      signal: options.signal,
      budget,
    });
    if (outputs.length === 0) {
      return result(false, false, 'empty-dist', 'Web 生产构建目录 dist 为空。');
    }

    const indexPath = resolve(distRoot, 'index.html');
    const indexStat = await lstatOrNull(indexPath);
    throwIfAborted(options.signal);
    if (!indexStat) {
      return result(false, false, 'missing-index', 'Web 生产构建缺少 dist/index.html。');
    }
    if (indexStat.isSymbolicLink()) {
      return result(false, false, 'unsafe-symlink', 'dist/index.html 不能是软链接。');
    }
    if (!indexStat.isFile()) {
      return result(false, false, 'missing-index', 'dist/index.html 不是普通文件。');
    }
    const indexHtml = await readFile(indexPath, { encoding: 'utf8', signal: options.signal });
    if (indexHtml.trim().length === 0) {
      return result(false, false, 'empty-index', 'dist/index.html 没有可交付内容。');
    }

    const referencedOutputs = await verifyIndexReferences(
      indexHtml,
      indexPath,
      distRoot,
      root,
      options.signal,
    );
    const markerPaths = new Set([indexPath, ...referencedOutputs]);
    buildMarker = newestFile(outputs.filter((file) => markerPaths.has(file.absolutePath)));
    if (!buildMarker) {
      return result(false, false, 'missing-index', '无法确定 Web 生产构建标记。');
    }

    inputs = await collectRelevantInputs(root, budget, options.signal);
    latestInput = newestFile(inputs);
    if (
      latestInput
      && buildMarker
      && latestInput.mtimeMs > buildMarker.mtimeMs + BUILD_TIME_TOLERANCE_MS
    ) {
      return result(
        false,
        true,
        'stale-dist',
        `Web 生产构建已过期：${latestInput.relativePath} 比最新构建文件 ${buildMarker.relativePath} 更新。`,
      );
    }

    buildIdentity = await fingerprintProductionFiles(outputs, options.signal);
    throwIfAborted(options.signal);

    return result(
      true,
      false,
      'ready',
      `Web 生产构建可交付：检查了 ${outputs.length} 个构建文件和 ${inputs.length} 个源码输入。`,
    );
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) throw error;
    if (error instanceof VerificationIssue) {
      return result(false, false, error.reason, error.message);
    }
    const detail = error instanceof Error ? error.message : String(error);
    return result(false, false, 'io-error', `检查 Web 生产构建失败：${detail}`);
  }
}

async function collectRelevantInputs(
  root: string,
  budget: ScanBudget,
  signal?: AbortSignal,
): Promise<FileStamp[]> {
  return scanTree(root, root, { mode: 'input', depth: 0, signal, budget });
}

async function scanTree(
  directory: string,
  projectRoot: string,
  options: ScanOptions,
): Promise<FileStamp[]> {
  throwIfAborted(options.signal);
  assertWithin(projectRoot, directory, '扫描目录');
  options.budget.enterDirectory(display(projectRoot, directory), options.depth);
  const files: FileStamp[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  throwIfAborted(options.signal);
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    throwIfAborted(options.signal);
    if (options.mode === 'input' && EXCLUDED_INPUT_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const absolutePath = resolve(directory, entry.name);
    assertWithin(projectRoot, absolutePath, '扫描文件');
    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      const displayPath = display(projectRoot, absolutePath);
      throw new VerificationIssue('unsafe-symlink', `项目交付检查拒绝软链接：${displayPath}`);
    }
    if (stat.isDirectory()) {
      files.push(...await scanTree(absolutePath, projectRoot, {
        ...options,
        depth: options.depth + 1,
      }));
      continue;
    }
    if (!stat.isFile()) {
      const displayPath = display(projectRoot, absolutePath);
      throw new VerificationIssue('unsafe-reference', `项目交付检查拒绝特殊文件：${displayPath}`);
    }
    const relativePath = display(projectRoot, absolutePath);
    const relevant = options.mode === 'output' || isRelevantInputFile(relativePath);
    options.budget.visitFile(relativePath, stat.size, relevant);
    if (relevant) files.push(fileStamp(projectRoot, absolutePath, stat.mtimeMs, stat.size));
  }
  return files;
}

async function verifyIndexReferences(
  html: string,
  indexPath: string,
  distRoot: string,
  projectRoot: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const references = extractHtmlReferences(html);
  const outputs: string[] = [];
  for (const reference of references) {
    throwIfAborted(signal);
    const outputPath = resolveLocalOutputReference(reference, indexPath, distRoot);
    if (!outputPath) continue;
    assertWithin(distRoot, outputPath, '构建资源');
    const stat = await lstatOrNull(outputPath);
    throwIfAborted(signal);
    const shownReference = reference.length > 160 ? `${reference.slice(0, 157)}...` : reference;
    if (!stat) {
      throw new VerificationIssue(
        'missing-output',
        `dist/index.html 引用了不存在的本地构建资源：${shownReference}`,
      );
    }
    if (stat.isSymbolicLink()) {
      throw new VerificationIssue(
        'unsafe-symlink',
        `dist/index.html 引用的构建资源不能是软链接：${display(projectRoot, outputPath)}`,
      );
    }
    if (!stat.isFile()) {
      throw new VerificationIssue(
        'missing-output',
        `dist/index.html 引用的构建资源不是普通文件：${shownReference}`,
      );
    }
    if (stat.size === 0) {
      throw new VerificationIssue(
        'missing-output',
        `dist/index.html 引用的本地构建资源为空：${shownReference}`,
      );
    }
    outputs.push(outputPath);
  }
  return outputs;
}

function extractHtmlReferences(html: string): string[] {
  const references = new Set<string>();
  const resourceTags = new Set(['script', 'link', 'img', 'source', 'audio', 'video', 'track', 'object', 'embed', 'input', 'iframe']);
  const resourceAttributes = new Set(['src', 'href', 'poster', 'data', 'srcset']);
  // Parse HTML rather than matching tags inside comments, raw text, or
  // attribute values. Attribute names must match exactly (not data-src).
  const pending: DefaultTreeAdapterMap['node'][] = [parse(html)];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if ('childNodes' in node) {
      for (const child of node.childNodes) pending.push(child);
    }
    if (!('tagName' in node) || !resourceTags.has(node.tagName)) continue;
    for (const { name, value } of node.attrs) {
      if (!resourceAttributes.has(name)) continue;
      if (name === 'srcset') {
        const trimmed = value.trim();
        if (trimmed.startsWith('data:')) {
          references.add(trimmed);
        } else {
          for (const candidate of trimmed.split(',')) {
            const url = candidate.trim().split(/\s+/u)[0];
            if (url) references.add(url);
          }
        }
      } else if (value.trim()) {
        references.add(value.trim());
      }
    }
  }
  return [...references].sort();
}

function resolveLocalOutputReference(
  rawReference: string,
  indexPath: string,
  distRoot: string,
): string | null {
  const reference = rawReference.trim();
  if (!reference || reference.startsWith('#') || reference.startsWith('?')) return null;
  if (reference.startsWith('//')) {
    throw new VerificationIssue('unsafe-reference', 'dist/index.html 不能依赖远程网络资源。');
  }

  const scheme = /^([a-z][a-z\d+.-]*):/iu.exec(reference)?.[1]?.toLowerCase();
  if (scheme) {
    if (['data', 'mailto', 'tel', 'about'].includes(scheme)) {
      return null;
    }
    throw new VerificationIssue('unsafe-reference', `dist/index.html 包含不安全的资源协议：${scheme}:`);
  }

  const pathOnly = reference.split(/[?#]/u, 1)[0];
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathOnly).replaceAll('\\', '/');
  } catch {
    throw new VerificationIssue('unsafe-reference', `dist/index.html 包含无法解析的资源路径：${reference}`);
  }
  if (decodedPath.includes('\0')) {
    throw new VerificationIssue('unsafe-reference', 'dist/index.html 的资源路径包含空字符。');
  }
  if (!decodedPath || decodedPath === '.') return null;

  const outputPath = decodedPath.startsWith('/')
    ? resolve(distRoot, `.${decodedPath}`)
    : resolve(dirname(indexPath), decodedPath);
  if (!isWithin(distRoot, outputPath)) {
    throw new VerificationIssue(
      'unsafe-reference',
      `dist/index.html 的资源引用越过了 dist 边界：${reference}`,
    );
  }
  return outputPath;
}

function isTopLevelInputFile(name: string): boolean {
  return PACKAGE_INPUT_NAMES.has(name)
    || name === 'index.html'
    || /^\.env(?:\..+)?$/u.test(name)
    || /^vite\.config\.(?:[cm]?[jt]s)$/iu.test(name)
    || /^tsconfig(?:\..+)?\.json$/iu.test(name);
}

function isRelevantInputFile(relativePath: string): boolean {
  const segments = relativePath.split('/');
  const name = segments.at(-1) ?? relativePath;
  if (segments.length === 1 && isTopLevelInputFile(name)) return true;
  if (segments.slice(0, -1).some((segment) => SOURCE_DIRECTORY_NAMES.has(segment.toLowerCase()))) {
    return true;
  }
  return WEB_INPUT_EXTENSIONS.has(extname(name).toLowerCase());
}

function newestFile(files: readonly FileStamp[]): FileStamp | null {
  let newest: FileStamp | null = null;
  for (const file of files) {
    if (
      !newest
      || file.mtimeMs > newest.mtimeMs
      || (file.mtimeMs === newest.mtimeMs && file.relativePath > newest.relativePath)
    ) {
      newest = file;
    }
  }
  return newest;
}

async function fingerprintProductionFiles(
  files: readonly FileStamp[],
  signal?: AbortSignal,
): Promise<string> {
  const hash = createHash('sha256');
  const ordered = [...files].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  for (const file of ordered) {
    throwIfAborted(signal);
    hash.update(`${file.relativePath}\0${file.size}\0`, 'utf8');
    for await (const chunk of createReadStream(file.absolutePath, { signal })) {
      throwIfAborted(signal);
      hash.update(chunk);
    }
    const after = await lstat(file.absolutePath);
    throwIfAborted(signal);
    if (after.isSymbolicLink() || !after.isFile() || after.size !== file.size || after.mtimeMs !== file.mtimeMs) {
      throw new VerificationIssue(
        'unstable-build',
        `构建文件在校验过程中发生变化：${file.relativePath}`,
      );
    }
    hash.update('\0', 'utf8');
  }
  return `sha256:${hash.digest('hex')}`;
}

function resolveLimits(overrides?: Partial<WebProductionBuildLimits>): WebProductionBuildLimits {
  const limit = (key: keyof WebProductionBuildLimits): number => {
    const requested = overrides?.[key];
    if (requested === undefined) return DEFAULT_LIMITS[key];
    if (!Number.isSafeInteger(requested) || requested <= 0) {
      throw new VerificationIssue('limit-exceeded', `无效的 Web 构建检查上限：${key}`);
    }
    return Math.min(requested, DEFAULT_LIMITS[key]);
  };
  return {
    maxDepth: limit('maxDepth'),
    maxFiles: limit('maxFiles'),
    maxDirectories: limit('maxDirectories'),
    maxTotalBytes: limit('maxTotalBytes'),
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.ceil(bytes / (1024 * 1024))} MiB`;
  return `${Math.ceil(bytes / (1024 * 1024 * 1024))} GiB`;
}

function fileStamp(
  projectRoot: string,
  absolutePath: string,
  mtimeMs: number,
  size: number,
): FileStamp {
  return {
    absolutePath,
    relativePath: display(projectRoot, absolutePath),
    mtimeMs,
    size,
  };
}

function display(root: string, target: string): string {
  return relative(root, target).split(sep).join('/') || '.';
}

function assertWithin(root: string, target: string, label: string): void {
  if (!isWithin(root, target)) {
    throw new VerificationIssue('unsafe-reference', `${label}越过了项目边界：${target}`);
  }
}

function isWithin(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === ''
    || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot));
}

async function lstatOrNull(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
