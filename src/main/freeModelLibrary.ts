import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetStore } from './assetStore.js';
import type { GameAssetRecord } from '../shared/contracts.js';
export interface FreeModelEntry {
  id: string; file: string; title: string; tags: string[]; author: string; sourceUrl: string; sourceVersion: string;
  license: 'CC0-1.0'; licenseUrl: string; sha256: string; animated: false; collision: string; style: string;
  dimensions?: number[]; triangles?: number; nodes?: number; preview?: string;
}
/** Offline, hash-pinned third-party props. Import is never reported as AI generation. */
export class FreeModelLibrary {
  constructor(private readonly assets: Pick<AssetStore, 'importFiles' | 'registerExisting'>,
    private readonly directory = fileURLToPath(new URL('../../resources/free-models/', import.meta.url))) {}
  async list(): Promise<FreeModelEntry[]> {
    const entries: unknown = JSON.parse(await readFile(join(this.directory, 'catalog.json'), 'utf8'));
    if (!Array.isArray(entries) || entries.length > 100 || entries.some(e => !e || !/^[a-z0-9-]{1,100}$/u.test(e.id)
      || e.file !== `${e.id}.glb` || e.license !== 'CC0-1.0' || !/^[a-f0-9]{64}$/u.test(e.sha256)
      || !Array.isArray(e.tags) || e.tags.length > 20 || !e.tags.every((t: unknown) => typeof t === 'string' && t.length <= 60)
      || typeof e.title !== 'string' || typeof e.sourceUrl !== 'string' || !e.sourceUrl.startsWith('https://kenney.nl/assets/')
      || e.animated !== false) || new Set(entries.map(e=>e.id)).size !== entries.length) throw new Error('Invalid bundled model catalog');
    return entries as FreeModelEntry[];
  }
  async import(project: { id: string; root: string }, libraryId: string): Promise<GameAssetRecord> {
    const selected = (await this.list()).find(entry => entry.id === libraryId);
    if (!selected) throw new Error('Unknown free 3D library ID; list available entries first');
    const path = join(this.directory, selected.file), bytes = await readFile(path);
    if (createHash('sha256').update(bytes).digest('hex') !== selected.sha256) throw new Error('Bundled model checksum mismatch');
    const [imported] = await this.assets.importFiles(project.id, project.root, [path]);
    if (!imported) throw new Error('Free model import failed');
    return this.assets.registerExisting({ projectId: project.id, root: project.root, relativePath: imported.relativePath,
      name: selected.title, source: 'imported', provider: 'Kenney CC0 Nature Library', metadata: {
        route: 'free-library', libraryId: selected.id, author: selected.author, sourceUrl: selected.sourceUrl,
        sourceVersion: selected.sourceVersion, license: selected.license, licenseUrl: selected.licenseUrl,
        attribution: `${selected.author} — ${selected.sourceUrl}`, mediaGeneration: false, rigged: false,
        animation: false, collision: 'runtime-required', visualReview: 'pending',
        ...(selected.triangles ? { triangleCount: selected.triangles } : {}),
      } });
  }
}
