import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, open, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VIDEO_PURPOSES, type VideoClip, type VideoFrame, type VideoSelection, type VideoSource, type PrepareVideoInput, type VideoSpec } from '../shared/videoReferences.js';
import type { VisualReferenceStore } from './visualReferenceStore.js';
const VERSION = 'sample-v1';
const MAX_BYTES = 200 * 1024 ** 2;
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export function validateVideoSelection(value: unknown): VideoSelection {
  const selection = value as VideoSelection;
  if (!selection || !/^clip-[a-f0-9]{64}$/u.test(selection.clipId) || !VIDEO_PURPOSES.includes(selection.purpose)) throw new Error('视频片段或参考用途无效');
  return { clipId: selection.clipId, purpose: selection.purpose };
}
export function validateVideoSpec(value: unknown, clip: Pick<VideoClip, 'start' | 'end' | 'frames'>): VideoSpec {
  const v = value as VideoSpec;
  const text = (s: unknown) => { if (typeof s !== 'string' || !s.trim() || s.length > 2000) throw new Error('视频理解文字缺失或过长'); return s.trim(); };
  const ids = (values: unknown, minimum = 1): string[] => { if (!Array.isArray(values) || values.length < minimum || values.length > 10 || new Set(values).size !== values.length || values.some(id => !clip.frames.some(f => f.id === id))) throw new Error('视频结论缺少有效关键帧来源'); return values; };
  if (!v || !Array.isArray(v.events) || !v.events.length || v.events.length > 16 || !Array.isArray(v.rules) || !v.rules.length || v.rules.length > 12 || !Array.isArray(v.unknowns) || !v.unknowns.length || v.unknowns.length > 12) throw new Error('视频理解时间轴、规则或未知项不完整');
  const events = v.events.map(e => {
    if (!e || !Number.isFinite(e.start) || !Number.isFinite(e.end) || e.start < clip.start || e.end > clip.end || e.end < e.start || !['play', 'cut', 'replay', 'cutscene', 'uncertain'].includes(e.kind)) throw new Error('视频事件时间或类别无效');
    const frameIds = ids(e.frameIds);
    if (frameIds.some(id => { const time = clip.frames.find(f => f.id === id)!.time; return time < e.start - 0.51 || time > e.end + 0.51; })) throw new Error('视频事件引用了不在该时段的图片');
    return { start: e.start, end: e.end, frameIds, observation: text(e.observation), kind: e.kind };
  });
  const rules = v.rules.map(r => { if (!r || !['visible', 'hypothesis'].includes(r.basis)) throw new Error('规则必须区分观察与假设'); return { text: text(r.text), basis: r.basis, frameIds: ids(r.frameIds, r.basis === 'visible' ? 2 : 0) }; });
  const result = { events, rules, unknowns: v.unknowns.map(text), adaptation: text(v.adaptation) };
  if (JSON.stringify(result).length > 18000) throw new Error('视频理解超过 18000 字');
  return result;
}
export async function videoCommand(binary: string, args: string[], signal?: AbortSignal, maxBytes = 2 * 1024 ** 2, timeoutMs = 60000): Promise<Buffer> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const chunks: Buffer[] = []; let size = 0, errorText = '', failure: Error | undefined;
    const stop = (message: string) => { failure ??= new Error(message); child.kill('SIGKILL'); };
    const abort = () => stop('视频处理已取消');
    const timer = setTimeout(() => stop('视频解码超时，处理已停止'), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', data => { size += data.length; if (size > maxBytes) stop('视频解码输出超限'); else chunks.push(data); });
    child.stderr.on('data', data => { errorText = (errorText + data.toString()).slice(-2000); });
    child.once('error', error => { failure = error; });
    child.once('close', code => { clearTimeout(timer); signal?.removeEventListener('abort', abort); if (failure) reject(failure); else if (code !== 0) reject(new Error(`视频解码失败：${errorText.slice(-600)}`)); else resolve(Buffer.concat(chunks)); });
  });
}
async function findBinary(name: string): Promise<string> {
  for (const dir of [...(process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']) {
    const path = join(dir, process.platform === 'win32' ? `${name}.exe` : name);
    try { await access(path, constants.X_OK); return path; } catch { /* try next installed binary */ }
  }
  throw new Error(`视频参考需要本机 ${name}；请安装 FFmpeg 后重试`);
}
export function sampleTimes(frames: Buffer, start: number, end: number): Array<{ time: number; reason: VideoFrame['reason'] }> {
  const frameSize = 48 * 27 * 3, count = Math.floor(frames.length / frameSize);
  const changes: Array<{ time: number; score: number }> = [];
  for (let i = 1; i < count; i++) { let score = 0; for (let p = 0; p < frameSize; p++) score += Math.abs(frames[i * frameSize + p]! - frames[(i - 1) * frameSize + p]!); changes.push({ time: start + i / 2, score: score / frameSize }); }
  const candidates: Array<{ time: number; reason: VideoFrame['reason'] }> = [0, 1 / 3, 2 / 3, 1].map(f => ({ time: start + Math.max(0, end - start - 0.1) * f, reason: 'overview' }));
  const peaks = changes.sort((a, b) => b.score - a.score).filter((c, i, all) => c.score > 2 && !all.slice(0, i).some(p => p.score >= c.score && Math.abs(p.time - c.time) < 1)).slice(0, 2);
  for (const peak of peaks) for (const offset of [-0.2, 0, 0.2]) candidates.push({ time: Math.max(start, Math.min(end - 0.05, peak.time + offset)), reason: peak.score > 50 ? 'change' : 'motion' });
  return candidates.sort((a, b) => a.time - b.time).filter((c, i, all) => !i || c.time - all[i - 1]!.time > 0.025).map(c => ({ ...c, time: Math.round(c.time * 1000) / 1000 }));
}
export class VideoReferenceStore {
  readonly jobs = new Map<string, AbortController>();
  constructor(private readonly root: string, private readonly images: VisualReferenceStore) {}
  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await lstat(this.root)).isSymbolicLink()) throw new Error('视频缓存目录不安全');
    for (const name of await readdir(this.root)) if (/^\.processing-[a-zA-Z0-9]+$/u.test(name)) await rm(join(this.root, name), { recursive: true, force: true });
  }
  async import(path: string, requestId: string = randomUUID()): Promise<VideoSource> {
    if (!/^[a-f0-9-]{36}$/u.test(requestId) || this.jobs.size) throw new Error('已有视频正在处理或请求无效');
    const controller = new AbortController(); this.jobs.set(requestId, controller);
    try { return await this.importSource(path, controller.signal); }
    finally { this.jobs.delete(requestId); }
  }
  private async importSource(path: string, signal: AbortSignal): Promise<VideoSource> {
    if (!isAbsolute(path) || !['.mp4', '.mov'].includes(extname(path).toLowerCase())) throw new Error('请上传 MP4/MOV 视频');
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try { const stat = await handle.stat(); if (!stat.isFile() || stat.size < 16 || stat.size > MAX_BYTES) throw new Error('视频需为普通文件且不超过 200 MiB'); bytes = await handle.readFile(); if (bytes.length > MAX_BYTES) throw new Error('视频超限'); } finally { await handle.close(); }
    signal.throwIfAborted();
    const hash = sha(bytes), id = `video-${hash}`;
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await lstat(this.root)).isSymbolicLink()) throw new Error('视频缓存目录不安全');
    const directory = join(this.root, id); await mkdir(directory, { recursive: true, mode: 0o700 });
    const target = join(directory, 'source.mov');
    await writeFile(target, bytes, { flag: 'wx', mode: 0o600 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
    if (sha(await this.read(target)) !== hash) throw new Error('视频缓存已变化，请重新导入');
    const probe = await findBinary('ffprobe');
    const data = JSON.parse((await videoCommand(probe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-f', 'mov', '-show_streams', '-show_format', '-of', 'json', target], signal, 1024 * 1024, 15000)).toString());
    const stream = data.streams?.find((s: any) => s.codec_type === 'video');
    const duration = Number(data.format?.duration), width = Number(stream?.width), height = Number(stream?.height);
    const rate = String(stream?.avg_frame_rate ?? '').split('/').map(Number), fps = rate[0]! / rate[1]!;
    if (!Number.isFinite(fps) || fps <= 0 || fps > 120) throw new Error('视频帧率超出 1–120 FPS 支持范围');
    if (!Number.isFinite(duration) || duration < 1 || duration > 600 || !Number.isFinite(width) || !Number.isFinite(height) || width < 32 || height < 32 || width * height > 2_100_000 || width > 3840 || height > 3840 || !['h264', 'hevc', 'mpeg4', 'vp9', 'av1'].includes(stream?.codec_name)) throw new Error('视频超出支持范围：1–600 秒、约 1080p，H.264/HEVC/MPEG-4/VP9/AV1');
    const record: VideoSource = { id, name: basename(path), sha256: hash, size: bytes.length, duration, width, height, codec: stream.codec_name, previewUrl: pathToFileURL(target).href };
    signal.throwIfAborted();
    await writeFile(join(directory, 'source.json'), JSON.stringify(record), { mode: 0o600 });
    return record;
  }
  private async read(path: string): Promise<Buffer> {
    const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error('视频缓存无效');
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); try { return await handle.readFile(); } finally { await handle.close(); }
  }
  async source(id: string): Promise<VideoSource> {
    if (!/^video-[a-f0-9]{64}$/u.test(id)) throw new Error('视频来源无效');
    const record = JSON.parse((await this.read(join(this.root, id, 'source.json'))).toString()) as VideoSource;
    if (record.id !== id || record.sha256 !== id.slice(6) || sha(await this.read(join(this.root, id, 'source.mov'))) !== record.sha256) throw new Error('视频内容已变化');
    return { ...record, previewUrl: pathToFileURL(join(this.root, id, 'source.mov')).href };
  }
  async get(id: string): Promise<VideoClip> {
    if (!/^clip-[a-f0-9]{64}$/u.test(id)) throw new Error('片段 ID 无效');
    const clip = JSON.parse((await this.read(join(this.root, id, 'clip.json'))).toString()) as VideoClip;
    if (clip.id !== id || clip.processorVersion !== VERSION || !Array.isArray(clip.frames) || !clip.frames.length || clip.frames.length > 10) throw new Error('片段缓存失效，请重新处理');
    clip.source = await this.source(clip.source.id);
    if (`clip-${sha(JSON.stringify({ sha256: clip.source.sha256, start: clip.start, end: clip.end, version: VERSION }))}` !== id
      || clip.frames.some((f, i) => f.id !== `${id}-frame-${i + 1}` || !Number.isFinite(f.time) || f.time < clip.start || f.time > clip.end || (i > 0 && f.time <= clip.frames[i - 1]!.time))) throw new Error('视频时间证据已变化');
    for (const frame of clip.frames) if ((await this.images.get(frame.referenceId)).normalizedHash !== frame.sha256) throw new Error('视频关键帧已变化');
    return clip;
  }
  async prepare(input: PrepareVideoInput): Promise<VideoClip> {
    if (!input || typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/u.test(input.requestId) || this.jobs.size) throw new Error('已有视频正在处理或请求无效');
    const controller = new AbortController(); this.jobs.set(input.requestId, controller);
    let work: string | undefined;
    try {
      const source = await this.source(input.sourceId); controller.signal.throwIfAborted();
      const { start, end } = input;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > source.duration || end - start < 1 || end - start > 120) throw new Error('请选择视频内 1–120 秒的关注片段');
      const id = `clip-${sha(JSON.stringify({ sha256: source.sha256, start, end, version: VERSION }))}`;
      try { const cached = await this.get(id); controller.signal.throwIfAborted(); return cached; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      const ffmpeg = await findBinary('ffmpeg'); work = await mkdtemp(join(this.root, '.processing-'));
      const common = ['-nostdin', '-v', 'error', '-threads', '2', '-protocol_whitelist', 'file,pipe', '-f', 'mov', '-i', join(this.root, source.id, 'source.mov'), '-map', '0:v:0'];
      const raw = await videoCommand(ffmpeg, [...common, '-ss', String(start), '-t', String(end - start), '-an', '-vf', 'fps=2,scale=48:27', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], controller.signal);
      const samples = sampleTimes(raw, start, end); if (!samples.length || raw.length < 48 * 27 * 3) throw new Error('该片段未解码出有效画面');
      const frames: VideoFrame[] = [];
      for (const sample of samples) {
        controller.signal.throwIfAborted();
        const png = await videoCommand(ffmpeg, [...common, '-ss', String(sample.time), '-an', '-frames:v', '1', '-vf', 'scale=768:768:force_original_aspect_ratio=decrease', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], controller.signal, 8 * 1024 ** 2);
        const [record] = await this.images.import([{ name: `video-${sample.time.toFixed(3)}.png`, dataBase64: png.toString('base64') }]);
        frames.push({ id: `${id}-frame-${frames.length + 1}`, referenceId: record!.id, time: sample.time, sha256: record!.normalizedHash, thumbnail: record!.thumbnail, reason: sample.reason });
      }
      controller.signal.throwIfAborted();
      const clip: VideoClip = { id, source, start, end, frames, processorVersion: VERSION, boundaries: samples.filter(s => s.reason === 'change').map(s => s.time), limitations: ['仅分析有限关键帧，快动作和遮挡可能遗漏。', '画面突变仅是候选剪辑边界，不证明发生了剪辑。', '未分析音频；按键、伤害公式和未展示规则仍需用户确认。'] };
      await writeFile(join(work, 'clip.json'), JSON.stringify(clip), { mode: 0o600 });
      controller.signal.throwIfAborted();
      await rename(work, join(this.root, id)); work = undefined;
      return clip;
    } finally { this.jobs.delete(input.requestId); if (work) await rm(work, { recursive: true, force: true }); }
  }
  cancel(id: string): void { this.jobs.get(id)?.abort(); }
  stop(): void { for (const job of this.jobs.values()) job.abort(); }
}
