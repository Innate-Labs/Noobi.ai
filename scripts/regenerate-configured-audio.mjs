/**
 * Regenerate GameAgent WAV assets from fresh ABC notation produced by the
 * desktop app's configured audio provider. Run this script with Electron so
 * safeStorage can decrypt the existing credential without exposing it.
 */

import { app, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AudioRenderService } from '../packages/core/dist/src/services/assetAudioService.js';

const gamesRoot = process.env.GAMEAGENT_GAMES_ROOT || process.argv[2];
if (!gamesRoot) {
  throw new Error(
    'Usage: electron scripts/regenerate-configured-audio.mjs <games-root>',
  );
}

const statePath =
  process.env.GAMEAGENT_STATE_PATH ||
  path.join(
    os.homedir(),
    'Library',
    'Application Support',
    '@gameagent',
    'desktop',
    'state.json',
  );

const ABC_SYSTEM_PROMPT = `You compose short, original game music and sound cues in ABC notation.
Return JSON only. Every notation must include X:, T:, M:, L:, Q:, K: and actual notes.
Make every requested track recognizably different. BGM should use 8-16 loop-friendly bars.
SFX should use 2-8 expressive notes with appropriate register, tempo, rests and direction.`;

await app.whenReady();
process.stdout.write('audio-regeneration: desktop security ready\n');

try {
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  const endpoint = state.settings?.audio;
  if (!endpoint) throw new Error('Audio provider settings are missing');

  const encryptedCredential = selectCredential(state, endpoint.provider);
  if (!encryptedCredential || !safeStorage.isEncryptionAvailable()) {
    throw new Error('The configured audio credential cannot be decrypted');
  }
  const apiKey = safeStorage.decryptString(
    Buffer.from(encryptedCredential, 'base64'),
  );
  process.stdout.write('audio-regeneration: credential loaded securely\n');

  const projectDirectories = await findProjectDirectories(gamesRoot);
  const renderer = new AudioRenderService('/gameagent/use-built-in-abc-synth');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const summaries = [];

  for (const projectDirectory of projectDirectories) {
    const assetsDirectory = path.join(projectDirectory, 'public', 'assets');
    const audioFiles = (await fs.readdir(assetsDirectory))
      .filter((file) => file.toLowerCase().endsWith('.wav'))
      .sort();
    if (audioFiles.length === 0) continue;

    const specifications = await Promise.all(
      audioFiles.map(async (file) => {
        const wav = await fs.readFile(path.join(assetsDirectory, file));
        return {
          key: path.basename(file, '.wav'),
          file,
          duration: readWavDuration(wav),
          type: inferAudioType(file),
        };
      }),
    );
    const gdd = await readOptional(
      path.join(projectDirectory, 'GAME_DESIGN.md'),
    );
    process.stdout.write(
      `audio-regeneration: composing ${path.basename(projectDirectory)} (${specifications.length} tracks)\n`,
    );
    const generated = await generateProjectABC({
      endpoint,
      apiKey,
      projectName: path.basename(projectDirectory),
      specifications,
      gdd,
    });

    const backupDirectory = path.join(
      projectDirectory,
      '.gameagent',
      `audio-backup-${timestamp}`,
    );
    const notationDirectory = path.join(
      projectDirectory,
      '.gameagent',
      'generated-audio',
    );
    await fs.mkdir(backupDirectory, { recursive: true });
    await fs.mkdir(notationDirectory, { recursive: true });

    const hashes = new Set();
    for (const specification of specifications) {
      const notation =
        generated.get(specification.key) ||
        createDeterministicABC(
          path.basename(projectDirectory),
          specification.key,
          specification.type,
        );
      const destination = path.join(assetsDirectory, specification.file);
      await fs.copyFile(
        destination,
        path.join(backupDirectory, specification.file),
      );
      const wav = await renderer.generateFromABC(
        notation,
        specification.type,
        specification.duration,
      );
      await fs.writeFile(destination, wav);
      await fs.writeFile(
        path.join(notationDirectory, `${specification.key}.abc`),
        notation,
        'utf8',
      );
      hashes.add(hashBuffer(wav));
    }

    summaries.push({
      project: path.basename(projectDirectory),
      regenerated: specifications.length,
      uniqueHashes: hashes.size,
      backupDirectory,
    });
    process.stdout.write(
      `audio-regeneration: rendered ${path.basename(projectDirectory)} (${hashes.size} unique hashes)\n`,
    );
  }

  process.stdout.write(`${JSON.stringify({ summaries }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `audio-regeneration failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  app.quit();
}

function selectCredential(state, provider) {
  const secrets = state.secrets || {};
  if (secrets.audio) return secrets.audio;
  if (state.settings?.reasoning?.provider === provider && secrets.reasoning) {
    return secrets.reasoning;
  }
  if (state.settings?.main?.provider === provider) return secrets.main;
  return undefined;
}

async function findProjectDirectories(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const directories = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name);
    try {
      await fs.access(path.join(candidate, 'public', 'assets'));
      directories.push(candidate);
    } catch {
      // Not a generated GameAgent project.
    }
  }
  return directories.sort();
}

