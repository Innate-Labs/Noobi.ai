#!/usr/bin/env node

import { spawn } from 'node:child_process';
import console from 'node:console';
import { createRequire } from 'node:module';
import {
  copyFile,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';
import { isPathInside } from './runtime-deps-files.mjs';

const require = createRequire(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, '..');
const repositoryRoot = path.resolve(desktopRoot, '../..');
const stagingRoot = path.join(desktopRoot, '.runtime-deps');
const sourceCli = path.join(repositoryRoot, 'dist', 'cli.js');
const electronExecutable = require('electron');
const requiredRuntimePackages = [
  'tiktoken',
  'sharp',
  'onnxruntime-node',
  '@imgly/background-removal-node',
  '@lydell/node-pty',
  'node-pty',
];
const temporaryRuntime = await mkdtemp(
  path.join(os.tmpdir(), 'gameagent-runtime-smoke-'),
);

try {
  await copyFile(sourceCli, path.join(temporaryRuntime, 'cli.js'));
  await copyFile(
    path.join(stagingRoot, 'package.json'),
    path.join(temporaryRuntime, 'package.json'),
  );
  await symlink(
    path.join(stagingRoot, 'node_modules'),
    path.join(temporaryRuntime, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await symlink(
    path.join(repositoryRoot, 'dist', 'vendor'),
    path.join(temporaryRuntime, 'vendor'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  const realStagingNodeModules = await realpath(
    path.join(stagingRoot, 'node_modules'),
  );
  const realTemporaryNodeModules = await realpath(
    path.join(temporaryRuntime, 'node_modules'),
  );
  if (!samePath(realStagingNodeModules, realTemporaryNodeModules)) {
    throw new Error(
      `Runtime smoke junction 指向错误：${realTemporaryNodeModules}，` +
        `预期 ${realStagingNodeModules}。`,
    );
  }

  const closure = JSON.parse(
    await readFile(
      path.join(stagingRoot, 'runtime-deps-manifest.json'),
      'utf8',
    ),
  );
  if (
    closure.platform !== process.platform ||
    closure.arch !== process.arch ||
    closure.nativeStaging !== true
  ) {
    throw new Error(
      `Runtime manifest 与宿主不匹配：manifest=${closure.platform}/${closure.arch}，` +
        `host=${process.platform}/${process.arch}。`,
    );
  }
  if (
    !Number.isInteger(closure.fileCount) ||
    closure.fileCount <= 0 ||
    !Number.isFinite(closure.sizeBytes) ||
    closure.sizeBytes <= 0
  ) {
    throw new Error('Runtime manifest 没有记录真实 staging 文件。');
  }
  for (const packageName of requiredRuntimePackages) {
    const packageEntry = closure.copiedPackages.find(
      (entry) => entry.name === packageName,
    );
    if (
      !packageEntry ||
      !Number.isInteger(packageEntry.fileCount) ||
      packageEntry.fileCount <= 0 ||
      !Number.isFinite(packageEntry.sizeBytes) ||
      packageEntry.sizeBytes <= 0
    ) {
      throw new Error(`Runtime manifest 缺少有效包：${packageName}。`);
    }
  }

  const moduleProbe = `
import { createRequire } from 'node:module';
import { get_encoding } from 'tiktoken';
import sharp from 'sharp';
import 'onnxruntime-node';
import '@imgly/background-removal-node';
import { spawn as spawnPty } from '@lydell/node-pty';

const require = createRequire(import.meta.url);
for (const name of ${JSON.stringify(requiredRuntimePackages)}) {
  require.resolve(name);
}

const encoding = get_encoding('cl100k_base');
const tokenCount = encoding.encode('GameAgent runtime smoke test').length;
encoding.free();
const metadata = await sharp({
  create: {
    width: 1,
    height: 1,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
}).metadata();
if (tokenCount < 1 || metadata.width !== 1 || metadata.height !== 1) {
  throw new Error('Runtime module probe returned invalid results.');
}

if (process.platform === 'win32') {
  await new Promise((resolve, reject) => {
    const terminal = spawnPty(process.env.ComSpec || 'cmd.exe', [
      '/d',
      '/s',
      '/c',
      'echo NOOBI_PTY_OK',
    ], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env,
    });
    let output = '';
    const timeout = setTimeout(() => {
      terminal.kill();
      reject(new Error('Windows PTY probe timed out.'));
    }, 10_000);
    terminal.onData((chunk) => {
      output += chunk;
    });
    terminal.onExit(({ exitCode }) => {
      clearTimeout(timeout);
      if (exitCode === 0 && output.includes('NOOBI_PTY_OK')) resolve();
      else reject(new Error('Windows PTY probe failed: ' + output));
    });
  });
}
console.log('runtime modules resolved');
`;
  const probePath = path.join(temporaryRuntime, 'probe.mjs');
  await writeFile(probePath, moduleProbe, 'utf8');

  const probeRequire = createRequire(probePath);
  for (const packageName of requiredRuntimePackages) {
    const resolvedEntry = await realpath(probeRequire.resolve(packageName));
    if (!isPathInside(realStagingNodeModules, resolvedEntry)) {
      throw new Error(
        `Runtime 模块 ${packageName} 解析到了 staging 之外：${resolvedEntry}`,
      );
    }
  }

  const commonArguments = ['--preserve-symlinks', '--preserve-symlinks-main'];
  const probe = await run(
    electronExecutable,
    [...commonArguments, probePath],
    temporaryRuntime,
  );
  if (!probe.stdout.includes('runtime modules resolved')) {
    throw new Error(
      `Runtime 模块探针没有成功输出：\n${probe.stdout}\n${probe.stderr}`,
    );
  }

  if (process.platform === 'win32') {
    const bundledRipgrep = path.join(
      temporaryRuntime,
      'vendor',
      'ripgrep',
      'x64-win32',
      'rg.exe',
    );
    const ripgrep = await run(bundledRipgrep, ['--version'], temporaryRuntime);
    if (!ripgrep.stdout.startsWith('ripgrep ')) {
      throw new Error(
        `Windows bundled rg smoke test 输出异常：\n${ripgrep.stdout}\n${ripgrep.stderr}`,
      );
    }
  }

  const cli = await run(
    electronExecutable,
    [...commonArguments, path.join(temporaryRuntime, 'cli.js'), '--help'],
    temporaryRuntime,
  );
  if (!/Usage:\s+opengame/.test(cli.stdout)) {
    throw new Error(
      `隔离 CLI smoke test 输出异常：\n${cli.stdout}\n${cli.stderr}`,
    );
  }

  console.log(
    `隔离 Runtime smoke test 通过：${closure.copiedPackages.length} packages，` +
      `${(closure.sizeBytes / 1024 / 1024).toFixed(1)} MB。`,
  );
} finally {
  await rm(temporaryRuntime, { recursive: true, force: true });
}

function samePath(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NO_COLOR: '1',
        QWEN_CODE_NO_RELAUNCH: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error(`Runtime smoke test 超时：${command} ${args.join(' ')}`),
      );
    }, 30_000);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else {
        reject(
          new Error(`Runtime smoke test 退出码 ${code}:\n${stdout}\n${stderr}`),
        );
      }
    });
  });
}
