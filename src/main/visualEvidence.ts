import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { GameplayBuildBinding, GameplayExperienceReport } from '../shared/contracts.js';
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export async function safeVisualRead(root: string, path: string): Promise<Buffer> {
  const canonical = await realpath(root), target = resolve(canonical, path), rel = relative(canonical, target);
  if (isAbsolute(path) || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('视觉证据路径越界');
  let current = canonical;
  for (const part of rel.split(sep)) { current = join(current, part); if ((await lstat(current)).isSymbolicLink()) throw new Error('视觉证据不可通过符号链接读取'); }
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try { const info = await handle.stat(); if (!info.isFile() || info.size < 1 || info.size > 32 * 1024 ** 2) throw new Error('视觉证据文件无效或过大'); return await handle.readFile(); } finally { await handle.close(); }
}
export async function writeProjectReference(root: string, id: string, bytes: Buffer): Promise<void> {
  if (!/^ref-[a-f0-9]{64}$/u.test(id)) throw new Error('参考 ID 无效');
  const canonical = await realpath(root); let directory = canonical;
  for (const part of ['references', 'visual']) {
    directory = join(directory, part); await mkdir(directory).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const info = await lstat(directory); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('参考导入目录不安全');
  }
  const path = join(directory, `${id}.png`);
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }).catch(async error => {
    if (error.code !== 'EEXIST') throw error;
    if (digest(await safeVisualRead(canonical, relative(canonical, path))) !== digest(bytes)) throw new Error('工程中的参考图已变化，请先处理冲突');
  });
}
interface VisualReceipt { build: GameplayBuildBinding; checkedAt: string; images: Array<{ file: string; sourcePath: string; sha256: string }> }
export async function retainVisualEvidence(directory: string, projectRoot: string, report: GameplayExperienceReport): Promise<void> {
  if (!report.build || !report.screenshots) return;
  const paths = [...new Set([report.screenshots.before, ...report.screenshots.action.filter(p => !/temporal-|probe-/u.test(p)), report.screenshots.after].filter((p): p is string => Boolean(p)))];
  const selected = [...new Set([0, 1, Math.floor(paths.length / 3), Math.floor(paths.length * 2 / 3), paths.length - 1])].map(i => paths[i]).filter((p): p is string => Boolean(p));
  const target = join(directory, 'visual-evidence'); await mkdir(target, { recursive: true, mode: 0o700 });
  const receipt: VisualReceipt = { build: report.build, checkedAt: report.checkedAt, images: [] };
  for (const sourcePath of selected) {
    if (!/^artifacts\/playtest\/latest\/screenshots\/[a-zA-Z0-9_-]+\.png$/u.test(sourcePath)) throw new Error('试玩截图路径不受支持');
    const bytes = await safeVisualRead(projectRoot, sourcePath);
    if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('试玩图像不是 PNG');
    const sha256 = digest(bytes), file = `${sha256}.png`;
    await writeFile(join(target, file), bytes, { flag: 'wx', mode: 0o600 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    receipt.images.push({ file, sourcePath, sha256 });
  }
  const path = join(target, 'inputs.json'); await writeFile(`${path}.tmp`, JSON.stringify(receipt), { mode: 0o600 }); await rename(`${path}.tmp`, path);
}
export async function readVisualEvidence(directory: string, report: GameplayExperienceReport): Promise<{ paths: string[]; images: Array<{ path: string; sha256: string; name: string }>; context: string }> {
  const root = join(directory, 'visual-evidence');
  const receipt = JSON.parse(await readFile(join(root, 'inputs.json'), 'utf8')) as VisualReceipt;
  if (JSON.stringify(receipt.build) !== JSON.stringify(report.build) || receipt.checkedAt !== report.checkedAt || !Array.isArray(receipt.images) || !receipt.images.length || receipt.images.length > 5) throw new Error('图像证据与当前构建报告不匹配');
  const paths: string[] = [];
  const images: Array<{ path: string; sha256: string; name: string }> = [];
  for (const item of receipt.images) {
    if (!/^[a-f0-9]{64}\.png$/u.test(item.file) || digest(await safeVisualRead(root, item.file)) !== item.sha256) throw new Error('试玩图像证据已变化');
    paths.push(join(root, item.file));
    images.push({ path: join(root, item.file), sha256: item.sha256, name: item.sourcePath.split('/').at(-1) ?? item.file });
  }
  return { paths, images, context: `以下 ${paths.length} 张为宿主保留的真实试玩截图。构建 ${receipt.build.buildId}，源码 ${receipt.build.sourceHash}，产物 ${receipt.build.artifactHash}。图片按此顺序对应 ${receipt.images.map(i => i.sourcePath).join('、')}。仅覆盖这些采样，未采样状态不视为已验证。` };
}
