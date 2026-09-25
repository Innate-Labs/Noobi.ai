// Isolated production stores + real Electron renderer/IPC/preview. No model calls.
import { app, BrowserWindow, ipcMain } from 'electron';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { ProjectStore } from '../dist/main/projectStore.js';
import { PlanStore } from '../dist/main/planStore.js';
import { AssetPlanStore } from '../dist/main/assetPlanStore.js';
import { ImageGenerationAttestationStore } from '../dist/main/imageGenerationAttestation.js';
import { GameVersionStore } from '../dist/main/production/gameVersionStore.js';
import { GameVersionRestorer } from '../dist/main/production/gameVersionRestorer.js';
import { PreviewServer } from '../dist/main/previewServer.js';
const root = mkdtempSync(join(tmpdir(), 'noobi-versions-ui-')); app.setPath('userData', join(root, 'electron'));
app.on('window-all-closed', () => {});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(run).catch(error => { console.error(error); app.exit(1); });
async function run() {
  let window; const previews = new PreviewServer();
  try {
    const evidence = resolve('.noobi-private/platform-versions'); await mkdir(evidence, { recursive: true });
    const projects = new ProjectStore(join(root, 'projects.json'), join(root, 'games')); await projects.init();
    let project = await projects.create({ name: '版本恢复验收样例', idea: 'Explore and collect', parentDirectory: join(root, 'games'), engine: 'web' });
    project = await projects.update(project.id, { status: 'stopped' });
    const plans = new PlanStore(join(root, 'plans.json')); await plans.init();
    const version = { id: 'version-a', number: 1, createdAt: new Date().toISOString(), requirements: [{ id: 'R1', text: 'Explore' }],
      options: [{ id: 'a', title: '探索方案 A', approach: 'Explore', engine: 'web', dimension: '2d', platform: 'web', coreLoop: ['explore'], features: ['collect'], assumptions: [], exclusions: [], requirementIds: ['R1'], estimate: { timeRange: null, costRange: null, basis: 'unknown' } }],
      model: 'fixture', threadId: 'fixture', turnId: 'fixture', analysisDurationMs: 0, analysisUsage: null };
    const draft = await plans.create({ request: project.idea, projectId: project.id }); await plans.finish(draft.id, draft.attemptId, version, null);
    await plans.reserve({ draftId: draft.id, versionId: version.id, optionId: 'a' }); await plans.markRun(draft.id, 'dispatched');
    const assets = new AssetPlanStore(join(root, 'assets.json')); await assets.init();
    const attestations = new ImageGenerationAttestationStore(join(root, 'attestations.json')); await attestations.init();
    const versions = new GameVersionStore(join(root, 'versions')); const restorer = new GameVersionRestorer(versions, projects, plans, assets, attestations);
    await mkdir(join(project.root, 'dist'), { recursive: true });
    await writeFile(join(project.root, 'dist/index.html'), '<meta charset="utf-8"><body style="background:#1e2b25;color:#fff;font:20px sans-serif;padding:24px"><h1>版本 A · 可交互验收样例</h1><p>此页面是隔离测试数据。</p><button onclick="this.textContent=\'交互成功\'">测试操作</button></body>');
    await writeFile(join(project.root, 'src/version.js'), 'version A');
    const passed = await versions.capture({ metadata: await restorer.metadata(project), kind: 'passed', title: '探索版本 A', summary: '交互及交付流程测试样例', sourceRoot: project.root, previewDirectory: 'dist' });
    await writeFile(join(project.root, 'src/version.js'), 'broken version B'); await writeFile(join(project.root, 'new-upload.txt'), 'new reference stays here');
    await versions.capture({ metadata: await restorer.metadata(project), kind: 'failed', title: '版本 B · 制作失败', error: '编译错误，保留版本 A 供试玩' });
    let restoreRequests = 0;
    ipcMain.handle('noobi:versions:list', (_e,id) => versions.list(id));
    ipcMain.handle('noobi:versions:preview', async (_e,id,versionId) => { const record = await versions.read(id,versionId); const source = await versions.verify(record); return previews.start(id,source,{ directory: record.previewDirectory, sourceFallback:false, sourceAssetOverlay:false }); });
    ipcMain.handle('noobi:versions:restore', async (_e,input) => { restoreRequests++; await pause(100); return restorer.restore(input); });
    ipcMain.handle('noobi:versions:backup', async (_e,id) => versions.capture({ metadata: await restorer.metadata(await projects.get(id)), kind:'backup', title:'Manual backup', sourceRoot:project.root }));
    await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{GameVersionsPanel}from'./src/renderer/components/GameVersionsPanel';import'./src/renderer/styles.css';createRoot(document.getElementById('root')).render(<GameVersionsPanel project={${JSON.stringify(project)}} refreshSignal={0} onRestored={project=>{window.__restored=project}}/>);`, loader:'tsx',resolveDir:process.cwd() },bundle:true,outfile:join(root,'ui.js'),loader:{'.woff2':'dataurl','.woff':'dataurl','.png':'dataurl'},define:{'process.env.NODE_ENV':'"production"'} });
    await writeFile(join(root,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="ui.css"><main id="root" style="max-width:900px;margin:30px auto"></main><script src="ui.js"></script>');
    window = new BrowserWindow({show:false,width:1100,height:900,webPreferences:{preload:resolve('dist/main/preload.cjs'),contextIsolation:true,nodeIntegration:false}});
    await window.loadFile(join(root,'index.html'));await pause(350);
    const js = text => window.webContents.executeJavaScript(text);
    const click = label => js(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='${label}').click()`);
    await js(`document.querySelector('.game-versions').open=true`);await pause(150);
    assert.match(await js('document.body.innerText'),/版本 B/);
    await click('试玩最后通过检查的版本');await pause(350);
    const frame = window.webContents.mainFrame.framesInSubtree.find(frame=>frame.url.startsWith('http://127.0.0.1:'));
    assert.ok(frame);await frame.executeJavaScript('document.querySelector("button").click()');assert.match(await frame.executeJavaScript('document.body.innerText'),/交互成功/);
    await js(`document.querySelector('.version-playback').scrollIntoView({block:'center',behavior:'instant'})`);await pause(150);
    await writeFile(join(evidence,'history-preview.png'),(await window.webContents.capturePage()).toPNG());
    await click('关闭历史试玩');
    await js(`Array.from(document.querySelectorAll('li')).find(li=>li.textContent.includes('探索版本 A')).querySelector('button:last-child').click()`);
    await click('取消');assert.equal(await projects.list().then(p=>p.length),1);
    await js(`Array.from(document.querySelectorAll('li')).find(li=>li.textContent.includes('探索版本 A')).querySelector('button:last-child').click()`);await pause(100);
    await js(`document.querySelector('.version-confirm').scrollIntoView({block:'center',behavior:'instant'})`);await pause(150);
    await writeFile(join(evidence,'restore-confirmation.png'),(await window.webContents.capturePage()).toPNG());
    await js(`const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='保存备份并创建恢复副本');b.click();b.click();b.click()`);
    let restored;
    for(let attempt=0;attempt<50;attempt++){restored=await js('window.__restored');if(restored)break;await pause(100)}
    assert.ok(restored);assert.equal(restoreRequests,1);assert.equal(restored.status,'stopped');
    assert.equal(await readFile(join(restored.root,'src/version.js'),'utf8'),'version A');
    assert.equal(await readFile(join(project.root,'src/version.js'),'utf8'),'broken version B');
    assert.equal(await readFile(join(project.root,'new-upload.txt'),'utf8'),'new reference stays here');
    assert.equal((await versions.list(project.id)).filter(v=>v.title==='恢复前备份').length,1);
    window.setSize(390,740);await pause(150);assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true);
    await writeFile(join(evidence,'versions-narrow.png'),(await window.webContents.capturePage()).toPNG());
    await writeFile(join(evidence,'ui-result.json'),JSON.stringify({passed:true,realStoresAndIpc:true,interactiveHistoricalPreview:true,tripleClickSingleRestore:true,originalAndUploadsPreserved:true,restoredCopyStopped:true,modelCalls:0,userGameWrites:0},null,2));
    console.log('GAME_VERSIONS_UI_OK');
  } catch(error) {console.error(error);process.exitCode=1;}
  finally {await previews.stopAll();if(window&&!window.isDestroyed()){window.webContents.session.flushStorageData();await window.webContents.session.closeAllConnections();window.destroy()}await pause(300);await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:150});app.exit(process.exitCode||0)}
}
