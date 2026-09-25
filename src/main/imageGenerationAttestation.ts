import { createHash, randomUUID } from 'node:crypto';
import {
  constants,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
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
import type { GameAssetRecord } from '../shared/contracts.js';

const LEDGER_VERSION = 1;
const MAX_LEDGER_BYTES = 2 * 1024 * 1024;
const MAX_ATTESTATIONS = 10_000;
const MAX_REFERENCE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_REFERENCE_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_REFERENCE_FILES = 5_000;
const MAX_GENERATED_OUTPUT_FILES = 5_000;
const MAX_GENERATED_OUTPUT_DEPTH = 4;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
const MAX_MODEL3D_BYTES = 128 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  '.astro', '.cfg', '.cjs', '.css', '.gd', '.gdshader', '.godot', '.htm', '.html',
  '.js', '.json', '.json5', '.jsx', '.less', '.mjs', '.sass', '.scss', '.svelte',
  '.ts', '.tscn', '.tres', '.tsx', '.vue',
]);
const PRODUCTION_DIRECTORIES = [
  'src', 'app', 'pages', 'components', 'scenes', 'scripts', 'resources',
  'public', 'dist', 'build', 'out',
] as const;
const ROOT_PRODUCTION_FILE = /^(?:(?:app|game|index|main|style)\.[^.]+|project\.godot)$/iu;
const TEST_FILE = /(?:^|[._-])(?:spec|test|tests|stories)(?:[._-]|$)/iu;
const IMAGE_PATH = /^public\/assets\/images\/[^/]+\.(?:jpe?g|png|webp)$/iu;
const AUDIO_PATH = /^public\/assets\/audio\/[^/]+\.(?:mp3|ogg|wav)$/iu;
const MODEL3D_PATH = /^public\/assets\/models\/[^/]+\.glb$/iu;
const ATTESTED_MEDIA_PATH = /^public\/assets\/(?:images\/[^/]+\.(?:jpe?g|png|webp)|audio\/[^/]+\.(?:mp3|ogg|wav)|models\/[^/]+\.glb)$/iu;
const SHA256 = /^[a-f0-9]{64}$/u;
const PROJECT_ID = /^[a-zA-Z0-9_-]{1,128}$/u;

export interface ImageGenerationAttestation {
  projectId: string;
  relativePath: string;
  sha256: string;
  /** Host-observed generator identity; never copied from the workspace manifest. */
  provider: string;
  recordedAt: string;
}

export type ImageGenerationVerification =
  | {
      ok: true;
      asset: Pick<GameAssetRecord, 'relativePath' | 'sha256'> & { provider: string };
      referencedBy: string;
    }
  | {
      ok: false;
      reason: 'missing-attestation' | 'asset-mismatch';
    }
  | {
      ok: false;
      reason: 'missing-production-reference';
      candidatePaths: string[];
    };

export type AudioGenerationVerification = ImageGenerationVerification;

type CurrentGeneratedAsset = Pick<
  GameAssetRecord,
  'kind' | 'relativePath' | 'sha256' | 'size'
>;

interface LedgerDocument {
  version: typeof LEDGER_VERSION;
  attestations: ImageGenerationAttestation[];
}

/**
 * Stores generated-media provenance outside Agent-writable workspaces. Public
 * asset manifests are intentionally never accepted as proof of provider
 * identity.
 */
export class ImageGenerationAttestationStore {
  readonly #storageFile: string;
  #attestations: ImageGenerationAttestation[] = [];
  #loaded = false;
  #tail: Promise<void> = Promise.resolve();

  constructor(storageFile: string) {
    if (!isAbsolute(storageFile)) throw new Error('Image attestation storage path must be absolute');
    this.#storageFile = resolve(storageFile);
  }

