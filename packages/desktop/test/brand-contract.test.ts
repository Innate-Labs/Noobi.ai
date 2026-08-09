import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  build: {
    productName: string;
    dmg: { artifactName: string };
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

describe('Noobi.ai 品牌命名', () => {
  it('在 macOS Bundle 与 DMG 中使用精确的产品名称', () => {
    expect(manifest.build.productName).toBe('Noobi.ai');
    expect(manifest.build.dmg.artifactName).toBe(
      'Noobi.ai-${version}-${arch}.${ext}',
    );
  });

  it('在主进程与界面中使用 Noobi.ai', () => {
    expect(mainSource).toContain("const productName = 'Noobi.ai';");
    expect(rendererHtml).toContain('<title>Noobi.ai</title>');
    expect(rendererApp).toContain('<strong>Noobi.ai</strong>');
    expect(projectRail).toContain('<strong>Noobi.ai</strong>');
  });
});
