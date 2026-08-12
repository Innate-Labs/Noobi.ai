import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  resolveNpmInvocation,
  resolvePackageScript,
} from '../scripts/package-current-platform.mjs';

const desktopManifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const rootManifest = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
);
const iconBuildScript = readFileSync(
  new URL('../scripts/build-icon.mjs', import.meta.url),
  'utf8',
);

describe('Windows x64 package contract', () => {
  it('保留产品身份并只配置 NSIS x64 目标', () => {
    expect(desktopManifest.build.productName).toBe('Noobi.ai');
    expect(desktopManifest.build.appId).toBe('com.gameagent.desktop');
    expect(desktopManifest.build.win).toMatchObject({
      icon: 'build/icon.png',
      requestedExecutionLevel: 'asInvoker',
      target: [{ target: 'nsis', arch: ['x64'] }],
    });
    expect(desktopManifest.scripts['build:icon']).toContain('build-icon.mjs');
    expect(iconBuildScript).toContain("'icon.png'");
    expect(iconBuildScript).toContain('1024');
    expect(JSON.stringify(desktopManifest.build.win)).not.toContain('portable');
  });

  it('使用 assisted current-user 安装并保留用户数据', () => {
    expect(desktopManifest.build.nsis).toMatchObject({
      artifactName: 'Noobi.ai-${version}-windows-${arch}-setup.${ext}',
      oneClick: false,
      perMachine: false,
      selectPerMachineByDefault: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: 'always',
      createStartMenuShortcut: true,
      shortcutName: 'Noobi.ai',
      deleteAppDataOnUninstall: false,
      packElevateHelper: false,
    });
  });

  it('严格分离 unsigned-dev 与 forceCodeSigning 构建', () => {
    expect(desktopManifest.scripts['package:win']).toContain(
      '-c.win.signExecutable=false',
    );
    expect(desktopManifest.scripts['package:win']).not.toContain(
      'forceCodeSigning=true',
    );
    expect(desktopManifest.scripts['package:win:signed']).toContain(
      '-c.forceCodeSigning=true',
    );
    expect(desktopManifest.scripts['package:win:signed']).toContain(
      'verify:win-installer:signed',
    );
    expect(desktopManifest.scripts['verify:win-installer:signed']).toContain(
      '--require-signature',
    );
  });

  it('从根脚本暴露 Windows package 和 verifier', () => {
    expect(rootManifest.scripts['desktop:package:win']).toContain(
      'package:win',
    );
    expect(rootManifest.scripts['desktop:package:win:signed']).toContain(
      'package:win:signed',
    );
    expect(rootManifest.scripts['desktop:verify:win-installer']).toContain(
      'verify:win-installer',
    );
    expect(rootManifest.scripts['desktop:verify:win']).toContain(
      'verify:win-installer',
    );
    expect(rootManifest.overrides).not.toHaveProperty('ansi-regex');
  });

  it('默认 package 仅分发到受支持的原生宿主', () => {
    expect(desktopManifest.scripts.package).toBe(
      'node scripts/package-current-platform.mjs',
    );
    expect(resolvePackageScript('darwin', 'arm64')).toBe('package:mac');
    expect(resolvePackageScript('darwin', 'x64')).toBe('package:mac');
    expect(resolvePackageScript('win32', 'x64')).toBe('package:win');
    expect(() => resolvePackageScript('win32', 'arm64')).toThrow(/不支持/);
    expect(() => resolvePackageScript('linux', 'x64')).toThrow(/不支持/);
  });

  it('Windows 通过 Node 启动 npm JavaScript entry，不执行 cmd shim 或 shell', () => {
    expect(
      resolveNpmInvocation(
        'win32',
        'package:win',
        { npm_execpath: String.raw`C:\Program Files\nodejs\npm-cli.js` },
        String.raw`C:\Program Files\nodejs\node.exe`,
      ),
    ).toEqual({
      command: String.raw`C:\Program Files\nodejs\node.exe`,
      args: [
        String.raw`C:\Program Files\nodejs\npm-cli.js`,
        'run',
        'package:win',
      ],
    });
    expect(() =>
      resolveNpmInvocation(
        'win32',
        'package:win',
        { npm_execpath: 'npm.cmd' },
        'node.exe',
      ),
    ).toThrow(/拒绝通过 \.cmd/);
  });
});
