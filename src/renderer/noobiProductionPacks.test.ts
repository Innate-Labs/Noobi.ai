import { describe, expect, it } from 'vitest';

import { NOOBI_PACK_IDS } from '../shared/contracts';
import { noobiManifestSources } from './noobiAnimation';
import { noobiProductionPack } from './noobiProductionPacks';

describe('Noobi production packs', () => {
  it('ships a matching scene and complete animation manifest for every selectable pack', () => {
    for (const packId of NOOBI_PACK_IDS) {
      const pack = noobiProductionPack(packId);
      expect(pack.id).toBe(packId);
      expect(pack.sceneImage).toMatch(/\.png$/);
      expect(Object.keys(pack.spriteManifest.animations)).toHaveLength(16);
      expect(noobiManifestSources(pack.spriteManifest).length).toBeGreaterThanOrEqual(30);
      expect(pack.spriteManifest.canvas).toEqual({
        width: 252,
        height: 336,
        pivot: { x: 126, y: 320 },
      });
    }
  });

  it('uses authored multi-keyframe clips for movement and every production action', () => {
    const manifest = noobiProductionPack('classic').spriteManifest;
    expect(manifest.animations.walk.frames).toHaveLength(4);
    expect(manifest.animations.work.frames).toHaveLength(4);
    expect(manifest.animations.paint.frames).toHaveLength(5);
    expect(manifest.animations.repair.frames).toHaveLength(5);
    expect(manifest.animations.coffee.frames).toHaveLength(4);
    expect(manifest.animations.stretch.frames).toHaveLength(3);
    expect(manifest.animations.type.frames).toHaveLength(4);
    expect(manifest.animations.inspect.frames).toHaveLength(3);
    expect(manifest.animations.sweep.frames).toHaveLength(4);
    expect(manifest.animations.celebrate.frames).toHaveLength(6);
    expect(manifest.animations.think.id).not.toBe(manifest.animations.idle.id);
    expect(manifest.animations.wait.id).not.toBe(manifest.animations.idle.id);
  });
});
