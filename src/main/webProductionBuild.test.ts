import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyWebProductionBuild } from './webProductionBuild.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('verifyWebProductionBuild', () => {
  it('accepts a complete, current production build with local or embedded resources', async () => {
    const root = await fixture();
    await writeFile(join(root, 'dist/index.html'), [
      '<!doctype html>',
      '<link rel="stylesheet" href="/assets/app.css">',
      '<script type="module" src="./assets/app.js?hash=1"></script>',
      '<img src="data:image/png;base64,cG5n">',
    ].join('\n'));
    await writeFile(join(root, 'dist/assets/app.css'), 'body { color: white; }');
    await writeFile(join(root, 'dist/assets/app.js'), 'globalThis.ready = true;');
    await writeFile(join(root, 'dist/assets/card.png'), 'png');
    await writeFile(join(root, 'src/main.ts'), 'export const value = 1;');
    await setAllTimes(root, {
      'src/main.ts': 10_000,
      'dist/index.html': 20_000,
      'dist/assets/app.css': 20_000,
      'dist/assets/app.js': 20_000,
      'dist/assets/card.png': 20_000,
    });

    await expect(verifyWebProductionBuild(root)).resolves.toMatchObject({
      ok: true,
      stale: false,
      reason: 'ready',
      inputsChecked: 1,
      productionFilesChecked: 4,
      latestInputPath: 'src/main.ts',
      buildIdentity: expect.stringMatching(/^sha256:[a-f\d]{64}$/u),
      buildMarkerMtimeMs: 20_000,
    });
  });

  it('distinguishes a missing, empty, and index-less production build', async () => {
    const missing = await temporaryRoot('noobi-web-missing-');
    await expect(verifyWebProductionBuild(missing)).resolves.toMatchObject({
      ok: false,
      stale: false,
      reason: 'missing-dist',
    });

    const empty = await temporaryRoot('noobi-web-empty-');
    await mkdir(join(empty, 'dist'));
    await expect(verifyWebProductionBuild(empty)).resolves.toMatchObject({ reason: 'empty-dist' });

    const indexless = await temporaryRoot('noobi-web-indexless-');
    await mkdir(join(indexless, 'dist'));
    await writeFile(join(indexless, 'dist/app.js'), 'app');
    await expect(verifyWebProductionBuild(indexless)).resolves.toMatchObject({ reason: 'missing-index' });
  });

  it('rejects empty HTML and missing local JS, CSS, or asset references', async () => {
    const empty = await fixture();
    await writeFile(join(empty, 'dist/index.html'), '  \n');
    await expect(verifyWebProductionBuild(empty)).resolves.toMatchObject({ reason: 'empty-index' });

    const missing = await fixture();
    await writeFile(
      join(missing, 'dist/index.html'),
      '<link rel="stylesheet" href="assets/app.css"><script src="assets/app.js"></script>',
    );
    await writeFile(join(missing, 'dist/assets/app.css'), 'body{}');
    await expect(verifyWebProductionBuild(missing)).resolves.toMatchObject({
      ok: false,
      reason: 'missing-output',
      detail: expect.stringContaining('assets/app.js'),
    });
  });

  it('ignores resource-like markup in comments, script text, and custom attributes', async () => {
    const root = await fixture();
    await writeFile(join(root, 'dist/index.html'), [
      '<!doctype html>',
      '<!-- <script src="/old-game.js"></script> -->',
      '<!-- <script src="https://example.invalid/old.js"></script> -->',
      '<script>const example = \'<img src="/unused.png">\';</script>',
      '<img data-src="/not-loaded.png" alt="Example">',
      '<script src="/assets/app.js"></script>',
    ].join('\n'));
    await writeFile(join(root, 'dist/assets/app.js'), 'globalThis.ready = true;');

    await expect(verifyWebProductionBuild(root)).resolves.toMatchObject({ ok: true, reason: 'ready' });
  });

  it('decodes actual HTML attribute values and handles quoted tag delimiters', async () => {
    const root = await fixture();
    await writeFile(join(root, 'dist/index.html'), [
      '<!doctype html>',
      '<script data-label="a > b" src="/assets/app&#46;js"></script>',
    ].join('\n'));
    await writeFile(join(root, 'dist/assets/app.js'), 'globalThis.ready = true;');
    await expect(verifyWebProductionBuild(root)).resolves.toMatchObject({ ok: true, reason: 'ready' });

    await rm(join(root, 'dist/assets/app.js'));
    await expect(verifyWebProductionBuild(root)).resolves.toMatchObject({
      ok: false, reason: 'missing-output', detail: expect.stringContaining('/assets/app.js'),
    });
  });

  it('marks dist stale only outside the filesystem timestamp tolerance', async () => {
    const stale = await fixture();
    await writeFile(join(stale, 'dist/index.html'), '<main>game</main>');
    await writeFile(join(stale, 'src/game.ts'), 'new source');
    await setAllTimes(stale, {
      'dist/index.html': 10_000,
      'src/game.ts': 12_001,
    });
    await expect(verifyWebProductionBuild(stale)).resolves.toMatchObject({
      ok: false,
      stale: true,
      reason: 'stale-dist',
      latestInputPath: 'src/game.ts',
      buildMarkerPath: 'dist/index.html',
    });

    const tolerated = await fixture();
    await writeFile(join(tolerated, 'dist/index.html'), '<main>game</main>');
    await writeFile(join(tolerated, 'src/game.ts'), 'new source');
    await setAllTimes(tolerated, {
      'dist/index.html': 10_000,
      'src/game.ts': 12_000,
    });
    await expect(verifyWebProductionBuild(tolerated)).resolves.toMatchObject({
      ok: true,
      stale: false,
      reason: 'ready',
    });
  });

  it('does not let a new unrelated dist file hide an old referenced bundle', async () => {
    const root = await fixture();
    await writeFile(join(root, 'dist/index.html'), '<script src="assets/app.js"></script>');
    await writeFile(join(root, 'dist/assets/app.js'), 'old bundle');
    await writeFile(join(root, 'dist/debug.log'), 'unrelated');
    await writeFile(join(root, 'game.js'), 'new source');
    await setAllTimes(root, {
      'dist/index.html': 10_000,
      'dist/assets/app.js': 10_000,
      'game.js': 20_000,
      'dist/debug.log': 30_000,
    });

    await expect(verifyWebProductionBuild(root)).resolves.toMatchObject({
      ok: false,
      stale: true,
      reason: 'stale-dist',
      latestInputPath: 'game.js',
      buildMarkerPath: 'dist/index.html',
    });
  });

  it('treats root Web files and custom scripts directories as build inputs', async () => {
    const root = await fixture();
    await writeFile(join(root, 'dist/index.html'), '<main>game</main>');
    await mkdir(join(root, 'custom/scripts'), { recursive: true });
    await writeFile(join(root, 'styles.css'), 'body { color: red; }');
    await writeFile(join(root, 'custom/scripts/runtime.js'), 'new runtime');
    await setAllTimes(root, {
      'dist/index.html': 10_000,
      'styles.css': 11_000,
      'custom/scripts/runtime.js': 20_000,
    });

    await expect(verifyWebProductionBuild(root)).resolves.toMatchObject({
      ok: false,
      stale: true,
      latestInputPath: 'custom/scripts/runtime.js',
    });
  });

  it('supports cancellation and enforces bounded traversal', async () => {
    const aborted = new AbortController();
    aborted.abort(new Error('stop requested'));
    await expect(verifyWebProductionBuild(await fixture(), { signal: aborted.signal }))
      .rejects.toThrow('stop requested');

    const tooDeep = await fixture();
    await writeFile(join(tooDeep, 'dist/index.html'), '<main>game</main>');
    await mkdir(join(tooDeep, 'src/one/two'), { recursive: true });
    await writeFile(join(tooDeep, 'src/one/two/game.js'), 'game');
    await expect(verifyWebProductionBuild(tooDeep, { limits: { maxDepth: 2 } }))
      .resolves.toMatchObject({ ok: false, reason: 'limit-exceeded' });

    const tooMany = await fixture();
    await writeFile(join(tooMany, 'dist/index.html'), '<main>game</main>');
    await writeFile(join(tooMany, 'a.js'), 'a');
    await writeFile(join(tooMany, 'b.js'), 'b');
    await expect(verifyWebProductionBuild(tooMany, { limits: { maxFiles: 2 } }))
      .resolves.toMatchObject({ ok: false, reason: 'limit-exceeded' });

    const tooLarge = await fixture();
    await writeFile(join(tooLarge, 'dist/index.html'), '<main>game</main>');
    await expect(verifyWebProductionBuild(tooLarge, { limits: { maxTotalBytes: 4 } }))
      .resolves.toMatchObject({ ok: false, reason: 'limit-exceeded' });
  });

  it('rejects remote production dependencies that the isolated preview cannot load', async () => {
    const root = await fixture();
    await writeFile(
      join(root, 'dist/index.html'),
      '<script src="https://cdn.example.invalid/game.js"></script>',
    );
    await expect(verifyWebProductionBuild(root)).resolves.toMatchObject({
      ok: false,
      reason: 'unsafe-reference',
    });
  });

  it('checks all configured input roots while excluding generated and private directories', async () => {
    const root = await fixture();
    await writeFile(join(root, 'dist/index.html'), '<main>game</main>');
    await Promise.all([
      writeFile(join(root, 'index.html'), '<main>source</main>'),
      writeFile(join(root, 'package.json'), '{}'),
      writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9'),
      writeFile(join(root, 'vite.config.ts'), 'export default {}'),
      writeFile(join(root, 'tsconfig.app.json'), '{}'),
      writeFile(join(root, 'public/logo.png'), 'logo'),
    ]);
    await mkdir(join(root, 'src/artifacts'), { recursive: true });
    await mkdir(join(root, 'src/node_modules/pkg'), { recursive: true });
    await writeFile(join(root, 'src/artifacts/new.txt'), 'ignored');
    await writeFile(join(root, 'src/node_modules/pkg/new.js'), 'ignored');
    await symlink(join(root, 'outside-generated'), join(root, 'src/.noobi'));
    const inputNames = [
      'index.html',
      'package.json',
      'pnpm-lock.yaml',
      'vite.config.ts',
      'tsconfig.app.json',
      'public/logo.png',
    ];
    await setAllTimes(root, Object.fromEntries([
      ['dist/index.html', 20_000],
      ...inputNames.map((name) => [name, 10_000]),
      ['src/artifacts/new.txt', 40_000],
      ['src/node_modules/pkg/new.js', 40_000],
    ]));

    await expect(verifyWebProductionBuild(root)).resolves.toMatchObject({
      ok: true,
      inputsChecked: inputNames.length,
    });
  });

  it('rejects symlinks in dist and relevant source trees without following them', async () => {
    const outputLink = await fixture();
    await writeFile(join(outputLink, 'dist/index.html'), '<script src="assets/app.js"></script>');
    await writeFile(join(outputLink, 'outside.js'), 'outside');
    await symlink(join(outputLink, 'outside.js'), join(outputLink, 'dist/assets/app.js'));
    await expect(verifyWebProductionBuild(outputLink)).resolves.toMatchObject({
      ok: false,
      reason: 'unsafe-symlink',
    });

    const sourceLink = await fixture();
    await writeFile(join(sourceLink, 'dist/index.html'), '<main>game</main>');
    await writeFile(join(sourceLink, 'outside.ts'), 'outside');
    await symlink(join(sourceLink, 'outside.ts'), join(sourceLink, 'src/linked.ts'));
    await expect(verifyWebProductionBuild(sourceLink)).resolves.toMatchObject({
      ok: false,
      reason: 'unsafe-symlink',
    });

    const realRoot = await fixture();
    await writeFile(join(realRoot, 'dist/index.html'), '<main>game</main>');
    const linkedRoot = join(realRoot, '..', `${realRoot.split('/').at(-1)}-link`);
    roots.push(linkedRoot);
    await symlink(realRoot, linkedRoot);
    await expect(verifyWebProductionBuild(linkedRoot)).resolves.toMatchObject({
      ok: false,
      reason: 'unsafe-symlink',
    });
  });

  it('rejects references that escape dist even when the target exists', async () => {
    const root = await fixture();
    await writeFile(join(root, 'dist/index.html'), '<script src="../secret.js"></script>');
    await writeFile(join(root, 'secret.js'), 'secret');

    await expect(verifyWebProductionBuild(root)).resolves.toMatchObject({
      ok: false,
      reason: 'unsafe-reference',
    });
  });
});

async function fixture(): Promise<string> {
  const root = await temporaryRoot('noobi-web-build-');
  await mkdir(join(root, 'dist/assets'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'public'), { recursive: true });
  return root;
}

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function setAllTimes(root: string, times: Record<string, number>): Promise<void> {
  await Promise.all(Object.entries(times).map(([relativePath, milliseconds]) => {
    const date = new Date(milliseconds);
    return utimes(join(root, relativePath), date, date);
  }));
}
