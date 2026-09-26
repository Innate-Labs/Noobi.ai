# Independent authored engineering fixture, never an autonomous generated game.
extends "res://runtime/noobi/game_assembly_v1.gd"
var checks := []
var probe_time := 0.0
var last_capture := ""
func _ready() -> void:
    Engine.max_fps = 60
    var keys := {"left":KEY_A,"right":KEY_D,"forward":KEY_W,"back":KEY_S,"jump":KEY_SPACE,"ability":KEY_SHIFT,"interact":KEY_E}
    for name in keys:
        if not InputMap.has_action("noobi_"+name): InputMap.add_action("noobi_"+name)
        var event := InputEventKey.new()
        event.physical_keycode = keys[name]
        InputMap.action_add_event("noobi_"+name,event)
    var camera := Camera3D.new()
    add_child(camera)
    camera.position = Vector3(6,8,10)
    camera.look_at(Vector3(0,0.5,0))
    var light := DirectionalLight3D.new()
    light.rotation_degrees = Vector3(-50,-35,0)
    add_child(light)
    var environment := WorldEnvironment.new()
    var settings := Environment.new()
    settings.background_mode = Environment.BG_COLOR
    settings.background_color = Color("182434")
    settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    settings.ambient_light_color = Color(0.75,0.85,1)
    settings.ambient_light_energy = 0.6
    environment.environment = settings
    add_child(environment)
    super._ready()
    if not OS.get_cmdline_user_args().has("--noobi-assembly-demo"): call_deferred("run")
func frames(count: int) -> void:
    for i in count: await get_tree().physics_frame
    await get_tree().process_frame
func check(ok: bool, label: String) -> void:
    if not ok:
        var file := FileAccess.open("res://failure-state.json",FileAccess.WRITE)
        file.store_string(JSON.stringify({"failure":label,"checks":checks,"progression":progression.snapshot(),"position":actor.position,"lastEvent":last_event}))
        file.close()
        push_error("ASSEMBLY_FAILURE: "+label)
        get_tree().quit(1)
        assert(ok,label)
    checks.append(label)
func key(action: String, count: int = 2) -> void:
    Input.action_press("noobi_"+action)
    await frames(count)
    Input.action_release("noobi_"+action)
    await frames(3)
func capture(name: String) -> void:
    await RenderingServer.frame_post_draw
    get_viewport().get_texture().get_image().save_png("res://"+name+".png")
func approach(z: float) -> void:
    var action := "forward" if actor.position.z>z else "back"
    Input.action_press("noobi_"+action)
    for i in 180:
        await frames(1)
        if absf(actor.position.z-z)<0.12: break
    Input.action_release("noobi_"+action)
    await frames(4)
    check(absf(actor.position.z-z)<0.3,"physical approach "+str(z))