  init(): Promise<void> {
    return this.#exclusive(async () => {
      if (this.#loaded) return;
      await mkdir(dirname(this.#storageFile), { recursive: true, mode: 0o700 });
      try {
        const info = await stat(this.#storageFile);
        if (!info.isFile() || info.size > MAX_LEDGER_BYTES) {
          throw new Error('Image attestation ledger is invalid');
        }
        this.#attestations = parseLedger(await readFile(this.#storageFile, 'utf8'));
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) throw error;
        this.#attestations = [];
        await this.#persist();
      }
      this.#loaded = true;
    });
  }

  record(input: Pick<ImageGenerationAttestation, 'projectId' | 'relativePath' | 'sha256'> & { provider?: string }): Promise<void> {
    return this.#exclusive(async () => {
      await this.#ensureLoaded();
      const attestation = validateAttestation({
        ...input,
        provider: input.provider ?? 'codex-imagegen',
        recordedAt: new Date().toISOString(),
      });
      const existing = this.#attestations.findIndex((candidate) =>
        candidate.projectId === attestation.projectId
        && candidate.relativePath === attestation.relativePath
        && candidate.sha256 === attestation.sha256);
      if (existing >= 0) return;
      this.#attestations.push(attestation);
      if (this.#attestations.length > MAX_ATTESTATIONS) {
        this.#attestations.splice(0, this.#attestations.length - MAX_ATTESTATIONS);
      }
      await this.#persist();
    });
  }

  removeProject(projectId: string): Promise<void> {
    return this.#exclusive(async () => {
      await this.#ensureLoaded();
      if (!PROJECT_ID.test(projectId)) throw new Error('Invalid attestation project ID');
      const next = this.#attestations.filter((item) => item.projectId !== projectId);
      if (next.length === this.#attestations.length) return;
      this.#attestations = next;
      await this.#persist();
    });
  }

  /**
   * One-time compatibility path for assets ingested before the private ledger
   * existed. Proof comes from a byte-identical file with the same basename in
   * the app-owned Codex generated_images tree, never from manifest metadata.
   */
  async bootstrapFromManagedOutputs(input: {
    projectId: string;
    root: string;
    generatedImagesRoot: string;
    assets: readonly CurrentGeneratedAsset[];
  }): Promise<number> {
    const candidates = input.assets.filter(isCurrentImageAsset);
    if (candidates.length === 0) return 0;
    const managedOutputs = await indexManagedGeneratedImages(input.generatedImagesRoot, candidates);
    let recorded = 0;
    for (const asset of candidates) {
      const hashes = managedOutputs.get(basename(asset.relativePath));
      if (!hashes?.has(asset.sha256)) continue;
      if (!(await projectAssetMatches(input.root, asset.relativePath, asset.sha256))) continue;
      await this.record({
        projectId: input.projectId,
        relativePath: asset.relativePath,
        sha256: asset.sha256,
        provider: 'codex-imagegen',
      });
      recorded += 1;
    }
    return recorded;
  }

  async verify(input: {
    projectId: string;
    root: string;
    assets: readonly CurrentGeneratedAsset[];
  }): Promise<ImageGenerationVerification> {
    const attestations = (await this.#forProject(input.projectId))
      .filter((attestation) => IMAGE_PATH.test(attestation.relativePath));
    if (attestations.length === 0) return { ok: false, reason: 'missing-attestation' };

    const matches: Array<{ asset: CurrentGeneratedAsset; provider: string }> = [];
    for (const asset of input.assets) {
      if (!isCurrentImageAsset(asset)) continue;
      const proof = attestations.find((candidate) =>
        candidate.relativePath === asset.relativePath && candidate.sha256 === asset.sha256);
      if (!proof) continue;
      if (await projectAssetMatches(input.root, asset.relativePath, asset.sha256)) {
        matches.push({ asset, provider: proof.provider });
      }
    }
    if (matches.length === 0) return { ok: false, reason: 'asset-mismatch' };

    for (const match of matches) {
      const { asset } = match;
      const referencedBy = await findProductionAssetReference(input.root, asset.relativePath);
      if (referencedBy) {
        return {
          ok: true,
          asset: {
            relativePath: asset.relativePath,
            sha256: asset.sha256,
            provider: match.provider,
          },
          referencedBy,
        };
      }
    }
    return {
      ok: false,
      reason: 'missing-production-reference',
      candidatePaths: matches.map(({ asset }) => asset.relativePath),
    };
  }

  async verifyAudio(input: {
    projectId: string;
    root: string;
    assets: readonly CurrentGeneratedAsset[];
  }): Promise<AudioGenerationVerification> {
    const attestations = (await this.#forProject(input.projectId))
      .filter((attestation) =>
        AUDIO_PATH.test(attestation.relativePath)
        && /^api:minimax-audio(?:-cn)?:/u.test(attestation.provider));
    if (attestations.length === 0) return { ok: false, reason: 'missing-attestation' };

    const matches: Array<{ asset: CurrentGeneratedAsset; provider: string }> = [];
    for (const asset of input.assets) {
      if (!isCurrentAudioAsset(asset)) continue;
      const proof = attestations.find((candidate) =>
        candidate.relativePath === asset.relativePath && candidate.sha256 === asset.sha256);
      if (!proof) continue;
      if (await projectAssetMatches(
        input.root,
        asset.relativePath,
        asset.sha256,
        asset.size,
      )) {
        matches.push({ asset, provider: proof.provider });
      }
    }
    if (matches.length === 0) return { ok: false, reason: 'asset-mismatch' };

    for (const match of matches) {
      const { asset } = match;
      const referencedBy = await findProductionAssetReference(input.root, asset.relativePath);
      if (referencedBy) {
        return {
          ok: true,
          asset: {
            relativePath: asset.relativePath,
            sha256: asset.sha256,
            provider: match.provider,
          },
          referencedBy,
        };
      }
    }
    return {
      ok: false,
      reason: 'missing-production-reference',
      candidatePaths: matches.map(({ asset }) => asset.relativePath),
    };
  }

  async #forProject(projectId: string): Promise<ImageGenerationAttestation[]> {
    if (!PROJECT_ID.test(projectId)) throw new Error('Invalid attestation project ID');
    return this.#exclusive(async () => {
      await this.#ensureLoaded();
      return this.#attestations
        .filter((attestation) => attestation.projectId === projectId)
        .map((attestation) => ({ ...attestation }));
    });
  }

  async #ensureLoaded(): Promise<void> {
    if (this.#loaded) return;
    await mkdir(dirname(this.#storageFile), { recursive: true, mode: 0o700 });
    try {
      const info = await stat(this.#storageFile);
      if (!info.isFile() || info.size > MAX_LEDGER_BYTES) {
        throw new Error('Image attestation ledger is invalid');
      }
      this.#attestations = parseLedger(await readFile(this.#storageFile, 'utf8'));
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
      this.#attestations = [];
      await this.#persist();
    }
    this.#loaded = true;
  }

  async #persist(): Promise<void> {
    const document: LedgerDocument = { version: LEDGER_VERSION, attestations: this.#attestations };
    const serialized = `${JSON.stringify(document, null, 2)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_LEDGER_BYTES) {
      throw new Error('Image attestation ledger exceeds its size limit');
    }
    const temporary = `${this.#storageFile}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, this.#storageFile);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolveRelease) => { release = resolveRelease; });
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

async function indexManagedGeneratedImages(
  generatedImagesRoot: string,
  assets: readonly CurrentGeneratedAsset[],
): Promise<Map<string, Set<string>>> {
  if (!isAbsolute(generatedImagesRoot)) return new Map();
  const wanted = new Map<string, Set<string>>();
  for (const asset of assets) {
    const hashes = wanted.get(basename(asset.relativePath)) ?? new Set<string>();
    hashes.add(asset.sha256);
    wanted.set(basename(asset.relativePath), hashes);
  }

  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(generatedImagesRoot);
    if (!(await stat(canonicalRoot)).isDirectory()) return new Map();
  } catch {
    return new Map();
  }

  const found = new Map<string, Set<string>>();
  const stack: Array<{ path: string; depth: number }> = [{ path: canonicalRoot, depth: 0 }];
  let visited = 0;
  while (stack.length > 0 && visited < MAX_GENERATED_OUTPUT_FILES) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (visited >= MAX_GENERATED_OUTPUT_FILES) break;
      const path = join(current.path, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (current.depth < MAX_GENERATED_OUTPUT_DEPTH) {
          stack.push({ path, depth: current.depth + 1 });
        }
        continue;
      }
      if (!entry.isFile() || !wanted.has(entry.name)) continue;
      visited += 1;
      try {
        const canonicalPath = await realpath(path);
        if (!isContained(canonicalRoot, canonicalPath)) continue;
        const info = await lstat(canonicalPath);
        if (!info.isFile() || info.isSymbolicLink() || info.size === 0 || info.size > MAX_IMAGE_BYTES) continue;
        const hash = await hashRegularFile(canonicalPath, MAX_IMAGE_BYTES);
        if (!wanted.get(entry.name)!.has(hash)) continue;
        const hashes = found.get(entry.name) ?? new Set<string>();
        hashes.add(hash);
        found.set(entry.name, hashes);
      } catch {
        // A disappearing or unreadable managed output is not usable proof.
      }
    }
  }
  return found;
}

async function projectAssetMatches(
  root: string,
  relativePath: string,
  sha256: string,
  expectedSize?: number,
): Promise<boolean> {
  const maximumBytes = maximumBytesForMediaPath(relativePath);
  if (!isAbsolute(root) || maximumBytes === null || !SHA256.test(sha256)) return false;
  try {
    const canonicalRoot = await realpath(root);
    let current = canonicalRoot;
    for (const segment of relativePath.split('/')) {
      current = join(current, segment);
      const info = await lstat(current);
      if (info.isSymbolicLink()) return false;
    }
    const canonicalPath = await realpath(current);
    if (!isContained(canonicalRoot, canonicalPath)) return false;
    const info = await lstat(canonicalPath);
    if (
      !info.isFile()
      || info.isSymbolicLink()
      || info.size === 0
      || info.size > maximumBytes
      || (expectedSize !== undefined && info.size !== expectedSize)
    ) return false;
    return (await hashRegularFile(canonicalPath, maximumBytes)) === sha256;
  } catch {
    return false;
  }
}

export async function findProductionAssetReference(root: string, relativePath: string): Promise<string | null> {
  if (!isAbsolute(root) || !ATTESTED_MEDIA_PATH.test(relativePath)) return null;
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(root);
  } catch {
    return null;
  }
  const references = pathReferences(relativePath);
  const candidates: string[] = [];
  for (const directory of PRODUCTION_DIRECTORIES) {
    const path = join(canonicalRoot, directory);
    try {
      const info = await lstat(path);
      if (info.isDirectory() && !info.isSymbolicLink()) candidates.push(path);
    } catch {
      // Missing framework directories are expected.
    }
  }
  try {
    for (const entry of await readdir(canonicalRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !ROOT_PRODUCTION_FILE.test(entry.name)) continue;
      if (!TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      candidates.push(join(canonicalRoot, entry.name));
    }
  } catch {
    return null;
  }

  const stack = [...candidates];
  let files = 0;
  let totalBytes = 0;
  while (stack.length > 0 && files < MAX_REFERENCE_FILES && totalBytes < MAX_REFERENCE_TOTAL_BYTES) {
    const path = stack.pop()!;
    let info;
    try {
      info = await lstat(path);
    } catch {
      continue;
    }
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) {
      const directoryRelative = relative(canonicalRoot, path).split(sep).join('/');
      if (directoryRelative === 'public/assets' || directoryRelative.startsWith('public/assets/')) continue;
      let entries;
      try {
        entries = await readdir(path, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory() || (entry.isFile() && isTextProductionFile(entry.name))) {
          stack.push(join(path, entry.name));
        }
      }
      continue;
    }
    if (!info.isFile() || !isTextProductionFile(basename(path))) continue;
    if (info.size === 0 || info.size > MAX_REFERENCE_FILE_BYTES) continue;
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(path);
    } catch {
      continue;
    }
    if (!isContained(canonicalRoot, canonicalPath)) continue;
    files += 1;
    totalBytes += info.size;
    if (totalBytes > MAX_REFERENCE_TOTAL_BYTES) break;
    try {
      const contents = await readFile(canonicalPath, 'utf8');
      const productionContents = withoutSourceComments(canonicalPath, contents);
      if (references.some((reference) => productionContents.includes(reference))) {
        return relative(canonicalRoot, canonicalPath).split(sep).join('/');
      }
    } catch {
      // Unreadable files cannot prove production use.
    }
  }
  return null;
}

