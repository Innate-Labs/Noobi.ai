import type { Server } from 'node:http';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectManager } from '../src/main/projectManager.js';
import type { StateStore } from '../src/main/store.js';
import type { ProjectRecord } from '../src/shared/types.js';

const temporaryRoots: string[] = [];
const managers: ProjectManager[] = [];

afterEach(async () => {
  for (const manager of managers.splice(0)) manager.stopAllPreviews();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('ProjectManager project boundaries', () => {
  it.each(['.', '..'])('rejects the unsafe project name %s', async (name) => {
    const fixture = await createFixture();

    await expect(
      fixture.manager.create({
        name,
        directory: fixture.workspace,
        prompt: '制作一个测试游戏',
      }),
    ).rejects.toThrow('安全的目录名');
    expect(await readdir(fixture.workspace)).toEqual([]);
  });

  it.each(['CON', 'con.txt', 'COM0', 'LPT1'])(
    'rejects the Windows-unsafe project name %s on every host',
    async (name) => {
      const fixture = await createFixture();

      await expect(
        fixture.manager.create({
          name,
          directory: fixture.workspace,
          prompt: '制作一个测试游戏',
        }),
      ).rejects.toThrow('安全的目录名');
      expect(await readdir(fixture.workspace)).toEqual([]);
    },
  );

  it('removes Windows control characters from the project directory', async () => {
    const fixture = await createFixture();
    const project = await fixture.manager.create({
      name: 'Game\u0001Name',
      directory: fixture.workspace,
      prompt: '制作一个测试游戏',
    });

    expect(path.basename(project.path)).toBe('Game-Name');
  });

  it.each([
    ['Game.', 'Game'],
    ['Game ', 'Game'],
  ])(
    'removes Windows-unsafe trailing punctuation from %s',
    async (name, expected) => {
      const fixture = await createFixture();

      const project = await fixture.manager.create({
        name,
        directory: fixture.workspace,
        prompt: '制作一个测试游戏',
      });

      expect(path.basename(project.path)).toBe(expected);
    },
  );

  it('removes a trailing dot created by project-name truncation', async () => {
    const fixture = await createFixture();
    const project = await fixture.manager.create({
      name: `${'A'.repeat(79)}.suffix`,
      directory: fixture.workspace,
      prompt: '制作一个测试游戏',
    });

    expect(path.basename(project.path)).toBe('A'.repeat(79));
  });

  it('does not silently reuse a non-empty project directory', async () => {
    const fixture = await createFixture();
    const existingProject = path.join(fixture.workspace, 'Existing-Game');
    const sentinel = path.join(existingProject, 'keep.txt');
    await mkdir(existingProject);
    await writeFile(sentinel, 'do-not-overwrite', 'utf8');

    await expect(
      fixture.manager.create({
        name: 'Existing Game',
        directory: fixture.workspace,
        prompt: '制作一个测试游戏',
      }),
    ).rejects.toThrow('不是空目录');
    expect(await readFile(sentinel, 'utf8')).toBe('do-not-overwrite');
  });

  it('blocks direct and intermediate symlinks that escape the project', async () => {
    const fixture = await createFixture();
    const projectPath = path.join(fixture.root, 'project');
    const outsidePath = path.join(fixture.root, 'outside');
    await mkdir(projectPath);
    await mkdir(outsidePath);
    await writeFile(
      path.join(outsidePath, 'secret.txt'),
      'outside-secret',
      'utf8',
    );
    await symlink(
      path.join(outsidePath, 'secret.txt'),
      path.join(projectPath, 'direct-secret.txt'),
    );
    await symlink(outsidePath, path.join(projectPath, 'escape'));
    const project = makeProject(projectPath);

    await expect(
      fixture.manager.readProjectFile(project, 'direct-secret.txt'),
    ).rejects.toThrow('符号链接');
    await expect(
      fixture.manager.readProjectFile(project, 'escape/secret.txt'),
    ).rejects.toThrow('路径超出项目目录');
  });

  it('does not follow a symlinked .qwen directory while writing the system prompt', async () => {
    const fixture = await createFixture();
    const projectPath = path.join(fixture.root, 'project');
    const outsidePath = path.join(fixture.root, 'outside');
    await mkdir(projectPath);
    await mkdir(outsidePath);
    await symlink(outsidePath, path.join(projectPath, '.qwen'));

    await expect(
      fixture.manager.prepareSystemPrompt(projectPath),
    ).rejects.toThrow('符号链接');
    await expect(
      readFile(path.join(outsidePath, 'system.md'), 'utf8'),
    ).rejects.toThrow();
  });
});

describe('ProjectManager preview server', () => {
  it('requires a built dist/index.html instead of serving source index.html', async () => {
    const fixture = await createFixture();
    const projectPath = path.join(fixture.root, 'project');
    await mkdir(projectPath);
    await writeFile(
      path.join(projectPath, 'index.html'),
      '<h1>source only</h1>',
      'utf8',
    );

    await expect(
      fixture.manager.startPreview(makeProject(projectPath)),
    ).rejects.toThrow('dist/index.html');
  });

  it('rebuilds the preview server when preview is requested again', async () => {
    const fixture = await createPreviewFixture();
    await fixture.manager.startPreview(fixture.project);
    const previews = getPreviewMap(fixture.manager);
    const firstServer = previews.get(fixture.project.id)!.server;

    await fixture.manager.startPreview(fixture.project);
    const secondServer = previews.get(fixture.project.id)!.server;

    expect(secondServer).not.toBe(firstServer);
    expect(firstServer.listening).toBe(false);
    expect(secondServer.listening).toBe(true);
  });

  it('uses SPA fallback only for HTML navigation and sets safe response headers', async () => {
    const fixture = await createPreviewFixture();
    const url = await fixture.manager.startPreview(fixture.project);

    const navigation = await fetch(new URL('/play/level-one', url), {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    expect(navigation.status).toBe(200);
    expect(await navigation.text()).toContain('preview-index');

    const missingAsset = await fetch(new URL('/assets/missing.js', url), {
      headers: { Accept: '*/*' },
    });
    expect(missingAsset.status).toBe(404);
    expect(missingAsset.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await missingAsset.text()).not.toContain('preview-index');

    const audio = await fetch(new URL('/assets/sound.ogg', url));
    expect(audio.status).toBe(200);
    expect(audio.headers.get('content-type')).toBe('audio/ogg');
    expect(audio.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('does not serve a dist symlink that points outside the project', async () => {
    const fixture = await createPreviewFixture();
    const outsideScript = path.join(fixture.root, 'outside.js');
    await writeFile(outsideScript, 'globalThis.outsideSecret = true;', 'utf8');
    await symlink(outsideScript, path.join(fixture.dist, 'escape.js'));
    const url = await fixture.manager.startPreview(fixture.project);

    const response = await fetch(new URL('/escape.js', url), {
      headers: { Accept: '*/*' },
    });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('outsideSecret');
  });
});

async function createFixture(): Promise<{
  root: string;
  workspace: string;
  manager: ProjectManager;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'gameagent-project-manager-'));
  temporaryRoots.push(root);
  const workspace = path.join(root, 'workspace');
  const templatesDir = path.join(root, 'templates');
  const docsDir = path.join(root, 'docs');
  const promptPath = path.join(root, 'custom.md');
  await Promise.all([
    mkdir(workspace),
    mkdir(templatesDir),
    mkdir(docsDir),
    writeFile(
      promptPath,
      '模板：{TEMPLATES_DIR}\n文档：{DOCS_DIR}\n项目：{PROJECT_ROOT}',
      'utf8',
    ),
  ]);
  const store = {
    upsertProject: vi.fn(async () => undefined),
  } as unknown as StateStore;
  const manager = new ProjectManager(store, {
    promptPath,
    templatesDir,
    docsDir,
  });
  managers.push(manager);
  return { root, workspace, manager };
}

async function createPreviewFixture(): Promise<{
  root: string;
  dist: string;
  manager: ProjectManager;
  project: ProjectRecord;
}> {
  const fixture = await createFixture();
  const projectPath = path.join(fixture.root, 'project');
  const dist = path.join(projectPath, 'dist');
  const assets = path.join(dist, 'assets');
  await mkdir(assets, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(dist, 'index.html'),
      '<!doctype html><title>preview-index</title>',
      'utf8',
    ),
    writeFile(
      path.join(assets, 'sound.ogg'),
      Buffer.from([0x4f, 0x67, 0x67, 0x53]),
    ),
  ]);
  return {
    root: fixture.root,
    dist,
    manager: fixture.manager,
    project: makeProject(projectPath),
  };
}

function makeProject(projectPath: string): ProjectRecord {
  const now = new Date().toISOString();
  return {
    id: `project-${path.basename(projectPath)}`,
    name: 'Test Project',
    path: projectPath,
    prompt: '制作一个测试游戏',
    status: 'completed',
    stage: 'verify',
    createdAt: now,
    updatedAt: now,
  };
}

function getPreviewMap(
  manager: ProjectManager,
): Map<string, { server: Server; url: string }> {
  return (
    manager as unknown as {
      previews: Map<string, { server: Server; url: string }>;
    }
  ).previews;
}
