/**
 * Audio Generation Service
 * Generates game audio using ABC Notation + LLM
 * Inspired by PiXelDa's music generation architecture
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { BaseService } from './assetBaseService.js';
import type {
  AudioModelConfig,
  AudioRequest,
} from '../tools/generate-assets-types.js';

// ============== ABC Notation System Prompt ==============

const ABC_SYSTEM_PROMPT = `You are a helpful assistant that generates creative and original music in ABC notation format.

CRITICAL ABC FORMAT RULES:
1. MUST start with X: (reference number)
2. MUST have T: (title)
3. MUST have M: (meter like 4/4)
4. MUST have L: (default note length like 1/8)
5. MUST have Q: (tempo like 1/4=120)
6. MUST have K: (key like C, G, Am)
7. MUST have actual notes in the body (CDEFGAB or cdefgab)

Notes Reference:
- C D E F G A B = lower octave
- c d e f g a b = higher octave  
- c' d' = even higher octave
- C, D, = lower octave
- z = rest
- A2 = double length, A/2 = half length
- | = bar line, |] = end

VALID EXAMPLE:
X:1
T:Game Theme
M:4/4
L:1/8
Q:1/4=120
K:C
|: CDEF GABc | cBAG FEDC | EFGA Bcde | dcBA GFED :|
|: cdef gabc' | c'bag fedc | efga bc'ed | cBAG FEDC :|

Generate catchy, loop-friendly game music with ACTUAL NOTES.`;

const ABC_GEN_PROMPT = `Generate ABC notation for game audio:

Duration: ~{duration} seconds
Type: {audioType}
Genre: {genre}
Tempo: {tempo}
Description: {description}

Return JSON with:
- notation: Complete ABC notation string
- comments: Brief notes

CRITICAL REQUIREMENTS:
1. notation MUST contain actual notes (CDEFGAB or cdefgab)
2. notation MUST have all required headers (X:, T:, M:, L:, Q:, K:)
3. For BGM: Use repeats |: :| for looping, at least 4-8 bars
4. For SFX: Short melody, 1-2 bars

Example good notation for BGM:
"X:1\\nT:Adventure\\nM:4/4\\nL:1/8\\nQ:1/4=120\\nK:G\\n|: GABc d2BA | GABc d2dc | BAGF E2FG | A4 G4 :|"

Example good notation for SFX:
"X:1\\nT:Jump\\nM:4/4\\nL:1/16\\nQ:1/4=180\\nK:C\\nCEGc c'2z2 |]"`;

export interface DirectAudioResult {
  buffer: Buffer;
  extension: 'mp3' | 'wav';
  contentType: 'audio/mpeg' | 'audio/wav';
}

function joinApiUrl(baseUrl: string, pathName: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = pathName.startsWith('/') ? pathName : `/${pathName}`;
  if (normalizedBase.endsWith('/v1') && normalizedPath.startsWith('/v1/')) {
    return `${normalizedBase}${normalizedPath.slice(3)}`;
  }
  return `${normalizedBase}${normalizedPath}`;
}

function clampDuration(
  duration: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const candidate = Number.isFinite(duration) ? Number(duration) : fallback;
  return Math.min(maximum, Math.max(minimum, candidate));
}

function professionalAudioPrompt(request: AudioRequest): string {
  const details = [
    request.description,
    request.genre ? `Genre: ${request.genre}.` : '',
    request.tempo ? `Tempo: ${request.tempo}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  if (request.audioType === 'sfx') {
    return `Professional one-shot video game sound effect. ${details} No speech, no vocals, clean transient, minimal silence, production-ready.`;
  }
  return `Professional instrumental video game background music. ${details} No vocals, loop-friendly structure, clean mix, production-ready.`;
}

async function apiError(provider: string, response: Response): Promise<Error> {
  const body = (await response.text()).slice(0, 2000);
  return new Error(`${provider} API failed: ${response.status} - ${body}`);
}

async function audioResponse(
  provider: string,
  response: Response,
  extension: 'mp3' | 'wav',
): Promise<DirectAudioResult> {
  if (!response.ok) throw await apiError(provider, response);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error(`${provider} returned empty audio`);
  return {
    buffer,
    extension,
    contentType: extension === 'wav' ? 'audio/wav' : 'audio/mpeg',
  };
}

// ============== Tongyi Audio Service ==============

export class TongyiAudioService extends BaseService {
  private config: AudioModelConfig;

  constructor(config: AudioModelConfig) {
    super();
    this.config = config;
  }

  async generateABC(request: AudioRequest): Promise<string> {
    this.log(
      `Generating ABC notation with Tongyi: ${request.description.substring(0, 50)}...`,
    );

    const url = `${this.config.baseUrl}/api/v1/services/aigc/text-generation/generation`;

    const userPrompt = ABC_GEN_PROMPT.replace(
      '{duration}',
      String(request.duration || 30),
    )
      .replace('{audioType}', request.audioType)
      .replace('{genre}', request.genre || 'electronic')
      .replace('{tempo}', request.tempo || 'medium')
      .replace('{description}', request.description);

    const payload = {
      model: this.config.modelNameChat,
      input: {
        messages: [
          { role: 'system', content: ABC_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      },
      parameters: {
        result_format: 'message',
        max_tokens: this.config.maxTokens || 2048,
        temperature: 1.5,
        presence_penalty: 2,
      },
    };

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Tongyi Chat API failed: ${response.status} - ${errorBody}`,
      );
    }

    const data = (await response.json()) as {
      output?: { choices?: Array<{ message?: { content?: string } }> };
    };
    const content = data.output?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Tongyi returned no content');
    }

    let notation = content;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        notation = parsed.notation || content;
      }
    } catch {
      this.log('Failed to parse JSON, extracting ABC directly', 'warn');
    }

    notation = normalizeABCNotation(notation);

    if (!isValidABCNotation(notation)) {
      this.log(`Invalid ABC notation generated, will use fallback`, 'warn');
      throw new Error(
        'Generated ABC notation is invalid (missing notes or headers)',
      );
    }

    return notation;
  }
}

// ============== Shared ABC Notation Utilities ==============

function normalizeABCNotation(notation: string): string {
  let normalized = notation.replace(/\\n/g, '\n');

  normalized = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return normalized;
}

function isValidABCNotation(notation: string): boolean {
  if (!notation.includes('X:')) {
    console.warn('[ABC] Missing X: header');
    return false;
  }

  if (!notation.includes('K:')) {
    console.warn('[ABC] Missing K: header');
    return false;
  }

  const notePattern = /[CDEFGABcdefgab][,']*[0-9/]*/;
  const lines = notation.split('\n');
  let hasNotes = false;

  for (const line of lines) {
    if (line.match(/^[A-Z]:/)) continue;
    if (line.match(notePattern)) {
      hasNotes = true;
      break;
    }
  }

  if (!hasNotes) {
    console.warn('[ABC] No valid notes found in ABC notation');
    return false;
  }

  return true;
}

