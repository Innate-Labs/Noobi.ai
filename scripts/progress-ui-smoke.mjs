// Real renderer/preload/IPC with an isolated durable store; no model or user game is invoked.
import { app, BrowserWindow, ipcMain } from 'electron';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { ProductionRunStore } from '../dist/main/production/productionRunStore.js';
const root = mkdtempSync(join(tmpdir(), 'noobi-progress-ui-'));
app.setPath('userData', join(root, 'electron'));
app.on('window-all-closed', () => {});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(run).catch(error => { console.error(error); app.exit(1); });
async function run() {
  let window;
  try {
    const evidence = resolve('.noobi-private/platform-progress'); await mkdir(evidence, { recursive: true });
    const file = join(root, 'progress.json'); let store = new ProductionRunStore(file); await store.init();
    const input = { projectId: 'fixture', planRunId: 'selected', planVersionId: 'version', planTitle: '探索玩法 · 完成实现后检查碰撞和存档',
      contractKey: 'fixed', continuation: false, coreLoop: false, visualSample: false, requirementIds: ['R01', 'R02'] };
    const evidenceReceipt = { sourceHash: 'a'.repeat(64), assetsHash: 'b'.repeat(64), assets: [] };
    const first = await store.begin(input);
    const turn = { threadId: 'thread', turnId: 'turn', status: 'completed', text: 'Fixture output' };
    await store.update(first.session, { id: 'planner', status: 'completed', turn, sourceHash: evidenceReceipt.sourceHash, evidence: evidenceReceipt });
    await store.update(first.session, { id: 'implementer', status: 'completed', turn, sourceHash: evidenceReceipt.sourceHash, evidence: evidenceReceipt });
    await store.update(first.session, { id: 'reviewer', evidence: evidenceReceipt, status: 'running' });
    store = new ProductionRunStore(file); await store.init();
    const interrupted = await store.read('fixture');
    ipcMain.handle('noobi:project:progress', (_event, projectId) => store.read(projectId));
    await build({ stdin: { contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {ProductionProgressPanel} from './src/renderer/components/ProductionProgressPanel';
      import './src/renderer/styles.css';
      createRoot(document.getElementById('root')).render(<ProductionProgressPanel projectId="fixture" planRunId="selected" projectStatus="stopped"/>);
    `, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: join(root, 'ui.js'),
      loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
    await writeFile(join(root, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="ui.css"><main id="root" style="max-width:760px;margin:40px auto"></main><script src="ui.js"></script>');
    window = new BrowserWindow({ show: false, width: 960, height: 600, webPreferences: {
      preload: resolve('dist/main/preload.cjs'), contextIsolation: true, nodeIntegration: false,
    } });
    await window.loadFile(join(root, 'index.html')); await pause(400);
    const text = () => window.webContents.executeJavaScript('document.body.innerText');
    assert.match(await text(), /已中断/); assert.match(await text(), /应用退出中断/);
    await writeFile(join(evidence, 'interrupted-progress.png'), (await window.webContents.capturePage()).toPNG());
    const resumed = await store.begin({ ...input, continuation: true });
    await store.update(resumed.session, { id: 'planner', status: 'completed', reused: true, turn, sourceHash: evidenceReceipt.sourceHash, evidence: evidenceReceipt });
    await store.update(resumed.session, { id: 'implementer', status: 'completed', reused: true, turn, sourceHash: evidenceReceipt.sourceHash, evidence: evidenceReceipt });
    const progress = await store.update(resumed.session, { id: 'reviewer', evidence: evidenceReceipt, status: 'running', detail: '重新检查当前版本的碰撞与存档' });
    window.webContents.send('noobi:event:production-progress', progress); await pause(100);
    assert.match(await text(), /第 2 次执行/); assert.match(await text(), /已复用/); assert.match(await text(), /当前：独立评审/);
    // Late snapshots and events belonging to another project must not replace current progress.
    window.webContents.send('noobi:event:production-progress', interrupted);
    window.webContents.send('noobi:event:production-progress', { ...progress, projectId: 'unrelated', planTitle: 'WRONG PROJECT', revision: 9999 });
    await pause(100); assert.match(await text(), /第 2 次执行/); assert.doesNotMatch(await text(), /WRONG PROJECT/);
    await window.webContents.executeJavaScript(`document.querySelector('.production-executions').open=true;document.querySelector('.production-executions li details').open=true;(()=>{const body=document.querySelector('.production-progress-body');body.scrollTop+=document.querySelector('.production-executions').getBoundingClientRect().top-body.getBoundingClientRect().top;window.scrollTo(0,0)})()`);
    await pause(200);
    assert.match(await text(), /输出版本/); assert.match(await window.webContents.executeJavaScript('document.body.textContent'), /对应需求：R01、R02/);
    await writeFile(join(evidence, 'resumed-progress.png'), (await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`document.querySelector('.production-attempt-history').open=true;document.querySelector('.production-attempt-history details').open=true`);
    assert.match(await text(), /应用退出中断/);
    window.setSize(390, 650); await pause(200);
    await window.webContents.executeJavaScript('window.scrollTo(0,0)'); await pause(100);
    assert.equal(await window.webContents.executeJavaScript('document.documentElement.scrollWidth <= innerWidth'), true);
    await writeFile(join(evidence, 'progress-narrow.png'), (await window.webContents.capturePage()).toPNG());
    // Reload the renderer and prove it reads the current persisted record via IPC.
    await window.reload(); await pause(400); assert.match(await text(), /第 2 次执行/);
    await writeFile(join(evidence, 'ui-result.json'), JSON.stringify({ passed: true, realRendererAndIpc: true,
      persistedRestart: true, restoredHistory: true, lateEventsRejected: true, narrowLayout: true,
      modelCalls: 0, userGameWrites: 0 }, null, 2));
    console.log('PRODUCTION_PROGRESS_UI_OK');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally {
    if (window && !window.isDestroyed()) { window.webContents.session.flushStorageData(); await window.webContents.session.closeAllConnections(); window.destroy(); }
    await pause(300); await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); app.exit(process.exitCode || 0);
  }
}
