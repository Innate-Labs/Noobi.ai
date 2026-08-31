import { describe, expect, it } from 'vitest';

import type { NoobiAnimation, NoobiSpriteManifest } from './noobiAnimation';
import {
  advanceNoobiFrame,
  noobiFrameAtElapsed,
  noobiManifestSources,
  noobiRestFrameIndex,
  normalizedNoobiFrameDuration,
} from './noobiAnimation';

const animation = (overrides: Partial<NoobiAnimation> = {}): NoobiAnimation => ({
  id: 'test',
  loop: true,
  restFrame: 0,
  frames: [
    { src: 'a.png', durationMs: 100 },
    { src: 'b.png', durationMs: 220 },
    { src: 'c.png', durationMs: 80 },
  ],
  ...overrides,
});

describe('Noobi sprite animation timeline', () => {
  it('honors the duration of every keyframe instead of assuming a uniform interval', () => {
    const clip = animation();
    expect(noobiFrameAtElapsed(clip, 0)).toBe(0);
    expect(noobiFrameAtElapsed(clip, 99)).toBe(0);
    expect(noobiFrameAtElapsed(clip, 100)).toBe(1);
    expect(noobiFrameAtElapsed(clip, 319)).toBe(1);
    expect(noobiFrameAtElapsed(clip, 320)).toBe(2);
    expect(noobiFrameAtElapsed(clip, 400)).toBe(0);
  });

  it('advances looping clips and settles non-looping clips on their authored rest frame', () => {
    expect(advanceNoobiFrame(animation(), 2)).toEqual({ frameIndex: 0, finished: false });
    expect(advanceNoobiFrame(animation({ loop: false, restFrame: 1 }), 2))
      .toEqual({ frameIndex: 1, finished: true });
    expect(noobiFrameAtElapsed(animation({ loop: false, restFrame: 1 }), 800)).toBe(1);
  });

  it('clamps malformed durations and rest frame indexes to safe values', () => {
    expect(normalizedNoobiFrameDuration({ src: 'bad.png', durationMs: Number.NaN })).toBe(40);
    expect(normalizedNoobiFrameDuration({ src: 'fast.png', durationMs: 2 })).toBe(40);
    expect(noobiRestFrameIndex(animation({ restFrame: 99 }))).toBe(2);
    expect(noobiRestFrameIndex(animation({ restFrame: -4 }))).toBe(0);
  });

  it('returns each manifest image once so the renderer can preload complete packs', () => {
    const clip = animation();
    const manifest = {
      schemaVersion: 1,
      id: 'test-pack',
      canvas: { width: 252, height: 336, pivot: { x: 126, y: 320 } },
      animations: {
        idle: clip,
        work: clip,
        think: clip,
        carry: clip,
        paint: clip,
        sleep: clip,
        play: clip,
        repair: clip,
        coffee: clip,
        stretch: clip,
        type: clip,
        inspect: clip,
        sweep: clip,
        celebrate: clip,
        wait: clip,
        walk: clip,
      },
    } satisfies NoobiSpriteManifest;

    expect(noobiManifestSources(manifest)).toEqual(['a.png', 'b.png', 'c.png']);
  });
});
