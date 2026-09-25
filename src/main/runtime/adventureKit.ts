import { ADVENTURE_ENEMY } from './adventureEnemy.js';
/** Opt-in Godot 4 components. These contain no level, theme, final art or win trigger. */
export const ADVENTURE_KIT_VERSION = 1;
export const ADVENTURE_CONTROLLER = `extends CharacterBody3D
class_name NoobiAdventureController

signal motion_changed(state: StringName)
signal damaged(remaining: int)
signal died
signal ability_used

@export var camera: Camera3D
@export var visual: Node3D
@export var speed := 5.0
@export var acceleration := 24.0
@export var gravity := 22.0
@export var jump_speed := 7.5
@export var step_height := 0.32
@export var step_probe_reach := 0.35
@export var max_health := 3
@export var dash_unlocked := false
@export var dash_speed := 11.0
@export var dash_duration := 0.18
@export var dash_cooldown := 0.8
var health := 3
var controls_enabled := true
var motion_state: StringName = &"idle"
var facing := Vector3.FORWARD
var _jump_buffer := 0.0
var _coyote := 0.0
var _dash := 0.0
var _cooldown := 0.0
var _invulnerability := 0.0

func _ready() -> void:
    health = max_health
    floor_snap_length = 0.35
    floor_max_angle = deg_to_rad(46.0)
    floor_stop_on_slope = true

func _physics_process(delta: float) -> void:
    var grounded := is_on_floor()
    _coyote = 0.1 if grounded else maxf(0.0, _coyote - delta)
    _jump_buffer = maxf(0.0, _jump_buffer - delta)
    _cooldown = maxf(0.0, _cooldown - delta)
    _invulnerability = maxf(0.0, _invulnerability - delta)
    var axis := Vector2.ZERO
    if controls_enabled and health > 0:
        axis = Input.get_vector("noobi_left", "noobi_right", "noobi_forward", "noobi_back")
        if Input.is_action_just_pressed("noobi_jump"):
            _jump_buffer = 0.12
        if dash_unlocked and _cooldown <= 0.0 and Input.is_action_just_pressed("noobi_ability"):
            _dash = dash_duration
            _cooldown = dash_cooldown
            ability_used.emit()
    var direction := Vector3(axis.x, 0, axis.y)
    if is_instance_valid(camera):
        var right := camera.global_basis.x
        var back := camera.global_basis.z
        right.y = 0.0
        back.y = 0.0
        direction = right.normalized() * axis.x + back.normalized() * axis.y
    direction = direction.limit_length(1.0)
    if direction.length_squared() > 0.001:
        facing = direction.normalized()
    if not grounded:
        velocity.y = maxf(-40.0, velocity.y - gravity * delta)
    if controls_enabled and health > 0 and _jump_buffer > 0.0 and _coyote > 0.0:
        velocity.y = jump_speed
        _jump_buffer = 0.0
        _coyote = 0.0
    var target := direction * speed
    if _dash > 0.0 and controls_enabled and health > 0:
        target = facing * dash_speed
        _dash = maxf(0.0, _dash - delta)
    velocity.x = move_toward(velocity.x, target.x, acceleration * delta)
    velocity.z = move_toward(velocity.z, target.z, acceleration * delta)
    if not controls_enabled or health <= 0:
        velocity.x = 0.0
        velocity.z = 0.0
        _dash = 0.0
        _jump_buffer = 0.0
    var horizontal := Vector3(velocity.x, 0, velocity.z) * delta
    if grounded and velocity.y <= 0.0:
        _try_step(horizontal)
    move_and_slide()
    if is_instance_valid(visual) and facing.length_squared() > 0.01:
        visual.rotation.y = lerp_angle(visual.rotation.y, atan2(-facing.x, -facing.z), 1.0 - exp(-14.0 * delta))
    var next: StringName = &"idle"
    if health <= 0: next = &"dead"
    elif _invulnerability > 0.7: next = &"hurt"
    elif _dash > 0.0: next = &"dash"
    elif not is_on_floor(): next = &"jump" if velocity.y > 0.0 else &"fall"
    elif Vector2(velocity.x, velocity.z).length() > 0.1: next = &"run"
    if next != motion_state:
        motion_state = next
        motion_changed.emit(next)

func _try_step(motion: Vector3) -> bool:
    if step_height <= 0.0 or motion.length_squared() < 0.000001 or not test_move(global_transform, motion):
        return false
    # Probe ahead of the capsule toe; the capsule's rounded lower contact is
    # not the floor normal. Sweep the entire shape upward and forward before
    # raising it; horizontal motion still occurs exactly once in move_and_slide.
    var toe := global_position + motion + motion.normalized() * step_probe_reach
    var query := PhysicsRayQueryParameters3D.create(toe + Vector3.UP * step_height, toe + Vector3.DOWN * 0.05, collision_mask, [get_rid()])
    var floor_hit := get_world_3d().direct_space_state.intersect_ray(query)
    if floor_hit.is_empty() or floor_hit.normal.dot(Vector3.UP) < cos(floor_max_angle): return false
    var height: float = floor_hit.position.y - global_position.y + safe_margin
    if height <= 0.01 or height > step_height: return false
    var rise := Vector3.UP * height
    if test_move(global_transform, rise): return false
    var raised := global_transform
    raised.origin += rise
    if test_move(raised, motion): return false
    global_transform = raised
    return true

func take_damage(amount: int = 1) -> bool:
    if amount <= 0 or health <= 0 or _invulnerability > 0.0: return false
    health = maxi(0, health - amount)
    _invulnerability = 1.0
    damaged.emit(health)
    if health == 0:
        controls_enabled = false
        died.emit()
    return true

func reset_at(point: Vector3) -> void:
    global_position = point
    velocity = Vector3.ZERO
    health = max_health
    _jump_buffer = 0.0
    _coyote = 0.0
    _dash = 0.0
    _cooldown = 0.0
    _invulnerability = 0.0
    facing = Vector3.FORWARD
    controls_enabled = true
    motion_state = &"idle"
`;

