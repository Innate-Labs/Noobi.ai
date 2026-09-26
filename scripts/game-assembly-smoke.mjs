// Formal optional assembly, authored three-region engineering fixture; no autonomous generation.
import {mkdir,writeFile,readFile,cp,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {ADVENTURE_KIT_FILES} from '../dist/main/runtime/adventureKit.js';
import {GAME_ASSEMBLY_KIT} from '../dist/main/runtime/gameAssemblyKit.js';
import {GAME_AUDIO_KIT} from '../dist/main/runtime/gameAudioKit.js';
import {GAME_UI_KIT} from '../dist/main/runtime/gameUiKit.js';
import {CHECKPOINT_KIT} from '../dist/main/runtime/checkpointKit.js';
import {PROGRESSION_KIT} from '../dist/main/runtime/progressionKit.js';
import {checkGameAssembly} from '../dist/main/production/gameAssembly.js';
const out=resolve('.noobi-private/stage-08/assembly',new Date().toISOString().replaceAll(':','-'));await mkdir(out,{recursive:true});
const files={...ADVENTURE_KIT_FILES,'runtime/noobi/game_assembly_v1.gd':GAME_ASSEMBLY_KIT,'runtime/noobi/audio_v1.gd':GAME_AUDIO_KIT,'runtime/noobi/ui_v1.gd':GAME_UI_KIT,'runtime/noobi/checkpoint_v1.gd':CHECKPOINT_KIT,'runtime/noobi/progression_v1.gd':PROGRESSION_KIT};
for(const [name,content] of Object.entries(files)){await mkdir(join(out,name,'..'),{recursive:true});await writeFile(join(out,name),content)}
await cp('resources/game-fonts',join(out,'runtime/noobi/fonts'),{recursive:true});
await mkdir(join(out,'data'));await mkdir(join(out,'scenes'));await mkdir(join(out,'scripts'));await mkdir(join(out,'.noobi'));
const definition=JSON.parse(await readFile('examples/progression/three-regions.json','utf8'));
// Isolate route checkpoints; abilities are logically granted but no traversal ability is falsely claimed.
const colors={background:'#182434',surface:'#25384a',text:'#fff8e7',accent:'#ffd172',accentText:'#17202a',border:'#7592aa',success:'#86d5ac'};
const art=JSON.stringify({version:1,id:'assembly-engineering',style:'Muted blue and gold engineering scene, not reference-match proof',palette:Object.values(colors),units:'meters',up:'+Y',forward:'-Z',budgets:{triangles:50000,nodes:512,materials:16,textureSize:2048}},null,2);
const manifest={version:1,gameId:'assembly-engineering',contentVersion:1,title:'三区域装配验证',subtitle:'工程场景 · 真实交互与进度 · 非自主生成成品',controls:'WASD 移动 · 空格跳跃 · E 交互 · Esc 暂停',playerScene:'scenes/player.tscn',regions:{},labels:{regions:{camp:'营地',ruins:'遗迹',summit:'峰顶'},quests:{'camp-key':'取得营地钥匙','ruins-glide':'启动遗迹装置',finale:'完成峰顶目标'},items:{key:'通路钥匙',gem:'能源结晶'},abilities:{dash:'冲刺权限',glide:'滑翔权限'}},style:{artBibleId:'assembly-engineering',artBibleHash:createHash('sha256').update(art).digest('hex'),references:[],colors}};
for(const region of definition.regions){const quests=definition.quests.filter(q=>q.region===region);const exits=definition.links.filter(e=>e.from===region||(e.bidirectional&&e.to===region));manifest.regions[region]={scene:`scenes/${region}.tscn`,spawn:'Spawn',quests:Object.fromEntries(quests.map(q=>[q.id,{node:'Objective',kind:'interact'}])),exits:Object.fromEntries(exits.map(e=>[e.id,e.from===region?'Exit':'Return']))};
 let scene=`[gd_scene load_steps=7 format=3]\n[ext_resource type="Script" path="res://runtime/noobi/interactable_v1.gd" id="1"]\n[sub_resource type="BoxShape3D" id="floor"]\nsize=Vector3(8,0.2,10)\n[sub_resource type="BoxMesh" id="floor_mesh"]\nsize=Vector3(8,0.2,10)\n[sub_resource type="StandardMaterial3D" id="floor_mat"]\nalbedo_color=Color(0.145,0.22,0.29,1)\n[sub_resource type="BoxMesh" id="object_mesh"]\nsize=Vector3(0.5,0.8,0.5)\n[sub_resource type="SphereShape3D" id="trigger"]\nradius=0.5\n[node name="${region}" type="Node3D"]\n[node name="Spawn" type="Marker3D" parent="."]\nposition=Vector3(0,0.03,2.4)\n[node name="Floor" type="StaticBody3D" parent="."]\nposition=Vector3(0,-0.1,0)\n[node name="Collision" type="CollisionShape3D" parent="Floor"]\nshape=SubResource("floor")\n[node name="Mesh" type="MeshInstance3D" parent="Floor"]\nmesh=SubResource("floor_mesh")\nmaterial_override=SubResource("floor_mat")\n`;
 const interact=(name,z,x=0)=>`[node name="${name}" type="Area3D" parent="."]\nposition=Vector3(${x},0.4,${z})\nscript=ExtResource("1")\ninteraction_id="${name}"\nprompt="${name==='Objective'?manifest.labels.quests[quests[0].id]:'通往另一区域'}"\nmax_distance=1.6\n[node name="Shape" type="CollisionShape3D" parent="${name}"]\nshape=SubResource("trigger")\n[node name="Mesh" type="MeshInstance3D" parent="${name}"]\nmesh=SubResource("object_mesh")\n`;
 scene+=interact('Objective',0);
 if(exits.some(e=>e.from===region))scene+=interact('Exit',-2.3);
 if(exits.some(e=>e.to===region))scene+=interact('Return',2.4,2.8);
 await writeFile(join(out,`scenes/${region}.tscn`),scene);
}
await writeFile(join(out,'data/progression.json'),JSON.stringify(definition,null,2));await writeFile(join(out,'data/game-assembly.json'),JSON.stringify(manifest,null,2));await writeFile(join(out,'.noobi/art-bible.json'),art);
// Use the same unmodified CC0 real skeleton used in the prior integration, with explicit fixture poses.
const glb=await readFile('.noobi-private/stage-07/skeletal-source/RobotExpressive.glb');assert.equal(createHash('sha256').update(glb).digest('hex'),'047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319');await writeFile(join(out,'scenes/robot.glb'),glb);
await copyFile('scripts/fixtures/assembly-player.gd',join(out,'scripts/player.gd'));
await writeFile(join(out,'scenes/player.tscn'),`[gd_scene load_steps=5 format=3]
[ext_resource type="Script" path="res://scripts/player.gd" id="1"]
[ext_resource type="PackedScene" path="res://scenes/robot.glb" id="2"]
[ext_resource type="Script" path="res://runtime/noobi/interactor_v1.gd" id="3"]
[sub_resource type="CapsuleShape3D" id="capsule"]
height=1.8
radius=0.33
[node name="Player" type="CharacterBody3D" node_paths=PackedStringArray("visual")]
script=ExtResource("1")
visual=NodePath("Visual")
[node name="Shape" type="CollisionShape3D" parent="."]
position=Vector3(0,0.9,0)
shape=SubResource("capsule")
[node name="Visual" type="Node3D" parent="."]
[node name="Robot" parent="Visual" instance=ExtResource("2")]
scale=Vector3(0.36,0.36,0.36)
rotation=Vector3(0,3.141593,0)
[node name="Interactor" type="Node" parent="." node_paths=PackedStringArray("actor")]
script=ExtResource("3")
actor=NodePath("..")
`);
await writeFile(join(out,'project.godot'),`[application]\nconfig/name="Noobi assembly engineering"\nconfig/use_custom_user_dir=true\nconfig/custom_user_dir_name="Noobi-assembly-engineering"\nrun/main_scene="res://main.tscn"\n[display]\nwindow/size/viewport_width=960\nwindow/size/viewport_height=720\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n`);
await writeFile(join(out,'main.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://scripts/test.gd" id="1"]\n[node name="Assembly" type="Node3D"]\nscript=ExtResource("1")\n');
await copyFile('scripts/fixtures/game-assembly-test.gd',join(out,'scripts/test.gd'));
await writeFile(join(out,'runtime-binding.json'),JSON.stringify({files:Object.fromEntries(Object.entries(files).map(([name,content])=>[name,createHash('sha256').update(content).digest('hex')])),character:{source:'https://github.com/mrdoob/three.js/tree/r185/examples/models/gltf/RobotExpressive',license:'CC0',sha256:createHash('sha256').update(glb).digest('hex'),fixturePoses:['FallPose sampled from Jump','HurtPose explicitly authored']},scope:'Authored engineering fixture; no reference-image fidelity or autonomous game acceptance'},null,2));
const report=await checkGameAssembly(out);await writeFile(join(out,'host-check.json'),JSON.stringify(report,null,2));
const exec=promisify(execFile);
try{const i=await exec('/opt/homebrew/bin/godot',['--headless','--path',out,'--editor','--import'],{timeout:60000,maxBuffer:4e6});await writeFile(join(out,'import.log'),i.stdout+'\n'+i.stderr);assert(!/SCRIPT ERROR|Parse Error/.test(i.stdout+i.stderr),'Import scripts must parse');
const r=await exec('/opt/homebrew/bin/godot',['--path',out],{timeout:60000,maxBuffer:4e6});await writeFile(join(out,'run.log'),r.stdout+'\n'+r.stderr);assert(r.stdout.includes('ASSEMBLY_OK'));assert(!/SCRIPT ERROR|ASSEMBLY_FAILURE/.test(r.stdout+r.stderr));
await writeFile('.noobi-private/stage-08/assembly-latest.json',JSON.stringify({out},null,2));console.log('ASSEMBLY_OK',out);
}catch(e){await writeFile(join(out,'failure.log'),String(e)+'\n'+(e.stdout??'')+'\n'+(e.stderr??''));throw e}
