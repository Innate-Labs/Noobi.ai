import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RestoreGameVersionInput, RestoreGameVersionResult } from '../../shared/gameVersions.js';
import type { ProjectRecord } from '../../shared/contracts.js';
import { latestProjectPlan } from '../../shared/planning.js';
import { ProjectStore } from '../projectStore.js';
import { PlanStore } from '../planStore.js';
import { AssetPlanStore } from '../assetPlanStore.js';
import { ImageGenerationAttestationStore } from '../imageGenerationAttestation.js';
import { GameVersionStore, type VersionMetadata } from './gameVersionStore.js';
import { archiveLatestGameplayExperienceReport } from '../gameplayExperienceEvaluator.js';
import { copyVersionFiles, digest, readVersionFile } from './versionFiles.js';

/** Publish a restored project only after its files, plan and trusted ledgers are ready.
 * The source workspace is never written. Receipts prevent duplicate copies on replay. */
export class GameVersionRestorer {
  #pending = new Map<string, { versionId: string; promise: Promise<RestoreGameVersionResult> }>();
  constructor(private readonly versions: GameVersionStore, private readonly projects: ProjectStore,
    private readonly plans: PlanStore, private readonly assets: AssetPlanStore, private readonly attestations: ImageGenerationAttestationStore) {}
  async metadata(project: ProjectRecord): Promise<VersionMetadata> {
    const [plans, assets, attestations] = await Promise.all([this.plans.list(), this.assets.list(project.id), this.attestations.snapshot(project.id)]);
    return { project, plan: latestProjectPlan(plans, project.id), assets, attestations };
  }
  restore(input: RestoreGameVersionInput): Promise<RestoreGameVersionResult> {
    if (!input || [input.projectId, input.versionId, input.requestId].some(value => typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/u.test(value))) return Promise.reject(new Error('恢复版本参数无效'));
    const existing = this.#pending.get(input.projectId);
    if (existing) return existing.versionId === input.versionId ? existing.promise : Promise.reject(new Error('该项目正在恢复其他版本'));
    const promise = this.#restore(input).finally(() => this.#pending.delete(input.projectId));
    this.#pending.set(input.projectId, { versionId: input.versionId, promise }); return promise;
  }
  async #restore(input: RestoreGameVersionInput): Promise<RestoreGameVersionResult> {
    const receiptDirectory = join(this.versions.root, '.restores', input.projectId); await mkdir(receiptDirectory, { recursive: true });
    const receiptPath = join(receiptDirectory, `${input.requestId}.json`);
    try {
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
      if (receipt.projectId !== input.projectId || receipt.sourceVersionId !== input.versionId) throw new Error('恢复请求已绑定其他版本');
      if (!receipt.targetProjectId) throw new Error('上次恢复未完成，请查看原项目后重新发起');
      const project = await this.projects.get(receipt.targetProjectId).catch(() => null);
      if (!project) throw new Error('上次恢复未完成或副本已删除；原工程未改变，请重新发起');
      return { project, backupVersionId: receipt.backupVersionId, sourceVersionId: input.versionId };
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const original = await this.projects.get(input.projectId);
    if (original.status === 'running') throw new Error('请等待制作结束或停止后再恢复版本');
    const record = await this.versions.read(input.projectId, input.versionId);
    if (!record.canRestore || !record.metadata.plan) throw new Error('该版本缺少完整工程或方案，不能恢复');
    const source = await this.versions.verify(record);
    const backup = await this.versions.capture({ metadata: await this.metadata(original), kind: 'backup', title: '恢复前备份', sourceRoot: original.root,
      previewDirectory: original.engine === 'godot' ? 'build/web' : 'dist', summary: `恢复「${record.title}」之前保存；原项目与新增资料仍保留。` });
    let targetId: string | null = null;
    const receipt = { projectId: input.projectId, sourceVersionId: input.versionId, backupVersionId: backup.id, targetProjectId: null as string | null };
    const saveReceipt = async () => { const temporary = `${receiptPath}.tmp`; await writeFile(temporary, JSON.stringify(receipt), { mode: 0o600 }); await rename(temporary, receiptPath); };
    await saveReceipt();
    try {
      const settings = await this.projects.getSettings();
      const project = await this.projects.create({ name: `${original.name.slice(0, 70)} · 恢复副本`, idea: record.metadata.project.idea,
        model: record.metadata.project.model, engine: record.metadata.project.engine, parentDirectory: settings.defaultWorkspace }, async target => {
        targetId = target.id; receipt.targetProjectId = target.id; await saveReceipt();
        await copyVersionFiles(source, target.root, record.files);
        // Preserve historical evidence without presenting it as a fresh check of this copy.
        await archiveLatestGameplayExperienceReport(target.root);
        target.targetFrameRate = record.metadata.project.targetFrameRate;
        target.noobiPackOverrideId = record.metadata.project.noobiPackOverrideId;
        target.noobiCrewOverride = structuredClone(record.metadata.project.noobiCrewOverride);
        target.icon = structuredClone(record.metadata.project.icon);
        target.status = 'stopped'; target.stage = 'verify'; target.threadId = null; target.toolsetVersion = 0;
        target.lastError = '已恢复为独立副本。原项目和新上传资料保留；继续制作时将重新验证。';
        const metadataPath = join(target.root, '.noobi/project.json');
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
        await writeFile(metadataPath, JSON.stringify({ ...metadata, id: target.id, name: target.name, createdAt: target.createdAt, model: target.model }), { mode: 0o600 });
        const manifestPath = join(target.root, 'public/assets/asset-pack.json');
        try { const manifest = JSON.parse(await readFile(manifestPath, 'utf8')); manifest.projectId = target.id; await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        await this.plans.importRestored(record.metadata.plan!, target.id);
        await this.assets.importRestored(target.id, record.metadata.assets);
        for (const attestation of record.metadata.attestations) {
          const file = record.files.find(file => file.path === attestation.relativePath && file.sha256 === attestation.sha256);
          if (!file) continue;
          if (digest(await readVersionFile(target.root, file.path)) !== attestation.sha256) throw new Error('恢复素材与来源记录不一致');
          await this.attestations.record({ ...attestation, projectId: target.id });
        }
        await writeFile(join(target.root, '.noobi/restored-from.json'), JSON.stringify({ sourceProjectId: original.id, versionId: input.versionId, backupVersionId: backup.id }), { mode: 0o600 });
      });
      // Catalog commit is the completion marker; a crash before response is replayable from the receipt.
      return { project, backupVersionId: backup.id, sourceVersionId: input.versionId };
    } catch (error) {
      if (targetId) await Promise.allSettled([this.plans.removeProject(targetId), this.assets.removeProject(targetId), this.attestations.removeProject(targetId)]);
      throw error;
    }
  }
}
