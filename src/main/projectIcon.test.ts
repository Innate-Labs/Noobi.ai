import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

import {
  encodePngRgba,
  generateAiProjectIcon,
  generateProceduralProjectIcon,
  PROJECT_ICON_GRID_SIZE,
  PROJECT_ICON_RELATIVE_PATH,
  renderProceduralIconPixels,
} from './projectIcon.js';
import type { MediaGenerationResult } from './mediaGenerationService.js';
import type { ProjectRecord } from '../shared/contracts.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fakeProject(name = 'Star Drifters'): Promise<ProjectRecord> {
  const root = await mkdtemp(join(tmpdir(), 'noobi-icon-test-'));
  roots.push(root);
  return {
    id: '11111111-2222-4333-8444-555555555555',
    name,
    idea: '在星空中收集能量节点的街机游戏',
    root,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    status: 'draft',
    stage: 'brief',
    engine: 'web',
    targetFrameRate: 60,
    noobiPackOverrideId: null,
    noobiCrewOverride: null,
    model: null,
    threadId: null,
    toolsetVersion: 0,
    activeTurnId: null,
    lastError: null,
    icon: null,
  };
}

function parsePng(buffer: Buffer): { width: number; height: number; idat: Buffer } {
  expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const ihdrLength = buffer.readUInt32BE(8);
  expect(buffer.subarray(12, 16).toString('ascii')).toBe('IHDR');
  const ihdr = buffer.subarray(16, 16 + ihdrLength);
  const idatLengthOffset = 16 + ihdrLength + 4;
  const idatLength = buffer.readUInt32BE(idatLengthOffset);
  expect(buffer.subarray(idatLengthOffset + 4, idatLengthOffset + 8).toString('ascii')).toBe('IDAT');
  const idat = buffer.subarray(idatLengthOffset + 8, idatLengthOffset + 8 + idatLength);
  return {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    idat,
  };
}

describe('encodePngRgba', () => {
  it('emits a valid truecolor PNG that round-trips through inflate', () => {
    const width = 4;
    const height = 3;
    const rgba = new Uint8Array(width * height * 4).fill(255);
    const png = encodePngRgba(width, height, rgba);
    const parsed = parsePng(png);
    expect(parsed.width).toBe(width);
    expect(parsed.height).toBe(height);
    const raw = inflateSync(parsed.idat);
    expect(raw.length).toBe(height * (1 + width * 4));
    expect(png.subarray(png.length - 8, png.length - 4).toString('ascii')).toBe('IEND');
  });

  it('rejects buffers that do not match the dimensions', () => {
    expect(() => encodePngRgba(2, 2, new Uint8Array(3))).toThrow(/dimensions/u);
  });
});

describe('renderProceduralIconPixels', () => {
  it('is deterministic per seed and varies across seeds', () => {
    const first = renderProceduralIconPixels('alpha');
    const repeated = renderProceduralIconPixels('alpha');
    const other = renderProceduralIconPixels('beta');
    expect(Buffer.from(first.rgba).equals(Buffer.from(repeated.rgba))).toBe(true);
    expect(Buffer.from(first.rgba).equals(Buffer.from(other.rgba))).toBe(false);
    expect(first.width).toBe(PROJECT_ICON_GRID_SIZE);
    expect(first.height).toBe(PROJECT_ICON_GRID_SIZE);
  });

  it('is horizontally mirrored like a classic pixel-art motif', () => {
    const { width, height, rgba } = renderProceduralIconPixels('symmetry-check');
    const pixel = (x: number, y: number) => {
      const offset = (y * width + x) * 4;
      return Array.from(rgba.subarray(offset, offset + 4));
    };
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width / 2; x += 1) {
        expect(pixel(x, y)).toEqual(pixel(width - 1 - x, y));
      }
    }
  });
});

describe('generateProceduralProjectIcon', () => {
  it('writes a PNG icon inside the project and reports the record', async () => {
    const project = await fakeProject();
    const icon = await generateProceduralProjectIcon(project);
    expect(icon.source).toBe('procedural');
    expect(icon.path).toBe(PROJECT_ICON_RELATIVE_PATH);
    const bytes = await readFile(join(project.root, PROJECT_ICON_RELATIVE_PATH));
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(parsePng(bytes).width).toBe(PROJECT_ICON_GRID_SIZE);
  });
});

describe('generateAiProjectIcon', () => {
  it('returns null when no image provider is configured', async () => {
    const project = await fakeProject();
    const fallback: MediaGenerationResult = {
      outcome: 'fallback',
      fallback: 'codex-imagegen',
      reason: 'provider-not-configured',
      prompt: 'unused',
    };
    const icon = await generateAiProjectIcon(project, { generate: async () => fallback });
    expect(icon).toBeNull();
  });

  it('copies the generated asset to the host-owned icon path', async () => {
    const project = await fakeProject();
    const sourcePng = encodePngRgba(2, 2, new Uint8Array(16).fill(128));
    await mkdir(join(project.root, 'assets'), { recursive: true });
    await writeFile(join(project.root, 'assets/project-icon.png'), sourcePng);
    const result = {
      outcome: 'asset',
      asset: { relativePath: 'assets/project-icon.png' },
      provider: {
        id: 'p1',
        presetId: 'openai-image',
        displayName: 'OpenAI Images',
        model: 'gpt-image-2',
        route: 'configured-api',
      },
    } as unknown as MediaGenerationResult;
    const icon = await generateAiProjectIcon(project, { generate: async () => result });
    expect(icon?.source).toBe('ai');
    const bytes = await readFile(join(project.root, PROJECT_ICON_RELATIVE_PATH));
    expect(bytes.equals(sourcePng)).toBe(true);
  });
});
