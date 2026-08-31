import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameAssetRecord } from '../shared/contracts.js';
import { verifyVisualAssetCoverage } from './visualAssetCoverage.js';

const roots: string[] = [];
const IMAGE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('visual asset coverage', () => {
  it('does not let a generic background satisfy a card-game core-art gate', async () => {
    const fixture = await makeFixture();
    await expect(verifyVisualAssetCoverage({
      name: '卡牌',
      idea: '做一个卡牌对战游戏',
      engine: 'godot',
      root: fixture.root,
      assets: [{ ...fixture.asset, metadata: { role: 'background' } }],
    })).resolves.toMatchObject({ ok: false, reason: 'missing-core-card-art' });
  });

  it('accepts a referenced atlas only when it declares enough addressable card subjects', async () => {
    const fixture = await makeFixture();
    const atlas: GameAssetRecord = {
      ...fixture.asset,
      metadata: {
        role: 'card-art-atlas',
        columns: 3,
        rows: 2,
        subjects: 'apprentice,guardian,ranger,colossus,spark,blessing',
      },
    };
    await expect(verifyVisualAssetCoverage({
      name: 'Arcane cards',
      idea: 'A card game deck builder',
      engine: 'godot',
      root: fixture.root,
      assets: [atlas],
    })).resolves.toMatchObject({ ok: false, reason: 'missing-production-reference' });

    await writeFile(
      join(fixture.root, 'scripts/main.gd'),
      'const CARD_ATLAS = preload("res://public/assets/images/cards.png")\n',
    );
    await expect(verifyVisualAssetCoverage({
      name: 'Arcane cards',
      idea: 'A card game deck builder',
      engine: 'godot',
      root: fixture.root,
      assets: [atlas],
    })).resolves.toEqual({
      ok: true,
      profile: 'card-game',
      referencedPaths: ['public/assets/images/cards.png'],
    });
  });

  it('leaves non-card genres to the general generated-image gate', async () => {
    const fixture = await makeFixture();
    await expect(verifyVisualAssetCoverage({
      name: 'Flying bird',
      idea: 'A side-scrolling flying game',
      engine: 'web',
      root: fixture.root,
      assets: [fixture.asset],
    })).resolves.toEqual({ ok: true, profile: 'generic', referencedPaths: [] });
  });
});

async function makeFixture(): Promise<{ root: string; asset: GameAssetRecord }> {
  const root = await mkdtemp(join(tmpdir(), 'noobi-visual-coverage-'));
  roots.push(root);
  await mkdir(join(root, 'public/assets/images'), { recursive: true });
  await mkdir(join(root, 'scripts'), { recursive: true });
  await writeFile(join(root, 'public/assets/images/cards.png'), IMAGE);
  return {
    root,
    asset: {
      id: 'asset-1',
      name: 'cards',
      kind: 'image',
      source: 'generated',
      relativePath: 'public/assets/images/cards.png',
      mimeType: 'image/png',
      size: IMAGE.length,
      sha256: createHash('sha256').update(IMAGE).digest('hex'),
      createdAt: new Date(0).toISOString(),
    },
  };
}
