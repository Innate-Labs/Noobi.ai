import { access, mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProceduralWav, synthesizeProceduralWav } from './proceduralAudio.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('procedural audio', () => {
  it('creates deterministic mono PCM16 WAV data', () => {
    const first = createProceduralWav('explosion', 0.2, 42);
    const repeated = createProceduralWav('explosion', 0.2, 42);
    const otherSeed = createProceduralWav('explosion', 0.2, 43);

    expect(first.equals(repeated)).toBe(true);
    expect(first.equals(otherSeed)).toBe(false);
    expect(first.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(first.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(first.readUInt16LE(20)).toBe(1);
    expect(first.readUInt16LE(22)).toBe(1);
    expect(first.readUInt32LE(24)).toBe(24_000);
    expect(first.readUInt16LE(34)).toBe(16);
    expect(first.length).toBe(44 + Math.round(0.2 * 24_000) * 2);
  });

  it('writes only safe workspace-relative audio filenames', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-audio-test-'));
    roots.push(root);
    const result = await synthesizeProceduralWav({
      root,
      name: 'pickup_chime',
      preset: 'pickup',
      durationSeconds: 0.1,
      seed: 7,
    });

    expect(result.relativePath).toBe('public/assets/audio/pickup_chime.wav');
    const file = await readFile(join(root, result.relativePath));
    expect(file.subarray(0, 4).toString('ascii')).toBe('RIFF');
    await expect(
      synthesizeProceduralWav({ root, name: '../escape', preset: 'hit' }),
    ).rejects.toThrow(/Audio name/u);
    await expect(
      synthesizeProceduralWav({ root, name: 'too-long', preset: 'ambient', durationSeconds: 8.01 }),
    ).rejects.toThrow(/between 0\.05 and 8/u);
  });

  it('rejects a symlinked audio directory that leaves the workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-audio-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'noobi-audio-outside-'));
    roots.push(root, outside);
    await mkdir(join(root, 'public', 'assets'), { recursive: true });
    await symlink(outside, join(root, 'public', 'assets', 'audio'));

    await expect(
      synthesizeProceduralWav({ root, name: 'blocked', preset: 'confirm' }),
    ).rejects.toThrow(/symbolic links/u);
  });

  it('does not create directories through a symlinked parent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-audio-parent-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'noobi-audio-parent-outside-'));
    roots.push(root, outside);
    await symlink(outside, join(root, 'public'));

    await expect(
      synthesizeProceduralWav({ root, name: 'blocked', preset: 'confirm' }),
    ).rejects.toThrow(/symbolic links/u);
    await expect(access(join(outside, 'assets'))).rejects.toThrow();
  });
});
