import { constants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';

const LOOPBACK_HOST = '127.0.0.1';
const MAX_REQUEST_URL_BYTES = 16 * 1024;
const READ_ONLY_NOFOLLOW = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
const CONTENT_SECURITY_POLICY = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.bin': 'application/octet-stream',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.opus': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

export interface PreviewStartOptions {
  /** Relative build directory. Defaults to dist, then the safe source fallback. */
  directory?: string;
  /** Allow index.html + src/public/assets when dist does not exist. Defaults true. */
  sourceFallback?: boolean;
}

interface PreviewRegistration {
  server: Server;
  projectRoot: string;
  contentRoot: string;
  sourceFallback: boolean;
  url: string;
}

/**
 * One loopback-only HTTP server per project. Serving each project at `/`
 * preserves absolute Vite asset URLs such as `/assets/index.js` without URL
 * rewriting or a shared cross-project namespace.
 */
export class PreviewServer {
  #registrations = new Map<string, PreviewRegistration>();
  #pendingStarts = new Map<string, Promise<string>>();

  async start(
    projectId: string,
    projectRoot: string,
    options: PreviewStartOptions = {},
  ): Promise<string> {
    const id = validateProjectId(projectId);
    const pending = this.#pendingStarts.get(id);
    if (pending) return pending;
    const start = this.#start(id, projectRoot, options).finally(() => {
      this.#pendingStarts.delete(id);
    });
    this.#pendingStarts.set(id, start);
    return start;
  }

  urlFor(projectId: string): string | null {
    return this.#registrations.get(projectId)?.url ?? null;
  }

  getUrl(projectId: string): string | null {
    return this.urlFor(projectId);
  }

  async stop(projectId: string): Promise<void> {
    const id = validateProjectId(projectId);
    await this.#pendingStarts.get(id)?.catch(() => undefined);
    const registration = this.#registrations.get(id);
    if (!registration) return;
    this.#registrations.delete(id);
    await closeServer(registration.server);
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled(this.#pendingStarts.values());
    const registrations = [...this.#registrations.values()];
    this.#registrations.clear();
    await Promise.all(registrations.map((registration) => closeServer(registration.server)));
  }

  async #start(
    projectId: string,
    projectRoot: string,
    options: PreviewStartOptions,
  ): Promise<string> {
    const selected = await selectContentRoot(projectRoot, options);
    const existing = this.#registrations.get(projectId);
    if (
      existing?.server.listening &&
      existing.projectRoot === selected.projectRoot &&
      existing.contentRoot === selected.contentRoot
    ) {
      return existing.url;
    }
    if (existing) {
      this.#registrations.delete(projectId);
      await closeServer(existing.server);
    }

    let expectedHost = '';
    const server = createServer(
      { maxHeaderSize: 16 * 1024, requestTimeout: 15_000, headersTimeout: 10_000 },
      (request, response) => {
        void handleRequest(request, response, selected, expectedHost).catch((error) => {
          sendError(response, 500, 'Preview request failed');
          // Avoid leaking local filesystem paths to the renderer/browser while
          // still making unexpected server failures observable to Main.
          server.emit('previewError', error);
        });
      },
    );
    server.keepAliveTimeout = 5_000;
    server.maxRequestsPerSocket = 100;
    server.on('clientError', (_error, socket) => {
      if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    });

    try {
      await listenOnLoopback(server);
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Preview server has no TCP address');
      expectedHost = `${LOOPBACK_HOST}:${address.port}`;
      const url = `http://${expectedHost}/`;
      this.#registrations.set(projectId, {
        server,
        projectRoot: selected.projectRoot,
        contentRoot: selected.contentRoot,
        sourceFallback: selected.sourceFallback,
        url,
      });
      return url;
    } catch (error) {
      await closeServer(server).catch(() => undefined);
      throw error;
    }
  }
}

