import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { PreviewServer } from './previewServer.js';

const server = new PreviewServer();
const roots: string[] = [];
afterEach(async () => {
  await server.stopAll();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it('serves current source media without a game build or index and keeps other files private', async () => {
  const root = await mkdtemp(join(tmpdir(), 'noobi-asset-preview-'));
  roots.push(root);
  await mkdir(join(root, 'public/assets/images'), { recursive: true });
  await writeFile(join(root, 'public/assets/images/风.png'), 'fresh image');
  await writeFile(join(root, 'public/assets/private.json'), '{"private":true}');
  await writeFile(join(root, 'secret.png'), 'private image');
  await symlink(join(root, 'secret.png'), join(root, 'public/assets/images/link.png'));
  const url = await server.start('asset-project', root, { assetsOnly: true });
  const response = await fetch(`${url}assets/images/${encodeURIComponent('风.png')}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(await response.text()).toBe('fresh image');
  for (const path of ['index.html', 'secret.png', 'assets/private.json', 'assets/images/link.png']) {
    expect((await fetch(url + path)).status).toBe(404);
  }
  await writeFile(join(root, 'public/assets/images/风.png'), 'updated image');
  expect(await (await fetch(`${url}assets/images/${encodeURIComponent('风.png')}`)).text()).toBe('updated image');
});