function pathReferences(relativePath: string): string[] {
  const publicUrl = relativePath.slice('public'.length);
  return [
    relativePath,
    `/${relativePath}`,
    publicUrl,
    publicUrl.slice(1),
    `res://${relativePath}`,
  ];
}

/**
 * Removes source comments before looking for an asset reference. This is not a
 * full language parser, but it deliberately preserves quoted JS/CSS strings and
 * HTML attributes while rejecting the comment-only false positive that would
 * otherwise let an unused path satisfy the host completion gate.
 */
function withoutSourceComments(filePath: string, source: string): string {
  const extension = extname(filePath).toLowerCase();
  const htmlLike = ['.astro', '.htm', '.html', '.svelte', '.vue'].includes(extension);
  const slashLineComments = !['.css', '.less', '.sass', '.scss'].includes(extension);
  const withoutHtmlComments = htmlLike ? maskHtmlComments(source) : source;
  const withoutSlashComments = maskSlashComments(withoutHtmlComments, slashLineComments);
  if (extension === '.gd' || extension === '.gdshader') {
    return maskMarkerLineComments(withoutSlashComments, new Set(['#']));
  }
  if (extension === '.cfg' || extension === '.godot' || extension === '.tscn' || extension === '.tres') {
    return maskMarkerLineComments(withoutSlashComments, new Set(['#', ';']));
  }
  return withoutSlashComments;
}

function maskHtmlComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/gu, (comment) =>
    comment.replace(/[^\r\n]/gu, ' '));
}

function maskSlashComments(source: string, lineComments: boolean): string {
  const output = [...source];
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  for (let index = 0; index < output.length; index += 1) {
    const current = output[index]!;
    const next = output[index + 1];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (current === '\\') {
        escaped = true;
      } else if (current === quote) {
        quote = null;
      }
      continue;
    }
    if (current === "'" || current === '"' || current === '`') {
      quote = current;
      continue;
    }
    if (current !== '/' || (next !== '*' && (!lineComments || next !== '/'))) continue;

    const block = next === '*';
    output[index] = ' ';
    output[index + 1] = ' ';
    index += 2;
    for (; index < output.length; index += 1) {
      const character = output[index]!;
      if (block && character === '*' && output[index + 1] === '/') {
        output[index] = ' ';
        output[index + 1] = ' ';
        index += 1;
        break;
      }
      if (!block && (character === '\n' || character === '\r')) {
        index -= 1;
        break;
      }
      if (character !== '\n' && character !== '\r') output[index] = ' ';
    }
  }
  return output.join('');
}

function maskMarkerLineComments(source: string, markers: ReadonlySet<string>): string {
  const output = [...source];
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let index = 0; index < output.length; index += 1) {
    const current = output[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === quote) quote = null;
      continue;
    }
    if (current === "'" || current === '"') {
      quote = current;
      continue;
    }
    if (!markers.has(current)) continue;
    for (; index < output.length; index += 1) {
      const character = output[index]!;
      if (character === '\n' || character === '\r') {
        index -= 1;
        break;
      }
      output[index] = ' ';
    }
  }
  return output.join('');
}

