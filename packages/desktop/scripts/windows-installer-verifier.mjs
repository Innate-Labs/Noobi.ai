import { Buffer } from 'node:buffer';
import path from 'node:path';

export const PE_MACHINE = Object.freeze({
  I386: 0x014c,
  ARM64: 0xaa64,
  AMD64: 0x8664,
});

export const REQUIRED_WINDOWS_RESOURCES = Object.freeze([
  'app.asar',
  'runtime/cli.js',
  'runtime/package.json',
  'runtime/runtime-deps-manifest.json',
  'runtime/node_modules',
  'runtime/node_modules/@lydell/node-pty-win32-x64',
  'runtime/vendor/ripgrep/x64-win32/rg.exe',
  'game-skill/custom.md',
  'game-skill/docs',
  'game-skill/templates',
]);

export const AUTHENTICODE_POWERSHELL_SCRIPT = String.raw`
$securityModule = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1'
Import-Module -Name $securityModule -Force -ErrorAction Stop
$signature = Microsoft.PowerShell.Security\Get-AuthenticodeSignature -LiteralPath $env:NOOBI_VERIFY_FILE
[ordered]@{
  Status = [string]$signature.Status
  StatusMessage = [string]$signature.StatusMessage
  SignerSubject = if ($null -eq $signature.SignerCertificate) { $null } else { [string]$signature.SignerCertificate.Subject }
} | ConvertTo-Json -Compress
`;

export function windowsPowerShellCandidates(environment = {}) {
  return [
    path.win32.join(
      environment.ProgramFiles || 'C:\\Program Files',
      'PowerShell',
      '7',
      'pwsh.exe',
    ),
    path.win32.join(
      environment.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    ),
  ];
}

export function windowsPowerShellChildEnvironment(environment, executable) {
  const childEnvironment = { ...environment };
  if (path.win32.basename(executable).toLowerCase() === 'powershell.exe') {
    for (const name of Object.keys(childEnvironment)) {
      if (name.toLowerCase() === 'psmodulepath') {
        delete childEnvironment[name];
      }
    }
  }
  return childEnvironment;
}

export function inspectPortableExecutable(input, label = 'PE 文件') {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < 64 || buffer[0] !== 0x4d || buffer[1] !== 0x5a) {
    throw new Error(`${label} 缺少有效的 DOS MZ header。`);
  }

  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset < 0x40 || peOffset + 24 > buffer.length) {
    throw new Error(`${label} 的 PE header offset 无效。`);
  }
  if (
    buffer[peOffset] !== 0x50 ||
    buffer[peOffset + 1] !== 0x45 ||
    buffer[peOffset + 2] !== 0 ||
    buffer[peOffset + 3] !== 0
  ) {
    throw new Error(`${label} 缺少有效的 PE signature。`);
  }

  const machine = buffer.readUInt16LE(peOffset + 4);
  return {
    machine,
    machineName: peMachineName(machine),
    peOffset,
  };
}

export function assertAmd64PortableExecutable(input, label = 'PE 文件') {
  const inspected = inspectPortableExecutable(input, label);
  if (inspected.machine !== PE_MACHINE.AMD64) {
    throw new Error(
      `${label} 不是 Windows x64 PE：machine=${inspected.machineName} ` +
        `(0x${inspected.machine.toString(16).padStart(4, '0')})。`,
    );
  }
  return inspected;
}

export function peMachineName(machine) {
  switch (machine) {
    case PE_MACHINE.I386:
      return 'i386';
    case PE_MACHINE.ARM64:
      return 'arm64';
    case PE_MACHINE.AMD64:
      return 'amd64';
    default:
      return 'unknown';
  }
}

export function assertRuntimeManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Runtime manifest 必须是 JSON object。');
  }
  if (manifest.platform !== 'win32' || manifest.arch !== 'x64') {
    throw new Error(
      `Runtime manifest target 必须为 win32/x64，实际为 ` +
        `${String(manifest.platform)}/${String(manifest.arch)}。`,
    );
  }
  if (
    manifest.hostPlatform !== 'win32' ||
    manifest.hostArch !== 'x64' ||
    manifest.nativeStaging !== true
  ) {
    throw new Error('Runtime manifest 缺少 Windows x64 原生 staging 证据。');
  }
  if (!Array.isArray(manifest.externalPackages)) {
    throw new Error('Runtime manifest 缺少 externalPackages。');
  }
  if (!Array.isArray(manifest.copiedPackages)) {
    throw new Error('Runtime manifest 缺少 copiedPackages。');
  }
  if (!Number.isFinite(manifest.sizeBytes) || manifest.sizeBytes <= 0) {
    throw new Error('Runtime manifest sizeBytes 无效。');
  }
  return manifest;
}

