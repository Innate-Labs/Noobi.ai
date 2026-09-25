// Real Three.js export/reload and Godot import; explicit engineering asset, not generated art.
import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AssetStore } from '../dist/main/assetStore.js';
import { ReferenceModel3dService } from '../dist/main/referenceModel3d.js';
import { renderReferenceModel } from '../dist/main/referenceModelRenderer.js';
import { GodotEnvironmentService } from '../dist/main/godotEnvironmentService.js';
const out = resolve('.noobi-private/stage-07/models', new Date().toISOString().replaceAll(':', '-'));
app.setPath('userData', join(out, 'electron')); app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    const root = join(out, 'game'); await mkdir(join(root, 'model-sources'), { recursive: true }); await mkdir(join(root, '.noobi'));
    const assets = new AssetStore(), project = { id: 'contract-fixture', root };
    const [reference] = await assets.importFiles(project.id, root, [resolve('examples/image-threejs/wind-beacon.png')]);
    const art = {version:1,id:'fixture',style:'Engineering only; no fidelity claim',palette:['#88bbaa'],units:'meters',up:'+Y',forward:'-Z',budgets:{triangles:1000,nodes:20,materials:2,textureSize:512}};
    await writeFile(join(root, '.noobi/art-bible.json'), JSON.stringify(art));
    const source = `export function createModel(THREE){
      const root=new THREE.Group();root.name='ActorRoot';
      const body=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial({color:0x88bbaa}));body.name='Body';body.position.y=1;root.add(body);
      const socket=new THREE.Object3D();socket.name='HandSocket';socket.position.set(.4,1.2,0);root.add(socket);
      const clip=new THREE.AnimationClip('bob',1,[new THREE.VectorKeyframeTrack('Body.position',[0,.5,1],[0,1,0,0,1.15,0,0,1,0])]);
      return{root,animations:[clip]};
    }`;
    const sourcePath = 'model-sources/fixture.mjs'; await writeFile(join(root,sourcePath),source);
    const spec = {version:2,referenceImage:reference.relativePath,parts:[{name:'Body',shape:'box',material:'mint'}],criticalFeatures:['engineering rectangle'],inferredSurfaces:[],artBiblePath:'.noobi/art-bible.json',
      game:{dimensions:[1,2,1],tolerance:.1,pivot:{node:'ActorRoot',position:[0,0,0]},sockets:[{id:'hand',node:'HandSocket',position:[.4,1.2,0]}],collision:{kind:'box',purpose:'caller supplies solid collider'}},animation:{mode:'transform',required:['bob']}};
    const specPath=join(root,'model-sources/fixture.spec.json');await writeFile(specPath,JSON.stringify(spec));
    let renderCalls=0;
    const service=new ReferenceModel3dService(assets,join(out,'evidence'),async input=>{renderCalls++;return renderReferenceModel(input)});
    const input={project,kind:'model3d',name:'fixture',prompt:'Engineering measurement check',options:{referenceImage:reference.relativePath,sourcePath}};
    const first=await service.generate(input);const repeated=await service.generate(input);
    assert.equal(first.asset.id,repeated.asset.id);assert.equal(renderCalls,1);
    assert.equal(first.asset.metadata.assemblyCheck,'measured-contract-passed-runtime-pending');
    assert.deepEqual(await service.verify(project,[first.asset]),[]);
    await writeFile(join(out,'result.json'),JSON.stringify(first,null,2));
    await writeFile(specPath,JSON.stringify({...spec,game:{...spec.game,dimensions:[10,2,1]}}));
    await assert.rejects(()=>service.generate(input),/dimensions/);
    await writeFile(specPath,JSON.stringify(spec));
    await writeFile(join(root,sourcePath),source.replace('0,1.15,0','0,1,0'));
    await assert.rejects(()=>service.generate(input),/static/);
    await writeFile(join(root,sourcePath),source);
    // Animation=true cannot relabel rigid-part clips as skeletal data.
    await assert.rejects(()=>service.generate({...input,options:{...input.options,animation:true}}),/skin/i);
    assert.equal((await assets.list(project.id,root)).filter(a=>a.kind==='model3d').length,1);
    await writeFile(join(root,'project.godot'),'[application]\nconfig/name="Model contract engineering fixture"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
    await writeFile(join(root,'verify.gd'),`extends SceneTree
func _initialize():
    var scene = load(${JSON.stringify('res://'+first.asset.relativePath)}).instantiate()
    root.add_child(scene)
    call_deferred("check", scene)
func check(scene):
    var players = scene.find_children("*", "AnimationPlayer", true, false)
    assert(players.size() == 1)
    var player = players[0]
    var clip_name = ""
    for candidate in player.get_animation_list():
        if candidate.ends_with("bob"): clip_name = candidate
    assert(not clip_name.is_empty())
    var body = scene.find_child("Body", true, false)
    var socket = scene.find_child("HandSocket", true, false)
    assert(body != null and socket != null)
    assert(socket.global_position.distance_to(Vector3(0.4,1.2,0)) < 0.02)
    player.play(clip_name)
    player.seek(0.0,true)
    var before = body.position.y
    player.seek(0.5,true)
    assert(body.position.y > before + 0.1)
    print("GODOT_MODEL_CONTRACT_OK animation and socket")
    quit()
`);
    const env=new GodotEnvironmentService({storageFile:join(out,'godot.json')});const status=await env.init();
    const imported=await env.execute({kind:'import',projectPath:root});assert.ok(imported.ok, imported.stderr);
    const checked=await promisify(execFile)(status.tool.binaryPath,['--headless','--path',root,'--script','res://verify.gd'],{timeout:30000,maxBuffer:1024*1024});
    assert.ok(checked.stdout.includes('GODOT_MODEL_CONTRACT_OK'),checked.stderr);assert.ok(!checked.stderr.includes('ERROR'),checked.stderr);
    await writeFile(join(out,'godot.log'),checked.stdout+'\n'+checked.stderr);
    console.log('MODEL_CONTRACT_OK',JSON.stringify({out,renderCalls,asset:first.asset.relativePath}));app.exit(0);
  }catch(error){console.error(error);app.exit(1)}
}).catch(error=>{console.error(error);app.exit(1)});
