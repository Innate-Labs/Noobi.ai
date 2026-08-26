import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';
import { TextDecoder } from 'node:util';
import type {
  AppSettings,
  CreateProjectInput,
  FileNode,
  FileReadResult,
  PipelineStage,
  ProjectRecord,
  ProjectStatus,
  TargetFrameRate,
} from '../shared/contracts.js';
import {
  DEFAULT_TARGET_FRAME_RATE,
  isTargetFrameRate,
} from '../shared/contracts.js';
import { createWorkspaceTemplate } from './workspaceTemplate.js';

const STORE_VERSION = 1;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TREE_ENTRIES = 1_500;
const MAX_TREE_DEPTH = 20;
const MAX_PROJECT_NAME_LENGTH = 100;
const MAX_PROJECT_IDEA_LENGTH = 50_000;
const READ_ONLY_NOFOLLOW = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
const IGNORED_TREE_NAMES = new Set(['.git', '.cache', '.DS_Store', 'coverage', 'node_modules']);
const PROJECT_STATUSES = new Set<ProjectStatus>([
  'draft',
  'running',
  'waiting',
  'completed',
  'failed',
  'stopped',
]);
const PIPELINE_STAGES = new Set<PipelineStage>([
  'brief',
  'scaffold',
  'gdd',
  'assets',
  'world',
  'code',
  'verify',
  'complete',
]);
interface PersistedProjectStore {
  version: typeof STORE_VERSION;
  projects: ProjectRecord[];
  settings: AppSettings;
}

export interface ProjectStoreOptions {
  storageFile: string;
  defaultWorkspace: string;
}

export type ProjectPatch = Partial<
  Omit<ProjectRecord, 'id' | 'root' | 'createdAt' | 'updatedAt'>
>;

export interface FileTreeOptions {
  maxEntries?: number;
  maxDepth?: number;
  ignoredNames?: Iterable<string>;
}

export interface FileReadOptions {
  maxBytes?: number;
}

/**
 * Local project catalog with serialized mutations and same-directory atomic
 * replacement. Workspace contents stay independent from the catalog file.
 */
export class ProjectStore {
  readonly storageFile: string;
  readonly initialDefaultWorkspace: string;

  #state: PersistedProjectStore | null = null;
  #initializing: Promise<void> | null = null;
  #mutationTail: Promise<void> = Promise.resolve();

  constructor(storageFile: string, defaultWorkspace: string);
  constructor(options: ProjectStoreOptions);
  constructor(storageFileOrOptions: string | ProjectStoreOptions, defaultWorkspace?: string) {
    const options =
      typeof storageFileOrOptions === 'string'
        ? { storageFile: storageFileOrOptions, defaultWorkspace }
        : storageFileOrOptions;
    if (!isNonEmptyString(options.storageFile) || !isAbsolute(options.storageFile)) {
      throw new Error('Project store file must be an absolute path');
    }
    if (!isNonEmptyString(options.defaultWorkspace) || !isAbsolute(options.defaultWorkspace)) {
      throw new Error('Default workspace must be an absolute path');
    }
    this.storageFile = resolve(options.storageFile);
    this.initialDefaultWorkspace = resolve(options.defaultWorkspace);
  }

