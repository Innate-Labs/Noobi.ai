import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetStore } from './assetStore.js';
import { FreeAudioLibrary } from './freeAudioLibrary.js';
import { MediaGenerationService } from './mediaGenerationService.js';
import { buildAudioGenerationContract } from './gameHarness.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'noobi-free-audio-'));
  roots.push(root);
  const assetStore = new AssetStore();
  const withActiveProvider = vi.fn(async () => { throw new Error('Paid provider must not be used'); });
  const fetch = vi.fn(async () => { throw new Error('Network must not be used'); });
  const service = new MediaGenerationService({ assetStore, providerStore: { withActiveProvider }, fetch,
    audioSource: async () => 'free-library' });
  return { project: { id: 'free-audio-test', root }, assetStore, withActiveProvider, fetch, service };
}

describe('free CC0 audio route', () => {
  it('imports every bundled file with its license, verifies bytes and preserves files offline', async () => {
    const context = await setup();
    const entries = await new FreeAudioLibrary(context.assetStore).list();
    expect(entries.filter(entry => entry.purpose === 'music')).toHaveLength(2);
    expect(entries.filter(entry => entry.purpose === 'sfx')).toHaveLength(16);
    for (const entry of entries) {
      const result = await context.service.generate({ project: context.project, kind: 'audio',
        name: entry.id, prompt: entry.title, options: { purpose: entry.purpose, libraryId: entry.id } });
      if (result.outcome !== 'asset') throw new Error('Expected imported audio');
      expect(result.provider.route).toBe('free-library');
      expect(result.asset.source).toBe('imported');
      expect(result.asset.sha256).toBe(entry.sha256);
      expect(result.asset.metadata).toMatchObject({ license: 'CC0-1.0', author: entry.author,
        sourceUrl: entry.sourceUrl, mediaGeneration: false, libraryId: entry.id });
      expect((await readFile(join(context.project.root, result.asset.relativePath))).length).toBeGreaterThan(100);
    }
    expect(context.withActiveProvider).not.toHaveBeenCalled();
    expect(context.fetch).not.toHaveBeenCalled();
  });

  it('matches music tags and reuses the same file without duplicating imports', async () => {
    const context = await setup();
    const input = { project: context.project, kind: 'audio' as const, name: 'theme',
      prompt: '复古像素街机欢快音乐', options: { purpose: 'music' } };
    const first = await context.service.generate(input);
    const second = await context.service.generate(input);
    if (first.outcome !== 'asset' || second.outcome !== 'asset') throw new Error('Expected audio');
    expect(first.asset.metadata?.libraryId).toBe('retro-adventure');
    expect(second.asset.relativePath).toBe(first.asset.relativePath);
    expect(await context.assetStore.list(context.project.id, context.project.root)).toHaveLength(1);
  });

  it('never charges for unsupported requests or invalid IDs', async () => {
    const context = await setup();
    for (const options of [{ purpose: 'speech' }, { purpose: 'music', lyrics: 'sing this' },
      { purpose: 'music', libraryId: '../outside' }, { purpose: 'music', libraryId: 'ui-click' }]) {
      await expect(context.service.generate({ project: context.project, kind: 'audio', name: 'test',
        prompt: 'test request', options })).rejects.toThrow('未调用付费接口');
    }
    expect(await context.service.generate({ project: context.project, kind: 'audio', name: 'wind',
      prompt: 'wind ambience', options: { purpose: 'ambience' } })).toMatchObject({ outcome: 'fallback', fallback: 'procedural-audio' });
    expect(context.withActiveProvider).not.toHaveBeenCalled();
    expect(context.fetch).not.toHaveBeenCalled();
  });

  it('refuses a corrupt catalog path instead of importing outside the bundle', async () => {
    const context = await setup();
    await writeFile(join(context.project.root, 'catalog.json'), JSON.stringify([{ file: '../outside.ogg', license: 'CC0-1.0' }]));
    await expect(new FreeAudioLibrary(context.assetStore, context.project.root).list()).rejects.toThrow('Invalid bundled audio catalog');
  });

  it('tells production and review to accept imported audio without requiring MiniMax', () => {
    const contract = buildAudioGenerationContract({ state: 'free-library' });
    expect(contract).toContain('source=imported');
    expect(contract).toContain('Do not call external music/audio APIs');
    expect(contract).toContain('mute, volume and pause');
    expect(contract).not.toContain('MUST call noobi_audio_generate once');
  });
});
