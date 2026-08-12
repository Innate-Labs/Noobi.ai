#!/usr/bin/env node

import { spawn } from 'node:child_process';
import console from 'node:console';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_WINDOWS_RESOURCES,
  assertAmd64PortableExecutable,
  assertAuthenticodeStatus,
  assertBuilderIdentity,
  assertRuntimeManifest,
  assertWindowsVersionInfo,
  createNsisInstallArguments,
  expectedWindowsArtifactName,
  inspectPortableExecutable,
} from './windows-installer-verifier.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(
    `Windows 安装包验证必须运行在 Windows x64 宿主，当前为 ${process.platform}/${process.arch}。`,
  );
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, '..');
const manifest = JSON.parse(
  await readFile(path.join(desktopRoot, 'package.json'), 'utf8'),
);
const requireSignature = process.argv.includes('--require-signature');
const expectedPublisher = process.env.NOOBI_WINDOWS_SIGNER || 'Innate Labs';
const installSmoke = process.argv.includes('--install-smoke');
const positionalArguments = process.argv
  .slice(2)
  .filter(
    (argument) =>
      argument !== '--require-signature' && argument !== '--install-smoke',
  );
if (positionalArguments.length > 1) {
  throw new Error(
    '用法：node verify-windows-installer.mjs [setup.exe] [--require-signature] [--install-smoke]',
  );
}

const releaseDirectory = path.join(desktopRoot, 'release');
const setupName = expectedWindowsArtifactName(
  manifest.build.productName,
  manifest.version,
);
const setupPath = path.resolve(
  positionalArguments[0] || path.join(releaseDirectory, setupName),
);
if (path.basename(setupPath) !== setupName) {
  throw new Error(
    `Windows setup 文件名不符合发行契约：${path.basename(setupPath)}`,
  );
}

const unpackedDirectory = path.join(releaseDirectory, 'win-unpacked');
const applicationPath = path.join(
  unpackedDirectory,
  `${manifest.build.productName}.exe`,
);
const resourcesDirectory = path.join(unpackedDirectory, 'resources');
const runtimeDirectory = path.join(resourcesDirectory, 'runtime');
const runtimeCli = path.join(runtimeDirectory, 'cli.js');

await access(setupPath);
await access(applicationPath);

// NSIS uses an i386 bootstrap executable even when it contains only an x64
// payload. Validate its PE structure; the unpacked Electron executable and
// Runtime manifest below are the authoritative payload architecture checks.
const setupPe = inspectPortableExecutable(
  await readFile(setupPath),
  path.basename(setupPath),
);
const applicationPe = assertAmd64PortableExecutable(
  await readFile(applicationPath),
  path.basename(applicationPath),
);

for (const relativePath of REQUIRED_WINDOWS_RESOURCES) {
  await access(path.join(resourcesDirectory, ...relativePath.split('/')));
}

const runtimeManifest = assertRuntimeManifest(
  JSON.parse(
    await readFile(
      path.join(runtimeDirectory, 'runtime-deps-manifest.json'),
      'utf8',
    ),
  ),
);
const effectiveConfigPath = path.join(
  releaseDirectory,
  'builder-effective-config.yaml',
);
assertBuilderIdentity(await readFile(effectiveConfigPath, 'utf8'), {
  appId: manifest.build.appId,
  productName: manifest.build.productName,
});

for (const executable of [setupPath, applicationPath]) {
  const versionInfo = await getVersionInfo(executable);
  assertWindowsVersionInfo(versionInfo, {
    productName: manifest.build.productName,
    version: manifest.version,
  });
}

const signatureResults = [];
for (const executable of [setupPath, applicationPath]) {
  const signature = await getAuthenticodeSignature(executable);
  signatureResults.push({
    file: path.basename(executable),
    status: signature.Status,
    mode: assertAuthenticodeStatus(
      signature.Status,
      requireSignature,
      signature.SignerSubject,
      expectedPublisher,
    ),
    signerSubject: signature.SignerSubject,
  });
}

const cli = await run(applicationPath, [runtimeCli, '--help'], {
  cwd: runtimeDirectory,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NO_COLOR: '1',
    QWEN_CODE_NO_RELAUNCH: 'true',
  },
  timeoutMs: 30_000,
});
if (!/Usage:\s+(?:opengame|gameagent|noobi)/i.test(cli.stdout)) {
  throw new Error(
    `打包 Runtime CLI --help 输出异常：\n${cli.stdout}\n${cli.stderr}`,
  );
}