async function generateProjectABC({
  endpoint,
  apiKey,
  projectName,
  specifications,
  gdd,
}) {
  const prompt = `Generate fresh ABC notation for every audio asset in the game "${projectName}".

Assets:
${JSON.stringify(specifications, null, 2)}

Relevant design context:
${extractAudioContext(
  gdd,
  specifications.map((item) => item.key),
)}

Return exactly this JSON shape:
{"tracks":[{"key":"asset_key","notation":"X:1\\nT:...\\nM:4/4\\nL:1/8\\nQ:1/4=120\\nK:C\\n..."}]}`;
  const content = await requestTextModel(endpoint, apiKey, prompt);
  const parsed = parseJsonObject(content);
  const tracks = Array.isArray(parsed?.tracks) ? parsed.tracks : [];
  const result = new Map();
  for (const track of tracks) {
    if (
      typeof track?.key === 'string' &&
      typeof track?.notation === 'string' &&
      isValidABC(track.notation)
    ) {
      result.set(track.key, track.notation.replace(/\\n/g, '\n').trim());
    }
  }
  return result;
}

async function requestTextModel(endpoint, apiKey, prompt) {
  if (endpoint.provider === 'tongyi') {
    const response = await fetch(
      `${trimSlashes(endpoint.baseUrl)}/api/v1/services/aigc/text-generation/generation`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(180000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: endpoint.model,
          input: {
            messages: [
              { role: 'system', content: ABC_SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
          },
          parameters: {
            result_format: 'message',
            max_tokens: 8192,
            temperature: 1.35,
          },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Audio provider request failed (${response.status})`);
    }
    const data = await response.json();
    return data.output?.choices?.[0]?.message?.content || '';
  }

  const response = await fetch(
    `${trimSlashes(endpoint.baseUrl)}/chat/completions`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(180000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: endpoint.model,
        messages: [
          { role: 'system', content: ABC_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 8192,
        temperature: 1.35,
        response_format: { type: 'json_object' },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Audio provider request failed (${response.status})`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function extractAudioContext(gdd, keys) {
  if (!gdd) return 'No GDD available; infer intent from each asset key.';
  const lines = gdd.split('\n');
  const selected = lines.filter((line) =>
    keys.some((key) => line.includes(key)),
  );
  return selected.join('\n').slice(0, 12000) || gdd.slice(0, 4000);
}

function parseJsonObject(content) {
  const normalized = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  const start = normalized.indexOf('{');
  const end = normalized.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  return JSON.parse(normalized.slice(start, end + 1));
}

function isValidABC(notation) {
  return (
    notation.includes('X:') &&
    notation.includes('K:') &&
    /(?:^|\s|\|)[\^_=]*[A-Ga-g]/m.test(notation.replace(/\\n/g, '\n'))
  );
}

function createDeterministicABC(projectName, key, type) {
  const seed = hashString(`${projectName}/${key}`);
  const roots = ['C', 'D', 'E', 'F', 'G', 'A'];
  const scale = ['C', 'D', 'E', 'G', 'A', 'c', 'd', 'e'];
  const rotated = scale.map(
    (_, index) => scale[(index + (seed % scale.length)) % scale.length],
  );
  const notes =
    type === 'bgm'
      ? [...rotated, ...rotated.slice().reverse()]
      : rotated.slice(0, 5);
  return `X:1
T:${key}
M:4/4
L:${type === 'bgm' ? '1/8' : '1/16'}
Q:1/4=${type === 'bgm' ? 96 + (seed % 48) : 180 + (seed % 80)}
K:${roots[seed % roots.length]}${type === 'bgm' && seed % 2 ? 'm' : ''}
|: ${notes.join(' ')} :|`;
}

function inferAudioType(file) {
  return /bgm|music|theme|ambience/i.test(file) ? 'bgm' : 'sfx';
}

function readWavDuration(buffer) {
  if (buffer.length < 44 || buffer.subarray(0, 4).toString() !== 'RIFF')
    return 1;
  const byteRate = buffer.readUInt32LE(28);
  const dataSize = buffer.readUInt32LE(40);
  return Math.max(0.1, Math.min(120, dataSize / Math.max(1, byteRate)));
}

async function readOptional(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '';
  }
}

function trimSlashes(value) {
  return value.replace(/\/+$/, '');
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashBuffer(buffer) {
  let hash = 2166136261;
  for (const value of buffer) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
