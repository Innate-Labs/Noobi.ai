import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { BuildPreviewStatus, GameplayBuildBinding, GameplayExperienceReport } from '../../shared/contracts.js';
import type { GameQualitySpec } from './gameQualitySpec.js';
import { retainVisualEvidence } from '../visualEvidence.js';

const SKIP = new Set(['.git', '.godot', 'node_modules', 'build', 'dist', 'artifacts', '.DS_Store']);
const MAX_FILES = 20_000;
const MAX_BYTES = 2 * 1024 ** 3;
interface SourceFile { path: string; hash: string }
export interface GodotBuildRecord extends GameplayBuildBinding {
  version: 1;
  projectId: string;
  projectRoot: string;
  createdAt: string;
  status: 'building' | 'built' | 'failed';
  files: SourceFile[];
  /** Explicit, app-installed runtime instrumentation over the frozen inputs. */
  derivedFiles?: SourceFile[];
  engineVersion: string;
  templateVersion: string;
  qualitySpec?: GameQualitySpec;
  reuseKey?: string;
  error?: string;
}
export interface GodotBuild {
  record: GodotBuildRecord;
  root: string;
}

/** App-private snapshots. The mutable game workspace cannot publish a build
 * by writing a report or a pointer. An old export is never relabelled current. */
export class GodotBuildStore {
  constructor(readonly storageRoot: string) {
    if (!isAbsolute(storageRoot)) throw new Error('Build storage must be absolute');
  }

  async create(projectId: string, projectRoot: string, engineVersion: string, templateVersion: string,
    signal?: AbortSignal): Promise<GodotBuild> {
    const id = randomUUID();
    const canonical = await realpath(projectRoot);
    const directory = this.directory(projectId, id);
    const root = join(directory, 'source');
    await mkdir(root, { recursive: true, mode: 0o700 });
    const files = await sourceFiles(canonical, signal);
    for (const file of files) {
      signal?.throwIfAborted();
      const destination = join(root, file.path);
      await mkdir(resolve(destination, '..'), { recursive: true });
      await copyFile(join(canonical, file.path), destination, constants.COPYFILE_EXCL);
      if (digest(await readFile(destination)) !== file.hash) {
        throw new Error('源码在创建构建快照时发生变化，请重新构建');
      }
    }
    const sourceHash = hashFiles(files);
    if (hashFiles(await sourceFiles(canonical, signal)) !== sourceHash) {
      throw new Error('源码在创建构建快照时发生变化，请重新构建');
    }
    const record: GodotBuildRecord = {
      version: 1, projectId, projectRoot: canonical, buildId: id, sourceHash,
      artifactHash: '', createdAt: new Date().toISOString(), status: 'building',
      engineVersion, templateVersion, files, testSuiteVersion: 'godot-delivery-v4',
    };
    await this.save(record);
    return { record, root };
  }

  async publish(build: GodotBuild, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.verifyInputs(build);
    build.record.artifactHash = await artifactHash(build.root);
    await this.assertCurrent(build, signal);
    build.record.status = 'built';
    await this.save(build.record);
    signal?.throwIfAborted();
    await atomicJson(join(this.projectDirectory(build.record.projectId), 'latest.json'), {
      version: 1, buildId: build.record.buildId,
    });
  }

  async verifyInputs(build: GodotBuild): Promise<void> {
    // Editor-generated import caches may be added, but captured inputs must
    // remain byte-identical throughout import, runtime validation and export.
    const expected = new Map(build.record.files.map((file) => [file.path, file]));
    for (const file of build.record.derivedFiles ?? []) expected.set(file.path, file);
    for (const file of expected.values()) {
      if (digest(await readFile(join(build.root, file.path))) !== file.hash) {
        throw new Error(`构建期间输入文件发生变化：${file.path}`);
      }
    }
  }

