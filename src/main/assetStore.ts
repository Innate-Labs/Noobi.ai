import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { TextDecoder } from 'node:util';

import type {
  GameAssetKind,
  GameAssetManifest,
  GameAssetRecord,
  GameAssetSource,
} from '../shared/contracts.js';

interface AssetFormat {
  kind: GameAssetKind;
  mimeType: string;
  directory: 'images' | 'audio' | 'models';
  maxBytes: number;
}

export interface RegisterAssetInput {
  projectId: string;
  root: string;
  relativePath: string;
  name?: string;
  source?: GameAssetSource;
  prompt?: string;
  provider?: string;
  metadata?: GameAssetRecord['metadata'];
}

export interface IngestGeneratedImageInput {
  projectId: string;
  root: string;
  sourcePath: string;
  prompt?: string;
  provider?: string;
}

const MANIFEST_VERSION = 1 as const;
const MANIFEST_RELATIVE_PATH = 'public/assets/asset-pack.json';
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_ASSET_COUNT = 10_000;
const MAX_IMPORT_TOTAL_BYTES = 384 * 1024 * 1024;
const MAX_GLB_JSON_BYTES = 32 * 1024 * 1024;
const MAX_GLB_NODES = 10_000;
const MAX_GLB_MESHES = 10_000;
const MAX_GLB_ACCESSORS = 50_000;
const MAX_GLB_TEXTURES = 4_096;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_BIN_CHUNK_TYPE = 0x004e4942;

const FORMATS = new Map<string, AssetFormat>([
  ['.png', { kind: 'image', mimeType: 'image/png', directory: 'images', maxBytes: 32 * 1024 * 1024 }],
  ['.jpg', { kind: 'image', mimeType: 'image/jpeg', directory: 'images', maxBytes: 32 * 1024 * 1024 }],
  ['.jpeg', { kind: 'image', mimeType: 'image/jpeg', directory: 'images', maxBytes: 32 * 1024 * 1024 }],
  ['.webp', { kind: 'image', mimeType: 'image/webp', directory: 'images', maxBytes: 32 * 1024 * 1024 }],
  ['.wav', { kind: 'audio', mimeType: 'audio/wav', directory: 'audio', maxBytes: 64 * 1024 * 1024 }],
  ['.mp3', { kind: 'audio', mimeType: 'audio/mpeg', directory: 'audio', maxBytes: 64 * 1024 * 1024 }],
  ['.ogg', { kind: 'audio', mimeType: 'audio/ogg', directory: 'audio', maxBytes: 64 * 1024 * 1024 }],
  ['.glb', { kind: 'model3d', mimeType: 'model/gltf-binary', directory: 'models', maxBytes: 128 * 1024 * 1024 }],
]);

/**
 * Owns the public, workspace-local asset manifest. Every manifest and asset is
 * treated as untrusted because Codex can edit the workspace directly.
 */
export class AssetStore {
  #tail: Promise<void> = Promise.resolve();

