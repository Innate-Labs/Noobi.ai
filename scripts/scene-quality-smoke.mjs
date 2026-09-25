import {app,BrowserWindow} from 'electron';
import {mkdtempSync} from 'node:fs';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {build as bundle} from 'esbuild';
import {createSceneFixture} from './scene-quality-fixture.mjs';
import {ProjectStore} from '../dist/main/projectStore.js';
import {GodotEnvironmentService} from '../dist/main/godotEnvironmentService.js';
import {GodotBuildStore} from '../dist/main/production/godotBuildStore.js';
import {buildGodotCandidate} from '../dist/main/production/godotBuilder.js';
import {installGodotRuntimeProbe} from '../dist/main/runtime/godotRuntimeProbe.js';
import {PreviewServer} from '../dist/main/previewServer.js';
import {parseRuntimeEvidence,READ_RUNTIME_EVIDENCE} from '../dist/main/runtime/runtimeEvidence.js';
import {evaluateSceneQuality,parseSceneQuality} from '../dist/main/quality/sceneQuality.js';
const temporary=mkdtempSync(join(tmpdir(),'noobi-scene-smoke-'));
app.setPath('userData',join(temporary,'electron'));app.on('window-all-closed',()=>{});
const pause=ms=>new Promise(r=>setTimeout(r,ms));const exec=promisify(execFile);
app.whenReady().then(run).catch(e=>{console.error(e);app.exit(1)});
async function run(){
  const out=resolve('.noobi-private/platform-scene-quality');await mkdir(out,{recursive:true});
  let window;let panel;const previews=new PreviewServer();
  try{
    const environment=new GodotEnvironmentService({storageFile:join(temporary,'godot.json')});const engine=await environment.init();
    assert.ok(engine.canExportProjects,engine.tool.message);
    const projects=new ProjectStore(join(temporary,'projects.json'),join(temporary,'games'));await projects.init();
    const project=await projects.create({name:'3D scene engineering fixture',idea:'Isolated scene input validation',engine:'godot',parentDirectory:join(temporary,'games')});
    const contract=parseSceneQuality(await createSceneFixture(project.root));
    const builds=new GodotBuildStore(join(temporary,'builds'));
    const frozen=await buildGodotCandidate({projectId:project.id,projectRoot:project.root,store:builds,environment});
    console.log('Frozen Godot fixture exported',frozen.record.buildId);
    const url=await previews.start(project.id,frozen.root,{directory:'build/web',sourceFallback:false,sourceAssetOverlay:false,hideGodotSplash:true});
    window=new BrowserWindow({show:false,width:1000,height:730,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    const errors=[];window.webContents.on('console-message',(event)=>{if(/SCRIPT ERROR|Parse Error|WebGL.*error/.test(event.message)) errors.push(event.message)});
    await window.loadURL(url);window.webContents.focus();
    let packet;
    for(let n=0;n<200;n++){try{packet=parseRuntimeEvidence(await window.webContents.executeJavaScript(READ_RUNTIME_EVIDENCE),frozen.record.buildId);break}catch{}await pause(100)}
    assert.ok(packet,'Godot runtime did not start');assert.equal(packet.scene3d.truncated,false);
    window.webContents.sendInputEvent({type:'mouseDown',button:'left',x:500,y:350,clickCount:1});
    window.webContents.sendInputEvent({type:'mouseUp',button:'left',x:500,y:350,clickCount:1});
    const evidence=[];const journey=[];
    const input=async (id,key,duration,action)=>{
      const before=parseRuntimeEvidence(await window.webContents.executeJavaScript(READ_RUNTIME_EVIDENCE),frozen.record.buildId);
      window.webContents.sendInputEvent({type:'keyDown',keyCode:key});await pause(duration);await pause(350);
      const after=parseRuntimeEvidence(await window.webContents.executeJavaScript(READ_RUNTIME_EVIDENCE),frozen.record.buildId,before.sequence+1);
      if(action==='move'){const pos=p=>p.scene3d.nodes.find(n=>n.path==='Player').position;assert.notDeepEqual(pos(before),pos(after),'Real key did not move player')}
      if(action==='primary')assert.equal(after.state.collected,before.state.collected+1);
      const screenshotPath=join(out,`${id}.png`);await writeFile(screenshotPath,(await window.webContents.capturePage()).toPNG());
      window.webContents.sendInputEvent({type:'keyUp',keyCode:key});
      evidence.push({stepId:id,packet:after});journey.push({id,action,screenshotPath,observations:[{status:'pass',description:'Actual Electron input verified against runtime state'}]});
    };
    await input('move-a','Right',350,'move');await input('move-b','Left',500,'move');await input('blocked','Up',1300,'move');await input('use','Space',80,'primary');
    assert.equal(errors.length,0,errors.join('\n'));
    const report={build:{buildId:frozen.record.buildId,sourceHash:frozen.record.sourceHash,artifactHash:frozen.record.artifactHash,testSuiteVersion:frozen.record.testSuiteVersion},journey,runtimeEvidence:evidence,reportPath:'artifacts/playtest/latest/report.json'};
    await writeFile(join(out,'runtime-evidence.json'),JSON.stringify(report,null,2));
    const summary=evaluateSceneQuality(contract,report);assert.equal(summary.status,'pass',summary.findings.join('\n'));
    assert.equal(summary.observedGeometry,4);assert.equal(evidence[0].packet.scene3d.nodes.find(n=>n.path==='Foliage').instances,6);
    await writeFile(join(out,'runtime-evidence.json'),JSON.stringify(report,null,2));await writeFile(join(out,'scene-quality.json'),JSON.stringify(summary,null,2));
    console.log('Actual browser input, collision contact, MultiMesh and scene coverage passed');
    const faults=[];
    for(const kind of ['extra','missingCollision','overflow']){
      const root=join(temporary,kind);await createSceneFixture(root,{[kind]:true});await installGodotRuntimeProbe(root,kind);
      await exec(engine.tool.binaryPath,['--headless','--path',root,'--editor','--import'],{timeout:60000,maxBuffer:4000000});
      const run=await exec(engine.tool.binaryPath,['--headless','--path',root,'--quit-after','60'],{timeout:60000,maxBuffer:4000000});
      assert.doesNotMatch(run.stderr,/SCRIPT ERROR|Parse Error/);
      const line=run.stdout.split('\n').filter(l=>l.startsWith('NOOBI_RUNTIME ')).at(-1);assert.ok(line);
      const observed=JSON.parse(line.slice('NOOBI_RUNTIME '.length));
      const faultReport={...report,build:{...report.build,buildId:kind},runtimeEvidence:journey.map(s=>({stepId:s.id,packet:observed}))};
      const failure=evaluateSceneQuality(contract,faultReport);
      const expected=kind==='extra'?'UnregisteredRock':kind==='missingCollision'?'gate: 缺少启用':'采样缺失或超限';
      assert.match(failure.findings.join('\n'),new RegExp(expected));faults.push({kind,summary:failure});
      await writeFile(join(out,`${kind}-runtime.json`),JSON.stringify(observed,null,2));
    }
    await writeFile(join(out,'fault-results.json'),JSON.stringify(faults,null,2));
    // Render the production panel with the actual measured result and an actual fault.
    await bundle({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SceneQualityPanel}from'./src/renderer/components/SceneQualityPanel';import'./src/renderer/styles.css';createRoot(document.getElementById('root')).render(<main style={{padding:20,maxWidth:880,margin:'auto'}}><SceneQualityPanel report={${JSON.stringify(summary)}}/><SceneQualityPanel report={${JSON.stringify(faults[0].summary)}}/></main>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,jsx:'automatic',outfile:join(temporary,'panel.js'),loader:{'.woff2':'dataurl','.woff':'dataurl','.png':'dataurl'},define:{'process.env.NODE_ENV':'"production"'}});
    await writeFile(join(temporary,'panel.html'),'<meta charset="utf-8"><link rel="stylesheet" href="panel.css"><div id="root"></div><script src="panel.js"></script>');
    panel=new BrowserWindow({show:false,width:1040,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false}});await panel.loadFile(join(temporary,'panel.html'));await pause(200);
    const content=await panel.webContents.executeJavaScript('document.body.innerText');assert.match(content,/自动核对通过/);assert.match(content,/需要补齐/);assert.match(content,/UnregisteredRock/);
    await writeFile(join(out,'quality-panel.png'),(await panel.webContents.capturePage()).toPNG());panel.setSize(390,820);await pause(150);
    assert.equal(await panel.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth'),true);
    await writeFile(join(out,'quality-panel-narrow.png'),(await panel.webContents.capturePage()).toPNG());
    await writeFile(join(out,'smoke-result.json'),JSON.stringify({ok:true,engine:engine.tool.version,build:report.build,actualBrowserInput:true,actualGodotFaults:faults.map(f=>f.kind),modelCalls:0,userGameWrites:0,aestheticAcceptance:false},null,2));
    console.log('SCENE_QUALITY_SMOKE_OK');
  }catch(e){console.error(e);process.exitCode=1}
  finally{for(const w of [window,panel])if(w&&!w.isDestroyed()){await w.webContents.session.closeAllConnections();w.destroy()}await previews.stopAll();await pause(300);await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:150});app.exit(process.exitCode||0)}
}