  async reusable(projectId: string, projectRoot: string, reuseKey: string,
    signal?: AbortSignal): Promise<GodotBuild | null> {
    signal?.throwIfAborted();
    try {
      const build = await this.latest(projectId);
      if (!build || build.record.reuseKey !== reuseKey
        || build.record.projectRoot !== await realpath(projectRoot)) return null;
      await this.verifyInputs(build);
      await this.verifyArtifacts(build);
      await this.assertCurrent(build, signal);
      signal?.throwIfAborted();
      return build;
    } catch {
      signal?.throwIfAborted();
      return null; // Invalid or stale caches must be rebuilt, never relabelled.
    }
  }

  async recordInstrumentation(build: GodotBuild, paths: string[]): Promise<void> {
    if (build.record.status !== 'building') throw new Error('Cannot instrument a published build');
    build.record.derivedFiles = await Promise.all(paths.map(async (path) => {
      if (isAbsolute(path) || path.split(/[\\/]/u).includes('..')) throw new Error('Invalid instrumentation path');
      return { path, hash: digest(await readFile(join(build.root, path))) };
    }));
    await this.save(build.record);
  }

  async fail(build: GodotBuild, error: unknown): Promise<void> {
    build.record.status = 'failed';
    build.record.error = String(error instanceof Error ? error.message : error)
      .replaceAll(build.record.projectRoot, '<project>').replaceAll(build.root, '<snapshot>').slice(0, 4000);
    await this.save(build.record);
    // The published pointer intentionally remains untouched.
  }