  list(projectId: string, root: string): Promise<GameAssetRecord[]> {
    return this.#exclusive(async () => {
      const safeRoot = await canonicalRoot(root);
      const manifest = await readManifest(safeRoot, projectId);
      const changed = await reconcileManifest(safeRoot, manifest);
      if (changed) await writeManifest(safeRoot, manifest);
      return structuredClone(manifest.assets);
    });
  }

  importFiles(projectId: string, root: string, sourcePaths: readonly string[]): Promise<GameAssetRecord[]> {
    return this.#exclusive(async () => {
      if (sourcePaths.length === 0 || sourcePaths.length > 100) {
        throw new Error('Select between 1 and 100 asset files');
      }
      const safeRoot = await canonicalRoot(root);
      const manifest = await readManifest(safeRoot, projectId);
      await reconcileManifest(safeRoot, manifest);
      let totalBytes = 0;
      const imported: GameAssetRecord[] = [];

      for (const sourcePath of sourcePaths) {
        if (!isAbsolute(sourcePath)) throw new Error('Asset import paths must be absolute');
        const sourceInfo = await lstat(sourcePath);
        if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) {
          throw new Error(`Asset import must be a regular file: ${basename(sourcePath)}`);
        }
        const format = formatForPath(sourcePath);
        assertSize(sourceInfo.size, format, sourcePath);
        totalBytes += sourceInfo.size;
        if (totalBytes > MAX_IMPORT_TOTAL_BYTES) throw new Error('Selected assets exceed the 384 MiB import limit');
        await validateFileSignature(sourcePath, format);
        const sourceHash = await hashFile(sourcePath);
        const duplicate = findDuplicate(manifest, sourceHash, format.kind);
        if (duplicate) {
          imported.push(duplicate);
          continue;
        }

        const destination = await chooseDestination(safeRoot, format, basename(sourcePath));
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
        await copyFile(sourcePath, destination, constants.COPYFILE_EXCL);
        const record = await buildRecord(safeRoot, destination, {
          source: 'imported',
          name: basename(sourcePath, extname(sourcePath)),
        });
        upsertRecord(manifest, record);
        imported.push(record);
      }

      await writeManifest(safeRoot, manifest);
      return structuredClone(imported);
    });
  }

  registerExisting(input: RegisterAssetInput): Promise<GameAssetRecord> {
    return this.#exclusive(async () => {
      const safeRoot = await canonicalRoot(input.root);
      const assetPath = await resolveExistingInside(safeRoot, input.relativePath);
      const format = formatForPath(assetPath);
      assertAssetLocation(manifestPath(safeRoot, assetPath), format);
      const info = await lstat(assetPath);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error('Registered asset must be a regular file');
      assertSize(info.size, format, assetPath);
      await validateFileSignature(assetPath, format);
      const manifest = await readManifest(safeRoot, input.projectId);
      await reconcileManifest(safeRoot, manifest);
      const record = await buildRecord(safeRoot, assetPath, {
        ...input,
        source: input.source ?? 'procedural',
      });
      const duplicate = findDuplicate(manifest, record.sha256, record.kind, record.relativePath);
      if (duplicate) {
        await writeManifest(safeRoot, manifest);
        return structuredClone(duplicate);
      }
      upsertRecord(manifest, record);
      await writeManifest(safeRoot, manifest);
      return structuredClone(record);
    });
  }

  ingestGeneratedImage(input: IngestGeneratedImageInput): Promise<GameAssetRecord> {
    return this.#exclusive(async () => {
      if (!isAbsolute(input.sourcePath)) throw new Error('Generated image path must be absolute');
      const sourceInfo = await lstat(input.sourcePath);
      if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) {
        throw new Error('Generated image must be a regular file');
      }
      const format = formatForPath(input.sourcePath);
      if (format.kind !== 'image') throw new Error('Codex generated output is not a supported image');
      assertSize(sourceInfo.size, format, input.sourcePath);
      await validateFileSignature(input.sourcePath, format);

      const safeRoot = await canonicalRoot(input.root);
      const manifest = await readManifest(safeRoot, input.projectId);
      await reconcileManifest(safeRoot, manifest);
      const sourceHash = await hashFile(input.sourcePath);
      const duplicate = findDuplicate(manifest, sourceHash, format.kind);
      if (duplicate) {
        await writeManifest(safeRoot, manifest);
        return structuredClone(duplicate);
      }
      const destination = await chooseDestination(safeRoot, format, basename(input.sourcePath));
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await copyFile(input.sourcePath, destination, constants.COPYFILE_EXCL);
      const record = await buildRecord(safeRoot, destination, {
        source: 'generated',
        prompt: input.prompt,
        provider: input.provider ?? 'codex-imagegen',
        name: basename(input.sourcePath, extname(input.sourcePath)),
      });
      upsertRecord(manifest, record);
      await writeManifest(safeRoot, manifest);
      return structuredClone(record);
    });
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolveRelease) => {
      release = resolveRelease;
    });
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

async function canonicalRoot(root: string): Promise<string> {
  if (!isAbsolute(root)) throw new Error('Project root must be absolute');
  const canonical = await realpath(resolve(root));
  const info = await stat(canonical);
  if (!info.isDirectory()) throw new Error('Project root must be a directory');
  return canonical;
}

async function resolveExistingInside(root: string, relativePath: string): Promise<string> {
  if (!relativePath || relativePath.includes('\0') || isAbsolute(relativePath)) {
    throw new Error('Asset path must be project-relative');
  }
  const candidate = resolve(root, relativePath);
  assertContained(root, candidate);
  await assertNoSymlinkComponents(root, relativePath);
  const canonical = await realpath(candidate);
  assertContained(root, canonical);
  return canonical;
}

function assertContained(root: string, candidate: string): void {
  const value = relative(root, candidate);
  if (value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value))) return;
  throw new Error('Asset path escapes the project workspace');
}

