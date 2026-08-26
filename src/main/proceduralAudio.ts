import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const PROCEDURAL_AUDIO_PRESETS = [
  'pickup',
  'confirm',
  'hit',
  'explosion',
  'ambient',
] as const;

export type ProceduralAudioPreset = (typeof PROCEDURAL_AUDIO_PRESETS)[number];

export interface ProceduralAudioOptions {
  root: string;
  name: string;
  preset: ProceduralAudioPreset;
  durationSeconds?: number;
  seed?: number;
}

export interface ProceduralAudioResult {
  relativePath: string;
  durationSeconds: number;
  sampleRate: number;
  seed: number;
  preset: ProceduralAudioPreset;
}

const SAMPLE_RATE = 24_000;
const MIN_DURATION_SECONDS = 0.05;
const MAX_DURATION_SECONDS = 8;
const DEFAULT_DURATIONS: Record<ProceduralAudioPreset, number> = {
  pickup: 0.35,
  confirm: 0.55,
  hit: 0.25,
  explosion: 1.2,
  ambient: 8,
};

/** Writes a deterministic, mono PCM16 WAV into the project's public asset tree. */
export async function synthesizeProceduralWav(
  options: ProceduralAudioOptions,
): Promise<ProceduralAudioResult> {
  if (!isAbsolute(options.root)) throw new Error('Project root must be absolute');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(options.name)) {
    throw new Error('Audio name must use 1-64 letters, numbers, underscores, or hyphens');
  }
  if (!PROCEDURAL_AUDIO_PRESETS.includes(options.preset)) {
    throw new Error('Unknown procedural audio preset');
  }
  const durationSeconds = options.durationSeconds ?? DEFAULT_DURATIONS[options.preset];
  if (
    typeof durationSeconds !== 'number' ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < MIN_DURATION_SECONDS ||
    durationSeconds > MAX_DURATION_SECONDS
  ) {
    throw new Error('Audio duration must be between 0.05 and 8 seconds');
  }
  const seed = options.seed ?? 1;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error('Audio seed must be an integer from 0 to 4294967295');
  }

  const root = await realpath(resolve(options.root));
  const directory = await ensureAudioDirectory(root);
  const wav = createProceduralWav(options.preset, durationSeconds, seed);

  let destination: string | null = null;
  for (let index = 0; index < 1_000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const candidate = join(directory, `${options.name}${suffix}.wav`);
    assertContained(root, candidate);
    try {
      await writeFile(candidate, wav, { flag: 'wx', mode: 0o600 });
      destination = candidate;
      break;
    } catch (error) {
      if (isNodeError(error, 'EEXIST')) continue;
      throw error;
    }
  }
  if (!destination) throw new Error('Unable to choose an unused audio filename');

  return {
    relativePath: relative(root, destination).split(sep).join('/'),
    durationSeconds,
    sampleRate: SAMPLE_RATE,
    seed,
    preset: options.preset,
  };
}

async function ensureAudioDirectory(root: string): Promise<string> {
  let current = root;
  for (const segment of ['public', 'assets', 'audio']) {
    current = join(current, segment);
    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error) {
      if (!isNodeError(error, 'EEXIST')) throw error;
    }
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error('Audio asset directories cannot be symbolic links');
    }
    const canonical = await realpath(current);
    assertContained(root, canonical);
  }
  return current;
}

export function createProceduralWav(
  preset: ProceduralAudioPreset,
  durationSeconds: number,
  seed: number,
): Buffer {
  if (!PROCEDURAL_AUDIO_PRESETS.includes(preset)) throw new Error('Unknown procedural audio preset');
  if (!Number.isFinite(durationSeconds) || durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error('Audio duration must be between 0.05 and 8 seconds');
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error('Audio seed must be an integer from 0 to 4294967295');
  }
  const frameCount = Math.max(1, Math.round(durationSeconds * SAMPLE_RATE));
  const output = Buffer.allocUnsafe(44 + frameCount * 2);
  writeWavHeader(output, frameCount);
  const random = xorshift32(seed);
  let filteredNoise = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / SAMPLE_RATE;
    const progress = frame / Math.max(1, frameCount - 1);
    const noise = random() * 2 - 1;
    filteredNoise = filteredNoise * 0.86 + noise * 0.14;
    let sample: number;

    switch (preset) {
      case 'pickup': {
        const frequency = 520 + progress * 1_100;
        const envelope = Math.sin(Math.PI * progress) * Math.exp(-1.8 * progress);
        sample = (Math.sin(2 * Math.PI * frequency * time) + 0.3 * Math.sin(4 * Math.PI * frequency * time)) * envelope * 0.58;
        break;
      }
      case 'confirm': {
        const frequency = progress < 0.48 ? 523.25 : 783.99;
        const localProgress = progress < 0.48 ? progress / 0.48 : (progress - 0.48) / 0.52;
        const envelope = Math.sin(Math.PI * Math.min(1, localProgress)) * (1 - 0.25 * progress);
        sample = Math.sin(2 * Math.PI * frequency * time) * envelope * 0.62;
        break;
      }
      case 'hit': {
        const envelope = Math.exp(-11 * progress);
        sample = (noise * 0.78 + Math.sin(2 * Math.PI * 105 * time) * 0.4) * envelope;
        break;
      }
      case 'explosion': {
        const envelope = Math.exp(-4.8 * progress);
        const rumble = Math.sin(2 * Math.PI * (48 - 18 * progress) * time);
        sample = (filteredNoise * 0.95 + rumble * 0.55) * envelope * 0.82;
        break;
      }
      case 'ambient': {
        const fade = Math.min(1, progress * 8, (1 - progress) * 8);
        const drone =
          Math.sin(2 * Math.PI * 55 * time) * 0.32 +
          Math.sin(2 * Math.PI * 82.5 * time + 0.7) * 0.2 +
          Math.sin(2 * Math.PI * 110.2 * time + 1.4) * 0.12;
        sample = (drone + filteredNoise * 0.08) * Math.max(0, fade) * 0.6;
        break;
      }
    }

    const pcm = Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fff);
    output.writeInt16LE(pcm, 44 + frame * 2);
  }
  return output;
}

function writeWavHeader(output: Buffer, frameCount: number): void {
  const dataBytes = frameCount * 2;
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(36 + dataBytes, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(SAMPLE_RATE, 24);
  output.writeUInt32LE(SAMPLE_RATE * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(dataBytes, 40);
}

function xorshift32(initialSeed: number): () => number {
  let state = initialSeed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function assertContained(root: string, candidate: string): void {
  const value = relative(root, candidate);
  if (value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value))) return;
  throw new Error('Audio asset path escapes the project workspace');
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}