  async latest(projectId: string): Promise<GodotBuild | null> {
    let pointer: { version: number; buildId: string };
    try { pointer = JSON.parse(await readFile(join(this.projectDirectory(projectId), 'latest.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    if (pointer.version !== 1 || !validId(pointer.buildId)) throw new Error('构建版本记录无效');
    const record: GodotBuildRecord = JSON.parse(await readFile(join(this.directory(projectId, pointer.buildId), 'record.json'), 'utf8'));
    if (record.version !== 1 || record.status !== 'built' || record.projectId !== projectId
      || record.buildId !== pointer.buildId || !Array.isArray(record.files)) throw new Error('构建记录不匹配');
    return { record, root: join(this.directory(projectId, pointer.buildId), 'source') };
  }
  async get(projectId: string, buildId: string): Promise<GodotBuild> {
    const record: GodotBuildRecord = JSON.parse(await readFile(join(this.directory(projectId, buildId), 'record.json'), 'utf8'));
    if (record.version !== 1 || record.projectId !== projectId || record.buildId !== buildId || !Array.isArray(record.files) || typeof record.createdAt !== 'string' || !['built', 'failed', 'building'].includes(record.status)) throw new Error('构建记录不匹配');
    return { record, root: join(this.directory(projectId, buildId), 'source') };
  }
  async list(projectId: string): Promise<GodotBuild[]> {
    let entries;
    try { entries = await readdir(this.projectDirectory(projectId), { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const builds: GodotBuild[] = [];
    for (const entry of entries) if (entry.isDirectory() && validId(entry.name)) {
      try { builds.push(await this.get(projectId, entry.name)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return builds.sort((a,b) => b.record.createdAt.localeCompare(a.record.createdAt));
  }

  async assertCurrent(build: GodotBuild, signal?: AbortSignal): Promise<void> {
    const current = await this.fingerprint(build.record.projectRoot, signal);
    if (current !== build.record.sourceHash) throw new Error('源码或素材已更新；当前构建与报告不能用于本次交付，请重新构建');
  }

  async fingerprint(projectRoot: string, signal?: AbortSignal): Promise<string> {
    return hashFiles(await sourceFiles(await realpath(projectRoot), signal));
  }

  async verifyArtifacts(build: GodotBuild): Promise<void> {
    if (!build.record.artifactHash || await artifactHash(build.root) !== build.record.artifactHash) {
      throw new Error('构建产物与版本记录不一致，请重新构建');
    }
  }

  async recordReport(build: GodotBuild, report: GameplayExperienceReport): Promise<void> {
    if (report.build?.buildId !== build.record.buildId || report.build.sourceHash !== build.record.sourceHash
      || report.build.artifactHash !== build.record.artifactHash) throw new Error('评测报告与构建版本不一致');
    await retainVisualEvidence(this.directory(build.record.projectId, build.record.buildId), build.record.projectRoot, report);
    await atomicJson(join(this.directory(build.record.projectId, build.record.buildId), 'quality-report.json'), report);
  }

  async report(build: GodotBuild): Promise<GameplayExperienceReport | null> {
    try {
      const report: GameplayExperienceReport = JSON.parse(await readFile(join(this.directory(build.record.projectId, build.record.buildId), 'quality-report.json'), 'utf8'));
      if (report.build?.buildId !== build.record.buildId || report.build.sourceHash !== build.record.sourceHash
        || report.build.artifactHash !== build.record.artifactHash) return null;
      return report;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }

  async inspect(projectId: string, projectRoot: string): Promise<{ build: GodotBuild | null; preview: BuildPreviewStatus }> {
    const build = await this.latest(projectId);
    if (!build) return { build, preview: { state: 'legacy', message: '历史预览：尚未验证与当前源码一致。重新评测将创建独立构建。' } };
    if (build.record.projectRoot !== await realpath(projectRoot)) throw new Error('项目路径与构建记录不一致');
    try { await this.verifyArtifacts(build); }
    catch { return { build: null, preview: { state: 'unavailable', message: '构建文件已变化，预览不可验证。请重新构建。' } }; }
    let current = true;
    try { await this.assertCurrent(build); } catch { current = false; }
    return { build, preview: {
      state: current ? 'current' : 'stale', buildId: build.record.buildId, builtAt: build.record.createdAt,
      message: current ? '当前源码的独立构建；基础运行通过，游戏品质以专项验收为准。'
        : '源码已更新，正在显示上一次可运行构建；历史评测不代表当前源码。',
    } };
  }

  private projectDirectory(projectId: string): string {
    if (!validId(projectId)) throw new Error('Invalid build project id');
    return join(this.storageRoot, projectId);
  }
  private directory(projectId: string, buildId: string): string {
    if (!validId(buildId)) throw new Error('Invalid build id');
    return join(this.projectDirectory(projectId), buildId);
  }
  private save(record: GodotBuildRecord): Promise<void> {
    return atomicJson(join(this.directory(record.projectId, record.buildId), 'record.json'), record);
  }
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/u.test(value);
}
function digest(bytes: Buffer | string): string { return createHash('sha256').update(bytes).digest('hex'); }
function hashFiles(files: SourceFile[]): string { return digest(JSON.stringify(files)); }
async function sourceFiles(root: string, signal?: AbortSignal): Promise<SourceFile[]> {
  const result: SourceFile[] = [];
  let bytes = 0;
  async function visit(directory: string): Promise<void> {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      signal?.throwIfAborted();
      if (SKIP.has(entry.name)) continue;
      const path = join(directory, entry.name);
      const rel = relative(root, path).split(sep).join('/');
      // Non-production UI evidence must not invalidate an otherwise identical game.
      if (rel === '.noobi/icon.png' || rel.startsWith('.noobi/builds/')) continue;
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`构建快照不支持符号链接：${rel}`);
      if (info.isDirectory()) { await visit(path); continue; }
      if (!info.isFile()) throw new Error(`构建输入不是普通文件：${rel}`);
      bytes += info.size;
      if (result.length >= MAX_FILES || bytes > MAX_BYTES) throw new Error('构建快照超过 20,000 文件或 2 GiB，请整理工程后重试');
      result.push({ path: rel, hash: digest(await readFile(path)) });
    }
  }
  await visit(root);
  return result;
}
async function artifactHash(root: string): Promise<string> {
  const directory = join(root, 'build/web');
  for (const name of ['index.html', 'index.js', 'index.wasm', 'index.pck']) {
    const info = await lstat(join(directory, name));
    if (!info.isFile() || info.size === 0) throw new Error(`缺少完整构建产物：${name}`);
  }
  return hashFiles(await sourceFiles(directory));
}
async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}