function formatForPath(filePath: string): AssetFormat {
  const extension = extname(filePath).toLowerCase();
  const format = FORMATS.get(extension);
  if (!format) throw new Error(`Unsupported asset format: ${extension || 'no extension'}`);
  return format;
}

function assertSize(size: number, format: AssetFormat, filePath: string): void {
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error(`Asset is empty: ${basename(filePath)}`);
  if (size > format.maxBytes) throw new Error(`Asset is too large: ${basename(filePath)}`);
}

async function validateFileSignature(filePath: string, format: AssetFormat): Promise<void> {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.glb') {
    await validateGlb(filePath);
    return;
  }

  const handle = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(32);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    const ascii = (start: number, end: number) => bytes.subarray(start, end).toString('ascii');
    const valid =
      (extension === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      ((extension === '.jpg' || extension === '.jpeg') && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
      (extension === '.webp' && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') ||
      (extension === '.wav' && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') ||
      (extension === '.mp3' && (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) ||
      (extension === '.ogg' && ascii(0, 4) === 'OggS');
    if (!valid) throw new Error(`Asset contents do not match ${extension}: ${basename(filePath)}`);
  } finally {
    await handle.close();
  }
}

async function validateGlb(filePath: string): Promise<void> {
  const contents = await readFile(filePath);
  if (contents.length < 20 || contents.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error(`Asset contents do not match .glb: ${basename(filePath)}`);
  }
  if (contents.readUInt32LE(4) !== 2) throw new Error('GLB assets must use version 2');
  if (contents.readUInt32LE(8) !== contents.length) throw new Error('GLB declared length does not match the file size');

  const chunks: Array<{ type: number; data: Buffer }> = [];
  let offset = 12;
  while (offset < contents.length) {
    if (offset + 8 > contents.length) throw new Error('GLB has a truncated chunk header');
    const length = contents.readUInt32LE(offset);
    const type = contents.readUInt32LE(offset + 4);
    if (length === 0 || length % 4 !== 0) throw new Error('GLB chunks must be non-empty and 4-byte aligned');
    const end = offset + 8 + length;
    if (!Number.isSafeInteger(end) || end > contents.length) throw new Error('GLB has a truncated chunk');
    chunks.push({ type, data: contents.subarray(offset + 8, end) });
    if (chunks.length > 2) throw new Error('GLB may contain only a JSON chunk and an optional BIN chunk');
    offset = end;
  }
  if (offset !== contents.length || chunks[0]?.type !== GLB_JSON_CHUNK_TYPE) {
    throw new Error('GLB must begin with a JSON chunk');
  }
  if (chunks[1] && chunks[1].type !== GLB_BIN_CHUNK_TYPE) {
    throw new Error('GLB second chunk must be binary data');
  }
  if (chunks[0].data.length > MAX_GLB_JSON_BYTES) throw new Error('GLB JSON metadata exceeds 32 MiB');

  let jsonEnd = chunks[0].data.length;
  while (jsonEnd > 0 && chunks[0].data[jsonEnd - 1] === 0x20) jsonEnd -= 1;
  if (jsonEnd === 0) throw new Error('GLB JSON chunk is empty');
  let document: unknown;
  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(chunks[0].data.subarray(0, jsonEnd));
    document = JSON.parse(json) as unknown;
  } catch {
    throw new Error('GLB JSON chunk is not valid UTF-8 JSON');
  }
  const gltf = asRecord(document);
  if (!gltf || asRecord(gltf.asset)?.version !== '2.0') throw new Error('GLB JSON must declare glTF 2.0');
  if (hasUriReference(gltf)) throw new Error('GLB must be self-contained and cannot reference external or data URIs');

  assertObjectArrayLimit(gltf.nodes, MAX_GLB_NODES, 'nodes');
  assertObjectArrayLimit(gltf.meshes, MAX_GLB_MESHES, 'meshes');
  assertObjectArrayLimit(gltf.accessors, MAX_GLB_ACCESSORS, 'accessors');
  assertObjectArrayLimit(gltf.textures, MAX_GLB_TEXTURES, 'textures');
  const images = assertObjectArrayLimit(gltf.images, MAX_GLB_TEXTURES, 'images');
  const bufferViews = assertObjectArrayLimit(gltf.bufferViews, MAX_GLB_ACCESSORS, 'bufferViews');
  const buffers = assertObjectArrayLimit(gltf.buffers, 1, 'buffers');
  if (buffers.length > 1) throw new Error('Self-contained GLB may declare at most one buffer');
  const binaryChunk = chunks[1]?.data;
  if (buffers.length === 0 && binaryChunk) throw new Error('GLB contains binary data without a buffer declaration');
  if (buffers.length === 0 && bufferViews.length > 0) throw new Error('GLB bufferViews require a buffer');
  if (buffers.length === 1) {
    if (!binaryChunk) throw new Error('GLB buffer declaration requires a BIN chunk');
    const byteLength = buffers[0].byteLength;
    if (typeof byteLength !== 'number' || !Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw new Error('GLB buffer byteLength is invalid');
    }
    if (binaryChunk.length < byteLength || binaryChunk.length > byteLength + 3) {
      throw new Error('GLB BIN chunk does not match its declared buffer length');
    }
    for (const view of bufferViews) {
      const buffer = view.buffer;
      const byteOffset = view.byteOffset ?? 0;
      const viewLength = view.byteLength;
      if (buffer !== 0 || !isNonNegativeInteger(byteOffset) || !isPositiveInteger(viewLength)) {
        throw new Error('GLB bufferView range is invalid');
      }
      if (byteOffset + viewLength > byteLength) throw new Error('GLB bufferView exceeds its buffer');
    }
  }
  for (const image of images) {
    if (
      !isNonNegativeInteger(image.bufferView) ||
      image.bufferView >= bufferViews.length ||
      !['image/jpeg', 'image/png', 'image/webp', 'image/ktx2'].includes(String(image.mimeType))
    ) {
      throw new Error('Self-contained GLB images require a valid embedded bufferView and MIME type');
    }
  }
}

function assertObjectArrayLimit(value: unknown, limit: number, label: string): Array<Record<string, unknown>> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`GLB ${label} must be an array`);
  if (value.length > limit) throw new Error(`GLB contains too many ${label}`);
  const records = value.map(asRecord);
  if (records.some((item) => !item)) throw new Error(`GLB ${label} entries must be objects`);
  return records as Array<Record<string, unknown>>;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function hasUriReference(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasUriReference(item, seen));
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === 'uri' && typeof item === 'string') return true;
    if (hasUriReference(item, seen)) return true;
  }
  return false;
}