export const ADVENTURE_CAMERA = `extends Node3D
class_name NoobiAdventureCamera

signal focus_lost
@export var target: CharacterBody3D
@export var distance := 5.0
@export var sensitivity := 0.003
@export var capture_on_left_click := true
@export var collision_mask := 1
var enabled := true
var arm: SpringArm3D
var camera: Camera3D
var _pitch := -0.22
var _dragging := false
var _last_pointer := Vector2.ZERO
var _web_window: JavaScriptObject
var _web_document: JavaScriptObject
var _blur_callback: JavaScriptObject
var _visibility_callback: JavaScriptObject

func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    arm = SpringArm3D.new()
    arm.spring_length = distance
    arm.margin = 0.18
    arm.collision_mask = collision_mask
    var shape := SphereShape3D.new()
    shape.radius = 0.18
    arm.shape = shape
    add_child(arm)
    if is_instance_valid(target): arm.add_excluded_object(target.get_rid())
    arm.rotation.x = _pitch
    camera = Camera3D.new()
    camera.current = true
    camera.near = 0.06
    arm.add_child(camera)
    if OS.has_feature("web"):
        _web_window = JavaScriptBridge.get_interface("window")
        _web_document = JavaScriptBridge.get_interface("document")
        _blur_callback = JavaScriptBridge.create_callback(_on_web_blur)
        _visibility_callback = JavaScriptBridge.create_callback(_on_web_visibility)
        _web_window.addEventListener("blur", _blur_callback)
        _web_document.addEventListener("visibilitychange", _visibility_callback)

func _exit_tree() -> void:
    if _web_window != null: _web_window.removeEventListener("blur", _blur_callback)
    if _web_document != null: _web_document.removeEventListener("visibilitychange", _visibility_callback)

func _on_web_blur(_arguments: Array) -> void:
    _lose_focus()

func _on_web_visibility(_arguments: Array) -> void:
    if _web_document.hidden: _lose_focus()

func _lose_focus() -> void:
    if not enabled: return
    enabled = false
    release_pointer()
    focus_lost.emit()

func _unhandled_input(event: InputEvent) -> void:
    if not enabled or get_tree().paused: return
    if event is InputEventMouseButton:
        if event.button_index == MOUSE_BUTTON_LEFT and event.pressed and capture_on_left_click:
            Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
        elif event.button_index == MOUSE_BUTTON_RIGHT:
            _dragging = event.pressed
            _last_pointer = event.position
    if event is InputEventMouseMotion and (Input.mouse_mode == Input.MOUSE_MODE_CAPTURED or _dragging):
        # Uncaptured drag uses absolute cursor displacement; relative/raw mouse
        # deltas can be unavailable in embedded browser environments.
        var movement: Vector2 = event.relative if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED else event.position - _last_pointer
        _last_pointer = event.position
        rotation.y -= movement.x * sensitivity
        _pitch = clampf(_pitch - movement.y * sensitivity, -1.15, 0.65)
        arm.rotation.x = _pitch

func release_pointer() -> void:
    _dragging = false
    Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
    for action: StringName in InputMap.get_actions():
        if String(action).begins_with("noobi_"): Input.action_release(action)

func _notification(what: int) -> void:
    if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
        _lose_focus()

func resume_controls() -> void:
    # Reacquire pointer only from a new user click; never trap focus after Alt-Tab.
    enabled = true
    release_pointer()
`;

