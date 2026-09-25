import { mkdtemp, mkdir, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetStore } from './assetStore.js';

const roots: string[] = [];
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const WAV = Buffer.from('RIFF\0\0\0\0WAVE', 'binary');

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('AssetStore', () => {
  it('imports supported assets, persists the manifest, and deduplicates by content hash', async () => {
    const { root, sources } = await fixture();
    const firstPng = join(sources, 'hero.png');
    const duplicatePng = join(sources, 'hero-copy.png');
    const wav = join(sources, 'pickup.wav');
    const glb = join(sources, 'world.glb');
    await writeFile(firstPng, PNG);
    await writeFile(duplicatePng, PNG);
    await writeFile(wav, WAV);
    await writeFile(glb, makeGlb({ asset: { version: '2.0' } }));

    const store = new AssetStore();
    const imported = await store.importFiles('project-1', root, [firstPng, duplicatePng, wav, glb]);
    expect(imported).toHaveLength(4);
    expect(imported[0].id).toBe(imported[1].id);
    expect(await store.list('project-1', root)).toHaveLength(3);
    expect((await store.list('project-1', root)).map((asset) => asset.kind).sort()).toEqual([
      'audio',
      'image',
      'model3d',
    ]);

    const manifest = JSON.parse(await readFile(join(root, 'public/assets/asset-pack.json'), 'utf8')) as {
      projectId: string;
      assets: unknown[];
    };
    expect(manifest.projectId).toBe('project-1');
    expect(manifest.assets).toHaveLength(3);
  });

  it('only accepts PNG/JPEG/WebP, WAV/MP3/OGG, and GLB extensions', async () => {
    const { root, sources } = await fixture();
    const gif = join(sources, 'sprite.gif');
    const gltf = join(sources, 'model.gltf');
    const disguised = join(sources, 'disguised.png');
    await writeFile(gif, 'GIF89a');
    await writeFile(gltf, JSON.stringify({ asset: { version: '2.0' } }));
    await writeFile(disguised, WAV);
    const store = new AssetStore();

    await expect(store.importFiles('project-1', root, [gif])).rejects.toThrow('Unsupported asset format');
    await expect(store.importFiles('project-1', root, [gltf])).rejects.toThrow('Unsupported asset format');
    await expect(store.importFiles('project-1', root, [disguised])).rejects.toThrow(
      'Asset contents do not match .png',
    );
  });

  it('enforces the 32 MiB image limit before copying an import', async () => {
    const { root, sources } = await fixture();
    const oversized = join(sources, 'oversized.webp');
    await writeFile(oversized, Buffer.from('RIFF\0\0\0\0WEBP', 'binary'));
    await truncate(oversized, 32 * 1024 * 1024 + 1);

    await expect(new AssetStore().importFiles('project-1', root, [oversized])).rejects.toThrow(
      'Asset is too large',
    );
  });

  it('validates GLB v2 structure and rejects URI references or excessive scene arrays', async () => {
    const { root, sources } = await fixture();
    const external = join(sources, 'external.glb');
    const excessive = join(sources, 'excessive.glb');
    const malformed = join(sources, 'malformed.glb');
    await writeFile(
      external,
      makeGlb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4, uri: 'mesh.bin' }] }),
    );
    await writeFile(
      excessive,
      makeGlb({ asset: { version: '2.0' }, nodes: Array.from({ length: 10_001 }, () => ({})) }),
    );
    const badLength = makeGlb({ asset: { version: '2.0' } });
    badLength.writeUInt32LE(badLength.length + 4, 8);
    await writeFile(malformed, badLength);
    const store = new AssetStore();

    await expect(store.importFiles('project-1', root, [external])).rejects.toThrow('self-contained');
    await expect(store.importFiles('project-1', root, [excessive])).rejects.toThrow('too many nodes');
    await expect(store.importFiles('project-1', root, [malformed])).rejects.toThrow('declared length');
  });

  it('accepts a self-contained GLB with a length-matched BIN chunk', async () => {
    const { root, sources } = await fixture();
    const glb = join(sources, 'mesh.glb');
    await writeFile(
      glb,
      makeGlb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] }, Buffer.from([1, 2, 3, 4])),
    );

    await expect(new AssetStore().importFiles('project-1', root, [glb])).resolves.toMatchObject([
      { kind: 'model3d', mimeType: 'model/gltf-binary' },
    ]);
  });

  it('reconciles workspace-created assets and omits duplicate hashes', async () => {
    const { root } = await fixture();
    const imageDirectory = join(root, 'public/assets/images');
    await mkdir(imageDirectory, { recursive: true });
    await writeFile(join(imageDirectory, 'one.png'), PNG);
    await writeFile(join(imageDirectory, 'two.png'), PNG);

    const assets = await new AssetStore().list('project-1', root);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ kind: 'image', provider: 'workspace-agent' });
  });

  it('discards unsupported workspace-authored manifest entries instead of breaking the asset panel', async () => {
    const { root } = await fixture();
    const assetDirectory = join(root, 'public/assets');
    await mkdir(assetDirectory, { recursive: true });
    await writeFile(join(assetDirectory, 'hand_landmarker.task'), 'mediapipe model data');
    await writeFile(join(assetDirectory, 'asset-pack.json'), JSON.stringify({
      version: 1,
      projectId: 'project-1',
      updatedAt: new Date().toISOString(),
      assets: [{
        id: 'unsupported-data',
        name: 'hand_landmarker',
        kind: 'data',
        source: 'imported',
        relativePath: 'public/assets/hand_landmarker.task',
        mimeType: 'application/octet-stream',
        size: 20,
        sha256: '0'.repeat(64),
        createdAt: new Date().toISOString(),
      }],
    }));

    await expect(new AssetStore().list('project-1', root)).resolves.toEqual([]);
    const repaired = JSON.parse(await readFile(join(assetDirectory, 'asset-pack.json'), 'utf8')) as {
      assets: unknown[];
    };
    expect(repaired.assets).toEqual([]);
  });

  it('rejects symbolic-link asset directories and project traversal', async () => {
    const { root, sources } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), 'noobi-assets-outside-'));
    roots.push(outside);
    await mkdir(join(root, 'public'), { recursive: true });
    await symlink(outside, join(root, 'public/assets'));
    const source = join(sources, 'hero.png');
    await writeFile(source, PNG);
    const store = new AssetStore();

    await expect(store.importFiles('project-1', root, [source])).rejects.toThrow('symbolic links');
    await expect(
      store.registerExisting({ projectId: 'project-1', root, relativePath: '../hero.png' }),
    ).rejects.toThrow('escapes');
  });
});

async function fixture(): Promise<{ root: string; sources: string }> {
  const root = await mkdtemp(join(tmpdir(), 'noobi-assets-project-'));
  const sources = await mkdtemp(join(tmpdir(), 'noobi-assets-sources-'));
  roots.push(root, sources);
  return { root, sources };
}

function makeGlb(document: Record<string, unknown>, binary?: Buffer): Buffer {
  const json = Buffer.from(JSON.stringify(document), 'utf8');
  const jsonPadding = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
  const binaryPadding = binary ? (4 - (binary.length % 4)) % 4 : 0;
  const binaryChunk = binary ? Buffer.concat([binary, Buffer.alloc(binaryPadding)]) : null;
  const totalLength = 12 + 8 + jsonChunk.length + (binaryChunk ? 8 + binaryChunk.length : 0);
  const output = Buffer.alloc(totalLength);
  output.write('glTF', 0, 'ascii');
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  if (binaryChunk) {
    const offset = 20 + jsonChunk.length;
    output.writeUInt32LE(binaryChunk.length, offset);
    output.writeUInt32LE(0x004e4942, offset + 4);
    binaryChunk.copy(output, offset + 8);
  }
  return output;
}