async function chooseDestination(root: string, format: AssetFormat, originalName: string): Promise<string> {
  const extension = extname(originalName).toLowerCase();
  const stem = safeStem(basename(originalName, extname(originalName)));
  const directory = await ensureAssetDirectory(root, format.directory);
  for (let index = 0; index < 1_000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const candidate = join(directory, `${stem}${suffix}${extension}`);
    try {
      await lstat(candidate);
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return candidate;
      throw error;
    }
  }
  throw new Error(`Unable to choose an unused asset filename for ${originalName}`);
}

function assertAssetLocation(relativePath: string, format: AssetFormat): void {
  const segments = relativePath.split('/');
  if (
    segments.length !== 4 ||
    segments[0] !== 'public' ||
    segments[1] !== 'assets' ||
    segments[2] !== format.directory
  ) {
    throw new Error('Assets must live directly in their public/assets type directory');
  }
}

async function ensureAssetDirectory(root: string, directory: AssetFormat['directory'] | ''): Promise<string> {
  let current = root;
  for (const segment of ['public', 'assets', ...(directory ? [directory] : [])]) {
    current = join(current, segment);
    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error) {
      if (!isNodeError(error, 'EEXIST')) throw error;
    }
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error('Asset directories cannot be symbolic links');
    }
    const canonical = await realpath(current);
    assertContained(root, canonical);
  }
  return current;
}

async function assertNoSymlinkComponents(root: string, relativePath: string): Promise<void> {
  let current = root;
  for (const segment of relativePath.split('/')) {
    current = join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error('Asset paths cannot contain symbolic links');
  }
}

function safeStem(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
  return normalized || 'asset';
}

async function buildRecord(
  root: string,
  filePath: string,
  input: Partial<RegisterAssetInput> & { source: GameAssetSource },
): Promise<GameAssetRecord> {
  const format = formatForPath(filePath);
  const info = await stat(filePath);
  return {
    id: randomUUID(),
    name: cleanText(input.name ?? basename(filePath, extname(filePath)), 160, 'Asset'),
    kind: format.kind,
    source: input.source,
    relativePath: manifestPath(root, filePath),
    mimeType: format.mimeType,
    size: info.size,
    sha256: await hashFile(filePath),
    createdAt: new Date().toISOString(),
    ...(input.prompt ? { prompt: cleanText(input.prompt, 4_000, '') } : {}),
    ...(input.provider ? { provider: cleanText(input.provider, 120, '') } : {}),
    ...(input.metadata ? { metadata: sanitizeMetadata(input.metadata) } : {}),
  };
}

