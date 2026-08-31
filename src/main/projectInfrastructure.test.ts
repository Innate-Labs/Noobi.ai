import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { NoobiCrewMember } from '../shared/contracts.js';
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
      engine: 'web',
      targetFrameRate: 60,
      noobiPackOverrideId: null,
      noobiCrewOverride: null,
    });
    await expect(reloaded.readProjectFile(project.id, '../projects.json')).rejects.toThrow();
    await expect(store.update(project.id, { engine: 'godot' } as never)).rejects.toThrow(
      'Project field cannot be updated: engine',
    );
  });

  it('persists global and project Noobi packs while validating their ids', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-pack-store-test-'));
    roots.push(root);
    const storageFile = join(root, 'data/projects.json');
    const workspace = join(root, 'games');
    const store = new ProjectStore(storageFile, workspace);
    const project = await store.create({
      name: 'Pack Workshop',
      idea: 'Remember the selected production companion and studio.',
      parentDirectory: workspace,
      model: null,
    });

    await expect(store.getSettings()).resolves.toMatchObject({
      defaultNoobiPackId: 'classic',
    });
    await expect(store.saveSettings({ defaultNoobiPackId: 'twilight' })).resolves.toMatchObject({
      defaultNoobiPackId: 'twilight',
    });
    await expect(store.update(project.id, { noobiPackOverrideId: 'hellokitty' })).resolves.toMatchObject({
      noobiPackOverrideId: 'hellokitty',
    });
    await expect(store.update(project.id, {
      noobiPackOverrideId: 'unknown-pack' as 'classic',
    })).rejects.toThrow(
      'noobiPackOverrideId must be classic, mosslight, starforge, twilight, hellokitty, or null',
    );
    await expect(store.saveSettings({
      defaultNoobiPackId: 'unknown-pack' as 'classic',
    })).rejects.toThrow('Default Noobi pack setting is invalid');

    const reloaded = new ProjectStore(storageFile, workspace);
    await expect(reloaded.getSettings()).resolves.toMatchObject({
      defaultNoobiPackId: 'twilight',
    });
    await expect(reloaded.get(project.id)).resolves.toMatchObject({
      noobiPackOverrideId: 'hellokitty',
    });
    await expect(reloaded.update(project.id, { noobiPackOverrideId: null })).resolves.toMatchObject({
      noobiPackOverrideId: null,
    });
  });

  it('persists the default Noobi scene while rejecting unknown scene ids', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-scene-store-test-'));
    roots.push(root);
    const storageFile = join(root, 'data/projects.json');
    const workspace = join(root, 'games');
    const store = new ProjectStore(storageFile, workspace);

    await expect(store.getSettings()).resolves.toMatchObject({
      defaultNoobiSceneId: 'collaboration',
    });
    await expect(store.saveSettings({
      defaultNoobiSceneId: 'fishing',
    })).resolves.toMatchObject({
      defaultNoobiSceneId: 'fishing',
    });
    await expect(store.saveSettings({
      defaultNoobiSceneId: 'unknown-scene' as never,
    })).rejects.toThrow('Default Noobi scene setting is invalid');

    const reloaded = new ProjectStore(storageFile, workspace);
    await expect(reloaded.getSettings()).resolves.toMatchObject({
      defaultNoobiSceneId: 'fishing',
    });
  });

  it('persists the default Noobi stage mode and solo scene while validating both', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-stage-store-test-'));
    roots.push(root);
    const storageFile = join(root, 'data/projects.json');
    const workspace = join(root, 'games');
    const store = new ProjectStore(storageFile, workspace);

    await expect(store.getSettings()).resolves.toMatchObject({
      defaultNoobiStageMode: 'solo',
      defaultNoobiSoloSceneId: 'classic',
    });
    await expect(store.saveSettings({
      defaultNoobiStageMode: 'crew',
      defaultNoobiSoloSceneId: 'mosslight',
    })).resolves.toMatchObject({
      defaultNoobiStageMode: 'crew',
      defaultNoobiSoloSceneId: 'mosslight',
    });
    await expect(store.saveSettings({
      defaultNoobiStageMode: 'unknown-mode' as never,
    })).rejects.toThrow('Default Noobi stage mode setting is invalid');
    await expect(store.saveSettings({
      defaultNoobiSoloSceneId: 'unknown-scene' as never,
    })).rejects.toThrow('Default Noobi solo scene setting is invalid');

    const reloaded = new ProjectStore(storageFile, workspace);
    await expect(reloaded.getSettings()).resolves.toMatchObject({
      defaultNoobiStageMode: 'crew',
      defaultNoobiSoloSceneId: 'mosslight',
    });
  });

  it('persists validated global and project Noobi crews without visual asset data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-crew-store-test-'));
    roots.push(root);
    const storageFile = join(root, 'data/projects.json');
    const workspace = join(root, 'games');
    const store = new ProjectStore(storageFile, workspace);
    const project = await store.create({
      name: 'Crew Workshop',
      idea: 'Remember a collaborative crew and each stable production role.',
      parentDirectory: workspace,
      model: null,
    });
    const globalCrew: NoobiCrewMember[] = [
      { packId: 'classic', role: 'planner' },
      { packId: 'twilight', role: 'artist' },
      { packId: 'hellokitty', role: 'engineer' },
      { packId: 'starforge', role: 'tester' },
    ];
    const projectCrew: NoobiCrewMember[] = [
      { packId: 'hellokitty', role: 'planner' },
      { packId: 'twilight', role: 'tester' },
    ];

    await expect(store.getSettings()).resolves.toMatchObject({ defaultNoobiCrew: globalCrew });
    await expect(store.saveSettings({ defaultNoobiCrew: globalCrew })).resolves.toMatchObject({
      defaultNoobiCrew: globalCrew,
    });
    await expect(store.update(project.id, { noobiCrewOverride: projectCrew })).resolves.toMatchObject({
      noobiCrewOverride: projectCrew,
    });
    await expect(store.update(project.id, {
      noobiCrewOverride: [{ packId: 'classic', role: 'planner' }],
    })).rejects.toThrow('must contain 2 to 4 members');
    await expect(store.update(project.id, {
      noobiCrewOverride: [
        { packId: 'classic', role: 'planner' },
        { packId: 'classic', role: 'artist' },
      ],
    })).rejects.toThrow('duplicate packId');
    await expect(store.saveSettings({
      defaultNoobiCrew: [
        { packId: 'classic', role: 'planner' },
        { packId: 'twilight', role: 'planner' },
      ],
    })).rejects.toThrow('duplicate role');
    await expect(store.update(project.id, {
      noobiCrewOverride: [
        { packId: 'unknown-pack', role: 'planner' },
        { packId: 'twilight', role: 'artist' },
      ] as never,
    })).rejects.toThrow('invalid packId');
    await expect(store.saveSettings({
      defaultNoobiCrew: [
        { packId: 'classic', role: 'unknown-role' },
        { packId: 'twilight', role: 'artist' },
      ] as never,
    })).rejects.toThrow('invalid role');
    await expect(store.saveSettings({
      defaultNoobiCrew: [
        { packId: 'classic', role: 'planner', avatarImage: 'data:image/png;base64,forbidden' },
        { packId: 'twilight', role: 'artist' },
      ] as NoobiCrewMember[],
    })).rejects.toThrow('may only contain packId and role');

    const reloaded = new ProjectStore(storageFile, workspace);
    await expect(reloaded.getSettings()).resolves.toMatchObject({ defaultNoobiCrew: globalCrew });
    await expect(reloaded.get(project.id)).resolves.toMatchObject({ noobiCrewOverride: projectCrew });
    await expect(reloaded.update(project.id, { noobiCrewOverride: null })).resolves.toMatchObject({
      noobiCrewOverride: null,
    });
  });

  it('uses 60 FPS for new projects while preserving compatible legacy targets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-fps-store-test-'));
    roots.push(root);
    const storageFile = join(root, 'data/projects.json');
    const workspace = join(root, 'games');
    const store = new ProjectStore(storageFile, workspace);

    const project = await store.create({
      name: 'Default Cadence Game',
      idea: 'Verify the host-managed target frame rate.',
      parentDirectory: workspace,
      model: null,
    });
    expect(project.targetFrameRate).toBe(60);
    await expect(store.update(project.id, { targetFrameRate: 24 as 30 })).rejects.toThrow(
      'targetFrameRate must be 30, 60, or 120',
    );

    const legacyStorageFile = join(root, 'legacy/projects.json');
    const legacyRoot = join(root, 'legacy-game');
    const preservedTargetRoot = join(root, 'legacy-120-game');
    const timestamp = new Date().toISOString();
    await mkdir(join(root, 'legacy'), { recursive: true });
    await mkdir(legacyRoot, { recursive: true });
    await mkdir(preservedTargetRoot, { recursive: true });
    await writeFile(legacyStorageFile, `${JSON.stringify({
      version: 1,
      projects: [
        {
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
        },
        {
          id: 'legacy-120-project',
          name: 'Existing 120 FPS Game',
          idea: 'Preserve an existing internal production cadence.',
          root: preservedTargetRoot,
          createdAt: timestamp,
          updatedAt: timestamp,
          status: 'draft',
          stage: 'brief',
          engine: 'godot',
          targetFrameRate: 120,
          model: null,
          threadId: null,
          toolsetVersion: 0,
          activeTurnId: null,
          lastError: null,
        },
      ],
      settings: {
        defaultWorkspace: workspace,
        defaultModel: null,
        defaultEffort: 'medium',
        theme: 'light',
      },
    }, null, 2)}\n`);

    const legacyStore = new ProjectStore(legacyStorageFile, workspace);
    await expect(legacyStore.get('legacy-project')).resolves.toMatchObject({
      engine: 'web',
      targetFrameRate: 60,
    });
    await expect(legacyStore.get('legacy-120-project')).resolves.toMatchObject({
      engine: 'godot',
      targetFrameRate: 120,
    });
    const migrated = JSON.parse(await readFile(legacyStorageFile, 'utf8')) as {
      projects: Array<{
        engine?: string;
        targetFrameRate?: number;
        noobiPackOverrideId?: string | null;
        noobiCrewOverride?: NoobiCrewMember[] | null;
      }>;
      settings?: {
        defaultNoobiStageMode?: string;
        defaultNoobiSoloSceneId?: string;
        defaultNoobiSceneId?: string;
        defaultNoobiPackId?: string;
        defaultNoobiCrew?: NoobiCrewMember[];
      };
    };
    expect(migrated.projects[0]?.engine).toBe('web');
    expect(migrated.projects[0]?.targetFrameRate).toBe(60);
    expect(migrated.projects[1]?.engine).toBe('godot');
    expect(migrated.projects[1]?.targetFrameRate).toBe(120);
    expect(migrated.projects[0]?.noobiPackOverrideId).toBeNull();
    expect(migrated.projects[1]?.noobiPackOverrideId).toBeNull();
    expect(migrated.projects[0]?.noobiCrewOverride).toBeNull();
    expect(migrated.projects[1]?.noobiCrewOverride).toBeNull();
    expect(migrated.settings?.defaultNoobiStageMode).toBe('solo');
    expect(migrated.settings?.defaultNoobiSoloSceneId).toBe('classic');
    expect(migrated.settings?.defaultNoobiSceneId).toBe('collaboration');
    expect(migrated.settings?.defaultNoobiPackId).toBe('classic');
    expect(migrated.settings?.defaultNoobiCrew).toEqual([
      { packId: 'classic', role: 'planner' },
      { packId: 'twilight', role: 'artist' },
      { packId: 'hellokitty', role: 'engineer' },
      { packId: 'starforge', role: 'tester' },
    ]);
  });

  it('adds solo defaults to legacy settings without replacing existing Noobi choices', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-stage-migration-test-'));
    roots.push(root);
    const storageFile = join(root, 'data/projects.json');
    const workspace = join(root, 'games');
    const existingCrew: NoobiCrewMember[] = [
      { packId: 'hellokitty', role: 'artist' },
      { packId: 'starforge', role: 'tester' },
    ];
    await mkdir(join(root, 'data'), { recursive: true });
    await writeFile(storageFile, `${JSON.stringify({
      version: 1,
      projects: [],
      settings: {
        defaultWorkspace: workspace,
        defaultModel: null,
        defaultEffort: 'medium',
        defaultNoobiSceneId: 'fishing',
        defaultNoobiPackId: 'twilight',
        defaultNoobiCrew: existingCrew,
        theme: 'light',
      },
    }, null, 2)}\n`);

    const store = new ProjectStore(storageFile, workspace);
    await expect(store.getSettings()).resolves.toMatchObject({
      defaultNoobiStageMode: 'solo',
      defaultNoobiSoloSceneId: 'classic',
      defaultNoobiSceneId: 'fishing',
      defaultNoobiPackId: 'twilight',
      defaultNoobiCrew: existingCrew,
    });
    const migrated = JSON.parse(await readFile(storageFile, 'utf8')) as {
      settings?: Partial<Record<
        | 'defaultNoobiStageMode'
        | 'defaultNoobiSoloSceneId'
        | 'defaultNoobiSceneId'
        | 'defaultNoobiPackId'
        | 'defaultNoobiCrew',
        unknown
      >>;
    };
    expect(migrated.settings).toMatchObject({
      defaultNoobiStageMode: 'solo',
      defaultNoobiSoloSceneId: 'classic',
      defaultNoobiSceneId: 'fishing',
      defaultNoobiPackId: 'twilight',
      defaultNoobiCrew: existingCrew,
    });
  });

  it('creates a Godot 4 project with scenes, GDScript, assets, and a Web preset', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-godot-store-test-'));
    roots.push(root);
    const store = new ProjectStore(join(root, 'projects.json'), join(root, 'games'));
    const project = await store.create({
      name: 'Godot Signal Garden',
      idea: 'A complete engine-backed action game.',
      parentDirectory: join(root, 'games'),
      model: null,
      engine: 'godot',
    });

    expect(project).toMatchObject({ engine: 'godot', targetFrameRate: 60 });
    await expect(readFile(join(project.root, 'project.godot'), 'utf8')).resolves.toContain(
      'common/physics_ticks_per_second=60',
    );
    await expect(readFile(join(project.root, 'project.godot'), 'utf8')).resolves.toContain(
      'boot_splash/show_image=false',
    );
    await expect(readFile(join(project.root, 'project.godot'), 'utf8')).resolves.toContain(
      'config/icon="res://resources/noobi-runtime-icon.svg"',
    );
    await expect(readFile(join(project.root, 'project.godot'), 'utf8')).resolves.toContain(
      'boot_splash/image="res://resources/noobi-runtime-icon.svg"',
    );
    await expect(readFile(join(project.root, 'resources/noobi-runtime-icon.svg'), 'utf8')).resolves.toContain(
      '<svg',
    );
    await expect(readFile(join(project.root, 'scenes/main.tscn'), 'utf8')).resolves.toContain(
      'res://scripts/main.gd',
    );
    await expect(readFile(join(project.root, 'scripts/main.gd'), 'utf8')).resolves.toContain(
      'Engine.max_fps = TARGET_FRAME_RATE',
    );
    await expect(readFile(join(project.root, 'export_presets.cfg'), 'utf8')).resolves.toContain(
      'platform="Web"',
    );
    await expect(readFile(join(project.root, 'export_presets.cfg'), 'utf8')).resolves.toContain(
      'html/export_icon=false',
    );
    await expect(readFile(join(project.root, 'AGENTS.md'), 'utf8')).resolves.toContain(
      'Godot 4 / GDScript',
    );
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

  it('hides Godot branding in legacy Web previews without mutating the build', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-godot-preview-branding-'));
    roots.push(root);
    const buildRoot = join(root, 'build/web');
    const legacyHtml = `<!doctype html>
<html><head>
<link id="-gd-engine-icon" rel="icon" type="image/png" href="index.icon.png">
<link rel="apple-touch-icon" href="index.apple-touch-icon.png">
</head><body>
<img id="status-splash" class="show-image--true fullsize--true" src="index.png" alt="">
<script src="index.js"></script>
</body></html>`;
    await mkdir(buildRoot, { recursive: true });
    await writeFile(join(buildRoot, 'index.html'), legacyHtml, 'utf8');

    const preview = new PreviewServer();
    try {
      const hiddenUrl = await preview.start('legacy-godot-preview', root, {
        directory: 'build/web',
        sourceFallback: false,
        hideGodotSplash: true,
      });
      const hiddenResponse = await fetch(hiddenUrl);
      const hiddenHtml = await hiddenResponse.text();
      expect(hiddenHtml).toContain('id="status-splash" class="show-image--false"');
      expect(hiddenHtml).not.toContain('show-image--true');
      expect(hiddenHtml).not.toContain('index.png');
      expect(hiddenHtml).not.toContain('-gd-engine-icon');
      expect(hiddenHtml).not.toContain('apple-touch-icon');
      expect(hiddenHtml).toContain('id="noobi-godot-branding-guard"');
      expect(hiddenHtml).toContain('MutationObserver');
      expect(hiddenHtml.match(/noobi-godot-branding-guard/gu)).toHaveLength(1);
      const hiddenHead = await fetch(hiddenUrl, { method: 'HEAD' });
      expect(Number(hiddenHead.headers.get('content-length'))).toBe(Buffer.byteLength(hiddenHtml));
      expect((await fetch(new URL('favicon.ico', hiddenUrl))).status).toBe(204);
      expect(await readFile(join(buildRoot, 'index.html'), 'utf8')).toBe(legacyHtml);

      const rawUrl = await preview.start('legacy-godot-preview', root, {
        directory: 'build/web',
        sourceFallback: false,
        hideGodotSplash: false,
      });
      expect(await (await fetch(rawUrl)).text()).toContain('show-image--true');
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

  it('serves only packaged media when the strict playtest overlay is disabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-preview-strict-assets-test-'));
    roots.push(root);
    const store = new ProjectStore(join(root, 'projects.json'), join(root, 'games'));
    const project = await store.create({
      name: 'Strict Delivery Preview Game',
      idea: 'Verify playtests cannot see media omitted from the production build.',
      parentDirectory: join(root, 'games'),
      model: null,
    });
    const publicAssetDirectory = join(project.root, 'public/assets/images');
    const distAssetDirectory = join(project.root, 'dist/assets/images');
    await mkdir(publicAssetDirectory, { recursive: true });
    await mkdir(distAssetDirectory, { recursive: true });
    await writeFile(join(project.root, 'dist/index.html'), '<!doctype html><p>DIST DOCUMENT</p>');
    await writeFile(join(publicAssetDirectory, 'hero.png'), 'fresh-source-image');
    await writeFile(join(distAssetDirectory, 'hero.png'), 'packaged-image');

    const preview = new PreviewServer();
    try {
      const url = await preview.start(project.id, project.root, {
        directory: 'dist',
        sourceFallback: false,
        sourceAssetOverlay: false,
      });
      const response = await fetch(new URL('/assets/images/hero.png', url));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('packaged-image');
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