  async init(): Promise<void> {
    if (this.#state) return;
    if (!this.#initializing) {
      this.#initializing = this.#load().finally(() => {
        this.#initializing = null;
      });
    }
    await this.#initializing;
  }

  async list(): Promise<ProjectRecord[]> {
    await this.init();
    await this.#mutationTail;
    return cloneProjects(this.#requireState().projects).sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
  }

  async listProjects(): Promise<ProjectRecord[]> {
    return this.list();
  }

  async get(projectId: string): Promise<ProjectRecord> {
    await this.init();
    await this.#mutationTail;
    return structuredClone(this.#findProject(projectId));
  }

  async getProject(projectId: string): Promise<ProjectRecord> {
    return this.get(projectId);
  }

  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    return this.#mutate(async (state) => {
      const normalized = validateCreateProjectInput(input);
      const parent = await ensureDirectory(normalized.parentDirectory);
      const projectRoot = await createUniqueWorkspaceDirectory(parent, normalized.name);
      const timestamp = new Date().toISOString();
      const project: ProjectRecord = {
        id: randomUUID(),
        name: normalized.name,
        idea: normalized.idea,
        root: projectRoot,
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'draft',
        stage: 'brief',
        targetFrameRate: normalized.targetFrameRate,
        model: normalized.model,
        threadId: null,
        toolsetVersion: 0,
        activeTurnId: null,
        lastError: null,
      };

      try {
        await createWorkspaceTemplate(projectRoot, project);
        state.projects.push(project);
        await this.#persist(state);
      } catch (error) {
        await removeNewWorkspace(parent, projectRoot);
        throw error;
      }
      return structuredClone(project);
    });
  }

  async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    return this.create(input);
  }

  async update(projectId: string, patch: ProjectPatch): Promise<ProjectRecord> {
    return this.#mutate(async (state) => {
      const index = state.projects.findIndex((project) => project.id === validatedId(projectId));
      if (index < 0) throw new Error(`Unknown project: ${projectId}`);
      const current = state.projects[index]!;
      const next = applyProjectPatch(current, patch);
      state.projects[index] = next;
      await this.#persist(state);
      return structuredClone(next);
    });
  }

  async updateProject(projectId: string, patch: ProjectPatch): Promise<ProjectRecord> {
    return this.update(projectId, patch);
  }

  async getSettings(): Promise<AppSettings> {
    await this.init();
    await this.#mutationTail;
    return structuredClone(this.#requireState().settings);
  }

  async saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    return this.#mutate(async (state) => {
      const next = validateSettings({ ...state.settings, ...patch });
      await mkdir(next.defaultWorkspace, { recursive: true, mode: 0o755 });
      state.settings = next;
      await this.#persist(state);
      return structuredClone(next);
    });
  }

  async listProjectFiles(projectId: string, options?: FileTreeOptions): Promise<FileNode[]> {
    const project = await this.get(projectId);
    return listProjectFiles(project.root, options);
  }

  async readProjectFile(
    projectId: string,
    relativePath: string,
    options?: FileReadOptions,
  ): Promise<FileReadResult> {
    const project = await this.get(projectId);
    return readProjectFile(project.root, relativePath, options);
  }

  async projectRoot(projectId: string): Promise<string> {
    return (await this.get(projectId)).root;
  }

  async #load(): Promise<void> {
    await mkdir(dirname(this.storageFile), { recursive: true, mode: 0o700 });
    await mkdir(this.initialDefaultWorkspace, { recursive: true, mode: 0o755 });
    try {
      const source = await readFile(this.storageFile, 'utf8');
      const loaded = parsePersistedStore(source);
      if (loaded.needsTargetFrameRateMigration) {
        await atomicWriteJson(this.storageFile, loaded.store);
      }
      this.#state = loaded.store;
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
      const initial: PersistedProjectStore = {
        version: STORE_VERSION,
        projects: [],
        settings: defaultSettings(this.initialDefaultWorkspace),
      };
      await atomicWriteJson(this.storageFile, initial);
      this.#state = initial;
    }
  }

  async #mutate<T>(
    mutation: (draft: PersistedProjectStore) => Promise<T>,
  ): Promise<T> {
    await this.init();
    let resolveResult!: (value: T | PromiseLike<T>) => void;
    let rejectResult!: (reason?: unknown) => void;
    const result = new Promise<T>((resolvePromise, rejectPromise) => {
      resolveResult = resolvePromise;
      rejectResult = rejectPromise;
    });
    const run = async (): Promise<void> => {
      const draft = structuredClone(this.#requireState());
      try {
        resolveResult(await mutation(draft));
      } catch (error) {
        rejectResult(error);
      }
    };
    this.#mutationTail = this.#mutationTail.then(run, run);
    return result;
  }

  async #persist(next: PersistedProjectStore): Promise<void> {
    await atomicWriteJson(this.storageFile, next);
    this.#state = structuredClone(next);
  }

  #findProject(projectId: string): ProjectRecord {
    const id = validatedId(projectId);
    const project = this.#requireState().projects.find((candidate) => candidate.id === id);
    if (!project) throw new Error(`Unknown project: ${id}`);
    return project;
  }

  #requireState(): PersistedProjectStore {
    if (!this.#state) throw new Error('Project store is not initialized');
    return this.#state;
  }
}

