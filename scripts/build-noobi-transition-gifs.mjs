import { spawnSync } from 'node:child_process';
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const sceneDirectory = join(
  projectRoot,
  'src/renderer/assets/noobi-transition-scenes',
);
const spriteDirectory = join(
  projectRoot,
  'src/renderer/assets/noobi-packs/classic/frames',
);

const canvasWidth = 480;
const canvasHeight = 360;
const frameCount = 8;
const frameRate = '20/3';

const scenes = [
  { id: 'cozy-workshop', action: 'type', centerX: 0.51, footY: 298 },
  { id: 'crystal-lab', action: 'inspect', centerX: 0.5, footY: 298 },
  { id: 'forest-camp', action: 'carry', centerX: 0.51, footY: 300 },
  { id: 'sky-dock', action: 'celebrate', centerX: 0.5, footY: 286 },
  { id: 'seaside-arcade', action: 'play', centerX: 0.51, footY: 298 },
  { id: 'snow-cabin', action: 'coffee', centerX: 0.49, footY: 298 },
  { id: 'star-observatory', action: 'inspect', centerX: 0.5, footY: 288 },
  { id: 'potion-garden', action: 'repair', centerX: 0.5, footY: 298 },
  { id: 'rooftop-studio', action: 'paint', centerX: 0.5, footY: 298 },
];

function runFfmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || `ffmpeg failed with status ${result.status}`);
  }
}

async function requireFile(path) {
  try {
    await access(path);
  } catch {
    throw new Error(`Missing required asset: ${path}`);
  }
}

async function writeShadow(path) {
  const width = 84;
  const height = 22;
  const png = new PNG({ width, height, colorType: 6 });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const normalizedX = (x - (width - 1) / 2) / (width / 2);
      const normalizedY = (y - (height - 1) / 2) / (height / 2);
      const distance = normalizedX ** 2 + normalizedY ** 2;
      const strength = Math.max(0, 1 - distance);
      const offset = (y * width + x) * 4;
      png.data[offset] = 25;
      png.data[offset + 1] = 20;
      png.data[offset + 2] = 38;
      png.data[offset + 3] = Math.round(72 * strength ** 0.72);
    }
  }

  await writeFile(path, PNG.sync.write(png));
}

async function removeAlphaSpeckles(path) {
  const png = PNG.sync.read(await readFile(path));
  const { width, height } = png;
  const visible = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    const alphaOffset = index * 4 + 3;
    if (png.data[alphaOffset] >= 48) {
      visible[index] = 1;
    } else {
      png.data[alphaOffset] = 0;
    }
  }

  for (let start = 0; start < visible.length; start += 1) {
    if (!visible[start] || visited[start]) continue;

    const component = [];
    const queue = [start];
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const neighborX = x + offsetX;
          const neighborY = y + offsetY;
          if (
            neighborX < 0 || neighborX >= width ||
            neighborY < 0 || neighborY >= height
          ) {
            continue;
          }
          const neighbor = neighborY * width + neighborX;
          if (visible[neighbor] && !visited[neighbor]) {
            visited[neighbor] = 1;
            queue.push(neighbor);
          }
        }
      }
    }

    if (component.length < 8) {
      for (const index of component) {
        png.data[index * 4 + 3] = 0;
      }
    }
  }

  await writeFile(path, PNG.sync.write(png));
}

async function buildSceneGif(scene) {
  const scenePath = join(sceneDirectory, `scene-${scene.id}.png`);
  const previewPath = join(sceneDirectory, `noobi-${scene.id}.png`);
  const outputPath = join(sceneDirectory, `noobi-${scene.id}.gif`);
  const spriteAPath = join(spriteDirectory, `sprite-${scene.action}-a.png`);
  const spriteBPath = join(spriteDirectory, `sprite-${scene.action}-b.png`);

  await Promise.all([
    requireFile(scenePath),
    requireFile(spriteAPath),
    requireFile(spriteBPath),
  ]);

  const temporaryDirectory = await mkdtemp(join(tmpdir(), `noobi-${scene.id}-`));

  try {
    const normalizedScenePath = join(temporaryDirectory, 'scene.png');
    const shadowPath = join(temporaryDirectory, 'shadow.png');

    runFfmpeg([
      '-i', scenePath,
      '-vf',
      `format=rgba,scale=440:330:force_original_aspect_ratio=decrease:flags=neighbor,pad=${canvasWidth}:${canvasHeight}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
      '-frames:v', '1',
      '-c:v', 'png',
      '-pix_fmt', 'rgba',
      normalizedScenePath,
    ]);
    await removeAlphaSpeckles(normalizedScenePath);
    await writeShadow(shadowPath);

    const spriteWidth = 90;
    const spriteHeight = 120;
    const baseX = Math.round(scene.centerX * canvasWidth - spriteWidth / 2);
    const shadowX = Math.round(scene.centerX * canvasWidth - 42);
    const horizontalOffsets = [0, 0, 1, 1, 0, 0, -1, -1];
    const verticalOffsets = [0, -2, 0, -1, 0, -2, 0, -1];

    for (let index = 0; index < frameCount; index += 1) {
      const spritePath = index % 2 === 0 ? spriteAPath : spriteBPath;
      const spriteX = baseX + horizontalOffsets[index];
      const spriteY = scene.footY - spriteHeight + verticalOffsets[index];
      const framePath = join(temporaryDirectory, `frame-${String(index).padStart(2, '0')}.png`);

      runFfmpeg([
        '-i', normalizedScenePath,
        '-i', shadowPath,
        '-i', spritePath,
        '-filter_complex',
        `[0:v]format=rgba[base];[1:v]format=rgba[shadow];[2:v]scale=${spriteWidth}:${spriteHeight}:flags=neighbor,format=rgba[character];[base][shadow]overlay=x=${shadowX}:y=${scene.footY - 12}:format=auto[grounded];[grounded][character]overlay=x=${spriteX}:y=${spriteY}:format=auto,format=rgba`,
        '-frames:v', '1',
        '-c:v', 'png',
        '-pix_fmt', 'rgba',
        framePath,
      ]);
    }

    await copyFile(join(temporaryDirectory, 'frame-00.png'), previewPath);

    runFfmpeg([
      '-framerate', frameRate,
      '-start_number', '0',
      '-i', join(temporaryDirectory, 'frame-%02d.png'),
      '-filter_complex',
      '[0:v]split[frames][palette-source];[palette-source]palettegen=reserve_transparent=1:transparency_color=000000[palette];[frames][palette]paletteuse=alpha_threshold=64:dither=bayer:bayer_scale=2',
      '-loop', '0',
      outputPath,
    ]);

    return outputPath;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await mkdir(sceneDirectory, { recursive: true });
const outputs = [];

for (const scene of scenes) {
  outputs.push(await buildSceneGif(scene));
}

for (const output of outputs) {
  console.log(output);
}