// ============== Doubao Audio Service ==============

export class DoubaoAudioService extends BaseService {
  private config: AudioModelConfig;
  private arkBaseUrl: string;

  constructor(config: AudioModelConfig) {
    super();
    this.config = config;
    this.arkBaseUrl =
      config.baseUrl && config.baseUrl.length > 0
        ? config.baseUrl
        : 'https://ark.cn-beijing.volces.com/api/v3';
  }

  async generateABC(request: AudioRequest): Promise<string> {
    this.log(
      `Generating ABC notation with Doubao: ${request.description.substring(0, 50)}...`,
    );

    const url = `${this.arkBaseUrl}/chat/completions`;

    const userPrompt = ABC_GEN_PROMPT.replace(
      '{duration}',
      String(request.duration || 30),
    )
      .replace('{audioType}', request.audioType)
      .replace('{genre}', request.genre || 'electronic')
      .replace('{tempo}', request.tempo || 'medium')
      .replace('{description}', request.description);

    const payload = {
      model: this.config.modelNameChat,
      messages: [
        { role: 'system', content: ABC_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: this.config.maxTokens || 2048,
      temperature: 1.5,
      response_format: { type: 'json_object' },
    };

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Doubao Chat API failed: ${response.status} - ${errorBody}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Doubao returned no content');
    }

    let notation = content;
    try {
      const parsed = JSON.parse(content);
      notation = parsed.notation || content;
    } catch {
      this.log('Failed to parse JSON, extracting ABC directly', 'warn');
    }

    notation = normalizeABCNotation(notation);

    if (!isValidABCNotation(notation)) {
      this.log(`Invalid ABC notation generated, will use fallback`, 'warn');
      throw new Error(
        'Generated ABC notation is invalid (missing notes or headers)',
      );
    }

    return notation;
  }
}

// ============== Audio Rendering Service ==============

export class AudioRenderService extends BaseService {
  private pythonPath: string;
  private symusicAvailable: boolean | null = null;

