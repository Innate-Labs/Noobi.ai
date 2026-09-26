/** Named skeleton sockets and read-only sole probes; no automatic retargeting or IK. */
export const ADVENTURE_RIG = `extends Node
class_name NoobiAdventureRig
signal binding_failed(reason: String)
@export var actor: CharacterBody3D
@export var skeleton: Skeleton3D
# id -> {bone: String, offset: Transform3D}; offset uses skeleton-local units.
@export var socket_specs: Dictionary = {}
# Exactly two sole probes for this biped component, same schema as sockets.
@export var sole_specs: Dictionary = {}
@export var ground_mask := 1
@export var probe_up := 0.25
@export var probe_down := 0.8
@export var contact_tolerance := 0.04
var failure := ""
var sockets: Dictionary = {}
var _soles: Dictionary = {}
var _attachments: Array[BoneAttachment3D] = []

func _ready() -> void:
    process_mode = Node.PROCESS_MODE_PAUSABLE
    if not is_instance_valid(actor) or not is_instance_valid(skeleton) or not is_instance_valid(actor.get("visual")) or not actor.visual.is_ancestor_of(skeleton):
        _fail("Assign the actor's own visual Skeleton3D before adding the rig.")
        return
    if socket_specs.size() > 12 or sole_specs.size() != 2:
        _fail("Use at most 12 sockets and exactly two named sole probes.")
        return
    for specs in [socket_specs, sole_specs]:
        for id in specs:
            var spec: Variant = specs[id]
            if not spec is Dictionary or not spec.get("bone") is String or skeleton.find_bone(spec.get("bone", "")) < 0:
                _fail("Missing named bone for " + str(id))
                return
            if not spec.get("offset", Transform3D.IDENTITY) is Transform3D or not spec.get("offset", Transform3D.IDENTITY).is_finite():
                _fail("Invalid local offset for " + str(id))
                return
    for id in socket_specs:
        sockets[id] = _attach(str(id), socket_specs[id])
    for id in sole_specs:
        _soles[id] = _attach("sole_" + str(id), sole_specs[id])

func _attach(id: String, spec: Dictionary) -> Node3D:
    var attachment := BoneAttachment3D.new()
    attachment.name = "NoobiBone_" + id.validate_node_name()
    attachment.bone_name = spec.bone
    attachment.override_pose = false
    skeleton.add_child(attachment)
    _attachments.append(attachment)
    var socket := Node3D.new()
    socket.name = "Socket"
    socket.transform = spec.get("offset", Transform3D.IDENTITY)
    attachment.add_child(socket)
    attachment.on_skeleton_update()
    return socket

func _fail(reason: String) -> void:
    failure = reason
    binding_failed.emit(reason)
    push_warning("NOOBI_RIG_BINDING: " + reason)

func get_socket(id: String) -> Node3D:
    if not failure.is_empty(): return null
    return sockets.get(id)

func sample_ground() -> Dictionary:
    if not failure.is_empty(): return {"valid":false,"reason":failure}
    if not is_instance_valid(actor) or not is_instance_valid(skeleton):
        return {"valid":false,"reason":"Actor or skeleton was removed."}
    var results := {}
    var grounded := actor.is_on_floor()
    for id in _soles:
        var socket: Node3D = _soles[id]
        if not is_instance_valid(socket): return {"valid":false,"reason":"Sole attachment was removed."}
        # Read current skeleton pose, not last rendered attachment transform.
        var spec: Dictionary = sole_specs[id]
        var bone := skeleton.find_bone(spec.bone)
        if bone < 0: return {"valid":false,"reason":"Skeleton changed; rebuild named bindings."}
        var transform: Transform3D = skeleton.global_transform * skeleton.get_bone_global_pose(bone) * spec.get("offset", Transform3D.IDENTITY)
        var point := transform.origin
        var query := PhysicsRayQueryParameters3D.create(point + Vector3.UP * clampf(probe_up, 0.01, 1.0), point - Vector3.UP * clampf(probe_down, 0.01, 3.0), ground_mask, [actor.get_rid()])
        var hit := actor.get_world_3d().direct_space_state.intersect_ray(query)
        var result := {"position":point,"surfaceFound":not hit.is_empty(),"contact":false,"penetrating":false}
        if not hit.is_empty():
            var gap: float = point.y - hit.position.y
            result["gap"] = gap
            result["normal"] = hit.normal
            result["walkable"] = hit.normal.dot(Vector3.UP) >= cos(actor.floor_max_angle)
            result["contact"] = grounded and result.walkable and absf(gap) <= clampf(contact_tolerance, 0.001, 0.1)
            result["penetrating"] = gap < -clampf(contact_tolerance, 0.001, 0.1)
        results[id] = result
    return {"valid":true,"grounded":grounded,"feet":results}

func _exit_tree() -> void:
    for attachment in _attachments:
        if is_instance_valid(attachment): attachment.queue_free()
    sockets.clear()
    _soles.clear()
`;
