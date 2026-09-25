// SIGKILL at real process/file/browser boundaries. Model text is a deterministic fixture;
// this tests recovery mechanics, not the quality of an AI-generated game.
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { GameHarness } from '../dist/main/gameHarness.js';
import { ProductionRunStore } from '../dist/main/production/productionRunStore.js';
import { GodotBuildStore } from '../dist/main/production/godotBuildStore.js';
import { productionEvidence } from '../dist/main/production/productionEvidence.js';
const html = '<!doctype html><meta charset="utf-8"><title>Recovery fixture</title><h1>恢复验证样例</h1><output id="count">0</output><button id="add" onclick="count.textContent=Number(count.textContent)+1">收集</button><button id="reset" onclick="count.textContent=0">重开</button>';
const workerMode = process.argv.includes('--worker');
if (workerMode) await worker();
else {
  const { app, BrowserWindow } = await import('electron');
  const root = resolve('.noobi-private/stage-05/faults', new Date().toISOString().replaceAll(':', '-'));
  await mkdir(root, { recursive: true }); app.setPath('userData', join(root, 'electron')); app.on('window-all-closed', () => {});
  app.whenReady().then(async () => { const results = [];
  try {
    for (const boundary of ['before-write', 'after-write', 'after-checkpoint', 'before-build', 'after-build', 'before-verify', 'after-verify', 'after-delivery']) {
      const directory = join(root, boundary); await mkdir(join(directory, 'game'), { recursive: true });
      await writeFile(join(directory, 'game/index.html'), '<h1>Initial fixture</h1>');
      await execute(directory, boundary, false); await execute(directory, boundary, true);
      const progress = JSON.parse(await readFile(join(directory, 'progress.json'), 'utf8')).runs[0];
      assert.equal(progress.status, 'completed'); assert.equal(progress.attempts.length, 2); assert.equal(progress.attempts[0].status, 'interrupted');
      const finishedWriter = !['before-write', 'after-write'].includes(boundary);
      assert.equal(progress.tasks.find(task => task.id === 'implementer').reused, finishedWriter);
      const writes = Number(await readFile(join(directory, 'writes.txt'), 'utf8'));
      assert.equal(writes, boundary === 'after-write' ? 2 : 1); // Only the unacknowledged turn is inspected/replayed.
      assert.equal(await readFile(join(directory, 'game/index.html'), 'utf8'), html);
      const receipts = progress.attempts[1].executions;
      assert.ok(receipts.filter(value => value.taskId === 'reviewer').length >= 2);
      assert.ok(receipts.find(value => value.taskId === 'delivery' && value.status === 'completed'));
      results.push({ boundary, passed: true, writes, reusedWriter: finishedWriter, interruptedTask: progress.attempts[0].executions.at(-1).taskId, freshReviews: receipts.filter(value => value.taskId === 'reviewer').length });
      console.log('RECOVERY_BOUNDARY_OK', boundary);
    }
    await writeFile(join(root, 'results.json'), JSON.stringify({ actualProcessKill: true, realBrowserInput: true, modelResponses: 'fixture', results }, null, 2));
    console.log('PRODUCTION_RECOVERY_OK', root); app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
  }).catch(error => { console.error(error); app.exit(1); });

  function execute(directory, boundary, resume) {
    return new Promise((resolveRun, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', directory, boundary, resume ? 'resume' : 'first'], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      let killed = false, output = ''; const windows = new Set();
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Boundary timeout: ${boundary}\n${output}`)); }, 45000);
      child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
      child.on('error', reject);
      child.on('message', async message => {
        try {
          if (message.type === 'boundary' && !resume) { killed = true; child.kill('SIGKILL'); }
          if (message.type === 'browser') {
            const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } }); windows.add(window);
            try {
              await window.loadFile(message.path);
              const counts = await window.webContents.executeJavaScript(`(() => { document.getElementById('add').click();document.getElementById('add').click();const first=document.getElementById('count').textContent;document.getElementById('reset').click();return [first,document.getElementById('count').textContent]; })()`);
              assert.deepEqual(counts, ['2', '0']);
              await writeFile(join(directory, resume ? 'resumed.png' : 'before-kill.png'), (await window.webContents.capturePage()).toPNG());
              if (child.connected) child.send({ type: 'browser-result', ok: true });
            } finally { windows.delete(window); window.destroy(); }
          }
        } catch (error) { if (child.connected) child.send({ type: 'browser-result', ok: false, error: String(error) }); }
      });
      child.on('exit', (code, signal) => {
        clearTimeout(timer); for (const window of windows) if (!window.isDestroyed()) window.destroy();
        if ((!resume && killed && signal === 'SIGKILL') || (resume && code === 0)) resolveRun();
        else reject(new Error(`Worker ${boundary}/${resume}: ${code}/${signal}\n${output}`));
      });
    });
  }
}
async function worker() {
  const offset = process.argv.indexOf('--worker'), directory = process.argv[offset + 1], boundary = process.argv[offset + 2], resume = process.argv[offset + 3] === 'resume';
  const root = join(directory, 'game'), builds = new GodotBuildStore(join(directory, 'builds'));
  const store = new ProductionRunStore(join(directory, 'progress.json')); await store.init();
  const { session, recovery } = await store.begin({ projectId: 'fixture', planRunId: 'selected', planVersionId: 'v1', planTitle: 'Recovery fixture',
    contractKey: 'same-policy', coreLoop: false, visualSample: false, continuation: resume, requirementIds: ['R01'] });
  const hit = async name => { if (!resume && boundary === name) { process.channel.ref(); process.send({ type: 'boundary', name }); await new Promise(() => {}); } };
  class Runtime extends EventEmitter {
    threads = new Map(); next = 0;
    async startThread(options) { const id = `thread-${++this.next}`; this.threads.set(id, options); return id; }
    async resumeThread(id, options) { this.threads.set(id, options); return id; }
    async startTurn(options) {
      const id = `turn-${++this.next}`;
      const writer = this.threads.get(options.threadId)?.sandbox === 'workspace-write';
      if (writer) {
        await hit('before-write');
        let count = 0; try { count = Number(await readFile(join(directory, 'writes.txt'), 'utf8')); } catch {}
        await writeFile(join(root, 'index.html'), html); await writeFile(join(directory, 'writes.txt'), String(count + 1));
        await hit('after-write');
      }
      const text = writer ? 'Fixture implementation saved' : JSON.stringify({ verdict: 'pass', summary: 'Fixture review decision; not a model quality judgment', findings: [] });
      queueMicrotask(() => {
        this.emit('notification', { method: 'item/completed', params: { threadId: options.threadId, turnId: id, item: { type: 'agentMessage', text } } });
        this.emit('notification', { method: 'turn/completed', params: { threadId: options.threadId, turnId: id, turn: { id, status: 'completed' } } });
      }); return id;
    }
    async unsubscribeThread() {} async interruptTurn() {} async stop() {}
  }
  await new GameHarness(new Runtime()).run({ projectId: 'fixture', cwd: root, prompt: 'Recovery engineering fixture, not a generated game', imageGenerationRoute: 'configured-api',
    recovery, workspaceFingerprint: () => builds.fingerprint(root), onRecoveryInvalidated: reason => store.invalidate(session, reason),
    reserveBudget: kind => store.reserve(session, kind),
    onTask: async update => {
      const evidence = await productionEvidence({ projectId: 'fixture', root, engine: 'web', builds, assets: async () => [] });
      await store.update(session, { ...update, evidence });
      if (update.id === 'implementer' && update.status === 'completed') await hit('after-checkpoint');
      if (update.id === 'delivery' && update.status === 'completed') await hit('after-delivery');
    },
    validateHostDelivery: async () => {
      await hit('before-build'); await mkdir(join(root, 'build'), { recursive: true }); await copyFile(join(root, 'index.html'), join(root, 'build/index.html')); await hit('after-build');
      await hit('before-verify');
      await new Promise((resolveBrowser, reject) => { const listener = message => { if (message.type !== 'browser-result') return; process.off('message', listener); message.ok ? resolveBrowser() : reject(new Error(message.error)); }; process.on('message', listener); process.send({ type: 'browser', path: join(root, 'build/index.html') }); });
      await hit('after-verify'); return { ok: true, findings: [] };
    },
  });
  await store.finish(session, 'completed'); await store.flush(); process.disconnect();
}