  constructor(pythonPath?: string) {
    super();
    this.pythonPath = pythonPath || process.env.PYTHON_PATH || 'python3';
  }

  async isSymusicAvailable(): Promise<boolean> {
    if (this.symusicAvailable !== null) {
      return this.symusicAvailable;
    }

    return new Promise((resolve) => {
      const proc = spawn(
        this.pythonPath,
        ['-c', 'from symusic import Score, Synthesizer, dump_wav; print("ok")'],
        {
          stdio: 'pipe',
        },
      );

      proc.on('close', (code) => {
        this.symusicAvailable = code === 0;
        resolve(this.symusicAvailable);
      });

      proc.on('error', () => {
        this.symusicAvailable = false;
        resolve(false);
      });
    });
  }

  async abcToWav(
    abcNotation: string,
    chiptune: boolean = true,
  ): Promise<Buffer> {
    this.log(`Converting ABC to WAV via symusic (chiptune=${chiptune})...`);

    const available = await this.isSymusicAvailable();
    if (!available) {
      throw new Error('symusic not available in Python environment');
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abc-'));
    const abcPath = path.join(tempDir, 'music.abc');
    const wavPath = path.join(tempDir, 'output.wav');

    try {
      await fs.writeFile(abcPath, abcNotation, 'utf-8');

      const pythonScript = `
import sys
from symusic import Score, Synthesizer, dump_wav

abc_path = sys.argv[1]
wav_path = sys.argv[2]

with open(abc_path, 'r', encoding='utf-8') as f:
    abc_notation = f.read()

score = Score.from_abc(abc_notation, ttype="tick")
synth = Synthesizer()
audio = synth.render(score, True)
dump_wav(wav_path, audio, sample_rate=44100, use_int16=True)
print("ok")
`;

      const args = ['-c', pythonScript, abcPath, wavPath];

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(this.pythonPath, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stderr = '';
        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(`symusic conversion failed (code ${code}): ${stderr}`),
            );
          }
        });

