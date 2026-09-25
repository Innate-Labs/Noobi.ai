extends SceneTree
var failed := false
func _initialize() -> void:
    call_deferred("verify")
func check(value: bool, message: String) -> void:
    if not value:
        failed = true
        push_error(message)
func press(key: Key) -> void:
    var event := InputEventKey.new()
    event.physical_keycode = key
    event.pressed = true
    Input.parse_input_event(event)
    await process_frame
    event.pressed = false
    Input.parse_input_event(event)
    await process_frame
func verify() -> void:
    var scene = load("res://scenes/main.tscn").instantiate()
    root.add_child(scene)
    current_scene = scene
    await process_frame
    check(scene.machines[0].dials[0].name == "RotorPivot", "Wind mechanism uses an overlay instead of authored pivot")
    check(scene.machines[1].dials[0].name == "GearLeftPivot", "Left gear pivot absent")
    check(scene.machines[1].dials[1].name == "GearRightPivot", "Right gear pivot absent")
    var wind = scene.machines[0].node.find_child("TealPaddle1", true, false)
    var gear = scene.machines[1].node.find_child("GearLeftPivotTeeth", true, false)
    check(wind != null and gear != null, "Authored geometry missing")
    check(wind.get_surface_override_material(0) == null and gear.get_surface_override_material(0) == null, "Authored materials overridden")
    check(wind.mesh.surface_get_material(0).albedo_color != gear.mesh.surface_get_material(0).albedo_color, "Teal and brass lost distinct materials")
    for bridge in scene.bridges:
        check(bridge.find_child("DeckPanel7", true, false) != null, "Bridge deck not loaded")
        check(bridge.get_node("WalkableDeck").get_child(0).shape.size == Vector3(3, .22, 14), "Walkable deck mismatches GLB")
        check(bridge.get_node("RailCollision1") != null and bridge.get_node("RailCollision-1") != null, "Guardrail collision missing")
    await press(KEY_ENTER)
    # Focused fixture: place player at an existing puzzle with sufficient collected energy.
    # This validates real E/Q behavior but is not a full collection/playthrough test.
    scene.collected = 6
    scene.player.position = Vector3(0, 0, -7)
    scene.player.velocity = Vector3.ZERO
    var rotor = scene.machines[0].dials[0]
    await press(KEY_E)
    await create_timer(.18).timeout
    check(absf(rotor.rotation.z) > .05 and absf(rotor.rotation.z + PI/2) > .02, "Wind intermediate rotation missing")
    await create_timer(.5).timeout
    check(absf(rotor.rotation.z + PI/2) < .01, "Wind quarter-turn failed")
    await press(KEY_E)
    await create_timer(1.0).timeout
    check(scene.bridges[0].position.y > -5 and scene.bridges[0].position.y < 0, "Bridge rise intermediate state missing")
    await create_timer(1.6).timeout
    check(scene.solved[0] and absf(scene.bridges[0].position.y) < .01, "Bridge did not finish rising")
    var ray = PhysicsRayQueryParameters3D.create(Vector3(0, 3, -20), Vector3(0, -3, -20), 1)
    var hit = scene.get_world_3d().direct_space_state.intersect_ray(ray)
    check(not hit.is_empty() and absf(hit.position.y) < .02, "Bridge surface collision missing at y=0")
    scene.player.position = Vector3(0, 0, -47)
    scene.player.velocity = Vector3.ZERO
    await process_frame
    var left = scene.machines[1].dials[0]
    var right = scene.machines[1].dials[1]
    await press(KEY_E)
    await create_timer(.18).timeout
    check(absf(left.rotation.z) > .05 and is_zero_approx(right.rotation.z), "Left gear not independently driven")
    await create_timer(.5).timeout
    await press(KEY_Q)
    await press(KEY_E)
    await create_timer(.18).timeout
    check(absf(right.rotation.z) > .05 and absf(left.rotation.z + PI/2) < .01, "Right gear not independently driven")
    await create_timer(.5).timeout
    await press(KEY_ESCAPE)
    check(scene.state == "paused" and scene.get_node("BackgroundMusic").stream_paused, "Pause/music regression")
    # Isolated user:// directory supplied by test project setting; real saves are not touched.
    scene.get_node("BackgroundMusic").stop()
    scene.sfx.stop()
    await create_timer(.2).timeout
    hit.clear()
    ray = null
    wind = null
    gear = null
    rotor = null
    left = null
    right = null
    scene = null
    current_scene.queue_free()
    current_scene = null
    await process_frame
    await process_frame
    if not failed:
        print("ISLAND_MODEL_INTEGRATION_OK pivots materials intermediate-rotation bridge-rise collision independent-gears pause")
    quit(1 if failed else 0)
