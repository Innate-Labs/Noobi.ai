#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pngjs from 'pngjs';

const { PNG } = pngjs;

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const SOURCE_ROOT = join(
  REPOSITORY_ROOT,
  'src/renderer/assets/noobi-packs/fishing/sources',
);
const DEFAULT_SOURCES = {
  classic: join(SOURCE_ROOT, 'classic-seated-fishing-sheet.png'),
  twilight: join(SOURCE_ROOT, 'twilight-seated-fishing-sheet.png'),
  hellokitty: join(SOURCE_ROOT, 'hellokitty-seated-fishing-sheet.png'),
  starforge: join(SOURCE_ROOT, 'starforge-seated-fishing-sheet.png'),
};
const DEFAULT_OUTPUT_ROOT = join(
  REPOSITORY_ROOT,
  'src/renderer/assets/noobi-packs/fishing/frames',
);
const PACKS = Object.keys(DEFAULT_SOURCES);
const OUTPUT_CANVAS = { width: 252, height: 336, pivot: { x: 126, y: 336 } };
const PACK_GEOMETRY = {
  classic: {
    facing: 1,
    frames: {
      a: {
        seatAnchor: { x: 374, y: 676 },
        handAnchor: { x: 424, y: 594 },
      },
      b: {
        seatAnchor: { x: 375, y: 686 },
        handAnchor: { x: 430, y: 575 },
      },
    },
  },
  twilight: {
    facing: 1,
    frames: {
      a: {
        seatAnchor: { x: 357, y: 634 },
        handAnchor: { x: 462, y: 530 },
      },
      b: {
        seatAnchor: { x: 345, y: 658 },
        handAnchor: { x: 453, y: 557 },
      },
    },
  },
  hellokitty: {
    facing: -1,
    frames: {
      a: {
        seatAnchor: { x: 424, y: 648 },
        handAnchor: { x: 412, y: 606 },
      },
      b: {
        seatAnchor: { x: 344, y: 653 },
        handAnchor: { x: 320, y: 604 },
      },
    },
  },
  starforge: {
    facing: -1,
    frames: {
      a: {
        seatAnchor: { x: 471, y: 682 },
        handAnchor: { x: 421, y: 594 },
      },
      b: {
        seatAnchor: { x: 384, y: 685 },
        handAnchor: { x: 329, y: 597 },
      },
    },
  },
};
const MAXIMUM_SEAT_ANCHOR_DRIFT = 1;