        proc.on('error', (err) => {
          reject(new Error(`symusic spawn error: ${err.message}`));
        });
      });

      const wavBuffer = await fs.readFile(wavPath);
      this.log(`ABC → WAV conversion successful (${wavBuffer.length} bytes)`);
      return wavBuffer;
    } finally {
      try {
        await fs.unlink(abcPath);
        await fs.unlink(wavPath);
        await fs.rmdir(tempDir);
      } catch {
        // best-effort cleanup; ignore failures
      }
    }
  }

  async generateFromABC(
    abcNotation: string,
    type: 'sfx' | 'bgm' = 'bgm',
    durationSeconds: number = 5,
  ): Promise<Buffer> {
    try {
      const chiptune = true;
      return await this.abcToWav(abcNotation, chiptune);
    } catch (error) {
      this.log(
        `ABC conversion failed: ${error}, using the built-in ABC synthesizer`,
        'warn',
      );
      return this.generateABCFallbackWav(abcNotation, durationSeconds, type);
    }
  }

  /**
   * Render the notes from ABC directly when the optional Python/symusic
   * pipeline is unavailable. Unlike generateGameAudio(), this path preserves
   * the melody, tempo, rests, octaves, accidentals and note lengths produced
   * by the configured audio model, so unrelated requests cannot silently
   * collapse to the same placeholder WAV.
   */
  private async generateABCFallbackWav(
    abcNotation: string,
    durationSeconds: number,
    type: 'sfx' | 'bgm',
  ): Promise<Buffer> {
    const sequence = parseABCSequence(abcNotation);
    if (sequence.events.length === 0) {
      this.log(
        'Built-in ABC synthesizer found no notes; using procedural fallback',
        'warn',
      );
      return this.generateGameAudio(durationSeconds, type);
    }

    const sampleRate = 44100;
    const numChannels = 1;
    const bitsPerSample = 16;
    const requestedDuration = Math.max(0.1, Math.min(durationSeconds, 120));
    const numSamples = Math.floor(sampleRate * requestedDuration);
    const dataSize = numSamples * 2;
    const buffer = createMonoWavBuffer(
      sampleRate,
      bitsPerSample,
      numChannels,
      dataSize,
    );

    const seed = hashString(abcNotation);
    const sequenceDuration = sequence.events.reduce(
      (sum, event) => sum + event.duration,
      0,
    );
    let eventIndex = 0;
    let eventStart = 0;
    let event = sequence.events[0];

    for (let i = 0; i < numSamples; i++) {
      let time = i / sampleRate;
      if (type === 'bgm' && sequenceDuration > 0) {
        time %= sequenceDuration;
        if (time < eventStart) {
          eventIndex = 0;
          eventStart = 0;
          event = sequence.events[0];
        }
      }

      while (
        eventIndex < sequence.events.length - 1 &&
        time >= eventStart + event.duration
      ) {
        eventStart += event.duration;
        eventIndex += 1;
        event = sequence.events[eventIndex];
      }

      let sample = 0;
      const eventPosition = time - eventStart;
      const eventIsActive =
        eventPosition >= 0 &&
        eventPosition < event.duration &&
        (type === 'bgm' || time < sequenceDuration);

      if (eventIsActive && event.frequency !== null) {
        const phase = 2 * Math.PI * event.frequency * eventPosition;
        const sine = Math.sin(phase);
        const square = sine >= 0 ? 1 : -1;
        const triangle = (2 / Math.PI) * Math.asin(sine);
        const harmonic = Math.sin(phase * 2) * 0.18;
        const timbre = (seed % 7) / 20;

        sample =
          type === 'bgm'
            ? triangle * (0.72 - timbre) + square * timbre + harmonic
            : square * 0.64 + sine * 0.24 + deterministicNoise(i, seed) * 0.12;

        const attack = Math.min(
          type === 'bgm' ? 0.018 : 0.004,
          event.duration * 0.2,
        );
        const release = Math.min(
          type === 'bgm' ? 0.08 : 0.035,
          event.duration * 0.35,
        );
        let envelope = 1;
        if (attack > 0 && eventPosition < attack) {
          envelope = eventPosition / attack;
        }
        const remaining = event.duration - eventPosition;
        if (release > 0 && remaining < release) {
          envelope = Math.min(envelope, remaining / release);
        }
        sample *= Math.max(0, envelope);
      }

      const amplitude = type === 'bgm' ? 7800 : 11000;
      const intSample = Math.max(
        -32768,
        Math.min(32767, Math.round(sample * amplitude)),
      );
      buffer.writeInt16LE(intSample, 44 + i * 2);
    }

    this.log(
      `Built-in ABC synthesis successful (${sequence.events.length} events, ${buffer.length} bytes)`,
    );
    return buffer;
  }

  async generateGameAudio(
    durationSeconds: number = 1,
    type: 'sfx' | 'bgm' = 'sfx',
  ): Promise<Buffer> {
    this.log(`Generating procedural ${type} audio (${durationSeconds}s)...`);

    if (type === 'sfx') {
      return this.generateSfxWav(durationSeconds);
    } else {
      return this.generateBgmWav(durationSeconds);
    }
  }

  private async generateSfxWav(durationSeconds: number = 1): Promise<Buffer> {
    this.log(`Generating SFX WAV (${durationSeconds}s)...`);

    const sampleRate = 44100;
    const numChannels = 1;
    const bitsPerSample = 16;
    const numSamples = Math.floor(sampleRate * durationSeconds);
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = numSamples * blockAlign;
    const fileSize = 36 + dataSize;

    const buffer = Buffer.alloc(44 + dataSize);
    let offset = 0;

    buffer.write('RIFF', offset);
    offset += 4;
    buffer.writeUInt32LE(fileSize, offset);
    offset += 4;
    buffer.write('WAVE', offset);
    offset += 4;
    buffer.write('fmt ', offset);
    offset += 4;
    buffer.writeUInt32LE(16, offset);
    offset += 4;
    buffer.writeUInt16LE(1, offset);
    offset += 2;
    buffer.writeUInt16LE(numChannels, offset);
    offset += 2;
    buffer.writeUInt32LE(sampleRate, offset);
    offset += 4;
    buffer.writeUInt32LE(byteRate, offset);
    offset += 4;
    buffer.writeUInt16LE(blockAlign, offset);
    offset += 2;
    buffer.writeUInt16LE(bitsPerSample, offset);
    offset += 2;
    buffer.write('data', offset);
    offset += 4;
    buffer.writeUInt32LE(dataSize, offset);
    offset += 4;

    const startFreq = 200;
    const endFreq = 800;
    const amplitude = 12000;

    for (let i = 0; i < numSamples; i++) {
      const t = i / numSamples;
      const freq = startFreq + (endFreq - startFreq) * t;

      const phase = ((2 * Math.PI * freq * i) / sampleRate) % (2 * Math.PI);
      const sample = phase < Math.PI ? amplitude : -amplitude;

      const fadeLength = sampleRate * 0.05;
      let envelope = 1;
      if (i < fadeLength) envelope = i / fadeLength;
      else if (i > numSamples - fadeLength)
        envelope = (numSamples - i) / fadeLength;

      buffer.writeInt16LE(Math.round(sample * envelope), offset);
      offset += 2;
    }

    return buffer;
  }

  private async generateBgmWav(durationSeconds: number = 5): Promise<Buffer> {
    this.log(`Generating BGM WAV (${durationSeconds}s)...`);

    const sampleRate = 44100;
    const numChannels = 1;
    const bitsPerSample = 16;
    const numSamples = Math.floor(sampleRate * durationSeconds);
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = numSamples * blockAlign;
    const fileSize = 36 + dataSize;

    const buffer = Buffer.alloc(44 + dataSize);
    let offset = 0;

    buffer.write('RIFF', offset);
    offset += 4;
    buffer.writeUInt32LE(fileSize, offset);
    offset += 4;
    buffer.write('WAVE', offset);
    offset += 4;
    buffer.write('fmt ', offset);
    offset += 4;
    buffer.writeUInt32LE(16, offset);
    offset += 4;
    buffer.writeUInt16LE(1, offset);
    offset += 2;
    buffer.writeUInt16LE(numChannels, offset);
    offset += 2;
    buffer.writeUInt32LE(sampleRate, offset);
    offset += 4;
    buffer.writeUInt32LE(byteRate, offset);
    offset += 4;
    buffer.writeUInt16LE(blockAlign, offset);
    offset += 2;
    buffer.writeUInt16LE(bitsPerSample, offset);
    offset += 2;
    buffer.write('data', offset);
    offset += 4;
    buffer.writeUInt32LE(dataSize, offset);
    offset += 4;

    const notes = [261.63, 329.63, 392.0, 523.25];
    const bpm = 120;
    const beatDuration = 60 / bpm;
    const noteDuration = beatDuration * 0.5;
    const noteSamples = Math.floor(sampleRate * noteDuration);
    const amplitude = 8000;

    for (let i = 0; i < numSamples; i++) {
      const noteIndex = Math.floor((i / noteSamples) % notes.length);
      const freq = notes[noteIndex];
      const notePosition = i % noteSamples;

      const phase = ((2 * Math.PI * freq * i) / sampleRate) % (2 * Math.PI);
      const triangle = Math.abs(phase / Math.PI - 1) * 2 - 1;
      const sample = triangle * amplitude;

      let envelope = 1;
      const attackSamples = noteSamples * 0.1;
      const decaySamples = noteSamples * 0.3;

      if (notePosition < attackSamples) {
        envelope = notePosition / attackSamples;
      } else if (notePosition > noteSamples - decaySamples) {
        envelope = (noteSamples - notePosition) / decaySamples;
      }

      buffer.writeInt16LE(Math.round(sample * envelope * 0.7), offset);
      offset += 2;
    }

    return buffer;
  }
}