export const ADVENTURE_INTERACTABLE = `extends Area3D
class_name NoobiInteractable

signal activated(actor: Node3D)
signal rejected(reason: String)
@export var interaction_id := ""
@export var prompt := "交互"
@export var max_distance := 2.2
@export var one_shot := false
@export var enabled := true
@export var obstruction_mask := 1
var consumed := false
# An application-owned predicate, e.g. inventory.has_key; never an input cheat.
var can_activate: Callable

func _ready() -> void:
    add_to_group("noobi_interactable")

func try_activate(actor: Node3D) -> bool:
    if not enabled or consumed or not is_instance_valid(actor): return false
    if actor.global_position.distance_to(global_position) > max_distance:
        rejected.emit("距离太远")
        return false
    var excluded: Array[RID] = [get_rid()]
    if actor is CollisionObject3D: excluded.append(actor.get_rid())
    var ray := PhysicsRayQueryParameters3D.create(actor.global_position + Vector3.UP * 0.8, global_position + Vector3.UP * 0.4, obstruction_mask, excluded)
    if not get_world_3d().direct_space_state.intersect_ray(ray).is_empty():
        rejected.emit("前方有障碍")
        return false
    if can_activate.is_valid() and not bool(can_activate.call(actor)):
        rejected.emit("尚未满足条件")
        return false
    # Commit first so duplicate input/callbacks cannot award twice.
    if one_shot: consumed = true
    activated.emit(actor)
    return true
`;

export const ADVENTURE_INTERACTOR = `extends Node
class_name NoobiInteractor
signal prompt_changed(text: String)
signal interaction_failed(reason: String)
@export var actor: CharacterBody3D
var enabled := true
var _target: Area3D
var _prompt := ""

func _physics_process(_delta: float) -> void:
    if not enabled or not is_instance_valid(actor) or actor.get("controls_enabled") == false:
        _set_target(null)
        return
    var nearest: Area3D = null
    var distance := INF
    for candidate: Node in get_tree().get_nodes_in_group("noobi_interactable"):
        if not candidate is Area3D or not candidate.enabled or candidate.consumed: continue
        var current: float = actor.global_position.distance_to(candidate.global_position)
        if current <= candidate.max_distance and current < distance:
            nearest = candidate
            distance = current
    _set_target(nearest)
    if Input.is_action_just_pressed("noobi_interact"):
        if not is_instance_valid(_target) or not _target.try_activate(actor): interaction_failed.emit("当前无法交互")

func _set_target(value: Area3D) -> void:
    _target = value
    var text: String = value.prompt if is_instance_valid(value) else ""
    if text != _prompt:
        _prompt = text
        prompt_changed.emit(text)
`;

export const ADVENTURE_COMBAT = `extends Node3D
class_name NoobiMelee
signal hit(target: Node3D)
signal missed
@export var actor: CharacterBody3D
@export var reach := 1.9
@export var cone_degrees := 65.0
@export var damage := 1
@export var cooldown := 0.55
@export var target_group := "noobi_damageable"
@export var obstruction_mask := 1
var enabled := true
var _remaining := 0.0

func _physics_process(delta: float) -> void:
    _remaining = maxf(0.0, _remaining - delta)
    if enabled and is_instance_valid(actor) and Input.is_action_just_pressed("noobi_attack"):
        attack()

func attack() -> bool:
    if not enabled or not is_instance_valid(actor) or actor.get("controls_enabled") == false or _remaining > 0.0: return false
    _remaining = cooldown
    var chosen: Node3D = null
    var nearest := reach
    var facing: Vector3 = actor.facing
    for candidate: Node in get_tree().get_nodes_in_group(target_group):
        if candidate == actor or not candidate is Node3D or not candidate.has_method("take_damage"): continue
        var offset: Vector3 = candidate.global_position - actor.global_position
        var distance := offset.length()
        if distance > nearest: continue
        var horizontal := Vector3(offset.x, 0, offset.z).normalized()
        if horizontal.dot(facing) < cos(deg_to_rad(cone_degrees)): continue
        var excluded: Array[RID] = [actor.get_rid()]
        if candidate is CollisionObject3D: excluded.append(candidate.get_rid())
        var ray := PhysicsRayQueryParameters3D.create(actor.global_position + Vector3.UP, candidate.global_position + Vector3.UP, obstruction_mask, excluded)
        if not get_world_3d().direct_space_state.intersect_ray(ray).is_empty(): continue
        chosen = candidate
        nearest = distance
    if is_instance_valid(chosen) and chosen.take_damage(damage):
        hit.emit(chosen)
        return true
    missed.emit()
    return false
`;

