/** Host-installed observations of the entire loaded scene, independent of the
 * game's declared asset list. Frustum membership is not occlusion proof. */
export const SCENE_PROBE_3D = `
func _physics_process(_delta: float) -> void:
    var now: int = Time.get_ticks_msec()
    for key in contact_history.keys():
        if now - int(contact_history[key]["time"]) > 1500:
            contact_history.erase(key)
    var scene: Node = get_tree().current_scene
    if scene == null or get_tree().paused:
        return
    for reference: WeakRef in watched_bodies:
        var body: CharacterBody3D = reference.get_ref() as CharacterBody3D
        if not is_instance_valid(body) or not scene.is_ancestor_of(body):
            continue
        for index in range(mini(body.get_slide_collision_count(), 16)):
            var collider: Object = body.get_slide_collision(index).get_collider()
            if collider is Node and scene.is_ancestor_of(collider):
                var body_path: String = str(scene.get_path_to(body))
                var path: String = str(scene.get_path_to(collider))
                if contact_history.size() >= 512 and not contact_history.has(body_path + "|" + path):
                    contact_overflow_until = now + 1500
                    continue
                contact_history[body_path + "|" + path] = {"body": body_path, "path": path, "time": now, "engineFrame": Engine.get_process_frames()}

func _scene_item(node: Node, scene: Node) -> void:
    if not node is Node3D:
        return
    var relevant: bool = node is VisualInstance3D or node is CollisionShape3D or node is CollisionObject3D or node is Camera3D
    if not relevant:
        return
    if scene_nodes.size() >= 600:
        scene_truncated = true
        return
    var item := {"path": str(scene.get_path_to(node)), "class": node.get_class(), "position": _v3(node.global_position), "visible": node.is_visible_in_tree()}
    if node is Camera3D:
        item["kind"] = "camera"
        item["current"] = node.is_current()
        item["rotation"] = _v3(node.global_rotation)
    elif node is CollisionShape3D:
        item["kind"] = "shape"
        item["enabled"] = not node.disabled and node.shape != null
        item["body"] = str(scene.get_path_to(node.get_parent()))
        item["shape"] = node.shape.get_class() if node.shape else "missing"
    elif node is CollisionObject3D:
        item["kind"] = "body"
        item["layer"] = node.collision_layer
        item["mask"] = node.collision_mask
        if node is CharacterBody3D:
            var contacts: Array = []
            for index in range(mini(node.get_slide_collision_count(), 16)):
                var collider: Object = node.get_slide_collision(index).get_collider()
                if collider is Node and scene.is_ancestor_of(collider):
                    contacts.append(str(scene.get_path_to(collider)))
            if watched_bodies.size() < 64:
                watched_bodies.append(weakref(node))
            else:
                scene_truncated = true
            var recent: Array = []
            for contact: Dictionary in contact_history.values():
                if contact["body"] == item["path"] and Time.get_ticks_msec() - int(contact["time"]) <= 1500:
                    recent.append({"path": contact["path"], "engineFrame": contact["engineFrame"], "ageMs": Time.get_ticks_msec() - int(contact["time"])})
            item["recentContacts"] = recent
            item["contacts"] = contacts
            item["onFloor"] = node.is_on_floor()
    elif node is Light3D:
        item["kind"] = "light"
        item["energy"] = node.light_energy
    else:
        item["kind"] = "geometry"
        var mesh: Mesh = null
        if node is MeshInstance3D:
            mesh = node.mesh
        elif node is MultiMeshInstance3D and node.multimesh:
            mesh = node.multimesh.mesh
            item["instances"] = node.multimesh.instance_count if node.multimesh.visible_instance_count < 0 else node.multimesh.visible_instance_count
        item["meshClass"] = mesh.get_class() if mesh else "unsupported"
        item["meshResource"] = mesh.resource_path if mesh else ""
        item["primitive"] = mesh is PrimitiveMesh
        item["surfaces"] = mesh.get_surface_count() if mesh else 0
        var material_count: int = 0
        if mesh:
            for surface in range(mesh.get_surface_count()):
                var material: Material = node.get_active_material(surface) if node is MeshInstance3D else (node.material_override if node.material_override else mesh.surface_get_material(surface))
                if material != null:
                    material_count += 1
        item["materials"] = material_count
        var owner_node: Node = node
        item["sourceScene"] = ""
        while owner_node != null and owner_node != scene:
            if not owner_node.scene_file_path.is_empty():
                item["sourceScene"] = owner_node.scene_file_path
                break
            owner_node = owner_node.get_parent()
        var camera: Camera3D = node.get_viewport().get_camera_3d()
        var bounds: AABB = node.global_transform * node.get_aabb()
        item["size"] = _v3(bounds.size)
        item["center"] = _v3(bounds.get_center())
        item["inViewport"] = camera != null and (node.layers & camera.cull_mask) != 0 and _in_frustum(camera, bounds)
        if node is GeometryInstance3D:
            item["visible"] = item["visible"] and node.transparency < 0.95
    scene_nodes.append(item)

func _in_frustum(camera: Camera3D, bounds: AABB) -> bool:
    for plane: Plane in camera.get_frustum():
        var outside := true
        for corner in range(8):
            if plane.distance_to(bounds.get_endpoint(corner)) <= 0.0:
                outside = false
                break
        if outside:
            return false
    return true

func _v3(value: Vector3) -> Array:
    return [snappedf(value.x, 0.001), snappedf(value.y, 0.001), snappedf(value.z, 0.001)]
`;