await runPackagedSmoke(applicationPath, unpackedDirectory, process.env);

if (installSmoke) {
  await runCleanInstallSmoke();
}

console.log(
  `Windows 安装包验证通过：${path.basename(setupPath)}；` +
    `setup PE=${setupPe.machineName}，payload PE=${applicationPe.machineName}；` +
    `Runtime=${runtimeManifest.platform}/${runtimeManifest.arch}；` +
    `签名=${signatureResults.map((entry) => `${entry.file}:${entry.mode}`).join(', ')}；` +
    `clean install smoke=${installSmoke ? 'passed' : 'not requested'}。`,
);

async function runCleanInstallSmoke() {
  const installSandbox = await mkdtemp(
    path.join(os.tmpdir(), 'noobi-windows-install-smoke-'),
  );
  const externalProject = await mkdtemp(
    path.join(os.tmpdir(), 'noobi-external-project-smoke-'),
  );
  const installDirectory = path.join(installSandbox, 'Noobi.ai');
  const profileDirectory = path.join(externalProject, 'profile');
  const sentinelPath = path.join(externalProject, 'project-sentinel.noobi');
  const sentinelContents = `Noobi.ai external project ${Date.now()}\n`;
  let uninstallerPath;
  let uninstallCompleted = false;

  await mkdir(profileDirectory, { recursive: true });
  await writeFile(sentinelPath, sentinelContents, 'utf8');

  try {
    await run(setupPath, createNsisInstallArguments(installDirectory), {
      cwd: installSandbox,
      env: process.env,
      timeoutMs: 120_000,
    });

    const installedApplication = path.join(
      installDirectory,
      `${manifest.build.productName}.exe`,
    );
    const installedResources = path.join(installDirectory, 'resources');
    const installedRuntime = path.join(installedResources, 'runtime');
    await access(installedApplication);
    assertAmd64PortableExecutable(
      await readFile(installedApplication),
      'installed Noobi.ai.exe',
    );
    for (const relativePath of REQUIRED_WINDOWS_RESOURCES) {
      await access(path.join(installedResources, ...relativePath.split('/')));
    }
    assertRuntimeManifest(
      JSON.parse(
        await readFile(
          path.join(installedRuntime, 'runtime-deps-manifest.json'),
          'utf8',
        ),
      ),
    );
    assertWindowsVersionInfo(await getVersionInfo(installedApplication), {
      productName: manifest.build.productName,
      version: manifest.version,
    });
    const installedSignature =
      await getAuthenticodeSignature(installedApplication);
    assertAuthenticodeStatus(
      installedSignature.Status,
      requireSignature,
      installedSignature.SignerSubject,
      expectedPublisher,
    );

    const installedCli = await run(
      installedApplication,
      [path.join(installedRuntime, 'cli.js'), '--help'],
      {
        cwd: installedRuntime,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          NO_COLOR: '1',
          QWEN_CODE_NO_RELAUNCH: 'true',
        },
        timeoutMs: 30_000,
      },
    );
    if (!/Usage:\s+(?:opengame|gameagent|noobi)/i.test(installedCli.stdout)) {
      throw new Error('已安装 Runtime CLI --help 输出异常。');
    }

    const smokeEnvironment = {
      ...process.env,
      APPDATA: profileDirectory,
      LOCALAPPDATA: profileDirectory,
    };
    await runPackagedSmoke(
      installedApplication,
      installDirectory,
      smokeEnvironment,
    );

    const uninstallers = (await readdir(installDirectory)).filter((entry) =>
      /^Uninstall .+\.exe$/i.test(entry),
    );
    if (uninstallers.length !== 1) {
      throw new Error(
        `安装目录应包含一个 uninstaller，实际为 ${uninstallers.join(', ') || 'none'}。`,
      );
    }
    uninstallerPath = path.join(installDirectory, uninstallers[0]);
    await run(uninstallerPath, ['/S'], {
      cwd: installDirectory,
      env: smokeEnvironment,
      timeoutMs: 120_000,
    });
    await waitForPathRemoval(installedApplication, 30_000);
    await waitForPathRemoval(uninstallerPath, 30_000);

    if ((await readFile(sentinelPath, 'utf8')) !== sentinelContents) {
      throw new Error('NSIS 卸载修改了安装目录外的项目 sentinel。');
    }
    await access(profileDirectory);
    uninstallCompleted = true;
  } finally {
    if (!uninstallerPath && (await pathExists(installDirectory))) {
      const candidates = (await readdir(installDirectory)).filter((entry) =>
        /^Uninstall .+\.exe$/i.test(entry),
      );
      if (candidates.length === 1) {
        uninstallerPath = path.join(installDirectory, candidates[0]);
      }
    }
    if (
      !uninstallCompleted &&
      uninstallerPath &&
      (await pathExists(uninstallerPath))
    ) {
      await run(uninstallerPath, ['/S'], {
        cwd: path.dirname(uninstallerPath),
        env: process.env,
        timeoutMs: 120_000,
        allowFailure: true,
      });
    }
    await removeOwnedTemporaryDirectory(installSandbox, 'install sandbox');
    await removeOwnedTemporaryDirectory(externalProject, 'external project');
  }
}

