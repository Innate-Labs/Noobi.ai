import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GodotBuildStore, type GodotBuild } from './godotBuildStore.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'noobi-build-test-')); roots.push(root);
  const project = join(root, 'game'); await mkdir(project);
  await writeFile(join(project, 'project.godot'), '[application]\n');
  await writeFile(join(project, 'main.gd'), 'extends Node\n');
  return { project, store: new GodotBuildStore(join(root, 'private')) };
}
async function artifacts(build: GodotBuild, text = 'fresh') {
  await mkdir(join(build.root, 'build/web'), { recursive: true });
  for (const ext of ['html', 'js', 'wasm', 'pck']) await writeFile(join(build.root, `build/web/index.${ext}`), text);
}
describe('frozen Godot builds', () => {
  it('retains the host report independently of workspace reports and rejects a mismatched binding', async () => {
    const { project, store } = await fixture();
    const build = await store.create('game', project, '4.7.1', '4.7.1.stable'); await artifacts(build); await store.publish(build);
    const report = { version: 1 as const, verdict: 'repair' as const, score: 50, checkedAt: new Date().toISOString(),
      reportPath: 'artifacts/playtest/latest/report.json', checks: [], build: {
        buildId: build.record.buildId, sourceHash: build.record.sourceHash,
        artifactHash: build.record.artifactHash, testSuiteVersion: build.record.testSuiteVersion,
      } };
    await store.recordReport(build, report);
    await mkdir(join(project, 'artifacts/playtest/latest'), { recursive: true });
    await writeFile(join(project, report.reportPath), JSON.stringify({ ...report, verdict: 'pass', score: 100 }));
    expect((await store.report(build))?.verdict).toBe('repair');
    await expect(store.recordReport(build, { ...report, build: { ...report.build, artifactHash: 'forged' } })).rejects.toThrow('构建版本不一致');
  });
  it('marks legacy exports unverified and never imports their claims', async () => {
    const { project, store } = await fixture();
    await mkdir(join(project, 'build/web'), { recursive: true });
    await writeFile(join(project, 'build/web/index.html'), 'old');
    expect((await store.inspect('game', project)).preview.state).toBe('legacy');
    const build = await store.create('game', project, '4.7.1', '4.7.1.stable');
    await expect(readFile(join(build.root, 'build/web/index.html'))).rejects.toThrow();
  });
  it('publishes a frozen version, detects changed source and preserves the previous package on failure', async () => {
    const { project, store } = await fixture();
    const first = await store.create('game', project, '4.7.1', '4.7.1.stable');
    await artifacts(first); await store.publish(first);
    expect((await store.inspect('game', project)).preview.state).toBe('current');
    await writeFile(join(project, 'main.gd'), 'extends Node2D\n');
    expect((await store.inspect('game', project)).preview.state).toBe('stale');
    const second = await store.create('game', project, '4.7.1', '4.7.1.stable');
    await artifacts(second, 'broken'); await store.fail(second, new Error('runtime failure'));
    expect((await store.latest('game'))?.record.buildId).toBe(first.record.buildId);
    expect(await readFile(join(first.root, 'main.gd'), 'utf8')).toBe('extends Node\n');
  });
  it('rejects a source change during build, and an incomplete export', async () => {
    const { project, store } = await fixture();
    const build = await store.create('game', project, '4.7.1', '4.7.1.stable');
    await expect(store.publish(build)).rejects.toThrow();
    await artifacts(build);
    await writeFile(join(project, 'main.gd'), 'extends Control\n');
    await expect(store.publish(build)).rejects.toThrow('源码或素材已更新');
    expect(await store.latest('game')).toBeNull();
  });
  it('detects input and exported artifact tampering, including the JS loader', async () => {
    const { project, store } = await fixture();
    const build = await store.create('game', project, '4.7.1', '4.7.1.stable');
    await artifacts(build); await store.publish(build);
    await writeFile(join(build.root, 'build/web/index.js'), 'different loader');
    await expect(store.verifyArtifacts(build)).rejects.toThrow('产物');
    expect((await store.inspect('game', project)).preview.state).toBe('unavailable');
    const next = await store.create('game', project, '4.7.1', '4.7.1.stable');
    await artifacts(next); await writeFile(join(next.root, 'main.gd'), 'modified');
    await expect(store.publish(next)).rejects.toThrow('输入文件发生变化');
  });
  it('ignores generated evidence but includes the test manifest and media', async () => {
    const { project, store } = await fixture();
    await mkdir(join(project, '.noobi')); await writeFile(join(project, '.noobi/playtest.json'), '{}');
    const build = await store.create('game', project, '4.7.1', '4.7.1.stable');
    await artifacts(build); await store.publish(build);
    await mkdir(join(project, 'artifacts')); await writeFile(join(project, 'artifacts/report.json'), 'new evidence');
    await store.assertCurrent(build);
    await writeFile(join(project, '.noobi/playtest.json'), '{"changed":true}');
    await expect(store.assertCurrent(build)).rejects.toThrow('源码或素材已更新');
  });
  it('rejects symlink inputs and never switches on cancellation', async () => {
    const { project, store } = await fixture();
    await symlink(join(project, 'main.gd'), join(project, 'linked.gd'));
    await expect(store.create('game', project, '4.7.1', '4.7.1.stable')).rejects.toThrow('符号链接');
    await rm(join(project, 'linked.gd'));
    const build = await store.create('game', project, '4.7.1', '4.7.1.stable'); await artifacts(build);
    const controller = new AbortController(); controller.abort();
    await expect(store.publish(build, controller.signal)).rejects.toThrow();
    expect(await store.latest('game')).toBeNull();
  });
});
