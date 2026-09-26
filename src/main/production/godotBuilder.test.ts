import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { GodotEnvironmentService } from '../godotEnvironmentService.js';
import { GodotBuildStore } from './godotBuildStore.js';
import { buildGodotCandidate } from './godotBuilder.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it('avoids repeated engine work only while source, engine and exported bytes remain valid', async () => {
  const root = await mkdtemp(join(tmpdir(), 'noobi-builder-reuse-')); roots.push(root);
  const projectRoot = join(root, 'game'); await mkdir(projectRoot);
  await writeFile(join(projectRoot, 'project.godot'), '[application]\nconfig/name="Test"\n');
  let engineVersion = '4.7.1';
  const execute = vi.fn(async ({ kind, projectPath }: { kind: string; projectPath: string }) => {
    if (kind === 'export') {
      await mkdir(join(projectPath, 'build/web'), { recursive: true });
      for (const extension of ['html', 'js', 'wasm', 'pck']) {
        await writeFile(join(projectPath, `build/web/index.${extension}`), 'engine-export');
      }
    }
    return { task: kind, ok: true, stdout: '', stderr: '' };
  });
  const environment = {
    getStatus: async () => ({ canExportProjects: true, tool: { version: engineVersion },
      exportTemplates: { expectedVersion: engineVersion } }), execute,
  } as unknown as GodotEnvironmentService;
  const onReused = vi.fn();
  const input = { projectId: 'test', projectRoot, environment,
    store: new GodotBuildStore(join(root, 'private')), onReused };
  const first = await buildGodotCandidate(input);
  const second = await buildGodotCandidate(input);
  expect(second.record.buildId).toBe(first.record.buildId);
  expect(execute).toHaveBeenCalledTimes(4);
  expect(onReused).toHaveBeenCalledOnce();
  await writeFile(join(projectRoot, 'new-scene.gd'), 'extends Node3D\n');
  const third = await buildGodotCandidate(input);
  expect(third.record.buildId).not.toBe(first.record.buildId);
  expect(execute).toHaveBeenCalledTimes(8);
  engineVersion = '4.8';
  const fourth = await buildGodotCandidate(input);
  expect(fourth.record.buildId).not.toBe(third.record.buildId);
  expect(execute).toHaveBeenCalledTimes(12);
  await writeFile(join(fourth.root, 'build/web/index.pck'), 'tampered');
  const fifth = await buildGodotCandidate(input);
  expect(fifth.record.buildId).not.toBe(fourth.record.buildId);
  expect(execute).toHaveBeenCalledTimes(16);
});

it('rejects an impossible progression graph before engine work and retains its evidence', async () => {
  const root=await mkdtemp(join(tmpdir(),'noobi-graph-build-'));roots.push(root);
  const projectRoot=join(root,'game');await mkdir(join(projectRoot,'data'),{recursive:true});
  await writeFile(join(projectRoot,'project.godot'),'[application]\nconfig/name="Graph"\n');
  const d=JSON.parse(await readFile(new URL('../../../examples/progression/three-regions.json',import.meta.url),'utf8'));
  d.quests[0].region='ruins';await writeFile(join(projectRoot,'data/progression.json'),JSON.stringify(d));
  const execute=vi.fn();const environment={getStatus:async()=>({canExportProjects:true,tool:{version:'4.7.1'},exportTemplates:{expectedVersion:'4.7.1'}}),execute} as unknown as GodotEnvironmentService;
  const store=new GodotBuildStore(join(root,'private'));
  await expect(buildGodotCandidate({projectId:'test',projectRoot,environment,store})).rejects.toThrow('No reachable ending');
  expect(execute).not.toHaveBeenCalled();expect(await store.latest('test')).toBeNull();
});


it('stops a declared but incomplete assembly before engine work and preserves its failure', async () => {
  const root=await mkdtemp(join(tmpdir(),'noobi-assembly-build-'));roots.push(root);
  const projectRoot=join(root,'game');await mkdir(join(projectRoot,'data'),{recursive:true});
  await writeFile(join(projectRoot,'project.godot'),'[application]\nconfig/name="Assembly"\n');
  await writeFile(join(projectRoot,'data/progression.json'),await readFile(new URL('../../../examples/progression/three-regions.json',import.meta.url)));
  await writeFile(join(projectRoot,'data/game-assembly.json'),JSON.stringify({version:1}));
  const execute=vi.fn();const environment={getStatus:async()=>({canExportProjects:true,tool:{version:'4.7.1'},exportTemplates:{expectedVersion:'4.7.1'}}),execute} as unknown as GodotEnvironmentService;
  const store=new GodotBuildStore(join(root,'private'));
  await expect(buildGodotCandidate({projectId:'test',projectRoot,environment,store})).rejects.toThrow('ASSEMBLY');
  expect(execute).not.toHaveBeenCalled();expect(await store.latest('test')).toBeNull();
  const paths=await readdir(join(root,'private'),{recursive:true});
  const report=paths.find(p=>p.endsWith('assembly-check.json'));
  expect(report).toBeDefined();
  const failed=JSON.parse(await readFile(join(root,'private',report!),'utf8'));
  expect(failed.ok).toBe(false);expect(failed.sourceHash).toMatch(/^[a-f0-9]{64}$/);expect(failed.error).toContain('identity');
});
