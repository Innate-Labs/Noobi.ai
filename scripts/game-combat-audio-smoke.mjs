// A separate authored fixture built on the previously verified assembly scene; not an autonomous game.
import {mkdir,readFile,writeFile,cp,copyFile} from 'node:fs/promises';
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
const base=JSON.parse(await readFile('.noobi-private/stage-08/assembly-latest.json','utf8'));
const out=resolve('.noobi-private/stage-08/combat-audio',new Date().toISOString().replaceAll(':','-'));await mkdir(out,{recursive:true});
for(const name of ['data','scenes','scripts','.noobi'])await cp(join(base.out,name),join(out,name),{recursive:true,filter:p=>!p.endsWith('.import')&&!p.endsWith('.uid')});
for(const name of ['project.godot','main.tscn'])await copyFile(join(base.out,name),join(out,name));
await writeFile(join(out,'project.godot'),(await readFile(join(out,'project.godot'),'utf8')).replaceAll('Noobi-assembly-engineering','Noobi-combat-audio-engineering'));
const files={...ADVENTURE_KIT_FILES,'runtime/noobi/game_assembly_v1.gd':GAME_ASSEMBLY_KIT,'runtime/noobi/audio_v1.gd':GAME_AUDIO_KIT,'runtime/noobi/ui_v1.gd':GAME_UI_KIT,'runtime/noobi/checkpoint_v1.gd':CHECKPOINT_KIT,'runtime/noobi/progression_v1.gd':PROGRESSION_KIT};
for(const [name,content] of Object.entries(files)){await mkdir(join(out,name,'..'),{recursive:true});await writeFile(join(out,name),content)}
await cp('resources/game-fonts',join(out,'runtime/noobi/fonts'),{recursive:true});
const manifest=JSON.parse(await readFile(join(out,'data/game-assembly.json'),'utf8'));
const definition=JSON.parse(await readFile(join(out,'data/progression.json'),'utf8'));
manifest.gameId='combat-audio-engineering';manifest.title='战斗与音频装配验证';manifest.controls='WASD 移动 · F 攻击 · E 交互 · Esc 暂停';
definition.quests.splice(1,0,{id:'camp-guard',region:'camp',requires:{quests:['camp-key'],abilities:[],items:{}},reward:{items:{},abilities:[]}});
definition.links[0].requires.quests.push('camp-guard');manifest.regions.camp.quests['camp-guard']={node:'Guard',kind:'defeat'};manifest.labels.quests['camp-guard']='击败营地守卫';
const catalog=JSON.parse(await readFile('resources/free-audio/catalog.json','utf8'));
await mkdir(join(out,'assets/audio'),{recursive:true});
const chosen=['exploration.ogg','happy-adventure.mp3','pickup.ogg','door-open.ogg','swing.ogg','ui-error.ogg','ui-confirm.ogg'];
const provenance=[];
for(const f of chosen){const bytes=await readFile('resources/free-audio/'+f);const entry=catalog.find(x=>x.file===f);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);await writeFile(join(out,'assets/audio',f),bytes);provenance.push(entry)}
await writeFile(join(out,'assets/audio/licenses.json'),JSON.stringify(provenance,null,2));
manifest.audio={regions:{camp:'assets/audio/exploration.ogg',ruins:'assets/audio/happy-adventure.mp3',summit:'assets/audio/exploration.ogg'},effects:{quest:'assets/audio/pickup.ogg',travel:'assets/audio/door-open.ogg',hit:'assets/audio/swing.ogg',hurt:'assets/audio/ui-error.ogg',victory:'assets/audio/ui-confirm.ogg',failure:'assets/audio/ui-error.ogg'},fadeSeconds:0.7};
await writeFile(join(out,'data/game-assembly.json'),JSON.stringify(manifest,null,2));await writeFile(join(out,'data/progression.json'),JSON.stringify(definition,null,2));
let scene=await readFile(join(out,'scenes/camp.tscn'),'utf8');scene=scene.replace('load_steps=7','load_steps=11').replace('[sub_resource type="BoxShape3D" id="floor"]','[ext_resource type="Script" path="res://runtime/noobi/enemy_v1.gd" id="enemy"]\n[sub_resource type="BoxShape3D" id="floor"]');
scene=scene.replace('[node name="camp"',`[sub_resource type="CapsuleShape3D" id="enemy_shape"]
height=1.4
radius=0.35
[sub_resource type="CapsuleMesh" id="enemy_mesh"]
height=1.4
radius=0.35
[sub_resource type="StandardMaterial3D" id="enemy_mat"]
albedo_color=Color(0.8,0.25,0.18,1)
[node name="camp"`);
scene=scene.replace('position=Vector3(0,0.4,-2.3)','position=Vector3(0,0.4,-3.8)');
scene+=`[node name="Guard" type="CharacterBody3D" parent="."]
position=Vector3(0,0.03,-2)
script=ExtResource("enemy")
max_health=2
speed=0.0
detection_distance=3.0
attack_distance=1.2
windup_time=1.5
[node name="Collider" type="CollisionShape3D" parent="Guard"]
position=Vector3(0,0.7,0)
shape=SubResource("enemy_shape")
[node name="Visual" type="MeshInstance3D" parent="Guard"]
position=Vector3(0,0.7,0)
mesh=SubResource("enemy_mesh")
material_override=SubResource("enemy_mat")
`;
await writeFile(join(out,'scenes/camp.tscn'),scene);
let player=await readFile(join(out,'scripts/player.gd'),'utf8');player=player.replace('var driver = Adapter.new()','var driver = Adapter.new()\nvar melee = preload("res://runtime/noobi/melee_v1.gd").new()');player=player.replace('    super._ready()','    max_health = 5\n    super._ready()\n    melee.actor = self\n    melee.windup_time = 0.2\n    add_child(melee)');player=player.replace('    driver.player = player','    driver.player = player\n    driver.melee = melee').replace('"dead":"Death"','"dead":"Death","attack":"Punch"');await writeFile(join(out,'scripts/player.gd'),player);
await copyFile(join(out,'scripts/test.gd'),join(out,'scripts/base-test.gd'));await copyFile('scripts/fixtures/game-combat-audio-test.gd',join(out,'scripts/test.gd'));
// Known untextured CC0 fixture only: no generated tangents are needed. Source model unchanged.
const config=await readFile(join(base.out,'scenes/robot.glb.import'),'utf8');await writeFile(join(out,'scenes/robot.glb.import'),config.replace('meshes/ensure_tangents=true','meshes/ensure_tangents=false'));
const original=JSON.parse(await readFile(join(base.out,'runtime-binding.json'),'utf8'));
await writeFile(join(out,'runtime-binding.json'),JSON.stringify({...original,files:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')])),audio:provenance},null,2));
await writeFile(join(out,'host-check.json'),JSON.stringify(await checkGameAssembly(out),null,2));
const exec=promisify(execFile);
try{
 const i=await exec('/opt/homebrew/bin/godot',['--headless','--path',out,'--editor','--import'],{timeout:60000,maxBuffer:4e6});await writeFile(join(out,'import.log'),i.stdout+'\n'+i.stderr);assert(!/SCRIPT ERROR|ERROR:/u.test(i.stdout+i.stderr));
 const r=await exec('/opt/homebrew/bin/godot',['--path',out],{timeout:60000,maxBuffer:4e6});await writeFile(join(out,'run.log'),r.stdout+'\n'+r.stderr);assert(r.stdout.includes('COMBAT_AUDIO_OK'));assert(!/SCRIPT ERROR|ERROR:/u.test(r.stdout+r.stderr));
 await writeFile('.noobi-private/stage-08/combat-audio-latest.json',JSON.stringify({out},null,2));console.log('COMBAT_AUDIO_OK',out);
}catch(e){await writeFile(join(out,'failure.log'),String(e)+'\n'+(e.stdout??'')+'\n'+(e.stderr??''));throw e}
