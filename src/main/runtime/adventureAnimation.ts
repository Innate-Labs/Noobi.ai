/** Optional state adapter; owns one AnimationPlayer, never the physics body. */
export const ADVENTURE_ANIMATION = `extends Node
class_name NoobiAdventureAnimation
signal state_changed(state: StringName, clip: StringName)
signal binding_failed(reason: String)
@export var actor: CharacterBody3D
@export var player: AnimationPlayer
@export var melee: Node3D
@export var blend_seconds := 0.12
@export var clips: Dictionary = {}
var active_state: StringName = &""
var failure := ""
var _attack := false
var _restart_attack := false
var _last_health := 0

func _ready() -> void:
    process_mode = Node.PROCESS_MODE_PAUSABLE
    if not is_instance_valid(actor) or not is_instance_valid(player) or not is_instance_valid(actor.get("visual")):
        _fail("Assign an adventure actor, visual and AnimationPlayer before adding the adapter.")
        return
    var visual: Node = actor.visual
    if not visual.find_children("*", "CollisionObject3D", true, false).is_empty() or not visual.find_children("*", "CollisionShape3D", true, false).is_empty() or not visual.find_children("*", "CollisionPolygon3D", true, false).is_empty():
        _fail("Visual subtree must not contain physics bodies or collision shapes.")
        return
    if not visual.is_ancestor_of(player):
        _fail("AnimationPlayer must belong to the actor's separate visual subtree.")
        return
    var required := ["idle", "run", "jump", "fall", "hurt", "dead"]
    if actor.dash_unlocked: required.append("dash")
    if is_instance_valid(melee): required.append("attack")
    for state in required:
        if not clips.has(state):
            _fail("Missing state mapping: " + state)
            return
    var root := player.get_node_or_null(player.root_node)
    var used := {}
    for state in clips:
        var clip := StringName(clips[state])
        if used.has(clip) or not player.has_animation(clip):
            _fail("Missing or shared state clip: " + str(clip))
            return
        used[clip] = true
        var animation := player.get_animation(clip)
        if animation.length <= 0.0 or animation.get_track_count() == 0:
            _fail("Empty state clip: " + str(clip))
            return
        for index in animation.get_track_count():
            var path := animation.track_get_path(index)
            var target: Node = root.get_node_or_null(NodePath(path.get_concatenated_names())) if root != null else null
            if target == null or not visual.is_ancestor_of(target):
                _fail("Track must target a child of visual, never the controller/collider: " + str(path))
                return
            if target is Skeleton3D and (path.get_subname_count() != 1 or target.find_bone(String(path.get_subname(0))) < 0):
                _fail("Missing imported bone in track: " + str(path))
                return
            if animation.track_get_type(index) == Animation.TYPE_BLEND_SHAPE and (not target is MeshInstance3D or path.get_subname_count() != 1 or target.find_blend_shape_by_name(StringName(path.get_subname(0))) < 0):
                _fail("Missing imported blend shape in track: " + str(path))
                return
            if animation.track_get_type(index) not in [Animation.TYPE_POSITION_3D, Animation.TYPE_ROTATION_3D, Animation.TYPE_SCALE_3D, Animation.TYPE_BLEND_SHAPE]:
                _fail("Only visual transform/bone/blend-shape tracks are supported: " + str(path))
                return
    # Private libraries keep per-state loop policy from mutating imported/shared resources.
    for library_name in player.get_animation_library_list():
        var library := player.get_animation_library(library_name).duplicate(true) as AnimationLibrary
        player.remove_animation_library(library_name)
        player.add_animation_library(library_name, library)
    for state in clips:
        player.get_animation(clips[state]).loop_mode = Animation.LOOP_LINEAR if state in ["idle", "run", "fall"] else Animation.LOOP_NONE
    player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
    player.animation_finished.connect(_finished)
    process_physics_priority = actor.process_physics_priority + 1
    if is_instance_valid(melee):
        if not melee.has_signal("hit") or not melee.has_signal("missed") or melee.get("actor") != actor:
            _fail("Melee must be the same actor's NoobiMelee component.")
            return
        process_physics_priority = maxi(process_physics_priority, melee.process_physics_priority + 1)
        if melee.has_signal("attack_started"):
            if float(melee.get("windup_time")) >= player.get_animation(clips["attack"]).length:
                _fail("Melee impact time must precede the attack clip end.")
                return
            melee.attack_started.connect(_swing)
            melee.attack_cancelled.connect(_cancel_attack)
        else:
            melee.hit.connect(_hit)
            melee.missed.connect(_swing)
    _last_health = actor.health

func _fail(reason: String) -> void:
    failure = reason
    if is_instance_valid(player): player.stop()
    set_physics_process(false)
    binding_failed.emit(reason)
    push_warning("NOOBI_ANIMATION_BINDING: " + reason)

func _cancel_attack() -> void:
    _attack = false
    _restart_attack = false

func _hit(_target: Node3D) -> void:
    _swing()

func _swing() -> void:
    if actor.health > 0 and actor.controls_enabled and not get_tree().paused:
        _attack = true
        _restart_attack = true

func _finished(clip: StringName) -> void:
    if active_state == &"attack" and clip == StringName(clips.get("attack", "")): _attack = false

func _physics_process(delta: float) -> void:
    if not is_instance_valid(actor) or not is_instance_valid(player):
        _fail("Actor or AnimationPlayer was removed.")
        return
    if _last_health <= 0 and actor.health > 0:
        _attack = false
        active_state = &""
    _last_health = actor.health
    var next: StringName = actor.motion_state
    if actor.health <= 0: next = &"dead"
    if next in [&"dead", &"hurt", &"dash"] or not actor.controls_enabled: _attack = false
    if _attack: next = &"attack"
    if not clips.has(String(next)):
        _fail("Unmapped live state: " + String(next))
        return
    if next != active_state:
        active_state = next
        var clip := StringName(clips[String(next)])
        player.play(clip, clampf(blend_seconds, 0.0, 0.5))
        state_changed.emit(next, clip)
    elif next == &"attack" and _restart_attack:
        player.seek(0.0, true)
    _restart_attack = false
    player.advance(delta)
`;
