#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, '..');
const repositoryRoot = path.resolve(desktopRoot, '../..');
const stagingRoot = path.join(desktopRoot, '.runtime-deps');
const sourceCli = path.join(repositoryRoot, 'dist', 'cli.js');
const electronExecutable = require('electron');
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

  const moduleProbe = `
import { createRequire } from 'node:module';
import { get_encoding } from 'tiktoken';
import sharp from 'sharp';
import 'onnxruntime-node';
import '@imgly/background-removal-node';
import '@lydell/node-pty';

const require = createRequire(import.meta.url);
for (const name of [
  'tiktoken',
  'sharp',
  'onnxruntime-node',
  '@imgly/background-removal-node',
  '@lydell/node-pty',
  'node-pty',
]) {
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
console.log('runtime modules resolved');
`;
  const probePath = path.join(temporaryRuntime, 'probe.mjs');
  await writeFile(probePath, moduleProbe, 'utf8');

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

  const closure = JSON.parse(
    await readFile(
      path.join(stagingRoot, 'runtime-deps-manifest.json'),
      'utf8',
    ),
  );
  console.log(
    `隔离 Runtime smoke test 通过：${closure.copiedPackages.length} packages，` +
      `${(closure.sizeBytes / 1024 / 1024).toFixed(1)} MB。`,
  );
} finally {
  await rm(temporaryRuntime, { recursive: true, force: true });
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
