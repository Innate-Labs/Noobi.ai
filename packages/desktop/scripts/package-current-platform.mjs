#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), '..');

export function resolvePackageScript(platform, arch) {
  if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
    return 'package:mac';
  }
  if (platform === 'win32' && arch === 'x64') {
    return 'package:win';
  }
  throw new Error(
    `Noobi.ai 不支持在 ${platform}/${arch} 宿主上生成桌面安装包。` +
      '支持的宿主为 macOS arm64/x64 与 Windows x64。',
  );
}

export async function packageCurrentPlatform({
  platform = process.platform,
  arch = process.arch,
  cwd = desktopRoot,
  environment = process.env,
  nodeExecutable = process.execPath,
} = {}) {
  const script = resolvePackageScript(platform, arch);
  const invocation = resolveNpmInvocation(
    platform,
    script,
    environment,
    nodeExecutable,
  );
  await run(invocation.command, invocation.args, cwd);
}

export function resolveNpmInvocation(
  platform,
  script,
  environment = process.env,
  nodeExecutable = process.execPath,
) {
  if (platform !== 'win32') {
    return { command: 'npm', args: ['run', script] };
  }
  const npmCli = environment.npm_execpath;
  if (!npmCli || !path.win32.isAbsolute(npmCli) || !/\.m?js$/i.test(npmCli)) {
    throw new Error(
      'Windows 打包入口需要 npm 提供绝对 npm_execpath；拒绝通过 .cmd 或 shell 启动。',
    );
  }
  return {
    command: nodeExecutable,
    args: [npmCli, 'run', script],
  };
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(' ')} 失败（code=${code ?? 'null'}, signal=${signal ?? 'none'}）。`,
        ),
      );
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await packageCurrentPlatform();
}
