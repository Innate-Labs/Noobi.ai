import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { exportGameMac } from '../dist/main/production/gameMacExport.js';
import { GodotBuildStore } from '../dist/main/production/godotBuildStore.js';
const input=JSON.parse(await readFile('.noobi-private/game-ui/latest-build.json','utf8'));
const store=new GodotBuildStore(input.store), build=await store.get(input.projectId,input.buildId);
const out=resolve('.noobi-private/stage-10/mac-service',new Date().toISOString().replaceAll(':','-'));await mkdir(out,{recursive:true});
const base={root:build.root,destinationParent:out,versionId:'legacy-'+build.record.buildId,projectId:input.projectId,title:'Native export engineering fixture',status:'legacy',binding:{buildId:build.record.buildId,sourceHash:build.record.sourceHash,artifactHash:build.record.artifactHash},enginePath:'/opt/homebrew/bin/godot',expectedEngineVersion:build.record.engineVersion};
let checks=0;const verify=async()=>{checks++;await store.verifyInputs(build);await store.verifyArtifacts(build)};
const result=await exportGameMac({...base,verify});assert.equal(checks,2);
const manifest=JSON.parse(await readFile(join(result.path,'manifest.json'),'utf8'));assert.equal(manifest.validation.nativeGameplay,'not-assessed');assert.ok(manifest.files.some(f=>f.path.endsWith('.pck')));assert.ok(manifest.files.some(f=>f.path.endsWith('OFL.txt')));
// A source verification failure immediately before publication must leave only the previous successful package.
let calls=0;await assert.rejects(exportGameMac({...base,verify:async()=>{await verify();if(++calls===2)throw Error('simulated frozen-source mismatch')}}),/frozen-source mismatch/);
assert.deepEqual((await readdir(out)).sort(),[result.path.split('/').at(-1)]);
await writeFile(join(out,'result.json'),JSON.stringify({result,source:base.binding,passed:true,lateMutationRejected:true,nativeGameplay:'not-assessed'},null,2));
await writeFile('.noobi-private/stage-10/mac-service-latest.json',JSON.stringify({out,result,buildId:input.buildId,projectId:input.projectId},null,2));console.log(JSON.stringify({out,result,passed:true}));
