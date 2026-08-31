import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  stat,
} from 'node:fs/promises';
import {
  basename,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { TextDecoder } from 'node:util';

export const PROJECT_REFERENCE_EXTENSIONS = ['.pdf', '.md', '.txt', '.json', '.csv'] as const;

export interface ProjectReferenceRecord {
  name: string;
  relativePath: string;
  mimeType: string;
  size: number;
  sha256: string;
}

const MAX_REFERENCE_COUNT = 50;
const MAX_REFERENCE_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 32 * 1024 * 1024;
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const MIME_TYPES: Record<(typeof PROJECT_REFERENCE_EXTENSIONS)[number], string> = {
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
};

export function isProjectReferencePath(filePath: string): boolean {
  return PROJECT_REFERENCE_EXTENSIONS.includes(
    extname(filePath).toLowerCase() as (typeof PROJECT_REFERENCE_EXTENSIONS)[number],
  );
}

/** Copies non-executable reference documents into an isolated project folder. */
export async function importProjectReferences(
  root: string,
  sourcePaths: readonly string[],
): Promise<ProjectReferenceRecord[]> {
  if (sourcePaths.length === 0) return [];
  if (sourcePaths.length > MAX_REFERENCE_COUNT) throw new Error('一次最多导入 50 个参考文件');
  const safeRoot = await canonicalRoot(root);
  const destinationDirectory = join(safeRoot, 'references', 'uploads');
  await mkdir(destinationDirectory, { recursive: true, mode: 0o700 });

  let totalBytes = 0;
  const records: ProjectReferenceRecord[] = [];
  for (const sourcePath of sourcePaths) {
    if (typeof sourcePath !== 'string' || !isAbsolute(sourcePath) || sourcePath.includes('\0')) {
      throw new Error('参考文件路径无效');
    }
    const extension = extname(sourcePath).toLowerCase() as (typeof PROJECT_REFERENCE_EXTENSIONS)[number];
    if (!PROJECT_REFERENCE_EXTENSIONS.includes(extension)) {
      throw new Error(`不支持的参考文件格式：${extension || '无扩展名'}`);
    }
    const sourceInfo = await lstat(sourcePath);
    if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) {
      throw new Error(`参考附件必须是普通文件：${basename(sourcePath)}`);
    }
    const maxBytes = extension === '.pdf' ? MAX_PDF_BYTES : MAX_TEXT_BYTES;
    if (sourceInfo.size <= 0 || sourceInfo.size > maxBytes) {
      throw new Error(`参考文件为空或过大：${basename(sourcePath)}`);
    }
    totalBytes += sourceInfo.size;
    if (totalBytes > MAX_REFERENCE_TOTAL_BYTES) throw new Error('参考文件总大小不能超过 64 MiB');
    await validateReference(sourcePath, extension);

    const sha256 = await hashFile(sourcePath);
    const safeName = `${safeStem(basename(sourcePath, extension))}${extension}`;
    const destination = await copyToUniqueDestination(sourcePath, destinationDirectory, safeName);
    records.push({
      name: basename(destination),
      relativePath: toProjectPath(safeRoot, destination),
      mimeType: MIME_TYPES[extension],
      size: sourceInfo.size,
      sha256,
    });
  }
  return records;
}

async function validateReference(
  sourcePath: string,
  extension: (typeof PROJECT_REFERENCE_EXTENSIONS)[number],
): Promise<void> {
  if (extension === '.pdf') {
    const handle = await open(sourcePath, 'r');
    try {
      const header = Buffer.alloc(5);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (bytesRead !== 5 || header.toString('ascii') !== '%PDF-') {
        throw new Error(`PDF 文件签名无效：${basename(sourcePath)}`);
      }
    } finally {
      await handle.close();
    }
    return;
  }

  const content = await readFile(sourcePath);
  if (content.includes(0)) throw new Error(`文本参考文件包含二进制内容：${basename(sourcePath)}`);
  try {
    const text = UTF8.decode(content);
    if (extension === '.json') JSON.parse(text);
  } catch (error) {
    if (extension === '.json') throw new Error(`JSON 参考文件无效：${basename(sourcePath)}`);
    throw new Error(`参考文件必须使用 UTF-8 编码：${basename(sourcePath)}`);
  }
}

async function copyToUniqueDestination(
  sourcePath: string,
  directory: string,
  preferredName: string,
): Promise<string> {
  const extension = extname(preferredName);
  const stem = basename(preferredName, extension);
  for (let index = 0; index < 1_000; index += 1) {
    const name = index === 0 ? preferredName : `${stem}-${index + 1}${extension}`;
    const destination = join(directory, name);
    try {
      await copyFile(sourcePath, destination, constants.COPYFILE_EXCL);
      return destination;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error(`无法为参考文件分配安全文件名：${preferredName}`);
}

async function canonicalRoot(root: string): Promise<string> {
  if (!isAbsolute(root)) throw new Error('项目根目录必须是绝对路径');
  const canonical = await realpath(resolve(root));
  const info = await stat(canonical);
  if (!info.isDirectory()) throw new Error('项目根目录不存在');
  return canonical;
}

function toProjectPath(root: string, filePath: string): string {
  const value = relative(root, filePath);
  if (!value || value === '..' || value.startsWith(`..${sep}`) || isAbsolute(value)) {
    throw new Error('参考文件路径越过了项目边界');
  }
  return value.split(sep).join('/');
}

function safeStem(value: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f/\\:]/gu, '-')
    .replace(/[^\p{L}\p{N}._ -]+/gu, '-')
    .replace(/[. ]+$/gu, '')
    .replace(/^[. ]+/gu, '')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .slice(0, 80);
  return cleaned || 'reference';
}

async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}
