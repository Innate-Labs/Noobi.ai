import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import console from 'node:console';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '..');
const buildDir = path.join(desktopRoot, 'build');
// Keep icon.svg as the original fallback. The branded mascot is the current
// source for both packaged desktop icons and the in-app brand mark.
const source = path.join(buildDir, 'gameagent-platypus-dopey-v2.png');
const png = path.join(buildDir, 'icon.png');
const uiIcon = path.join(buildDir, 'gameagent-mascot-ui.png');
const rendererUiIcon = path.join(
  desktopRoot,
  'src',
  'renderer',
  'assets',
  'gameagent-mascot-ui.png',
);
const iconset = path.join(buildDir, 'icon.iconset');
const icns = path.join(buildDir, 'icon.icns');
const masterSize = 1024;
// The generated artwork is flattened onto white. Contract the mask by four
// pixels so the exported icon has clean green edges without a white matte.
const maskInset = 4;
const maskRadius = 216;

const roundedMask = Buffer.from(`
  <svg width="${masterSize}" height="${masterSize}" xmlns="http://www.w3.org/2000/svg">
    <rect
      x="${maskInset}"
      y="${maskInset}"
      width="${masterSize - maskInset * 2}"
      height="${masterSize - maskInset * 2}"
      rx="${maskRadius}"
      fill="white"
    />
  </svg>
`);

await mkdir(buildDir, { recursive: true });
const roundedIcon = await sharp(source)
  .resize(masterSize, masterSize)
  .composite([{ input: roundedMask, blend: 'dest-in' }])
  .png()
  .toBuffer();

await sharp(roundedIcon).toFile(png);
await Promise.all(
  [uiIcon, rendererUiIcon].map((target) =>
    sharp(roundedIcon)
      .resize(128, 128)
      .png({ compressionLevel: 9, palette: true })
      .toFile(target),
  ),
);

if (process.platform !== 'darwin') {
  console.log(`已生成桌面图标：${png}`);
  process.exit(0);
}

await rm(iconset, { recursive: true, force: true });
await mkdir(iconset, { recursive: true });

const variants = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

await Promise.all(
  variants.map(([name, size]) =>
    sharp(roundedIcon)
      .resize(Number(size), Number(size))
      .png()
      .toFile(path.join(iconset, String(name))),
  ),
);

await new Promise((resolve, reject) => {
  const child = spawn('iconutil', ['-c', 'icns', iconset, '-o', icns], {
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`iconutil 退出码：${code}`));
  });
});

await rm(iconset, { recursive: true, force: true });
console.log(`已生成桌面图标：${icns}`);
