import { describe, expect, it } from 'vitest';
import {
  PE_MACHINE,
  REQUIRED_WINDOWS_RESOURCES,
  assertAmd64PortableExecutable,
  assertAuthenticodeStatus,
  assertBuilderIdentity,
  assertRuntimeManifest,
  assertWindowsVersionInfo,
  createNsisInstallArguments,
  expectedWindowsArtifactName,
  inspectPortableExecutable,
  missingRequiredResources,
} from './windows-installer-verifier.mjs';

describe('Windows 安装包验证 helper', () => {
  it('解析 PE header 并要求 x64 payload', () => {
    const x64 = createPe(PE_MACHINE.AMD64);
    expect(inspectPortableExecutable(x64).machineName).toBe('amd64');
    expect(assertAmd64PortableExecutable(x64).machine).toBe(PE_MACHINE.AMD64);
    expect(() =>
      assertAmd64PortableExecutable(createPe(PE_MACHINE.I386), 'Noobi.ai.exe'),
    ).toThrow(/不是 Windows x64 PE/);
  });

  it('拒绝损坏或越界的 PE header', () => {
    expect(() => inspectPortableExecutable(Buffer.alloc(64))).toThrow(/MZ/);
    const invalidOffset = Buffer.alloc(64);
    invalidOffset.write('MZ');
    invalidOffset.writeUInt32LE(0xffff, 0x3c);
    expect(() => inspectPortableExecutable(invalidOffset)).toThrow(/offset/);
  });

  it('要求 manifest 保留 Windows x64 原生 staging 证据', () => {
    const manifest = validRuntimeManifest();
    expect(assertRuntimeManifest(manifest)).toBe(manifest);
    expect(() =>
      assertRuntimeManifest({ ...manifest, platform: 'darwin' }),
    ).toThrow(/win32\/x64/);
    expect(() =>
      assertRuntimeManifest({ ...manifest, nativeStaging: false }),
    ).toThrow(/原生 staging/);
  });

  it('列出缺失的发行资源并兼容 Windows 路径分隔符', () => {
    const available = REQUIRED_WINDOWS_RESOURCES.map((entry) =>
      entry.replaceAll('/', '\\'),
    );
    expect(missingRequiredResources(available)).toEqual([]);
    expect(missingRequiredResources(available.slice(1))).toEqual(['app.asar']);
  });

  it('区分 unsigned-dev 与强制 signed release', () => {
    expect(assertAuthenticodeStatus('NotSigned', false)).toBe('unsigned-dev');
    expect(assertAuthenticodeStatus('Valid', false)).toBe('signed');
    expect(
      assertAuthenticodeStatus(
        'Valid',
        true,
        'CN=Innate Labs, O=Innate Labs',
        'Innate Labs',
      ),
    ).toBe('signed');
    expect(() =>
      assertAuthenticodeStatus(
        'Valid',
        true,
        'CN=Unexpected Publisher',
        'Innate Labs',
      ),
    ).toThrow(/发布者不匹配/);
    expect(() => assertAuthenticodeStatus('NotSigned', true)).toThrow(
      /要求有效 Authenticode/,
    );
    expect(() => assertAuthenticodeStatus('HashMismatch', false)).toThrow(
      /状态异常/,
    );
  });

  it('验证产品版本资源与 electron-builder 身份', () => {
    expect(
      assertWindowsVersionInfo(
        { ProductName: 'Noobi.ai', ProductVersion: '0.2.2.0' },
        { productName: 'Noobi.ai', version: '0.2.2' },
      ),
    ).toBeTruthy();
    expect(() =>
      assertWindowsVersionInfo(
        { ProductName: 'Noobi', ProductVersion: '0.2.2' },
        { productName: 'Noobi.ai', version: '0.2.2' },
      ),
    ).toThrow(/ProductName/);
    expect(
      assertBuilderIdentity(
        'appId: com.gameagent.desktop\nproductName: Noobi.ai\n',
        { appId: 'com.gameagent.desktop', productName: 'Noobi.ai' },
      ).appId,
    ).toBe('com.gameagent.desktop');
    expect(
      assertBuilderIdentity(
        { appId: 'com.gameagent.desktop', productName: 'Noobi.ai' },
        { appId: 'com.gameagent.desktop', productName: 'Noobi.ai' },
      ).productName,
    ).toBe('Noobi.ai');
  });

  it('生成稳定的 Windows x64 setup 文件名', () => {
    expect(expectedWindowsArtifactName('Noobi.ai', '0.2.2')).toBe(
      'Noobi.ai-0.2.2-windows-x64-setup.exe',
    );
  });

  it('生成 current-user silent NSIS 参数并保证 /D 位于最后', () => {
    const args = createNsisInstallArguments(
      'C:\\Users\\Test User\\AppData\\Local\\Temp\\Noobi install',
    );
    expect(args).toEqual([
      '/currentuser',
      '/S',
      '/D=C:\\Users\\Test User\\AppData\\Local\\Temp\\Noobi install',
    ]);
    expect(args.at(-1)).toMatch(/^\/D=/);
    expect(() => createNsisInstallArguments('relative\\Noobi')).toThrow(
      /绝对 Windows 路径/,
    );
  });
});

function createPe(machine: number) {
  const buffer = Buffer.alloc(0x100);
  buffer.write('MZ', 0, 'ascii');
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.write('PE\0\0', 0x80, 'binary');
  buffer.writeUInt16LE(machine, 0x84);
  return buffer;
}

function validRuntimeManifest() {
  return {
    schemaVersion: 1,
    platform: 'win32',
    arch: 'x64',
    hostPlatform: 'win32',
    hostArch: 'x64',
    nativeStaging: true,
    externalPackages: ['sharp'],
    copiedPackages: [{ name: 'sharp' }],
    skippedPackages: [],
    sizeBytes: 42,
  };
}