const HELP = `Extract normalized transparent A/B seated-fishing frames from 2-column green-screen sheets.

Usage:
  node scripts/extract-fishing-sprites.mjs [options]

Options:
  --classic <png>       Classic 2-column source sheet
  --twilight <png>      Twilight 2-column source sheet
  --hellokitty <png>    Hello Kitty 2-column source sheet
  --starforge <png>     Starforge 2-column source sheet
  --output-root <dir>   Output root (default: src/renderer/assets/noobi-packs/fishing/frames)
  --help                Show this help

Each sheet must have an even width. It is split into exact left/right halves,
the chroma key becomes a soft alpha edge with despill, transparent padding is
trimmed, and both poses are bottom-center normalized on a 252x336 shared canvas.
Each output frame records its internal seat and hand anchors in normalized
canvas pixels so the renderer can place the hips on the board and the rod in
the hands without using the sprite's bottom edge as a seat point.
`;

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  await mkdir(options.outputRoot, { recursive: true });
  const summaries = [];
  for (const packId of PACKS) {
    summaries.push(await extractPack({
      packId,
      sourcePath: options.sources[packId],
      outputDirectory: join(options.outputRoot, packId),
    }));
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputRoot: options.outputRoot,
    packs: summaries,
  }, null, 2)}\n`);
}

function parseArguments(args) {
  const options = {
    sources: { ...DEFAULT_SOURCES },
    outputRoot: DEFAULT_OUTPUT_ROOT,
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    const separator = argument.indexOf('=');
    const flag = separator > 0 ? argument.slice(0, separator) : argument;
    let value = separator > 0 ? argument.slice(separator + 1) : undefined;
    if (value === undefined) {
      index += 1;
      value = args[index];
    }
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    if (flag === '--output-root') {
      options.outputRoot = resolve(process.cwd(), value);
      continue;
    }
    const packId = flag.slice(2);
    if (!PACKS.includes(packId)) throw new Error(`Unknown option: ${argument}`);
    options.sources[packId] = resolve(process.cwd(), value);
  }
  return options;
}

async function extractPack({ packId, sourcePath, outputDirectory }) {
  const geometry = PACK_GEOMETRY[packId];
  if (!geometry) throw new Error(`${packId} has no fishing geometry metadata.`);
  const sourceBytes = await readFile(sourcePath);
  const source = decodePng(sourceBytes, sourcePath);
  if (source.width % 2 !== 0) {
    throw new Error(`${packId} sheet width must be even; received ${source.width}.`);
  }
  const frameWidth = source.width / 2;
  const rawFrames = [
    copyRegion(source, 0, 0, frameWidth, source.height),
    copyRegion(source, frameWidth, 0, frameWidth, source.height),
  ];
  const preparedFrames = rawFrames.map((frame, index) => prepareFrame(
    frame,
    `${packId}:${index === 0 ? 'a' : 'b'}`,
  ));
  const sourceCanvasWidth = Math.max(...preparedFrames.map((frame) => frame.trimmed.width));
  const sourceCanvasHeight = Math.max(...preparedFrames.map((frame) => frame.trimmed.height));
  const normalizationScale = Math.min(
    OUTPUT_CANVAS.width / sourceCanvasWidth,
    OUTPUT_CANVAS.height / sourceCanvasHeight,
  );
  const normalizedFrames = preparedFrames.map((frame, index) => {
    const frameId = index === 0 ? 'a' : 'b';
    return normalizeFrame(
      frame,
      normalizationScale,
      geometry.frames[frameId],
      `${packId}:${frameId}`,
    );
  });
  assertStableSeatAnchors(packId, normalizedFrames);

  await mkdir(outputDirectory, { recursive: true });
  const frameNames = ['sprite-fishing-a.png', 'sprite-fishing-b.png'];
  for (let index = 0; index < normalizedFrames.length; index += 1) {
    const outputPath = join(outputDirectory, frameNames[index]);
    const encoded = PNG.sync.write(normalizedFrames[index].png, {
      colorType: 6,
      inputColorType: 6,
      bitDepth: 8,
      deflateLevel: 9,
    });
    await writeFile(outputPath, encoded);
    const roundTrip = decodePng(encoded, outputPath);
    assertOutputFrame(roundTrip, normalizedFrames[index], `${packId}:${frameNames[index]}`);
  }

  const metadata = {
    schemaVersion: 2,
    packId,
    source: {
      filename: basename(sourcePath),
      sha256: createHash('sha256').update(sourceBytes).digest('hex'),
      width: source.width,
      height: source.height,
      columns: 2,
      frameWidth,
    },
    chroma: {
      mode: 'soft-chroma-alpha',
      hueDegrees: { minimum: 90, maximum: 150 },
      minimumSaturation: 0.45,
      minimumGreen: 80,
      greenDominance: { opaqueAtOrBelow: 40, transparentAtOrAbove: 190 },
      alphaCurve: '1-smoothstep(40,190,D)',
      despill: 'G=min(G,max(R,B)+20) for 0<alpha<255',
    },
    canvas: {
      ...OUTPUT_CANVAS,
      alignment: 'bottom-center',
      sourceFitScale: normalizationScale,
      anchorSpace: 'normalized-canvas-pixels',
      facing: geometry.facing,
    },
    frames: normalizedFrames.map((frame, index) => ({
      id: index === 0 ? 'a' : 'b',
      file: frameNames[index],
      sourceBounds: preparedFrames[index].sourceBounds,
      placement: frame.placement,
      seatAnchor: frame.seatAnchor,
      handAnchor: frame.handAnchor,
      sourceAnchors: geometry.frames[index === 0 ? 'a' : 'b'],
      opaquePixels: frame.opaquePixels,
      keyedPixels: preparedFrames[index].keyedPixels,
      softAlphaPixels: countSoftAlphaPixels(frame.png),
      remainingOpaqueChromaPixels: countOpaqueChromaPixels(frame.png),
    })),
  };
  await writeFile(
    join(outputDirectory, 'sprite-layout.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );

  return {
    packId,
    source: basename(sourcePath),
    canvas: metadata.canvas,
    frames: metadata.frames,
  };
}

function prepareFrame(frame, label) {
  const keyedPixels = applySoftChromaKey(frame);
  const remainingOpaqueChromaPixels = countOpaqueChromaPixels(frame);
  if (remainingOpaqueChromaPixels !== 0) {
    throw new Error(`${label} retained ${remainingOpaqueChromaPixels} opaque chroma pixels.`);
  }
  const sourceBounds = alphaBounds(frame);
  if (!sourceBounds) throw new Error(`${label} is empty after green-screen extraction.`);
  const trimmed = copyRegion(
    frame,
    sourceBounds.left,
    sourceBounds.top,
    sourceBounds.width,
    sourceBounds.height,
  );
  const opaquePixels = countOpaquePixels(trimmed);
  if (opaquePixels < 1_000) throw new Error(`${label} retained too few body pixels (${opaquePixels}).`);
  return { trimmed, sourceBounds, opaquePixels, keyedPixels };
}

function applySoftChromaKey(frame) {
  let keyedPixels = 0;
  for (let index = 0; index < frame.width * frame.height; index += 1) {
    const offset = index * 4;
    const red = frame.data[offset];
    const green = frame.data[offset + 1];
    const blue = frame.data[offset + 2];
    const { hue, saturation } = hueAndSaturation(red, green, blue);
    if (hue < 90 || hue > 150 || saturation < 0.45 || green < 80) continue;
    const dominance = green - Math.max(red, blue);
    if (dominance <= 40) continue;
    keyedPixels += 1;
    if (dominance >= 190) {
      frame.data[offset] = 0;
      frame.data[offset + 1] = 0;
      frame.data[offset + 2] = 0;
      frame.data[offset + 3] = 0;
      continue;
    }
    const progress = (dominance - 40) / 150;
    const smoothstep = progress * progress * (3 - (2 * progress));
    const alpha = Math.floor(frame.data[offset + 3] * (1 - smoothstep));
    frame.data[offset + 1] = Math.min(green, Math.max(red, blue) + 20);
    frame.data[offset + 3] = alpha;
  }
  return keyedPixels;
}

function hueAndSaturation(red, green, blue) {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const maximum = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minimum = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = maximum - minimum;
  const saturation = maximum === 0 ? 0 : delta / maximum;
  if (delta === 0) return { hue: 0, saturation };
  let hue;
  if (maximum === normalizedRed) {
    hue = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
  } else if (maximum === normalizedGreen) {
    hue = 60 * (((normalizedBlue - normalizedRed) / delta) + 2);
  } else {
    hue = 60 * (((normalizedRed - normalizedGreen) / delta) + 4);
  }
  return { hue: hue < 0 ? hue + 360 : hue, saturation };
}

function normalizeFrame(frame, scale, sourceAnchors, label) {
  const width = Math.max(1, Math.round(frame.trimmed.width * scale));
  const height = Math.max(1, Math.round(frame.trimmed.height * scale));
  const scaled = resizeNearest(frame.trimmed, width, height);
  const png = new PNG({
    width: OUTPUT_CANVAS.width,
    height: OUTPUT_CANVAS.height,
    colorType: 6,
  });
  png.data.fill(0);
  const placement = {
    x: Math.floor((OUTPUT_CANVAS.width - width) / 2),
    y: OUTPUT_CANVAS.height - height,
    width,
    height,
  };
  PNG.bitblt(
    scaled,
    png,
    0,
    0,
    width,
    height,
    placement.x,
    placement.y,
  );
  const seatAnchor = normalizeAnchor(
    sourceAnchors.seatAnchor,
    frame.sourceBounds,
    placement,
    `${label}:seatAnchor`,
  );
  const handAnchor = normalizeAnchor(
    sourceAnchors.handAnchor,
    frame.sourceBounds,
    placement,
    `${label}:handAnchor`,
  );
  return {
    png,
    placement,
    seatAnchor,
    handAnchor,
    opaquePixels: countOpaquePixels(scaled),
  };
}

function normalizeAnchor(sourceAnchor, sourceBounds, placement, label) {
  if (!Number.isFinite(sourceAnchor?.x) || !Number.isFinite(sourceAnchor?.y)) {
    throw new Error(`${label} must contain finite source-frame pixel coordinates.`);
  }
  if (sourceAnchor.x < sourceBounds.left || sourceAnchor.x > sourceBounds.right
    || sourceAnchor.y < sourceBounds.top || sourceAnchor.y > sourceBounds.bottom) {
    throw new Error(`${label} falls outside the extracted character bounds.`);
  }
  const scaleX = placement.width / sourceBounds.width;
  const scaleY = placement.height / sourceBounds.height;
  const normalized = {
    x: Math.round(placement.x + ((sourceAnchor.x - sourceBounds.left) * scaleX)),
    y: Math.round(placement.y + ((sourceAnchor.y - sourceBounds.top) * scaleY)),
  };
  if (normalized.x < 0 || normalized.x >= OUTPUT_CANVAS.width
    || normalized.y < 0 || normalized.y >= OUTPUT_CANVAS.height) {
    throw new Error(`${label} escaped the normalized output canvas.`);
  }
  return normalized;
}

function assertStableSeatAnchors(packId, frames) {
  const [first, second] = frames;
  const drift = {
    x: Math.abs(first.seatAnchor.x - second.seatAnchor.x),
    y: Math.abs(first.seatAnchor.y - second.seatAnchor.y),
  };
  if (drift.x > MAXIMUM_SEAT_ANCHOR_DRIFT
    || drift.y > MAXIMUM_SEAT_ANCHOR_DRIFT) {
    throw new Error(
      `${packId} seat anchors drift by ${drift.x}px x ${drift.y}px between A/B frames.`,
    );
  }
}

function assertOutputFrame(png, expected, label) {
  if (png.width !== expected.png.width || png.height !== expected.png.height) {
    throw new Error(`${label} changed dimensions during PNG round-trip.`);
  }
  const opaquePixels = countOpaquePixels(png);
  if (opaquePixels !== expected.opaquePixels) {
    throw new Error(`${label} lost body pixels: expected ${expected.opaquePixels}, received ${opaquePixels}.`);
  }
  const bounds = alphaBounds(png);
  if (!bounds) throw new Error(`${label} has no alpha bounds.`);
  if (bounds.left < 0 || bounds.top < 0
    || bounds.right >= png.width || bounds.bottom >= png.height) {
    throw new Error(`${label} alpha bounds escaped its normalized canvas.`);
  }
  if (bounds.bottom !== OUTPUT_CANVAS.height - 1) {
    throw new Error(`${label} is not aligned to the shared bottom pivot.`);
  }
  for (const [anchorName, anchor] of [
    ['seatAnchor', expected.seatAnchor],
    ['handAnchor', expected.handAnchor],
  ]) {
    if (!Number.isInteger(anchor.x) || !Number.isInteger(anchor.y)
      || anchor.x < 0 || anchor.x >= png.width
      || anchor.y < 0 || anchor.y >= png.height) {
      throw new Error(`${label} has an invalid normalized ${anchorName}.`);
    }
  }
  const transparentPixels = (png.width * png.height) - opaquePixels;
  if (transparentPixels <= 0) throw new Error(`${label} has no true transparency.`);
  const chromaPixels = countOpaqueChromaPixels(png);
  if (chromaPixels !== 0) {
    throw new Error(`${label} retained ${chromaPixels} fully opaque chroma pixels.`);
  }
}

function alphaBounds(png) {
  let left = png.width;
  let top = png.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[((y * png.width) + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function countOpaquePixels(png) {
  let count = 0;
  for (let offset = 3; offset < png.data.length; offset += 4) {
    if (png.data[offset] > 0) count += 1;
  }
  return count;
}

function countOpaqueChromaPixels(png) {
  let count = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    if (png.data[offset + 3] !== 255) continue;
    const red = png.data[offset];
    const green = png.data[offset + 1];
    const blue = png.data[offset + 2];
    const { hue, saturation } = hueAndSaturation(red, green, blue);
    if (hue >= 90 && hue <= 150
      && saturation >= 0.45
      && green >= 80
      && green - Math.max(red, blue) > 40) count += 1;
  }
  return count;
}

function countSoftAlphaPixels(png) {
  let count = 0;
  for (let offset = 3; offset < png.data.length; offset += 4) {
    if (png.data[offset] > 0 && png.data[offset] < 255) count += 1;
  }
  return count;
}

function resizeNearest(source, width, height) {
  const target = new PNG({ width, height, colorType: 6 });
  for (let targetY = 0; targetY < height; targetY += 1) {
    const sourceY = Math.min(
      source.height - 1,
      Math.floor((targetY * source.height) / height),
    );
    for (let targetX = 0; targetX < width; targetX += 1) {
      const sourceX = Math.min(
        source.width - 1,
        Math.floor((targetX * source.width) / width),
      );
      const sourceOffset = ((sourceY * source.width) + sourceX) * 4;
      const targetOffset = ((targetY * width) + targetX) * 4;
      source.data.copy(target.data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return target;
}

function copyRegion(source, left, top, width, height) {
  const target = new PNG({ width, height, colorType: 6 });
  PNG.bitblt(source, target, left, top, width, height, 0, 0);
  return target;
}

function decodePng(bytes, label) {
  try {
    return PNG.sync.read(bytes);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to decode ${label}: ${reason}`);
  }
}

main().catch((error) => {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`extract-fishing-sprites: ${reason}\n`);
  process.exitCode = 1;
});