function isTextProductionFile(name: string): boolean {
  return name.toLowerCase() !== 'asset-pack.json'
    && !TEST_FILE.test(name)
    && TEXT_EXTENSIONS.has(extname(name).toLowerCase());
}

async function hashRegularFile(path: string, maximumBytes: number): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size === 0 || info.size > maximumBytes) {
      throw new Error('File is outside the accepted media size range');
    }
    const hash = createHash('sha256');
    await new Promise<void>((resolveHash, rejectHash) => {
      const stream = handle.createReadStream({ autoClose: false });
      stream.on('data', (chunk) => hash.update(chunk));
      stream.once('error', rejectHash);
      stream.once('end', resolveHash);
    });
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

function parseLedger(contents: string): ImageGenerationAttestation[] {
  const document = asRecord(JSON.parse(contents) as unknown);
  if (document?.version !== LEDGER_VERSION || !Array.isArray(document.attestations)) {
    throw new Error('Image attestation ledger has an unsupported schema');
  }
  if (document.attestations.length > MAX_ATTESTATIONS) {
    throw new Error('Image attestation ledger contains too many records');
  }
  return document.attestations.map(validateAttestation);
}

function validateAttestation(value: unknown): ImageGenerationAttestation {
  const record = asRecord(value);
  const projectId = record?.projectId;
  const relativePath = record?.relativePath;
  const sha256 = record?.sha256;
  const recordedAt = record?.recordedAt;
  const provider = record?.provider ?? 'codex-imagegen';
  if (typeof projectId !== 'string' || !PROJECT_ID.test(projectId)) {
    throw new Error('Invalid image attestation project ID');
  }
  if (typeof relativePath !== 'string' || relativePath.length > 1_000 || !ATTESTED_MEDIA_PATH.test(relativePath)) {
    throw new Error('Invalid media attestation path');
  }
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) {
    throw new Error('Invalid image attestation SHA-256');
  }
  if (typeof recordedAt !== 'string' || recordedAt.length > 100 || !Number.isFinite(Date.parse(recordedAt))) {
    throw new Error('Invalid image attestation timestamp');
  }
  if (typeof provider !== 'string' || !provider.trim() || provider.length > 200 || /[\u0000-\u001f\u007f]/u.test(provider)) {
    throw new Error('Invalid image attestation provider');
  }
  return { projectId, relativePath, sha256, provider: provider.trim(), recordedAt };
}

function isCurrentImageAsset(asset: CurrentGeneratedAsset): boolean {
  return asset.kind === 'image'
    && IMAGE_PATH.test(asset.relativePath)
    && SHA256.test(asset.sha256)
    && Number.isSafeInteger(asset.size)
    && asset.size > 0
    && asset.size <= MAX_IMAGE_BYTES;
}

function isCurrentAudioAsset(asset: CurrentGeneratedAsset): boolean {
  return asset.kind === 'audio'
    && AUDIO_PATH.test(asset.relativePath)
    && SHA256.test(asset.sha256)
    && Number.isSafeInteger(asset.size)
    && asset.size > 0
    && asset.size <= MAX_AUDIO_BYTES;
}

function maximumBytesForMediaPath(relativePath: string): number | null {
  if (IMAGE_PATH.test(relativePath)) return MAX_IMAGE_BYTES;
  if (AUDIO_PATH.test(relativePath)) return MAX_AUDIO_BYTES;
  if (MODEL3D_PATH.test(relativePath)) return MAX_MODEL3D_BYTES;
  return null;
}

function isContained(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== '..'
    && !pathFromRoot.startsWith(`..${sep}`)
    && !isAbsolute(pathFromRoot);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}
