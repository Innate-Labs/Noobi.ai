#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  join,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import pngjs from 'pngjs';

const { PNG } = pngjs;

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const DEFAULT_BACKGROUND = join(
  REPOSITORY_ROOT,
  'src/renderer/assets/noobi-packs/fishing/scene.png',
);
const DEFAULT_OUTPUT = join(
  REPOSITORY_ROOT,
  'src/renderer/assets/noobi-packs/fishing/four-ip-fishing.gif',
);
const DEFAULT_PACKS = ['classic', 'twilight', 'hellokitty', 'starforge'];
const KNOWN_PACKS = new Set(DEFAULT_PACKS);
const FISHING_HAND_ANCHORS = {
  classic: [{ x: 0.72, y: 0.69 }, { x: 0.80, y: 0.66 }],
  twilight: [{ x: 0.82, y: 0.73 }, { x: 0.78, y: 0.72 }],
  hellokitty: [{ x: 0.68, y: 0.74 }, { x: 0.68, y: 0.69 }],
  starforge: [{ x: 0.73, y: 0.73 }, { x: 0.73, y: 0.74 }],
};
const FISHING_VISUAL_THEMES = {
  classic: {
    lure: 'acorn',
    ringOffset: 6,
    hand: [180, 108, 58, 255],
    handHighlight: [237, 166, 83, 255],
    handOutline: [72, 43, 30, 255],
    reflectionTint: [62, 151, 159],
  },
  twilight: {
    lure: 'crystal-star',
    ringOffset: 6,
    hand: [128, 83, 165, 255],
    handHighlight: [199, 143, 226, 255],
    handOutline: [56, 35, 82, 255],
    reflectionTint: [87, 125, 180],
  },
  hellokitty: {
    lure: 'red-bow',
    ringOffset: 6,
    hand: [247, 242, 225, 255],
    handHighlight: [255, 255, 248, 255],
    handOutline: [95, 73, 70, 255],
    reflectionTint: [102, 154, 174],
  },
  starforge: {
    lure: 'clockwork-orb',
    ringOffset: 7,
    hand: [89, 65, 55, 255],
    handHighlight: [218, 151, 63, 255],
    handOutline: [39, 34, 37, 255],
    reflectionTint: [46, 151, 157],
  },
};
const DEFAULT_SOURCE_FACING = 1;
const REFERENCE_SCENE = { width: 960, height: 640 };
const referencePoint = (x, y) => ({
  x: x / (REFERENCE_SCENE.width - 1),
  y: y / (REFERENCE_SCENE.height - 1),
});
const referenceRect = (left, top, right, bottom) => ({
  left: left / REFERENCE_SCENE.width,
  top: top / REFERENCE_SCENE.height,
  right: right / REFERENCE_SCENE.width,
  bottom: bottom / REFERENCE_SCENE.height,
});
const referencePolygon = (points) => points.map(([x, y]) => referencePoint(x, y));

// Measured against fishing/scene.png. `position` is the butt/wood contact point,
// not the bottom of the sprite canvas. Each source sheet records its authored
// facing in sprite-layout.json, so asymmetric characters are never mirrored
// unless a sheet and its target platform genuinely disagree. seatBand is used
// only as a validation assertion.
const DEFAULT_PLATFORM_LAYOUTS = [
  {
    position: referencePoint(176, 326),
    feet: referencePoint(195, 344),
    reflectionSurface: referencePoint(176, 361),
    platformTop: referencePolygon([[122, 309], [177, 290], [231, 313], [176, 349]]),
    facing: 1,
    spriteHeightRatio: 108 / REFERENCE_SCENE.height,
    bounds: referenceRect(125, 0, 236, 396),
    seatBand: referenceRect(171, 321, 182, 332),
  },
  {
    position: referencePoint(350, 307),
    feet: referencePoint(357, 327),
    reflectionSurface: referencePoint(350, 347),
    platformTop: referencePolygon([[301, 290], [349, 276], [408, 294], [350, 331]]),
    facing: 1,
    spriteHeightRatio: 104 / REFERENCE_SCENE.height,
    bounds: referenceRect(303, 0, 406, 378),
    seatBand: referenceRect(345, 302, 356, 313),
  },
  {
    position: referencePoint(593, 304),
    feet: referencePoint(582, 324),
    reflectionSurface: referencePoint(593, 345),
    platformTop: referencePolygon([[534, 284], [590, 264], [647, 288], [593, 328]]),
    facing: -1,
    spriteHeightRatio: 104 / REFERENCE_SCENE.height,
    bounds: referenceRect(536, 0, 641, 367),
    seatBand: referenceRect(587, 299, 599, 310),
  },
  {
    position: referencePoint(807, 346),
    feet: referencePoint(794, 364),
    reflectionSurface: referencePoint(807, 381),
    platformTop: referencePolygon([[745, 322], [805, 298], [863, 325], [807, 369]]),
    facing: -1,
    spriteHeightRatio: 110 / REFERENCE_SCENE.height,
    bounds: referenceRect(749, 0, 864, 412),
    seatBand: referenceRect(801, 341, 813, 352),
  },
];
const DEFAULT_POSITIONS = DEFAULT_PLATFORM_LAYOUTS.map(({ position }) => position);
const DEFAULT_BOBBERS = [
  referencePoint(285, 520),
  referencePoint(390, 535),
  referencePoint(530, 535),
  referencePoint(690, 520),
];

const WATER_REGION = Object.freeze({
  NONE: 0,
  UPSTREAM: 1,
  FALL: 2,
  STREAM: 3,
  POND: 4,
});
const REFERENCE_WATER_REGIONS = {
  upstream: [[91, 0], [223, 0], [220, 24], [207, 42], [208, 65], [112, 65], [108, 45], [96, 32]],
  fall: [[110, 45], [213, 45], [217, 164], [199, 178], [145, 178], [108, 164]],
  stream: [
    [164, 178, 48], [169, 213, 45], [203, 235, 35], [238, 250, 32],
    [286, 258, 35], [337, 267, 40], [390, 276, 40], [444, 282, 42],
    [497, 297, 42], [526, 327, 38], [526, 350, 42],
  ],
  pondShore: [
    [0, 370], [75, 350], [140, 329], [220, 326], [300, 311], [370, 312],
    [440, 291], [520, 292], [600, 305], [670, 320], [750, 332], [850, 348],
    [960, 374],
  ],
};
const AMBIENT_RIPPLES = [
  [82, 474, 0], [304, 487, 5], [468, 423, 11],
  [642, 469, 17], [842, 543, 23], [735, 595, 27],
];
const POND_FISH = [
  {
    center: [170, 526], radius: [65, 17], perturb: [3, 2], direction: 1,
    phase: Math.PI / 4, size: [26, 12], tail: [3, 6, 0],
    body: [216, 146, 71, 151], accent: [241, 198, 106, 172], bubbleStart: 6,
  },
  {
    center: [350, 587], radius: [46, 14], perturb: [3, 2], direction: -1,
    phase: (5 * Math.PI) / 8, size: [22, 10], tail: [2, 5, Math.PI / 3],
    body: [108, 159, 162, 110], accent: [168, 201, 184, 122], bubbleStart: null,
  },
  {
    center: [590, 592], radius: [48, 14], perturb: [3, 2], direction: 1,
    phase: Math.PI, size: [24, 10], tail: [3, 7, Math.PI],
    body: [218, 184, 121, 117], accent: [201, 110, 78, 132], bubbleStart: 20,
  },
  {
    center: [878, 548], radius: [34, 19], perturb: [2, 2], direction: -1,
    phase: (5 * Math.PI) / 4, size: [22, 10], tail: [2, 6, (5 * Math.PI) / 4],
    body: [93, 146, 160, 138], accent: [146, 196, 181, 153], bubbleStart: 29,
  },
  {
    center: [465, 454], radius: [24, 10], perturb: [2, 1], direction: 1,
    phase: Math.PI / 2, size: [14, 7], tail: [2, 8, Math.PI / 2],
    body: [207, 106, 85, 184], accent: [234, 161, 118, 202], bubbleStart: 12,
  },
  {
    center: [610, 454], radius: [29, 11], perturb: [2, 1], direction: -1,
    phase: (7 * Math.PI) / 4, size: [16, 8], tail: [2, 7, (7 * Math.PI) / 4],
    body: [168, 166, 78, 171], accent: [208, 205, 114, 194], bubbleStart: null,
  },
];
// These definitions point at vegetation already painted into scene.png. The
// renderer lifts those exact pixels into root-pinned rigs; it never draws a
// second, synthetic plant on top of the scene.
const NATIVE_FOLIAGE_CLUSTERS = [
  {
    id: 'cattail-flower',
    rect: [542, 90, 76, 76],
    root: [578, 162],
    topY: 90,
    amplitude: 3,
    phase: 0.18,
    terrain: 'land',
    greenSeeds: [[576, 145]],
    brownSeeds: [[590, 104]],
    flowerSeeds: [[608, 151]],
    includeBrown: true,
    includeFlowers: true,
    guard: [[542, 123], [550, 99], [604, 92], [618, 140], [614, 166], [543, 166]],
  },
  {
    id: 'rock-grass',
    rect: [362, 166, 54, 78],
    root: [389, 238],
    topY: 173,
    amplitude: 2,
    phase: 0.72,
    terrain: 'land',
    greenSeeds: [[389, 220]],
    guard: [[374, 166], [404, 166], [416, 240], [362, 240]],
  },
  {
    id: 'stream-reeds',
    rect: [300, 188, 74, 95],
    root: [338, 277],
    topY: 188,
    amplitude: 3,
    phase: 1.34,
    terrain: 'water-edge',
    greenSeeds: [[342, 244]],
    brownSeeds: [[320, 203]],
    includeBrown: true,
    guard: [[305, 188], [356, 188], [374, 279], [300, 279]],
  },
  {
    id: 'left-reeds',
    rect: [229, 244, 73, 112],
    root: [266, 350],
    topY: 245,
    amplitude: 3,
    phase: 1.92,
    terrain: 'water-edge',
    greenSeeds: [[251, 300]],
    brownSeeds: [[270, 259]],
    includeBrown: true,
    guard: [[234, 244], [288, 244], [302, 352], [229, 352]],
  },
  {
    id: 'far-left-reeds',
    rect: [0, 336, 65, 101],
    root: [31, 430],
    topY: 337,
    amplitude: 3,
    phase: 2.48,
    terrain: 'water-edge',
    greenSeeds: [[31, 410]],
    brownSeeds: [[48, 355]],
    includeBrown: true,
    guard: [[0, 336], [52, 336], [65, 432], [0, 432]],
  },
  {
    id: 'right-reeds',
    rect: [672, 268, 80, 124],
    root: [713, 385],
    topY: 268,
    amplitude: 3,
    phase: 3.12,
    terrain: 'water-edge',
    greenSeeds: [[690, 330]],
    brownSeeds: [[713, 283]],
    includeBrown: true,
    guard: [[678, 268], [736, 268], [752, 388], [672, 388]],
  },
  {
    id: 'far-right-reeds',
    rect: [897, 305, 63, 137],
    root: [929, 435],
    topY: 305,
    amplitude: 3,
    phase: 3.76,
    terrain: 'water-edge',
    greenSeeds: [[929, 400]],
    brownSeeds: [[944, 324]],
    includeBrown: true,
    guard: [[904, 305], [953, 305], [960, 438], [897, 438]],
  },
  {
    id: 'cliff-flowers',
    rect: [264, 65, 66, 47],
    root: [298, 104],
    topY: 65,
    amplitude: 2,
    phase: 4.38,
    terrain: 'land',
    greenSeeds: [[298, 93]],
    flowerSeeds: [[312, 93]],
    includeFlowers: true,
    guard: [[264, 65], [330, 65], [326, 108], [268, 108]],
  },
  {
    id: 'flower-upper-center', rect: [479, 62, 28, 29], root: [492, 89], topY: 62,
    amplitude: 2, phase: 4.76, terrain: 'land', includeFlowers: true,
    greenSeeds: [[492, 84]], flowerSeeds: [[492, 74]],
  },
  {
    id: 'flower-mid-left', rect: [408, 157, 28, 34], root: [421, 189], topY: 157,
    amplitude: 2, phase: 5.08, terrain: 'land', includeFlowers: true,
    greenSeeds: [[421, 183]], flowerSeeds: [[421, 176]],
  },
  {
    id: 'flower-mid-right', rect: [797, 187, 32, 33], root: [813, 218], topY: 187,
    amplitude: 2, phase: 5.42, terrain: 'land', includeFlowers: true,
    greenSeeds: [[813, 212]], flowerSeeds: [[813, 204]],
  },
  {
    id: 'flower-far-right', rect: [908, 193, 28, 34], root: [921, 225], topY: 193,
    amplitude: 2, phase: 5.76, terrain: 'land', includeFlowers: true,
    greenSeeds: [[921, 219]], flowerSeeds: [[921, 211]],
  },
  {
    id: 'flower-right-bank', rect: [876, 227, 31, 34], root: [890, 259], topY: 227,
    amplitude: 2, phase: 6.10, terrain: 'land', includeFlowers: true,
    greenSeeds: [[890, 253]], flowerSeeds: [[890, 243]],
  },
  {
    id: 'flower-center-bank', rect: [539, 228, 31, 34], root: [554, 260], topY: 228,
    amplitude: 2, phase: 0.34, terrain: 'land', includeFlowers: true,
    greenSeeds: [[554, 254]], flowerSeeds: [[554, 243]],
  },
  {
    id: 'flower-left-bank', rect: [80, 290, 30, 32], root: [94, 320], topY: 290,
    amplitude: 2, phase: 0.68, terrain: 'land', includeFlowers: true,
    greenSeeds: [[94, 314]], flowerSeeds: [[94, 303]],
  },
];

