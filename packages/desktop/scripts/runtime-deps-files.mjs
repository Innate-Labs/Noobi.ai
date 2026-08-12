import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

export async function copyRuntimePackageTree(
  sourceDirectory,
  destinationDirectory,
  { filter = () => true } = {},
) {
  const sourceRoot = await realpath(sourceDirectory);
  const activeDirectories = new Set();

  const copyEntry = async (sourcePath, destinationPath, segments) => {
    if (segments.includes('node_modules') || !filter(segments)) {
      return { fileCount: 0, sizeBytes: 0 };
    }

    const sourceStat = await stat(sourcePath);
    if (sourceStat.isDirectory()) {
      const realSourcePath = await realpath(sourcePath);
      if (activeDirectories.has(realSourcePath)) {
        throw new Error(
          `Runtime 依赖包含循环目录链接：${path.relative(sourceRoot, sourcePath)}`,
        );
      }

      activeDirectories.add(realSourcePath);
      await mkdir(destinationPath, { recursive: true });
      const result = { fileCount: 0, sizeBytes: 0 };
      const entries = await readdir(sourcePath, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const child = await copyEntry(
          path.join(sourcePath, entry.name),
          path.join(destinationPath, entry.name),
          [...segments, entry.name],
        );
        result.fileCount += child.fileCount;
        result.sizeBytes += child.sizeBytes;
      }
      activeDirectories.delete(realSourcePath);
      return result;
    }

    if (!sourceStat.isFile()) {
      const entryType = (await lstat(sourcePath)).isSymbolicLink()
        ? '无法解析的符号链接'
        : '不支持的文件类型';
      throw new Error(
        `Runtime 依赖包含${entryType}：${path.relative(sourceRoot, sourcePath)}`,
      );
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
    await chmod(destinationPath, sourceStat.mode & 0o777);
    return { fileCount: 1, sizeBytes: sourceStat.size };
  };

  return copyEntry(sourceDirectory, destinationDirectory, []);
}

export async function inspectRuntimeTree(directory) {
  const result = { fileCount: 0, sizeBytes: 0 };
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const child = await inspectRuntimeTree(entryPath);
      result.fileCount += child.fileCount;
      result.sizeBytes += child.sizeBytes;
    } else if (entry.isFile()) {
      result.fileCount += 1;
      result.sizeBytes += (await stat(entryPath)).size;
    } else {
      throw new Error(`Runtime staging 中不允许链接或特殊文件：${entryPath}`);
    }
  }
  return result;
}

export function isPathInside(
  parentDirectory,
  candidatePath,
  pathImplementation = path,
) {
  const relativePath = pathImplementation.relative(
    parentDirectory,
    candidatePath,
  );
  return (
    relativePath !== '' &&
    !relativePath.startsWith(`..${pathImplementation.sep}`) &&
    relativePath !== '..' &&
    !pathImplementation.isAbsolute(relativePath)
  );
}
