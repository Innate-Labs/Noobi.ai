// Real Godot mixer output via Movie Maker; no microphone or generated-game edits.
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { GAME_AUDIO_KIT } from '../dist/main/runtime/gameAudioKit.js';
const exec = promisify(execFile);
const root = resolve('.noobi-private/stage-07/audio',new Date().toISOString().replaceAll(':','-'));
await mkdir(root,{recursive:true});
const catalog=JSON.parse(await readFile('resources/free-audio/catalog.json','utf8'));
const sources=[];
for(const name of ['exploration.ogg','happy-adventure.mp3','pickup.ogg']) {
 const item=catalog.find(x=>x.file===name); const data=await readFile('resources/free-audio/'+name);
 assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256);
 await copyFile('resources/free-audio/'+name,join(root,name)); sources.push(item);
}
await writeFile(join(root,'sources.json'),JSON.stringify(sources,null,2));
await writeFile(join(root,'audio.gd'),GAME_AUDIO_KIT);
await writeFile(join(root,'project.godot'),`[application]
config/name="Noobi audio engineering fixture"
run/main_scene="res://main.tscn"
[display]
window/size/viewport_width=320
window/size/viewport_height=180
window/vsync/vsync_mode=0
[rendering]
renderer/rendering_method="gl_compatibility"
[audio]
driver/mix_rate=48000
[editor]
movie_writer/mix_rate=48000
movie_writer/speaker_mode=0
`);
await writeFile(join(root,'main.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="AudioFixture" type="Node"]\nscript = ExtResource("1")\n');
await writeFile(join(root,'main.gd'),`extends Node
const Manager = preload("res://audio.gd")
var manager = Manager.new()
var music: AudioStream
var second: AudioStream
var effect: AudioStream
var tone := AudioStreamWAV.new()
var frame := 0
var checks: Array[String] = []
var events: Array = []
var loops: Array = []
var pause_position := 0.0
var repeat_position := 0.0
var last_source: AudioStream
var last_position := 0.0
var music_bus := -1
var effects_bus := -1
var max_music_voices := 0
var max_effect_voices := 0
func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    music = AudioStreamOggVorbis.load_from_file("res://exploration.ogg")
    second = AudioStreamMP3.load_from_file("res://happy-adventure.mp3")
    effect = AudioStreamOggVorbis.load_from_file("res://pickup.ogg")
    music.loop = false
    second.loop = false
    effect.loop = true
    AudioServer.add_bus()
    music_bus = AudioServer.bus_count - 1
    AudioServer.set_bus_name(music_bus,"NoobiMusic")
    AudioServer.set_bus_send(music_bus,"Master")
    AudioServer.set_bus_volume_db(music_bus,-10.0)
    add_child(manager)
    effects_bus = AudioServer.get_bus_index("NoobiSFX")
    _check(AudioServer.get_bus_volume_db(music_bus) == -10.0,"existing music bus gain preserved")
    # Deterministic engineering tone to measure actual post-bus attenuation.
    var bytes := PackedByteArray()
    bytes.resize(24000 * 2)
    for index in 24000: bytes.encode_s16(index * 2, int(sin(TAU * 440.0 * index / 48000.0) * 8000.0))
    tone.format = AudioStreamWAV.FORMAT_16_BITS
    tone.mix_rate = 48000
    tone.data = bytes
    tone.loop_mode = AudioStreamWAV.LOOP_FORWARD
    _check(not manager.set_music(null) and not manager.set_music(tone) and not manager.set_music(music,NAN),"invalid music requests rejected")
    _check(not manager.play_effect(null) and not manager.play_effect(AudioStreamGenerator.new()) and not manager.play_effect(tone,false,NAN),"invalid effect requests rejected")
func _check(ok: bool, label: String) -> void:
    if not ok:
        push_error("AUDIO_FAILURE: " + label)
        get_tree().quit(1)
    else: checks.append(label)
func _mark(name: String) -> void:
    events.append({"frame":frame,"seconds":float(frame)/60.0,"name":name})
func _process(_delta: float) -> void:
    frame += 1
    var count := 0
    for player: AudioStreamPlayer in manager._music:
        if player.playing: count += 1
    max_music_voices = maxi(max_music_voices,count)
    count = 0
    for player: AudioStreamPlayer in manager._effects:
        if player.playing: count += 1
    max_effect_voices = maxi(max_effect_voices,count)
    if manager._active >= 0:
        var position: float = manager._music[manager._active].get_playback_position()
        if manager._source == last_source and position < last_position - 1.0:
            loops.append({"frame":frame,"track":"ogg" if manager._source == music else "mp3","previous":last_position,"position":position})
        last_source = manager._source
        last_position = position
    else: last_source = null
    match frame:
        10: add_child(Manager.new())
        20: _check(get_tree().get_nodes_in_group("noobi_audio_manager").size()==1,"duplicate manager removed")
        30:
            _check(manager.set_music(music,0.5),"OGG starts")
            _check(not music.loop,"source OGG loop flag unchanged")
            _mark("ogg-start")
        100: repeat_position = manager._music[manager._active].get_playback_position()
        120:
            for index in 20: manager.set_music(music,0.5)
            _check(manager._music[manager._active].get_playback_position() >= repeat_position,"same-track requests preserve playhead")
            _mark("repeat-same")
        180:
            AudioServer.set_bus_mute(music_bus,true)
            _mark("music-muted")
        190: manager.play_effect(effect,false,-12.0)
        220: _check(effect.loop,"source effect loop flag unchanged")
        240:
            AudioServer.set_bus_mute(music_bus,false)
            get_tree().paused = true
            _mark("pause")
        250: pause_position = manager._music[manager._active].get_playback_position()
        290: _check(absf(manager._music[manager._active].get_playback_position()-pause_position)<0.05,"pause holds music playhead")
        300:
            get_tree().paused = false
            _mark("resume")
        360:
            manager.set_music(second,1.0)
            _mark("crossfade-mp3")
        380:
            manager.set_music(music,0.5)
            _check(manager._pending == music,"rapid switch queues latest request")
        390:
            manager.set_music(second,0.5)
            _check(manager._pending == null,"same active request cancels stale queued region")
        430:
            _check(manager._source == second and manager._duration == 0.0,"crossfade completes")
            _check(not second.loop,"source MP3 loop flag unchanged")
        440:
            manager._music[manager._active].seek(second.get_length()-0.35)
            last_position = 0.0
            _mark("seek-mp3-loop-boundary")
        490:
            _check(loops.any(func(item): return item.track == "mp3"),"MP3 actual loop boundary observed")
            manager.stop_all()
            _mark("stop-all")
        510:
            manager.set_music(music,0.0,true)
            _mark("restart-full-ogg-loop")
        3240:
            _check(loops.any(func(item): return item.track == "ogg"),"full OGG actual loop boundary observed")
            manager.stop_all()
            AudioServer.set_bus_volume_db(effects_bus,0.0)
            _mark("stop-before-tone")
        3270:
            manager.play_effect(tone,false,-6.0)
            _mark("tone-full")
        3330:
            AudioServer.set_bus_volume_db(effects_bus,-12.0)
            manager.play_effect(tone,false,-6.0)
            _mark("tone-attenuated")
        3390:
            AudioServer.set_bus_mute(effects_bus,true)
            manager.play_effect(tone)
            _mark("effects-muted")
        3450:
            AudioServer.set_bus_mute(effects_bus,false)
            AudioServer.set_bus_volume_db(effects_bus,0.0)
            get_tree().paused = true
            _check(not manager.play_effect(tone),"paused gameplay effect rejected")
            _check(manager.play_effect(tone,true),"paused menu effect accepted")
            _mark("paused-menu-tone")
        3510:
            get_tree().paused = false
            AudioServer.set_bus_mute(0,true)
            manager.play_effect(tone)
            _mark("master-muted")
        3570:
            AudioServer.set_bus_mute(0,false)
            for index in 20: manager.play_effect(effect,false,-24.0)
            _mark("bounded-effect-burst")
        3630:
            _check(max_music_voices<=2 and max_music_voices==2,"music voices bounded at two")
            _check(max_effect_voices<=8 and max_effect_voices==8,"effect voices bounded at eight")
            manager.set_music(second,0.5)
            manager.set_music(music,0.5)
            manager.stop_all()
            _check(manager._pending == null,"stop cancels pending region")
            _mark("final-stop")
        3690:
            var active := 0
            for player: AudioStreamPlayer in manager._music + manager._effects:
                if player.playing: active += 1
            _check(active==0,"stop leaves no active voices")
            _check(tone.loop_mode == AudioStreamWAV.LOOP_FORWARD,"source WAV loop mode unchanged")
            manager.set_music(music,0.5)
            manager.set_music(second,0.5)
        3760:
            _check(manager._source == second and manager._duration == 0.0 and manager._pending == null,"queued region actually starts and finishes fade")
            manager.set_music(music,1.0)
            get_tree().paused = true
        3770: pause_position = manager._elapsed
        3790:
            _check(manager._elapsed == pause_position,"pause freezes transition timer")
            manager.pause_music_with_tree = false
        3800: pause_position = manager._music[manager._active].get_playback_position()
        3840:
            _check(manager._music[manager._active].get_playback_position() > pause_position + 0.4,"optional menu music continues while paused")
            manager.set_music(music,0.0,true)
            _check(manager._music[manager._active].get_playback_position() < 0.1,"explicit same-track restart resets playhead")
            manager.stop_all()
            get_tree().paused = false
        3900:
            var file := FileAccess.open("res://engine-report.json",FileAccess.WRITE)
            file.store_string(JSON.stringify({"checks":checks,"events":events,"loops":loops,"maxMusicVoices":max_music_voices,"maxEffectVoices":max_effect_voices}))
            file.close()
            print("AUDIO_RESULT:" + str(checks.size()))
            get_tree().quit()
`);
try {
 const {stdout,stderr}=await exec('/opt/homebrew/bin/godot',['--path',root,'--write-movie',join(root,'mix.avi'),'--fixed-fps','60','--resolution','320x180'],{timeout:180000,maxBuffer:2*1024*1024});
 await writeFile(join(root,'engine.log'),stdout+'\n'+stderr);
 assert(!/SCRIPT ERROR|AUDIO_FAILURE/.test(stdout+stderr),'engine checks failed');
 const engine=JSON.parse(await readFile(join(root,'engine-report.json'),'utf8'));
 await exec('/opt/homebrew/bin/ffmpeg',['-v','error','-y','-i',join(root,'mix.avi'),'-vn','-acodec','pcm_f32le','-ar','48000','-ac','2','-f','f32le',join(root,'mix.f32')]);
 await exec('/opt/homebrew/bin/ffmpeg',['-v','error','-y','-i',join(root,'mix.avi'),'-vn','-acodec','pcm_s16le',join(root,'mix.wav')]);
 const pcm=await readFile(join(root,'mix.f32'));
 const stats=(start,end)=>{let energy=0,peak=0,n=0;for(let i=Math.floor(start*48000)*2;i<Math.min(Math.floor(end*48000)*2,pcm.length/4);i++){const v=pcm.readFloatLE(i*4);energy+=v*v;peak=Math.max(peak,Math.abs(v));n++;}assert(n>0);return{rms:Math.sqrt(energy/n),peak};};
 const samples={music:stats(1.3,2),pause:stats(4.3,4.8),resumed:stats(5.3,5.8),crossfade:stats(6.3,6.8),stopped:stats(8.3,8.45),fullTone:stats(54.65,54.85),attenuatedTone:stats(55.65,55.85),effectsMuted:stats(56.65,56.85),pausedMenu:stats(57.65,57.85),masterMuted:stats(58.65,58.85),finalSilence:stats(60.8,61.3)};
 const ratio=samples.attenuatedTone.rms/samples.fullTone.rms;
 const evidence={root,engine,samples,attenuationRatio:ratio,sources,durationSeconds:pcm.length/4/2/48000,scope:'native Godot Movie Maker mixer output, not speaker or human listening acceptance'};
 await writeFile(join(root,'measurements.json'),JSON.stringify(evidence,null,2));
 for(const key of ['music','resumed','crossfade','fullTone','pausedMenu'])assert(samples[key].rms>0.001,key+' must contain mixed audio');
 for(const key of ['pause','stopped','effectsMuted','masterMuted','finalSilence'])assert(samples[key].rms<0.00001,key+' must be silent');
 assert(Math.abs(ratio-10**(-12/20))<0.02,'actual effects gain ratio');
 await writeFile(join(root,'report.json'),JSON.stringify({...evidence,passed:true},null,2));
 await writeFile(resolve('.noobi-private/stage-07/audio-latest.json'),JSON.stringify({root,checks:engine.checks.length,passed:true},null,2));
 console.log(JSON.stringify({root,checks:engine.checks.length,ratio,passed:true}));
} catch(error) {
 await writeFile(join(root,'failure.log'),String(error)+'\n'+(error.stdout??'')+'\n'+(error.stderr??''));
 console.error('Audio fixture failed; evidence at '+root);process.exitCode=1;
}
