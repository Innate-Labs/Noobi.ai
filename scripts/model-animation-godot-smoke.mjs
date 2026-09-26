// Cross-engine pose verification on engineering GLBs from model-animation-smoke.mjs.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const input=JSON.parse(await readFile('.noobi-private/stage-07/animation-latest.json','utf8'));
const out=join(input.out,'godot');await mkdir(out,{recursive:true});
for(const name of ['weighted-bone','unused-bone','rigid-skin-translation'])await copyFile(join(input.out,name+'.glb'),join(out,name+'.glb'));
await writeFile(join(out,'project.godot'),'[application]\nconfig/name="Animation deformation engineering fixture"\nrun/main_scene="res://main.tscn"\n[display]\nwindow/size/viewport_width=640\nwindow/size/viewport_height=640\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
await writeFile(join(out,'main.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Fixture" type="Node3D"]\nscript=ExtResource("1")\n');
await writeFile(join(out,'main.gd'),`extends Node3D
var results := []
func _ready() -> void:
    var camera := Camera3D.new()
    add_child(camera)
    camera.position = Vector3(3,2.7,5)
    camera.look_at(Vector3(0,1,0))
    var light := DirectionalLight3D.new()
    light.rotation_degrees = Vector3(-35,-30,0)
    add_child(light)
    call_deferred("verify")
func vertices(mesh: MeshInstance3D) -> PackedVector3Array:
    var baked := mesh.bake_mesh_from_current_skeleton_pose()
    var points := PackedVector3Array()
    for index in baked.get_surface_count(): points.append_array(baked.surface_get_arrays(index)[Mesh.ARRAY_VERTEX])
    return points
func verify() -> void:
    for name in ["weighted-bone", "unused-bone", "rigid-skin-translation"]:
        var model = load("res://"+name+".glb").instantiate()
        add_child(model)
        await get_tree().process_frame
        var mesh: MeshInstance3D = model.find_children("*","MeshInstance3D",true,false)[0]
        var player: AnimationPlayer = model.find_children("*","AnimationPlayer",true,false)[0]
        var clip := ""
        for candidate in player.get_animation_list():
            if candidate.ends_with("action"): clip = candidate
        if clip.is_empty(): push_error("ANIMATION_FAILURE: missing imported action");get_tree().quit(1);return
        player.play(clip)
        player.seek(0.0,true)
        player.pause()
        await RenderingServer.frame_post_draw
        var before := vertices(mesh)
        var before_transform := mesh.global_transform
        get_viewport().get_texture().get_image().save_png("res://"+name+"-start.png")
        player.seek(0.5,true)
        await get_tree().process_frame
        await RenderingServer.frame_post_draw
        var after := vertices(mesh)
        var maximum := 0.0
        var world_maximum := 0.0
        if before.size() != after.size() or before.is_empty(): push_error("ANIMATION_FAILURE: invalid baked vertices");get_tree().quit(1);return
        for i in before.size():
            maximum = maxf(maximum,before[i].distance_to(after[i]))
            world_maximum = maxf(world_maximum,(before_transform * before[i]).distance_to(mesh.global_transform * after[i]))
        get_viewport().get_texture().get_image().save_png("res://"+name+"-pose.png")
        results.append({"name":name,"vertices":before.size(),"skinDisplacement":maximum,"worldDisplacement":world_maximum})
        if (name == "weighted-bone" and maximum < 0.2) or (name != "weighted-bone" and maximum > 0.00001):
            push_error("ANIMATION_FAILURE: incorrect imported deformation "+name+" "+str(maximum));get_tree().quit(1);return
        model.queue_free()
        await get_tree().process_frame
    var file := FileAccess.open("res://results.json",FileAccess.WRITE)
    file.store_string(JSON.stringify({"passed":true,"results":results,"scope":"Godot baked engineering skin poses, not gameplay or gait"}))
    file.close()
    print("GODOT_ANIMATION_OK")
    get_tree().quit()
`);
const exec=promisify(execFile);
try {
 const imported=await exec('/opt/homebrew/bin/godot',['--headless','--path',out,'--editor','--import'],{timeout:60000,maxBuffer:2*1024*1024});
 await writeFile(join(out,'import.log'),imported.stdout+'\n'+imported.stderr);
 const played=await exec('/opt/homebrew/bin/godot',['--path',out],{timeout:30000,maxBuffer:2*1024*1024});
 await writeFile(join(out,'run.log'),played.stdout+'\n'+played.stderr);
 assert(played.stdout.includes('GODOT_ANIMATION_OK'));assert(!/SCRIPT ERROR|ANIMATION_FAILURE/.test(played.stdout+played.stderr));
 console.log('GODOT_ANIMATION_OK',out);
} catch(e){await writeFile(join(out,'failure.log'),String(e)+'\n'+(e.stdout??'')+'\n'+(e.stderr??''));throw e}
