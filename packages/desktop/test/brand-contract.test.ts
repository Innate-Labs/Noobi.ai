import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  build: {
    productName: string;
    dmg: { artifactName: string };
    nsis: { artifactName: string; shortcutName: string };
  };
};
const mainSource = readFileSync(
  new URL('../src/main/main.ts', import.meta.url),
  'utf8',
);
const rendererHtml = readFileSync(
  new URL('../index.html', import.meta.url),
  'utf8',
);
const rendererApp = readFileSync(
  new URL('../src/renderer/App.tsx', import.meta.url),
  'utf8',
);
const projectRail = readFileSync(
  new URL('../src/renderer/components/ProjectRail.tsx', import.meta.url),
  'utf8',
);
const readme = readFileSync(
  new URL('../../../README.md', import.meta.url),
  'utf8',
);
const desktopGuide = readFileSync(
  new URL('../../../docs/gameagent/DESKTOP_GUIDE.md', import.meta.url),
  'utf8',
);
const windowsQuickstart = readFileSync(
  new URL('../../../specs/001-windows-client/quickstart.md', import.meta.url),
  'utf8',
);

describe('Noobi.ai 品牌命名', () => {
  it('在 macOS Bundle 与 DMG 中使用精确的产品名称', () => {
    expect(manifest.build.productName).toBe('Noobi.ai');
    expect(manifest.build.dmg.artifactName).toBe(
      'Noobi.ai-${version}-${arch}.${ext}',
    );
  });

  it('在 Windows 安装包与系统快捷方式中使用精确的产品名称', () => {
    expect(manifest.build.nsis.artifactName).toBe(
      'Noobi.ai-${version}-windows-${arch}-setup.${ext}',
    );
    expect(manifest.build.nsis.shortcutName).toBe('Noobi.ai');
  });

  it('在主进程与界面中使用 Noobi.ai', () => {
    expect(mainSource).toContain("const productName = 'Noobi.ai';");
    expect(rendererHtml).toContain('<title>Noobi.ai</title>');
    expect(rendererApp).toContain('<strong>Noobi.ai</strong>');
    expect(projectRail).toContain('<strong>Noobi.ai</strong>');
  });

  it('Windows 用户文档使用 Noobi.ai 且不展示旧产品品牌', () => {
    for (const document of [readme, desktopGuide, windowsQuickstart]) {
      expect(document).toContain('Noobi.ai');
    }
    expect(desktopGuide).not.toMatch(/\b(?:OpenGame|GameAgent)\b/);
  });
});
