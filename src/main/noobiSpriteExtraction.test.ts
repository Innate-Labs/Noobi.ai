import { createRequire } from 'node:module';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NOOBI_PACK_IDS } from '../shared/contracts';

const BASE_POSE_NAMES = [
  'idle', 'walk-a', 'walk-b', 'work', 'paint',
  'repair', 'carry', 'play', 'sleep', 'celebrate',
] as const;

const REQUIRED_SOURCE_ASSETS = [
  'scene.png', 'sheet-a.png', 'sheet-b.png', 'sheet-extra.png',
] as const;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ExtractorApi {
  EXTRA_ACTION_NAMES: readonly string[];
  extractSpritePack: (configuration: ExtractionConfiguration) => SpriteLayout;
  parseArguments: (args: string[]) => ExtractionConfiguration;
  poseCanonicalScale: (canonical: Bounds, alternate: Bounds) => number;
  shouldRetainSecondaryComponent: (
    component: Bounds,
    primary: Bounds,
    cellWidth: number,
    cellHeight: number,
  ) => boolean;
}

interface ExtractionConfiguration {
  outputDirectory: string;
  filePrefix: string;
  baseLayoutPath?: string;
  layoutFileName?: string;
  layoutSuffix?: string;
  sheetMode: string;
  inputs: Array<{ inputPath: string; frameSuffix: string }>;
}

interface LayoutFrame {
  packBaseScale: number;
  poseScale: number;
  sourceScale: number;
  normalizedPrimarySize: { width: number; height: number };
  droppedComponentCount: number;
}

interface SpriteLayout {
  schemaVersion: number;
  scaleMode: string;
  sheetMode: string;
  packBaseScale: number;
  frames: Record<string, LayoutFrame>;
}

interface PngBitmap {
  width: number;
  height: number;
  data: Buffer;
}

const require = createRequire(import.meta.url);
const extractor = require('../../scripts/extract-noobi-sprites.cjs') as ExtractorApi;
const { PNG } = require('pngjs') as {
  PNG: {
    new(options: { width: number; height: number; colorType: number }): PngBitmap;
    sync: {
      read: (input: Buffer) => PngBitmap;
      write: (image: PngBitmap) => Buffer;
    };
  };
};

function largestOpaqueComponentBounds(filePath: string): Bounds {
  const image = PNG.sync.read(readFileSync(filePath));
  const visited = new Uint8Array(image.width * image.height);
  let largest: number[] = [];

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const start = (y * image.width) + x;
      if (visited[start] || image.data[(start * 4) + 3] === 0) continue;
      visited[start] = 1;
      const queue = [start];
      const component: number[] = [];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor]!;
        const currentX = index % image.width;
        const currentY = Math.floor(index / image.width);
        component.push(index);
        for (const [nextX, nextY] of [
          [currentX - 1, currentY], [currentX + 1, currentY],
          [currentX, currentY - 1], [currentX, currentY + 1],
        ]) {
          if (nextX < 0 || nextY < 0 || nextX >= image.width || nextY >= image.height) continue;
          const nextIndex = (nextY * image.width) + nextX;
          if (visited[nextIndex] || image.data[(nextIndex * 4) + 3] === 0) continue;
          visited[nextIndex] = 1;
          queue.push(nextIndex);
        }
      }
      if (component.length > largest.length) largest = component;
    }
  }

  const columns = largest.map((index) => index % image.width);
  const rows = largest.map((index) => Math.floor(index / image.width));
  return {
    minX: Math.min(...columns),
    minY: Math.min(...rows),
    maxX: Math.max(...columns),
    maxY: Math.max(...rows),
  };
}

function largestOpaqueComponentHeight(filePath: string): number {
  const bounds = largestOpaqueComponentBounds(filePath);
  return bounds.maxY - bounds.minY + 1;
}

function fillRectangle(
  image: PngBitmap,
  left: number,
  top: number,
  right: number,
  bottom: number,
  color: readonly [number, number, number, number],
): void {
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const offset = ((y * image.width) + x) * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = color[3];
    }
  }
}

