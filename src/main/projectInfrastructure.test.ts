import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { PreviewServer } from './previewServer.js';
import { ProjectStore } from './projectStore.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('project infrastructure', () => {
  it('atomically reloads projects and rejects inspector traversal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-store-test-'));
    roots.push(root);
    const storageFile = join(root, 'data/projects.json');
    const workspace = join(root, 'games');
    const store = new ProjectStore(storageFile, workspace);
    const project = await store.create({
      name: 'Boundary Game',
      idea: 'Test the project boundary.',
      parentDirectory: workspace,
      model: null,
    });
    const reloaded = new ProjectStore(storageFile, workspace);
    await expect(reloaded.get(project.id)).resolves.toMatchObject({
      name: 'Boundary Game',
      targetFrameRate: 60,
    });
    await expect(reloaded.readProjectFile(project.id, '../projects.json')).rejects.toThrow();
  });

  it('persists supported target frame rates, validates patches, and migrates legacy projects to 60 FPS', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-fps-store-test-'));
    roots.push(root);
    const storageFile = join(root, 'data/projects.json');
    const workspace = join(root, 'games');
    const store = new ProjectStore(storageFile, workspace);

    const project = await store.create({
      name: 'High Refresh Game',
      idea: 'Verify target frame-rate persistence.',
      parentDirectory: workspace,
      model: null,
      targetFrameRate: 120,
    });
    expect(project.targetFrameRate).toBe(120);
    await expect(store.update(project.id, { targetFrameRate: 30 })).resolves.toMatchObject({
      targetFrameRate: 30,
    });
    await expect(store.update(project.id, { targetFrameRate: 24 as 30 })).rejects.toThrow(
      'targetFrameRate must be 30, 60, or 120',
    );
    await expect(store.create({
      name: 'Invalid FPS',
      idea: 'Reject unsupported cadence.',
      parentDirectory: workspace,
      targetFrameRate: 144 as 30,
    })).rejects.toThrow('targetFrameRate must be 30, 60, or 120');

    const legacyStorageFile = join(root, 'legacy/projects.json');
    const legacyRoot = join(root, 'legacy-game');
    const timestamp = new Date().toISOString();
    await mkdir(join(root, 'legacy'), { recursive: true });
    await mkdir(legacyRoot, { recursive: true });
    await writeFile(legacyStorageFile, `${JSON.stringify({
      version: 1,
      projects: [{
        id: 'legacy-project',
        name: 'Legacy Game',
        idea: 'Load without a targetFrameRate field.',
        root: legacyRoot,
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'draft',
        stage: 'brief',
        model: null,
        threadId: null,
        toolsetVersion: 0,
        activeTurnId: null,
        lastError: null,
      }],
      settings: {
        defaultWorkspace: workspace,
        defaultModel: null,
        defaultEffort: 'medium',
        theme: 'dark',
      },
    }, null, 2)}\n`);

    const legacyStore = new ProjectStore(legacyStorageFile, workspace);
    await expect(legacyStore.get('legacy-project')).resolves.toMatchObject({ targetFrameRate: 60 });
    const migrated = JSON.parse(await readFile(legacyStorageFile, 'utf8')) as {
      projects: Array<{ targetFrameRate?: number }>;
    };
    expect(migrated.projects[0]?.targetFrameRate).toBe(60);
  });

  it('serves the playable starter on loopback without blocking the Electron iframe', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-preview-test-'));
    roots.push(root);
    const store = new ProjectStore(join(root, 'projects.json'), join(root, 'games'));
    const project = await store.create({
      name: 'Preview Game',
      idea: 'Verify the preview.',
      parentDirectory: join(root, 'games'),
      model: null,
    });
    const preview = new PreviewServer();
    try {
      const url = await preview.start(project.id, project.root);
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<canvas');
      expect(response.headers.get('x-frame-options')).toBeNull();
      expect(new URL(url).hostname).toBe('127.0.0.1');
    } finally {
      await preview.stopAll();
    }
  });

  it('mirrors Vite public asset URLs while using the source fallback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-preview-assets-test-'));
    roots.push(root);
    const store = new ProjectStore(join(root, 'projects.json'), join(root, 'games'));
    const project = await store.create({
      name: 'Asset Preview Game',
      idea: 'Verify public asset routing before a build.',
      parentDirectory: join(root, 'games'),
      model: null,
    });
    const assetDirectory = join(project.root, 'public/assets/images');
    const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    await mkdir(assetDirectory, { recursive: true });
    await writeFile(join(assetDirectory, 'hero.png'), pngHeader);

    const preview = new PreviewServer();
    try {
      const url = await preview.start(project.id, project.root);
      const response = await fetch(new URL('/assets/images/hero.png', url));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(pngHeader);

      const documentResponse = await fetch(url);
      expect(documentResponse.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    } finally {
      await preview.stopAll();
    }
  });

  it('serves fresh public media ahead of dist while keeping documents and scripts in dist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-preview-fresh-assets-test-'));
    roots.push(root);
    const store = new ProjectStore(join(root, 'projects.json'), join(root, 'games'));
    const project = await store.create({
      name: 'Fresh Asset Preview Game',
      idea: 'Verify generated assets are visible before the next build.',
      parentDirectory: join(root, 'games'),
      model: null,
    });
    const publicAssetDirectory = join(project.root, 'public/assets/images');
    const distAssetDirectory = join(project.root, 'dist/assets');
    const freshPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    await mkdir(publicAssetDirectory, { recursive: true });
    await mkdir(distAssetDirectory, { recursive: true });
    await writeFile(join(publicAssetDirectory, 'fresh.png'), freshPng);
    await writeFile(join(project.root, 'dist/index.html'), '<!doctype html><p>DIST DOCUMENT</p>');
    await writeFile(join(project.root, 'public/assets/app.js'), 'source-script');
    await writeFile(join(distAssetDirectory, 'app.js'), 'dist-script');

    const preview = new PreviewServer();
    try {
      const url = await preview.start(project.id, project.root);
      const mediaResponse = await fetch(new URL('/assets/images/fresh.png', url));
      expect(mediaResponse.status).toBe(200);
      expect(mediaResponse.headers.get('content-type')).toBe('image/png');
      expect(mediaResponse.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
      expect(Buffer.from(await mediaResponse.arrayBuffer())).toEqual(freshPng);

      const documentResponse = await fetch(url);
      expect(await documentResponse.text()).toContain('DIST DOCUMENT');
      expect(documentResponse.headers.get('cross-origin-resource-policy')).toBe('same-origin');

      const scriptResponse = await fetch(new URL('/assets/app.js', url));
      expect(await scriptResponse.text()).toBe('dist-script');
      expect(scriptResponse.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    } finally {
      await preview.stopAll();
    }
  });

  it('does not fall back to dist when a public media path escapes through a symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-preview-symlink-assets-test-'));
    roots.push(root);
    const store = new ProjectStore(join(root, 'projects.json'), join(root, 'games'));
    const project = await store.create({
      name: 'Symlink Asset Preview Game',
      idea: 'Verify public media stays within the project asset namespace.',
      parentDirectory: join(root, 'games'),
      model: null,
    });
    const distAssetDirectory = join(project.root, 'dist/assets/images');
    const externalAssetDirectory = join(root, 'external-assets');
    await mkdir(distAssetDirectory, { recursive: true });
    await mkdir(externalAssetDirectory, { recursive: true });
    await writeFile(join(project.root, 'dist/index.html'), '<!doctype html><p>DIST DOCUMENT</p>');
    await writeFile(join(distAssetDirectory, 'trap.png'), 'dist-image');
    await writeFile(join(externalAssetDirectory, 'trap.png'), 'external-image');
    await rm(join(project.root, 'public/assets/images'), { recursive: true, force: true });
    await symlink(externalAssetDirectory, join(project.root, 'public/assets/images'), 'dir');

    const preview = new PreviewServer();
    try {
      const url = await preview.start(project.id, project.root);
      const response = await fetch(new URL('/assets/images/trap.png', url));
      expect(response.status).toBe(404);
      expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    } finally {
      await preview.stopAll();
    }
  });
});
