#!/usr/bin/env node

import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, '..');
const repositoryRoot = path.resolve(desktopRoot, '../..');
const sourceNodeModules = path.join(repositoryRoot, 'node_modules');
const stagingRoot = path.join(desktopRoot, '.runtime-deps');
const stagingNodeModules = path.join(stagingRoot, 'node_modules');
const esbuildConfigPath = path.join(repositoryRoot, 'esbuild.config.js');

const targetPlatform =
  process.env['GAMEAGENT_RUNTIME_PLATFORM'] || process.platform;
const targetArch = process.env['GAMEAGENT_RUNTIME_ARCH'] || process.arch;
const maxStagingBytes = Number(
  process.env['GAMEAGENT_RUNTIME_MAX_BYTES'] || 700 * 1024 * 1024,
);

const optionalExternalPackages = new Set([
  '@lydell/node-pty',
  '@lydell/node-pty-darwin-arm64',
  '@lydell/node-pty-darwin-x64',
  '@lydell/node-pty-linux-arm64',
  '@lydell/node-pty-linux-x64',
  '@lydell/node-pty-win32-arm64',
  '@lydell/node-pty-win32-x64',
  'node-pty',
]);

await assertDirectory(
  sourceNodeModules,
  '根 node_modules 不存在，请先运行 npm install。',
);
const externalPackages = await readEsbuildExternalPackages(esbuildConfigPath);

await rm(stagingRoot, { recursive: true, force: true });
await mkdir(stagingNodeModules, { recursive: true });

const pending = externalPackages.map((name) => ({
  name,
  fromDirectory: repositoryRoot,
  optional: optionalExternalPackages.has(name),
  requestedBy: 'esbuild external',
}));
const copiedSourceDirectories = new Set();
const copiedPackages = [];
const skippedPackages = [];

while (pending.length > 0) {
  const request = pending.shift();
  const sourceDirectory = await resolveInstalledPackage(
    request.name,
    request.fromDirectory,
  );

  if (!sourceDirectory) {
    if (request.optional) {
      skippedPackages.push({
        name: request.name,
        reason: 'not installed for this platform',
        requestedBy: request.requestedBy,
      });
      continue;
    }
    throw new Error(
      `缺少 Runtime 依赖 ${request.name}（由 ${request.requestedBy} 引用）。请重新运行 npm install。`,
    );
  }

  const sourceKey = path.resolve(sourceDirectory);
  if (copiedSourceDirectories.has(sourceKey)) continue;

  const manifestPath = path.join(sourceDirectory, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!supportsTarget(manifest, targetPlatform, targetArch)) {
    if (!request.optional) {
      throw new Error(
        `${manifest.name}@${manifest.version} 不支持 ${targetPlatform}/${targetArch}。`,
      );
    }
    skippedPackages.push({
      name: request.name,
      version: manifest.version,
      reason: `incompatible with ${targetPlatform}/${targetArch}`,
      requestedBy: request.requestedBy,
    });
    copiedSourceDirectories.add(sourceKey);
    continue;
  }

  const relativeInstallPath = path.relative(sourceNodeModules, sourceDirectory);
  if (
    relativeInstallPath === '' ||
    relativeInstallPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeInstallPath)
  ) {
    throw new Error(
      `Runtime 依赖 ${manifest.name} 解析到了根 node_modules 之外：${sourceDirectory}`,
    );
  }

  const destinationDirectory = path.join(
    stagingNodeModules,
    relativeInstallPath,
  );
  await mkdir(path.dirname(destinationDirectory), { recursive: true });
  await copyRuntimePackage(
    sourceDirectory,
    destinationDirectory,
    manifest.name,
  );
  copiedSourceDirectories.add(sourceKey);
  copiedPackages.push({
    name: manifest.name,
    version: manifest.version,
    installPath: toPosixPath(relativeInstallPath),
    requestedBy: request.requestedBy,
  });

  const peerMetadata = manifest.peerDependenciesMeta || {};
  const dependencies = new Map();
  for (const name of Object.keys(manifest.dependencies || {})) {
    dependencies.set(name, false);
  }
  for (const name of Object.keys(manifest.optionalDependencies || {})) {
    dependencies.set(name, true);
  }
  for (const name of Object.keys(manifest.peerDependencies || {})) {
    dependencies.set(name, Boolean(peerMetadata[name]?.optional));
  }
  for (const name of manifest.bundledDependencies ||
    manifest.bundleDependencies ||
    []) {
    if (!dependencies.has(name)) dependencies.set(name, false);
  }

  for (const [name, optional] of dependencies) {
    pending.push({
      name,
      fromDirectory: sourceDirectory,
      optional,
      requestedBy: `${manifest.name}@${manifest.version}`,
    });
  }
}

copiedPackages.sort((left, right) =>
  left.installPath.localeCompare(right.installPath),
);
skippedPackages.sort((left, right) => left.name.localeCompare(right.name));

const runtimePackageJson = {
  name: '@gameagent/desktop-runtime',
  version: '0.0.0',
  private: true,
  type: 'module',
};
await writeFile(
  path.join(stagingRoot, 'package.json'),
  `${JSON.stringify(runtimePackageJson, null, 2)}\n`,
  'utf8',
);

