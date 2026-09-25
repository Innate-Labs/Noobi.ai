import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProductionCheckpointStore } from './productionCheckpointStore.js';
import type { GodotBuild } from './godotBuildStore.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
describe('retained production checkpoints', () => {
  it('keeps an accepted sample when a later unbuilt candidate is rejected', async () => {
    const root = await mkdtemp(join(tmpdir(), 'checkpoint-')); roots.push(root);
    const store = new ProductionCheckpointStore(root);
    const build = { record: { projectId: 'project', buildId: 'a', status: 'built', sourceHash: 'source-a',
      artifactHash: 'artifact-a', qualitySpec: { id: 'spec' } } } as GodotBuild;
    await store.accept('visual-sample', build);
    await expect(store.accept('visual-sample', { ...build, record: { ...build.record, buildId: 'b', status: 'failed' } })).rejects.toThrow();
    expect(await store.latest('project', 'visual-sample')).toMatchObject({ buildId: 'a', sourceHash: 'source-a' });
    expect(await store.latest('project', 'delivery')).toBeNull();
    await expect(store.latest('../other', 'visual-sample')).rejects.toThrow();
  });
});
