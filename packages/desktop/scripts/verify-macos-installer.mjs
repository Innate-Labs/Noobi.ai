#!/usr/bin/env node

import { spawn } from 'node:child_process';
import console from 'node:console';
import {
  access,
  lstat,
  mkdtemp,
  readFile,
  readlink,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  throw new Error('macOS 安装包只能在 macOS 上验证。');
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, '..');
const manifest = JSON.parse(
  await readFile(path.join(desktopRoot, 'package.json'), 'utf8'),
);
const releaseDirectory = path.join(desktopRoot, 'release');
const defaultDmg = path.join(
  releaseDirectory,
  `Noobi.ai-${manifest.version}-${process.arch}.dmg`,
);
const dmgPath = path.resolve(process.argv[2] || defaultDmg);
const mountPoint = await mkdtemp(path.join(os.tmpdir(), 'noobi-dmg-verify-'));
const appName = `${manifest.build.productName}.app`;
let mounted = false;

try {
  await access(dmgPath);
  await run('hdiutil', ['verify', dmgPath]);
  await run('hdiutil', [
    'attach',
    dmgPath,
    '-readonly',
    '-nobrowse',
    '-noautoopen',
    '-mountpoint',
    mountPoint,
  ]);
  mounted = true;

  const appPath = path.join(mountPoint, appName);
  const applicationsLink = path.join(mountPoint, 'Applications');
  const applicationsInfo = await lstat(applicationsLink);
  if (!applicationsInfo.isSymbolicLink()) {
    throw new Error('DMG 缺少指向 /Applications 的安装快捷方式。');
  }
  if ((await readlink(applicationsLink)) !== '/Applications') {
    throw new Error('DMG 的 Applications 快捷方式目标无效。');
  }

  await assertDirectory(appPath, 'DMG 中缺少应用程序。');
  const infoPlist = path.join(appPath, 'Contents', 'Info.plist');
  const bundleId = (
    await run('plutil', [
      '-extract',
      'CFBundleIdentifier',
      'raw',
      '-o',
      '-',
      infoPlist,
    ])
  ).stdout.trim();
  if (bundleId !== manifest.build.appId) {
    throw new Error(`Bundle ID 不匹配：${bundleId}`);
  }

  const executableName = (
    await run('plutil', [
      '-extract',
      'CFBundleExecutable',
      'raw',
      '-o',
      '-',
      infoPlist,
    ])
  ).stdout.trim();
  const executablePath = path.join(
    appPath,
    'Contents',
    'MacOS',
    executableName,
  );
  const architectures = (await run('lipo', ['-archs', executablePath])).stdout
    .trim()
    .split(/\s+/);
  if (!architectures.includes(process.arch)) {
    throw new Error(
      `应用架构不匹配：需要 ${process.arch}，实际为 ${architectures.join(', ')}`,
    );
  }

  const resources = path.join(appPath, 'Contents', 'Resources');
  for (const relativePath of [
    'app.asar',
    'runtime/cli.js',
    'runtime/package.json',
    'runtime/runtime-deps-manifest.json',
    'runtime/node_modules',
    'game-skill/custom.md',
    'game-skill/docs',
    'game-skill/templates',
  ]) {
    await access(path.join(resources, relativePath));
  }

  const signature = await run('codesign', ['--verify', '--deep', appPath], {
    allowFailure: true,
  });
  const signatureLabel =
    signature.code === 0 ? '签名结构有效' : '本地未签名构建';
  console.log(
    `macOS DMG 验证通过：${path.basename(dmgPath)}（${architectures.join(
      ', ',
    )}，${signatureLabel}）。`,
  );
} finally {
  if (mounted) {
    await run('hdiutil', ['detach', mountPoint, '-force'], {
      allowFailure: true,
    });
  }
  await rm(mountPoint, { recursive: true, force: true });
}

async function assertDirectory(target, message) {
  const info = await lstat(target).catch(() => undefined);
  if (!info?.isDirectory()) throw new Error(message);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      const result = { code: code ?? -1, stdout, stderr };
      if (code === 0 || options.allowFailure) resolve(result);
      else {
        reject(
          new Error(
            `${command} ${args.join(' ')} 失败（${code}）：\n${stdout}${stderr}`,
          ),
        );
      }
    });
  });
}