const HELP = `Render a seamless pixel-art GIF of four current Noobi IPs fishing.

Usage:
  node scripts/render-fishing-gif.mjs [options]

Options:
  -b, --background <png>    Pixel-art background PNG
                            (default: src/renderer/assets/noobi-packs/fishing/scene.png)
  -o, --output <gif>        Output GIF
                            (default: src/renderer/assets/noobi-packs/fishing/four-ip-fishing.gif)
      --width <px>          Output width; aspect ratio is preserved
                            (default: source width capped at 960px)
      --frames <count>      Frames in the loop (default: 32)
      --fps <rate>          GIF playback rate (default: 8)
      --sprite-height <px>  Override all four normalized sprite-canvas heights
                            (default: platform-specific 108,104,104,110 at 960x640)
      --sprite-heights <px> Four comma-separated per-platform canvas heights
      --packs <a,b,c,d>     Four pack IDs (default: classic,twilight,hellokitty,starforge)
      --positions <points>  Four normalized butt/wood contact points as "x,y;x,y;x,y;x,y"
      --bobbers <points>    Four normalized bobber points in the same format
      --colors <count>      GIF palette size, 32-256 (default: 160)
      --ffmpeg <command>    ffmpeg executable or absolute path (default: ffmpeg)
      --dry-run             Validate inputs and print the resolved plan only
  -h, --help                Show this help

Examples:
  node scripts/render-fishing-gif.mjs
  node scripts/render-fishing-gif.mjs --width 720 --frames 12 --fps 6
  node scripts/render-fishing-gif.mjs --positions "0.18,.61;.40,.59;.60,.59;.82,.61"
`;

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const spritePaths = options.packs.map((packId) => ({
    packId,
    layout: join(
      REPOSITORY_ROOT,
      `src/renderer/assets/noobi-packs/fishing/frames/${packId}/sprite-layout.json`,
    ),
    frames: [
      join(
        REPOSITORY_ROOT,
        `src/renderer/assets/noobi-packs/fishing/frames/${packId}/sprite-fishing-a.png`,
      ),
      join(
        REPOSITORY_ROOT,
        `src/renderer/assets/noobi-packs/fishing/frames/${packId}/sprite-fishing-b.png`,
      ),
    ],
    fallbackHandAnchors: FISHING_HAND_ANCHORS[packId],
  }));

  const missingSprites = [];
  for (const sprite of spritePaths) {
    if (!(await fileExists(sprite.layout))) missingSprites.push(sprite.layout);
    for (const framePath of sprite.frames) {
      if (!(await fileExists(framePath))) missingSprites.push(framePath);
    }
  }
  if (missingSprites.length > 0) {
    throw new Error(`Missing sprite frames:\n${missingSprites.join('\n')}`);
  }

  await verifyFfmpeg(options.ffmpeg);
  const backgroundExists = await fileExists(options.background);

  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      dryRun: true,
      background: options.background,
      backgroundExists,
      output: options.output,
      width: options.width ?? 'min(source, 960)',
      frames: options.frames,
      fps: options.fps,
      packs: options.packs,
      positions: options.positions,
      facings: DEFAULT_PLATFORM_LAYOUTS.map(({ facing }) => facing),
      bobbers: options.bobbers,
      spriteHeight: options.spriteHeight,
      spriteHeights: options.spriteHeights
        ?? DEFAULT_PLATFORM_LAYOUTS.map((layout) => (
          `${Math.round(layout.spriteHeightRatio * 1000) / 10}% of output height`
        )),
      seatedFrames: true,
      clipping: false,
      colors: options.colors,
      ffmpeg: options.ffmpeg,
    }, null, 2)}\n`);
    return;
  }

  if (!backgroundExists) {
    throw new Error(
      `Background PNG does not exist: ${options.background}\n`
      + 'Generate or copy the scene there first, or pass --background <png>.',
    );
  }
  if (resolve(options.background) === resolve(options.output)) {
    throw new Error('The background and output paths must be different.');
  }

  const backgroundSource = decodePng(
    await readFile(options.background),
    `background ${options.background}`,
  );
  const outputWidth = options.width ?? Math.min(backgroundSource.width, 960);
  const outputHeight = Math.max(1, Math.round(
    backgroundSource.height * (outputWidth / backgroundSource.width),
  ));
  const spriteHeights = options.spriteHeights
    ?? (options.spriteHeight
      ? Array.from({ length: 4 }, () => options.spriteHeight)
      : DEFAULT_PLATFORM_LAYOUTS.map((layout) => Math.max(
        48,
        Math.round(outputHeight * layout.spriteHeightRatio),
      )));
  const sourceBackground = resizeNearest(backgroundSource, outputWidth, outputHeight);
  const waterRegions = buildWaterRegions(sourceBackground);
  const foliageRig = buildNativeFoliageRig(sourceBackground);
  const background = foliageRig.cleanPlate;
  const spriteSets = await Promise.all(spritePaths.map(async ({
    packId,
    layout,
    frames,
    fallbackHandAnchors,
  }) => {
    const decodedFrames = await Promise.all(frames.map(async (framePath) => decodePng(
      await readFile(framePath),
      `${packId} sprite ${framePath}`,
    )));
    if (decodedFrames.some((frame) => (
      frame.width !== decodedFrames[0].width || frame.height !== decodedFrames[0].height
    ))) throw new Error(`${packId} fishing frames do not share one normalized canvas.`);
    const spriteLayout = decodeSpriteLayout(
      await readFile(layout, 'utf8'),
      `${packId} sprite layout ${layout}`,
    );
    const frameAnchors = decodedFrames.map((frame, frameIndex) => resolveFrameAnchors({
      packId,
      frame,
      frameIndex,
      spriteLayout,
      fallbackHandAnchor: fallbackHandAnchors[frameIndex],
    }));
    return {
      packId,
      frames: decodedFrames,
      frameBounds: decodedFrames.map((frame) => alphaBounds(frame)),
      seatAnchors: frameAnchors.map(({ seatAnchor }) => seatAnchor),
      handAnchors: frameAnchors.map(({ handAnchor }) => handAnchor),
      sourceFacing: spriteLayout.canvas?.facing === -1
        ? -1
        : DEFAULT_SOURCE_FACING,
    };
  }));
  validateSpritePlacements({
    spriteSets,
    spriteHeights,
    positions: options.positions,
    bobbers: options.bobbers,
    outputWidth,
    outputHeight,
  });

  const frameDirectory = await mkdtemp(join(tmpdir(), 'noobi-fishing-gif-'));
  const temporaryOutput = join(
    dirname(options.output),
    `.${basename(options.output)}.${process.pid}.tmp.gif`,
  );

  try {
    await mkdir(dirname(options.output), { recursive: true });
    for (let frameIndex = 0; frameIndex < options.frames; frameIndex += 1) {
      const frame = renderFrame({
        background,
        foliageRig,
        waterRegions,
        spriteSets,
        frameIndex,
        frameCount: options.frames,
        spriteHeights,
        positions: options.positions,
        bobbers: options.bobbers,
      });
      const framePath = join(frameDirectory, `frame-${padFrame(frameIndex)}.png`);
      await writeFile(framePath, PNG.sync.write(frame, {
        colorType: 6,
        inputColorType: 6,
        bitDepth: 8,
        deflateLevel: 6,
      }));
    }

    await unlink(temporaryOutput).catch(() => undefined);
    await encodeGif({
      ffmpeg: options.ffmpeg,
      frameDirectory,
      output: temporaryOutput,
      fps: options.fps,
      colors: options.colors,
    });
    await rename(temporaryOutput, options.output);
  } finally {
    await rm(frameDirectory, { recursive: true, force: true });
    await unlink(temporaryOutput).catch(() => undefined);
  }

  process.stdout.write(
    `Rendered ${options.frames} frames at ${options.fps} fps: `
    + `${outputWidth}x${outputHeight} -> ${options.output}\n`
    + `Platform seat anchors: ${options.packs.map((packId, index) => {
      const anchor = normalizedPoint(options.positions[index], outputWidth, outputHeight);
      const facing = DEFAULT_PLATFORM_LAYOUTS[index].facing > 0 ? 'down-right' : 'down-left';
      return `${packId}@${anchor.x},${anchor.y}/${facing}/h${spriteHeights[index]}`;
    }).join(' | ')}\n`,
  );
}

function parseArguments(args) {
  const options = {
    background: DEFAULT_BACKGROUND,
    output: DEFAULT_OUTPUT,
    width: null,
    frames: 32,
    fps: 8,
    spriteHeight: null,
    spriteHeights: null,
    packs: [...DEFAULT_PACKS],
    positions: DEFAULT_POSITIONS.map((point) => ({ ...point })),
    bobbers: DEFAULT_BOBBERS.map((point) => ({ ...point })),
    colors: 160,
    ffmpeg: process.env.NOOBI_FFMPEG || 'ffmpeg',
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const [flag, inlineValue] = splitArgument(argument);
    const takeValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      const value = args[index];
      if (!value || value.startsWith('-')) throw new Error(`${flag} requires a value.`);
      return value;
    };

    switch (flag) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '-b':
      case '--background':
        options.background = resolve(process.cwd(), takeValue());
        break;
      case '-o':
      case '--output':
        options.output = resolve(process.cwd(), takeValue());
        break;
      case '--width':
        options.width = parseInteger(takeValue(), flag, 128, 4096);
        break;
      case '--frames':
        options.frames = parseInteger(takeValue(), flag, 4, 120);
        break;
      case '--fps':
        options.fps = parseInteger(takeValue(), flag, 1, 30);
        break;
      case '--sprite-height':
        options.spriteHeight = parseInteger(takeValue(), flag, 48, 2048);
        options.spriteHeights = null;
        break;
      case '--sprite-heights':
        options.spriteHeights = parseIntegerList(takeValue(), flag, 4, 48, 2048);
        options.spriteHeight = null;
        break;
      case '--colors':
        options.colors = parseInteger(takeValue(), flag, 32, 256);
        break;
      case '--ffmpeg':
        options.ffmpeg = takeValue();
        break;
      case '--packs':
        options.packs = parsePacks(takeValue());
        break;
      case '--positions':
        options.positions = parsePoints(takeValue(), flag);
        break;
      case '--bobbers':
        options.bobbers = parsePoints(takeValue(), flag);
        break;
      default:
        throw new Error(`Unknown option: ${argument}\n\n${HELP}`);
    }
  }

  return options;
}

function splitArgument(argument) {
  const separator = argument.indexOf('=');
  if (separator <= 0) return [argument, undefined];
  return [argument.slice(0, separator), argument.slice(separator + 1)];
}

function parseInteger(value, label, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function parseIntegerList(value, label, length, minimum, maximum) {
  const values = value.split(',').map((item) => parseInteger(
    item.trim(),
    label,
    minimum,
    maximum,
  ));
  if (values.length !== length) {
    throw new Error(`${label} requires exactly ${length} comma-separated integers.`);
  }
  return values;
}

function parsePacks(value) {
  const packs = value.split(',').map((pack) => pack.trim()).filter(Boolean);
  if (packs.length !== 4) throw new Error('--packs requires exactly four comma-separated IDs.');
  if (new Set(packs).size !== packs.length) throw new Error('--packs cannot contain duplicates.');
  const unknown = packs.filter((pack) => !KNOWN_PACKS.has(pack));
  if (unknown.length > 0) throw new Error(`Unknown Noobi pack: ${unknown.join(', ')}`);
  return packs;
}

function parsePoints(value, label) {
  const points = value.split(';').map((pair) => {
    const coordinates = pair.split(',').map((coordinate) => Number(coordinate.trim()));
    if (coordinates.length !== 2 || coordinates.some((coordinate) => (
      !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1
    ))) {
      throw new Error(`${label} points must be normalized x,y pairs from 0 to 1.`);
    }
    return { x: coordinates[0], y: coordinates[1] };
  });
  if (points.length !== 4) throw new Error(`${label} requires exactly four points.`);
  return points;
}

function decodePng(bytes, label) {
  try {
    return PNG.sync.read(bytes);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to decode ${label}: ${reason}`);
  }
}

