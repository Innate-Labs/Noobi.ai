import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ProjectStore } from './projectStore';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ProjectStore renaming', () => {
  it('persists a sidebar display name without moving the workspace directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-project-rename-'));
    roots.push(root);
    const workspace = join(root, 'games');
    const storageFile = join(root, 'project-store.json');
    const store = new ProjectStore(storageFile, workspace);
    const project = await store.create({
      name: 'New Game',
      idea: '制作一个鸭嘴兽游戏',
      parentDirectory: workspace,
      engine: 'web',
    });

    const renamed = await store.update(project.id, { name: '鸭嘴兽大战僵尸' });

    expect(renamed.name).toBe('鸭嘴兽大战僵尸');
    expect(renamed.root).toBe(project.root);
    const persisted = JSON.parse(await readFile(storageFile, 'utf8')) as {
      projects: Array<{ id: string; name: string; root: string }>;
    };
    expect(persisted.projects.find((item) => item.id === project.id)).toMatchObject({
      name: '鸭嘴兽大战僵尸',
      root: project.root,
    });
  });
});
