import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectStore } from '../projectStore.js';
import { PlanStore } from '../planStore.js';
import { AssetPlanStore } from '../assetPlanStore.js';
import { ImageGenerationAttestationStore } from '../imageGenerationAttestation.js';
import { latestProjectPlan, type PlanVersion } from '../../shared/planning.js';
import { GameVersionStore } from './gameVersionStore.js';
import { GameVersionRestorer } from './gameVersionRestorer.js';
import { digest } from './versionFiles.js';
import { PreviewServer } from '../previewServer.js';
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'noobi-versions-')); roots.push(root);
  const projects = new ProjectStore(join(root, 'projects.json'), join(root, 'games')); await projects.init();
  let project = await projects.create({ name: 'Version fixture', idea: 'Explore and collect', parentDirectory: join(root, 'games'), engine: 'web' });
  project = await projects.update(project.id, { status: 'stopped', targetFrameRate: 30, noobiPackOverrideId: 'mosslight' });
  const plans = new PlanStore(join(root, 'plans.json')); await plans.init();
  const version: PlanVersion = { id: 'version-1', number: 1, createdAt: new Date().toISOString(), requirements: [{ id: 'R1', text: 'Explore and collect' }],
    options: [{ id: 'option-1', title: '探索方案 A', approach: 'Explore', engine: 'web', dimension: '2d', platform: 'web', coreLoop: ['explore'], features: ['collect'],
      assumptions: [], exclusions: [], requirementIds: ['R1'], estimate: { timeRange: null, costRange: null, basis: 'unknown' } }],
    model: 'fixture', threadId: 'thread', turnId: 'turn', analysisDurationMs: 1, analysisUsage: null };
  const draft = await plans.create({ request: project.idea, projectId: project.id }); await plans.finish(draft.id, draft.attemptId, version, null);
  await plans.reserve({ draftId: draft.id, versionId: version.id, optionId: 'option-1' }); await plans.markRun(draft.id, 'dispatched');
  const assets = new AssetPlanStore(join(root, 'assets.json')); await assets.init();
  await assets.upsert({ id: 'hero', projectId: project.id, name: 'Hero', kind: 'image', prompt: 'Hero reference' });
  const attestations = new ImageGenerationAttestationStore(join(root, 'attestations.json')); await attestations.init();
  await mkdir(join(project.root, 'dist'), { recursive: true }); await writeFile(join(project.root, 'dist/index.html'), '<h1>Playable version A</h1>');
  await writeFile(join(project.root, 'src/version.js'), 'export const version="A";');
  await writeFile(join(project.root, 'run.sh'), '#!/bin/sh\necho A\n'); await chmod(join(project.root, 'run.sh'), 0o755);
  await mkdir(join(project.root, 'public/assets/images'), { recursive: true }); await writeFile(join(project.root, 'public/assets/images/hero.png'), 'fixture-image');
  await attestations.record({ projectId: project.id, relativePath: 'public/assets/images/hero.png', sha256: digest('fixture-image'), provider: 'fixture-provider' });
  const versions = new GameVersionStore(join(root, 'versions'));
  const restorer = new GameVersionRestorer(versions, projects, plans, assets, attestations);
  const passed = await versions.capture({ metadata: await restorer.metadata(project), kind: 'passed', title: 'Version A', sourceRoot: project.root, previewDirectory: 'dist' });
  return { root, project, projects, plans, assets, attestations, versions, restorer, passed };
}
describe('playable version snapshots and full copy recovery', () => {
  it('keeps the last passed artifact playable after a new run fails', async () => {
    const f = await setup(); await writeFile(join(f.project.root, 'dist/index.html'), '<h1>Broken B</h1>');
    await f.versions.capture({ metadata: await f.restorer.metadata(f.project), kind: 'failed', title: 'B failed', error: 'Compile failed' });
    const history = await new GameVersionStore(f.versions.root).list(f.project.id);
    expect(history.find(v => v.id === f.passed.id)?.kind).toBe('passed'); expect(history.find(v => v.kind === 'failed')?.canRestore).toBe(false);
    const stored = await f.versions.read(f.project.id, f.passed.id); const snapshot = await f.versions.verify(stored);
    const preview = new PreviewServer();
    try { const url = await preview.start(f.project.id, snapshot, { directory: 'dist', sourceFallback: false, sourceAssetOverlay: false });
      expect(await (await fetch(url)).text()).toContain('Playable version A');
    } finally { await preview.stopAll(); }
  });
  it('restores matched files, selected plan and provenance while preserving all newer source and uploads', async () => {
    const f = await setup(); await writeFile(join(f.project.root, 'src/version.js'), 'new broken B');
    await writeFile(join(f.project.root, 'new-upload.txt'), 'New private reference');
    const newer = await f.plans.create({ request: 'Completely different plan B', projectId: f.project.id });
    const originalPlan = latestProjectPlan(await f.plans.list(), f.project.id)!;
    await f.plans.finish(newer.id, newer.attemptId, { ...originalPlan.version!, id: 'version-b' }, null);
    await f.plans.reserve({ draftId: newer.id, versionId: 'version-b', optionId: 'option-1' }); await f.plans.markRun(newer.id, 'dispatched');
    const restored = await f.restorer.restore({ projectId: f.project.id, versionId: f.passed.id, requestId: 'restore-1' });
    expect(restored.project.id).not.toBe(f.project.id); expect(restored.project.status).toBe('stopped'); expect(restored.project.threadId).toBeNull();
    expect(restored.project.targetFrameRate).toBe(30); expect(restored.project.noobiPackOverrideId).toBe('mosslight');
    expect(await readFile(join(f.project.root, 'new-upload.txt'), 'utf8')).toBe('New private reference');
    expect(await readFile(join(f.project.root, 'src/version.js'), 'utf8')).toBe('new broken B');
    expect(await readFile(join(restored.project.root, 'src/version.js'), 'utf8')).toContain('version="A"');
    expect((await stat(join(restored.project.root, 'run.sh'))).mode & 0o777).toBe(0o755);
    expect(JSON.parse(await readFile(join(restored.project.root, '.noobi/project.json'), 'utf8')).id).toBe(restored.project.id);
    expect(JSON.parse(await readFile(join(restored.project.root, 'public/assets/asset-pack.json'), 'utf8')).projectId).toBe(restored.project.id);
    expect(latestProjectPlan(await f.plans.list(), restored.project.id)!.version!.id).toBe('version-1');
    expect(latestProjectPlan(await f.plans.list(), f.project.id)!.version!.id).toBe('version-b');
    expect(await f.assets.list(restored.project.id)).toMatchObject([{ id: 'hero', projectId: restored.project.id }]);
    expect(await f.attestations.snapshot(restored.project.id)).toMatchObject([{ provider: 'fixture-provider', sha256: digest('fixture-image') }]);
    const backup = await f.versions.read(f.project.id, restored.backupVersionId);
    expect(backup.files.some(file => file.path === 'new-upload.txt')).toBe(true);
    expect(backup.metadata.plan!.version!.id).toBe('version-b');
  });
  it('deduplicates concurrent requests and replay after restart without making another project or backup', async () => {
    const f = await setup(); const input = { projectId: f.project.id, versionId: f.passed.id, requestId: 'same-request' };
    const [a,b] = await Promise.all([f.restorer.restore(input), f.restorer.restore(input)]); expect(a.project.id).toBe(b.project.id);
    const restarted = new GameVersionRestorer(new GameVersionStore(f.versions.root), f.projects, f.plans, f.assets, f.attestations);
    expect((await restarted.restore(input)).project.id).toBe(a.project.id); expect(await f.projects.list()).toHaveLength(2);
    expect((await f.versions.list(f.project.id)).filter(v => v.title === '恢复前备份')).toHaveLength(1);
  });
  it('rejects a corrupted snapshot before backing up or changing any project', async () => {
    const f = await setup(); await writeFile(join(f.versions.directory(f.project.id, f.passed.id), 'source/src/version.js'), 'tampered');
    await expect(f.restorer.restore({ projectId: f.project.id, versionId: f.passed.id, requestId: 'bad' })).rejects.toThrow('校验失败');
    expect(await f.projects.list()).toHaveLength(1); expect(await f.versions.list(f.project.id)).toHaveLength(1);
  });
  it('rejects symlinks in source backups and keeps the original untouched', async () => {
    const f = await setup(); await symlink(join(f.root, 'plans.json'), join(f.project.root, 'linked-private.json'));
    await expect(f.restorer.restore({ projectId: f.project.id, versionId: f.passed.id, requestId: 'link' })).rejects.toThrow('符号链接');
    expect(await f.projects.list()).toHaveLength(1);
  });
  it('does not publish a partial project if host metadata restoration fails', async () => {
    const f = await setup(); vi.spyOn(f.assets, 'importRestored').mockRejectedValueOnce(new Error('ledger disk full'));
    await expect(f.restorer.restore({ projectId: f.project.id, versionId: f.passed.id, requestId: 'disk' })).rejects.toThrow('ledger disk full');
    expect(await f.projects.list()).toHaveLength(1); expect(await f.plans.list()).toHaveLength(1);
    expect(await readFile(join(f.project.root, 'dist/index.html'), 'utf8')).toContain('Playable version A');
    await expect(f.restorer.restore({ projectId: f.project.id, versionId: f.passed.id, requestId: 'disk' })).rejects.toThrow('未完成');
  });
  it('refuses active projects, cross-project versions, unsafe IDs and plan mismatches', async () => {
    const f = await setup(); await f.projects.update(f.project.id, { status: 'running' });
    await expect(f.restorer.restore({ projectId: f.project.id, versionId: f.passed.id, requestId: 'running' })).rejects.toThrow('停止');
    await expect(f.versions.read('../other', f.passed.id)).rejects.toThrow('ID');
    await expect(f.versions.read('different-project', f.passed.id)).rejects.toThrow();
    const metadata = await f.restorer.metadata(f.project); metadata.plan!.run!.projectId = 'wrong';
    await expect(f.versions.capture({ metadata, kind: 'passed', title: 'wrong', sourceRoot: f.project.root, previewDirectory: 'dist' })).rejects.toThrow('不匹配');
  });
  it('records honest file changes and never promotes a backup to passed', async () => {
    const f = await setup(); await writeFile(join(f.project.root, 'new.txt'), 'new'); await writeFile(join(f.project.root, 'src/version.js'), 'B'); await rm(join(f.project.root, 'run.sh'));
    const backup = await f.versions.capture({ metadata: await f.restorer.metadata(f.project), kind: 'backup', title: 'Unverified B', sourceRoot: f.project.root });
    expect(backup.kind).toBe('backup'); expect(backup.changes).toEqual({ added: 1, modified: 1, removed: 1 });
    expect(backup.canPreview).toBe(false); expect(backup.canRestore).toBe(true);
  });
  it('takes Godot artifacts from the verified frozen export instead of the stale workspace output', async () => {
    const f = await setup(); await mkdir(join(f.project.root, 'build/web'), { recursive: true }); await writeFile(join(f.project.root, 'build/web/index.html'), 'old');
    const artifacts = join(f.root, 'frozen-export'); await mkdir(artifacts); await writeFile(join(artifacts, 'index.html'), 'verified-export');
    const version = await f.versions.capture({ metadata: await f.restorer.metadata(f.project), kind: 'passed', title: 'Godot export fixture',
      sourceRoot: f.project.root, artifactRoot: artifacts, previewDirectory: 'build/web' });
    const root = await f.versions.verify(await f.versions.read(f.project.id, version.id));
    expect(await readFile(join(root, 'build/web/index.html'), 'utf8')).toBe('verified-export');
    expect(await readFile(join(f.project.root, 'build/web/index.html'), 'utf8')).toBe('old');
  });
  it('keeps historical reports but does not show them as current validation of the restored copy', async () => {
    const f = await setup(); const latest = join(f.project.root, 'artifacts/playtest/latest');
    await mkdir(latest, { recursive: true }); await writeFile(join(latest, 'historical-evidence.txt'), 'old report evidence');
    const version = await f.versions.capture({ metadata: await f.restorer.metadata(f.project), kind: 'passed', title: 'With report', sourceRoot: f.project.root, previewDirectory: 'dist' });
    const restored = await f.restorer.restore({ projectId: f.project.id, versionId: version.id, requestId: 'archive-report' });
    const history = join(restored.project.root, 'artifacts/playtest/history'); const entries = await readdir(history);
    expect(entries).toHaveLength(1);
    expect(await readFile(join(history, entries[0]!, 'historical-evidence.txt'), 'utf8')).toBe('old report evidence');
    expect(await readdir(join(restored.project.root, 'artifacts/playtest/latest'))).toEqual(['screenshots']);
    expect(await readFile(join(latest, 'historical-evidence.txt'), 'utf8')).toBe('old report evidence');
  });
  it('never publishes a passed version when its final delivery validation fails', async () => {
    const f = await setup();
    await expect(f.versions.capture({ metadata: await f.restorer.metadata(f.project), kind: 'passed', title: 'Changed during capture',
      sourceRoot: f.project.root, previewDirectory: 'dist', validate: async () => { throw new Error('delivery changed'); } })).rejects.toThrow('delivery changed');
    expect(await f.versions.list(f.project.id)).toHaveLength(1);
    expect(await readdir(join(f.versions.root, f.project.id))).toEqual([f.passed.id]);
  });

});