interface ABCEvent {
  frequency: number | null;
  duration: number;
}

function parseABCSequence(notation: string): { events: ABCEvent[] } {
  const tempoMatch = notation.match(/^Q:\s*(?:\d+\/\d+=)?(\d+)/m);
  const bpm = Math.max(30, Math.min(300, Number(tempoMatch?.[1] ?? 120)));
  const lengthMatch = notation.match(/^L:\s*(\d+)\/(\d+)/m);
  const lengthNumerator = Number(lengthMatch?.[1] ?? 1);
  const lengthDenominator = Number(lengthMatch?.[2] ?? 8);
  const defaultNoteSeconds =
    (lengthNumerator / Math.max(1, lengthDenominator)) * 4 * (60 / bpm);

  const body = notation
    .split('\n')
    .filter((line) => !/^[A-Za-z]:/.test(line.trim()))
    .map((line) => line.replace(/%.+$/, ''))
    .join(' ');
  const notePattern = /([\^_=]*)([A-Ga-gzZ])([,']*)(\d+(?:\/\d+)?|\/\d+|\/)?/g;
  const events: ABCEvent[] = [];

  for (const match of body.matchAll(notePattern)) {
    const [, accidental, note, octaveMarks, lengthToken] = match;
    const duration = Math.max(
      0.01,
      defaultNoteSeconds * parseABCLength(lengthToken),
    );
    if (note.toLowerCase() === 'z') {
      events.push({ frequency: null, duration });
      continue;
    }

    const semitones: Record<string, number> = {
      C: 0,
      D: 2,
      E: 4,
      F: 5,
      G: 7,
      A: 9,
      B: 11,
    };
    let midi =
      (note === note.toLowerCase() ? 72 : 60) + semitones[note.toUpperCase()];
    for (const mark of octaveMarks) midi += mark === "'" ? 12 : -12;
    if (!accidental.includes('=')) {
      midi += [...accidental].reduce(
        (sum, symbol) => sum + (symbol === '^' ? 1 : symbol === '_' ? -1 : 0),
        0,
      );
    }
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    events.push({ frequency, duration });
  }

  return { events };
}

function parseABCLength(token: string | undefined): number {
  if (!token) return 1;
  if (token === '/') return 0.5;
  if (token.startsWith('/')) {
    return 1 / Math.max(1, Number(token.slice(1) || 2));
  }
  if (token.includes('/')) {
    const [numerator, denominator] = token.split('/').map(Number);
    return numerator / Math.max(1, denominator);
  }
  return Math.max(0.01, Number(token));
}

function createMonoWavBuffer(
  sampleRate: number,
  bitsPerSample: number,
  numChannels: number,
  dataSize: number,
): Buffer {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;
  buffer.write('RIFF', offset);
  offset += 4;
  buffer.writeUInt32LE(36 + dataSize, offset);
  offset += 4;
  buffer.write('WAVE', offset);
  offset += 4;
  buffer.write('fmt ', offset);
  offset += 4;
  buffer.writeUInt32LE(16, offset);
  offset += 4;
  buffer.writeUInt16LE(1, offset);
  offset += 2;
  buffer.writeUInt16LE(numChannels, offset);
  offset += 2;
  buffer.writeUInt32LE(sampleRate, offset);
  offset += 4;
  buffer.writeUInt32LE(byteRate, offset);
  offset += 4;
  buffer.writeUInt16LE(blockAlign, offset);
  offset += 2;
  buffer.writeUInt16LE(bitsPerSample, offset);
  offset += 2;
  buffer.write('data', offset);
  offset += 4;
  buffer.writeUInt32LE(dataSize, offset);
  return buffer;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicNoise(index: number, seed: number): number {
  let value = Math.imul(index + 1, 1103515245) + seed;
  value ^= value >>> 16;
  return ((value >>> 0) / 0xffffffff) * 2 - 1;
}

// ============== OpenAI-Compatible Audio Service ==============
//
// "Audio" in OpenGame really means "ABC-notation generation by an LLM,
// then locally rendered to WAV via symusic". So an OpenAI-compatible
// audio provider just hits the standard /chat/completions endpoint with
// the ABC system prompt — no audio-specific API is required on the
// provider side.

export class OpenAICompatAudioService extends BaseService {
  private config: AudioModelConfig;

  constructor(config: AudioModelConfig) {
    super();
    this.config = config;
  }

  async generateABC(request: AudioRequest): Promise<string> {
    this.log(
      `Generating ABC notation via OpenAI-compat: ${request.description.substring(0, 50)}...`,
    );

    const url = `${this.config.baseUrl}/chat/completions`;

    const userPrompt = ABC_GEN_PROMPT.replace(
      '{duration}',
      String(request.duration || 30),
    )
      .replace('{audioType}', request.audioType)
      .replace('{genre}', request.genre || 'electronic')
      .replace('{tempo}', request.tempo || 'medium')
      .replace('{description}', request.description);

    const payload = {
      model: this.config.modelNameChat,
      messages: [
        { role: 'system', content: ABC_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: this.config.maxTokens || 2048,
      temperature: 1.5,
    };

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI-compat chat API failed: ${response.status} - ${errorBody}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI-compat chat API returned no content');
    }

    let notation = content;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { notation?: string };
        notation = parsed.notation || content;
      }
    } catch {
      this.log('Failed to parse JSON, extracting ABC directly', 'warn');
    }

    notation = normalizeABCNotation(notation);

    if (!isValidABCNotation(notation)) {
      this.log(`Invalid ABC notation generated, will use fallback`, 'warn');
      throw new Error(
        'Generated ABC notation is invalid (missing notes or headers)',
      );
    }

    return notation;
  }
}

// ============== Professional Direct Audio Services ==============

export class ElevenLabsAudioService extends BaseService {
  constructor(private readonly config: AudioModelConfig) {
    super();
  }

  async generateAudio(request: AudioRequest): Promise<DirectAudioResult> {
    const isSfx = request.audioType === 'sfx';
    const url = isSfx
      ? `${joinApiUrl(this.config.baseUrl, '/v1/sound-generation')}?output_format=mp3_44100_128`
      : `${joinApiUrl(this.config.baseUrl, '/v1/music')}?output_format=mp3_44100_128`;
    const payload = isSfx
      ? {
          text: professionalAudioPrompt(request).slice(0, 2500),
          duration_seconds: clampDuration(request.duration, 2, 0.5, 30),
          prompt_influence: 0.45,
          loop: false,
          model_id: 'eleven_text_to_sound_v2',
        }
      : {
          prompt: professionalAudioPrompt(request).slice(0, 4100),
          music_length_ms: Math.round(
            clampDuration(request.duration, 30, 3, 600) * 1000,
          ),
          force_instrumental: true,
          model_id: this.config.modelNameChat || 'music_v2',
        };
    const response = await this.fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.config.apiKey,
        },
        body: JSON.stringify(payload),
      },
      0,
    );
    return audioResponse('ElevenLabs', response, 'mp3');
  }
}

