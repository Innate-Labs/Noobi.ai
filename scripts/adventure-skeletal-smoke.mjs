// CC0 third-party character integration, not autonomous generation or reference-style approval.
import { mkdir, writeFile, readFile, copyFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { GAME_UI_KIT } from '../dist/main/runtime/gameUiKit.js';
import { CHECKPOINT_KIT } from '../dist/main/runtime/checkpointKit.js';
import { ADVENTURE_KIT_FILES } from '../dist/main/runtime/adventureKit.js';
const out=resolve('.noobi-private/stage-07/skeletal',new Date().toISOString().replaceAll(':','-'));
await mkdir(out,{recursive:true});
const url='https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/models/gltf/RobotExpressive/RobotExpressive.glb';
const hash='047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319';
const cache=resolve('.noobi-private/stage-07/skeletal-source/RobotExpressive.glb');
let glb;try{glb=await readFile(cache)}catch{const response=await fetch(url);assert(response.ok);glb=Buffer.from(await response.arrayBuffer())}
assert.equal(createHash('sha256').update(glb).digest('hex'),hash,'pinned asset bytes');
await writeFile(join(out,'RobotExpressive.glb'),glb);
const binding={};
for(const [name,code] of Object.entries({...ADVENTURE_KIT_FILES,'runtime/noobi/ui_v1.gd':GAME_UI_KIT,'runtime/noobi/checkpoint_v1.gd':CHECKPOINT_KIT})){await mkdir(join(out,name,'..'),{recursive:true});await writeFile(join(out,name),code);binding[name]=createHash('sha256').update(code).digest('hex')}
await cp('resources/game-fonts',join(out,'runtime/noobi/fonts'),{recursive:true});
await writeFile(join(out,'runtime-binding.json'),JSON.stringify(binding,null,2));
await writeFile(join(out,'asset-source.json'),JSON.stringify({url,sha256:hash,author:'Tomás Laulhé / Quaternius; three.js conversion by Don McCurdy',license:'CC0-1.0',licenseEvidence:'https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/models/gltf/RobotExpressive/README.md',scope:'Unmodified third-party GLB. Explicit fixture-only fall/hurt clips authored after import; not an autonomous game.'},null,2));
await copyFile('scripts/fixtures/adventure-skeletal.gd',join(out,'main.gd'));
await writeFile(join(out,'project.godot'),'[application]\nconfig/name="Noobi skeletal integration fixture"\nconfig/use_custom_user_dir=true\nconfig/custom_user_dir_name="Noobi-rig-demo"\nrun/main_scene="res://main.tscn"\n[display]\nwindow/size/viewport_width=960\nwindow/size/viewport_height=720\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nenvironment/defaults/default_clear_color=Color(0.055,0.075,0.11,1)\n');
await writeFile(join(out,'main.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Fixture" type="Node3D"]\nscript=ExtResource("1")\n');
const exec=promisify(execFile);
try{
 const i=await exec('/opt/homebrew/bin/godot',['--headless','--path',out,'--editor','--import'],{timeout:60000,maxBuffer:4*1024*1024});await writeFile(join(out,'import.log'),i.stdout+'\n'+i.stderr);
 const r=await exec('/opt/homebrew/bin/godot',['--path',out],{timeout:60000,maxBuffer:4*1024*1024});await writeFile(join(out,'run.log'),r.stdout+'\n'+r.stderr);
 assert(r.stdout.includes('SKELETAL_OK'));assert(!/SCRIPT ERROR|SKELETAL_FAILURE/.test(r.stdout+r.stderr));
 const report=JSON.parse(await readFile(join(out,'report.json'),'utf8'));assert(report.passed);
 await writeFile('.noobi-private/stage-07/skeletal-latest.json',JSON.stringify({out},null,2));
 console.log('SKELETAL_OK',report.checks.length,out);
 console.log('Interactive: godot --path '+JSON.stringify(out)+' -- --noobi-rig-demo --noobi-native-probe');
}catch(e){await writeFile(join(out,'failure.log'),String(e)+'\n'+(e.stdout??'')+'\n'+(e.stderr??''));throw e}
