/** Versioned controller supplied to new Godot workspaces. Rendering and level
 * design remain separate, so generated art cannot replace physics behavior. */
export const PLATFORMER_KIT_VERSION = 1;
export const PLATFORMER_CONTROLLER = `extends CharacterBody2D
class_name NoobiPlatformerController

signal landed
signal dashed
signal damaged(remaining_health: int)
signal died

@export var run_speed := 330.0
@export var acceleration := 1900.0
@export var air_acceleration := 1050.0
@export var gravity := 1850.0
@export var jump_speed := 680.0
@export var dash_speed := 900.0
@export var dash_duration := 0.20
@export var dash_cooldown := 0.62
@export var max_health := 3
var health := 3
var facing := 1.0
var coyote_remaining := 0.0
var jump_buffer_remaining := 0.0
var dash_remaining := 0.0
var cooldown_remaining := 0.0
var invulnerability_remaining := 0.0
var controls_enabled := true
var motion_state: StringName = &"idle"

func _ready() -> void:
    health = max_health

func _physics_process(delta: float) -> void:
    if not controls_enabled or health <= 0:
        return
    var was_on_floor := is_on_floor()
    coyote_remaining = 0.11 if was_on_floor else maxf(0.0, coyote_remaining - delta)
    jump_buffer_remaining = maxf(0.0, jump_buffer_remaining - delta)
    cooldown_remaining = maxf(0.0, cooldown_remaining - delta)
    invulnerability_remaining = maxf(0.0, invulnerability_remaining - delta)
    if Input.is_action_just_pressed("jump"):
        jump_buffer_remaining = 0.12
    var direction := Input.get_axis("move_left", "move_right")
    if absf(direction) > 0.01:
        facing = signf(direction)
    if Input.is_action_just_pressed("dash") and cooldown_remaining <= 0.0:
        dash_remaining = dash_duration
        cooldown_remaining = dash_cooldown
        dashed.emit()
    if dash_remaining > 0.0:
        dash_remaining = maxf(0.0, dash_remaining - delta)
        velocity = Vector2(facing * dash_speed, 0.0)
        motion_state = &"dash"
    else:
        velocity.x = move_toward(velocity.x, direction * run_speed, (acceleration if was_on_floor else air_acceleration) * delta)
        if not was_on_floor:
            velocity.y = minf(1200.0, velocity.y + gravity * delta)
        if jump_buffer_remaining > 0.0 and coyote_remaining > 0.0:
            velocity.y = -jump_speed
            jump_buffer_remaining = 0.0
            coyote_remaining = 0.0
        if Input.is_action_just_released("jump") and velocity.y < -200.0:
            velocity.y *= 0.55
        motion_state = &"jump" if not was_on_floor else (&"run" if absf(velocity.x) > 8.0 else &"idle")
    move_and_slide()
    if not was_on_floor and is_on_floor():
        landed.emit()

func take_damage(amount: int = 1) -> void:
    if amount <= 0 or health <= 0 or invulnerability_remaining > 0.0:
        return
    health = maxi(0, health - amount)
    invulnerability_remaining = 1.0
    damaged.emit(health)
    if health == 0:
        controls_enabled = false
        died.emit()

func reset_at(spawn_position: Vector2) -> void:
    global_position = spawn_position
    velocity = Vector2.ZERO
    health = max_health
    facing = 1.0
    coyote_remaining = 0.0
    jump_buffer_remaining = 0.0
    dash_remaining = 0.0
    cooldown_remaining = 0.0
    invulnerability_remaining = 0.0
    controls_enabled = true
    motion_state = &"idle"
`;

export const PLATFORMER_KIT_GUIDE = `# Noobi platformer controller v1

Attach runtime/noobi/platformer_controller.gd to CharacterBody2D, with a CollisionShape2D child.
Bind move_left, move_right, jump and dash in InputMap. Drive an AnimatedSprite2D from motion_state;
keep visual sprite scale/anchor separate from the collision shape. Use positive explicit render layers
for world platforms and foreground; put backgrounds in a separate lower layer.

The controller supplies acceleration, coyote time, buffered/variable jumps, bounded dash cooldown,
health, invulnerability and complete reset. It does not supply a level, art, sound, enemies or game goals.
Its presence is not evidence of a complete or polished game. Use real input tests for reachability,
cooldown, damage, death and replay after integrating art and collision geometry.
`;
