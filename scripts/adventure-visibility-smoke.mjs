// Bounded native Godot engineering fixture. Does not open or edit generated games.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { ADVENTURE_KIT_FILES } from '../dist/main/runtime/adventureKit.js';
const root = resolve('.noobi-private/stage-06/visibility', new Date().toISOString().replaceAll(':', '-'));
await mkdir(root, {recursive:true});
for(const [path, content] of Object.entries(ADVENTURE_KIT_FILES)) {
  await mkdir(join(root,path,'..'), {recursive:true}); await writeFile(join(root,path),content);
}
await writeFile(join(root,'project.godot'), `[application]
config/name="Noobi camera visibility engineering fixture"
run/main_scene="res://main.tscn"
[display]
window/size/viewport_width=960
window/size/viewport_height=600
[rendering]
renderer/rendering_method="gl_compatibility"
environment/defaults/default_clear_color=Color(0.12,0.17,0.23,1)
`);
await writeFile(join(root,'main.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Fixture" type="Node3D"]\nscript = ExtResource("1")\n');
await writeFile(join(root,'main.gd'), `extends Node3D
const Visibility = preload("res://runtime/noobi/adventure_visibility_v1.gd")
const Rig = preload("res://runtime/noobi/adventure_camera_v1.gd")
var camera := Camera3D.new()
var player := Node3D.new()
var enemy := Node3D.new()
var zone := Node3D.new()
var visibility = Visibility.new()
var checks: Array[String] = []
var warned := 0
var shared := StandardMaterial3D.new()
func _ready() -> void:
    shared.albedo_color = Color("c59e70")
    var light := DirectionalLight3D.new()
    light.rotation_degrees = Vector3(-50,-25,0)
    add_child(light)
    player.position = Vector3(-2,0,0)
    add_child(player)
    enemy.position = Vector3(2,0,0)
    add_child(enemy)
    enemy.add_to_group("noobi_camera_focus")
    zone.position = enemy.position
    zone.set_meta("noobi_focus_height",0.0)
    zone.set_meta("noobi_focus_radius",1.5)
    zone.add_to_group("noobi_camera_focus")
    add_child(zone)
    _actor(player, Color("67dca8"))
    _actor(enemy, Color("e87169"))
    var ring := MeshInstance3D.new()
    var torus := TorusMesh.new()
    torus.inner_radius = 1.35
    torus.outer_radius = 1.5
    ring.mesh = torus
    var red := StandardMaterial3D.new()
    red.albedo_color = Color("ff5f48")
    red.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    ring.material_override = red
    zone.add_child(ring)
    ring.position.y = 0.06
    camera.position = Vector3(0,3,8)
    add_child(camera)
    camera.look_at(Vector3(0,0.7,0))
    camera.current = true
    visibility.target = player
    visibility.camera = camera
    visibility.enabled = false
    visibility.unsupported_occluder.connect(func(_path): warned += 1)
    add_child(visibility)
    call_deferred("_run")
func _actor(parent: Node3D, color: Color) -> void:
    var mesh := MeshInstance3D.new()
    var capsule := CapsuleMesh.new()
    capsule.height = 1.6
    capsule.radius = 0.3
    mesh.mesh = capsule
    mesh.position.y = 0.8
    var material := StandardMaterial3D.new()
    material.albedo_color = color
    mesh.material_override = material
    parent.add_child(mesh)
func _wall(point: Vector3, marked: bool = true) -> StaticBody3D:
    var body := StaticBody3D.new()
    body.position = point
    if marked: body.add_to_group("noobi_camera_occluder")
    var mesh := MeshInstance3D.new()
    var box := BoxMesh.new()
    box.size = Vector3(3,2,0.25)
    box.material = shared
    mesh.mesh = box
    body.add_child(mesh)
    var shape := CollisionShape3D.new()
    var collision := BoxShape3D.new()
    collision.size = box.size
    shape.shape = collision
    body.add_child(shape)
    add_child(body)
    return body
func _frames(count: int = 5) -> void:
    for index in count: await get_tree().physics_frame
func _check(ok: bool, label: String) -> void:
    if not ok:
        push_error("VISIBILITY_FAILURE: " + label)
        get_tree().quit(1)
        await get_tree().process_frame
    checks.append(label)
func _capture(name: String) -> void:
    await RenderingServer.frame_post_draw
    get_viewport().get_texture().get_image().save_png("res://" + name + ".png")
func _run() -> void:
    var wall := _wall(Vector3(1.8,1,2))
    var mesh: MeshInstance3D = wall.get_child(0)
    var unrelated := _wall(Vector3(-5,1,0))
    await _frames()
    await _capture("01-opaque")
    visibility.enabled = true
    await _frames()
    _check(mesh.get_surface_override_material(0) != null, "enemy-only foreground faded")
    _check(mesh.get_active_material(0).albedo_color.a < 0.2, "foreground keeps faint silhouette")
    _check(shared.albedo_color.a == 1.0 and unrelated.get_child(0).get_surface_override_material(0) == null, "shared material and unrelated wall unchanged")
    _check(visibility.ray_count <= 8 * 7 * 4, "bounded ray count")
    await _capture("02-readable")
    var body := CharacterBody3D.new()
    var shape := CollisionShape3D.new()
    shape.shape = SphereShape3D.new()
    body.add_child(shape)
    body.position = Vector3(1.8,1,4)
    add_child(body)
    await _frames()
    var contact := body.move_and_collide(Vector3(0,0,-4))
    _check(contact != null and contact.get_collider() == wall, "faded wall still blocks actual body motion")
    body.queue_free()
    enemy.hide()
    zone.hide()
    await _frames()
    _check(mesh.get_surface_override_material(0) == null, "hidden enemy and zone restore original surface")
    await _capture("03-restored")
    enemy.show()
    zone.show()
    var second := _wall(Vector3(1.8,1,1))
    await _frames()
    _check(second.get_child(0).get_surface_override_material(0) != null, "layered foreground also faded")
    visibility.enabled = false
    await _frames()
    _check(mesh.get_surface_override_material(0) == null and second.get_child(0).get_surface_override_material(0) == null, "disable restores all layers")
    second.queue_free()
    await _frames()
    mesh.material_override = shared
    visibility.enabled = true
    await _frames()
    _check(mesh.material_override != shared, "whole-mesh override copied")
    visibility.restore_all()
    _check(mesh.material_override == shared, "whole-mesh original reference restored")
    mesh.material_override = null
    var shader := Shader.new()
    shader.code = "shader_type spatial; void fragment(){ ALBEDO=vec3(0.5); }"
    var custom := ShaderMaterial.new()
    custom.shader = shader
    mesh.material_override = custom
    await _frames()
    _check(mesh.material_override == custom and warned == 1, "unsupported shader preserved and reported once")
    mesh.material_override = null
    wall.remove_from_group("noobi_camera_occluder")
    await _frames()
    _check(mesh.get_surface_override_material(0) == null, "unmarked blocker remains opaque")
    wall.add_to_group("noobi_camera_occluder")
    await _frames()
    var opaque := _wall(Vector3(1.8,1,3), false)
    # Cover every focus ray; a two-meter wall legitimately leaves the head
    # visible from this elevated camera and cannot serve as an opaque-screen test.
    opaque.scale = Vector3(2,2,1)
    await _frames()
    _check(mesh.get_surface_override_material(0) == null, "opaque foreground prevents revealing marked wall behind it")
    opaque.queue_free()
    await _frames()
    var other_camera := Camera3D.new()
    add_child(other_camera)
    other_camera.current = true
    await _frames()
    _check(mesh.get_surface_override_material(0) == null, "switching active camera restores foreground")
    camera.current = true
    other_camera.queue_free()
    await _frames()
    _check(mesh.get_surface_override_material(0) != null, "returning camera recalculates visibility")
    var transient := _wall(Vector3(1.8,1,1))
    await _frames()
    transient.queue_free()
    await _frames()
    _check(visibility._faded.size() == 1, "freed foreground removed from tracking")
    var original_override := StandardMaterial3D.new()
    mesh.set_surface_override_material(0, original_override)
    visibility.enabled = false
    await _frames()
    _check(mesh.get_surface_override_material(0) == original_override, "external material changes not overwritten on restoration")
    visibility.enabled = true
    await _frames()
    visibility.queue_free()
    await _frames()
    _check(mesh.get_surface_override_material(0) == original_override, "component exit restores material")
    # Integration with the real rig must parse and instantiate its new dependency.
    var actor := CharacterBody3D.new()
    add_child(actor)
    var rig = Rig.new()
    rig.target = actor
    actor.add_child(rig)
    await _frames()
    _check(is_instance_valid(rig.visibility) and rig.visibility.camera == rig.camera, "camera rig installs visibility component")
    print("VISIBILITY_RESULT:" + JSON.stringify({"checks":checks,"count":checks.size()}))
    get_tree().quit()
`);
const exec = promisify(execFile);
try {
  const {stdout,stderr} = await exec('/opt/homebrew/bin/godot', ['--path',root,'--resolution','960x600','--position','80,80'], {timeout:60000,maxBuffer:2*1024*1024});
  await writeFile(join(root,'run.log'),stdout+'\n'+stderr);
  assert(!/SCRIPT ERROR|VISIBILITY_FAILURE/.test(stdout+stderr), 'Godot script failed');
  const line=stdout.split('\n').find(line=>line.startsWith('VISIBILITY_RESULT:'));
  assert(line,'No completion evidence'); const report=JSON.parse(line.slice('VISIBILITY_RESULT:'.length));
  await writeFile(join(root,'report.json'),JSON.stringify({root,...report},null,2));
  await writeFile(resolve('.noobi-private/stage-06/visibility-latest.json'),JSON.stringify({root,...report},null,2));
  console.log(JSON.stringify({root,count:report.count}));
} catch(error) {
  await writeFile(join(root,'failure.log'),String(error)+'\n'+(error.stdout??'')+'\n'+(error.stderr??''));
  console.error('Visibility fixture failed; evidence at '+root);process.exitCode=1;
}
