import { execFile } from 'node:child_process';
import {
  open,
  lstat,
  mkdtemp,
  mkdir,
  readdir,
  realpath,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import extract from 'extract-zip';
import type {
  InstallGitHubSkillInput,
  ProjectRecord,
  SkillSourceInfo,
  SkillSummary,
} from '../shared/types.js';
import type { ExtensionManager } from './extensionManager.js';

const execFileAsync = promisify(execFile);
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 4_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 90_000;

export interface ParsedGitHubSkillSource {
  owner: string;
  repo: string;
  ref: string;
  path: string;
  repository: string;
  refWasDefaulted: boolean;
}

interface PreparedRepository {
  root: string;
  ref: string;
}

class ArchiveFallbackError extends Error {}

export class GitHubSkillInstaller {
  constructor(private readonly extensions: ExtensionManager) {}

  async install(
    input: InstallGitHubSkillInput,
    project?: ProjectRecord,
  ): Promise<SkillSummary> {
    const source = parseGitHubSkillSource(input);
    const temporaryRoot = await mkdtemp(
      path.join(tmpdir(), 'noobi-github-skill-'),
    );

    try {
      const prepared = await prepareRepository(source, temporaryRoot);
      const repositoryRoot = await realpath(prepared.root);
      const skillDirectory = path.resolve(repositoryRoot, source.path);
      assertContained(repositoryRoot, skillDirectory);
      const info = await lstat(skillDirectory).catch(() => undefined);
      if (!info || info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error(
          `仓库中找不到 Skill 目录：${source.path === '.' ? '仓库根目录' : source.path}`,
        );
      }
      const resolved = await realpath(skillDirectory);
      assertContained(repositoryRoot, resolved);

      const sourceInfo: SkillSourceInfo = {
        kind: 'github',
        repository: source.repository,
        ref: prepared.ref,
        path: source.path,
        url: `https://github.com/${source.repository}`,
      };
      return await this.extensions.importSkill(
        resolved,
        input.level,
        project,
        sourceInfo,
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }
}

export function parseGitHubSkillSource(
  input: Pick<InstallGitHubSkillInput, 'url' | 'path' | 'ref'>,
): ParsedGitHubSkillSource {
  const raw = input.url.trim();
  const normalizedUrl = /^[a-z][a-z\d+.-]*:/i.test(raw)
    ? raw
    : `https://github.com/${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new Error('GitHub 地址格式无效。');
  }
  if (
    parsed.protocol !== 'https:' ||
    (parsed.hostname !== 'github.com' &&
      parsed.hostname !== 'www.github.com') ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new Error('只支持 github.com 的 HTTPS 仓库地址。');
  }

  const segments = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map(decodeSegment);
  if (segments.length < 2) {
    throw new Error('GitHub 地址必须包含 owner/repository。');
  }
  const owner = segments[0] ?? '';
  const repo = (segments[1] ?? '').replace(/\.git$/i, '');
  if (!isRepositoryPart(owner) || !isRepositoryPart(repo)) {
    throw new Error('GitHub 仓库名称无效。');
  }

  let urlRef = '';
  let urlPath = '';
  if (segments.length > 2) {
    const mode = segments[2];
    if ((mode !== 'tree' && mode !== 'blob') || !segments[3]) {
      throw new Error('请使用仓库首页或包含 tree/blob 的 GitHub 地址。');
    }
    urlRef = segments[3] ?? '';
    urlPath = segments.slice(4).join('/');
    if (mode === 'blob' && /(^|\/)SKILL\.md$/i.test(urlPath)) {
      urlPath = path.posix.dirname(urlPath);
    }
  }

  const explicitRef = input.ref?.trim() ?? '';
  const ref = explicitRef || urlRef || 'main';
  validateRef(ref);
  const explicitPath = input.path?.trim() ?? '';
  const skillPath = normalizeRepositoryPath(explicitPath || urlPath || '.');

  return {
    owner,
    repo,
    ref,
    path: skillPath,
    repository: `${owner}/${repo}`,
    refWasDefaulted: !explicitRef && !urlRef,
  };
}

async function prepareRepository(
  source: ParsedGitHubSkillSource,
  temporaryRoot: string,
): Promise<PreparedRepository> {
  // A repository archive always contains the whole repo. Curated game-skill
  // libraries can hold hundreds of sibling skills and assets, so prefer a
  // sparse clone when the user already identified one subdirectory.
  if (source.path !== '.') {
    try {
      return await cloneRepository(
        source,
        temporaryRoot,
        new Error('Git sparse checkout failed.'),
      );
    } catch (gitError) {
      try {
        return await downloadRepositoryArchive(source, temporaryRoot);
      } catch (archiveError) {
        const gitDetail =
          gitError instanceof Error ? gitError.message : String(gitError);
        const archiveDetail =
          archiveError instanceof Error
            ? archiveError.message
            : String(archiveError);
        throw new Error(
          `无法下载 GitHub Skill。Git: ${gitDetail} Archive: ${archiveDetail}`,
        );
      }
    }
  }

  try {
    return await downloadRepositoryArchive(source, temporaryRoot);
  } catch (error) {
    if (!(error instanceof ArchiveFallbackError)) throw error;
    return cloneRepository(source, temporaryRoot, error);
  }
}

async function downloadRepositoryArchive(
  source: ParsedGitHubSkillSource,
  temporaryRoot: string,
): Promise<PreparedRepository> {
  const archivePath = path.join(temporaryRoot, 'repository.zip');
  const extractRoot = path.join(temporaryRoot, 'archive');
  const archiveUrl = `https://codeload.github.com/${source.owner}/${source.repo}/zip/${encodeURIComponent(source.ref)}`;
  let response: Response;
  try {
    response = await fetch(archiveUrl, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ArchiveFallbackError(
      `GitHub 下载失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok || !response.body) {
    throw new ArchiveFallbackError(`GitHub 下载返回 HTTP ${response.status}。`);
  }
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_ARCHIVE_BYTES) {
    throw new ArchiveFallbackError('GitHub 仓库压缩包超过 64 MB。');
  }

  const handle = await open(archivePath, 'wx', 0o600);
  const reader = response.body.getReader();
  let downloaded = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.byteLength;
      if (downloaded > MAX_ARCHIVE_BYTES) {
        await reader.cancel();
        throw new ArchiveFallbackError('GitHub 仓库压缩包超过 64 MB。');
      }
      await handle.write(value);
    }
  } finally {
    await handle.close();
  }

  await mkdir(extractRoot, { mode: 0o700 });
  let fileCount = 0;
  let uncompressedBytes = 0;
  await extract(archivePath, {
    dir: extractRoot,
    onEntry(entry) {
      const entryPath = entry.fileName.replaceAll('\\', '/');
      const normalized = path.posix.normalize(entryPath);
      if (
        !entryPath ||
        path.posix.isAbsolute(entryPath) ||
        normalized === '..' ||
        normalized.startsWith('../') ||
        /^[a-z]:\//i.test(entryPath)
      ) {
        throw new Error('GitHub 压缩包包含越界路径。');
      }
      const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
      if ((unixMode & 0o170000) === 0o120000) {
        throw new Error('GitHub Skill 包含不允许的符号链接。');
      }
      if (!entryPath.endsWith('/')) fileCount += 1;
      uncompressedBytes += entry.uncompressedSize;
      if (
        fileCount > MAX_ARCHIVE_FILES ||
        uncompressedBytes > MAX_ARCHIVE_BYTES
      ) {
        throw new Error('GitHub 仓库解压后超过限制（4000 个文件 / 64 MB）。');
      }
    },
  });

  const entries = (await readdir(extractRoot, { withFileTypes: true })).filter(
    (entry) => entry.name !== '__MACOSX',
  );
  if (entries.length !== 1 || !entries[0]?.isDirectory()) {
    throw new Error('GitHub 压缩包结构无效。');
  }
  return { root: path.join(extractRoot, entries[0].name), ref: source.ref };
}

async function cloneRepository(
  source: ParsedGitHubSkillSource,
  temporaryRoot: string,
  archiveError: Error,
): Promise<PreparedRepository> {
  const attempts: Array<{ url: string; useRef: boolean }> = [
    {
      url: `https://github.com/${source.owner}/${source.repo}.git`,
      useRef: true,
    },
  ];
  if (source.refWasDefaulted)
    attempts.push({ url: attempts[0]!.url, useRef: false });
  attempts.push({
    url: `git@github.com:${source.owner}/${source.repo}.git`,
    useRef: true,
  });
  if (source.refWasDefaulted)
    attempts.push({ url: attempts.at(-1)!.url, useRef: false });

  let lastError: unknown = archiveError;
  for (const [index, attempt] of attempts.entries()) {
    const destination = path.join(temporaryRoot, `git-${index}`);
    const args = [
      'clone',
      '--filter=blob:none',
      '--depth',
      '1',
      '--sparse',
      '--single-branch',
    ];
    if (attempt.useRef) args.push('--branch', source.ref);
    args.push(attempt.url, destination);
    try {
      await runGit(args);
      if (source.path !== '.') {
        await runGit([
          '-C',
          destination,
          'sparse-checkout',
          'set',
          '--no-cone',
          source.path,
        ]);
      }
      const ref = attempt.useRef
        ? source.ref
        : (
            await runGit([
              '-C',
              destination,
              'rev-parse',
              '--abbrev-ref',
              'HEAD',
            ])
          ).trim() || 'HEAD';
      return { root: destination, ref };
    } catch (error) {
      lastError = error;
      await rm(destination, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  const detail =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`无法下载 GitHub 仓库。${detail ? ` ${detail}` : ''}`);
}

async function runGit(args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
    },
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });
  return result.stdout;
}

function normalizeRepositoryPath(value: string): string {
  if (
    value.includes('\\') ||
    value.includes('\0') ||
    path.posix.isAbsolute(value)
  ) {
    throw new Error('仓库内路径必须是相对路径。');
  }
  const normalized = path.posix.normalize(value.replace(/^\.\//, ''));
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.length > 2_000
  ) {
    throw new Error('仓库内路径无效。');
  }
  return normalized || '.';
}

function validateRef(value: string): void {
  if (
    value.length > 300 ||
    value.startsWith('-') ||
    value.includes('\0') ||
    value.includes('..') ||
    /[~^:?*[\]\\\s]/.test(value)
  ) {
    throw new Error('Git Ref 无效。');
  }
}

function isRepositoryPart(value: string): boolean {
  return (
    /^[a-zA-Z0-9_.-]{1,100}$/.test(value) && value !== '.' && value !== '..'
  );
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error('GitHub 地址包含无效编码。');
  }
}

function assertContained(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('仓库内路径超出下载目录。');
  }
}
