import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetPlanRecord, ProjectRecord } from '../../shared/contracts.js';
import type { PlanDraft } from '../../shared/planning.js';
import type { ImageGenerationAttestation } from '../imageGenerationAttestation.js';
import type { GameVersion, GameVersionKind } from '../../shared/gameVersions.js';
import { copyVersionFiles, digest, scanVersionFiles, validRelative, type VersionFile } from './versionFiles.js';
export interface VersionMetadata { project: ProjectRecord; plan: PlanDraft | null; assets: AssetPlanRecord[]; attestations: ImageGenerationAttestation[] }
export interface StoredGameVersion extends GameVersion { schema: 1; files: VersionFile[]; metadata: VersionMetadata; previewDirectory: string | null }
const id = (value: string) => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/u.test(value)) throw new Error('版本 ID 无效'); return value; };
export class GameVersionStore {
  constructor(readonly root: string) {}
  directory(projectId: string, versionId: string): string { return join(this.root, id(projectId), id(versionId)); }
  async list(projectId: string): Promise<GameVersion[]> {
    let entries: string[];
    try { entries = await readdir(join(this.root, id(projectId))); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const result: GameVersion[] = [];
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const record = await this.read(projectId, entry); result.push(this.summary(record));
    }
    return result.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  summary(record: StoredGameVersion): GameVersion {
    const { schema: _schema, files: _files, metadata: _metadata, previewDirectory: _directory, ...summary } = record; return structuredClone(summary);
  }
  async read(projectId: string, versionId: string): Promise<StoredGameVersion> {
    const envelope = JSON.parse(await readFile(join(this.directory(projectId, versionId), 'record.json'), 'utf8'));
    const record = envelope.record as StoredGameVersion;
    if (!record || envelope.sha256 !== digest(JSON.stringify(record)) || record.schema !== 1 || record.projectId !== projectId || record.id !== versionId
      || record.metadata?.project.id !== projectId || !Array.isArray(record.files)
      || record.files.some(f => !validRelative(f.path) || !/^[a-f0-9]{64}$/u.test(f.sha256) || !Number.isSafeInteger(f.size) || f.size < 0 || !Number.isInteger(f.mode) || f.mode < 0 || f.mode > 0o777)
      || (record.previewDirectory !== null && !validRelative(record.previewDirectory))) throw new Error('版本记录损坏，已拒绝恢复');
    return record;
  }
  async verify(record: StoredGameVersion): Promise<string> {
    const root = join(this.directory(record.projectId, record.id), 'source');
    if (JSON.stringify(await scanVersionFiles(root)) !== JSON.stringify(record.files)) throw new Error('版本文件校验失败，已拒绝预览或恢复');
    return root;
  }
  async capture(input: { metadata: VersionMetadata; kind: Exclude<GameVersionKind, 'legacy'>; title: string; summary?: string; error?: string; sourceRoot?: string;
    artifactRoot?: string; previewDirectory?: string | null; validate?: () => Promise<void> }): Promise<GameVersion> {
    const project = input.metadata.project; const versionId = randomUUID(); const destination = this.directory(project.id, versionId);
    const plan = input.metadata.plan;
    if (plan?.run && (plan.run.projectId !== project.id || !plan.version || plan.version.id !== plan.run.versionId
      || !plan.version.options.some(option => option.id === plan.run!.optionId))) throw new Error('版本方案与工程不匹配');
    if ([...input.metadata.assets, ...input.metadata.attestations].some(item => item.projectId !== project.id)) throw new Error('版本素材账本与工程不匹配');
    const temporary = join(this.root, id(project.id), `.${versionId}`); const source = join(temporary, 'source');
    await mkdir(source, { recursive: true, mode: 0o700 });
    try {
      const previous = (await this.list(project.id)).find(v => v.canRestore);
      const initial = input.sourceRoot ? await scanVersionFiles(input.sourceRoot) : [];
      if (input.sourceRoot) {
        // A supplied frozen export replaces only the artifact subtree, never game source.
        const files = input.artifactRoot ? initial.filter(f => !f.path.startsWith('build/web/')) : initial;
        await copyVersionFiles(input.sourceRoot, source, files);
        if (JSON.stringify(await scanVersionFiles(input.sourceRoot)) !== JSON.stringify(initial)) throw new Error('工程在保存版本期间变化，请重试');
      }
      if (input.artifactRoot) await copyVersionFiles(input.artifactRoot, join(source, 'build/web'), await scanVersionFiles(input.artifactRoot));
      const files = await scanVersionFiles(source);
      const older = previous ? (await this.read(project.id, previous.id)).files : [];
      const oldMap = new Map(older.map(f => [f.path, f.sha256])); const newMap = new Map(files.map(f => [f.path, f.sha256]));
      const previewDirectory = input.previewDirectory ?? null;
      const canPreview = Boolean(previewDirectory && newMap.has(`${previewDirectory}/index.html`));
      if (input.kind === 'passed' && (!input.metadata.plan?.run || !canPreview)) throw new Error('交付版本缺少方案绑定或可玩产物');
      const record: StoredGameVersion = { schema: 1, id: versionId, projectId: project.id, createdAt: new Date().toISOString(), kind: input.kind,
        title: input.title, summary: (input.summary ?? '').slice(0, 2000), error: input.error?.slice(0, 4000) ?? null,
        planTitle: input.metadata.plan?.version?.options.find(o => o.id === input.metadata.plan?.run?.optionId)?.title ?? null,
        files, fileCount: files.length, metadata: structuredClone(input.metadata), previewDirectory, canPreview,
        canRestore: files.length > 0 && Boolean(input.metadata.plan?.run), changes: input.sourceRoot ? {
          added: files.filter(f => !oldMap.has(f.path)).length, modified: files.filter(f => oldMap.has(f.path) && oldMap.get(f.path) !== f.sha256).length,
          removed: older.filter(f => !newMap.has(f.path)).length } : null };
      await input.validate?.();
      await writeFile(join(temporary, 'record.json'), JSON.stringify({ record, sha256: digest(JSON.stringify(record)) }), { flag: 'wx', mode: 0o600 });
      await rename(temporary, destination); return this.summary(record);
    } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
  }
}
