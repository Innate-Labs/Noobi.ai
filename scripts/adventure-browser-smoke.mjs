import { app, BrowserWindow } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createAdventureFixture } from './adventure-browser-fixture.mjs';
import { ProjectStore } from '../dist/main/projectStore.js';
import { GodotEnvironmentService } from '../dist/main/godotEnvironmentService.js';
import { GodotBuildStore } from '../dist/main/production/godotBuildStore.js';
import { buildGodotCandidate } from '../dist/main/production/godotBuilder.js';
import { PreviewServer } from '../dist/main/previewServer.js';
import { parseRuntimeEvidence, READ_RUNTIME_EVIDENCE } from '../dist/main/runtime/runtimeEvidence.js';
const dragOnly = process.argv.includes('--drag-only');
const out = resolve('.noobi-private/stage-06/browser', new Date().toISOString().replaceAll(':', '-'));
app.setPath('userData', join(out, 'electron')); app.on('window-all-closed', () => {});
const pause = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(run).catch(error => { console.error(error); app.exit(1); });
async function run() {
  const previews = new PreviewServer(); let window; let exitCode = 0;
  try {
    await mkdir(out, { recursive: true });
    const environment = new GodotEnvironmentService({ storageFile: join(out, 'godot.json') });
    const status = await environment.init(); assert.ok(status.canExportProjects, status.tool.message);
    const projects = new ProjectStore(join(out, 'projects.json'), join(out, 'games')); await projects.init();
    const project = await projects.create({ name: 'Adventure component browser fixture', idea: 'Engineering integration fixture, not generated art', engine: 'godot', parentDirectory: join(out, 'games') });
    await createAdventureFixture(project.root, {dragOnly});
    const builds = new GodotBuildStore(join(out, 'builds'));
    const build = await buildGodotCandidate({ projectId: project.id, projectRoot: project.root, store: builds, environment });
    console.log('ADVENTURE_BUILD', build.record.buildId);
    const url = await previews.start(project.id, build.root, { directory: 'build/web', sourceFallback: false, sourceAssetOverlay: false, hideGodotSplash: true });
    window = new BrowserWindow({ show: false, width: 1100, height: 760, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    const errors = [], events = [], consoleLines = [];
    window.webContents.on('console-message', event => { consoleLines.push(event.message); if (/SCRIPT ERROR|Parse Error|WebGL.*error/.test(event.message)) errors.push(event.message); });
    window.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'pointerLock'));
    window.webContents.session.setPermissionCheckHandler((_contents, permission) => permission === 'pointerLock');
    await window.loadURL(url); window.show(); app.focus({ steal: true }); window.focus(); window.webContents.focus(); await pause(350);
    const packet = () => window.webContents.executeJavaScript(READ_RUNTIME_EVIDENCE).then(value => parseRuntimeEvidence(value, build.record.buildId));
    const ready = async () => { for (let n = 0; n < 220; n++) { try { return await packet(); } catch {} await pause(100); } throw new Error('Runtime did not start'); };
    await ready();
    const capture = async name => { await pause(400); const value = await packet(); events.push({ name, packet: value }); await writeFile(join(out, 'browser-console.log'), consoleLines.join('\n')); await writeFile(join(out, name + '.json'), JSON.stringify(value, null, 2)); await writeFile(join(out, name + '.png'), (await window.webContents.capturePage()).toPNG()); return value; };
    const key = async (keyCode, duration = 80) => { window.webContents.sendInputEvent({ type: 'keyDown', keyCode }); await pause(duration); window.webContents.sendInputEvent({ type: 'keyUp', keyCode }); await pause(180); };
    const pos = value => value.scene3d.nodes.find(node => node.path === 'World/Player').position;
    await key('Enter'); assert.equal((await capture('01-start')).state.state, 'playing');
    const before = pos(await packet()); await key('W', 450); const moved = await capture('02-move'); assert.ok(pos(moved)[2] < before[2] - 0.8, JSON.stringify(pos(moved)));
    await key('Space', 100); const jumping = await packet(); assert.ok(pos(jumping)[1] > 0.2, JSON.stringify(pos(jumping))); await pause(1000);
    await key('E'); assert.equal((await capture('03-collected')).state.collected, 1);
    await key('K'); { const saved = await capture('04-save'); assert.equal(saved.state.last_event, 'saved', JSON.stringify(saved.nodes.filter(n => n.text))); }
    await key('P'); const paused = await capture('05-paused'); assert.equal(paused.state.state, 'paused');
    await key('D', 500); assert.deepEqual(pos(await packet()), pos(paused));
    await key('P'); assert.equal((await packet()).state.state, 'playing');
    app.focus({ steal: true }); window.focus(); window.webContents.focus(); await pause(300);
    console.log('FOCUS', await window.webContents.executeJavaScript('JSON.stringify({focused:document.hasFocus(),visible:document.visibilityState,canvas:!!document.querySelector("canvas")?.isConnected})'));
    await window.webContents.executeJavaScript(`(() => {const original=Element.prototype.requestPointerLock;Element.prototype.requestPointerLock=function(...args){window.pointerDiagnostics={id:this.id,connected:this.isConnected,root:this.getRootNode()===document,focused:document.hasFocus(),activation:navigator.userActivation.isActive};return original.apply(this,args);};})()`);
    // A trusted browser gesture requests pointer capture; mouse movement then changes actual camera yaw.
    window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', x: 700, y: 420, clickCount: 1 });
    window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', x: 700, y: 420, clickCount: 1 }); await pause(200);
    const captured = await window.webContents.executeJavaScript('Boolean(document.pointerLockElement)');
    await writeFile(join(out, 'browser-console.log'), consoleLines.join('\n')); console.log('POINTER', await window.webContents.executeJavaScript('JSON.stringify(window.pointerDiagnostics)')); if (!captured && !dragOnly) console.error('POINTER_LOCK_FAILED: will finish independent checks, then report failure');
    if(dragOnly) assert.equal(captured,false,'Drag-only mode must not capture pointer');
    const cameraBefore = (await packet()).scene3d.nodes.filter(node => node.kind === 'camera');
    if (!captured) window.webContents.sendInputEvent({type:'mouseDown',button:'right',x:700,y:420,clickCount:1});
    await pause(120);
    for(let step=1;step<=10;step++){window.webContents.sendInputEvent({ type: 'mouseMove', x: 700+step*15, y: 420, movementX: 15, movementY: 0, ...(captured?{}:{button:'right'}) });await pause(25);}
    await pause(150); if (!captured) window.webContents.sendInputEvent({type:'mouseUp',button:'right',x:850,y:420,clickCount:1});
    const turned = await capture('06-camera'); assert.notDeepEqual(turned.scene3d.nodes.filter(node => node.kind === 'camera'), cameraBefore);
    const other = new BrowserWindow({show:true,width:320,height:220,webPreferences:{contextIsolation:true,nodeIntegration:false}});
    try {
      await other.loadURL('about:blank'); window.blurWebView(); window.blur(); app.focus({steal:true}); other.focus(); other.webContents.focus(); await pause(450);
      console.log('FOCUS_SWITCH', {original:window.isFocused(),other:other.isFocused(),documentFocused:await window.webContents.executeJavaScript('document.hasFocus()')});
      assert.equal(window.isFocused(),false,'Test must actually move focus away');
      assert.equal(await window.webContents.executeJavaScript('document.hasFocus()'),false,'Browser content must actually lose focus');
      assert.equal((await capture('06b-focus-lost')).state.state,'paused','Actual window focus loss must pause the game');
    } finally { other.destroy(); }
    window.focus(); window.webContents.focus(); await pause(200);
    assert.equal((await packet()).state.state,'paused','Returning focus must not auto-resume');
    await key('P'); await pause(200);
    assert.equal((await packet()).state.state,'playing');
    await key('P'); assert.equal(await window.webContents.executeJavaScript('Boolean(document.pointerLockElement)'), false);
    await pause(700); await window.reload(); await ready(); await key('L');
    const restored = await capture('07-reloaded'); assert.equal(restored.state.collected, 1); assert.equal(restored.state.last_event, 'loaded');
    await key('W', 1000); for (let n=0;n<6 && pos(await packet())[2]>-4;n++) await key('W', 220); await key('E'); const won = await capture('08-goal'); assert.equal(won.state.state, 'won');
    await key('R'); const reset = await capture('09-restart'); assert.equal(reset.state.state, 'playing'); assert.equal(reset.state.collected, 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    await writeFile(join(out, 'results.json'), JSON.stringify({ build: build.record, input: 'actual Electron key and pointer events', generatedGame: false, events, cameraMode: dragOnly ? 'explicit-drag-only' : 'capture-with-drag-fallback', pointerLocked: captured, dragFallback: !captured, passed: captured || dragOnly }, null, 2));
    assert.ok(captured || dragOnly, 'Pointer lock remains unverified; other checks saved, full browser acceptance is not passed');
    console.log('ADVENTURE_BROWSER_OK', out);
  } catch (error) { exitCode = 1; console.error(error); } finally { if (window && !window.isDestroyed()) window.destroy(); await previews.stopAll(); app.exit(exitCode); }
}
