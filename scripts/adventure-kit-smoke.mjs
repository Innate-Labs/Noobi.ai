// Real Godot physics with engine input events; engineering fixtures, not model-generated games.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { ADVENTURE_KIT_FILES } from '../dist/main/runtime/adventureKit.js';
const exec = promisify(execFile);
const out = resolve('.noobi-private/stage-06/physics'); await mkdir(out, { recursive: true });
const results = [];
for (const fps of [30, 60, 120]) {
  const root = join(out, String(fps)); await mkdir(root, { recursive: true });
  for (const [file, content] of Object.entries(ADVENTURE_KIT_FILES)) { await mkdir(join(root, file, '..'), { recursive: true }); await writeFile(join(root, file), content); }
  await writeFile(join(root, 'project.godot'), '[application]\nconfig/name="Noobi adventure engineering fixture"\nrun/main_scene="res://main.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
  await writeFile(join(root, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Fixture" type="Node3D"]\nscript = ExtResource("1")\n');
  await writeFile(join(root, 'main.gd'), `extends Node3D
const Controller = preload("res://runtime/noobi/adventure_controller_v1.gd")
const CameraRig = preload("res://runtime/noobi/adventure_camera_v1.gd")
const Interactable = preload("res://runtime/noobi/interactable_v1.gd")
const Interactor = preload("res://runtime/noobi/interactor_v1.gd")
const Melee = preload("res://runtime/noobi/melee_v1.gd")
const Enemy = preload("res://runtime/noobi/enemy_v1.gd")
var player = Controller.new()
var camera_rig = CameraRig.new()
var checks: Array[String] = []
var dash_count := 0
var activations := 0
var hits := 0
var misses := 0
var can_use := false
func _ready() -> void:
    Engine.physics_ticks_per_second = ${fps}
    Engine.max_fps = ${fps}
    for action: String in ["left", "right", "forward", "back", "jump", "ability", "interact", "attack"]:
        InputMap.add_action("noobi_" + action)
    _box(Vector3(0, -0.1, 0), Vector3(60, 0.2, 60))
    var collision := CollisionShape3D.new()
    var capsule := CapsuleShape3D.new()
    capsule.height = 1.6
    capsule.radius = 0.3
    collision.shape = capsule
    collision.position.y = 0.8
    player.add_child(collision)
    player.dash_unlocked = false
    player.position = Vector3(0, 0.05, 0)
    add_child(player)
    camera_rig.target = player
    camera_rig.position = Vector3(0, 1.3, 0)
    player.add_child(camera_rig)
    player.ability_used.connect(func(): dash_count += 1)
    call_deferred("_run")
func _box(point: Vector3, size: Vector3) -> StaticBody3D:
    var body := StaticBody3D.new()
    body.position = point
    var collision := CollisionShape3D.new()
    var shape := BoxShape3D.new()
    shape.size = size
    collision.shape = shape
    body.add_child(collision)
    add_child(body)
    return body
func _frames(count: int) -> void:
    for index in count: await get_tree().physics_frame
func _seconds(seconds: float) -> void:
    await _frames(int(ceil(seconds * ${fps})))
func _check(ok: bool, message: String) -> void:
    if not ok:
        push_error("ADVENTURE_FAILURE: " + message)
        get_tree().quit(1)
        await get_tree().process_frame
    checks.append(message)
func _press(action: String, seconds: float) -> void:
    Input.action_press("noobi_" + action)
    await _seconds(seconds)
    Input.action_release("noobi_" + action)
    await _frames(1)
func _run() -> void:
    await _seconds(0.3)
    _check(player.is_on_floor(), "landed on actual floor")
    await _press("right", 1.0)
    var distance: float = player.position.x
    _check(distance > 4.3 and distance < 5.2, "time-based movement")
    player.reset_at(Vector3(0, 0.05, 0))
    await _seconds(0.2)
    await _press("jump", 0.12)
    _check(player.position.y > 0.4, "jump leaves floor")
    await _seconds(1.0)
    _check(player.is_on_floor(), "jump lands")
    await _press("ability", 0.04)
    _check(dash_count == 0, "locked dash ignored")
    player.dash_unlocked = true
    await _press("ability", 0.04)
    await _press("ability", 0.04)
    _check(dash_count == 1, "dash cooldown")
    await _seconds(1.0)
    await _press("ability", 0.04)
    _check(dash_count == 2, "dash recovers")
    player.reset_at(Vector3(0, 0.05, 0))
    var step := _box(Vector3(2, 0.125, 0), Vector3(2, 0.25, 3))
    var wall := _box(Vector3(5, 1.5, 0), Vector3(0.4, 3, 3))
    var ceiling := _box(Vector3(1, 1.8, 0), Vector3(3, 0.2, 3))
    await _seconds(0.2)
    await _press("right", 0.5)
    _check(player.position.x < 0.8 and player.position.y < 0.1, "low ceiling prevents step teleport")
    ceiling.queue_free()
    await _frames(3)
    await _press("right", 0.5)
    _check(player.position.x > 1.5 and player.position.y > 0.2, "bounded step climb " + str(player.position))
    await _press("right", 1.0)
    _check(player.position.x < 4.55, "tall wall blocks movement")
    step.queue_free()
    wall.queue_free()
    await _frames(3)
    var ramp := _box(Vector3(0, 0.5, -8), Vector3(3, 0.2, 5))
    ramp.rotation.x = deg_to_rad(16.0)
    player.reset_at(Vector3(0, 0.05, -5))
    await _seconds(0.3)
    await _press("forward", 0.8)
    _check(player.position.z < -8.0 and player.position.y > 0.4 and player.is_on_floor(), "walkable slope and floor snap")
    ramp.queue_free()
    player.reset_at(Vector3(0, 0.05, 0))
    await _seconds(0.3)
    var back_wall := _box(Vector3(0, 2, 2), Vector3(4, 4, 0.2))
    await _seconds(0.2)
    _check(camera_rig.arm.get_hit_length() < 2.2, "camera collision shortens arm")
    back_wall.queue_free()
    await _seconds(0.2)
    _check(camera_rig.arm.get_hit_length() > 4.8, "camera recovers unobstructed distance")
    var target = Interactable.new()
    target.one_shot = true
    target.position = Vector3(0, 0, -1)
    target.can_activate = func(_actor): return can_use
    target.activated.connect(func(_actor): activations += 1)
    add_child(target)
    var interactor = Interactor.new()
    interactor.actor = player
    player.add_child(interactor)
    await _press("interact", 0.04)
    _check(activations == 0, "unsatisfied interaction rejected")
    can_use = true
    var gate := _box(Vector3(0, 1, -0.5), Vector3(2, 2, 0.15))
    await _frames(3)
    await _press("interact", 0.04)
    _check(activations == 0, "interaction through wall rejected")
    gate.queue_free()
    await _frames(3)
    await _press("interact", 0.04)
    await _press("interact", 0.04)
    _check(activations == 1 and target.consumed, "one-shot activation commits once")
    var enemy = Controller.new()
    enemy.controls_enabled = false
    enemy.position = Vector3(0, 0, -1.2)
    enemy.add_to_group("noobi_damageable")
    add_child(enemy)
    enemy.set_physics_process(false)
    var melee = Melee.new()
    melee.actor = player
    melee.hit.connect(func(_actor): hits += 1)
    melee.missed.connect(func(): misses += 1)
    player.add_child(melee)
    await _press("attack", 0.04)
    _check(hits == 1 and enemy.health == 2, "melee real target hit")
    await _seconds(0.7)
    enemy.position = Vector3(0, 0, 1.2)
    await _press("attack", 0.04)
    _check(misses == 1 and enemy.health == 2, "rear target is a miss")
    _check(player.take_damage(1) and not player.take_damage(1) and player.health == 2, "damage invulnerability")
    await _seconds(1.1)
    player.take_damage(3)
    _check(player.health == 0 and not player.controls_enabled, "death disables controller")
    player.reset_at(Vector3(0, 0.05, 0))
    _check(player.health == 3 and player.velocity == Vector3.ZERO, "restart clears transient state")
    var before: Vector3 = player.position
    get_tree().paused = true
    await _press("right", 0.3)
    _check(player.position == before, "pause freezes physics")
    get_tree().paused = false
    camera_rig.notification(NOTIFICATION_APPLICATION_FOCUS_OUT)
    _check(not camera_rig.enabled and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE, "focus loss releases pointer")
    camera_rig.resume_controls()
    _check(camera_rig.enabled and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE, "resume requires fresh pointer gesture")
    enemy.queue_free()
    player.reset_at(Vector3(0, 0.05, 0))
    var guard = Enemy.new()
    guard.target = player
    guard.position = Vector3(0, 0.05, -1.2)
    var enemy_shape := CollisionShape3D.new()
    var enemy_capsule := CapsuleShape3D.new()
    enemy_capsule.radius = 0.3
    enemy_capsule.height = 1.6
    enemy_shape.shape = enemy_capsule
    enemy_shape.position.y = 0.8
    guard.add_child(enemy_shape)
    add_child(guard)
    await _seconds(0.1)
    _check(guard.state == &"windup" and player.health == 3, "enemy telegraphs before striking")
    await _seconds(0.6)
    _check(player.health == 2 and guard.state == &"recover", "enemy strike and recovery")
    guard.queue_free()
    await _frames(3)
    player.reset_at(Vector3(0, 0.05, 0))
    var dodged = Enemy.new()
    dodged.target = player
    dodged.position = Vector3(0, 0.05, -1.2)
    var dodge_shape := CollisionShape3D.new()
    var dodge_capsule := CapsuleShape3D.new()
    dodge_capsule.radius = 0.3
    dodge_capsule.height = 1.6
    dodge_shape.shape = dodge_capsule
    dodge_shape.position.y = 0.8
    dodged.add_child(dodge_shape)
    add_child(dodged)
    await _seconds(0.1)
    await _press("right", 0.6)
    _check(player.health == 3 and dodged.state == &"recover" and dodged.is_on_floor() and player.position.x > 1.0, "movement dodges telegraphed strike")
    dodged.queue_free()
    await _frames(3)
    print("ADVENTURE_RESULT " + JSON.stringify({"fps": ${fps}, "distance": distance, "checks": checks}))
    get_tree().quit(0)
`);
  const engine = process.env.NOOBI_GODOT_PATH || 'godot';
  const imported = await exec(engine, ['--headless', '--path', root, '--editor', '--import'], { timeout: 60000, maxBuffer: 4000000 });
  await writeFile(join(root, 'import.log'), imported.stdout + imported.stderr);
  assert.doesNotMatch(imported.stdout + imported.stderr, /SCRIPT ERROR|Parse Error/);
  const result = await exec(engine, ['--headless', '--path', root], { timeout: 45000, maxBuffer: 4000000 }).catch(async error => { await writeFile(join(root, 'runtime.log'), String(error.stdout) + String(error.stderr)); throw error; });
  await writeFile(join(root, 'runtime.log'), result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /SCRIPT ERROR|ADVENTURE_FAILURE|Parse Error/);
  const line = result.stdout.split('\n').find(value => value.startsWith('ADVENTURE_RESULT ')); assert.ok(line, result.stdout + result.stderr);
  results.push(JSON.parse(line.slice('ADVENTURE_RESULT '.length)));
}
assert.ok(Math.max(...results.map(r => r.distance)) - Math.min(...results.map(r => r.distance)) < 0.22);
await writeFile(join(out, 'results.json'), JSON.stringify(results, null, 2)); console.log('ADVENTURE_PHYSICS_OK', results.map(r => ({ fps: r.fps, checks: r.checks.length, distance: r.distance })));
