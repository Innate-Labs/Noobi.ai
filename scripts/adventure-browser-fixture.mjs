import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
// Deliberately simple engineering geometry. Never a model-generated or art-approved game.
export async function createAdventureFixture(root, {dragOnly = false} = {}) {
  await mkdir(join(root, 'scenes'), { recursive: true }); await mkdir(join(root, 'scripts'), { recursive: true });
  await writeFile(join(root, 'scenes/main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://scripts/main.gd" id="1"]\n[node name="Main" type="Node3D"]\nscript = ExtResource("1")\n');
  await writeFile(join(root, 'scripts/main.gd'), `extends Node3D
const Controller = preload("res://runtime/noobi/adventure_controller_v1.gd")
const CameraRig = preload("res://runtime/noobi/adventure_camera_v1.gd")
const Interactable = preload("res://runtime/noobi/interactable_v1.gd")
const Interactor = preload("res://runtime/noobi/interactor_v1.gd")
const Checkpoint = preload("res://runtime/noobi/checkpoint_v1.gd")
var state := "ready"
var collected := 0
var player_health := 3
var last_event := ""
var player = Controller.new()
var rig = CameraRig.new()
var pickup = Interactable.new()
var goal = Interactable.new()
var interactor = Interactor.new()
var world: Node3D
var hud: Label
var prompt: Label
var message := "Press ENTER to start"
func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    var keys := {"left": KEY_A, "right": KEY_D, "forward": KEY_W, "back": KEY_S, "jump": KEY_SPACE, "ability": KEY_SHIFT, "interact": KEY_E, "attack": KEY_F}
    for action in keys:
        var name: String = "noobi_" + str(action)
        if not InputMap.has_action(name): InputMap.add_action(name)
        var key := InputEventKey.new()
        key.physical_keycode = keys[action]
        InputMap.action_add_event(name, key)
    world = Node3D.new()
    world.name = "World"
    world.process_mode = Node.PROCESS_MODE_PAUSABLE
    add_child(world)
    _box("Floor", Vector3(0, -0.1, -1), Vector3(14, 0.2, 20), Color("334e50"))
    _box("CameraWall", Vector3(-3, 1.5, 2), Vector3(0.3, 3, 8), Color("687985"))
    _box("Step", Vector3(3, 0.125, 0), Vector3(2, 0.25, 3), Color("698989"))
    _box("Barrier", Vector3(4.8, 1.0, 0), Vector3(0.4, 2, 3), Color("a98865"))
    player.name = "Player"
    player.position = Vector3(0, 0.05, 3)
    var collision := CollisionShape3D.new()
    var capsule := CapsuleShape3D.new()
    capsule.radius = 0.3
    capsule.height = 1.6
    collision.shape = capsule
    collision.position.y = 0.8
    player.add_child(collision)
    var body := CapsuleMesh.new()
    body.radius = 0.3
    body.height = 1.6
    _art(player, body, Vector3(0, 0.8, 0), Color("ecbc6d"))
    world.add_child(player)
    rig.name = "View"
    rig.position = Vector3(0, 1.5, 0)
    rig.target = player
    rig.capture_on_left_click = ${dragOnly ? 'false' : 'true'}
    player.add_child(rig)
    player.camera = rig.camera
    player.controls_enabled = false
    rig.enabled = false
    rig.focus_lost.connect(func():
        if state == "playing": _pause())
    player.damaged.connect(func(value): player_health = value; last_event = "damage")
    player.died.connect(func(): state = "lost"; message = "Try again | R restart"; rig.release_pointer())
    pickup.name = "Relic"
    pickup.interaction_id = "relic"
    pickup.position = Vector3(0, 0, 0)
    pickup.one_shot = true
    pickup.prompt = "E  |  Collect relic and unlock dash"
    var gem := SphereMesh.new()
    gem.radius = 0.25
    gem.height = 0.5
    _art(pickup, gem, Vector3(0, 0.7, 0), Color("79d7c1"))
    pickup.activated.connect(func(_actor): collected = 1; player.dash_unlocked = true; pickup.visible = false; last_event = "collected"; message = "Relic secured | K save checkpoint")
    world.add_child(pickup)
    goal.name = "Exit"
    goal.position = Vector3(0, 0, -5)
    goal.max_distance = 1.5
    goal.prompt = "E  |  Open exit with relic"
    goal.can_activate = func(_actor): return collected == 1
    var pillar := CylinderMesh.new()
    pillar.top_radius = 0.3
    pillar.bottom_radius = 0.5
    pillar.height = 1.5
    _art(goal, pillar, Vector3(0, 0.75, 0), Color("c69ad9"))
    goal.activated.connect(func(_actor): state = "won"; player.controls_enabled = false; rig.enabled = false; rig.release_pointer(); message = "Route complete | R restart")
    world.add_child(goal)
    interactor.actor = player
    interactor.interaction_failed.connect(func(_reason): last_event = "invalid"; message = "No valid interaction yet")
    player.add_child(interactor)
    var sun := DirectionalLight3D.new()
    sun.rotation_degrees = Vector3(-50, -30, 0)
    sun.light_energy = 1.0
    world.add_child(sun)
    var environment := WorldEnvironment.new()
    environment.environment = Environment.new()
    environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    environment.environment.ambient_light_color = Color("bcccd2")
    environment.environment.ambient_light_energy = 0.5
    world.add_child(environment)
    var layer := CanvasLayer.new()
    layer.name = "HUD"
    add_child(layer)
    hud = Label.new()
    hud.name = "Status"
    hud.position = Vector2(24, 20)
    hud.add_theme_font_size_override("font_size", 22)
    layer.add_child(hud)
    prompt = Label.new()
    prompt.name = "Interaction"
    prompt.position = Vector2(24, 135)
    prompt.add_theme_font_size_override("font_size", 20)
    layer.add_child(prompt)
    interactor.prompt_changed.connect(func(text): prompt.text = text)
func _process(_delta: float) -> void:
    hud.text = "3D COMPONENT TEST RANGE · ENGINEERING FIXTURE\\n" + state.to_upper() + "  |  Relic " + str(collected) + "/1  |  Health " + str(player_health) + "\\nWASD move · SPACE jump · E interact · P pause · K save · L load · right-drag camera\\n" + message
func _input(event: InputEvent) -> void:
    if event is InputEventMouseButton: print("CAMERA_INPUT button=" + str(event.button_index) + " pressed=" + str(event.pressed) + " enabled=" + str(rig.enabled))
    if event is InputEventMouseMotion: print("CAMERA_INPUT relative=" + str(event.relative) + " drag=" + str(rig._dragging) + " mode=" + str(Input.mouse_mode))
func _unhandled_key_input(event: InputEvent) -> void:
    if not event is InputEventKey or not event.pressed or event.echo: return
    if event.physical_keycode == KEY_ENTER and state == "ready": _start()
    elif event.physical_keycode in [KEY_P, KEY_ESCAPE] and state in ["playing", "paused"]:
        if state == "paused": _start()
        else: _pause()
    elif event.physical_keycode == KEY_R: _restart()
    elif event.physical_keycode == KEY_K and state == "playing":
        var saved: Dictionary = Checkpoint.save_slot("user://adventure-fixture.json", "adventure-fixture", 1, {"checkpoint": "spawn", "collected": collected, "health": player.health}, Callable(self, "_valid"))
        message = "Checkpoint saved" if saved.ok else saved.error
        last_event = "saved" if saved.ok else "save-error"
    elif event.physical_keycode == KEY_L:
        var saved: Dictionary = Checkpoint.load_slot("user://adventure-fixture.json", "adventure-fixture", 1, Callable(self, "_valid"))
        if saved.ok:
            _restart()
            collected = int(saved.state.collected)
            pickup.consumed = collected == 1
            pickup.visible = not pickup.consumed
            player.dash_unlocked = collected == 1
            player.health = int(saved.state.health)
            player_health = player.health
            last_event = "loaded"
            message = "Checkpoint restored"
        else: message = saved.error
func _valid(value: Dictionary) -> bool:
    return value.keys().size() == 3 and value.get("checkpoint") == "spawn" and (value.get("collected") is float or value.get("collected") is int) and value.collected >= 0 and value.collected <= 1 and fmod(value.collected, 1.0) == 0.0 and (value.get("health") is float or value.get("health") is int) and value.health >= 1 and value.health <= 3 and fmod(value.health, 1.0) == 0.0
func _pause() -> void:
    state = "paused"
    get_tree().paused = true
    rig.enabled = false
    rig.release_pointer()
    message = "Paused | P resume, then click to capture pointer"
func _start() -> void:
    get_tree().paused = false
    state = "playing"
    player.controls_enabled = true
    rig.resume_controls()
    message = "Find the relic, then reach the purple exit"
func _restart() -> void:
    collected = 0
    pickup.consumed = false
    pickup.visible = true
    player.reset_at(Vector3(0, 0.05, 3))
    player.dash_unlocked = false
    player_health = player.health
    rig.rotation.y = 0
    _start()
func _box(label: String, point: Vector3, size: Vector3, color: Color) -> void:
    var body := StaticBody3D.new()
    body.name = label
    body.position = point
    var shape := BoxShape3D.new()
    shape.size = size
    var collision := CollisionShape3D.new()
    collision.shape = shape
    body.add_child(collision)
    var mesh := BoxMesh.new()
    mesh.size = size
    _art(body, mesh, Vector3.ZERO, color)
    world.add_child(body)
func _art(parent: Node3D, mesh: Mesh, point: Vector3, color: Color) -> void:
    var instance := MeshInstance3D.new()
    instance.mesh = mesh
    instance.position = point
    var material := StandardMaterial3D.new()
    material.albedo_color = color
    material.roughness = 0.8
    instance.material_override = material
    parent.add_child(instance)
`);
}
