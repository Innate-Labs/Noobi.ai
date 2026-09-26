// Actual Chromium mouse/keyboard on the frozen export. Read-only state probes.
import {app,BrowserWindow} from 'electron';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {GodotBuildStore} from '../dist/main/production/godotBuildStore.js';
import {PreviewServer} from '../dist/main/previewServer.js';
import {READ_RUNTIME_EVIDENCE,parseRuntimeEvidence} from '../dist/main/runtime/runtimeEvidence.js';
const input=JSON.parse(await readFile('.noobi-private/stage-08/assembly-export-latest.json','utf8'));
const out=join(input.out,'browser-'+Date.now());
app.setPath('userData',join(out,'profile'));app.on('window-all-closed',()=>{});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const server=new PreviewServer();let win;const steps=[],errors=[];let passed=false;
 try{
  await mkdir(out,{recursive:true});
  const store=new GodotBuildStore(input.store);const build=await store.get(input.projectId,input.buildId);
  await store.verifyInputs(build);await store.verifyArtifacts(build);
  const url=await server.start(input.projectId,build.root,{directory:'build/web',sourceFallback:false,sourceAssetOverlay:false});
  win=new BrowserWindow({show:true,width:960,height:720,useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const timeout=setTimeout(async()=>{await writeFile(join(out,'timeout.json'),JSON.stringify({steps,errors}));app.exit(1)},120000);timeout.unref();
  win.webContents.on('console-message',e=>{if(/SCRIPT ERROR|Parse Error|ERROR:/u.test(e.message))errors.push(e.message)});
  const packet=()=>win.webContents.executeJavaScript(READ_RUNTIME_EVIDENCE).then(v=>parseRuntimeEvidence(v,input.buildId));
  const wait=async(predicate,label)=>{let p;for(let i=0;i<200;i++){await delay(100);try{p=await packet()}catch{continue}if(predicate(p))return p}throw Error(label+' timed out '+JSON.stringify(p?.state))};
  const key=async(code,ms=50)=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:code});await delay(ms);win.webContents.sendInputEvent({type:'keyUp',keyCode:code});await delay(200)};
  const click=async text=>{const p=await packet();const n=p.nodes.find(n=>n.class==='Button'&&n.visible&&n.text===text);assert(n,'Button '+text);const root=p.nodes.find(n=>n.path.endsWith('/GameUI')&&n.class==='Control');const canvas=await win.webContents.executeJavaScript('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()');const [x,y,w,h]=n.rect;const px=Math.round(canvas.x+(x+w/2)*canvas.width/root.rect[2]),py=Math.round(canvas.y+(y+h/2)*canvas.height/root.rect[3]);win.webContents.sendInputEvent({type:'mouseDown',button:'left',x:px,y:py,clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',button:'left',x:px,y:py,clickCount:1});await delay(350)};
  const actor=p=>p.nodes.find(n=>n.path==='Player'&&n.class==='CharacterBody3D');
  const moveZ=async target=>{for(let i=0;i<30;i++){const p=await packet();const diff=actor(p).position[2]-target;if(Math.abs(diff)<.2)return;await key(diff>0?'W':'S',Math.max(25,Math.min(140,Math.abs(diff)/5*850)))}throw Error('Movement target '+target)};
  const capture=async name=>{const p=await packet();steps.push({name,state:p.state,paused:p.paused,position:actor(p)?.position});await writeFile(join(out,name+'.json'),JSON.stringify(p,null,2));await writeFile(join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());console.log(name,p.state)};
  await win.loadURL(url);win.webContents.focus();
  await wait(p=>p.state.state==='ready','title');await capture('01-title');
  await click('开始新的冒险');await wait(p=>p.state.state==='playing','start');await capture('02-playing');
  await moveZ(-1.7);await key('E');await wait(p=>p.state.last_event==='invalid','locked gate');assert.equal((await packet()).state.collected,0);await capture('03-locked-gate');
  await moveZ(.4);await key('E');await wait(p=>p.state.collected===1,'first objective');await capture('04-quest-one');
  await moveZ(-1.7);await key('E');await wait(p=>p.state.last_event==='travel','region two');assert(actor(await packet()).position[2]>2);await capture('05-region-two');
  await moveZ(.4);await key('E');await wait(p=>p.state.collected===2,'second objective');await capture('06-quest-two');
  await key('Escape');await wait(p=>p.paused&&p.state.state==='paused','pause');const position=actor(await packet()).position;await key('W',200);assert.deepEqual(actor(await packet()).position,position);
  await click('保存进度');await capture('07-saved-pause');
  // Actual browser reload forces the game/runtime to reconstruct from IndexedDB-backed save.
  await delay(1500);await win.reload();await wait(p=>p.state.state==='ready','reloaded title');await click('继续冒险');await wait(p=>p.state.state==='playing'&&p.state.collected===2,'restored region');assert(actor(await packet()).position[2]>2);await capture('08-reload-checkpoint');
  await moveZ(.4);await key('E');assert.equal((await packet()).state.collected,2);
  await moveZ(-1.7);await key('E');await wait(p=>p.state.last_event==='travel','region three');await capture('09-region-three');
  await moveZ(.4);await key('E');await wait(p=>p.state.state==='won'&&p.state.collected===3,'ending');await capture('10-ending');
  await click('保存这段旅程');await delay(1500);await win.reload();await wait(p=>p.state.state==='ready','ending reload');await click('继续冒险');await wait(p=>p.state.state==='won'&&p.state.collected===3,'restored ending');await capture('11-reload-ending');
  assert.deepEqual(errors,[]);passed=true;
 }catch(error){errors.push(String(error));console.error(error);if(win&&!win.isDestroyed())await writeFile(join(out,'failure.png'),(await win.webContents.capturePage()).toPNG()).catch(()=>{})}
 finally{await writeFile(join(out,'report.json'),JSON.stringify({passed,steps,errors,build:input.build,scope:'Authored engineering; Chromium real input and browser reload. Not autonomous game, Firefox/Safari or different device.'},null,2));if(win&&!win.isDestroyed())win.destroy();await server.stopAll();console.log(JSON.stringify({passed,out,steps:steps.length}));app.exit(passed?0:1)}
});