function manifestPath(root: string, filePath: string): string {
  assertContained(root, filePath);
  return relative(root, filePath).split(sep).join('/');
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolveHash, rejectHash) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', rejectHash);
    stream.once('end', resolveHash);
  });
  return hash.digest('hex');
}

async function readManifest(root: string, projectId: string): Promise<GameAssetManifest> {
  const path = join(root, MANIFEST_RELATIVE_PATH);
  let contents: string;
  try {
    await assertNoSymlinkComponents(root, MANIFEST_RELATIVE_PATH);
    const info = await stat(path);
    if (info.size > MAX_MANIFEST_BYTES) throw new Error('Asset manifest exceeds 4 MiB');
    contents = await readFile(path, 'utf8');
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) throw error;
    return emptyManifest(projectId);
  }
  const value = JSON.parse(contents) as unknown;
  return validateManifest(value, projectId);
}

function validateManifest(value: unknown, projectId: string): GameAssetManifest {
  const record = asRecord(value);
  if (record?.version !== MANIFEST_VERSION || record.projectId !== projectId || !Array.isArray(record.assets)) {
    throw new Error('Asset manifest does not match this project or schema version');
  }
  if (record.assets.length > MAX_ASSET_COUNT) throw new Error('Asset manifest contains too many entries');
  const assets = record.assets.map(validateRecord);
  const paths = new Set<string>();
  for (const asset of assets) {
    if (paths.has(asset.relativePath)) throw new Error(`Duplicate asset path: ${asset.relativePath}`);
    paths.add(asset.relativePath);
  }
  return {
    version: MANIFEST_VERSION,
    projectId,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    assets,
  };
}

function validateRecord(value: unknown): GameAssetRecord {
  const record = asRecord(value);
  const kind = record?.kind;
  const source = record?.source;
  if (!record || !['image', 'audio', 'model3d'].includes(String(kind))) throw new Error('Invalid asset kind');
  if (!['generated', 'imported', 'procedural'].includes(String(source))) throw new Error('Invalid asset source');
  const relativePath = requiredString(record.relativePath, 1_000);
  if (
    isAbsolute(relativePath) ||
    relativePath.includes('\\') ||
    relativePath.includes('\0') ||
    relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Invalid manifest asset path');
  }
  const format = formatForPath(relativePath);
  assertAssetLocation(relativePath, format);
  if (kind !== format.kind || record.mimeType !== format.mimeType) {
    throw new Error('Asset manifest type does not match its file extension');
  }
  const size = requiredNumber(record.size);
  if (size === 0 || size > format.maxBytes) throw new Error('Asset manifest size is invalid');
  const sha256 = requiredString(record.sha256, 64);
  if (!/^[a-f0-9]{64}$/u.test(sha256)) throw new Error('Asset manifest SHA-256 is invalid');
  return {
    id: requiredString(record.id, 200),
    name: requiredString(record.name, 160),
    kind: kind as GameAssetKind,
    source: source as GameAssetSource,
    relativePath,
    mimeType: requiredString(record.mimeType, 120),
    size,
    sha256,
    createdAt: requiredString(record.createdAt, 100),
    ...(typeof record.prompt === 'string' ? { prompt: cleanText(record.prompt, 4_000, '') } : {}),
    ...(typeof record.provider === 'string' ? { provider: cleanText(record.provider, 120, '') } : {}),
    ...(asRecord(record.metadata) ? { metadata: sanitizeMetadata(record.metadata as GameAssetRecord['metadata']) } : {}),
  };
}