/** Optional process-wide instance for the Electron Main composition. */
export const previewServer = new PreviewServer();

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  selected: SelectedContentRoot,
  expectedHost: string,
): Promise<void> {
  applySecurityHeaders(response);
  if (request.headers.host !== expectedHost) {
    sendError(response, 403, 'Forbidden host');
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    sendError(response, 405, 'Method not allowed');
    return;
  }
  const requestTarget = request.url ?? '/';
  if (Buffer.byteLength(requestTarget, 'utf8') > MAX_REQUEST_URL_BYTES) {
    sendError(response, 414, 'Request target too long');
    return;
  }

  let relativePath: string;
  try {
    relativePath = decodeRequestPath(requestTarget);
  } catch {
    sendError(response, 400, 'Invalid preview path');
    return;
  }
  if (selected.sourceFallback && !isAllowedSourceFallbackPath(relativePath)) {
    sendError(response, 404, 'Not found');
    return;
  }
  const requestedContentType = contentType(relativePath);
  let opened: OpenedPreviewFile | null = null;

  // Generated media lands in public/assets before a build copies it into dist.
  // Prefer that current source only for Inspector media requests; documents,
  // scripts, and styles continue to come exclusively from the selected build.
  if (
    !selected.sourceFallback &&
    isInspectorMediaAsset(relativePath, requestedContentType)
  ) {
    try {
      const sourceAssetsRoot = resolve(selected.projectRoot, 'public/assets');
      const sourceAssetPath = relativePath.slice('assets/'.length);
      opened = await openPreviewFile(sourceAssetsRoot, sourceAssetPath);
    } catch (error) {
      // An absent source asset may legitimately still exist in dist. Any other
      // failure (including a symlink or containment violation) is terminal.
      if (!isMissingPath(error)) {
        sendError(response, 404, 'Not found');
        return;
      }
    }
  }

  if (!opened) {
    // Vite publishes `public/*` at the site root. Mirror that behavior before a
    // build exists so `/assets/foo.png` resolves to `public/assets/foo.png`.
    const diskRelativePath =
      selected.sourceFallback && relativePath.startsWith('assets/')
        ? `public/${relativePath}`
        : relativePath;
    try {
      opened = await openPreviewFile(selected.contentRoot, diskRelativePath);
    } catch {
      sendError(response, 404, 'Not found');
      return;
    }
  }

  const { target, size, handle } = opened;

  const range = parseRange(request.headers.range, size);
  if (range === 'invalid') {
    await handle.close();
    response.statusCode = 416;
    response.setHeader('Content-Range', `bytes */${size}`);
    response.end();
    return;
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? Math.max(0, size - 1);
  const contentLength = size === 0 ? 0 : end - start + 1;
  const targetContentType = contentType(target);
  response.statusCode = range ? 206 : 200;
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Type', targetContentType);
  if (isInspectorMediaAsset(relativePath, targetContentType)) {
    // The Electron renderer and the per-project preview server necessarily use
    // different origins. Permit only media under the public asset namespace to
    // render in the Inspector; HTML, scripts, and other files remain isolated.
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
  response.setHeader('Content-Length', String(contentLength));
  if (range) response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  if (request.method === 'HEAD' || size === 0) {
    await handle.close();
    response.end();
    return;
  }

  await new Promise<void>((resolvePromise) => {
    const stream = handle.createReadStream({ autoClose: true, start, end });
    stream.once('error', () => {
      if (!response.headersSent) sendError(response, 500, 'Unable to read preview asset');
      else response.destroy();
      resolvePromise();
    });
    response.once('close', () => {
      stream.destroy();
      resolvePromise();
    });
    response.once('finish', resolvePromise);
    stream.pipe(response);
  });
}

interface SelectedContentRoot {
  projectRoot: string;
  contentRoot: string;
  sourceFallback: boolean;
}

interface OpenedPreviewFile {
  target: string;
  size: number;
  handle: Awaited<ReturnType<typeof open>>;
}

async function openPreviewFile(root: string, diskRelativePath: string): Promise<OpenedPreviewFile> {
  const lexical = resolve(root, ...diskRelativePath.split('/'));
  assertContained(root, lexical);
  const lexicalInfo = await lstat(lexical);
  if (lexicalInfo.isSymbolicLink() || !lexicalInfo.isFile()) throw new Error('Not a regular file');
  const target = await realpath(lexical);
  assertContained(root, target);
  const targetInfo = await stat(target);
  if (!targetInfo.isFile()) throw new Error('Not a regular file');
  const handle = await open(target, READ_ONLY_NOFOLLOW);
  try {
    const openedInfo = await handle.stat();
    if (!openedInfo.isFile()) throw new Error('Not a regular file');
    return { target, size: openedInfo.size, handle };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function selectContentRoot(
  projectRoot: string,
  options: PreviewStartOptions,
): Promise<SelectedContentRoot> {
  if (!projectRoot || !isAbsolute(projectRoot)) throw new Error('Preview project root must be absolute');
  const lexicalProjectRoot = resolve(projectRoot);
  const lexicalProjectInfo = await lstat(lexicalProjectRoot);
  if (lexicalProjectInfo.isSymbolicLink()) {
    throw new Error('Preview project root cannot be a symbolic link');
  }
  const canonicalProjectRoot = await realpath(lexicalProjectRoot);
  const projectInfo = await stat(canonicalProjectRoot);
  if (!projectInfo.isDirectory()) throw new Error('Preview project root must be a directory');

  if (options.directory !== undefined) {
    const directory = normalizedDirectory(options.directory);
    const lexical = resolve(canonicalProjectRoot, ...directory.split('/'));
    assertContained(canonicalProjectRoot, lexical);
    const lexicalInfo = await lstat(lexical);
    if (lexicalInfo.isSymbolicLink()) throw new Error('Preview directory cannot be a symbolic link');
    const contentRoot = await realpath(lexical);
    assertContained(canonicalProjectRoot, contentRoot);
    await requireIndexFile(contentRoot);
    return { projectRoot: canonicalProjectRoot, contentRoot, sourceFallback: false };
  }

  const dist = join(canonicalProjectRoot, 'dist');
  try {
    const distInfo = await lstat(dist);
    if (distInfo.isSymbolicLink()) throw new Error('Preview dist directory cannot be a symbolic link');
    const contentRoot = await realpath(dist);
    assertContained(canonicalProjectRoot, contentRoot);
    await requireIndexFile(contentRoot);
    return { projectRoot: canonicalProjectRoot, contentRoot, sourceFallback: false };
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }

  if (options.sourceFallback === false) {
    throw new Error('No preview build found. Run the project build to create dist/index.html.');
  }
  await requireIndexFile(canonicalProjectRoot);
  return {
    projectRoot: canonicalProjectRoot,
    contentRoot: canonicalProjectRoot,
    sourceFallback: true,
  };
}

async function requireIndexFile(contentRoot: string): Promise<void> {
  const lexical = join(contentRoot, 'index.html');
  const lexicalInfo = await lstat(lexical);
  if (lexicalInfo.isSymbolicLink() || !lexicalInfo.isFile()) {
    throw Object.assign(new Error('Preview root does not contain a regular index.html'), {
      code: 'ENOENT',
    });
  }
  const canonical = await realpath(lexical);
  assertContained(contentRoot, canonical);
}

function decodeRequestPath(requestTarget: string): string {
  if (!requestTarget.startsWith('/') || requestTarget.startsWith('//')) {
    throw new Error('Preview request target must be origin-form');
  }
  const rawPath = requestTarget.split(/[?#]/u, 1)[0]!;
  const decoded = decodeURIComponent(rawPath);
  if (decoded.includes('\0') || decoded.includes('\\')) throw new Error('Invalid preview path');
  const directoryRequest = decoded.endsWith('/');
  const segments = decoded.split('/').slice(1);
  if (segments.at(-1) === '') segments.pop();
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Invalid preview path segment');
  }
  if (segments.some((segment) => segment.startsWith('.'))) {
    throw new Error('Hidden preview paths are not served');
  }
  if (segments.length === 0) return 'index.html';
  if (directoryRequest) segments.push('index.html');
  return segments.join('/');
}

function isAllowedSourceFallbackPath(relativePath: string): boolean {
  if (relativePath === 'index.html' || relativePath === 'favicon.ico') return true;
  return ['src/', 'public/', 'assets/'].some((prefix) => relativePath.startsWith(prefix));
}

function normalizedDirectory(value: string): string {
  if (!value || value.includes('\0') || isAbsolute(value) || win32.isAbsolute(value)) {
    throw new Error('Preview directory must be a relative path');
  }
  const portable = value.replaceAll('\\', '/').replace(/\/+$/u, '');
  const segments = portable.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) {
    throw new Error('Preview directory contains an invalid segment');
  }
  return segments.join('/');
}

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendError(response: ServerResponse, statusCode: number, message: string): void {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(`${message}\n`);
}

function contentType(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

function isInspectorMediaAsset(relativePath: string, mimeType: string): boolean {
  if (!relativePath.startsWith('assets/')) return false;
  return ['image/', 'audio/', 'video/', 'model/'].some((prefix) => mimeType.startsWith(prefix));
}

function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  if (size === 0 || !header.startsWith('bytes=') || header.includes(',')) return 'invalid';
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header);
  if (!match || (!match[1] && !match[2])) return 'invalid';
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return 'invalid';
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return 'invalid';
  }
  if (start < 0 || end < start || start >= size) return 'invalid';
  return { start, end: Math.min(end, size - 1) };
}

function assertContained(root: string, candidate: string): void {
  const fromRoot = relative(root, candidate);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error('Preview path escapes the project root');
  }
}

function validateProjectId(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || value.includes('\0')) {
    throw new Error('Preview project id is invalid');
  }
  return value;
}

function listenOnLoopback(server: Server): Promise<void> {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      rejectPromise(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolvePromise();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host: LOOPBACK_HOST, port: 0, exclusive: true });
  });
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise<void>((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) rejectPromise(error);
      else resolvePromise();
    });
    server.closeIdleConnections();
  });
}

function isMissingPath(value: unknown): boolean {
  return value instanceof Error && 'code' in value && value.code === 'ENOENT';
}
