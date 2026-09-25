import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetStore } from './assetStore.js';
import type { MediaGenerationAssetResult, MediaGenerationInput } from './mediaGenerationService.js';

export interface FreeAudioEntry {
  id: string;
  file: string;
  purpose: 'music' | 'sfx';
  tags: string[];
  title: string;
  author: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  sha256: string;
}

/** App-owned CC0 files, copied through the same validation as user imports. No network. */
export class FreeAudioLibrary {
  constructor(
    private readonly assets: Pick<AssetStore, 'importFiles' | 'registerExisting'>,
    private readonly directory = fileURLToPath(new URL('../../resources/free-audio/', import.meta.url)),
  ) {}

  async list(): Promise<FreeAudioEntry[]> {
    const entries = JSON.parse(await readFile(join(this.directory, 'catalog.json'), 'utf8')) as FreeAudioEntry[];
    if (!Array.isArray(entries) || entries.length > 200 || entries.some(entry =>
      !/^[a-z0-9-]+\.(ogg|mp3|wav)$/u.test(entry.file) || entry.license !== 'CC0-1.0'
      || !['music', 'sfx'].includes(entry.purpose) || !Array.isArray(entry.tags)
      || !/^[a-f0-9]{64}$/u.test(entry.sha256))) throw new Error('Invalid bundled audio catalog');
    return entries;
  }

  async import(input: MediaGenerationInput): Promise<MediaGenerationAssetResult> {
    const purpose = input.options?.purpose;
    const entries = (await this.list()).filter(entry => entry.purpose === purpose);
    const id = input.options?.libraryId;
    const text = `${input.name} ${input.prompt}`.toLowerCase();
    const score = (entry: FreeAudioEntry) => entry.tags.reduce((sum, tag) => sum + (text.includes(tag) ? 1 : 0), 0);
    const selected = id ? entries.find(entry => entry.id === id)
      : entries.sort((a, b) => score(b) - score(a))[0];
    if (!selected) throw new Error('No matching free audio entry');
    const path = join(this.directory, selected.file);
    const bytes = await readFile(path);
    if (createHash('sha256').update(bytes).digest('hex') !== selected.sha256) {
      throw new Error('Bundled audio checksum mismatch');
    }
    const [imported] = await this.assets.importFiles(input.project.id, input.project.root, [path]);
    if (!imported) throw new Error('Free audio import failed');
    const asset = await this.assets.registerExisting({
      projectId: input.project.id, root: input.project.root, relativePath: imported.relativePath,
      name: selected.title, source: 'imported', provider: 'Noobi CC0 Library',
      metadata: {
        license: selected.license, attribution: `${selected.author} — ${selected.sourceUrl}`,
        route: 'free-library', libraryId: selected.id, purpose: selected.purpose,
        author: selected.author, sourceUrl: selected.sourceUrl, licenseUrl: selected.licenseUrl,
        mediaGeneration: false,
      },
    });
    return { outcome: 'asset', asset, provider: {
      id: 'builtin-free-audio', presetId: 'free-audio-library', displayName: '免费音乐与音效库（CC0）',
      model: 'cc0-library-v1', route: 'free-library',
    } };
  }
}