export class MiniMaxAudioService extends BaseService {
  constructor(private readonly config: AudioModelConfig) {
    super();
  }

  async generateAudio(
    request: AudioRequest,
  ): Promise<DirectAudioResult | null> {
    if (request.audioType === 'sfx') return null;
    const response = await this.fetchWithRetry(
      joinApiUrl(this.config.baseUrl, '/v1/music_generation'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.modelNameChat || 'music-2.6-free',
          prompt: professionalAudioPrompt(request).slice(0, 2000),
          stream: false,
          output_format: 'hex',
          is_instrumental: true,
          aigc_watermark: false,
          audio_setting: {
            sample_rate: 44100,
            bitrate: 256000,
            format: 'mp3',
          },
        }),
      },
      0,
    );
    if (!response.ok) throw await apiError('MiniMax Music', response);
    const data = (await response.json()) as {
      data?: { audio?: string; status?: number };
      base_resp?: { status_code?: number; status_msg?: string };
    };
    if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
      throw new Error(
        `MiniMax Music API failed: ${data.base_resp.status_code} - ${data.base_resp.status_msg || 'Unknown error'}`,
      );
    }
    const audio = data.data?.audio;
    if (!audio) throw new Error('MiniMax Music returned no audio');
    if (/^https?:\/\//i.test(audio)) {
      const download = await this.fetchWithRetry(audio, {}, 1);
      return audioResponse('MiniMax Music download', download, 'mp3');
    }
    if (!/^[0-9a-f]+$/i.test(audio) || audio.length % 2 !== 0) {
      throw new Error('MiniMax Music returned an invalid audio payload');
    }
    return {
      buffer: Buffer.from(audio, 'hex'),
      extension: 'mp3',
      contentType: 'audio/mpeg',
    };
  }
}