async function runPackagedSmoke(executable, cwd, baseEnvironment) {
  const packagedSmokeEnvironment = {
    ...baseEnvironment,
    NO_COLOR: '1',
  };
  delete packagedSmokeEnvironment.ELECTRON_RUN_AS_NODE;
  const packagedSmoke = await run(executable, ['--noobi-smoke-test'], {
    cwd,
    env: packagedSmokeEnvironment,
    timeoutMs: 15_000,
  });
  if (
    !`${packagedSmoke.stdout}\n${packagedSmoke.stderr}`.includes(
      'NOOBI_PACKAGED_SMOKE_READY',
    )
  ) {
    throw new Error(
      `packaged app 冒烟未返回 NOOBI_PACKAGED_SMOKE_READY：\n` +
        `${packagedSmoke.stdout}\n${packagedSmoke.stderr}`,
    );
  }
}

async function waitForPathRemoval(target, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await pathExists(target))) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`NSIS 卸载后仍存在：${target}`);
}

async function pathExists(target) {
  return access(target).then(
    () => true,
    () => false,
  );
}

async function removeOwnedTemporaryDirectory(target, label) {
  const relative = path.relative(os.tmpdir(), target);
  if (
    !relative ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    !path.basename(target).startsWith('noobi-')
  ) {
    throw new Error(`拒绝清理不受 verifier 管理的 ${label}：${target}`);
  }
  await rm(target, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 250,
  });
}

async function getVersionInfo(filePath) {
  return runPowerShellJson(
    `
$item = Get-Item -LiteralPath $env:NOOBI_VERIFY_FILE
$info = $item.VersionInfo
[ordered]@{
  ProductName = [string]$info.ProductName
  ProductVersion = [string]$info.ProductVersion
  FileDescription = [string]$info.FileDescription
  FileVersion = [string]$info.FileVersion
} | ConvertTo-Json -Compress
`,
    filePath,
  );
}

async function getAuthenticodeSignature(filePath) {
  return runPowerShellJson(
    `
$signature = Get-AuthenticodeSignature -LiteralPath $env:NOOBI_VERIFY_FILE
[ordered]@{
  Status = [string]$signature.Status
  StatusMessage = [string]$signature.StatusMessage
  SignerSubject = if ($null -eq $signature.SignerCertificate) { $null } else { [string]$signature.SignerCertificate.Subject }
} | ConvertTo-Json -Compress
`,
    filePath,
  );
}

async function runPowerShellJson(script, filePath) {
  const powershell = path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const result = await run(
    powershell,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `$ErrorActionPreference = 'Stop'\n${script}`,
    ],
    {
      cwd: desktopRoot,
      env: { ...process.env, NOOBI_VERIFY_FILE: filePath },
      timeoutMs: 30_000,
    },
  );
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(
      `PowerShell 没有返回有效 JSON：${result.stdout}\n${result.stderr}`,
      { cause: error },
    );
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`命令超时：${command} ${args.join(' ')}`));
    }, options.timeoutMs || 30_000);
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0 || options.allowFailure) {
        resolve({ code: code ?? -1, stdout, stderr });
      } else {
        reject(
          new Error(
            `${command} 失败（code=${code ?? 'null'}, signal=${signal ?? 'none'}）：\n` +
              `${stdout}\n${stderr}`,
          ),
        );
      }
    });
  });
}
