import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GameAssetRecord } from '../shared/contracts.js';
import { AssetPlanStore } from './assetPlanStore.js';
import * as attestation from './imageGenerationAttestation.js';

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('AssetPlanStore', () => {
  it('persists expected assets separately from the public asset manifest', async () => {
    const fixture = await makeFixture();
    const store = new AssetPlanStore(fixture.storageFile);
    await store.init();
    await store.upsert({
      id: 'hero_portrait',
      projectId: 'project-1',
      name: 'Hero portrait',
      kind: 'image',
      prompt: 'A readable in-game hero portrait',
      options: { width: 1024, height: 1024, background: 'transparent' },
    });

    await expect(store.list('project-1')).resolves.toMatchObject([{
      id: 'hero_portrait',
      status: 'planned',
      attemptCount: 0,
      required: true,
    }]);
    await expect(readFile(fixture.storageFile, 'utf8')).resolves.toContain('hero_portrait');
    await expect(readFile(join(fixture.root, 'public/assets/asset-pack.json'), 'utf8')).rejects.toThrow();

    const reloaded = new AssetPlanStore(fixture.storageFile);
    await reloaded.init();
    await expect(reloaded.queue('project-1', 'hero_portrait')).resolves.toMatchObject({ status: 'queued' });
  });

  it('records generation, failure, retry, and a verified production reference', async () => {
    const fixture = await makeFixture();
    const store = new AssetPlanStore(fixture.storageFile);
    await store.init();
    await store.upsert({
      id: 'theme_music',
      projectId: 'project-1',
      name: 'Theme music',
      kind: 'audio',
      prompt: 'A restrained fantasy battle theme',
      options: { purpose: 'music', instrumental: true },
    });
    await expect(store.begin('project-1', 'theme_music', 'configured-api')).resolves.toMatchObject({
      status: 'generating',
      attemptCount: 1,
    });
    await expect(store.fail('project-1', 'theme_music', {
      code: 'provider-timeout',
      message: '媒体服务请求超时，请稍后重试。',
      retryable: true,
    })).resolves.toMatchObject({ status: 'failed', error: { code: 'provider-timeout' } });
    const queued = await store.queue('project-1', 'theme_music');
    expect(queued.status).toBe('queued');
    expect(queued).not.toHaveProperty('error');
    await store.begin('project-1', 'theme_music', 'configured-api');

    const asset = fakeAsset({
      id: 'asset-theme',
      kind: 'audio',
      relativePath: 'public/assets/audio/theme.mp3',
      mimeType: 'audio/mpeg',
    });
    await store.generated('project-1', 'theme_music', asset, 'configured-api');
    await mkdir(join(fixture.root, 'src'), { recursive: true });
    await writeFile(join(fixture.root, 'src/audio.ts'), `const theme = '/assets/audio/theme.mp3';\n`);
    await expect(store.reconcile('project-1', fixture.root, [asset])).resolves.toMatchObject([{
      id: 'theme_music',
      status: 'ready',
      relativePath: asset.relativePath,
      referencedBy: 'src/audio.ts',
      attemptCount: 2,
    }]);
  });

  it('recovers an interrupted generating state as a retryable failure', async () => {
    const fixture = await makeFixture();
    const first = new AssetPlanStore(fixture.storageFile);
    await first.init();
    await first.upsert({
      id: 'enemy_model',
      projectId: 'project-1',
      name: 'Enemy model',
      kind: 'model3d',
      prompt: 'A low-poly enemy with idle and run clips',
    });
    await first.begin('project-1', 'enemy_model', 'threejs-fallback');

    const second = new AssetPlanStore(fixture.storageFile);
    await second.init();
    await expect(second.get('project-1', 'enemy_model')).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'generation-interrupted', retryable: true },
    });
  });

  it('keeps the previous asset reference when a replacement attempt fails', async () => {
    const fixture = await makeFixture();
    const store = new AssetPlanStore(fixture.storageFile);
    await store.init();
    await store.upsert({
      id: 'hero',
      projectId: 'project-1',
      name: 'Hero',
      kind: 'image',
      prompt: 'Hero sprite',
    });
    const asset = fakeAsset({ id: 'asset-hero' });
    await store.begin('project-1', 'hero', 'configured-api');
    await store.generated('project-1', 'hero', asset, 'configured-api');
    await store.queue('project-1', 'hero');
    await store.begin('project-1', 'hero', 'configured-api');
    const failed = await store.fail('project-1', 'hero', {
      code: 'provider-error',
      message: '媒体服务暂时不可用。',
      retryable: true,
    });
    expect(failed).toMatchObject({
      status: 'failed',
      assetId: asset.id,
      relativePath: asset.relativePath,
      sha256: asset.sha256,
    });
  });

  it('does not replace a newer generated asset with a delayed reference scan', async () => {
    const fixture = await makeFixture();
    const store = new AssetPlanStore(fixture.storageFile);
    await store.init();
    await store.upsert({ id: 'hero', projectId: 'project-1', name: 'Hero', kind: 'image', prompt: 'Hero sprite' });
    const previous = fakeAsset();
    const replacement = fakeAsset({
      id: 'replacement', relativePath: 'public/assets/images/replacement.png', sha256: 'b'.repeat(64),
    });
    await store.generated('project-1', 'hero', previous, 'configured-api');

    let releaseScan!: (path: string) => void;
    let startScan!: () => void;
    const scanStarted = new Promise<void>((resolve) => { startScan = resolve; });
    vi.spyOn(attestation, 'findProductionAssetReference').mockImplementationOnce(async () => {
      startScan();
      return new Promise<string>((resolve) => { releaseScan = resolve; });
    });
    const reconciliation = store.reconcile('project-1', fixture.root, [previous]);
    await scanStarted;
    await store.begin('project-1', 'hero', 'configured-api');
    await store.generated('project-1', 'hero', replacement, 'configured-api');
    const expected = await store.get('project-1', 'hero');
    releaseScan('src/previous.ts');
    await reconciliation;

    expect(await store.get('project-1', 'hero')).toEqual(expected);
    const reloaded = new AssetPlanStore(fixture.storageFile);
    await reloaded.init();
    expect(await reloaded.get('project-1', 'hero')).toEqual(expected);
  });

  it('does not clear a newer asset when an earlier snapshot reports a missing file', async () => {
    const fixture = await makeFixture();
    const store = new AssetPlanStore(fixture.storageFile);
    await store.init();
    await store.upsert({ id: 'hero', projectId: 'project-1', name: 'Hero', kind: 'image', prompt: 'Hero sprite' });
    await store.generated('project-1', 'hero', fakeAsset(), 'configured-api');
    const replacement = fakeAsset({
      id: 'replacement', relativePath: 'public/assets/images/replacement.png', sha256: 'b'.repeat(64),
    });
    const list = store.list.bind(store);
    vi.spyOn(store, 'list').mockImplementationOnce(async (projectId) => {
      const snapshot = await list(projectId);
      await store.generated(projectId, 'hero', replacement, 'configured-api');
      return snapshot;
    });

    await store.reconcile('project-1', fixture.root, []);
    expect(await store.get('project-1', 'hero')).toMatchObject({
      status: 'generated', assetId: replacement.id, relativePath: replacement.relativePath, sha256: replacement.sha256,
    });
    // An unchanged missing asset must still be marked as a retryable failure.
    await store.reconcile('project-1', fixture.root, []);
    expect(await store.get('project-1', 'hero')).toMatchObject({ status: 'failed', error: { code: 'asset-missing' } });
  });
});

async function makeFixture(): Promise<{ root: string; storageFile: string }> {
  const root = await mkdtemp(join(tmpdir(), 'noobi-asset-plan-'));
  roots.push(root);
  return { root, storageFile: join(root, 'private', 'asset-plans.json') };
}

function fakeAsset(overrides: Partial<GameAssetRecord> = {}): GameAssetRecord {
  return {
    id: 'asset-image',
    name: 'Hero',
    kind: 'image',
    source: 'generated',
    relativePath: 'public/assets/images/hero.png',
    mimeType: 'image/png',
    size: 100,
    sha256: 'a'.repeat(64),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
