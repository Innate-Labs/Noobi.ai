// Actual Chromium mouse/keyboard on the frozen export. Read-only state probes.
import {app,BrowserWindow} from 'electron';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {GodotBuildStore} from '../dist/main/production/godotBuildStore.js';
import {PreviewServer} from '../dist/main/previewServer.js';
import {READ_RUNTIME_EVIDENCE,parseRuntimeEvidence} from '../dist/main/runtime/runtimeEvidence.js';
const input=JSON.parse(await readFile('.noobi-private/stage-08/combat-audio-export-latest.json','utf8'));
const out=join(input.out,'browser-'+Date.now());
app.commandLine.appendSwitch('autoplay-policy','document-user-activation-required');
app.setPath('userData',join(out,'profile'));app.on('window-all-closed',()=>{});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function installAudioTap(){
 const connect=AudioNode.prototype.connect;
 const taps=[];
 const disconnect=AudioNode.prototype.disconnect;
 AudioNode.prototype.disconnect=function(...args){const result=disconnect.apply(this,args);if(!args.length || args[0] instanceof AudioDestinationNode)for(const tap of taps)if(tap.source===this)tap.live=false;return result};
 AudioNode.prototype.connect=function(destination,...args){
  const result=connect.call(this,destination,...args);
  if(destination instanceof AudioDestinationNode){
   let tap=taps.find(t=>t.source===this&&t.output===(args[0]??0));
   if(!tap){const analyser=this.context.createAnalyser();analyser.fftSize=2048;tap={source:this,output:args[0]??0,analyser,context:this.context,live:true};taps.push(tap)}
   connect.call(this,tap.analyser,args[0]??0);tap.live=true;
  }
  return result;
 };
 window.__noobiAudioTap=()=>({activated:navigator.userActivation.hasBeenActive,taps:taps.filter(t=>t.live).map(t=>{
  const values=new Float32Array(t.analyser.fftSize);t.analyser.getFloatTimeDomainData(values);
  return {source:t.source.constructor.name,state:t.context.state,time:t.context.currentTime,rate:t.context.sampleRate,values:Array.from(values)};
 })});
}