/**
 * Returns a bounded, deterministic tree. Symbolic links and non-regular
 * filesystem nodes are omitted so the renderer cannot use the inspector as a
 * path traversal primitive.
 */
export async function listProjectFiles(
  projectRoot: string,
  options: FileTreeOptions = {},
): Promise<FileNode[]> {
  const root = await canonicalDirectory(projectRoot);
  const maxEntries = boundedInteger(options.maxEntries, MAX_TREE_ENTRIES, 1, 10_000);
  const maxDepth = boundedInteger(options.maxDepth, MAX_TREE_DEPTH, 0, 64);
  const ignored = new Set(options.ignoredNames ?? IGNORED_TREE_NAMES);
  let entriesSeen = 0;

  const visit = async (directory: string, relativeDirectory: string, depth: number): Promise<FileNode[]> => {
    if (depth > maxDepth || entriesSeen >= maxEntries) return [];
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => {
      const typeOrder = Number(right.isDirectory()) - Number(left.isDirectory());
      return typeOrder || left.name.localeCompare(right.name, undefined, { numeric: true });
    });
    const nodes: FileNode[] = [];
    for (const entry of entries) {
      if (entriesSeen >= maxEntries) break;
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const lexicalPath = join(directory, entry.name);
      let target: string;
      try {
        target = await containedExistingPath(root, lexicalPath);
      } catch (error) {
        if (isSkippableFilesystemError(error)) continue;
        throw error;
      }
      if (entry.isDirectory()) {
        entriesSeen += 1;
        nodes.push({
          name: entry.name,
          relativePath,
          type: 'directory',
          children: await visit(target, relativePath, depth + 1),
        });
      } else if (entry.isFile()) {
        let fileSize: number;
        try {
          const info = await stat(target);
          if (!info.isFile()) continue;
          fileSize = info.size;
        } catch (error) {
          if (isSkippableFilesystemError(error)) continue;
          throw error;
        }
        entriesSeen += 1;
        nodes.push({ name: entry.name, relativePath, type: 'file', size: fileSize });
      }
    }
    return nodes;
  };

  return visit(root, '', 0);
}