function writeSyntheticActionSheet(filePath: string): void {
  const image = new PNG({ width: 1254, height: 1254, colorType: 6 });
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const left = Math.round((column * image.width) / 5);
      const right = Math.round(((column + 1) * image.width) / 5);
      const top = Math.round((row * image.height) / 2);
      const bottom = Math.round(((row + 1) * image.height) / 2);
      const bodyHeight = row === 0 ? 150 : 120;
      const bodyWidth = row === 0 ? 82 : 76;
      const centerX = Math.floor((left + right) / 2);
      const groundY = bottom - 72;
      fillRectangle(
        image,
        centerX - Math.floor(bodyWidth / 2),
        groundY - bodyHeight + 1,
        centerX + Math.ceil(bodyWidth / 2) - 1,
        groundY,
        [74 + (column * 22), 94 + (row * 34), 168, 255],
      );
    }
  }

  // Simulate an image-generation artifact bleeding in from the next cell.
  // It touches the coffee cell edge and is intentionally far from the actor.
  const firstCellRight = Math.round(image.width / 5);
  fillRectangle(image, firstCellRight - 2, 42, firstCellRight - 1, 86, [255, 0, 255, 255]);
  writeFileSync(filePath, PNG.sync.write(image));
}

describe('Noobi sprite extraction scale', () => {
  it('matches an alternate action frame to the canonical A-frame body height', () => {
    const canonical = { minX: 20, minY: 10, maxX: 225, maxY: 257 }; // 248 px
    const alternate = { minX: 22, minY: 30, maxX: 223, maxY: 232 }; // 203 px
    const scale = extractor.poseCanonicalScale(canonical, alternate);

    expect(scale).toBeCloseTo(248 / 203, 6);
    expect(203 * scale).toBeCloseTo(248, 6);
  });

  it('drops neighboring-cell slices without dropping nearby detached effects', () => {
    const primary = { minX: 30, minY: 120, maxX: 210, maxY: 370 };
    const nearbySpark = { minX: 214, minY: 220, maxX: 220, maxY: 228 };
    const rightEdgeSlice = { minX: 246, minY: 160, maxX: 250, maxY: 260 };
    const farDebris = { minX: 218, minY: 20, maxX: 228, maxY: 30 };

    expect(extractor.shouldRetainSecondaryComponent(nearbySpark, primary, 251, 627)).toBe(true);
    expect(extractor.shouldRetainSecondaryComponent(rightEdgeSlice, primary, 251, 627)).toBe(false);
    expect(extractor.shouldRetainSecondaryComponent(farDebris, primary, 251, 627)).toBe(false);
  });

  it('ships complete source sheets, layouts, and 30 rendered frames for every registered pack', () => {
    const root = resolve(process.cwd(), 'src/renderer/assets/noobi-packs');
    expect(NOOBI_PACK_IDS).toEqual(expect.arrayContaining(['twilight', 'hellokitty']));
    const collaborationScene = PNG.sync.read(readFileSync(
      resolve(root, 'collaboration/scene.png'),
    ));
    expect([collaborationScene.width, collaborationScene.height], 'collaboration scene canvas')
      .toEqual([1586, 992]);

    const expectedBaseFrameNames = BASE_POSE_NAMES.flatMap((pose) => [
      `sprite-${pose}-a.png`,
      `sprite-${pose}-b.png`,
    ]);
    const expectedExtraFrameNames = extractor.EXTRA_ACTION_NAMES.flatMap((action) => [
      `sprite-${action}-a.png`,
      `sprite-${action}-b.png`,
    ]);
    const expectedFrameNames = [...expectedBaseFrameNames, ...expectedExtraFrameNames].sort();

    for (const packId of NOOBI_PACK_IDS) {
      const packRoot = resolve(root, packId);
      const framesRoot = resolve(packRoot, 'frames');
      for (const sourceAsset of REQUIRED_SOURCE_ASSETS) {
        const source = PNG.sync.read(readFileSync(resolve(packRoot, sourceAsset)));
        expect(source.width, `${packId}/${sourceAsset} width`).toBeGreaterThan(0);
        expect(source.height, `${packId}/${sourceAsset} height`).toBeGreaterThan(0);
        if (sourceAsset === 'scene.png') {
          expect([source.width, source.height], `${packId}/${sourceAsset} canvas`)
            .toEqual([1586, 992]);
        }
      }

      const renderedFrameNames = readdirSync(framesRoot)
        .filter((name) => /^sprite-.*\.png$/u.test(name))
        .sort();
      expect(renderedFrameNames, `${packId} rendered frames`).toEqual(expectedFrameNames);
      for (const frameName of renderedFrameNames) {
        const frame = PNG.sync.read(readFileSync(resolve(framesRoot, frameName)));
        expect([frame.width, frame.height], `${packId}/${frameName} canvas`)
          .toEqual([252, 336]);
      }

      const layout = JSON.parse(readFileSync(
        resolve(framesRoot, 'sprite-layout.json'),
        'utf8',
      )) as SpriteLayout;
      const extraLayout = JSON.parse(readFileSync(
        resolve(framesRoot, 'sprite-extra-layout.json'),
        'utf8',
      )) as SpriteLayout;
      expect(layout.schemaVersion).toBe(2);
      expect(layout.scaleMode).toBe('pack-base-with-pose-a-canonical');
      expect(Object.keys(layout.frames)).toHaveLength(20);
      expect(extraLayout.schemaVersion).toBe(2);
      expect(extraLayout.sheetMode).toBe('extra-actions');
      expect(Object.keys(extraLayout.frames)).toHaveLength(10);
      expect(extraLayout.packBaseScale, `${packId} base/extra pack scale`)
        .toBe(layout.packBaseScale);

      for (const pose of BASE_POSE_NAMES) {
        const frameA = layout.frames[`${pose}-a`]!;
        const frameB = layout.frames[`${pose}-b`]!;
        expect(frameA.packBaseScale).toBe(layout.packBaseScale);
        expect(frameB.packBaseScale).toBe(layout.packBaseScale);
        expect(frameB.normalizedPrimarySize.height)
          .toBeCloseTo(frameA.normalizedPrimarySize.height, 5);
        const renderedHeightA = largestOpaqueComponentHeight(resolve(
          framesRoot, `sprite-${pose}-a.png`,
        ));
        const renderedHeightB = largestOpaqueComponentHeight(resolve(
          framesRoot, `sprite-${pose}-b.png`,
        ));
        expect(Math.abs(renderedHeightA - renderedHeightB)).toBeLessThanOrEqual(1);
      }
    }
  }, 15_000);

  it('extracts a standalone 5x2 extra-action sheet without replacing base poses', () => {
    const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'noobi-action-sheet-'));
    try {
      const inputPath = resolve(temporaryRoot, 'extra-actions.png');
      const outputDirectory = resolve(temporaryRoot, 'frames');
      writeSyntheticActionSheet(inputPath);

      // These files represent the existing 20-frame pack and main manifest.
      // The extra-action path must leave them byte-for-byte untouched.
      const mainLayoutPath = resolve(outputDirectory, 'sprite-layout.json');
      const existingPosePath = resolve(outputDirectory, 'sprite-idle-a.png');
      mkdirSync(outputDirectory, { recursive: true });
      writeFileSync(mainLayoutPath, 'existing-layout');
      writeFileSync(existingPosePath, 'existing-pose');

      const configuration = extractor.parseArguments([
        '--action-sheet', inputPath, outputDirectory, 'sprite',
      ]);
      expect(configuration.sheetMode).toBe('extra-actions');
      expect(configuration.baseLayoutPath).toBeUndefined();
      expect(configuration.layoutFileName).toBe('sprite-extra-layout.json');
      expect(extractor.EXTRA_ACTION_NAMES).toEqual([
        'coffee', 'stretch', 'type', 'inspect', 'sweep',
      ]);

      const layout = extractor.extractSpritePack(configuration);
      expect(layout.sheetMode).toBe('extra-actions');
      expect(readFileSync(mainLayoutPath, 'utf8')).toBe('existing-layout');
      expect(readFileSync(existingPosePath, 'utf8')).toBe('existing-pose');
      expect(JSON.parse(readFileSync(
        resolve(outputDirectory, 'sprite-extra-layout.json'),
        'utf8',
      ))).toEqual(layout);

      for (const action of extractor.EXTRA_ACTION_NAMES) {
        const frameAPath = resolve(outputDirectory, `sprite-${action}-a.png`);
        const frameBPath = resolve(outputDirectory, `sprite-${action}-b.png`);
        const frameA = PNG.sync.read(readFileSync(frameAPath));
        const frameB = PNG.sync.read(readFileSync(frameBPath));
        expect([frameA.width, frameA.height]).toEqual([252, 336]);
        expect([frameB.width, frameB.height]).toEqual([252, 336]);
        expect(largestOpaqueComponentBounds(frameAPath).maxY).toBe(320);
        expect(largestOpaqueComponentBounds(frameBPath).maxY).toBe(320);
        expect(layout.frames[`${action}-b`]!.normalizedPrimarySize.height)
          .toBeCloseTo(layout.frames[`${action}-a`]!.normalizedPrimarySize.height, 5);
        expect(Math.abs(
          largestOpaqueComponentHeight(frameAPath)
          - largestOpaqueComponentHeight(frameBPath),
        )).toBeLessThanOrEqual(1);
      }

      expect(layout.frames['coffee-a']!.droppedComponentCount).toBeGreaterThan(0);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('reuses the base pose layout scale for a separately generated action sheet', () => {
    const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'noobi-unified-action-scale-'));
    try {
      const inputPath = resolve(temporaryRoot, 'extra-actions.png');
      const outputDirectory = resolve(temporaryRoot, 'frames');
      const baseLayoutPath = resolve(outputDirectory, 'sprite-layout.json');
      const inheritedPackBaseScale = 0.625;
      writeSyntheticActionSheet(inputPath);
      mkdirSync(outputDirectory, { recursive: true });
      writeFileSync(baseLayoutPath, JSON.stringify({
        schemaVersion: 2,
        packBaseScale: inheritedPackBaseScale,
        canvas: {
          width: 252,
          height: 336,
          pivot: { x: 126, y: 320 },
        },
      }));

      // Omitting the positional prefix remains valid when --base-layout is used.
      const configuration = extractor.parseArguments([
        '--action-sheet', inputPath, outputDirectory,
        '--base-layout', baseLayoutPath,
      ]);
      expect(configuration.filePrefix).toBe('sprite');
      expect(configuration.baseLayoutPath).toBe(baseLayoutPath);

      const layout = extractor.extractSpritePack(configuration);
      expect(layout.packBaseScale).toBe(inheritedPackBaseScale);
      expect(JSON.parse(readFileSync(baseLayoutPath, 'utf8')).packBaseScale)
        .toBe(inheritedPackBaseScale);
      for (const action of extractor.EXTRA_ACTION_NAMES) {
        const frameA = layout.frames[`${action}-a`]!;
        const frameB = layout.frames[`${action}-b`]!;
        expect(frameA.packBaseScale).toBe(inheritedPackBaseScale);
        expect(frameB.packBaseScale).toBe(inheritedPackBaseScale);
        expect(frameA.sourceScale).toBe(inheritedPackBaseScale * frameA.poseScale);
        expect(frameB.sourceScale).toBe(inheritedPackBaseScale * frameB.poseScale);
        expect(frameB.normalizedPrimarySize.height)
          .toBeCloseTo(frameA.normalizedPrimarySize.height, 5);
      }
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects an invalid base layout scale instead of silently changing sprite size', () => {
    const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'noobi-invalid-base-scale-'));
    try {
      const inputPath = resolve(temporaryRoot, 'extra-actions.png');
      const outputDirectory = resolve(temporaryRoot, 'frames');
      const baseLayoutPath = resolve(temporaryRoot, 'sprite-layout.json');
      writeSyntheticActionSheet(inputPath);
      writeFileSync(baseLayoutPath, JSON.stringify({ packBaseScale: 'large' }));

      const configuration = extractor.parseArguments([
        '--action-sheet', inputPath, outputDirectory, 'sprite',
        '--base-layout', baseLayoutPath,
      ]);
      expect(() => extractor.extractSpritePack(configuration))
        .toThrow('invalid packBaseScale');
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