export class StabilityAudioService extends BaseService {
  constructor(private readonly config: AudioModelConfig) {
    super();
  }

  async generateAudio(request: AudioRequest): Promise<DirectAudioResult> {
    const form = new FormData();
    form.append('prompt', professionalAudioPrompt(request).slice(0, 10000));
    form.append('model', this.config.modelNameChat || 'stable-audio-3');
    form.append(
      'duration',
      String(
        clampDuration(
          request.duration,
          request.audioType === 'sfx' ? 2 : 30,
          1,
          380,
        ),
      ),
    );
    form.append('output_format', 'mp3');
    const createResponse = await this.fetchWithRetry(
      joinApiUrl(
        this.config.baseUrl,
        '/v2beta/audio/stable-audio/text-to-audio',
      ),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: 'application/json',
        },
        body: form,
      },
      0,
    );
    if (!createResponse.ok)
      throw await apiError('Stable Audio', createResponse);
    const task = (await createResponse.json()) as { id?: string };
    if (!task.id) throw new Error('Stable Audio returned no generation ID');

    const resultUrl = joinApiUrl(
      this.config.baseUrl,
      `/v2beta/audio/results/${encodeURIComponent(task.id)}`,
    );
    for (let attempt = 0; attempt < 180; attempt++) {
      if (attempt > 0) await this.sleep(2000);
      const result = await fetch(resultUrl, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: 'audio/*',
        },
      });
      if (result.status === 202) continue;
      return audioResponse('Stable Audio result', result, 'mp3');
    }
    throw new Error('Stable Audio generation timed out after 6 minutes');
  }
}

export class GoogleLyriaAudioService extends BaseService {
  constructor(private readonly config: AudioModelConfig) {
    super();
  }