func run() -> void:
    await frames(15)
    check(failure.is_empty() and actor.driver.failure.is_empty(),"formal assembly and actual skeletal adapter initialize")
    check(ui.screen=="title" and get_tree().paused,"title freezes world")
    await capture("title")
    check(ui._command("new_game"),"explicit new game archives previous engineering save")
    await frames(20)
    check(ui.screen=="playing" and actor.is_on_floor(),"new game is playing on real ground")
    check(ui.palette.text==Color("fff8e7") and ui.accent==Color("ffd172"),"bound palette applied to formal UI")
    await approach(-1.25)
    await key("interact")
    check(progression.snapshot().region=="camp" and progression.snapshot().completed.is_empty() and last_event=="invalid","physical exit refuses missing prerequisite")
    await approach(0.4)
    await key("interact")
    check(progression.snapshot().completed==["camp-key"] and progression.snapshot().inventory.key==1,"real interaction awards first quest and key")
    await key("interact")
    check(progression.snapshot().inventory.key==1,"completed pickup cannot duplicate reward")
    var binding: Dictionary = manifest.regions.ruins
    var spawn: String = binding.spawn
    binding.spawn = "MissingSpawn"
    await approach(-1.3)
    var previous := world
    await key("interact")
    check(world==previous and progression.snapshot().region=="camp" and progression.snapshot().inventory.key==1,"invalid target scene preserves current world and unspent key")
    binding.spawn = spawn
    await key("interact")
    check(progression.snapshot().region=="ruins" and progression.snapshot().inventory.key==0,"physical exit consumes key once and changes region")
    check(actor.position.z>2.0,"new region places actor at authored spawn")
    await approach(0.4)
    await key("interact")
    check(progression.snapshot().completed.size()==2 and progression.snapshot().inventory.gem==1,"second physical objective updates progression")
    ui.show_screen("pause")
    var at := actor.position
    await key("forward",12)
    check(actor.position==at and get_tree().paused,"pause blocks movement")
    check(ui._command("save"),"pause menu saves region checkpoint")
    var saved_bytes := FileAccess.get_file_as_bytes(_save_path)
    ui.show_screen("playing")
    actor.take_damage(actor.max_health)
    check(ui.screen=="failure","real controller death opens failure UI")
    check(ui._command("retry"),"retry restores saved checkpoint")
    await frames(15)
    check(progression.snapshot().region=="ruins" and actor.health==actor.max_health and world.get_node("Objective").consumed,"retry restores rewards and completed pickup")
    var corrupt := FileAccess.open(_save_path,FileAccess.WRITE)
    corrupt.store_string("{broken")
    corrupt.close()
    var before: Dictionary = progression.snapshot()
    check(not _command("continue").ok and progression.snapshot()==before,"corrupt save fails without resetting current progress")
    check(FileAccess.get_file_as_string(_save_path)=="{broken","corrupt save bytes remain available")
    var restored := FileAccess.open(_save_path,FileAccess.WRITE)
    restored.store_buffer(saved_bytes)
    restored.close()
    var signature := _signature
    _signature = "incompatible-fixture"
    check(not _command("continue").ok and FileAccess.get_file_as_bytes(_save_path)==saved_bytes,"incompatible content refuses load without overwrite")
    _signature = signature
    await approach(-1.3)
    await key("interact")
    check(progression.snapshot().region=="summit","third region reached through physical exit")
    await capture("summit-playing")
    await approach(0.4)
    await key("interact")
    check(progression.at_ending() and ui.screen=="victory" and collected==3,"actual final objective drives victory and consistent UI totals")
    await capture("victory")
    check(ui._command("save"),"victory checkpoint saved")
    check(ui._command("title") and ui._command("continue") and ui.screen=="victory","completed save restores victory outcome")
    check(world.get_node("Objective").consumed,"finished objective remains unavailable after rebuild")
    var file := FileAccess.open("res://report.json",FileAccess.WRITE)
    file.store_string(JSON.stringify({"passed":true,"checks":checks,"progression":progression.snapshot(),"scope":"Authored three-region engineering, injected Input actions; separate OS keyboard required"},"  "))
    file.close()
    print("ASSEMBLY_OK ",checks.size())
    get_tree().quit()
func _process(delta: float) -> void:
    super._process(delta)
    if not OS.get_cmdline_user_args().has("--noobi-native-probe") or not is_instance_valid(ui): return
    probe_time += delta
    if probe_time<0.1: return
    probe_time = 0.0
    var buttons := []
    for button in ui.find_children("*","Button",true,false):
        if button.is_visible_in_tree(): buttons.append({"text":button.text,"focused":button.has_focus(),"disabled":button.disabled})
    print("ASSEMBLY_PROBE ",JSON.stringify({"screen":ui.screen,"region":progression.snapshot().region,"completed":progression.snapshot().completed,"inventory":progression.snapshot().inventory,"health":actor.health,"position":[actor.position.x,actor.position.y,actor.position.z],"buttons":buttons,"event":last_event}))
    var capture_id: String = ui.screen+"-"+str(progression.snapshot().region)+"-"+str(collected)
    if last_capture!=capture_id:
        last_capture = capture_id
        await capture("native-"+capture_id)