app.whenReady().then(async()=>{
 const server=new PreviewServer();let win;const steps=[],errors=[];let passed=false;
 try{
  await mkdir(out,{recursive:true});
  const store=new GodotBuildStore(input.store);const build=await store.get(input.projectId,input.buildId);
  await store.verifyInputs(build);await store.verifyArtifacts(build);
  const url=await server.start(input.projectId,build.root,{directory:'build/web',sourceFallback:false,sourceAssetOverlay:false});
  win=new BrowserWindow({show:true,width:960,height:720,useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,autoplayPolicy:'document-user-activation-required'}});
  const timeout=setTimeout(async()=>{await writeFile(join(out,'timeout.json'),JSON.stringify({steps,errors}));app.exit(1)},150000);timeout.unref();
  win.webContents.on('console-message',e=>{if(/SCRIPT ERROR|Parse Error|ERROR:/u.test(e.message))errors.push(e.message)});
  const packet=()=>win.webContents.executeJavaScript(READ_RUNTIME_EVIDENCE).then(v=>parseRuntimeEvidence(v,input.buildId));
  const wait=async(predicate,label)=>{let p;for(let i=0;i<200;i++){await delay(100);try{p=await packet()}catch{continue}if(predicate(p))return p}throw Error(label+' timed out '+JSON.stringify(p?.state))};
  const key=async(code,ms=50)=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:code});await delay(ms);win.webContents.sendInputEvent({type:'keyUp',keyCode:code});await delay(200)};
  const click=async text=>{const p=await packet();const n=p.nodes.find(n=>n.class==='Button'&&n.visible&&n.text===text);assert(n,'Button '+text);const root=p.nodes.find(n=>n.path.endsWith('/GameUI')&&n.class==='Control');const canvas=await win.webContents.executeJavaScript('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()');const [x,y,w,h]=n.rect;const px=Math.round(canvas.x+(x+w/2)*canvas.width/root.rect[2]),py=Math.round(canvas.y+(y+h/2)*canvas.height/root.rect[3]);win.webContents.sendInputEvent({type:'mouseDown',button:'left',x:px,y:py,clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',button:'left',x:px,y:py,clickCount:1});await delay(350)};
  const setMusic=async muted=>{
   await key('Escape');await click('设置');
   const p=await packet(),n=p.nodes.find(n=>n.class==='HSlider'&&n.visible&&n.path.endsWith('/Volume_music'));
   assert(n,'Visible music slider');const root=p.nodes.find(n=>n.path.endsWith('/GameUI')&&n.class==='Control');
   const canvas=await win.webContents.executeJavaScript('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()');
   const [x,y,w,h]=n.rect,px=Math.round(canvas.x+(x+w/2)*canvas.width/root.rect[2]),py=Math.round(canvas.y+(y+h/2)*canvas.height/root.rect[3]);
   win.webContents.sendInputEvent({type:'mouseDown',button:'left',x:px,y:py,clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',button:'left',x:px,y:py,clickCount:1});
   await key(muted?'Home':'End');await key('Escape');await click('继续冒险');await delay(500);
  };
  const actor=p=>p.nodes.find(n=>n.path==='Player'&&n.class==='CharacterBody3D');
  const moveZ=async target=>{for(let i=0;i<30;i++){const p=await packet();const diff=actor(p).position[2]-target;if(Math.abs(diff)<.2)return;await key(diff>0?'W':'S',Math.max(25,Math.min(140,Math.abs(diff)/5*850)))}throw Error('Movement target '+target)};
  const capture=async name=>{const p=await packet();steps.push({name,state:p.state,paused:p.paused,position:actor(p)?.position});await writeFile(join(out,name+'.json'),JSON.stringify(p,null,2));await writeFile(join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());console.log(name,p.state)};
  await win.loadURL('about:blank');win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Page.enable');
  await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:'('+installAudioTap.toString()+')()'});
  const observed=()=>win.webContents.executeJavaScript('window.__assemblyCombat');
  const measure=async(name,expected,action)=>{
   const samples=[];const pending=action?.();
   for(let i=0;i<35;i++){samples.push(await win.webContents.executeJavaScript('window.__noobiAudioTap()'));await delay(20)}
   await pending;let count=0,peak=0,energy=0;
   for(const s of samples)for(const t of s.taps)for(const value of t.values){count++;peak=Math.max(peak,Math.abs(value));energy+=value*value}
   const result={name,expected,count,peak,rms:Math.sqrt(energy/Math.max(count,1)),observed:await observed(),activated:samples.at(-1).activated};
   await writeFile(join(out,name+'-audio.json'),JSON.stringify({result,samples},null,2));
   assert(count>0,'Final output tap available');
   assert(expected==='silent'?peak<0.00001:peak>0.001,name+' output '+peak);
   assert(peak<0.9999,name+' sampled output has headroom');
   console.log('audio',name,peak);return result;
  };
  await win.loadURL(url);win.webContents.focus();
  await wait(p=>p.state.state==='ready','title');await capture('01-title');
  const before=await measure('01-title','silent');assert.equal(before.activated,false);
  await click('开始新的冒险');await wait(p=>p.state.state==='playing','start');await delay(800);await measure('02-camp','audible');await capture('02-camp');
  await moveZ(-1);await key('F');await delay(400);assert.equal((await observed()).enemyHealth,2);assert.equal((await observed()).hits,0);assert((await observed()).locked);await capture('03-prerequisite-lock');
  await moveZ(.4);await key('E');await wait(p=>p.state.collected===1,'prerequisite');assert(!(await observed()).locked);await capture('04-unlocked');
  await moveZ(-1);await key('F');await wait(p=>p.state.enemy_health===1,'actual hit');await capture('05-first-hit');
  await key('Escape');await wait(p=>p.paused,'paused');await delay(150);const frozen=await observed();await measure('06-pause','silent');assert.equal((await observed()).music.find(x=>x.gain>0).position,frozen.music.find(x=>x.gain>0).position);await capture('06-paused');
  await click('继续冒险');await delay(250);const resumed=await observed();await writeFile(join(out,'resume-position.json'),JSON.stringify({frozen,resumed},null,2));assert(resumed.music.find(x=>x.playing&&x.gain>0)?.position>=frozen.music.find(x=>x.gain>0).position-.05,'Resume must preserve the original playhead');assert.equal(resumed.music.filter(x=>x.playing).length,1,'Resume must not allocate another music voice');await key('Escape');
  await click('保存进度');await click('返回标题');await wait(p=>p.state.state==='paused','title confirmation');await click('不保存，返回标题');await wait(p=>p.state.state==='ready','title');await measure('07-title-cleared','silent');
  await click('继续冒险');await wait(p=>p.state.state==='playing'&&p.state.enemy_health===2,'checkpoint resets encounter');await delay(800);assert.equal((await observed()).completed.length,1);assert.equal((await observed()).music.filter(x=>x.playing).length,1);await capture('08-partial-encounter-restored');
  await setMusic(true);await measure('08a-music-muted','silent');await moveZ(-.45);await measure('08b-hit-effect','audible',()=>key('F'));await wait(p=>p.state.enemy_health===1,'restored first hit');await delay(650);await key('F');await wait(p=>p.state.collected===2&&p.state.enemy_health===0,'defeat quest');assert.equal((await observed()).enemyHealth,0);await capture('09-defeat');await setMusic(false);
  await moveZ(-3);await key('E');await wait(p=>p.state.last_event==='travel','travel');await delay(1000);assert((await observed()).source.endsWith('happy-adventure.mp3'));assert.equal((await observed()).music.filter(x=>x.playing).length,1);await measure('10-ruins','audible');await capture('10-ruins');
  await moveZ(.4);await key('E');await wait(p=>p.state.collected===3,'ruins objective');await key('Escape');await click('保存进度');await delay(1500);win.reload();await wait(p=>p.state.state==='ready','reload title');await click('继续冒险');await wait(p=>p.state.collected===3,'reload progress');await delay(800);assert.equal((await observed()).region,'ruins');assert((await observed()).source.endsWith('happy-adventure.mp3'));await measure('11-reload-region','audible');await capture('11-reload-region');
  await moveZ(-1.7);await key('E');await wait(p=>p.state.last_event==='travel','summit');await delay(800);assert((await observed()).source.endsWith('exploration.ogg'));await measure('12-summit','audible');await capture('12-summit');
  await setMusic(true);await moveZ(.4);await measure('12a-before-ending','silent');await measure('13-ending-sting','audible',()=>key('E'));await wait(p=>p.state.state==='won'&&p.state.collected===4,'ending');assert.equal((await observed()).music.filter(x=>x.playing).length,0);await capture('13-ending');
  await delay(1800);await measure('14-ending-tail','silent');
  await click('返回标题');await click('不保存，返回标题');await wait(p=>p.state.state==='ready','final title');await click('开始新的冒险');await click('确认新冒险');await wait(p=>p.state.collected===0&&p.state.state==='playing','restart');await delay(800);assert.equal((await observed()).managers,1);assert.equal((await observed()).music.filter(x=>x.playing).length,1);assert.equal((await observed()).region,'camp');await measure('15-restart-settings-preserved','silent');await setMusic(false);await measure('15-restart','audible');await capture('15-restart');
  assert.deepEqual(errors,[]);passed=true;
 }catch(error){errors.push(String(error));console.error(error);if(win&&!win.isDestroyed())await writeFile(join(out,'failure.png'),(await win.webContents.capturePage()).toPNG()).catch(()=>{})}
 finally{await writeFile(join(out,'report.json'),JSON.stringify({passed,steps,errors,build:input.build,scope:'Authored combat/audio engineering; Chromium real input, browser reload and final mixed PCM samples. Not speaker/human listening or full audiovisual latency measurement. Not autonomous game, Firefox/Safari or different device.'},null,2));if(win&&!win.isDestroyed())win.destroy();await server.stopAll();console.log(JSON.stringify({passed,out,steps:steps.length}));app.exit(passed?0:1)}
});
