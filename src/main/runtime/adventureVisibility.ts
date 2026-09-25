// Explicitly authored foreground occluders only; never remove gameplay collision.
export const ADVENTURE_VISIBILITY = `extends Node
class_name NoobiAdventureVisibility

signal unsupported_occluder(path: NodePath)
@export var camera: Camera3D
@export var target: Node3D
@export var enabled := true
@export var collision_mask := 1
@export_range(0.0, 1.0) var foreground_alpha := 0.18
@export var focus_distance := 16.0
const MAX_FOCUS := 8
const MAX_LAYERS := 4
const MAX_MESHES := 128
var ray_count := 0
var _faded: Dictionary = {}
var _warned: Dictionary = {}

func _physics_process(_delta: float) -> void:
    ray_count = 0
    for mesh in _warned.keys():
        if not is_instance_valid(mesh): _warned.erase(mesh)
    if not enabled or not is_instance_valid(camera) or not camera.is_current() or not is_instance_valid(target):
        restore_all()
        return
    var focus: Array[Node3D] = [target]
    var candidates: Array[Node3D] = []
    for node: Node in get_tree().get_nodes_in_group("noobi_camera_focus"):
        if node is Node3D and node != target and node.is_visible_in_tree() and node.global_position.distance_to(target.global_position) <= focus_distance:
            candidates.append(node)
    candidates.sort_custom(func(a: Node3D, b: Node3D): return a.global_position.distance_squared_to(target.global_position) < b.global_position.distance_squared_to(target.global_position))
    for node: Node3D in candidates.slice(0, MAX_FOCUS - 1): focus.append(node)
    var touched: Dictionary = {}
    var visited_bodies: Dictionary = {}
    for node: Node3D in focus:
        var height := clampf(float(node.get_meta("noobi_focus_height", 1.6)), 0.0, 8.0)
        var radius := clampf(float(node.get_meta("noobi_focus_radius", 0.4)), 0.0, 8.0)
        var base := node.global_position + Vector3.UP * 0.08
        # Feet, torso, head, and the footprint of a telegraph/interaction zone.
        var points: Array[Vector3] = [base, base + Vector3.UP * height * 0.5, base + Vector3.UP * height,
            base + Vector3.RIGHT * radius, base + Vector3.LEFT * radius,
            base + Vector3.FORWARD * radius, base + Vector3.BACK * radius]
        for point: Vector3 in points:
            if camera.is_position_behind(point): continue
            if not camera.get_viewport().get_visible_rect().has_point(camera.unproject_position(point)): continue
            _trace(point, node, touched, visited_bodies)
    for mesh in _faded.keys():
        if not is_instance_valid(mesh): _faded.erase(mesh)
        elif not touched.has(mesh): _restore(mesh)
    for mesh in touched:
        if not _faded.has(mesh) and _faded.size() < MAX_MESHES: _fade(mesh)

func _trace(point: Vector3, focus: Node3D, touched: Dictionary, visited_bodies: Dictionary) -> void:
    var excluded: Array[RID] = []
    if target is CollisionObject3D: excluded.append(target.get_rid())
    if focus is CollisionObject3D and focus != target: excluded.append(focus.get_rid())
    for layer in MAX_LAYERS:
        var query := PhysicsRayQueryParameters3D.create(camera.global_position, point, collision_mask, excluded)
        ray_count += 1
        var hit := camera.get_world_3d().direct_space_state.intersect_ray(query)
        if hit.is_empty(): return
        var body = hit.collider
        # Only explicit static foreground bodies may be faded. Stop at opaque
        # gameplay blockers; do not reveal enemies through unmarked walls.
        if not body is StaticBody3D or not body.is_in_group("noobi_camera_occluder"): return
        if not visited_bodies.has(body):
            visited_bodies[body] = true
            _collect_meshes(body, touched)
        excluded.append(body.get_rid())

func _collect_meshes(root: Node, touched: Dictionary) -> void:
    var pending: Array[Node] = [root]
    var visited := 0
    while not pending.is_empty() and visited < 256 and touched.size() < MAX_MESHES:
        var node: Node = pending.pop_back()
        visited += 1
        if node is MeshInstance3D and node.is_visible_in_tree(): touched[node] = true
        for child: Node in node.get_children():
            if not child is CollisionObject3D: pending.append(child)

func _copy_material(material: Material) -> BaseMaterial3D:
    var copy: BaseMaterial3D = material.duplicate() if material is BaseMaterial3D else StandardMaterial3D.new()
    copy.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    var color := copy.albedo_color
    color.a = minf(color.a, foreground_alpha)
    copy.albedo_color = color
    return copy

func _fade(mesh: MeshInstance3D) -> void:
    if mesh.mesh == null: return
    var materials: Array[Material] = []
    if mesh.material_override != null: materials.append(mesh.material_override)
    else:
        for index in mesh.mesh.get_surface_count(): materials.append(mesh.get_active_material(index))
    var supported := mesh.material_overlay == null
    for material: Material in materials:
        if material != null and (not material is BaseMaterial3D or material.next_pass != null): supported = false
    if not supported:
        if not _warned.has(mesh):
            _warned[mesh] = true
            unsupported_occluder.emit(mesh.get_path())
            push_warning("NOOBI_CAMERA_OCCLUDER_UNSUPPORTED: " + str(mesh.get_path()))
        return
    var original: Array[Material] = []
    var replacements: Array[Material] = []
    if mesh.material_override != null:
        original.append(mesh.material_override)
        replacements.append(_copy_material(mesh.material_override))
        mesh.material_override = replacements[0]
    else:
        for index in mesh.mesh.get_surface_count():
            original.append(mesh.get_surface_override_material(index))
            replacements.append(_copy_material(materials[index]))
            mesh.set_surface_override_material(index, replacements[index])
    _faded[mesh] = {"override": mesh.material_override != null, "original": original, "replacements": replacements}

func _restore(mesh: MeshInstance3D) -> void:
    var record: Dictionary = _faded[mesh]
    if record.override:
        if mesh.material_override == record.replacements[0]: mesh.material_override = record.original[0]
    else:
        for index in mini(mesh.mesh.get_surface_count() if mesh.mesh != null else 0, record.original.size()):
            if mesh.get_surface_override_material(index) == record.replacements[index]: mesh.set_surface_override_material(index, record.original[index])
    _faded.erase(mesh)

func restore_all() -> void:
    for mesh in _faded.keys():
        if is_instance_valid(mesh): _restore(mesh)
        else: _faded.erase(mesh)

func _exit_tree() -> void:
    restore_all()
`;
