import type { NoobiPackId } from '../shared/contracts';
import classicScene from './assets/noobi-packs/classic/scene.png';
import helloKittyScene from './assets/noobi-packs/hellokitty/scene.png';
import mosslightScene from './assets/noobi-packs/mosslight/scene.png';
import starforgeScene from './assets/noobi-packs/starforge/scene.png';
import twilightScene from './assets/noobi-packs/twilight/scene.png';
import type {
  NoobiAnimation,
  NoobiAnimationFrame,
  NoobiSpriteManifest,
} from './noobiAnimation';

export interface NoobiProductionPack {
  id: NoobiPackId;
  sceneImage: string;
  spriteManifest: NoobiSpriteManifest;
}

const frameAssets = import.meta.glob(
  [
    './assets/noobi-packs/*/frames/sprite-*.png',
    '!./assets/noobi-packs/*/frames/sprite-sheet-*.png',
  ],
  { eager: true, import: 'default', query: '?url' },
) as Record<string, string>;

function frameSource(packId: NoobiPackId, filename: string): string {
  const key = `./assets/noobi-packs/${packId}/frames/${filename}`;
  const source = frameAssets[key];
  if (!source) throw new Error(`Missing Noobi animation frame: ${key}`);
  return source;
}

function frames(
  packId: NoobiPackId,
  names: readonly string[],
  durations: readonly number[],
): NoobiAnimationFrame[] {
  return names.map((name, index) => ({
    src: frameSource(packId, `sprite-${name}.png`),
    durationMs: durations[index] ?? durations.at(-1) ?? 160,
  }));
}

function clip(
  packId: NoobiPackId,
  id: string,
  names: readonly string[],
  durations: readonly number[],
  restFrame = 0,
): NoobiAnimation {
  return {
    id: `${packId}-${id}`,
    frames: frames(packId, names, durations),
    loop: true,
    restFrame,
  };
}

function manifest(packId: NoobiPackId): NoobiSpriteManifest {
  return {
    schemaVersion: 1,
    id: `${packId}-noobi-v2`,
    canvas: {
      width: 252,
      height: 336,
      pivot: { x: 126, y: 320 },
    },
    animations: {
      idle: clip(packId, 'idle',
        ['idle-a', 'idle-b', 'idle-a'],
        [620, 140, 760]),
      think: clip(packId, 'think',
        ['idle-a', 'idle-b', 'idle-a'],
        [420, 260, 520]),
      wait: clip(packId, 'wait',
        ['idle-a', 'idle-b', 'idle-a', 'idle-b'],
        [680, 220, 820, 220]),
      walk: clip(packId, 'walk',
        ['walk-a-a', 'walk-a-b', 'walk-b-a', 'walk-b-b'],
        [130, 130, 130, 130]),
      work: clip(packId, 'work',
        ['work-a', 'work-b', 'work-a', 'work-b'],
        [240, 180, 260, 180]),
      carry: clip(packId, 'carry',
        ['carry-a', 'carry-b', 'carry-a', 'carry-b'],
        [200, 170, 200, 170]),
      paint: clip(packId, 'paint',
        ['paint-a', 'paint-b', 'paint-a', 'paint-b', 'paint-a'],
        [180, 150, 180, 150, 300]),
      sleep: clip(packId, 'sleep',
        ['sleep-a', 'sleep-b', 'sleep-a'],
        [720, 420, 820]),
      play: clip(packId, 'play',
        ['play-a', 'play-b', 'play-a', 'play-b'],
        [190, 150, 210, 150]),
      repair: clip(packId, 'repair',
        ['repair-a', 'repair-b', 'repair-a', 'repair-b', 'repair-a'],
        [170, 120, 190, 120, 280]),
      coffee: clip(packId, 'coffee',
        ['coffee-a', 'coffee-b', 'coffee-a', 'coffee-b'],
        [460, 320, 560, 320]),
      stretch: clip(packId, 'stretch',
        ['stretch-a', 'stretch-b', 'stretch-a'],
        [300, 440, 520]),
      type: clip(packId, 'type',
        ['type-a', 'type-b', 'type-a', 'type-b'],
        [150, 150, 170, 220]),
      inspect: clip(packId, 'inspect',
        ['inspect-a', 'inspect-b', 'inspect-a'],
        [380, 280, 540]),
      sweep: clip(packId, 'sweep',
        ['sweep-a', 'sweep-b', 'sweep-a', 'sweep-b'],
        [240, 240, 280, 320]),
      celebrate: clip(packId, 'celebrate',
        ['celebrate-a', 'celebrate-b', 'celebrate-a', 'celebrate-b', 'celebrate-a', 'celebrate-b'],
        [140, 140, 140, 140, 160, 240]),
    },
  };
}

export const NOOBI_PRODUCTION_PACKS: Readonly<Record<NoobiPackId, NoobiProductionPack>> = {
  classic: {
    id: 'classic',
    sceneImage: classicScene,
    spriteManifest: manifest('classic'),
  },
  mosslight: {
    id: 'mosslight',
    sceneImage: mosslightScene,
    spriteManifest: manifest('mosslight'),
  },
  starforge: {
    id: 'starforge',
    sceneImage: starforgeScene,
    spriteManifest: manifest('starforge'),
  },
  twilight: {
    id: 'twilight',
    sceneImage: twilightScene,
    spriteManifest: manifest('twilight'),
  },
  hellokitty: {
    id: 'hellokitty',
    sceneImage: helloKittyScene,
    spriteManifest: manifest('hellokitty'),
  },
};

export function noobiProductionPack(packId: NoobiPackId): NoobiProductionPack {
  return NOOBI_PRODUCTION_PACKS[packId];
}