async function reconcileManifest(root: string, manifest: GameAssetManifest): Promise<boolean> {
  const retained: GameAssetRecord[] = [];
  const knownPaths = new Set<string>();
  const knownHashes = new Set<string>();
  let changed = false;

  for (const asset of manifest.assets) {
    try {
      const path = await resolveExistingInside(root, asset.relativePath);
      const format = formatForPath(path);
      assertAssetLocation(asset.relativePath, format);
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error('Not a regular asset');
      assertSize(info.size, format, path);
      await validateFileSignature(path, format);
      const sha256 = await hashFile(path);
      if (knownHashes.has(sha256)) {
        changed = true;
        continue;
      }
      const normalized = {
        ...asset,
        kind: format.kind,
        mimeType: format.mimeType,
        size: info.size,
        sha256,
      } satisfies GameAssetRecord;
      if (
        asset.kind !== normalized.kind ||
        asset.mimeType !== normalized.mimeType ||
        asset.size !== normalized.size ||
        asset.sha256 !== normalized.sha256
      ) {
        changed = true;
      }
      retained.push(normalized);
      knownPaths.add(asset.relativePath);
      knownHashes.add(sha256);
    } catch {
      changed = true;
    }
  }
  if (retained.length !== manifest.assets.length) changed = true;
  manifest.assets = retained;

  for (const directory of ['images', 'audio', 'models'] as const) {
    const base = join(root, 'public', 'assets', directory);
    let entries;
    try {
      const baseInfo = await lstat(base);
      if (baseInfo.isSymbolicLink() || !baseInfo.isDirectory()) continue;
      const canonicalBase = await realpath(base);
      assertContained(root, canonicalBase);
      entries = await readdir(base, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink()) continue;
      const path = join(base, entry.name);
      const relativePath = manifestPath(root, path);
      if (knownPaths.has(relativePath)) continue;
      try {
        const format = formatForPath(path);
        assertAssetLocation(relativePath, format);
        const info = await stat(path);
        assertSize(info.size, format, path);
        await validateFileSignature(path, format);
        const sha256 = await hashFile(path);
        if (knownHashes.has(sha256)) continue;
        const record = await buildRecord(root, path, {
          source: format.kind === 'image' ? 'generated' : 'procedural',
          name: basename(path, extname(path)),
          provider: 'workspace-agent',
        });
        upsertRecord(manifest, record);
        knownPaths.add(relativePath);
        knownHashes.add(record.sha256);
        changed = true;
      } catch {
        // Unsupported or malformed files remain visible in the file inspector,
        // but never become trusted game assets.
      }
    }
  }
  return changed;
}

async function writeManifest(root: string, manifest: GameAssetManifest): Promise<void> {
  if (manifest.assets.length > MAX_ASSET_COUNT) throw new Error('Asset manifest contains too many entries');
  manifest.assets.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  manifest.updatedAt = new Date().toISOString();
  const path = join(root, MANIFEST_RELATIVE_PATH);
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await ensureAssetDirectory(root, '');
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_MANIFEST_BYTES) {
    throw new Error('Asset manifest exceeds 4 MiB');
  }
  await writeFile(temp, serialized, { encoding: 'utf8', mode: 0o600 });
  await rename(temp, path);
}

function upsertRecord(manifest: GameAssetManifest, record: GameAssetRecord): void {
  const index = manifest.assets.findIndex((asset) => asset.relativePath === record.relativePath);
  if (index >= 0) manifest.assets[index] = record;
  else manifest.assets.push(record);
  if (manifest.assets.length > MAX_ASSET_COUNT) throw new Error('Asset manifest contains too many entries');
}

function findDuplicate(
  manifest: GameAssetManifest,
  sha256: string,
  kind: GameAssetKind,
  exceptPath?: string,
): GameAssetRecord | undefined {
  return manifest.assets.find(
    (asset) => asset.sha256 === sha256 && asset.kind === kind && asset.relativePath !== exceptPath,
  );
}

function emptyManifest(projectId: string): GameAssetManifest {
  return {
    version: MANIFEST_VERSION,
    projectId,
    updatedAt: new Date().toISOString(),
    assets: [],
  };
}

function cleanText(value: string, maxLength: number, fallback: string): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, maxLength);
  return cleaned || fallback;
}

function requiredString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new Error('Invalid asset manifest string');
  }
  return value;
}

function requiredNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid asset manifest number');
  }
  return value;
}

function sanitizeMetadata(value: GameAssetRecord['metadata']): NonNullable<GameAssetRecord['metadata']> {
  const output: NonNullable<GameAssetRecord['metadata']> = {};
  if (!value) return output;
  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/u.test(key)) continue;
    if (item === null || typeof item === 'boolean') output[key] = item;
    else if (typeof item === 'number' && Number.isFinite(item)) output[key] = item;
    else if (typeof item === 'string') output[key] = item.slice(0, 500);
  }
  return output;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}
