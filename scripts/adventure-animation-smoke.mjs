// Independent engineering rig; engine input events, not an autonomous game or human playthrough.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { ADVENTURE_KIT_FILES } from '../dist/main/runtime/adventureKit.js';
const out = resolve('.noobi-private/stage-07/state-animation', new Date().toISOString().replaceAll(':','-'));
await mkdir(out,{recursive:true});
for(const [name,code] of Object.entries(ADVENTURE_KIT_FILES)){await mkdir(join(out,name,'..'),{recursive:true});await writeFile(join(out,name),code)}
await writeFile(join(out,'project.godot'),'[application]\nconfig/name="Noobi animation state engineering fixture"\nrun/main_scene="res://main.tscn"\n[display]\nwindow/size/viewport_width=640\nwindow/size/viewport_height=640\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
await writeFile(join(out,'main.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Fixture" type="Node3D"]\nscript=ExtResource("1")\n');
await writeFile(join(out,'main.gd'),`extends Node3D
const Controller = preload("res://runtime/noobi/adventure_controller_v1.gd")
const Adapter = preload("res://runtime/noobi/adventure_animation_v1.gd")
const Melee = preload("res://runtime/noobi/melee_v1.gd")
var actor = Controller.new()
var driver = Adapter.new()
var mixer := AnimationPlayer.new()
var melee = Melee.new()
var arm: MeshInstance3D
var library := AnimationLibrary.new()
var checks := []
var events := []
var collider := CollisionShape3D.new()
func check(ok: bool, label: String) -> void:
    if not ok:
        push_error("STATE_ANIMATION_FAILURE: "+label)
        get_tree().quit(1)
        assert(ok, label)
    checks.append(label)
func frames(count: int) -> void:
    for i in count: await get_tree().physics_frame
    await get_tree().process_frame
func pose(path: String) -> void:
    await RenderingServer.frame_post_draw
    get_viewport().get_texture().get_image().save_png("res://"+path+".png")
func mesh(size: Vector3, at: Vector3, parent: Node, color: Color) -> MeshInstance3D:
    var result := MeshInstance3D.new()
    var box := BoxMesh.new()
    box.size = size
    result.mesh = box
    var material := StandardMaterial3D.new()
    material.albedo_color = color
    result.material_override = material
    result.position = at
    parent.add_child(result)
    return result
func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    Engine.max_fps = 60
    for name in ["left","right","forward","back","jump","ability","attack"]: InputMap.add_action("noobi_"+name)
    var floor_body := StaticBody3D.new()
    var floor_shape := CollisionShape3D.new()
    var floor_box := BoxShape3D.new()
    floor_box.size = Vector3(30,0.2,30)
    floor_shape.shape = floor_box
    floor_body.position.y = -0.1
    floor_body.add_child(floor_shape)
    add_child(floor_body)
    mesh(Vector3(30,0.2,30),Vector3.ZERO,floor_body,Color(0.15,0.21,0.27))
    var capsule := CapsuleShape3D.new()
    capsule.height = 1.6
    capsule.radius = 0.3
    collider.shape = capsule
    collider.position.y = 0.8
    actor.add_child(collider)
    var visual := Node3D.new()
    visual.name = "Visual"
    actor.add_child(visual)
    actor.visual = visual
    mesh(Vector3(0.5,1.0,0.3),Vector3(0,0.75,0),visual,Color(0.2,0.75,0.68))
    mesh(Vector3(0.5,0.25,0.3),Vector3(0,0.125,0),visual,Color(0.95,0.7,0.3))
    arm = mesh(Vector3(0.25,0.6,0.25),Vector3(0.45,0.8,0),visual,Color(0.95,0.4,0.4))
    arm.name = "Arm"
    visual.add_child(mixer)
    var states := ["idle","run","jump","fall","hurt","dead","dash","attack"]
    for i in states.size():
        var state: String = states[i]
        var animation := Animation.new()
        animation.length = 0.4
        var track := animation.add_track(Animation.TYPE_POSITION_3D)
        animation.track_set_path(track,NodePath("Arm"))
        animation.track_insert_key(track,0.0,Vector3(0.45,0.8,0))
        animation.track_insert_key(track,0.2,Vector3(0.45,0.85+i*0.18,0))
        animation.track_insert_key(track,0.4,Vector3(0.45,0.9+i*0.18,0))
        library.add_animation(state,animation)
        driver.clips[state] = state
    mixer.add_animation_library("",library)
    actor.process_mode = Node.PROCESS_MODE_PAUSABLE
    actor.position.y = 0.03
    actor.dash_unlocked = true
    add_child(actor)
    melee.actor = actor
    actor.add_child(melee)
    driver.actor = actor
    driver.player = mixer
    driver.melee = melee
    driver.state_changed.connect(func(state,clip): events.append({"state":str(state),"clip":str(clip)}))
    actor.add_child(driver)
    var camera := Camera3D.new()
    add_child(camera)
    camera.position = Vector3(5,4,7)
    camera.look_at(Vector3(0,0.8,0))
    var light := DirectionalLight3D.new()
    light.rotation_degrees = Vector3(-45,-30,0)
    add_child(light)
    call_deferred("run")
func run() -> void:
    await frames(20)
    check(driver.failure.is_empty(),"valid visual tracks bind")
    check(actor.is_on_floor() and absf(actor.position.y)<0.02,"physics origin contacts real floor")
    check(driver.active_state == &"idle","landed idle clip")
    check(library.get_animation("idle").loop_mode == Animation.LOOP_NONE,"shared imported library unmodified")
    check(mixer.get_animation("idle").loop_mode == Animation.LOOP_LINEAR,"private idle loops")
    var original_collider := collider.transform
    var start_position: Vector3 = actor.position
    var initial_arm := arm.position
    Input.action_press("noobi_right")
    await frames(10)
    check(driver.active_state == &"run" and actor.position.x > start_position.x+0.1,"input moves body and selects run")
    check(arm.position.distance_to(initial_arm)>0.02,"rendered mesh pose changes")
    var event_count := events.size()
    var playhead := mixer.current_animation_position
    await frames(3)
    check(events.size()==event_count and mixer.current_animation_position>playhead,"stable state advances without replay")
    await pose("run")
    Input.action_release("noobi_right")
    await frames(20)
    Input.action_press("noobi_jump")
    await frames(3)
    Input.action_release("noobi_jump")
    check(driver.active_state==&"jump" and actor.position.y>0.1,"jump input and airborne pose")
    await pose("jump")
    await frames(23)
    check(driver.active_state==&"fall" and actor.velocity.y<0,"apex transitions to fall")
    await frames(35)
    check(actor.is_on_floor() and driver.active_state==&"idle","landing returns to idle")
    Input.action_press("noobi_ability")
    await frames(2)
    Input.action_release("noobi_ability")
    check(driver.active_state==&"dash","unlocked dash selects real clip")
    await frames(25)
    Input.action_press("noobi_attack")
    await frames(2)
    Input.action_release("noobi_attack")
    check(driver.active_state==&"attack","accepted melee miss starts attack clip")
    event_count = events.size()
    melee.attack()
    await frames(2)
    check(events.size()==event_count,"cooldown rejection does not replay attack")
    await frames(26)
    check(driver.active_state==&"idle","one-shot attack returns to locomotion")
    mixer.get_animation("attack").length = 1.2
    await frames(10)
    melee.attack()
    await frames(2)
    check(driver.active_state==&"attack","second accepted attack starts after cooldown")
    await frames(36)
    melee.attack()
    await frames(2)
    check(driver.active_state==&"attack" and mixer.current_animation_position<0.1,"new accepted swing restarts long attack clip")
    check(actor.take_damage(1),"damage accepted by controller")
    await frames(2)
    check(driver.active_state==&"hurt","damage interrupts attack")
    await frames(25)
    check(driver.active_state==&"idle","hurt recovers")
    get_tree().paused = true
    var frozen_pose := arm.transform
    var frozen_time := mixer.current_animation_position
    var frozen_body: Vector3 = actor.position
    await get_tree().create_timer(0.2,true).timeout
    check(arm.transform==frozen_pose and mixer.current_animation_position==frozen_time and actor.position==frozen_body,"pause freezes pose playhead and physics")
    get_tree().paused = false
    await frames(3)
    check(mixer.current_animation_position != frozen_time,"resume advances existing clip")
    await frames(40)
    actor.take_damage(100)
    await frames(2)
    check(driver.active_state==&"dead","lethal damage selects death")
    await frames(40)
    var death_pose := arm.transform
    await frames(8)
    check(arm.transform==death_pose and driver.active_state==&"dead","death holds final pose")
    await pose("dead")
    actor.reset_at(Vector3(0,0.03,0))
    await frames(20)
    check(driver.active_state==&"idle" and actor.health==actor.max_health,"controller revival resets animation")
    check(collider.transform==original_collider,"animation never changes collider")
    check(absf(actor.visual.global_position.y)<0.02,"visual wrapper remains at grounded origin")
    # Actual transition samples must interpolate instead of snapping to the target pose.
    driver.blend_seconds = 0.2
    var before_blend := arm.position.y
    Input.action_press("noobi_right")
    await frames(1)
    check(absf(arm.position.y-before_blend)<0.05,"blend begins continuously")
    await frames(10)
    check(absf(arm.position.y-before_blend)>0.015,"blend reaches changing run pose")
    Input.action_release("noobi_right")
    await frames(20)
    # Negative adapters own their own player so validation cannot disturb the good one.
    for negative in ["missing", "collider", "method"]:
        var bad_player := AnimationPlayer.new()
        actor.visual.add_child(bad_player)
        var bad_library := AnimationLibrary.new()
        for state in driver.clips:
            var animation := library.get_animation(state).duplicate(true) as Animation
            if negative=="collider": animation.track_set_path(0,NodePath("../"+str(collider.name)))
            if negative=="method":
                var method := animation.add_track(Animation.TYPE_METHOD)
                animation.track_set_path(method,NodePath("Arm"))
            bad_library.add_animation(state,animation)
        bad_player.add_animation_library("",bad_library)
        var bad = Adapter.new()
        bad.actor = actor
        bad.player = bad_player
        bad.clips = driver.clips.duplicate()
        if negative=="missing": bad.clips.erase("run")
        actor.add_child(bad)
        check(not bad.failure.is_empty() and not bad.is_physics_processing(),"reject "+negative+" binding")
        bad.queue_free()
        bad_player.queue_free()
        await frames(1)
    var illegal_shape := CollisionShape3D.new()
    actor.visual.add_child(illegal_shape)
    var unsafe_adapter = Adapter.new()
    unsafe_adapter.actor = actor
    unsafe_adapter.player = mixer
    unsafe_adapter.clips = driver.clips.duplicate()
    actor.add_child(unsafe_adapter)
    check(unsafe_adapter.failure.contains("physics bodies"),"reject collision hidden within visual subtree")
    illegal_shape.queue_free()
    unsafe_adapter.queue_free()
    var file := FileAccess.open("res://report.json",FileAccess.WRITE)
    file.store_string(JSON.stringify({"passed":true,"checks":checks,"events":events,"scope":"Engineering rigid mesh, Godot Input actions, not OS keys, gait, skeletal retargeting or autonomous game"}))
    file.close()
    print("STATE_ANIMATION_OK "+str(checks.size()))
    get_tree().quit()
`);
const exec=promisify(execFile);
try{
 const r=await exec('/opt/homebrew/bin/godot',['--path',out],{timeout:45000,maxBuffer:2*1024*1024});
 await writeFile(join(out,'run.log'),r.stdout+'\n'+r.stderr);
 assert(r.stdout.includes('STATE_ANIMATION_OK'));assert(!/SCRIPT ERROR|STATE_ANIMATION_FAILURE/.test(r.stdout+r.stderr));
 const report=JSON.parse(await readFile(join(out,'report.json'),'utf8'));assert(report.passed);
 await writeFile(join(out,'runtime-binding.json'),JSON.stringify({source:'ADVENTURE_KIT_FILES formal template',sha256:createHash('sha256').update(ADVENTURE_KIT_FILES['runtime/noobi/adventure_animation_v1.gd']).digest('hex')},null,2));
 await writeFile('.noobi-private/stage-07/state-animation-latest.json',JSON.stringify({out},null,2));
 console.log('STATE_ANIMATION_OK',report.checks.length,out);
}catch(e){await writeFile(join(out,'failure.log'),String(e)+'\n'+(e.stdout??'')+'\n'+(e.stderr??''));throw e}