export async function readProjectFile(
  projectRoot: string,
  relativePath: string,
  options: FileReadOptions = {},
): Promise<FileReadResult> {
  const maxBytes = boundedInteger(options.maxBytes, MAX_FILE_BYTES, 1, 8 * 1024 * 1024);
  const { root, target, normalizedRelativePath } = await resolveProjectPath(
    projectRoot,
    relativePath,
  );
  const lexical = resolve(root, ...normalizedRelativePath.split('/'));
  const lexicalInfo = await statWithoutFollowingFinalSymlink(lexical);
  if (!lexicalInfo.isFile()) throw new Error(`Project path is not a regular file: ${relativePath}`);

  const handle = await open(target, READ_ONLY_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error(`Project path is not a regular file: ${relativePath}`);
    const bytesToRead = Math.min(info.size, maxBytes);
    const buffer = Buffer.allocUnsafe(bytesToRead);
    let offset = 0;
    while (offset < bytesToRead) {
      const { bytesRead } = await handle.read(buffer, offset, bytesToRead - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const bytes = buffer.subarray(0, offset);
    const binary = bytes.includes(0) || !isUtf8(bytes);
    return {
      relativePath: normalizedRelativePath,
      content: binary ? '' : bytes.toString('utf8'),
      truncated: info.size > maxBytes,
      binary,
    };
  } finally {
    await handle.close();
  }
}

/**
 * Resolves an existing relative path and proves its canonical target remains
 * within the canonical project root. Both POSIX and Windows traversal syntax
 * are rejected, independent of the host platform.
 */
export async function resolveProjectPath(
  projectRoot: string,
  relativePath: string,
): Promise<{ root: string; target: string; normalizedRelativePath: string }> {
  const root = await canonicalDirectory(projectRoot);
  const normalizedRelativePath = normalizeRelativeProjectPath(relativePath);
  const lexical = resolve(root, ...normalizedRelativePath.split('/'));
  assertPathContained(root, lexical);
  const target = await containedExistingPath(root, lexical);
  return { root, target, normalizedRelativePath };
}

/** Same-directory temp file + fsync + rename. */
export async function atomicWriteJson(targetPath: string, value: unknown): Promise<void> {
  if (!isAbsolute(targetPath)) throw new Error('Atomic JSON target must be an absolute path');
  const directory = dirname(targetPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = join(directory, `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  await handle.close();
  try {
    await rename(temporaryPath, targetPath);
    await syncDirectory(directory);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function validateCreateProjectInput(input: CreateProjectInput): {
  name: string;
  idea: string;
  parentDirectory: string;
  model: string | null;
  targetFrameRate: TargetFrameRate;
} {
  if (!input || typeof input !== 'object') throw new Error('Project input is required');
  const name = validatedText(input.name, 'Project name', MAX_PROJECT_NAME_LENGTH);
  const idea = validatedText(input.idea, 'Game idea', MAX_PROJECT_IDEA_LENGTH);
  if (!isNonEmptyString(input.parentDirectory) || !isAbsolute(input.parentDirectory)) {
    throw new Error('Project parent directory must be an absolute path');
  }
  if (input.model !== undefined && input.model !== null && !isNonEmptyString(input.model)) {
    throw new Error('Project model must be a non-empty string or null');
  }
  if (input.targetFrameRate !== undefined && !isTargetFrameRate(input.targetFrameRate)) {
    throw new Error('Project targetFrameRate must be 30, 60, or 120');
  }
  return {
    name,
    idea,
    parentDirectory: resolve(input.parentDirectory),
    model: input.model?.trim() || null,
    targetFrameRate: input.targetFrameRate ?? DEFAULT_TARGET_FRAME_RATE,
  };
}

function applyProjectPatch(current: ProjectRecord, patch: ProjectPatch): ProjectRecord {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Project patch must be an object');
  }
  const allowed = new Set([
    'name',
    'idea',
    'status',
    'stage',
    'targetFrameRate',
    'model',
    'threadId',
    'toolsetVersion',
    'activeTurnId',
    'lastError',
  ]);
  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) throw new Error(`Project field cannot be updated: ${key}`);
  }
  const next: ProjectRecord = { ...current, updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) next.name = validatedText(patch.name, 'Project name', MAX_PROJECT_NAME_LENGTH);
  if (patch.idea !== undefined) next.idea = validatedText(patch.idea, 'Game idea', MAX_PROJECT_IDEA_LENGTH);
  if (patch.status !== undefined) {
    if (!PROJECT_STATUSES.has(patch.status)) throw new Error(`Invalid project status: ${String(patch.status)}`);
    next.status = patch.status;
  }
  if (patch.stage !== undefined) {
    if (!PIPELINE_STAGES.has(patch.stage)) throw new Error(`Invalid pipeline stage: ${String(patch.stage)}`);
    next.stage = patch.stage;
  }
  if (patch.targetFrameRate !== undefined) {
    if (!isTargetFrameRate(patch.targetFrameRate)) {
      throw new Error('Project targetFrameRate must be 30, 60, or 120');
    }
    next.targetFrameRate = patch.targetFrameRate;
  }
  for (const field of ['model', 'threadId', 'activeTurnId', 'lastError'] as const) {
    if (patch[field] !== undefined) {
      const value = patch[field];
      if (value !== null && typeof value !== 'string') {
        throw new Error(`Project ${field} must be a string or null`);
      }
      next[field] = value;
    }
  }
  if (patch.toolsetVersion !== undefined) {
    if (!Number.isSafeInteger(patch.toolsetVersion) || patch.toolsetVersion < 0 || patch.toolsetVersion > 1_000) {
      throw new Error('Project toolsetVersion must be an integer between 0 and 1000');
    }
    next.toolsetVersion = patch.toolsetVersion;
  }
  return next;
}

function parsePersistedStore(source: string): {
  store: PersistedProjectStore;
  needsTargetFrameRateMigration: boolean;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(`Project store contains invalid JSON: ${asError(error).message}`);
  }
  if (!isRecord(parsed) || parsed.version !== STORE_VERSION || !Array.isArray(parsed.projects)) {
    throw new Error(`Unsupported or invalid project store schema (expected version ${STORE_VERSION})`);
  }
  const projects = parsed.projects.map(validateProjectRecord);
  const ids = new Set<string>();
  for (const project of projects) {
    if (ids.has(project.id)) throw new Error(`Project store contains duplicate id: ${project.id}`);
    ids.add(project.id);
  }
  return {
    store: {
      version: STORE_VERSION,
      projects,
      settings: validateSettings(parsed.settings),
    },
    needsTargetFrameRateMigration: parsed.projects.some(
      (project) => isRecord(project) && project.targetFrameRate === undefined,
    ),
  };
}

function validateProjectRecord(value: unknown): ProjectRecord {
  if (!isRecord(value)) throw new Error('Project store contains a non-object project');
  const id = validatedId(value.id);
  const name = validatedText(value.name, 'Project name', MAX_PROJECT_NAME_LENGTH);
  const idea = validatedText(value.idea, 'Game idea', MAX_PROJECT_IDEA_LENGTH);
  if (!isNonEmptyString(value.root) || !isAbsolute(value.root)) {
    throw new Error(`Project ${id} has an invalid root`);
  }
  if (!isIsoDate(value.createdAt) || !isIsoDate(value.updatedAt)) {
    throw new Error(`Project ${id} has invalid timestamps`);
  }
  if (!PROJECT_STATUSES.has(value.status as ProjectStatus)) {
    throw new Error(`Project ${id} has an invalid status`);
  }
  if (!PIPELINE_STAGES.has(value.stage as PipelineStage)) {
    throw new Error(`Project ${id} has an invalid stage`);
  }
  return {
    id,
    name,
    idea,
    root: resolve(value.root),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    status: value.status as ProjectStatus,
    stage: value.stage as PipelineStage,
    targetFrameRate: value.targetFrameRate === undefined
      ? DEFAULT_TARGET_FRAME_RATE
      : validatedTargetFrameRate(value.targetFrameRate, id),
    model: nullableString(value.model, `Project ${id} model`),
    threadId: nullableString(value.threadId, `Project ${id} thread id`),
    toolsetVersion: value.toolsetVersion === undefined
      ? 0
      : validatedToolsetVersion(value.toolsetVersion, id),
    activeTurnId: nullableString(value.activeTurnId, `Project ${id} active turn id`),
    lastError: nullableString(value.lastError, `Project ${id} last error`),
  };
}

function validatedTargetFrameRate(value: unknown, projectId: string): TargetFrameRate {
  if (!isTargetFrameRate(value)) {
    throw new Error(`Project ${projectId} has an invalid target frame rate`);
  }
  return value;
}

function validatedToolsetVersion(value: unknown, projectId: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 1_000) {
    throw new Error(`Project ${projectId} has an invalid toolset version`);
  }
  return value;
}

function validateSettings(value: unknown): AppSettings {
  if (!isRecord(value)) throw new Error('Project settings are invalid');
  if (!isNonEmptyString(value.defaultWorkspace) || !isAbsolute(value.defaultWorkspace)) {
    throw new Error('Default workspace setting must be an absolute path');
  }
  if (value.defaultModel !== null && !isNonEmptyString(value.defaultModel)) {
    throw new Error('Default model setting must be a non-empty string or null');
  }
  if (!isNonEmptyString(value.defaultEffort)) throw new Error('Default effort setting is invalid');
  if (value.theme !== 'dark' && value.theme !== 'light') throw new Error('Theme setting is invalid');
  return {
    defaultWorkspace: resolve(value.defaultWorkspace),
    defaultModel: value.defaultModel === null ? null : value.defaultModel.trim(),
    defaultEffort: value.defaultEffort.trim(),
    theme: value.theme,
  };
}

function defaultSettings(defaultWorkspace: string): AppSettings {
  return {
    defaultWorkspace,
    defaultModel: null,
    defaultEffort: 'medium',
    theme: 'dark',
  };
}

async function ensureDirectory(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o755 });
  return canonicalDirectory(directory);
}

async function canonicalDirectory(directory: string): Promise<string> {
  if (!isNonEmptyString(directory) || !isAbsolute(directory)) {
    throw new Error('Project root must be an absolute path');
  }
  const lexical = resolve(directory);
  const lexicalInfo = await lstat(lexical);
  if (lexicalInfo.isSymbolicLink()) throw new Error(`Project root cannot be a symbolic link: ${directory}`);
  const canonical = await realpath(lexical);
  const info = await stat(canonical);
  if (!info.isDirectory()) throw new Error(`Path is not a directory: ${directory}`);
  return canonical;
}

async function createUniqueWorkspaceDirectory(parent: string, projectName: string): Promise<string> {
  const segment = workspaceSlug(projectName);
  for (let suffix = 1; suffix <= 1_000; suffix += 1) {
    const candidate = join(parent, suffix === 1 ? segment : `${segment}-${suffix}`);
    assertPathContained(parent, candidate);
    try {
      await mkdir(candidate, { mode: 0o755 });
      return await realpath(candidate);
    } catch (error) {
      if (isNodeError(error, 'EEXIST')) continue;
      throw error;
    }
  }
  throw new Error(`Unable to choose an unused workspace directory for ${projectName}`);
}

async function removeNewWorkspace(parent: string, projectRoot: string): Promise<void> {
  const canonicalParent = await canonicalDirectory(parent);
  assertPathContained(canonicalParent, projectRoot);
  if (relative(canonicalParent, projectRoot) === '') return;
  await rm(projectRoot, { recursive: true, force: true }).catch(() => undefined);
}

function workspaceSlug(name: string): string {
  const normalized = name
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60)
    .replace(/[. ]+$/gu, '');
  const candidate = normalized || `noobi-game-${randomUUID().slice(0, 8)}`;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(candidate)
    ? `noobi-${candidate}`
    : candidate;
}

function normalizeRelativeProjectPath(value: string): string {
  if (!isNonEmptyString(value) || value.includes('\0')) throw new Error('Project path is required');
  if (isAbsolute(value) || win32.isAbsolute(value)) throw new Error('Project path must be relative');
  const portable = value.replaceAll('\\', '/');
  const segments = portable.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Project path contains an invalid segment');
  }
  return segments.join('/');
}

async function containedExistingPath(root: string, lexicalPath: string): Promise<string> {
  assertPathContained(root, lexicalPath);
  const canonical = await realpath(lexicalPath);
  assertPathContained(root, canonical);
  return canonical;
}

function assertPathContained(root: string, candidate: string): void {
  const fromRoot = relative(root, candidate);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`Path escapes the project root: ${candidate}`);
  }
}

async function statWithoutFollowingFinalSymlink(path: string): Promise<Awaited<ReturnType<typeof stat>>> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error('Symbolic-link files cannot be read from the inspector');
  return info;
}

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === 'win32') return;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(directory, constants.O_RDONLY);
    await handle.sync();
  } catch {
    // Some filesystems do not support directory fsync. File fsync + atomic rename
    // still provides the required replacement semantics.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Limit must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function isUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${label} must be a string or null`);
  return value;
}

function validatedId(value: unknown): string {
  if (!isNonEmptyString(value) || value.length > 200) throw new Error('Project id is invalid');
  return value;
}

function validatedText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > maximumLength) throw new Error(`${label} exceeds ${maximumLength} characters`);
  if (normalized.includes('\0')) throw new Error(`${label} contains a null byte`);
  return normalized;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function cloneProjects(projects: ProjectRecord[]): ProjectRecord[] {
  return structuredClone(projects);
}

function isNodeError(value: unknown, code: string): boolean {
  return value instanceof Error && 'code' in value && value.code === code;
}

function isSkippableFilesystemError(value: unknown): boolean {
  return ['EACCES', 'ENOENT', 'EPERM'].some((code) => isNodeError(value, code));
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