export const ADVENTURE_KIT_GUIDE = `# Noobi adventure kit v1

Opt-in components for Godot 4 third-person games, not an existing game or approved art.
The workspace starts neutral. Only use the mechanics selected in the user's plan.

- adventure_controller_v1.gd: CharacterBody3D, origin at feet, CollisionShape3D capsule centered above feet. Physics ticks drive movement, floor snap, bounded step climbing, coyote/buffered jump, unlocked dash, health and motion signals. Keep imported model/AnimationTree under a separate visual child and assign it to visual. Assign the actual Camera3D for camera-relative controls. Bind motion_changed to real animation clips; named states alone are not animation evidence.
- adventure_camera_v1.gd: Node3D at shoulder height, preferably a child of the non-rotating physics body. Assign target BEFORE adding to the tree; its camera and sphere SpringArm are created in _ready. Collision mask must contain actual level solids and exclude the player. Left click requests pointer capture; right-button drag remains usable when the browser denies capture. Set capture_on_left_click=false for a drag-only control scheme and show the actual scheme in the HUD. Never describe failed capture as success. On focus_lost the game must pause and show a resume control. resume_controls releases stale inputs and waits for a new user click.
- interactable_v1.gd: Area3D with authored stable interaction_id, shape and visible object. Set max_distance, one_shot and can_activate predicate. Put the origin at the interactable's reachable use point, outside its solid collision. Recheck distance/occlusion/condition at activation. One-shot consumption commits before the reward signal to prevent duplicate rewards.
- interactor_v1.gd: Node, assign actor. Wire prompt_changed and interaction_failed into visible UI. Disable during menus/death. Predicates and saved consumed IDs belong to the game's state model.
- melee_v1.gd: optional Node3D. Assign actor, register actual enemy bodies in noobi_damageable. It distinguishes a miss from a nearby target inside the facing cone and checks wall occlusion, cooldown and the target's take_damage result. Generated enemy AI supplies telegraph/response/recovery; this is not a complete enemy.

- enemy_v1.gd: optional CharacterBody3D enemy with chase, visible windup, single strike, recovery, hurt and dead states. Supply a real collider/visual and connect state_changed to animation/telegraph feedback. Assign a NavigationAgent3D and baked navigation for obstacle routing; without it the enemy only follows an unobstructed line of sight and stops at walls. This is a basic melee behavior, not a universal enemy AI.

InputMap actions: noobi_left/right/forward/back, noobi_jump, noobi_ability, noobi_interact, noobi_attack. Use explicit remappable bindings matching displayed prompts. Pause stops the SceneTree; UI runs PROCESS_MODE_ALWAYS and must not route menu clicks to combat. Controllers and interaction/combat use the physics frame, normally 60 Hz, independent of display cap. Do not change speed or collision to fit a canned test.

Keep saves and gameplay rules in separate components, validate before applying state, and respawn at authored safe checkpoints. Geometry validation needs real movement on slopes/steps, wall/corner/edge tests, jump/dash, focused and unfocused pointer states, and at least two cameras/screenshots. These scripts do not certify final art, animation, game duration or autonomous generation.
`;
export const ADVENTURE_KIT_FILES: Record<string, string> = {
  'runtime/noobi/adventure_controller_v1.gd': ADVENTURE_CONTROLLER,
  'runtime/noobi/adventure_camera_v1.gd': ADVENTURE_CAMERA,
  'runtime/noobi/interactable_v1.gd': ADVENTURE_INTERACTABLE,
  'runtime/noobi/interactor_v1.gd': ADVENTURE_INTERACTOR,
  'runtime/noobi/melee_v1.gd': ADVENTURE_COMBAT,
  'runtime/noobi/enemy_v1.gd': ADVENTURE_ENEMY,
  'runtime/noobi/ADVENTURE_V1.md': ADVENTURE_KIT_GUIDE,
};
