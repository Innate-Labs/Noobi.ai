import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, sep } from 'node:path';
export interface VersionFile { path: string; sha256: string; size: number; mode: number }
const skip = new Set(['.git', '.godot', 'node_modules', '.DS_Store']);
export const digest = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
export function validRelative(path: string): boolean {
  return typeof path === 'string' && path.length > 0 && !path.includes('\\') && !path.includes('\0')
    && !path.startsWith('/') && path.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}
export async function safeRoot(path: string): Promise<string> {
  const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('版本目录必须是普通文件夹');
  return realpath(path);
}
export async function readVersionFile(root: string, path: string): Promise<Buffer> {
  if (!validRelative(path)) throw new Error('版本文件路径无效');
  const target = resolve(root, path);
  if (await realpath(dirname(target)) !== dirname(target)) throw new Error('版本路径包含符号链接');
  const parent = relative(root, target); if (parent.startsWith(`..${sep}`) || parent === '..') throw new Error('版本路径越界');
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat(); if (!info.isFile() || info.size > 2 * 1024 ** 3) throw new Error('版本文件类型或大小无效');
    return await handle.readFile();
  } finally { await handle.close(); }
}
export async function scanVersionFiles(directory: string): Promise<VersionFile[]> {
  const root = await safeRoot(directory); const files: VersionFile[] = []; let bytes = 0;
  const visit = async (dir: string): Promise<void> => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
      if (skip.has(entry.name)) continue;
      const path = join(dir, entry.name); const rel = relative(root, path).split(sep).join('/');
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`版本快照不支持符号链接：${rel}`);
      if (info.isDirectory()) { await visit(path); continue; }
      if (!info.isFile()) throw new Error(`版本文件类型无效：${rel}`);
      bytes += info.size; if (files.length >= 20000 || bytes > 2 * 1024 ** 3) throw new Error('版本超过 20,000 文件或 2 GiB');
      const data = await readVersionFile(root, rel);
      files.push({ path: rel, sha256: digest(data), size: data.length, mode: info.mode & 0o777 });
    }
  };
  await visit(root); return files;
}
export async function copyVersionFiles(source: string, target: string, files: readonly VersionFile[]): Promise<void> {
  const root = await safeRoot(source); await mkdir(target, { recursive: true }); const destination = await safeRoot(target);
  for (const file of files) {
    const data = await readVersionFile(root, file.path);
    if (digest(data) !== file.sha256 || data.length !== file.size) throw new Error(`版本文件已变化：${file.path}`);
    const path = join(destination, file.path); await mkdir(dirname(path), { recursive: true });
    if (await realpath(dirname(path)) !== dirname(path)) throw new Error('恢复目录包含符号链接');
    await writeFile(path, data, { flag: 'wx', mode: file.mode });
    await chmod(path, file.mode);
  }
}
