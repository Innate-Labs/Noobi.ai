import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { GodotBuild } from './godotBuildStore.js';

export type ProductionMilestone = 'core-loop' | 'visual-sample' | 'delivery';
/** Pointers to retained, immutable Godot snapshots; no generated file can set
 * a milestone to passed. Historical checkpoints are never overwritten. */
export class ProductionCheckpointStore {
  constructor(private readonly root: string) {}
  async accept(stage: ProductionMilestone, build: GodotBuild): Promise<void> {
    const { record } = build;
    if (!/^[a-zA-Z0-9_-]+$/u.test(record.projectId) || !/^[a-zA-Z0-9_-]+$/u.test(record.buildId)
      || record.status !== 'built' || !record.artifactHash || !record.qualitySpec) throw new Error('Cannot checkpoint an unverified build');
    const directory = join(this.root, record.projectId, stage);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const entry = { version: 1, stage, buildId: record.buildId, sourceHash: record.sourceHash,
      artifactHash: record.artifactHash, specId: record.qualitySpec.id, checkedAt: new Date().toISOString() };
    await writeFile(join(directory, `${record.buildId}.json`), JSON.stringify(entry, null, 2), { flag: 'wx', mode: 0o600 })
      .catch(error => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; });
    const temporary = join(directory, `${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(entry, null, 2), { flag: 'wx', mode: 0o600 });
    await rename(temporary, join(directory, 'latest.json'));
  }
  async latest(projectId: string, stage: ProductionMilestone): Promise<unknown | null> {
    if (!/^[a-zA-Z0-9_-]+$/u.test(projectId)) throw new Error('Invalid project id');
    try { return JSON.parse(await readFile(join(this.root, projectId, stage, 'latest.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
}
