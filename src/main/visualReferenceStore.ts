import { createHash } from 'node:crypto';
import { mkdir, readFile, lstat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { REFERENCE_PURPOSES, type ReferenceSelection, type VisualReference, type ReferenceSpec } from '../shared/visualReferences.js';

const MAX_BYTES = 12 * 1024 ** 2;
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
export interface DecodedReference { png: Buffer; thumbnail: Buffer }
/** Reads dimensions before decoding to bound memory even for a tiny compressed image. */
export function referenceDimensions(bytes: Buffer, name: string): { width: number; height: number } {
  const ext = extname(name).toLowerCase();
  let width = 0, height = 0;
  if (ext === '.png' && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (['.jpg', '.jpeg'].includes(ext) && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker! >= 0xd0 && marker! <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker!)) {
        if (size < 8) break;
        height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break;
      }
      offset += size;
    }
  } else if (ext === '.webp' && bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length) {
    const type = bytes.toString('ascii', 12, 16);
    if (type === 'VP8X') { width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3); }
    else if (type === 'VP8 ' && bytes.toString('hex', 23, 26) === '9d012a') { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff; }
    else if (type === 'VP8L' && bytes[20] === 0x2f) { const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
  }
  if (width < 32 || height < 32 || width > 8192 || height > 8192 || width * height > 16_777_216) throw new Error('参考图片格式或尺寸无效：需 PNG/JPEG/WebP，边长 32–8192，最多 1600 万像素');
  return { width, height };
}
export function validateReferenceSelections(value: unknown): ReferenceSelection[] {
  if (!Array.isArray(value) || value.length > 5) throw new Error('一次最多选择 5 张视觉参考');
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item.id !== 'string' || !/^ref-[a-f0-9]{64}$/u.test(item.id) || !REFERENCE_PURPOSES.includes(item.purpose) || seen.has(item.id)) throw new Error('参考来源或用途无效');
    seen.add(item.id); return { id: item.id, purpose: item.purpose };
  });
}
export function validateReferenceSpec(value: unknown, references: ReferenceSelection[]): ReferenceSpec {
  const input = value as ReferenceSpec;
  const text = (v: unknown): string => { if (typeof v !== 'string' || !v.trim() || v.length > 2000) throw new Error('视觉理解字段缺失或过长'); return v.trim(); };
  const list = (v: unknown): string[] => { if (!Array.isArray(v) || v.length < 1 || v.length > 12) throw new Error('请分别列出视觉推断和未知项'); return v.map(text); };
  if (!input || !Array.isArray(input.facts) || input.facts.length < 1 || input.facts.length > 20) throw new Error('缺少带图片来源的观察事实');
  const facts = input.facts.map(f => { if (!f || !references.some(r => r.id === f.referenceId)) throw new Error('视觉观察引用了未知图片'); return { referenceId: f.referenceId, observation: text(f.observation) }; });
  if (references.some(r => !facts.some(f => f.referenceId === r.id))) throw new Error('视觉分析遗漏参考图片');
  const spec = { style: text(input.style), camera: text(input.camera), scene: text(input.scene), ui: text(input.ui), facts, inferences: list(input.inferences), unknowns: list(input.unknowns) };
  if (JSON.stringify(spec).length > 16000) throw new Error('视觉理解总量超过 16000 字，请精简后重试');
  return spec;
}
export class VisualReferenceStore {
  constructor(private readonly root: string, private readonly decode: (bytes: Buffer) => DecodedReference | Promise<DecodedReference>) {}
  async import(inputs: Array<{ name: string; dataBase64: string }>): Promise<VisualReference[]> {
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 5) throw new Error('请上传 1–5 张视觉参考');
    let total = 0;
    const validated = inputs.map(input => {
      if (!input || typeof input.name !== 'string' || input.name.length > 200 || basename(input.name) !== input.name || /[\\\0]/u.test(input.name)
        || typeof input.dataBase64 !== 'string' || input.dataBase64.length > MAX_BYTES * 4 / 3 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(input.dataBase64)) throw new Error('参考图片上传数据无效');
      const bytes = Buffer.from(input.dataBase64, 'base64'); total += bytes.length;
      if (!bytes.length || bytes.length > MAX_BYTES || total > 32 * 1024 ** 2) throw new Error('单张图片最多 12 MiB，总量最多 32 MiB');
      return { input, bytes, dimensions: referenceDimensions(bytes, input.name) };
    });
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await lstat(this.root)).isSymbolicLink()) throw new Error('参考存储目录不可为符号链接');
    const result: VisualReference[] = [];
    for (const { input, bytes, dimensions } of validated) {
      const sha256 = hash(bytes), id = `ref-${sha256}`;
      const decoded = await this.decode(bytes);
      if (!decoded.png.length || !decoded.thumbnail.length) throw new Error('图片解码失败，未进行视觉分析');
      const record: VisualReference = { id, name: input.name, sha256, normalizedHash: hash(decoded.png), ...dimensions, size: bytes.length, thumbnail: `data:image/png;base64,${decoded.thumbnail.toString('base64')}` };
      // Content addressed cache: never follow or overwrite an existing file.
      for (const [suffix, data] of [['.png', decoded.png], ['.json', Buffer.from(JSON.stringify(record))]] as const) {
        await writeFile(join(this.root, id + suffix), data, { flag: 'wx', mode: 0o600 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      }
      result.push(await this.get(id));
    }
    return result;
  }
  async get(id: string): Promise<VisualReference> {
    if (!/^ref-[a-f0-9]{64}$/u.test(id)) throw new Error('参考 ID 无效');
    const metadataPath = join(this.root, `${id}.json`), imagePath = join(this.root, `${id}.png`);
    for (const path of [metadataPath, imagePath]) { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.size > 70 * 1024 ** 2) throw new Error('参考缓存路径或大小无效'); }
    const record = JSON.parse(await readFile(metadataPath, 'utf8')) as VisualReference;
    if (record.id !== id || record.sha256 !== id.slice(4) || hash(await readFile(imagePath)) !== record.normalizedHash) throw new Error('参考图内容已变化，请重新导入');
    return record;
  }
  async resolve(id: string): Promise<string> { await this.get(id); return join(this.root, `${id}.png`); }
}
