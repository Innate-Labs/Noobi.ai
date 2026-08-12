import type { Stats } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import type {
  CreateProjectInput,
  FileContent,
  FileNode,
  ProjectRecord,
} from '../shared/types.js';
import type { StateStore } from './store.js';

const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.cache',
  'coverage',
]);
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TREE_ENTRIES = 1500;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
};

const NOT_FOUND_CODES = new Set(['ENOENT', 'ENOTDIR']);

export interface GameSkillLocations {
  promptPath: string;
  templatesDir: string;
  docsDir: string;
}

export class ProjectManager {
  private previews = new Map<string, { server: Server; url: string }>();

  constructor(
    private readonly store: StateStore,
    private readonly locations: GameSkillLocations,
  ) {}

  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    const name = input.name.trim();
    const prompt = input.prompt.trim();
    if (!name) throw new Error('请输入项目名称。');
    if (!prompt) throw new Error('请输入游戏创意。');
    if (!input.directory.trim()) throw new Error('请选择项目保存目录。');

    const folderName = name
      .normalize('NFKC')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\p{Cc}/gu, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)
      .replace(/[. ]+$/g, '');
    if (
      !folderName ||
      folderName === '.' ||
      folderName === '..' ||
      isWindowsReservedBasename(folderName)
    ) {
      throw new Error('项目名称无法生成安全的目录名，请更换名称。');
    }

    const requestedWorkspace = path.resolve(input.directory.trim());
    await mkdir(requestedWorkspace, { recursive: true });
    const workspaceRoot = await realpath(requestedWorkspace);
    const workspaceInfo = await lstat(workspaceRoot);
    if (!workspaceInfo.isDirectory()) throw new Error('项目保存位置不是目录。');

    const requestedProjectPath = path.resolve(workspaceRoot, folderName);
    this.assertContained(workspaceRoot, requestedProjectPath, false);
    const projectPath = await this.prepareEmptyProjectDirectory(
      workspaceRoot,
      requestedProjectPath,
    );

    await this.prepareSystemPrompt(projectPath);

    const now = new Date().toISOString();
    const project: ProjectRecord = {
      id: randomUUID(),
      name,
      path: projectPath,
      prompt,
      status: 'draft',
      stage: 'brief',
      createdAt: now,
      updatedAt: now,
    };

    const gameAgentDir = await this.ensureDirectoryInside(
      projectPath,
      '.gameagent',
    );
    const projectMetadataPath = path.join(gameAgentDir, 'project.json');
    await this.assertSafeWritableFile(projectPath, projectMetadataPath);
    await writeFile(
      projectMetadataPath,
      JSON.stringify(project, null, 2),
      'utf8',
    );
    await this.store.upsertProject(project);
    return project;
  }

  async prepareSystemPrompt(projectPath: string): Promise<void> {
    const projectRoot = await this.resolveProjectRoot(projectPath);
    const source = await readFile(this.locations.promptPath, 'utf8');
    const localized = source
      .replace(/\{TEMPLATES_DIR\}/g, this.locations.templatesDir)
      .replace(/\{DOCS_DIR\}/g, this.locations.docsDir)
      .replace(/\{PROJECT_ROOT\}/g, projectRoot);
    const qwenDir = await this.ensureDirectoryInside(projectRoot, '.qwen');
    const systemPromptPath = path.join(qwenDir, 'system.md');
    await this.assertSafeWritableFile(projectRoot, systemPromptPath);
    await writeFile(systemPromptPath, localized, 'utf8');
  }

  async listFiles(project: ProjectRecord): Promise<FileNode[]> {
    const projectRoot = await this.resolveProjectRoot(project.path);
    let count = 0;
    const walk = async (directory: string): Promise<FileNode[]> => {
      const entries = await readdir(directory, { withFileTypes: true });
      const result: FileNode[] = [];
      for (const entry of entries.sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        if (count >= MAX_TREE_ENTRIES) break;
        if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
        count++;
        const absolutePath = path.join(directory, entry.name);
        const entryInfo = await lstat(absolutePath);
        if (entryInfo.isSymbolicLink()) continue;
        const realEntryPath = await realpath(absolutePath);
        this.assertContained(projectRoot, realEntryPath);
        const relativePath = path.relative(projectRoot, realEntryPath);
        if (entryInfo.isDirectory()) {
          result.push({
            name: entry.name,
            path: relativePath,
            type: 'directory',
            children: await walk(realEntryPath),
          });
        } else if (entryInfo.isFile()) {
          result.push({
            name: entry.name,
            path: relativePath,
            type: 'file',
            size: entryInfo.size,
          });
        }
      }
      return result;
    };

    return walk(projectRoot);
  }

  async readProjectFile(
    project: ProjectRecord,
    relativePath: string,
  ): Promise<FileContent> {
    const { absolutePath, info } = await this.resolveExistingInside(
      project.path,
      relativePath,
    );
    if (!info.isFile()) throw new Error('只能读取文件。');
    const buffer = await readFile(absolutePath);
    const truncated = buffer.byteLength > MAX_FILE_BYTES;
    return {
      path: relativePath,
      content: buffer.subarray(0, MAX_FILE_BYTES).toString('utf8'),
      truncated,
    };
  }

  async startPreview(project: ProjectRecord): Promise<string> {
    let distResult: { absolutePath: string; info: Stats };
    try {
      distResult = await this.resolveExistingInside(project.path, 'dist');
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new Error('游戏构建产物 dist/index.html 不存在，请先完成构建。');
      }
      throw error;
    }
    const { absolutePath: serveRoot, info: distInfo } = distResult;
    if (!distInfo.isDirectory()) throw new Error('游戏构建目录 dist 不存在。');
    let indexInfo: Stats;
    try {
      ({ info: indexInfo } = await this.resolveExistingInside(
        serveRoot,
        'index.html',
      ));
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new Error('游戏构建产物 dist/index.html 不存在，请先完成构建。');
      }
      throw error;
    }
    if (!indexInfo.isFile())
      throw new Error('游戏构建产物 dist/index.html 不存在。');

    await this.stopPreview(project.id);

    const server = createServer(async (request, response) => {
      try {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.writeHead(405, {
            Allow: 'GET, HEAD',
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
          });
          response.end('Method Not Allowed');
          return;
        }

        const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
        const decodedPath = decodeURIComponent(requestUrl.pathname);
        const relativePath =
          decodedPath === '/' ? 'index.html' : decodedPath.slice(1);
        let resolvedFile: { absolutePath: string; info: Stats };
        try {
          resolvedFile = await this.resolveExistingInside(
            serveRoot,
            relativePath,
          );
          if (resolvedFile.info.isDirectory()) {
            resolvedFile = await this.resolveExistingInside(
              resolvedFile.absolutePath,
              'index.html',
            );
          }
          if (!resolvedFile.info.isFile())
            throw new Error('预览目标不是文件。');
        } catch (error) {
          if (!isHtmlNavigation(request) || !isNotFoundError(error))
            throw error;
          resolvedFile = await this.resolveExistingInside(
            serveRoot,
            'index.html',
          );
        }

        const body = await readFile(resolvedFile.absolutePath);
        response.writeHead(200, {
          'Content-Type':
            MIME[path.extname(resolvedFile.absolutePath).toLowerCase()] ??
            'application/octet-stream',
          'Content-Length': body.byteLength,
          'Cache-Control': 'no-cache',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        });
        response.end(request.method === 'HEAD' ? undefined : body);
      } catch {
        response.writeHead(404, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end('预览文件不存在');
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('无法创建预览服务。');
    const url = `http://127.0.0.1:${address.port}/`;
    this.previews.set(project.id, { server, url });
    return url;
  }

  stopAllPreviews(): void {
    for (const { server } of this.previews.values()) server.close();
    this.previews.clear();
  }

  get locationsInfo(): GameSkillLocations {
    return this.locations;
  }

  private async prepareEmptyProjectDirectory(
    workspaceRoot: string,
    requestedProjectPath: string,
  ): Promise<string> {
    try {
      await mkdir(requestedProjectPath);
    } catch (error) {
      if (!isErrorCode(error, 'EEXIST')) throw error;
    }

    const info = await lstat(requestedProjectPath);
    if (info.isSymbolicLink()) throw new Error('项目目录不能是符号链接。');
    if (!info.isDirectory()) throw new Error('同名路径已存在，且不是目录。');

    const projectRoot = await realpath(requestedProjectPath);
    this.assertContained(workspaceRoot, projectRoot, false);
    if ((await readdir(projectRoot)).length > 0) {
      throw new Error('同名项目目录已存在且不是空目录，请更换项目名称。');
    }
    return projectRoot;
  }

  private async ensureDirectoryInside(
    root: string,
    relativePath: string,
  ): Promise<string> {
    const rootPath = await this.resolveProjectRoot(root);
    const directoryPath = this.resolveInside(rootPath, relativePath);
    try {
      await mkdir(directoryPath);
    } catch (error) {
      if (!isErrorCode(error, 'EEXIST')) throw error;
    }

    const info = await lstat(directoryPath);
    if (info.isSymbolicLink()) throw new Error('项目内目录不能是符号链接。');
    if (!info.isDirectory()) throw new Error('项目内目标路径不是目录。');
    const realDirectoryPath = await realpath(directoryPath);
    this.assertContained(rootPath, realDirectoryPath);
    return realDirectoryPath;
  }

  private async assertSafeWritableFile(
    root: string,
    filePath: string,
  ): Promise<void> {
    this.assertContained(root, filePath);
    try {
      const info = await lstat(filePath);
      if (info.isSymbolicLink()) throw new Error('项目内文件不能是符号链接。');
      if (!info.isFile()) throw new Error('项目内目标路径不是文件。');
      const realFilePath = await realpath(filePath);
      this.assertContained(root, realFilePath);
    } catch (error) {
      if (!isErrorCode(error, 'ENOENT')) throw error;
    }
  }

  private async resolveProjectRoot(root: string): Promise<string> {
    const resolvedRoot = path.resolve(root);
    const info = await lstat(resolvedRoot);
    if (info.isSymbolicLink()) throw new Error('项目目录不能是符号链接。');
    if (!info.isDirectory()) throw new Error('项目路径不是目录。');
    return realpath(resolvedRoot);
  }

  private async resolveExistingInside(
    root: string,
    relativePath: string,
  ): Promise<{ absolutePath: string; info: Stats }> {
    const realRoot = await this.resolveProjectRoot(root);
    const lexicalPath = this.resolveInside(path.resolve(root), relativePath);
    const info = await lstat(lexicalPath);
    if (info.isSymbolicLink())
      throw new Error('不允许通过符号链接访问项目文件。');
    const absolutePath = await realpath(lexicalPath);
    this.assertContained(realRoot, absolutePath);
    return { absolutePath, info };
  }

  private async stopPreview(projectId: string): Promise<void> {
    const active = this.previews.get(projectId);
    if (!active) return;
    this.previews.delete(projectId);
    await new Promise<void>((resolve) => active.server.close(() => resolve()));
  }

  private resolveInside(root: string, relativePath: string): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, relativePath);
    this.assertContained(resolvedRoot, resolved);
    return resolved;
  }

  private assertContained(
    root: string,
    target: string,
    allowRoot = true,
  ): void {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    if (
      (!allowRoot && relative === '') ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('路径超出项目目录。');
    }
  }
}

function isWindowsReservedBasename(value: string): boolean {
  const stem = value.split('.')[0]?.toUpperCase() ?? '';
  return /^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/.test(stem);
}

function isHtmlNavigation(request: IncomingMessage): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (request.headers['sec-fetch-mode'] === 'navigate') return true;
  return (request.headers.accept ?? '')
    .split(',')
    .some((value) => value.trim().toLowerCase().startsWith('text/html'));
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    typeof (error as NodeJS.ErrnoException).code === 'string' &&
    NOT_FOUND_CODES.has((error as NodeJS.ErrnoException).code!)
  );
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error && (error as NodeJS.ErrnoException).code === code
  );
}
