import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

import type { MediaGenerationService } from './mediaGenerationService.js';
import type { ProjectIcon, ProjectRecord } from '../shared/contracts.js';

export const PROJECT_ICON_RELATIVE_PATH = '.noobi/icon.png';
export const PROJECT_ICON_GRID_SIZE = 16;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Deterministic PRNG so a project's procedural icon is stable across restarts.
 */
function seededRandom(seed: string): () => number {
  const digest = createHash('sha256').update(seed).digest();
  let state = digest.readUInt32LE(0) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = Math.min(1, Math.max(0, saturation));
  const l = Math.min(1, Math.max(0, lightness));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (offset: number): number => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(channel(1 / 3) * 255),
    g: Math.round(channel(0) * 255),
    b: Math.round(channel(-1 / 3) * 255),
  };
}

/**
 * Renders a mirrored 16×16 pixel-art motif ("space-invader" style) derived from
 * the seed, with a dark backdrop, a body color, an accent color, and two eyes.
 */
export function renderProceduralIconPixels(seed: string): {
  width: number;
  height: number;
  rgba: Uint8Array;
} {
  const size = PROJECT_ICON_GRID_SIZE;
  const half = size / 2;
  const rng = seededRandom(`noobi-icon:${seed}`);
  const hue = Math.floor(rng() * 360);
  const background = hslToRgb(hue, 0.32, 0.13);
  const body = hslToRgb(hue, 0.62, 0.56);
  const accent = hslToRgb(hue + 46, 0.78, 0.68);
  const eye = hslToRgb(hue, 0.25, 0.92);

  const filled: boolean[][] = [];
  const accented: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const cells: boolean[] = [];
    const accentCells: boolean[] = [];
    for (let column = 0; column < half; column += 1) {
      const margin = row < 2 || row > size - 3;
      cells.push(!margin && rng() < 0.52);
      accentCells.push(rng() < 0.22);
    }
    filled.push(cells);
    accented.push(accentCells);
  }
  // Guarantee a readable silhouette: solid spine rows around the eye line.
  const eyeRow = 5 + Math.floor(rng() * 3);
  const eyeColumn = 2 + Math.floor(rng() * 2);
  for (let column = 2; column < half - 1; column += 1) {
    filled[eyeRow]![column] = true;
    filled[eyeRow + 1]![column] = true;
  }

  const rgba = new Uint8Array(size * size * 4);
  const paint = (x: number, y: number, color: Rgb) => {
    const offset = (y * size + x) * 4;
    rgba[offset] = color.r;
    rgba[offset + 1] = color.g;
    rgba[offset + 2] = color.b;
    rgba[offset + 3] = 255;
  };
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const mirrorColumn = column < half ? column : size - 1 - column;
      const isFilled = filled[row]![mirrorColumn]!;
      const isEye = row === eyeRow && (mirrorColumn === eyeColumn);
      let color = background;
      if (isFilled) color = accented[row]![mirrorColumn]! ? accent : body;
      if (isEye) color = isFilled ? eye : background;
      paint(column, row, color);
    }
  }
  return { width: size, height: size, rgba };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * Minimal truecolor RGBA PNG encoder (8-bit, filter 0) so the host can ship
 * icons without pulling an image library into the packaged app.
 */
export function encodePngRgba(width: number, height: number, rgba: Uint8Array): Buffer {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('PNG dimensions must be positive integers');
  }
  if (rgba.length !== width * height * 4) {
    throw new Error('RGBA buffer size does not match the PNG dimensions');
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + row * stride, stride).copy(
      raw,
      row * (stride + 1) + 1,
    );
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildAiIconPrompt(project: ProjectRecord): string {
  const idea = project.idea.replace(/\s+/gu, ' ').trim().slice(0, 400);
  return [
    `Pixel art game icon for a game titled "${project.name}".`,
    idea ? `Game concept: ${idea}.` : '',
    'Style: crisp 16-bit retro pixel art, single centered motif, chunky readable silhouette,',
    'flat very dark solid background, limited palette, high contrast, no text, no letters, no border, no watermark.',
    'Square 1:1 composition that stays legible at 44px.',
  ].filter(Boolean).join(' ');
}

async function writeIcon(project: ProjectRecord, bytes: Buffer, source: ProjectIcon['source']): Promise<ProjectIcon> {
  const absolute = join(project.root, PROJECT_ICON_RELATIVE_PATH);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes, { mode: 0o600 });
  return {
    path: PROJECT_ICON_RELATIVE_PATH,
    source,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Every project gets a deterministic procedural pixel icon at creation time,
 * so the rail and dashboard never depend on a paid provider round-trip.
 */
export async function generateProceduralProjectIcon(project: ProjectRecord): Promise<ProjectIcon> {
  const { width, height, rgba } = renderProceduralIconPixels(`${project.id}:${project.name}`);
  return writeIcon(project, encodePngRgba(width, height, rgba), 'procedural');
}

/**
 * When an image provider is configured, the procedural placeholder is upgraded
 * to an AI pixel-art icon once the game has been generated. Returns null when
 * no provider is available or generation fails; callers keep the placeholder.
 */
export async function generateAiProjectIcon(
  project: ProjectRecord,
  media: Pick<MediaGenerationService, 'generate'>,
): Promise<ProjectIcon | null> {
  const result = await media.generate({
    project: { id: project.id, root: project.root },
    kind: 'image',
    name: 'project-icon',
    prompt: buildAiIconPrompt(project),
  });
  if (result.outcome !== 'asset') return null;
  const bytes = await readFile(join(project.root, result.asset.relativePath));
  return writeIcon(project, bytes, 'ai');
}