function decodeSpriteLayout(text, label) {
  try {
    const layout = JSON.parse(text);
    if (!Array.isArray(layout.frames) || layout.frames.length !== 2) {
      throw new Error('expected exactly two frame entries');
    }
    return layout;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to decode ${label}: ${reason}`);
  }
}

function resolveFrameAnchors({
  packId,
  frame,
  frameIndex,
  spriteLayout,
  fallbackHandAnchor,
}) {
  const frameLayout = spriteLayout.frames[frameIndex];
  const seatAnchor = resolveSourcePoint(
    frameLayout.seatPivot
      ?? frameLayout.seatAnchor
      ?? spriteLayout.canvas?.seatPivot,
    frame,
    `${packId} frame ${frameIndex} seatPivot`,
  );
  const handAnchor = frameLayout.handAnchor
    ? resolveSourcePoint(
      frameLayout.handAnchor,
      frame,
      `${packId} frame ${frameIndex} handAnchor`,
    )
    : {
      x: fallbackHandAnchor.x * (frame.width - 1),
      y: fallbackHandAnchor.y * (frame.height - 1),
    };
  return { seatAnchor, handAnchor };
}

function resolveSourcePoint(point, frame, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < 0 || point.x > frame.width - 1
    || point.y < 0 || point.y > frame.height) {
    throw new Error(
      `${label} must be a source-pixel x,y point inside the ${frame.width}x${frame.height} canvas.`,
    );
  }
  return { x: point.x, y: point.y };
}

function resizeNearest(source, width, height) {
  if (source.width === width && source.height === height) return source;
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

function buildWaterRegions(background) {
  const codes = new Uint8Array(background.width * background.height);
  const scaleToReferenceX = REFERENCE_SCENE.width / background.width;
  const scaleToReferenceY = REFERENCE_SCENE.height / background.height;

  for (let y = 0; y < background.height; y += 1) {
    const referenceY = (y + 0.5) * scaleToReferenceY;
    for (let x = 0; x < background.width; x += 1) {
      if (!isWaterPixel(background, x, y)) continue;
      const referenceX = (x + 0.5) * scaleToReferenceX;
      let code = WATER_REGION.NONE;
      if (pointInCoordinatePolygon(referenceX, referenceY, REFERENCE_WATER_REGIONS.fall)) {
        code = WATER_REGION.FALL;
      } else if (pointInCoordinatePolygon(
        referenceX,
        referenceY,
        REFERENCE_WATER_REGIONS.upstream,
      )) {
        code = WATER_REGION.UPSTREAM;
      } else if (referenceY < 365 && pointInReferenceTube(
        referenceX,
        referenceY,
        REFERENCE_WATER_REGIONS.stream,
      )) {
        code = WATER_REGION.STREAM;
      } else if (referenceY >= interpolateReferenceY(
        REFERENCE_WATER_REGIONS.pondShore,
        referenceX,
      ) - 3) {
        code = WATER_REGION.POND;
      }
      codes[(y * background.width) + x] = code;
    }
  }
  return { width: background.width, height: background.height, codes };
}

function pointInCoordinatePolygon(x, y, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1) {
    const [currentX, currentY] = polygon[index];
    const [previousX, previousY] = polygon[previous];
    const crosses = ((currentY > y) !== (previousY > y))
      && (x < ((previousX - currentX) * (y - currentY)
        / (previousY - currentY)) + currentX);
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInReferenceTube(x, y, points) {
  for (let index = 1; index < points.length; index += 1) {
    const [startX, startY, startRadius] = points[index - 1];
    const [endX, endY, endRadius] = points[index];
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const lengthSquared = (deltaX * deltaX) + (deltaY * deltaY);
    const progress = Math.max(0, Math.min(1,
      (((x - startX) * deltaX) + ((y - startY) * deltaY)) / lengthSquared,
    ));
    const closestX = startX + (deltaX * progress);
    const closestY = startY + (deltaY * progress);
    const radius = startRadius + ((endRadius - startRadius) * progress);
    if (Math.hypot(x - closestX, y - closestY) <= radius) return true;
  }
  return false;
}

function interpolateReferenceY(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [startX, startY] = points[index - 1];
    const [endX, endY] = points[index];
    if (x > endX) continue;
    const progress = (x - startX) / Math.max(1, endX - startX);
    return startY + ((endY - startY) * progress);
  }
  return points.at(-1)[1];
}

function waterRegionAt(regions, x, y) {
  const targetX = Math.round(x);
  const targetY = Math.round(y);
  if (targetX < 0 || targetY < 0 || targetX >= regions.width || targetY >= regions.height) {
    return WATER_REGION.NONE;
  }
  return regions.codes[(targetY * regions.width) + targetX];
}

function drawPondFish(target, regions, frameIndex, frameCount, unit) {
  const loop = (frameIndex / frameCount) * Math.PI * 2;
  const scaleX = target.width / REFERENCE_SCENE.width;
  const scaleY = target.height / REFERENCE_SCENE.height;
  for (let fishIndex = 0; fishIndex < POND_FISH.length; fishIndex += 1) {
    const fish = POND_FISH[fishIndex];
    const q = (fish.direction * loop) + fish.phase;
    const doubleQ = q * 2;
    const center = {
      x: (fish.center[0]
        + (fish.radius[0] * Math.cos(q))
        + (fish.perturb[0] * Math.sin(doubleQ))) * scaleX,
      y: (fish.center[1]
        + (fish.radius[1] * Math.sin(q))
        + (fish.perturb[1] * Math.cos(doubleQ))) * scaleY,
    };
    const tangent = {
      x: fish.direction * (
        (-fish.radius[0] * Math.sin(q)) + (2 * fish.perturb[0] * Math.cos(doubleQ))
      ) * scaleX,
      y: fish.direction * (
        (fish.radius[1] * Math.cos(q)) - (2 * fish.perturb[1] * Math.sin(doubleQ))
      ) * scaleY,
    };
    const tangentLength = Math.max(1, Math.hypot(tangent.x, tangent.y));
    const forward = { x: tangent.x / tangentLength, y: tangent.y / tangentLength };
    const side = { x: -forward.y, y: forward.x };
    const tailSway = fish.tail[0] * scaleY * Math.sin(
      ((fish.tail[1] * frameIndex / frameCount) * Math.PI * 2) + fish.tail[2],
    );
    drawPixelFish(
      target,
      regions,
      center,
      forward,
      side,
      Math.max(unit * 5, fish.size[0] * scaleX),
      Math.max(unit * 3, fish.size[1] * scaleY),
      tailSway,
      fish.body,
      fish.accent,
      unit,
    );
    drawFishBubbles(
      target,
      regions,
      fish,
      frameIndex,
      frameCount,
      scaleX,
      scaleY,
      unit,
    );
  }
}

function drawPixelFish(
  target,
  regions,
  center,
  forward,
  side,
  bodyLength,
  bodyHeight,
  tailSway,
  bodyColor,
  accentColor,
  unit,
) {
  const radius = Math.ceil((bodyLength * 0.72) + bodyHeight + Math.abs(tailSway));
  const bodyRadiusX = bodyLength * 0.43;
  const bodyRadiusY = bodyHeight * 0.5;
  for (let y = Math.floor(center.y - radius); y <= Math.ceil(center.y + radius); y += unit) {
    for (let x = Math.floor(center.x - radius); x <= Math.ceil(center.x + radius); x += unit) {
      const deltaX = x - center.x;
      const deltaY = y - center.y;
      const along = (deltaX * forward.x) + (deltaY * forward.y);
      const across = (deltaX * side.x) + (deltaY * side.y);
      const normalized = ((along / bodyRadiusX) ** 2) + ((across / bodyRadiusY) ** 2);
      if (normalized > 1) continue;
      const color = along > bodyLength * 0.02 && Math.abs(across) < bodyHeight * 0.16
        ? accentColor
        : bodyColor;
      blendWaterSquare(target, regions, x, y, unit, color, WATER_REGION.POND);
    }
  }

  const tailBase = {
    x: center.x - (forward.x * bodyLength * 0.34),
    y: center.y - (forward.y * bodyLength * 0.34),
  };
  const tailTip = {
    x: center.x - (forward.x * bodyLength * 0.68) + (side.x * tailSway),
    y: center.y - (forward.y * bodyLength * 0.68) + (side.y * tailSway),
  };
  fillWaterPolygon(target, regions, [
    {
      x: tailBase.x + (side.x * bodyHeight * 0.42),
      y: tailBase.y + (side.y * bodyHeight * 0.42),
    },
    tailTip,
    {
      x: tailBase.x - (side.x * bodyHeight * 0.42),
      y: tailBase.y - (side.y * bodyHeight * 0.42),
    },
  ], bodyColor, WATER_REGION.POND, unit);

  const eye = {
    x: center.x + (forward.x * bodyLength * 0.27) - (side.x * bodyHeight * 0.14),
    y: center.y + (forward.y * bodyLength * 0.27) - (side.y * bodyHeight * 0.14),
  };
  blendWaterSquare(target, regions, eye.x, eye.y, unit, [25, 72, 74, 145], WATER_REGION.POND);
}

function drawFishBubbles(
  target,
  regions,
  fish,
  frameIndex,
  frameCount,
  scaleX,
  scaleY,
  unit,
) {
  if (fish.bubbleStart === null) return;
  const start = Math.round((fish.bubbleStart / 32) * frameCount) % frameCount;
  const age = modulo(frameIndex - start, frameCount);
  const visibleFrames = Math.max(2, Math.round((7 / 32) * frameCount));
  if (age >= visibleFrames) return;
  const emissionQ = fish.direction * ((start / frameCount) * Math.PI * 2) + fish.phase;
  const emissionDoubleQ = emissionQ * 2;
  const origin = {
    x: (fish.center[0] + (fish.radius[0] * Math.cos(emissionQ))
      + (fish.perturb[0] * Math.sin(emissionDoubleQ))) * scaleX,
    y: (fish.center[1] + (fish.radius[1] * Math.sin(emissionQ))
      + (fish.perturb[1] * Math.cos(emissionDoubleQ))) * scaleY,
  };
  const fade = 1 - (age / visibleFrames);
  for (let bubble = 0; bubble < 2; bubble += 1) {
    const bubbleAge = age - (bubble * Math.max(1, Math.round(frameCount * 0.09)));
    if (bubbleAge < 0) continue;
    const x = origin.x + (Math.sin((bubbleAge + bubble) * Math.PI / 3) * unit * 2);
    const y = origin.y - (bubbleAge * unit * 1.25) - (bubble * unit * 2);
    blendWaterSquare(
      target,
      regions,
      x,
      y,
      bubble === 0 ? unit : Math.max(1, unit - 1),
      [183, 232, 222, Math.round(112 * fade)],
      WATER_REGION.POND,
    );
  }
}

function drawAmbientWater(target, regions, frameIndex, frameCount, unit) {
  drawPondCaustics(target, regions, frameIndex, frameCount, unit);
  drawUpstreamCurrent(target, regions, frameIndex, frameCount, unit);
  drawStreamCurrent(target, regions, frameIndex, frameCount, unit);
  drawWaterfallCurrent(target, regions, frameIndex, frameCount, unit);
  drawAmbientRipples(target, regions, frameIndex, frameCount, unit);
}

function drawPondCaustics(target, regions, frameIndex, frameCount, unit) {
  const cell = Math.max(2, unit * 2);
  const step = Math.floor((frameIndex * 16) / frameCount);
  for (let y = 0; y < target.height; y += cell) {
    for (let x = 0; x < target.width; x += cell) {
      if (waterRegionAt(regions, x, y) !== WATER_REGION.POND) continue;
      const cellX = Math.floor(x / cell);
      const cellY = Math.floor(y / cell);
      const pattern = modulo(cellX + (2 * cellY) - step, 16);
      const hash = deterministicHash(cellX, cellY);
      if (pattern === 0 && hash % 7 < 3) {
        blendWaterSquare(
          target,
          regions,
          x,
          y,
          cell,
          [106, 215, 201, 34],
          WATER_REGION.POND,
        );
      } else if (pattern === 8 && hash % 11 === 0) {
        blendWaterSquare(
          target,
          regions,
          x,
          y,
          cell,
          [29, 105, 151, 22],
          WATER_REGION.POND,
        );
      }
    }
  }
}

function drawUpstreamCurrent(target, regions, frameIndex, frameCount, unit) {
  const cell = Math.max(2, unit * 2);
  const step = Math.floor((frameIndex * 16) / frameCount);
  for (let y = 0; y < target.height; y += cell) {
    for (let x = 0; x < target.width; x += cell) {
      if (waterRegionAt(regions, x, y) !== WATER_REGION.UPSTREAM) continue;
      const cellX = Math.floor(x / cell);
      const cellY = Math.floor(y / cell);
      const pattern = modulo(cellY - step + ((deterministicHash(cellX, 7) % 5) * 3), 16);
      if (pattern === 0) {
        blendWaterSquare(
          target,
          regions,
          x,
          y,
          cell,
          [178, 222, 231, 42],
          WATER_REGION.UPSTREAM,
        );
      } else if (pattern === 8) {
        blendWaterSquare(
          target,
          regions,
          x,
          y,
          cell,
          [32, 99, 150, 23],
          WATER_REGION.UPSTREAM,
        );
      }
    }
  }
}

function drawWaterfallCurrent(target, regions, frameIndex, frameCount, unit) {
  const referenceScaleX = target.width / REFERENCE_SCENE.width;
  const referenceScaleY = target.height / REFERENCE_SCENE.height;
  const laneWidth = Math.max(unit * 4, 2);
  const period = Math.max(unit * 64, Math.round(128 * referenceScaleY));
  const travel = (frameIndex / frameCount) * period;
  const left = Math.round(105 * referenceScaleX);
  const right = Math.round(218 * referenceScaleX);
  const top = Math.round(42 * referenceScaleY);
  const bottom = Math.round(181 * referenceScaleY);
  for (let x = left; x <= right; x += laneWidth) {
    const lane = Math.floor((x - left) / laneWidth);
    for (let y = top; y <= bottom; y += unit) {
      if (waterRegionAt(regions, x, y) !== WATER_REGION.FALL) continue;
      const pattern = modulo((y - top) - travel + (lane * 11 * unit), period);
      if (pattern < unit * 3) {
        blendWaterRect(
          target,
          regions,
          x,
          y,
          laneWidth,
          unit * 2,
          [224, 248, 252, 78],
          WATER_REGION.FALL,
        );
      } else if (pattern >= period / 2 && pattern < (period / 2) + (unit * 2)) {
        blendWaterRect(
          target,
          regions,
          x,
          y,
          laneWidth,
          unit * 2,
          [48, 143, 180, 38],
          WATER_REGION.FALL,
        );
      }
    }
  }

  for (let ring = 0; ring < 2; ring += 1) {
    const progress = modulo(frameIndex + (ring * frameCount / 2), frameCount) / frameCount;
    drawMaskedEllipse(
      target,
      regions,
      Math.round(165 * referenceScaleX),
      Math.round(171 * referenceScaleY),
      (18 + (30 * progress)) * referenceScaleX,
      (4 + (7 * progress)) * referenceScaleY,
      [226, 250, 246, Math.round((Math.sin(Math.PI * progress) ** 2) * 96)],
      WATER_REGION.FALL,
      Math.max(1, unit),
    );
  }
}

function drawStreamCurrent(target, regions, frameIndex, frameCount, unit) {
  const scaleX = target.width / REFERENCE_SCENE.width;
  const scaleY = target.height / REFERENCE_SCENE.height;
  const path = REFERENCE_WATER_REGIONS.stream.map(([x, y]) => ({
    x: x * scaleX,
    y: y * scaleY,
  }));
  const metrics = polylineMetrics(path);
  const spacing = Math.max(unit * 24, 64 * scaleX);
  const travel = (frameIndex / frameCount) * spacing;
  const markerCount = Math.ceil(metrics.length / spacing) + 1;
  for (let train = 0; train < 2; train += 1) {
    const offset = train * spacing * 0.5;
    for (let marker = -1; marker < markerCount; marker += 1) {
      const distance = modulo((marker * spacing) + travel + offset, metrics.length);
      const point = pointAlongPolyline(path, metrics, distance);
      const edgeDistance = Math.min(distance, metrics.length - distance);
      const edgeFade = Math.min(1, edgeDistance / Math.max(unit * 12, spacing * 0.28));
      if (edgeFade <= 0) continue;
      const dashLength = (train === 0 ? unit * 7 : unit * 5);
      const start = {
        x: point.x - (point.tangent.x * dashLength * 0.5),
        y: point.y - (point.tangent.y * dashLength * 0.5),
      };
      const end = {
        x: point.x + (point.tangent.x * dashLength * 0.5),
        y: point.y + (point.tangent.y * dashLength * 0.5),
      };
      drawMaskedLine(
        target,
        regions,
        start,
        end,
        [178, 231, 225, Math.round((train === 0 ? 78 : 48) * edgeFade)],
        WATER_REGION.STREAM,
        Math.max(1, unit),
      );
    }
  }
}

function drawAmbientRipples(target, regions, frameIndex, frameCount, unit) {
  const scaleX = target.width / REFERENCE_SCENE.width;
  const scaleY = target.height / REFERENCE_SCENE.height;
  for (const [referenceX, referenceY, phase] of AMBIENT_RIPPLES) {
    for (let ring = 0; ring < 2; ring += 1) {
      const progress = modulo(
        frameIndex + Math.round((phase / 32) * frameCount) + (ring * frameCount / 2),
        frameCount,
      ) / frameCount;
      drawMaskedEllipse(
        target,
        regions,
        referenceX * scaleX,
        referenceY * scaleY,
        (6 + (24 * progress)) * scaleX,
        (2 + (6 * progress)) * scaleY,
        [190, 238, 225, Math.round((Math.sin(Math.PI * progress) ** 2) * 58)],
        WATER_REGION.POND,
        Math.max(1, unit),
      );
    }
  }
}

function polylineMetrics(points) {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    ));
  }
  return { cumulative, length: cumulative.at(-1) };
}

function pointAlongPolyline(points, metrics, distance) {
  for (let index = 1; index < points.length; index += 1) {
    if (distance > metrics.cumulative[index]) continue;
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = metrics.cumulative[index] - metrics.cumulative[index - 1];
    const progress = (distance - metrics.cumulative[index - 1]) / Math.max(1, segmentLength);
    const tangentLength = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
    return {
      x: start.x + ((end.x - start.x) * progress),
      y: start.y + ((end.y - start.y) * progress),
      tangent: {
        x: (end.x - start.x) / tangentLength,
        y: (end.y - start.y) / tangentLength,
      },
    };
  }
  return { ...points.at(-1), tangent: { x: 1, y: 0 } };
}

function blendWaterSquare(target, regions, centerX, centerY, size, color, region) {
  const integerSize = Math.max(1, Math.round(size));
  blendWaterRect(
    target,
    regions,
    Math.round(centerX - ((integerSize - 1) / 2)),
    Math.round(centerY - ((integerSize - 1) / 2)),
    integerSize,
    integerSize,
    color,
    region,
  );
}

function blendWaterRect(target, regions, x, y, width, height, color, region) {
  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const right = Math.min(target.width, Math.round(x + width));
  const bottom = Math.min(target.height, Math.round(y + height));
  for (let targetY = top; targetY < bottom; targetY += 1) {
    for (let targetX = left; targetX < right; targetX += 1) {
      if (waterRegionAt(regions, targetX, targetY) !== region) continue;
      blendPixel(target, targetX, targetY, color);
    }
  }
}

function fillWaterPolygon(target, regions, polygon, color, region, unit) {
  const left = Math.floor(Math.min(...polygon.map(({ x }) => x)));
  const right = Math.ceil(Math.max(...polygon.map(({ x }) => x)));
  const top = Math.floor(Math.min(...polygon.map(({ y }) => y)));
  const bottom = Math.ceil(Math.max(...polygon.map(({ y }) => y)));
  for (let y = top; y <= bottom; y += unit) {
    for (let x = left; x <= right; x += unit) {
      if (!pointInPolygon(x, y, polygon)) continue;
      blendWaterSquare(target, regions, x, y, unit, color, region);
    }
  }
}

function drawMaskedLine(target, regions, start, end, color, region, thickness) {
  const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y)));
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    blendWaterSquare(
      target,
      regions,
      start.x + ((end.x - start.x) * progress),
      start.y + ((end.y - start.y) * progress),
      thickness,
      color,
      region,
    );
  }
}

function drawMaskedEllipse(
  target,
  regions,
  centerX,
  centerY,
  radiusX,
  radiusY,
  color,
  region,
  thickness,
) {
  const segments = Math.max(16, Math.ceil(Math.PI * Math.max(radiusX, radiusY)));
  let previous = { x: centerX + radiusX, y: centerY };
  for (let segment = 1; segment <= segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    const point = {
      x: centerX + (Math.cos(angle) * radiusX),
      y: centerY + (Math.sin(angle) * radiusY),
    };
    drawMaskedLine(target, regions, previous, point, color, region, thickness);
    previous = point;
  }
}

function deterministicHash(x, y) {
  let value = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b);
  value ^= Math.imul((y | 0) ^ 0xc2b2ae35, 0x27d4eb2f);
  value ^= value >>> 15;
  return value >>> 0;
}

function buildNativeFoliageRig(source) {
  const scaleX = source.width / REFERENCE_SCENE.width;
  const scaleY = source.height / REFERENCE_SCENE.height;
  const rootLock = Math.max(1, Math.round(source.width / REFERENCE_SCENE.width) * 2);
  const clusters = NATIVE_FOLIAGE_CLUSTERS.map((definition) => {
    const [referenceX, referenceY, referenceWidth, referenceHeight] = definition.rect;
    const rectangle = {
      left: Math.max(0, Math.round(referenceX * scaleX)),
      top: Math.max(0, Math.round(referenceY * scaleY)),
      right: Math.min(source.width, Math.round((referenceX + referenceWidth) * scaleX)),
      bottom: Math.min(source.height, Math.round((referenceY + referenceHeight) * scaleY)),
    };
    const guard = (definition.guard ?? [
      [referenceX, referenceY],
      [referenceX + referenceWidth, referenceY],
      [referenceX + referenceWidth, referenceY + referenceHeight],
      [referenceX, referenceY + referenceHeight],
    ]).map(([x, y]) => ({ x: x * scaleX, y: y * scaleY }));
    const cluster = {
      ...definition,
      rectangle,
      guard,
      root: { x: definition.root[0] * scaleX, y: definition.root[1] * scaleY },
      topY: definition.topY * scaleY,
      amplitude: Math.max(1, definition.amplitude * scaleX),
      greenSeeds: scaleSeeds(definition.greenSeeds, scaleX, scaleY),
      brownSeeds: scaleSeeds(definition.brownSeeds, scaleX, scaleY),
      flowerSeeds: scaleSeeds(definition.flowerSeeds, scaleX, scaleY),
      mobileMask: new Uint8Array(source.width * source.height),
    };
    const classes = classifyNativeFoliage(source, cluster);
    let greenMask = floodNativeClass(
      classes.greenCore,
      cluster.greenSeeds,
      rectangle,
      source.width,
      source.height,
    );
    greenMask = geodesicGrowMask(
      greenMask,
      classes.greenWide,
      rectangle,
      source.width,
      2,
    );
    const brownMask = definition.includeBrown
      ? floodNativeClass(
        classes.brown,
        cluster.brownSeeds,
        rectangle,
        source.width,
        source.height,
      )
      : new Uint8Array(source.width * source.height);
    const flowerMask = definition.includeFlowers
      ? floodNativeClass(
        classes.flower,
        cluster.flowerSeeds,
        rectangle,
        source.width,
        source.height,
      )
      : new Uint8Array(source.width * source.height);

    const combined = combineNativeMasks(greenMask, brownMask, flowerMask);
    const closed = colorConstrainedNativeClose(
      combined,
      source,
      cluster,
      source.width,
    );
    for (let y = rectangle.top; y < rectangle.bottom; y += 1) {
      for (let x = rectangle.left; x < rectangle.right; x += 1) {
        const index = (y * source.width) + x;
        if (!closed[index] || y >= cluster.root.y - rootLock) continue;
        cluster.mobileMask[index] = 1;
      }
    }
    return cluster;
  });

  const unionMask = new Uint8Array(source.width * source.height);
  for (const cluster of clusters) {
    for (let index = 0; index < cluster.mobileMask.length; index += 1) {
      if (cluster.mobileMask[index]) unionMask[index] = 1;
    }
  }
  const cleanPlate = clonePng(source);
  inpaintNativeFoliage(cleanPlate, source, unionMask);
  return { source, cleanPlate, clusters, unionMask };
}

function clonePng(source) {
  const clone = new PNG({ width: source.width, height: source.height, colorType: 6 });
  source.data.copy(clone.data);
  return clone;
}

function scaleSeeds(seeds = [], scaleX, scaleY) {
  return seeds.map(([x, y]) => ({ x: Math.round(x * scaleX), y: Math.round(y * scaleY) }));
}

function classifyNativeFoliage(source, cluster) {
  const length = source.width * source.height;
  const greenCore = new Uint8Array(length);
  const greenWide = new Uint8Array(length);
  const brown = new Uint8Array(length);
  const flower = new Uint8Array(length);
  const { rectangle } = cluster;

  for (let y = rectangle.top; y < rectangle.bottom; y += 1) {
    const rowValues = [];
    for (let offset = 0; offset < 4; offset += 1) {
      for (const x of [rectangle.left + offset, rectangle.right - 1 - offset]) {
        if (x < rectangle.left || x >= rectangle.right) continue;
        rowValues.push(nativePixelHsv(source, x, y).value * 255);
      }
    }
    const backgroundValue = median(rowValues);
    for (let x = rectangle.left; x < rectangle.right; x += 1) {
      if (!pointInPolygon(x, y, cluster.guard)) continue;
      const index = (y * source.width) + x;
      const hsv = nativePixelHsv(source, x, y);
      const isGreen = hsv.hue >= 92 && hsv.hue <= 165
        && hsv.saturation >= 0.36 && hsv.value >= 0.18 && hsv.value <= 0.78;
      greenWide[index] = isGreen ? 1 : 0;
      greenCore[index] = isGreen && (
        cluster.terrain === 'water-edge' || (hsv.value * 255) <= backgroundValue - 10
      ) ? 1 : 0;
      brown[index] = hsv.hue >= 12 && hsv.hue <= 46
        && hsv.saturation >= 0.22 && hsv.saturation <= 0.82
        && hsv.value >= 0.18 && hsv.value <= 0.63 ? 1 : 0;
      const whitePetal = hsv.saturation <= 0.2 && hsv.value >= 0.7;
      const yellowCenter = hsv.hue >= 42 && hsv.hue <= 78
        && hsv.saturation >= 0.3 && hsv.value >= 0.5;
      flower[index] = whitePetal || yellowCenter ? 1 : 0;
    }
  }
  return { greenCore, greenWide, brown, flower };
}

function nativePixelHsv(source, x, y) {
  const offset = ((y * source.width) + x) * 4;
  const red = source.data[offset] / 255;
  const green = source.data[offset + 1] / 255;
  const blue = source.data[offset + 2] / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = 60 * modulo((green - blue) / delta, 6);
    else if (maximum === green) hue = 60 * (((blue - red) / delta) + 2);
    else hue = 60 * (((red - green) / delta) + 4);
  }
  return {
    hue,
    saturation: maximum === 0 ? 0 : delta / maximum,
    value: maximum,
  };
}

function floodNativeClass(candidate, seeds, rectangle, width, height) {
  const mask = new Uint8Array(width * height);
  const queue = [];
  for (const seed of seeds) {
    const nearest = nearestNativeCandidate(candidate, seed, rectangle, width, height);
    if (!nearest) continue;
    const index = (nearest.y * width) + nearest.x;
    if (mask[index]) continue;
    mask[index] = 1;
    queue.push(nearest);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const point = queue[cursor];
    for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
      for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
        if (deltaX === 0 && deltaY === 0) continue;
        const x = point.x + deltaX;
        const y = point.y + deltaY;
        if (x < rectangle.left || x >= rectangle.right
          || y < rectangle.top || y >= rectangle.bottom) continue;
        const index = (y * width) + x;
        if (!candidate[index] || mask[index]) continue;
        mask[index] = 1;
        queue.push({ x, y });
      }
    }
  }
  return mask;
}

function nearestNativeCandidate(candidate, seed, rectangle, width, height) {
  for (let radius = 0; radius <= 7; radius += 1) {
    for (let y = seed.y - radius; y <= seed.y + radius; y += 1) {
      for (let x = seed.x - radius; x <= seed.x + radius; x += 1) {
        if (x < rectangle.left || x >= rectangle.right
          || y < rectangle.top || y >= rectangle.bottom
          || x < 0 || y < 0 || x >= width || y >= height) continue;
        if (candidate[(y * width) + x]) return { x, y };
      }
    }
  }
  return null;
}

function geodesicGrowMask(mask, allowed, rectangle, width, passes) {
  let current = mask;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let y = rectangle.top; y < rectangle.bottom; y += 1) {
      for (let x = rectangle.left; x < rectangle.right; x += 1) {
        const index = (y * width) + x;
        if (current[index] || !allowed[index]) continue;
        if (hasNativeMaskNeighbor(current, x, y, width)) next[index] = 1;
      }
    }
    current = next;
  }
  return current;
}

function hasNativeMaskNeighbor(mask, x, y, width) {
  for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
      if (deltaX === 0 && deltaY === 0) continue;
      const candidateX = x + deltaX;
      const candidateY = y + deltaY;
      if (candidateX < 0 || candidateY < 0 || candidateX >= width) continue;
      const index = (candidateY * width) + candidateX;
      if (index >= 0 && index < mask.length && mask[index]) return true;
    }
  }
  return false;
}

function combineNativeMasks(...masks) {
  const combined = new Uint8Array(masks[0].length);
  for (const mask of masks) {
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index]) combined[index] = 1;
    }
  }
  return combined;
}

function colorConstrainedNativeClose(mask, source, cluster, width) {
  const closed = mask.slice();
  const { rectangle } = cluster;
  for (let y = rectangle.top; y < rectangle.bottom; y += 1) {
    for (let x = rectangle.left; x < rectangle.right; x += 1) {
      const index = (y * width) + x;
      if (mask[index] || !pointInPolygon(x, y, cluster.guard)) continue;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          const neighborX = x + deltaX;
          const neighborY = y + deltaY;
          if (neighborX < 0 || neighborY < 0
            || neighborX >= source.width || neighborY >= source.height) continue;
          const neighborIndex = (neighborY * width) + neighborX;
          if (!mask[neighborIndex]) continue;
          bestDistance = Math.min(bestDistance, nativeColorDistance(
            source,
            x,
            y,
            neighborX,
            neighborY,
          ));
        }
      }
      if (bestDistance <= 72) closed[index] = 1;
    }
  }
  return closed;
}

function nativeColorDistance(source, x1, y1, x2, y2) {
  const first = ((y1 * source.width) + x1) * 4;
  const second = ((y2 * source.width) + x2) * 4;
  return Math.hypot(
    source.data[first] - source.data[second],
    source.data[first + 1] - source.data[second + 1],
    source.data[first + 2] - source.data[second + 2],
  );
}

function inpaintNativeFoliage(cleanPlate, source, mask) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const index = (y * source.width) + x;
      if (!mask[index]) continue;
      const donor = findNativeInpaintDonor(mask, x, y, source.width, source.height);
      if (!donor) continue;
      copyPngPixel(source, donor.x, donor.y, cleanPlate, x, y);
    }
  }
}

function findNativeInpaintDonor(mask, x, y, width, height) {
  const preferLeft = deterministicHash(x, y) % 2 === 0;
  for (let radius = 1; radius <= 24; radius += 1) {
    const horizontal = preferLeft ? [x - radius, x + radius] : [x + radius, x - radius];
    for (const candidateX of horizontal) {
      if (candidateX < 0 || candidateX >= width) continue;
      if (!mask[(y * width) + candidateX]) return { x: candidateX, y };
    }
  }
  for (let radius = 1; radius <= 24; radius += 1) {
    for (const candidateY of [y - radius, y + radius]) {
      if (candidateY < 0 || candidateY >= height) continue;
      if (!mask[(candidateY * width) + x]) return { x, y: candidateY };
    }
  }
  return null;
}

function drawNativeFoliage(target, rig, frameIndex, frameCount, unit) {
  const theta = (frameIndex / frameCount) * Math.PI * 2;
  const grid = Math.max(1, Math.round(target.width / REFERENCE_SCENE.width));
  for (const cluster of rig.clusters) {
    const referenceRootX = cluster.root.x * (REFERENCE_SCENE.width / target.width);
    const wave = (0.72 * Math.sin(theta - (referenceRootX / 170) + cluster.phase))
      + (0.28 * Math.sin((2 * theta) - (referenceRootX / 93) + cluster.phase + 0.65));
    const maximumSway = quantizePixel(cluster.amplitude * wave, grid);
    const height = Math.max(1, cluster.root.y - cluster.topY);
    for (let y = cluster.rectangle.top; y < cluster.rectangle.bottom; y += 1) {
      const normalizedHeight = Math.max(0, Math.min(1, (cluster.root.y - y) / height));
      const bend = normalizedHeight <= 0.18
        ? 0
        : ((normalizedHeight - 0.18) / 0.82) ** 1.7;
      const offsetX = quantizePixel(maximumSway * bend, grid);
      for (let x = cluster.rectangle.left; x < cluster.rectangle.right; x += 1) {
        const index = (y * rig.source.width) + x;
        if (!cluster.mobileMask[index]) continue;
        copyPngPixel(rig.source, x, y, target, x + offsetX, y);
      }
    }
  }
}

function copyPngPixel(source, sourceX, sourceY, target, targetX, targetY) {
  const x = Math.round(targetX);
  const y = Math.round(targetY);
  if (sourceX < 0 || sourceY < 0 || sourceX >= source.width || sourceY >= source.height
    || x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const sourceOffset = ((sourceY * source.width) + sourceX) * 4;
  const targetOffset = ((y * target.width) + x) * 4;
  source.data.copy(target.data, targetOffset, sourceOffset, sourceOffset + 4);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function quantizePixel(value, unit) {
  return Math.round(value / Math.max(1, unit)) * Math.max(1, unit);
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function renderFrame({
  background,
  foliageRig,
  waterRegions,
  spriteSets,
  frameIndex,
  frameCount,
  spriteHeights,
  positions,
  bobbers,
}) {
  const frame = new PNG({
    width: background.width,
    height: background.height,
    colorType: 6,
  });
  background.data.copy(frame.data);

  const time = frameIndex / frameCount;
  const pixelUnit = Math.max(1, Math.round(frame.width / 480));
  drawPondFish(frame, waterRegions, frameIndex, frameCount, pixelUnit);
  drawAmbientWater(frame, waterRegions, frameIndex, frameCount, pixelUnit);
  drawNativeFoliage(frame, foliageRig, frameIndex, frameCount, pixelUnit);
  const geometries = spriteSets.map((spriteSet, actorIndex) => {
    const phase = actorIndex / spriteSets.length;
    const theta = (time + phase) * Math.PI * 2;
    const pivot = normalizedPoint(positions[actorIndex], frame.width, frame.height);
    const stillBobber = normalizedPoint(bobbers[actorIndex], frame.width, frame.height);
    const bobberBob = Math.round(Math.sin(theta + 0.8) * pixelUnit * 1.5);
    const facing = DEFAULT_PLATFORM_LAYOUTS[actorIndex].facing;
    const sequenceFrame = Math.floor((time * 4) + (phase * 4)) % 2;
    const sprite = spriteSet.frames[sequenceFrame];
    const flipHorizontally = facing !== spriteSet.sourceFacing;
    const sourceSeatAnchor = orientSourcePoint(
      spriteSet.seatAnchors[sequenceFrame],
      sprite,
      flipHorizontally,
    );
    const placement = spritePlacement(
      sprite,
      sourceSeatAnchor,
      pivot,
      spriteHeights[actorIndex],
    );
    const sourceBounds = spriteSet.frameBounds[sequenceFrame];
    const worldBounds = scaledAlphaBounds(
      sprite,
      sourceBounds,
      placement,
      flipHorizontally,
    );
    const sourceHandAnchor = orientSourcePoint(
      spriteSet.handAnchors[sequenceFrame],
      sprite,
      flipHorizontally,
    );
    const hand = placedSourcePoint(sprite, sourceHandAnchor, placement);
    const rodReach = Math.max(32, Math.round(frame.width * 0.085));
    const rodLift = Math.max(28, Math.round(frame.height * 0.11));
    const tip = {
      x: hand.x + (facing * rodReach),
      y: hand.y - rodLift,
    };
    const gripLength = Math.max(pixelUnit * 5, Math.round(placement.height * 0.08));
    const butt = {
      x: hand.x - (facing * gripLength),
      y: hand.y + Math.round(gripLength * 0.55),
    };
    const bobber = { x: stillBobber.x, y: stillBobber.y + bobberBob };
    return {
      packId: spriteSet.packId,
      theme: FISHING_VISUAL_THEMES[spriteSet.packId],
      sprite,
      sourceBounds,
      worldBounds,
      placement,
      flipHorizontally,
      facing,
      phase,
      theta,
      pivot,
      reflectionSurface: normalizedPoint(
        DEFAULT_PLATFORM_LAYOUTS[actorIndex].reflectionSurface,
        frame.width,
        frame.height,
      ),
      platformTop: DEFAULT_PLATFORM_LAYOUTS[actorIndex].platformTop.map((point) => (
        normalizedPoint(point, frame.width, frame.height)
      )),
      hand,
      tip,
      butt,
      bobber,
    };
  });

  for (const geometry of geometries) {
    drawWaterReflection(frame, geometry, time, pixelUnit);
  }
  for (const geometry of geometries) {
    drawRipples(frame, geometry.bobber, time, geometry.phase, pixelUnit);
  }
  for (const geometry of geometries) {
    drawPlatformContactShadow(frame, geometry, pixelUnit);
  }
  for (const geometry of geometries) {
    drawFishingLine(
      frame,
      geometry.tip,
      lureRingPoint(geometry.bobber, geometry.packId, pixelUnit),
      geometry.facing,
      pixelUnit,
    );
    drawRod(frame, geometry.butt, geometry.tip, pixelUnit);
  }
  for (const geometry of geometries) {
    blitSprite(frame, geometry.sprite, geometry.placement, geometry.flipHorizontally);
    drawRodGrip(
      frame,
      geometry.butt,
      geometry.hand,
      geometry.tip,
      geometry.theme,
      pixelUnit,
    );
  }
  for (const geometry of geometries) {
    drawThemedLure(
      frame,
      geometry.bobber,
      geometry.packId,
      geometry.theta,
      pixelUnit,
    );
  }

  return frame;
}

function normalizedPoint(point, width, height) {
  return {
    x: Math.round(point.x * (width - 1)),
    y: Math.round(point.y * (height - 1)),
  };
}

function orientSourcePoint(point, source, flipHorizontally) {
  return {
    x: flipHorizontally ? source.width - 1 - point.x : point.x,
    y: point.y,
  };
}

function placedSourcePoint(source, point, placement) {
  return {
    x: placement.left + Math.round((point.x * placement.width) / source.width),
    y: placement.top + Math.round((point.y * placement.height) / source.height),
  };
}

function normalizedRect(rectangle, width, height) {
  return {
    left: Math.round(rectangle.left * width),
    top: Math.round(rectangle.top * height),
    right: Math.round(rectangle.right * width),
    bottom: Math.round(rectangle.bottom * height),
  };
}

function validateSpritePlacements({
  spriteSets,
  spriteHeights,
  positions,
  bobbers,
  outputWidth,
  outputHeight,
}) {
  for (let actorIndex = 0; actorIndex < spriteSets.length; actorIndex += 1) {
    const spriteSet = spriteSets[actorIndex];
    const anchor = normalizedPoint(positions[actorIndex], outputWidth, outputHeight);
    const bobber = normalizedPoint(bobbers[actorIndex], outputWidth, outputHeight);
    const layout = DEFAULT_PLATFORM_LAYOUTS[actorIndex];
    const facing = layout.facing;
    const flipHorizontally = facing !== spriteSet.sourceFacing;
    const platform = normalizedRect(
      layout.bounds,
      outputWidth,
      outputHeight,
    );
    const seatBand = normalizedRect(
      layout.seatBand,
      outputWidth,
      outputHeight,
    );
    if ((facing * (bobber.x - anchor.x)) <= 0) {
      throw new Error(
        `${spriteSet.packId} bobber is opposite its platform facing direction.`,
      );
    }
    if (anchor.x < seatBand.left || anchor.x >= seatBand.right
      || anchor.y < seatBand.top || anchor.y >= seatBand.bottom) {
      throw new Error(
        `${spriteSet.packId} butt anchor ${anchor.x},${anchor.y} is outside its wooden seat band.`,
      );
    }
    for (let frameIndex = 0; frameIndex < spriteSet.frames.length; frameIndex += 1) {
      const source = spriteSet.frames[frameIndex];
      const sourceBounds = spriteSet.frameBounds[frameIndex];
      if (!sourceBounds) throw new Error(`${spriteSet.packId} fishing frame ${frameIndex} is empty.`);
      const sourceSeatAnchor = orientSourcePoint(
        spriteSet.seatAnchors[frameIndex],
        source,
        flipHorizontally,
      );
      const placement = spritePlacement(
        source,
        sourceSeatAnchor,
        anchor,
        spriteHeights[actorIndex],
      );
      const worldSeatAnchor = placedSourcePoint(source, sourceSeatAnchor, placement);
      if (Math.abs(worldSeatAnchor.x - anchor.x) > 1
        || Math.abs(worldSeatAnchor.y - anchor.y) > 1) {
        throw new Error(
          `${spriteSet.packId} frame ${frameIndex} seatPivot drifts from its wooden contact point.`,
        );
      }
      const bounds = scaledAlphaBounds(
        source,
        sourceBounds,
        placement,
        flipHorizontally,
      );
      if (bounds.left < 0 || bounds.top < 0
        || bounds.right >= outputWidth || bounds.bottom >= outputHeight) {
        throw new Error(`${spriteSet.packId} frame ${frameIndex} would be clipped by the output canvas.`);
      }
      if (bounds.left < platform.left || bounds.right >= platform.right) {
        throw new Error(
          `${spriteSet.packId} frame ${frameIndex} exceeds its wooden platform horizontally `
          + `(${bounds.left}-${bounds.right} outside ${platform.left}-${platform.right - 1}).`,
        );
      }
      if (bounds.bottom >= platform.bottom) {
        throw new Error(
          `${spriteSet.packId} frame ${frameIndex} hangs below its wooden platform `
          + `(bottom ${bounds.bottom}, limit ${platform.bottom - 1}).`,
        );
      }
    }
  }
}

function scaledAlphaBounds(source, bounds, placement, flipped) {
  const sourceLeft = flipped ? source.width - 1 - bounds.right : bounds.left;
  const sourceRight = flipped ? source.width - 1 - bounds.left : bounds.right;
  return {
    left: placement.left + Math.floor((sourceLeft * placement.width) / source.width),
    top: placement.top + Math.floor((bounds.top * placement.height) / source.height),
    right: placement.left
      + Math.ceil(((sourceRight + 1) * placement.width) / source.width) - 1,
    bottom: placement.top
      + Math.ceil(((bounds.bottom + 1) * placement.height) / source.height) - 1,
  };
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
  return { left, top, right, bottom };
}

function drawWaterReflection(target, geometry, time, unit) {
  const {
    sprite,
    sourceBounds,
    worldBounds,
    flipHorizontally,
    pivot,
    reflectionSurface,
    phase,
    theme,
  } = geometry;
  const sourceWidth = sourceBounds.right - sourceBounds.left + 1;
  const sourceHeight = sourceBounds.bottom - sourceBounds.top + 1;
  const worldWidth = worldBounds.right - worldBounds.left + 1;
  const worldHeight = worldBounds.bottom - worldBounds.top + 1;
  const reflectionWidth = Math.max(unit * 12, Math.round(worldWidth * 0.74));
  const reflectionHeight = Math.max(unit * 8, Math.round(worldHeight * 0.48));
  const actorCenterX = (worldBounds.left + worldBounds.right) / 2;
  const reflectionCenterX = reflectionSurface.x
    + Math.round((actorCenterX - pivot.x) * 0.82);
  const reflectionLeft = Math.round(reflectionCenterX - (reflectionWidth / 2));
  const animationPhase = (time + phase) * Math.PI * 2;
  const bandCount = 7;
  const bandHeight = Math.max(1, unit);

  // Reflections are deliberately rendered as sparse, broken water bands—not a
  // second pasted sprite. The silhouette still follows the active A/B pose,
  // while the low-alpha gaps let the original water texture remain dominant.
  for (let band = 0; band < bandCount; band += 1) {
    const progress = band / (bandCount - 1);
    const sourceY = Math.round(sourceBounds.bottom - (progress * (sourceHeight - 1)));
    const targetY = reflectionSurface.y + Math.round(progress * reflectionHeight);
    const wave = Math.round(
      Math.sin((band * 1.17) + animationPhase) * unit * (0.5 + (progress * 1.5)),
    );
    const bandAlpha = Math.round(140 + ((24 - 140) * progress));

    for (let bandRow = 0; bandRow < bandHeight; bandRow += 1) {
      for (let column = 0; column < reflectionWidth; column += 1) {
        const chunk = Math.floor(column / Math.max(1, unit * 3));
        const movingGap = (chunk + band + Math.floor(time * 8)) % 5;
        if (movingGap === 1) continue;
        const horizontalProgress = reflectionWidth <= 1
          ? 0
          : column / (reflectionWidth - 1);
        const orientedSourceX = Math.round(
          sourceBounds.left + (horizontalProgress * (sourceWidth - 1)),
        );
        const sourceX = flipHorizontally
          ? sprite.width - 1 - orientedSourceX
          : orientedSourceX;
        const sourceOffset = ((sourceY * sprite.width) + sourceX) * 4;
        const sourceAlpha = sprite.data[sourceOffset + 3];
        if (sourceAlpha === 0) continue;

        const targetX = reflectionLeft + column + wave;
        const waterY = targetY + bandRow;
        if (!isWaterPixel(target, targetX, waterY)) continue;
        const actorMix = 0.72;
        blendPixel(target, targetX, waterY, [
          Math.round((sprite.data[sourceOffset] * actorMix)
            + (theme.reflectionTint[0] * (1 - actorMix))),
          Math.round((sprite.data[sourceOffset + 1] * actorMix)
            + (theme.reflectionTint[1] * (1 - actorMix))),
          Math.round((sprite.data[sourceOffset + 2] * actorMix)
            + (theme.reflectionTint[2] * (1 - actorMix))),
          Math.round((sourceAlpha / 255) * bandAlpha),
        ]);
      }
    }
  }
}

function isWaterPixel(target, x, y) {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return false;
  const offset = ((y * target.width) + x) * 4;
  const red = target.data[offset];
  const green = target.data[offset + 1];
  const blue = target.data[offset + 2];
  return green >= 64
    && blue >= 72
    && green >= red + 16
    && blue >= red + 16
    && Math.abs(green - blue) <= 100;
}

function drawPlatformContactShadow(target, geometry, unit) {
  const radiusX = Math.max(unit * 7, Math.round(
    (geometry.worldBounds.right - geometry.worldBounds.left + 1) * 0.25,
  ));
  const centerX = geometry.pivot.x - (geometry.facing * unit);
  const centerY = geometry.pivot.y + unit;
  fillSteppedPlatformShadow(
    target,
    centerX,
    centerY,
    radiusX * 2,
    unit * 6,
    [46, 28, 25, 70],
    geometry.platformTop,
    geometry.facing,
    unit,
  );
  fillSteppedPlatformShadow(
    target,
    centerX,
    centerY,
    Math.max(unit * 8, Math.round(radiusX * 1.18)),
    unit * 3,
    [35, 23, 24, 105],
    geometry.platformTop,
    geometry.facing,
    unit,
  );
}

function fillSteppedPlatformShadow(
  target,
  centerX,
  centerY,
  width,
  height,
  color,
  platformPolygon,
  facing,
  unit,
) {
  const integerHeight = Math.max(1, Math.round(height));
  const halfHeight = integerHeight / 2;
  for (let row = 0; row < integerHeight; row += 1) {
    const distanceFromMiddle = Math.abs(row - halfHeight);
    const tier = Math.floor(distanceFromMiddle / Math.max(1, unit * 1.5));
    const rowWidth = Math.max(unit * 4, Math.round(width - (tier * unit * 3)));
    const y = Math.round(centerY - halfHeight + row);
    const skew = Math.round((row - halfHeight) * facing * 0.18);
    const left = Math.round(centerX - (rowWidth / 2) + skew);
    for (let x = left; x < left + rowWidth; x += 1) {
      if (!pointInPolygon(x, y, platformPolygon)) continue;
      blendPixel(target, x, y, color);
    }
  }
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses = ((currentPoint.y > y) !== (previousPoint.y > y))
      && (x < ((previousPoint.x - currentPoint.x) * (y - currentPoint.y)
        / (previousPoint.y - currentPoint.y)) + currentPoint.x);
    if (crosses) inside = !inside;
  }
  return inside;
}

function drawRipples(target, bobber, time, phase, unit) {
  for (let ring = 0; ring < 2; ring += 1) {
    const progress = (time + phase * 0.17 + ring * 0.5) % 1;
    const radiusX = unit * (3 + progress * 10);
    const radiusY = unit * (1.5 + progress * 3.5);
    const alpha = Math.round((1 - progress) * 110);
    drawEllipse(
      target,
      bobber.x,
      bobber.y + (unit * 3),
      radiusX,
      radiusY,
      [210, 253, 242, alpha],
      unit,
    );
  }
}

function drawFishingLine(target, tip, bobber, facing, unit) {
  const control = {
    x: Math.round(tip.x + ((bobber.x - tip.x) * 0.58) + (facing * unit * 5)),
    y: Math.round(tip.y + ((bobber.y - tip.y) * 0.42)),
  };
  drawQuadratic(target, tip, control, bobber, [30, 60, 66, 175], Math.max(1, unit));
  drawQuadratic(target, tip, control, bobber, [231, 248, 226, 230], 1);
}

function drawRod(target, butt, tip, unit) {
  drawLine(target, butt.x, butt.y, tip.x, tip.y, [55, 35, 25, 255], unit * 3);
  drawLine(target, butt.x, butt.y, tip.x, tip.y, [174, 108, 49, 255], unit);
  fillSquare(target, tip.x, tip.y, unit, [230, 189, 94, 255]);
}

function drawRodGrip(target, butt, hand, tip, theme, unit) {
  const deltaX = tip.x - butt.x;
  const deltaY = tip.y - butt.y;
  const length = Math.max(1, Math.hypot(deltaX, deltaY));
  const direction = { x: deltaX / length, y: deltaY / length };
  const normal = { x: -direction.y, y: direction.x };
  const gripBack = unit * 6;
  const gripFront = unit * 4;
  const gripStart = {
    x: Math.round(hand.x - (direction.x * gripBack)),
    y: Math.round(hand.y - (direction.y * gripBack)),
  };
  const gripEnd = {
    x: Math.round(hand.x + (direction.x * gripFront)),
    y: Math.round(hand.y + (direction.y * gripFront)),
  };
  drawLine(
    target,
    gripStart.x,
    gripStart.y,
    gripEnd.x,
    gripEnd.y,
    [57, 34, 27, 255],
    unit * 3,
  );
  drawLine(
    target,
    gripStart.x,
    gripStart.y,
    gripEnd.x,
    gripEnd.y,
    [138, 72, 37, 255],
    unit,
  );

  // Two separate cuffs sit along the handle and alternate sides by one pixel.
  // The thin handle highlight is restored through each cuff, which reads as
  // two hands wrapped around a rod rather than a colored patch over the hand.
  const handSpacing = unit * 2.35;
  for (const side of [-1, 1]) {
    const alongHandle = handSpacing * side;
    const acrossHandle = unit * 0.6 * side;
    const clamp = {
      x: Math.round(hand.x + (direction.x * alongHandle) + (normal.x * acrossHandle)),
      y: Math.round(hand.y + (direction.y * alongHandle) + (normal.y * acrossHandle)),
    };
    fillSquare(target, clamp.x, clamp.y, unit * 3, theme.handOutline);
    fillSquare(target, clamp.x, clamp.y, unit * 2, theme.hand);
    drawLine(
      target,
      clamp.x - Math.round(direction.x * unit),
      clamp.y - Math.round(direction.y * unit),
      clamp.x + Math.round(direction.x * unit),
      clamp.y + Math.round(direction.y * unit),
      [116, 62, 35, 255],
      unit,
    );
    fillSquare(
      target,
      clamp.x + Math.round(normal.x * unit * 0.85 * side),
      clamp.y + Math.round(normal.y * unit * 0.85 * side),
      unit,
      theme.handHighlight,
    );
  }
}

function lureRingPoint(point, packId, unit) {
  return {
    x: point.x,
    y: point.y - (FISHING_VISUAL_THEMES[packId].ringOffset * unit),
  };
}

function drawThemedLure(target, point, packId, theta, unit) {
  const sparkle = Math.sin(theta) > 0.55;
  switch (FISHING_VISUAL_THEMES[packId].lure) {
    case 'acorn':
      drawAcornLure(target, point, unit, sparkle);
      break;
    case 'crystal-star':
      drawCrystalStarLure(target, point, unit, sparkle);
      break;
    case 'red-bow':
      drawBowLure(target, point, unit, sparkle);
      break;
    case 'clockwork-orb':
      drawClockworkLure(target, point, unit, sparkle);
      break;
    default:
      throw new Error(`Missing fishing lure renderer for ${packId}.`);
  }
}

function drawAcornLure(target, point, unit, sparkle) {
  fillRect(target, point.x - unit, point.y - (unit * 6), unit * 2, unit * 3, [54, 49, 31, 255]);
  fillRect(target, point.x - (unit * 3), point.y - (unit * 4), unit * 6, unit * 3, [74, 48, 30, 255]);
  fillRect(target, point.x - (unit * 2), point.y - (unit * 3), unit * 4, unit * 6, [190, 112, 49, 255]);
  fillRect(target, point.x - unit, point.y + (unit * 3), unit * 2, unit * 2, [113, 66, 35, 255]);
  fillRect(target, point.x + (unit * 2), point.y - (unit * 5), unit * 3, unit * 2, [82, 151, 61, 255]);
  if (sparkle) fillSquare(target, point.x - unit, point.y - unit, unit, [248, 198, 100, 255]);
}

function drawCrystalStarLure(target, point, unit, sparkle) {
  fillDiamond(target, point.x, point.y, unit * 4, [54, 35, 82, 255]);
  fillDiamond(target, point.x, point.y, unit * 3, [145, 88, 203, 255]);
  fillRect(target, point.x - unit, point.y - (unit * 6), unit * 2, unit * 3, [78, 53, 103, 255]);
  fillSquare(target, point.x, point.y, unit * 2, [217, 160, 244, 255]);
  if (sparkle) {
    fillRect(target, point.x + (unit * 4), point.y - unit, unit * 3, unit, [238, 218, 255, 235]);
    fillRect(target, point.x + (unit * 5), point.y - (unit * 2), unit, unit * 3, [238, 218, 255, 235]);
  }
}

function drawBowLure(target, point, unit, sparkle) {
  fillRect(target, point.x - unit, point.y - (unit * 6), unit * 2, unit * 3, [89, 72, 65, 255]);
  fillRect(target, point.x - (unit * 5), point.y - (unit * 3), unit * 4, unit * 5, [123, 35, 46, 255]);
  fillRect(target, point.x + unit, point.y - (unit * 3), unit * 4, unit * 5, [123, 35, 46, 255]);
  fillRect(target, point.x - (unit * 4), point.y - (unit * 2), unit * 3, unit * 3, [231, 65, 78, 255]);
  fillRect(target, point.x + unit, point.y - (unit * 2), unit * 3, unit * 3, [231, 65, 78, 255]);
  fillSquare(target, point.x, point.y - unit, unit * 3, [246, 190, 73, 255]);
  if (sparkle) fillSquare(target, point.x + (unit * 2), point.y - (unit * 2), unit, [255, 236, 175, 255]);
}

function drawClockworkLure(target, point, unit, sparkle) {
  const outline = [35, 45, 48, 255];
  for (const [offsetX, offsetY] of [[0, -4], [0, 4], [-4, 0], [4, 0]]) {
    fillSquare(
      target,
      point.x + (offsetX * unit),
      point.y + (offsetY * unit),
      unit * 2,
      outline,
    );
  }
  fillDiamond(target, point.x, point.y, unit * 4, outline);
  fillDiamond(target, point.x, point.y, unit * 3, [39, 161, 164, 255]);
  fillSquare(target, point.x, point.y, unit * 3, [224, 137, 49, 255]);
  fillSquare(target, point.x, point.y, unit, sparkle
    ? [255, 241, 151, 255]
    : [107, 221, 204, 255]);
  fillRect(target, point.x - unit, point.y - (unit * 7), unit * 2, unit * 4, [63, 54, 49, 255]);
}

function fillDiamond(target, centerX, centerY, radius, color) {
  const integerRadius = Math.max(1, Math.round(radius));
  for (let offsetY = -integerRadius; offsetY <= integerRadius; offsetY += 1) {
    const halfWidth = integerRadius - Math.abs(offsetY);
    fillRect(
      target,
      centerX - halfWidth,
      centerY + offsetY,
      (halfWidth * 2) + 1,
      1,
      color,
    );
  }
}

function drawQuadratic(target, start, control, end, color, thickness) {
  const steps = Math.max(12, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 3));
  let previous = start;
  for (let step = 1; step <= steps; step += 1) {
    const time = step / steps;
    const inverse = 1 - time;
    const point = {
      x: Math.round((inverse * inverse * start.x) + (2 * inverse * time * control.x) + (time * time * end.x)),
      y: Math.round((inverse * inverse * start.y) + (2 * inverse * time * control.y) + (time * time * end.y)),
    };
    drawLine(target, previous.x, previous.y, point.x, point.y, color, thickness);
    previous = point;
  }
}

function drawEllipse(target, centerX, centerY, radiusX, radiusY, color, thickness) {
  const segments = Math.max(16, Math.ceil(Math.PI * Math.max(radiusX, radiusY)));
  let previous = {
    x: Math.round(centerX + radiusX),
    y: Math.round(centerY),
  };
  for (let segment = 1; segment <= segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    const point = {
      x: Math.round(centerX + (Math.cos(angle) * radiusX)),
      y: Math.round(centerY + (Math.sin(angle) * radiusY)),
    };
    drawLine(target, previous.x, previous.y, point.x, point.y, color, thickness);
    previous = point;
  }
}

function drawLine(target, startX, startY, endX, endY, color, thickness = 1) {
  let x = Math.round(startX);
  let y = Math.round(startY);
  const targetX = Math.round(endX);
  const targetY = Math.round(endY);
  const deltaX = Math.abs(targetX - x);
  const deltaY = Math.abs(targetY - y);
  const stepX = x < targetX ? 1 : -1;
  const stepY = y < targetY ? 1 : -1;
  let error = deltaX - deltaY;

  while (true) {
    fillSquare(target, x, y, thickness, color);
    if (x === targetX && y === targetY) break;
    const doubledError = error * 2;
    if (doubledError > -deltaY) {
      error -= deltaY;
      x += stepX;
    }
    if (doubledError < deltaX) {
      error += deltaX;
      y += stepY;
    }
  }
}

function fillSquare(target, centerX, centerY, size, color) {
  const integerSize = Math.max(1, Math.round(size));
  fillRect(
    target,
    Math.round(centerX - ((integerSize - 1) / 2)),
    Math.round(centerY - ((integerSize - 1) / 2)),
    integerSize,
    integerSize,
    color,
  );
}

function fillRect(target, x, y, width, height, color) {
  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const right = Math.min(target.width, Math.round(x + width));
  const bottom = Math.min(target.height, Math.round(y + height));
  for (let targetY = top; targetY < bottom; targetY += 1) {
    for (let targetX = left; targetX < right; targetX += 1) {
      blendPixel(target, targetX, targetY, color);
    }
  }
}

function spritePlacement(source, sourcePivot, targetPivot, targetHeight) {
  const scale = targetHeight / source.height;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  return {
    left: Math.round(targetPivot.x - ((sourcePivot.x * width) / source.width)),
    top: Math.round(targetPivot.y - ((sourcePivot.y * height) / source.height)),
    width,
    height,
  };
}

function blitSprite(target, source, placement, flipHorizontally) {
  for (let targetY = placement.top; targetY < placement.top + placement.height; targetY += 1) {
    const localY = targetY - placement.top;
    const sourceY = Math.min(
      source.height - 1,
      Math.floor((localY * source.height) / placement.height),
    );
    for (let targetX = placement.left; targetX < placement.left + placement.width; targetX += 1) {
      const localX = targetX - placement.left;
      const sampledX = Math.min(
        source.width - 1,
        Math.floor((localX * source.width) / placement.width),
      );
      const sourceX = flipHorizontally ? source.width - 1 - sampledX : sampledX;
      const sourceOffset = ((sourceY * source.width) + sourceX) * 4;
      const alpha = source.data[sourceOffset + 3];
      if (alpha === 0) continue;
      blendPixel(target, targetX, targetY, [
        source.data[sourceOffset],
        source.data[sourceOffset + 1],
        source.data[sourceOffset + 2],
        alpha,
      ]);
    }
  }
}

function blendPixel(target, x, y, [red, green, blue, alpha]) {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height || alpha <= 0) return;
  const offset = ((y * target.width) + x) * 4;
  if (alpha >= 255 || target.data[offset + 3] === 0) {
    target.data[offset] = red;
    target.data[offset + 1] = green;
    target.data[offset + 2] = blue;
    target.data[offset + 3] = alpha;
    return;
  }

  const sourceAlpha = alpha / 255;
  const destinationAlpha = target.data[offset + 3] / 255;
  const outputAlpha = sourceAlpha + (destinationAlpha * (1 - sourceAlpha));
  target.data[offset] = Math.round(
    ((red * sourceAlpha) + (target.data[offset] * destinationAlpha * (1 - sourceAlpha))) / outputAlpha,
  );
  target.data[offset + 1] = Math.round(
    ((green * sourceAlpha) + (target.data[offset + 1] * destinationAlpha * (1 - sourceAlpha))) / outputAlpha,
  );
  target.data[offset + 2] = Math.round(
    ((blue * sourceAlpha) + (target.data[offset + 2] * destinationAlpha * (1 - sourceAlpha))) / outputAlpha,
  );
  target.data[offset + 3] = Math.round(outputAlpha * 255);
}

async function encodeGif({ ffmpeg, frameDirectory, output, fps, colors }) {
  const filter = [
    '[0:v]split[palette_source][gif_source]',
    `[palette_source]palettegen=max_colors=${colors}:stats_mode=diff[palette]`,
    '[gif_source][palette]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
  ].join(';');
  await runCommand(ffmpeg, [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-framerate', String(fps),
    '-start_number', '0',
    '-i', join(frameDirectory, 'frame-%03d.png'),
    '-filter_complex', filter,
    '-loop', '0',
    output,
  ]);
}

async function verifyFfmpeg(ffmpeg) {
  await runCommand(ffmpeg, ['-version'], { discardOutput: true });
}

function runCommand(command, args, { discardOutput = false } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ['ignore', discardOutput ? 'ignore' : 'pipe', 'pipe'],
    });
    const output = [];
    child.stdout?.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => output.push(chunk));
    child.on('error', (error) => {
      rejectPromise(new Error(`Unable to run ${command}: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const detail = Buffer.concat(output).toString('utf8').trim();
      rejectPromise(new Error(
        `${command} exited with code ${code}${detail ? `:\n${detail}` : '.'}`,
      ));
    });
  });
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function padFrame(index) {
  return String(index).padStart(3, '0');
}

main().catch((error) => {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`render-fishing-gif: ${reason}\n`);
  process.exitCode = 1;
});
