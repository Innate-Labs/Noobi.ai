import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { PLATFORMER_CONTROLLER } from '../src/main/runtime/platformerKit.js';
import { GodotEnvironmentService } from '../src/main/godotEnvironmentService.js';

const root = resolve('.tmp/quality-controller-smoke');
await mkdir(root, { recursive: true });
await writeFile(join(root, 'controller.gd'), PLATFORMER_CONTROLLER);
await writeFile(join(root, 'project.godot'), '[application]\nrun/main_scene="res://main.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
await writeFile(join(root, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Test" type="Node2D"]\nscript = ExtResource("1")\n');
await writeFile(join(root, 'main.gd'), `extends Node2D
const Controller = preload("res://controller.gd")
var player = Controller.new()
var dash_count := 0
func _ready() -> void:
    Engine.max_fps = 60
    for action: String in ["move_left", "move_right", "jump", "dash"]:
        InputMap.add_action(action)
    var floor_body := StaticBody2D.new()
    var floor_collision := CollisionShape2D.new()
    var floor_shape := RectangleShape2D.new()
    floor_shape.size = Vector2(3000, 40)
    floor_collision.shape = floor_shape
    floor_body.position = Vector2(0, 400)
    floor_body.add_child(floor_collision)
    add_child(floor_body)
    var collision := CollisionShape2D.new()
    var shape := CapsuleShape2D.new()
    shape.radius = 12
    shape.height = 40
    collision.shape = shape
    player.add_child(collision)
    player.position = Vector2(0, 350)
    player.dashed.connect(func(): dash_count += 1)
    add_child(player)
    call_deferred("_run")
func _frames(count: int) -> void:
    for index in count:
        await get_tree().physics_frame
func _run() -> void:
    await _frames(20)
    assert(player.is_on_floor(), "controller must land on collision geometry")
    Input.action_press("move_right")
    await _frames(30)
    Input.action_release("move_right")
    assert(player.position.x > 100 and player.position.x < 190, "time-based acceleration and movement")
    var floor_y: float = player.position.y
    Input.action_press("jump")
    await _frames(12)
    Input.action_release("jump")
    assert(player.position.y < floor_y - 30, "jump must leave the floor")
    player.reset_at(Vector2(0, 350))
    await _frames(20)
    Input.action_press("dash")
    await _frames(2)
    Input.action_release("dash")
    await _frames(1)
    Input.action_press("dash")
    await _frames(2)
    Input.action_release("dash")
    assert(dash_count == 1, "cooldown must reject a second immediate dash")
    await _frames(45)
    Input.action_press("dash")
    await _frames(2)
    Input.action_release("dash")
    assert(dash_count == 2, "dash must become available again")
    player.take_damage()
    player.take_damage()
    assert(player.health == 2, "invulnerability must prevent duplicate damage")
    player.reset_at(Vector2(10, 350))
    assert(player.health == 3 and player.velocity == Vector2.ZERO and player.cooldown_remaining == 0, "reset must clear gameplay state")
    player.controls_enabled = false
    var old_position: Vector2 = player.position
    Input.action_press("move_right")
    await _frames(8)
    Input.action_release("move_right")
    assert(player.position == old_position, "disabled control must not move")
    print("NOOBI_CONTROLLER_CHECKS_OK")
    get_tree().quit(0)
`);
const environment = new GodotEnvironmentService({ storageFile: join(root, 'environment.json') });
await environment.init();
const imported = await environment.execute({ kind: 'import', projectPath: root });
const runtime = await environment.execute({ kind: 'runtime', projectPath: root });
await writeFile(join(root, 'evidence.json'), JSON.stringify({ imported, runtime }, null, 2));
if (!imported.ok || !runtime.ok || !runtime.stdout.includes('NOOBI_CONTROLLER_CHECKS_OK')) {
  throw new Error(`Controller physics smoke failed: ${runtime.stderr}\n${runtime.stdout}`);
}
console.log('Real Godot controller checks passed: floor collision, move, jump, dash cooldown, damage, reset, disabled input.');
