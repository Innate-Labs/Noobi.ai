// Explicit engineering fixture: integrate the shipped UI and audio runtime without touching generated games.
import { app } from 'electron';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { ProjectStore } from '../dist/main/projectStore.js';
import { GodotBuildStore } from '../dist/main/production/godotBuildStore.js';
import { GodotEnvironmentService } from '../dist/main/godotEnvironmentService.js';
import { buildGodotCandidate } from '../dist/main/production/godotBuilder.js';
import { createGameUiFixture } from './game-ui-fixture.mjs';
const out=resolve('.noobi-private/stage-07/browser-audio',new Date().toISOString().replaceAll(':','-'));
app.setPath('userData',join(out,'electron')); app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{try {
 await mkdir(out,{recursive:true});
 const projects=new ProjectStore(join(out,'projects.json'),join(out,'games')); await projects.init();
 const project=await projects.create({name:'Browser audio engineering fixture',idea:'Audio UI integration only, not autonomous content',engine:'godot',parentDirectory:join(out,'games')});
 await createGameUiFixture(project.root);
 const catalog=JSON.parse(await readFile('resources/free-audio/catalog.json','utf8'));
 await mkdir(join(project.root,'assets/audio'),{recursive:true});
 for(const file of ['exploration.ogg','happy-adventure.mp3','pickup.ogg']) {
  const bytes=await readFile('resources/free-audio/'+file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),catalog.find(x=>x.file===file).sha256);
  await copyFile('resources/free-audio/'+file,join(project.root,'assets/audio',file));
 }
 let source=await readFile(join(project.root,'scripts/main.gd'),'utf8');
 source=source.replace('var ui =',`var audio = preload("res://runtime/noobi/audio_v1.gd").new()
var music = preload("res://assets/audio/exploration.ogg")
var second = preload("res://assets/audio/happy-adventure.mp3")
var effect = preload("res://assets/audio/pickup.ogg")
var ui =`);
 source=source.replace('    add_child(ui)',`    add_child(ui)
    audio.name = "GameAudio"
    add_child(audio)
    pickup.activated.connect(func(_actor): audio.play_effect(effect); audio.set_music(second, 0.5))`);
 source=source.replace('        _restart()\n        return {"ok": true}','        _restart()\n        audio.stop_all()\n        audio.set_music(music, 0.0, true)\n        return {"ok": true}');
 source=source.replace('    if action == "title":\n        state', '    if action == "title":\n        audio.stop_all()\n        state');
 source+=`\n# Test-only real keyboard action to exercise menu effects with the shipped settings UI.
func _input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and not event.echo and event.physical_keycode == KEY_F7:
        audio.play_effect(effect, true, -6.0)
`;
 await writeFile(join(project.root,'scripts/main.gd'),source);
 const environment=new GodotEnvironmentService({storageFile:join(out,'godot.json')});await environment.init();
 const store=new GodotBuildStore(join(out,'builds'));
 const build=await buildGodotCandidate({projectId:project.id,projectRoot:project.root,store,environment});
 const result={out,store:store.storageRoot,projectId:project.id,root:project.root,buildId:build.record.buildId,build:build.record};
 await writeFile(join(out,'build.json'),JSON.stringify(result,null,2));
 await writeFile('.noobi-private/stage-07/browser-audio-latest.json',JSON.stringify(result,null,2));
 console.log('AUDIO_BROWSER_BUILD_OK',out); app.exit(0);
}catch(e){console.error(e);app.exit(1)}});
