// Build the authored assembly fixture through the real frozen-build/export service.
import {app} from 'electron';
import {mkdir,readFile,writeFile,cp,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {ProjectStore} from '../dist/main/projectStore.js';
import {GodotBuildStore} from '../dist/main/production/godotBuildStore.js';
import {GodotEnvironmentService} from '../dist/main/godotEnvironmentService.js';
import {buildGodotCandidate} from '../dist/main/production/godotBuilder.js';
const fixture=JSON.parse(await readFile('.noobi-private/stage-08/assembly-latest.json','utf8'));
const out=resolve('.noobi-private/stage-08/assembly-export',new Date().toISOString().replaceAll(':','-'));
app.setPath('userData',join(out,'electron'));app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{try{
 await mkdir(out,{recursive:true});
 const projects=new ProjectStore(join(out,'projects.json'),join(out,'games'));await projects.init();
 const project=await projects.create({name:'Three-region assembly engineering',idea:'Explicit authored integration, not autonomous generation',engine:'godot',parentDirectory:join(out,'games')});
 const runtimeBinding=JSON.parse(await readFile(join(fixture.out,'runtime-binding.json'),'utf8'));
 const {createHash}=await import('node:crypto');
 for(const [name,sha] of Object.entries(runtimeBinding.files)) assert.equal(createHash('sha256').update(await readFile(join(project.root,name))).digest('hex'),sha,'Formal template matches exercised '+name);
 for(const name of ['data','scenes','scripts','.noobi']) await cp(join(fixture.out,name),join(project.root,name),{recursive:true,filter:path=>!path.endsWith('.import')&&!path.endsWith('.uid')});
 for(const name of ['project.godot','main.tscn'])await copyFile(join(fixture.out,name),join(project.root,name));
 const source=await readFile(join(project.root,'scripts/test.gd'),'utf8');
 // Formal product runtime unchanged; remove only the engineering test harness auto-start.
 await writeFile(join(project.root,'scripts/test.gd'),source.replace('    if not OS.get_cmdline_user_args().has("--noobi-assembly-demo"): call_deferred("run")','    # Interactive export: no automated test runner.'));
 // The pinned untextured model has no UVs or normal maps; preserve its bytes and disable unnecessary tangent generation.
 const glb=await readFile(join(project.root,'scenes/robot.glb'));
 const gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString('utf8').trim());
 assert(gltf.materials.every(m=>!m.normalTexture),'No normal map may depend on generated tangents');
 assert(gltf.meshes.flatMap(m=>m.primitives).every(p=>p.attributes.TEXCOORD_0===undefined),'Explicit untextured fixture only');
 const importConfig=await readFile(join(fixture.out,'scenes/robot.glb.import'),'utf8');
 await writeFile(join(project.root,'scenes/robot.glb.import'),importConfig.replace('meshes/ensure_tangents=true','meshes/ensure_tangents=false'));
 const environment=new GodotEnvironmentService({storageFile:join(out,'godot.json')});await environment.init();
 const store=new GodotBuildStore(join(out,'builds'));
 const build=await buildGodotCandidate({projectId:project.id,projectRoot:project.root,store,environment});
 const report=JSON.parse(await readFile(join(build.root,'..','assembly-check.json'),'utf8'));
 assert(report.ok&&report.regions===3&&report.sourceHash===build.record.sourceHash);
 const result={out,fixture:fixture.out,projectId:project.id,root:project.root,store:store.storageRoot,buildId:build.record.buildId,build:build.record,report};
 await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));
 await writeFile('.noobi-private/stage-08/assembly-export-latest.json',JSON.stringify(result,null,2));
 console.log('ASSEMBLY_EXPORT_OK',out,build.record.buildId);app.exit(0);
}catch(error){console.error(error);await writeFile(join(out,'failure.log'),String(error));app.exit(1)}});