export function missingRequiredResources(
  availablePaths,
  requiredPaths = REQUIRED_WINDOWS_RESOURCES,
) {
  const normalized = new Set(
    [...availablePaths].map((entry) => normalizeResourcePath(entry)),
  );
  return requiredPaths.filter(
    (entry) => !normalized.has(normalizeResourcePath(entry)),
  );
}

export function assertAuthenticodeStatus(
  status,
  requireSignature,
  signerSubject,
  expectedPublisher,
) {
  const normalized = String(status || '').trim();
  if (requireSignature) {
    if (normalized !== 'Valid') {
      throw new Error(
        `release 模式要求有效 Authenticode 签名，实际状态为 ${normalized || 'empty'}。`,
      );
    }
    const subject = String(signerSubject || '').trim();
    const publisher = String(expectedPublisher || '').trim();
    if (
      !subject ||
      !publisher ||
      !subjectIncludesPublisher(subject, publisher)
    ) {
      throw new Error(
        `release 签名发布者不匹配：${subject || 'empty'}（预期包含 ${publisher || 'empty'}）。`,
      );
    }
    return 'signed';
  }
  if (normalized === 'Valid') return 'signed';
  if (normalized === 'NotSigned') return 'unsigned-dev';
  throw new Error(
    `开发产物的 Authenticode 状态异常：${normalized || 'empty'}。` +
      '仅接受 Valid 或明确的 NotSigned。',
  );
}

function subjectIncludesPublisher(subject, expectedPublisher) {
  const normalize = (value) =>
    value
      .normalize('NFKC')
      .toLocaleLowerCase('en-US')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return normalize(subject).includes(normalize(expectedPublisher));
}

export function assertWindowsVersionInfo(
  versionInfo,
  { productName, version },
) {
  if (String(versionInfo?.ProductName || '').trim() !== productName) {
    throw new Error(
      `Windows ProductName 不匹配：${String(versionInfo?.ProductName || '')}`,
    );
  }
  const actualVersion = normalizeWindowsVersion(versionInfo?.ProductVersion);
  const expectedVersion = normalizeWindowsVersion(version);
  if (actualVersion !== expectedVersion) {
    throw new Error(
      `Windows ProductVersion 不匹配：${actualVersion || 'empty'}（预期 ${expectedVersion}）。`,
    );
  }
  return versionInfo;
}

export function assertBuilderIdentity(builderConfig, { appId, productName }) {
  const values = builderIdentityValues(builderConfig);
  if (values.appId !== appId) {
    throw new Error(
      `electron-builder appId 不匹配：${values.appId || 'missing'}。`,
    );
  }
  if (values.productName !== productName) {
    throw new Error(
      `electron-builder productName 不匹配：${values.productName || 'missing'}。`,
    );
  }
  return values;
}

function builderIdentityValues(builderConfig) {
  if (
    builderConfig &&
    typeof builderConfig === 'object' &&
    !Array.isArray(builderConfig)
  ) {
    return {
      appId: String(builderConfig.appId || '').trim(),
      productName: String(builderConfig.productName || '').trim(),
    };
  }

  const values = new Map();
  for (const line of String(builderConfig).split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.+?)\s*$/);
    if (match) values.set(match[1], unquoteYamlScalar(match[2]));
  }
  return {
    appId: values.get('appId') || '',
    productName: values.get('productName') || '',
  };
}

export function expectedWindowsArtifactName(productName, version) {
  return `${productName}-${version}-windows-x64-setup.exe`;
}

export function createNsisInstallArguments(installDirectory) {
  const target = String(installDirectory || '');
  if (!path.win32.isAbsolute(target)) {
    throw new Error('NSIS install smoke 目录必须是绝对 Windows 路径。');
  }
  if (/[\r\n\0]/.test(target)) {
    throw new Error('NSIS install smoke 目录包含非法字符。');
  }
  return ['/currentuser', '/S', `/D=${target}`];
}

function normalizeResourcePath(value) {
  return path.posix.normalize(String(value).replaceAll('\\', '/'));
}

function normalizeWindowsVersion(value) {
  const parts = String(value || '')
    .trim()
    .split('.')
    .map((part) => String(Number(part)));
  if (parts.some((part) => part === 'NaN')) return '';
  while (parts.length > 3 && parts.at(-1) === '0') parts.pop();
  return parts.join('.');
}

function unquoteYamlScalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
