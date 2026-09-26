export const ADVENTURE_ENEMY = `extends CharacterBody3D
class_name NoobiAdventureEnemy
signal state_changed(state: StringName)
signal damaged(health: int)
signal died
@export var target: CharacterBody3D
@export var navigation: NavigationAgent3D
@export var max_health := 3
@export var speed := 2.4
@export var detection_distance := 8.0
@export var attack_distance := 1.5
@export var windup_time := 0.55
@export var recovery_time := 0.8
@export var obstruction_mask := 1
var health := 3
var state: StringName = &"idle"
var enabled := true
# Optional assembly gate; independent from an author disabling AI.
var objective_locked := false
var _timer := 0.0
var _invulnerability := 0.0
var _strike_direction := Vector3.FORWARD

func _ready() -> void:
    health = max_health
    floor_snap_length = 0.3
    add_to_group("noobi_damageable")
    add_to_group("noobi_camera_focus")

func _physics_process(delta: float) -> void:
    _timer = maxf(0.0, _timer - delta)
    _invulnerability = maxf(0.0, _invulnerability - delta)
    velocity.x = 0.0
    velocity.z = 0.0
    if not is_on_floor(): velocity.y = maxf(-40.0, velocity.y - 22.0 * delta)
    if objective_locked or not enabled or health <= 0 or not is_instance_valid(target) or target.get("health") == 0:
        move_and_slide()
        return
    var offset := target.global_position - global_position
    var horizontal := Vector3(offset.x, 0, offset.z)
    if state == &"windup":
        if _timer <= 0.0:
            if offset.length() <= attack_distance and horizontal.normalized().dot(_strike_direction) > 0.6 and _visible_target():
                target.take_damage(1)
            _set_state(&"recover", recovery_time)
    elif state == &"recover" or state == &"hurt":
        if _timer <= 0.0: _set_state(&"idle")
    elif offset.length() <= detection_distance:
        if offset.length() <= attack_distance and _visible_target():
            _strike_direction = horizontal.normalized()
            _set_state(&"windup", windup_time)
        else:
            var direction := Vector3.ZERO
            if is_instance_valid(navigation):
                navigation.target_position = target.global_position
                if not navigation.is_navigation_finished(): direction = navigation.get_next_path_position() - global_position
            elif _visible_target(): direction = horizontal
            direction.y = 0.0
            direction = direction.normalized()
            velocity.x = direction.x * speed
            velocity.z = direction.z * speed
            _set_state(&"chase" if direction.length_squared() > 0.0 else &"idle")
    else: _set_state(&"idle")
    move_and_slide()

func _visible_target() -> bool:
    var query := PhysicsRayQueryParameters3D.create(global_position + Vector3.UP, target.global_position + Vector3.UP, obstruction_mask, [get_rid(), target.get_rid()])
    return get_world_3d().direct_space_state.intersect_ray(query).is_empty()

func _set_state(value: StringName, duration := 0.0) -> void:
    if value == state: return
    state = value
    _timer = duration
    state_changed.emit(state)

func set_objective_locked(value: bool) -> void:
    if objective_locked == value: return
    objective_locked = value
    velocity.x = 0.0
    velocity.z = 0.0
    _set_state(&"idle")
    _timer = 0.0

func take_damage(amount: int = 1) -> bool:
    if objective_locked or health <= 0 or amount <= 0 or _invulnerability > 0.0: return false
    health = maxi(0, health - amount)
    _invulnerability = 0.2
    damaged.emit(health)
    if health == 0:
        _set_state(&"dead")
        died.emit()
    else: _set_state(&"hurt", 0.25)
    return true
`;
