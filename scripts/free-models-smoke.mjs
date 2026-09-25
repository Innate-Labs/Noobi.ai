// Offline library source checks, independent GLB previews and real Godot import.
import{app}from'electron';import{readFile,writeFile,mkdir}from'node:fs/promises';import{resolve,join}from'node:path';import assert from'node:assert/strict';import{execFile}from'node:child_process';import{promisify}from'node:util';
import{FreeModelLibrary}from'../dist/main/freeModelLibrary.js';import{AssetStore}from'../dist/main/assetStore.js';import{renderReferenceModel}from'../dist/main/referenceModelRenderer.js';import{GodotEnvironmentService}from'../dist/main/godotEnvironmentService.js';
const out=resolve('.noobi-private/stage-07/library',new Date().toISOString().replaceAll(':','-'));app.setPath('userData',join(out,'electron'));app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{try{
await mkdir(out,{recursive:true});const root=join(out,'game');await mkdir(root);const store=new AssetStore(),library=new FreeModelLibrary(store),entries=await library.list(),results=[];
const refresh=process.argv.includes('--refresh-catalog');const previews=refresh?resolve('resources/free-models/previews'):join(out,'previews');await mkdir(previews,{recursive:true});
for(const entry of entries){
 const asset=await library.import({id:'library-smoke',root},entry.id);assert.equal(asset.source,'imported');assert.equal(asset.metadata.license,'CC0-1.0');assert.equal(asset.metadata.mediaGeneration,false);
 const bytes=await readFile(join(root,asset.relativePath));const render=await renderReferenceModel({source:'',reference:Buffer.alloc(0),mimeType:'image/png',animation:false,glb:bytes});
 assert.ok(render.meshes>0);assert.equal(render.skins,0);assert.equal(render.animations.length,0);
 await writeFile(join(previews,entry.id+'.png'),render.views.perspective);
 const inspection=render.inspection;assert.ok(inspection);const dimensions=inspection.bounds.max.map((v,i)=>Number((v-inspection.bounds.min[i]).toFixed(4)));
 results.push({id:entry.id,path:asset.relativePath,sha256:asset.sha256,dimensions,triangles:render.triangles,nodes:inspection.nodeCount});
 if(refresh)Object.assign(entry,{dimensions,triangles:render.triangles,nodes:inspection.nodeCount,preview:'previews/'+entry.id+'.png'});
}
if(refresh)await writeFile(resolve('resources/free-models/catalog.json'),JSON.stringify(entries,null,2)+'\n');
await writeFile(join(root,'project.godot'),'[application]\nconfig/name="CC0 library import test"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
await writeFile(join(root,'verify.gd'),`extends SceneTree
func _initialize():
    var paths = ${JSON.stringify(results.map(r=>'res://'+r.path))}
    var count = 0
    for path in paths:
        var resource = load(path)
        assert(resource is PackedScene)
        var scene = resource.instantiate()
        var meshes = scene.find_children("*", "MeshInstance3D", true, false)
        assert(meshes.size() > 0)
        for mesh in meshes: assert(mesh.mesh != null and mesh.mesh.get_surface_count() > 0)
        scene.free()
        count += 1
    print("FREE_MODELS_GODOT_OK ", count)
    quit()
`);
const env=new GodotEnvironmentService({storageFile:join(out,'godot.json')});const status=await env.init();const imported=await env.execute({kind:'import',projectPath:root});assert.ok(imported.ok,imported.stderr);
const checked=await promisify(execFile)(status.tool.binaryPath,['--headless','--path',root,'--script','res://verify.gd'],{timeout:30000,maxBuffer:1024*1024});assert.ok(checked.stdout.includes('FREE_MODELS_GODOT_OK'),checked.stderr);assert.ok(!checked.stderr.includes('ERROR'),checked.stderr);
await writeFile(join(out,'results.json'),JSON.stringify({entries:results,godot:checked.stdout,passed:true},null,2));console.log('FREE_MODELS_OK',out,results.length);app.exit(0);
}catch(error){console.error(error);app.exit(1)}}).catch(e=>{console.error(e);app.exit(1)});
