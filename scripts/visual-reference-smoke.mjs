import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VisualReferenceStore } from '../dist/main/visualReferenceStore.js';
import { decodeVisualReference } from '../dist/main/visualReferenceDecoder.js';

// Run after build:main with Electron. Uses native codecs, not a mocked decoder.
app.on('window-all-closed', () => {});
async function main() {
await app.whenReady();
const root = await mkdtemp(join(tmpdir(), 'noobi-image-codecs-'));
let window;
let exitCode = 0;
try {
  window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false } });
  await window.loadURL('data:text/html,');
  const fixtures = await window.webContents.executeJavaScript(`(()=>{const c=document.createElement('canvas');c.width=96;c.height=64;const x=c.getContext('2d');x.fillStyle='#bc8fe5';x.fillRect(0,0,96,64);return ['image/png','image/jpeg','image/webp'].map(type=>({name:'fixture.'+type.split('/')[1],dataBase64:c.toDataURL(type).split(',')[1]}))})()`);
  window.destroy(); window = undefined;
  const store = new VisualReferenceStore(root, decodeVisualReference);
  for (const fixture of fixtures) {
    const [record] = await store.import([fixture]);
    assert.equal(record.width, 96); assert.equal(record.height, 64);
    assert.match(record.thumbnail, /^data:image\/png;base64,/);
    assert.equal((await store.get(record.id)).normalizedHash, record.normalizedHash);
    console.log('NATIVE_REFERENCE_FORMAT_PASS', fixture.name);
  }
  const broken = Buffer.from(fixtures[0].dataBase64, 'base64').subarray(0, 24);
  await assert.rejects(store.import([{ name: 'broken.png', dataBase64: broken.toString('base64') }]));
  assert.equal(BrowserWindow.getAllWindows().length, 0);
  console.log('NATIVE_REFERENCE_SMOKE_OK');
} catch (error) { console.error(error); exitCode = 1; }
finally { if (window && !window.isDestroyed()) window.destroy(); await rm(root, { recursive: true, force: true }); }
app.exit(exitCode);
}
void main();
