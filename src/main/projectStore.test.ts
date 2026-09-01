import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
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

describe('ProjectStore selected workspace directory', () => {
  it('initializes the exact empty folder selected by the user without nesting another directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-selected-workspace-'));
    roots.push(root);
    const selectedDirectory = join(root, '鸭嘴兽大战僵尸');
    await mkdir(selectedDirectory);
    const store = new ProjectStore(join(root, 'project-store.json'), join(root, 'default-games'));

    const project = await store.create({
      name: '鸭嘴兽大战僵尸',
      idea: '制作一个鸭嘴兽对抗僵尸的游戏',
      projectDirectory: selectedDirectory,
      engine: 'web',
    });

    expect(project.root).toBe(await realpath(selectedDirectory));
    await expect(readFile(join(selectedDirectory, 'package.json'), 'utf8')).resolves.toContain('"name"');
  });

  it('refuses a non-empty selected folder and preserves the existing files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-selected-workspace-'));
    roots.push(root);
    const selectedDirectory = join(root, '已有内容');
    await mkdir(selectedDirectory);
    await writeFile(join(selectedDirectory, '重要资料.txt'), '不要覆盖', 'utf8');
    const store = new ProjectStore(join(root, 'project-store.json'), join(root, 'default-games'));

    await expect(store.create({
      name: '已有内容',
      idea: '制作一个游戏',
      projectDirectory: selectedDirectory,
      engine: 'web',
    })).rejects.toThrow('请选择一个空文件夹');
    await expect(readFile(join(selectedDirectory, '重要资料.txt'), 'utf8')).resolves.toBe('不要覆盖');
  });

  it('recovers a project after its folder is renamed in Finder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-relocate-workspace-'));
    roots.push(root);
    const originalDirectory = join(root, '旧游戏名');
    const renamedDirectory = join(root, '新游戏名');
    await mkdir(originalDirectory);
    const store = new ProjectStore(join(root, 'project-store.json'), join(root, 'default-games'));
    const project = await store.create({
      name: '旧游戏名',
      idea: '制作一个可以运行的游戏',
      projectDirectory: originalDirectory,
      engine: 'web',
    });

    await rename(originalDirectory, renamedDirectory);
    const relocated = await store.relocate(project.id, renamedDirectory);

    expect(relocated.root).toBe(await realpath(renamedDirectory));
    await expect(readFile(join(relocated.root, 'package.json'), 'utf8')).resolves.toContain('"name"');
  });

  it('refuses to reconnect a project to a different NooBi game folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-relocate-workspace-'));
    roots.push(root);
    const firstDirectory = join(root, '第一个游戏');
    const secondDirectory = join(root, '第二个游戏');
    await mkdir(firstDirectory);
    await mkdir(secondDirectory);
    const store = new ProjectStore(join(root, 'project-store.json'), join(root, 'default-games'));
    const first = await store.create({
      name: '第一个游戏',
      idea: '第一个游戏',
      projectDirectory: firstDirectory,
      engine: 'web',
    });
    await store.create({
      name: '第二个游戏',
      idea: '第二个游戏',
      projectDirectory: secondDirectory,
      engine: 'web',
    });

    await expect(store.relocate(first.id, secondDirectory)).rejects.toThrow('不属于当前游戏');
  });
});
