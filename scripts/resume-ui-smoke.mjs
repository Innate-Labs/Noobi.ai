// Isolated real Electron UI/IPC check. No model calls or user game files.
import { app, BrowserWindow, ipcMain } from 'electron';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { PlanStore } from '../dist/main/planStore.js';
import { PlanResumer } from '../dist/main/planResumer.js';

const root = mkdtempSync(join(tmpdir(), 'noobi-resume-ui-'));
const evidence = resolve('.noobi-private/platform-resume');
app.setPath('userData', join(root, 'electron'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let window;
app.on('window-all-closed', () => {});
app.whenReady().then(run).catch(error => { console.error(error); app.exit(1); });
async function run() {
try {
  await mkdir(evidence, { recursive: true });
  const store = new PlanStore(join(root, 'plans.json')); await store.init();
  const draft = await store.create({ request: '保留现有 3D 探索规则，继续完成剩余验证。', projectId: 'resume-ui-project' });
  const version = { id: 'ui-version', number: 1, createdAt: draft.updatedAt,
    requirements: [{ id: 'R001', text: draft.request }], options: [{ id: 'option-1', title: '探索路线与验证',
      approach: '探索', engine: 'godot', dimension: '3d', platform: 'web', coreLoop: ['探索', '修复', '返回'],
      features: ['移动'], assumptions: ['单人'], exclusions: ['联网'], requirementIds: ['R001'],
      estimate: { timeRange: null, costRange: null, basis: '待实测' } }],
    model: 'test-model', threadId: 'planner', turnId: 'turn', analysisDurationMs: 0, analysisUsage: null };
  await store.finish(draft.id, draft.attemptId, version, null);
  await store.reserve({ draftId: draft.id, versionId: version.id, optionId: 'option-1' });
  const approved = await store.markRun(draft.id, 'dispatched');
  const project = { id: 'resume-ui-project', status: 'stopped', stage: 'code', threadId: 'retained-thread', model: 'test-model', idea: draft.request };
  const resumes = [], changes = [];
  const resumer = new PlanResumer(store, {
    getProject: async () => project,
    dispatch: async (project, draft, input) => {
      resumes.push({ threadId: project.threadId, runId: draft.run.id, input });
      await pause(350);
      return { ...project, status: 'running' };
    },
  });
  ipcMain.handle('noobi:project:resume', (_event, input) => resumer.resume(input));
  ipcMain.handle('noobi:plans:generate', (_event, input) => { changes.push(input); return {}; });
  await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {Composer} from './src/renderer/components/Composer';
    import './src/renderer/styles.css';
    const props = ${JSON.stringify({ project, resumePlanTitle: version.options[0].title,
      models: [{ id: 'test-model', model: 'test-model', displayName: 'Test model', isDefault: true, defaultEffort: 'low', efforts: ['low'] }],
      settings: { defaultModel: 'test-model', defaultEffort: 'low' }, imageGenerationAvailable: true })};
    createRoot(document.getElementById('root')).render(<Composer {...props}
      onRun={async (prompt, model, effort) => {await window.noobi.generatePlans({projectId:props.project.id,request:prompt,model,effort})}}
      onResume={async (model, effort) => {await window.noobi.resumeProject({projectId:props.project.id,runId:${JSON.stringify(approved.run.id)},requestId:crypto.randomUUID(),model,effort})}}
      onStop={async()=>{}}/>);
    `, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: join(root, 'ui.js'),
    loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
  await writeFile(join(root, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="ui.css"><main id="root" style="max-width:840px;margin:80px auto"></main><script src="ui.js"></script>');
  window = new BrowserWindow({ show: false, width: 1040, height: 500, webPreferences: {
    preload: resolve('dist/main/preload.cjs'), contextIsolation: true, nodeIntegration: false,
  } });
  await window.loadFile(join(root, 'index.html')); await pause(500);
  const js = expression => window.webContents.executeJavaScript(expression, true);
  assert.equal(await js(`document.querySelector('.is-resume')?.title`), '继续已选方案：探索路线与验证');
  await writeFile(join(evidence, 'resume-ui.png'), (await window.webContents.capturePage()).toPNG());
  await js(`{const button=document.querySelector('.is-resume');button.click();button.click();button.click()}`);
  await pause(100);
  assert.equal(await js(`document.querySelector('.is-resume').disabled`), true);
  await pause(500);
  assert.equal(resumes.length, 1); assert.equal(changes.length, 0);
  assert.equal(resumes[0].threadId, 'retained-thread');
  assert.equal(resumes[0].runId, approved.run.id);
  await js(`{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'降低移动速度');input.dispatchEvent(new Event('input',{bubbles:true}))}`);
  await pause(100);
  assert.equal(await js(`Boolean(document.querySelector('.is-send:not(:disabled)'))`), true);
  await js(`document.querySelector('.is-send').click()`); await pause(150);
  assert.equal(changes.length, 1); assert.equal(changes[0].request, '降低移动速度');
  assert.equal(resumes.length, 1);
  await assert.rejects(js(`window.noobi.resumeProject({projectId:'resume-ui-project',runId:'stale',requestId:'invalid'})`), /方案已变化/);
  assert.equal(resumes.length, 1);
  const attempts = (await store.get(draft.id)).run.resumeAttempts;
  assert.equal(attempts.length, 1); assert.equal(attempts[0].status, 'dispatched');
  await writeFile(join(evidence, 'ui-result.json'), JSON.stringify({ passed: true, resumes: resumes.length,
    newChangePlans: changes.length, preservedThread: resumes[0].threadId, staleSelectionRejected: true,
    rapidClicksDispatchedOnce: true, realModelCalled: false, userProjectsModified: false }, null, 2));
  console.log('RESUME_UI_OK: real Electron renderer/preload/IPC, original selection, duplicate click protection, new-change routing, stale rejection');
} catch (error) {
  console.error(error); process.exitCode = 1;
} finally {
  if (window && !window.isDestroyed()) {
    window.webContents.session.flushStorageData();
    await window.webContents.session.closeAllConnections();
    window.destroy();
  }
  await pause(300);
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  app.exit(process.exitCode || 0);
}
}
