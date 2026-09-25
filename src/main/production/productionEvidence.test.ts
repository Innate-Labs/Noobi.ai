import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GodotBuildStore } from './godotBuildStore.js';
import { productionEvidence } from './productionEvidence.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it('binds only a current frozen artifact and keeps asset references, rejecting changed bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noobi-receipt-')); roots.push(directory);
  const root = join(directory, 'game'); await mkdir(root); await writeFile(join(root, 'main.gd'), 'version A');
  const builds = new GodotBuildStore(join(directory, 'builds'));
  const build = await builds.create('project', root, 'fixture', 'fixture');
  await mkdir(join(build.root, 'build/web'), { recursive: true });
  await writeFile(join(build.root, 'build/web/index.html'), '<button>Play</button>');
  for (const name of ['index.js', 'index.wasm', 'index.pck']) await writeFile(join(build.root, 'build/web', name), 'fixture artifact');
  await builds.publish(build);
  const input = { projectId: 'project', root, engine: 'godot', builds, assets: async () => [] };
  expect((await productionEvidence(input)).build?.id).toBe(build.record.buildId);
  await writeFile(join(root, 'main.gd'), 'version B');
  expect((await productionEvidence(input)).build).toBeUndefined();
  await writeFile(join(root, 'main.gd'), 'version A');
  await writeFile(join(build.root, 'build/web/index.html'), 'tampered');
  const invalid = await productionEvidence(input);
  expect(invalid.build).toBeUndefined(); expect(invalid.buildUnavailable).toContain('无法核对');
});
it('fails if the workspace changes while capturing the ledger', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noobi-receipt-')); roots.push(directory);
  await writeFile(join(directory, 'main.gd'), 'version A');
  await expect(productionEvidence({ projectId: 'project', root: directory, engine: 'web',
    builds: new GodotBuildStore(join(directory, 'builds')), assets: async () => { await writeFile(join(directory, 'main.gd'), 'version B'); return []; },
  })).rejects.toThrow('保存制作步骤时工程发生变化');
});
