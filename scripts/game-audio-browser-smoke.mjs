// Chromium engineering validation with strict autoplay policy and read-only final-output taps.
import { app, BrowserWindow } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { GodotBuildStore } from '../dist/main/production/godotBuildStore.js';
import { PreviewServer } from '../dist/main/previewServer.js';
import { READ_RUNTIME_EVIDENCE, parseRuntimeEvidence } from '../dist/main/runtime/runtimeEvidence.js';
const input=JSON.parse(await readFile('.noobi-private/stage-07/browser-audio-latest.json','utf8'));
const out=join(input.out,'browser-'+Date.now());
app.setPath('userData',join(out,'profile'));
app.commandLine.appendSwitch('autoplay-policy','document-user-activation-required');
app.on('window-all-closed',()=>{});
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
 const server=new PreviewServer(); let win;const steps=[],errors=[];let failed=false;
 try {
  await mkdir(out,{recursive:true});
  const store=new GodotBuildStore(input.store),build=await store.get(input.projectId,input.buildId);
  await store.verifyInputs(build);await store.verifyArtifacts(build);
  console.log("validated-build",out);
  const url=await server.start(input.projectId,build.root,{directory:'build/web',sourceFallback:false,sourceAssetOverlay:false});
  win=new BrowserWindow({show:true,width:1280,height:720,useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,autoplayPolicy:'document-user-activation-required'}});
  const watchdog=setTimeout(async()=>{console.error('AUDIO_BROWSER_TIMEOUT');await writeFile(join(out,'timeout.json'),JSON.stringify({errors,steps}));if(win&&!win.isDestroyed()){await writeFile(join(out,'timeout.png'),(await win.webContents.capturePage()).toPNG()).catch(()=>{});}app.exit(1)},90000);watchdog.unref();
  win.webContents.on('console-message',e=>{console.log('browser',e.message.slice(0,350));if(/SCRIPT ERROR|Parse Error|ERROR:/u.test(e.message))errors.push(e.message)});
  await win.loadURL('about:blank');
  console.log('window-ready');
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Page.enable');
  await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:'('+installAudioTap.toString()+')()'});
  console.log('tap-installed',url);
  await win.loadURL(url);console.log('page-loaded'); win.webContents.focus();
  const packet=()=>win.webContents.executeJavaScript(READ_RUNTIME_EVIDENCE).then(v=>parseRuntimeEvidence(v,input.buildId));
  for(let i=0;i<250;i++){await delay(100);try{if((await packet()).state.state==='title')break;}catch{}}
  const key=async(code,ms=50)=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:code});await delay(ms);win.webContents.sendInputEvent({type:'keyUp',keyCode:code});await delay(120)};
  const clickNode=async node=>{
   const p=await packet(),root=p.nodes.find(n=>n.path.endsWith('/GameUI')&&n.class==='Control');
   const canvas=await win.webContents.executeJavaScript('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()');
   const [x,y,w,h]=node.rect,px=Math.round(canvas.x+(x+w/2)*canvas.width/root.rect[2]),py=Math.round(canvas.y+(y+h/2)*canvas.height/root.rect[3]);
   win.webContents.sendInputEvent({type:'mouseDown',button:'left',x:px,y:py,clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',button:'left',x:px,y:py,clickCount:1});await delay(200);
  };
  const click=async text=>{const n=(await packet()).nodes.find(n=>n.class==='Button'&&n.visible&&n.text===text);assert(n,'Visible '+text);await clickNode(n)};
  const measure=async(name,action,expected)=>{
   await delay(200);const frames=[];
   const pending=action?.();
   for(let i=0;i<35;i++){frames.push(await win.webContents.executeJavaScript('window.__noobiAudioTap()'));await delay(20)}
   await pending;
   let peak=0,energy=0,count=0;
   for(const f of frames)for(const t of f.taps)for(const v of t.values){energy+=v*v;peak=Math.max(peak,Math.abs(v));count++}
   const p=await packet();const result={name,expected,peak,rms:Math.sqrt(energy/Math.max(1,count)),activated:frames.at(-1).activated,taps:frames.at(-1).taps.map(({values,...rest})=>rest),state:p.state,paused:p.paused};
   steps.push(result);console.log('step',name,result.peak,result.taps);
   await writeFile(join(out,name+'.json'),JSON.stringify({result,frames},null,2));
   await writeFile(join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
   assert(count>0,'Audio destination tap exists');
   if(expected==='audible')assert(peak>0.001,name+' has actual signal');
   if(expected==='silent')assert(peak<0.00001,name+' has no signal');
   return result;
  };
  console.log('runtime-ready');
  const pre=await measure('01-before-gesture',null,'silent');
  assert.equal(pre.activated,false);assert(pre.taps.every(t=>t.state==='suspended'),'Context suspended before real input');
  await click('开始新的冒险');await delay(500);
  const playing=await measure('02-start-click',null,'audible');assert(playing.activated);assert(playing.taps.every(t=>t.state==='running'));
  await key('W',400);await key('E');assert.equal((await packet()).state.collected,1);
  await measure('03-pickup-track-switch',null,'audible');
  await key('Escape');await delay(400);await measure('04-pause',null,'silent');
  await click('设置');
  await measure('05-menu-effect',()=>key('F7'),'audible');
  const slider=async(name,end)=>{const n=(await packet()).nodes.find(n=>n.class==='HSlider'&&n.path.endsWith('/Volume_'+name)&&n.visible);assert(n,'slider '+name);await clickNode(n);await key(end?'End':'Home');await delay(300)};
  await slider('effects',false);await measure('06-effects-muted',()=>key('F7'),'silent');
  await slider('effects',true);await measure('07-effects-restored',()=>key('F7'),'audible');
  await slider('music',false);await key('Escape');await click('继续冒险');await delay(400);
  await measure('08-music-muted',null,'silent');
  await measure('09-effects-independent',()=>key('F7'),'audible');
  await key('Escape');await click('设置');await slider('music',true);await slider('master',false);await key('Escape');await click('继续冒险');await delay(300);
  await measure('10-master-muted',()=>key('F7'),'silent');
  await key('Escape');await click('设置');await slider('master',true);await key('Escape');await click('继续冒险');await delay(300);
  await measure('11-master-restored',null,'audible');
  await key('Escape');await click('返回标题');await click('不保存，返回标题');await delay(400);
  await measure('12-title-stop',null,'silent');
  await click('开始新的冒险');await delay(400);await measure('13-new-run',null,'audible');assert.equal((await packet()).state.collected,0);
  assert.deepEqual(errors,[]);await store.verifyInputs(build);await store.verifyArtifacts(build);
  console.log('AUDIO_BROWSER_OK',out);
 } catch(e){failed=true;errors.push(String(e.stack??e));console.error(e);if(win&&!win.isDestroyed())await writeFile(join(out,'failure.png'),(await win.webContents.capturePage()).toPNG()).catch(()=>{})}
 finally {
  await writeFile(join(out,'results.json'),JSON.stringify({build:input.build,passed:!failed,steps,errors,scope:'Instrumented Chromium engineering UI/audio integration; sampled output is not speaker or human listening evidence',autoplayPolicy:'document-user-activation-required'},null,2));
  if(win&&!win.isDestroyed())win.destroy();await server.stopAll();app.exit(failed?1:0);
 }
});
