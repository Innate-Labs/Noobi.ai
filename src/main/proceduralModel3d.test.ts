import { describe, expect, it } from 'vitest';

import { createProceduralModel3dGlb } from './proceduralModel3d.js';

describe('procedural Three.js GLB exporter', () => {
  it('creates deterministic, self-contained static geometry without browser DOM APIs', async () => {
    const input = { name: 'forest-rock', prompt: 'Low-poly mossy rock for a mountain path' };
    const first = await createProceduralModel3dGlb(input);
    const second = await createProceduralModel3dGlb(input);
    const gltf = readGlbJson(first.bytes);

    expect(first.preset).toBe('rock');
    expect(first.rigged).toBe(false);
    expect(first.animated).toBe(false);
    expect(first.vertexCount).toBeGreaterThan(0);
    expect(first.triangleCount).toBeGreaterThan(0);
    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(gltf.meshes?.length).toBeGreaterThan(0);
    expect(gltf.buffers?.every((buffer) => buffer.uri === undefined)).toBe(true);
    expect(gltf.images ?? []).toHaveLength(0);
  });

  it('creates a skinned character with real idle, walk, and run animation channels', async () => {
    const result = await createProceduralModel3dGlb({
      name: 'zombie',
      prompt: 'Readable low-poly zombie enemy',
      animation: true,
    });
    const gltf = readGlbJson(result.bytes);

    expect(result).toMatchObject({
      preset: 'rigged-character',
      rigged: true,
      animated: true,
      animations: 'idle,walk,run',
    });
    expect(gltf.skins).toHaveLength(1);
    expect(gltf.animations?.map((animation) => animation.name)).toEqual(['idle', 'walk', 'run']);
    expect(gltf.animations?.every((animation) => (animation.channels?.length ?? 0) >= 4)).toBe(true);
    const primitives = gltf.meshes?.flatMap((mesh) => mesh.primitives ?? []) ?? [];
    expect(primitives.some((primitive) => (
      typeof primitive.attributes?.POSITION === 'number'
      && typeof primitive.attributes?.JOINTS_0 === 'number'
      && typeof primitive.attributes?.WEIGHTS_0 === 'number'
    ))).toBe(true);
  });
});

interface GlbJson {
  meshes?: Array<{
    primitives?: Array<{
      attributes?: Record<string, number>;
    }>;
  }>;
  skins?: unknown[];
  animations?: Array<{ name?: string; channels?: unknown[] }>;
  buffers?: Array<{ uri?: string }>;
  images?: unknown[];
}

function readGlbJson(bytes: Buffer): GlbJson {
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as GlbJson;
}