  async generateAudio(
    request: AudioRequest,
  ): Promise<DirectAudioResult | null> {
    if (request.audioType === 'sfx') return null;
    if (this.config.baseUrl.includes('PROJECT_ID')) {
      throw new Error(
        'Google Lyria Base URL still contains PROJECT_ID; replace it with your Google Cloud project ID.',
      );
    }
    const model = this.config.modelNameChat || 'lyria-002';
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const url = baseUrl.endsWith(':predict')
      ? baseUrl
      : baseUrl.endsWith(`/${model}`)
        ? `${baseUrl}:predict`
        : `${baseUrl}/${model}:predict`;
    const credential = this.config.apiKey.replace(/^Bearer\s+/i, '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (credential.startsWith('AIza')) headers['x-goog-api-key'] = credential;
    else headers.Authorization = `Bearer ${credential}`;
    const response = await this.fetchWithRetry(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          instances: [
            {
              prompt: professionalAudioPrompt(request).slice(0, 2000),
              negative_prompt: 'vocals, speech, clipping, distortion',
            },
          ],
          parameters: { sample_count: 1 },
        }),
      },
      0,
    );
    if (!response.ok) throw await apiError('Google Lyria', response);
    const data = (await response.json()) as {
      predictions?: Array<{ audioContent?: string; mimeType?: string }>;
    };
    const encoded = data.predictions?.[0]?.audioContent;
    if (!encoded) throw new Error('Google Lyria returned no audioContent');
    return {
      buffer: Buffer.from(encoded, 'base64'),
      extension: 'wav',
      contentType: 'audio/wav',
    };
  }
}

export class MurekaAudioService extends BaseService {
  constructor(private readonly config: AudioModelConfig) {
    super();
  }

  async generateAudio(
    request: AudioRequest,
  ): Promise<DirectAudioResult | null> {
    if (request.audioType === 'sfx') return null;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    const createResponse = await this.fetchWithRetry(
      joinApiUrl(this.config.baseUrl, '/v1/instrumental/generate'),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.modelNameChat || 'mureka-9',
          n: 1,
          stream: false,
          prompt: professionalAudioPrompt(request).slice(0, 1024),
        }),
      },
      0,
    );
    if (!createResponse.ok) throw await apiError('Mureka', createResponse);
    const task = (await createResponse.json()) as { id?: string };
    if (!task.id) throw new Error('Mureka returned no task ID');

    const queryUrl = joinApiUrl(
      this.config.baseUrl,
      `/v1/instrumental/query/${encodeURIComponent(task.id)}`,
    );
    for (let attempt = 0; attempt < 120; attempt++) {
      if (attempt > 0) await this.sleep(3000);
      const result = await fetch(queryUrl, { headers });
      if (!result.ok) throw await apiError('Mureka task query', result);
      const data = (await result.json()) as {
        status?: string;
        failed_reason?: string;
        choices?: Array<{
          wav_url?: string;
          mp3_url?: string;
          url?: string;
          stream_url?: string;
        }>;
      };
      if (
        data.status === 'failed' ||
        data.status === 'timeouted' ||
        data.status === 'cancelled'
      ) {
        throw new Error(
          `Mureka generation failed: ${data.failed_reason || data.status}`,
        );
      }
      if (data.status !== 'succeeded') continue;
      const choice = data.choices?.[0];
      const audioUrl = choice?.wav_url || choice?.mp3_url || choice?.url;
      if (!audioUrl) throw new Error('Mureka completed without an audio URL');
      const extension = choice?.wav_url ? 'wav' : 'mp3';
      const download = await this.fetchWithRetry(audioUrl, {}, 1);
      return audioResponse('Mureka download', download, extension);
    }
    throw new Error('Mureka generation timed out after 6 minutes');
  }
}

// ============== Audio Service Interface ==============

export interface IAudioService {
  generateABC?(request: AudioRequest): Promise<string>;
  generateAudio?(request: AudioRequest): Promise<DirectAudioResult | null>;
}

// ============== Factory ==============

export function createAudioService(config: AudioModelConfig): IAudioService {
  switch (config.modelType) {
    case 'doubao':
      return new DoubaoAudioService(config);
    case 'openai-compat':
      return new OpenAICompatAudioService(config);
    case 'elevenlabs':
      return new ElevenLabsAudioService(config);
    case 'minimax':
      return new MiniMaxAudioService(config);
    case 'stability':
      return new StabilityAudioService(config);
    case 'google-lyria':
      return new GoogleLyriaAudioService(config);
    case 'mureka':
      return new MurekaAudioService(config);
    case 'tongyi':
      return new TongyiAudioService(config);
    default:
      throw new Error(`Unsupported audio provider: ${config.modelType}`);
  }
}