const stagingBytes = await directorySize(stagingRoot);
if (!Number.isFinite(maxStagingBytes) || maxStagingBytes <= 0) {
  throw new Error('GAMEAGENT_RUNTIME_MAX_BYTES 必须是正数。');
}
if (stagingBytes > maxStagingBytes) {
  throw new Error(
    `Runtime 依赖 staging 大小为 ${formatBytes(stagingBytes)}，超过限制 ${formatBytes(maxStagingBytes)}。` +
      '请检查依赖闭包，避免误复制整个 node_modules。',
  );
}

const closureManifest = {
  schemaVersion: 1,
  platform: targetPlatform,
  arch: targetArch,
  externalPackages,
  copiedPackages,
  skippedPackages,
  sizeBytes: stagingBytes,
};
await writeFile(
  path.join(stagingRoot, 'runtime-deps-manifest.json'),
  `${JSON.stringify(closureManifest, null, 2)}\n`,
  'utf8',
);

console.log(
  `已准备 ${copiedPackages.length} 个 Runtime 包（${formatBytes(stagingBytes)}，${targetPlatform}/${targetArch}）。`,
);
if (skippedPackages.length > 0) {
  console.log(
    `已跳过 ${skippedPackages.length} 个当前平台未安装或不兼容的可选包。`,
  );
}

async function readEsbuildExternalPackages(configPath) {
  const source = await readFile(configPath, 'utf8');
  const arrayMatch = source.match(/const\s+external\s*=\s*\[([\s\S]*?)\];/);
  if (!arrayMatch) {
    throw new Error(`无法从 ${configPath} 找到 esbuild external 数组。`);
  }

  const packageNames = [];
  const stringPattern = /(['"])(.*?)\1/g;
  for (const match of arrayMatch[1].matchAll(stringPattern)) {
    const packageName = match[2];
    if (!isPackageName(packageName)) {
      throw new Error(`不支持的 esbuild external 项：${packageName}`);
    }
    if (!packageNames.includes(packageName)) packageNames.push(packageName);
  }
  if (packageNames.length === 0) {
    throw new Error('esbuild external 数组为空，无法准备 Runtime 依赖。');
  }
  return packageNames;
}

function isPackageName(value) {
  if (
    !value ||
    value.startsWith('.') ||
    value.startsWith('/') ||
    value.includes('*')
  ) {
    return false;
  }
  const parts = value.split('/');
  return value.startsWith('@') ? parts.length === 2 : parts.length === 1;
}

async function resolveInstalledPackage(packageName, fromDirectory) {
  const packageSegments = packageName.split('/');
  let cursor = path.resolve(fromDirectory);

  while (true) {
    const candidate = path.join(cursor, 'node_modules', ...packageSegments);
    try {
      const candidateStat = await lstat(candidate);
      if (candidateStat.isDirectory() || candidateStat.isSymbolicLink()) {
        await stat(path.join(candidate, 'package.json'));
        return candidate;
      }
    } catch {
      // Continue with the next Node resolution ancestor.
    }

    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

function supportsTarget(manifest, platform, arch) {
  return (
    matchesConstraint(manifest.os, platform) &&
    matchesConstraint(manifest.cpu, arch)
  );
}

function matchesConstraint(constraints, value) {
  if (!Array.isArray(constraints) || constraints.length === 0) return true;
  const denied = constraints
    .filter((entry) => entry.startsWith('!'))
    .map((entry) => entry.slice(1));
  if (denied.includes(value)) return false;
  const allowed = constraints.filter((entry) => !entry.startsWith('!'));
  return allowed.length === 0 || allowed.includes(value);
}

async function copyRuntimePackage(source, destination, packageName) {
  await cp(source, destination, {
    recursive: true,
    dereference: true,
    filter: (sourcePath) => {
      const relativePath = path.relative(source, sourcePath);
      if (!relativePath) return true;
      const segments = relativePath.split(path.sep);
      if (segments.includes('node_modules')) return false;
      return shouldCopyTargetFile(packageName, segments);
    },
  });
}

function shouldCopyTargetFile(packageName, segments) {
  if (
    packageName === 'onnxruntime-node' &&
    segments[0] === 'bin' &&
    segments[1] === 'napi-v3' &&
    segments.length >= 4
  ) {
    return segments[2] === targetPlatform && segments[3] === targetArch;
  }

  if (
    packageName === 'node-pty' &&
    segments[0] === 'prebuilds' &&
    segments.length >= 2
  ) {
    return segments[1] === `${targetPlatform}-${targetArch}`;
  }

  if (
    packageName === 'sharp' &&
    segments[0] === 'vendor' &&
    segments.length >= 3
  ) {
    const sharpArch = targetArch === 'arm64' ? 'arm64v8' : targetArch;
    return segments[2] === `${targetPlatform}-${sharpArch}`;
  }

  return true;
}

async function directorySize(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(entryPath);
    else if (entry.isFile()) total += (await stat(entryPath)).size;
  }
  return total;
}

async function assertDirectory(directory, message) {
  try {
    if ((await stat(directory)).isDirectory()) return;
  } catch {
    // Throw the user-facing message below.
  }
  throw new Error(message);
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}
