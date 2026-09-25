// Electron CLI: --store <private build store> --project <id> --build <id> --policy <json>.
// Policy is frozen before launch. This exercises real input, never game functions.
import {app,BrowserWindow} from 'electron';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {cpus,totalmem,platform,release,arch} from 'node:os';
import {GodotBuildStore} from '../dist/main/production/godotBuildStore.js';
import {PreviewServer} from '../dist/main/previewServer.js';
import {parseLongRunPolicy,frameDistribution} from '../dist/main/quality/longRun.js';
import {READ_RUNTIME_EVIDENCE,parseRuntimeEvidence} from '../dist/main/runtime/runtimeEvidence.js';
const arg=n=>process.argv[process.argv.indexOf(n)+1];
let policyBytes, policy;
try {
 for(const n of ['--store','--project','--build','--policy'])if(!process.argv.includes(n))throw Error('Missing '+n);
 policyBytes=await readFile(resolve(arg('--policy'))); policy=parseLongRunPolicy(JSON.parse(policyBytes));
} catch(error) { console.error(error.message); app.exit(2); }

const out=resolve('.noobi-private/stage-09/long-run',new Date().toISOString().replaceAll(':','-'));
app.setPath('userData',join(out,'electron'));app.on('window-all-closed',()=>{});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let interrupted=false;process.on('SIGINT',()=>{interrupted=true});process.on('SIGTERM',()=>{interrupted=true});
app.whenReady().then(async()=>{
 const server=new PreviewServer(),store=new GodotBuildStore(resolve(arg('--store')));let win,report={version:1,startedAt:new Date().toISOString(),policy,policyHash:createHash('sha256').update(policyBytes).digest('hex'),completed:false,fullGameCompletion:'not-assessed',referenceMatch:'not-assessed',playerExperience:'not-assessed',errors:[],samples:[],focusChanges:[]};
 let intervals=[],start=0,previousSequence=0,previousFrame=0,metricsMissing=false;
const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser operation exceeded 15 seconds')),15000)})]);}finally{clearTimeout(timer);}};
 await mkdir(out,{recursive:true});await writeFile(join(out,'policy.json'),policyBytes);
 try{
 const build=await store.get(arg('--project'),arg('--build'));await store.verifyInputs(build);await store.verifyArtifacts(build);
 report.build={buildId:build.record.buildId,sourceHash:build.record.sourceHash,artifactHash:build.record.artifactHash,engineVersion:build.record.engineVersion};
 report.device={os:platform(),release:release(),arch:arch(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,totalMemoryMiB:Math.round(totalmem()/1048576),electron:process.versions.electron,chromium:process.versions.chrome,gpu:await app.getGPUInfo('basic')};
 const url=await server.start(build.record.projectId,build.root,{directory:'build/web',sourceFallback:false,sourceAssetOverlay:false});
 win=new BrowserWindow({show:true,width:policy.width,height:policy.height,useContentSize:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 win.webContents.on('console-message',e=>{if(e.level==='error'||/SCRIPT ERROR|Parse Error|WebGL.*error/u.test(e.message)){report.errors.push(String(e.message).slice(0,1000));report.errors=report.errors.slice(0,100);}});
 win.webContents.on('render-process-gone',(_e,d)=>report.errors.push('renderer-gone: '+d.reason));win.on('unresponsive',()=>report.errors.push('unresponsive'));
 win.on('blur',()=>report.focusChanges.push({ms:performance.now()-start,focused:false}));win.on('focus',()=>report.focusChanges.push({ms:performance.now()-start,focused:true}));
 await bounded(win.loadURL(url));win.webContents.focus();
 const packet=()=>bounded(win.webContents.executeJavaScript(READ_RUNTIME_EVIDENCE)).then(v=>parseRuntimeEvidence(v,build.record.buildId,previousSequence));
 for(let i=0;i<300;i++){try{await packet();break;}catch(e){if(i===299)throw e;await sleep(100);}}
 report.loadMs=await win.webContents.executeJavaScript('performance.now()');
 await win.webContents.executeJavaScript(`(()=>{window.__noobiLongFrames=[];let last=0;function frame(t){if(last&&window.__noobiLongFrames.length<30000)window.__noobiLongFrames.push(t-last);last=t;requestAnimationFrame(frame)}requestAnimationFrame(frame)})()`);
 const input=async s=>{if('key'in s){win.webContents.sendInputEvent({type:'keyDown',keyCode:s.key});try{await sleep(s.holdMs);}finally{if(!win.isDestroyed())win.webContents.sendInputEvent({type:'keyUp',keyCode:s.key});}}else await sleep(s.waitMs);};
 for(const s of policy.initial)await input(s);
 start=performance.now();let step=0,nextSample=0,nextCapture=0;
 while(performance.now()-start < policy.durationSeconds*1000){
  if(interrupted)throw Error('Run interrupted; incomplete duration is not a pass');
  if(report.errors.length)throw Error('Runtime error; see evidence');
  await input(policy.cycle[step++%policy.cycle.length]);
  const elapsed=performance.now()-start;if(elapsed<nextSample)continue;nextSample=elapsed+5000;
  const p=await packet();if(p.engineFrame<=previousFrame)throw Error('Engine frame counter stopped advancing');previousFrame=p.engineFrame;previousSequence=p.sequence;
  if(p.paused || p.state.state==='paused')throw Error('Game paused during continuous active run');
  const timing=await win.webContents.executeJavaScript('({frames:window.__noobiLongFrames.splice(0),focused:document.hasFocus(),visibility:document.visibilityState,width:innerWidth,height:innerHeight})');intervals.push(...timing.frames);
  const previous=report.samples.at(-1);const engineFps=previous?(p.engineFrame-previous.engineFrame)*1000/(elapsed-previous.elapsedMs):null;
  const m=app.getAppMetrics().find(m=>m.pid===win.webContents.getOSProcessId());if(!m?.memory)metricsMissing=true;
  const sample={elapsedMs:elapsed,engineFps,sequence:p.sequence,engineFrame:p.engineFrame,state:p.state,findings:p.findings,rendererWorkingSetMiB:m?.memory?.workingSetSize/1024||null,focused:timing.focused,visibility:timing.visibility,viewport:[timing.width,timing.height]};
  if(p.findings.some(f=>f.severity==='error'))throw Error('Host runtime diagnostic failed');
  report.samples.push(sample);await appendFile(join(out,'samples.jsonl'),JSON.stringify(sample)+'\n');
  if(elapsed>=nextCapture){nextCapture=elapsed+60000;await writeFile(join(out,`frame-${Math.round(elapsed/1000)}.png`),(await bounded(win.webContents.capturePage())).toPNG());console.log('LONG_RUN_PROGRESS',Math.round(elapsed/1000),'/',policy.durationSeconds);}
  await writeFile(join(out,'progress.json'),JSON.stringify({elapsedMs:elapsed,durationSeconds:policy.durationSeconds,build:report.build,errors:report.errors},null,2));
 }
 await store.verifyInputs(build);await store.verifyArtifacts(build);report.completed=true;
 }catch(e){report.errors.push(String(e.message??e));}
 finally{
 report.elapsedMs=start?performance.now()-start:0;report.frames=frameDistribution(intervals,policy.targetFps);
 const mem=report.samples.map(s=>s.rendererWorkingSetMiB).filter(Number.isFinite);
 // Skip startup warmup; report the entire series as well. Includes renderer only, not GPU/OS totals.
 const warm=mem.slice(Math.min(6,Math.floor(mem.length/4)));report.rendererGrowthMiB=warm.length>1?Math.max(0,warm.at(-1)-warm[0]):null;
 report.reliabilityPassed=report.completed && !report.errors.length && report.elapsedMs>=policy.durationSeconds*1000;
 const fps=report.samples.map(s=>s.engineFps).filter(Number.isFinite);report.engineFpsMinimum=fps.length?Math.min(...fps):null;
 report.performancePassed=report.engineFpsMinimum!==null && report.engineFpsMinimum>=policy.targetFps*.85 && report.reliabilityPassed && report.frames.samples>0 && report.frames.p95Ms<=1000/policy.targetFps*1.15 && report.frames.longFrameRatio<=policy.maxLongFrameRatio && !metricsMissing && report.rendererGrowthMiB!==null && report.rendererGrowthMiB<=policy.maxRendererGrowthMiB;
 report.thirtyMinuteCoverage=report.reliabilityPassed && report.elapsedMs>=1800000;report.finishedAt=new Date().toISOString();
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));if(win&&!win.isDestroyed())win.destroy();await server.stopAll();console.log('LONG_RUN_RESULT',out,JSON.stringify({reliability:report.reliabilityPassed,performance:report.performancePassed,thirtyMinutes:report.thirtyMinuteCoverage,errors:report.errors}));app.exit(report.reliabilityPassed?0:1);
 }
}).catch(e=>{console.error(e);app.exit(1)});
