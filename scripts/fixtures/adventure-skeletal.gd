extends Node3D
const Controller = preload("res://runtime/noobi/adventure_controller_v1.gd")
const AnimationAdapter = preload("res://runtime/noobi/adventure_animation_v1.gd")
const Rig = preload("res://runtime/noobi/adventure_rig_v1.gd")
const Melee = preload("res://runtime/noobi/melee_v1.gd")
const Enemy = preload("res://runtime/noobi/enemy_v1.gd")
var actor = Controller.new()
var enemy = Enemy.new()
var driver = AnimationAdapter.new()
var rig = Rig.new()
var melee = Melee.new()
var model: Node3D
var skeleton: Skeleton3D
var player: AnimationPlayer
var hand: MeshInstance3D
var tool: MeshInstance3D
var checks := []
var observations := {}
var hits := []
var misses := 0
var cancellations := 0
var demo_ui: CanvasLayer
var demo_clock := 0.0
var demo_capture := ""
var floor_body: StaticBody3D
var collider: CollisionShape3D
func check(ok: bool, label: String) -> void:
    if not ok:
        var failed := FileAccess.open("res://failed-observations.json",FileAccess.WRITE)
        failed.store_string(JSON.stringify({"failure":label,"checks":checks,"observations":observations}))
        failed.close()
        push_error("SKELETAL_FAILURE: "+label)
        get_tree().quit(1)
        assert(ok,label)
    checks.append(label)
func frames(count: int) -> void:
    for i in count: await get_tree().physics_frame
    await get_tree().process_frame
func capture(name: String) -> void:
    await RenderingServer.frame_post_draw
    get_viewport().get_texture().get_image().save_png("res://"+name+".png")
func cube(parent: Node, size: Vector3, at: Vector3, color: Color) -> MeshInstance3D:
    var mesh := MeshInstance3D.new()
    var box := BoxMesh.new()
    box.size = size
    mesh.mesh = box
    var material := StandardMaterial3D.new()
    material.albedo_color = color
    material.roughness = 0.7
    mesh.material_override = material
    mesh.position = at
    parent.add_child(mesh)
    return mesh
func capsule(body: CharacterBody3D, radius: float, height: float) -> CollisionShape3D:
    var shape := CollisionShape3D.new()
    var capsule_shape := CapsuleShape3D.new()
    capsule_shape.height = height
    capsule_shape.radius = radius
    shape.shape = capsule_shape
    shape.position.y = height/2.0
    body.add_child(shape)
    return shape
func sampled_clip(source: Animation, time: float, length: float) -> Animation:
    var result := Animation.new()
    result.length = length
    for i in source.get_track_count():
        var type := source.track_get_type(i)
        var track := result.add_track(type)
        result.track_set_path(track,source.track_get_path(i))
        var value: Variant
        match type:
            Animation.TYPE_POSITION_3D: value = source.position_track_interpolate(i,time)
            Animation.TYPE_ROTATION_3D: value = source.rotation_track_interpolate(i,time)
            Animation.TYPE_SCALE_3D: value = source.scale_track_interpolate(i,time)
            Animation.TYPE_BLEND_SHAPE: value = source.blend_shape_track_interpolate(i,time)
        result.track_insert_key(track,0.0,value)
        result.track_insert_key(track,length,value)
    return result
func make_fixture_clips() -> void:
    # Explicit engineering authoring: source contains no dedicated Fall or Hurt.
    # Do not relabel No/Yes/Wave as a semantic action and do not edit source GLB.
    var lib := AnimationLibrary.new()
    lib.add_animation("FallPose",sampled_clip(player.get_animation("Jump"),0.34,0.4))
    var hurt := sampled_clip(player.get_animation("Idle"),0.0,0.35)
    for i in hurt.get_track_count():
        var path := hurt.track_get_path(i)
        if str(path).ends_with(":Body") and hurt.track_get_type(i)==Animation.TYPE_ROTATION_3D:
            var original: Quaternion = hurt.track_get_key_value(i,0)
            hurt.track_insert_key(i,0.1,original*Quaternion(Vector3.RIGHT,-0.25))
        if str(path).ends_with(":Angry"):
            hurt.track_insert_key(i,0.1,1.0)
    lib.add_animation("HurtPose",hurt)
    player.add_animation_library("fixture",lib)
func foot_spec(mesh: MeshInstance3D, bone_name: String) -> Dictionary:
    var bounds := mesh.get_aabb()
    var bottom := INF
    var center := mesh.global_transform*bounds.get_center()
    for i in 8: bottom = minf(bottom,(mesh.global_transform*bounds.get_endpoint(i)).y)
    var world_sole := Vector3(center.x,bottom,center.z)
    var bone_world := skeleton.global_transform*skeleton.get_bone_global_pose(skeleton.find_bone(bone_name))
    return {"bone":bone_name,"offset":Transform3D(Basis.IDENTITY,bone_world.affine_inverse()*world_sole)}
func hand_vertices() -> PackedVector3Array:
    var baked := hand.bake_mesh_from_current_skeleton_pose()
    var points := PackedVector3Array()
    for surface in baked.get_surface_count():
        var vertices: PackedVector3Array = baked.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]
        for point in vertices: points.append(actor.global_transform.affine_inverse()*hand.global_transform*point)
    return points
func displacement(a: PackedVector3Array,b: PackedVector3Array) -> float:
    var maximum := 0.0
    check(a.size()==b.size() and not a.is_empty(),"weighted hand vertex samples valid")
    for i in a.size(): maximum = maxf(maximum,a[i].distance_to(b[i]))
    return maximum
func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    Engine.max_fps = 60
    for name in ["left","right","forward","back","jump","ability","attack"]: InputMap.add_action("noobi_"+name)
    floor_body = StaticBody3D.new()
    var floor_shape := CollisionShape3D.new()
    var box := BoxShape3D.new()
    box.size = Vector3(20,0.2,20)
    floor_shape.shape = box
    floor_body.position.y = -0.1
    floor_body.add_child(floor_shape)
    add_child(floor_body)
    cube(floor_body,box.size,Vector3.ZERO,Color(0.12,0.18,0.23))
    collider = capsule(actor,0.33,1.8)
    actor.process_mode = Node.PROCESS_MODE_PAUSABLE
    var visual := Node3D.new()
    visual.name = "Visual"
    actor.add_child(visual)
    actor.visual = visual
    actor.speed = 2.0
    model = load("res://RobotExpressive.glb").instantiate()
    model.scale = Vector3.ONE*0.36
    model.rotation.y = PI
    visual.add_child(model)
    add_child(actor)
    skeleton = model.find_children("*","Skeleton3D",true,false)[0]
    player = model.find_children("*","AnimationPlayer",true,false)[0]
    hand = skeleton.get_node("Hand_R")
    make_fixture_clips()
    rig.actor = actor
    rig.skeleton = skeleton
    rig.socket_specs = {"right_hand":{"bone":"Palm2.R"}}
    rig.sole_specs = {"left":foot_spec(skeleton.get_node("Foot_L/Foot_L"),"Foot.L"),"right":foot_spec(skeleton.get_node("Foot_R/Foot_R"),"Foot.R")}
    actor.add_child(rig)
    if not rig.failure.is_empty(): check(false,rig.failure);return
    var socket: Node3D = rig.get_socket("right_hand")
    tool = cube(socket,Vector3(0.12,0.65,0.12),Vector3.ZERO,Color(1.0,0.65,0.14))
    # Armature carries a 100x import scale, model scales to 0.36. Keep gear 0.65m.
    tool.scale = Vector3.ONE/socket.global_basis.get_scale()
    melee.actor = actor
    melee.windup_time = 0.2
    melee.cooldown = 0.9
    actor.add_child(melee)
    melee.hit.connect(func(_target): hits.append({"clipTime":player.current_animation_position,"health":enemy.health}))
    melee.missed.connect(func(): misses+=1)
    melee.attack_cancelled.connect(func(): cancellations+=1)
    driver.actor = actor
    driver.player = player
    driver.melee = melee
    driver.clips = {"idle":"Idle","run":"Running","jump":"Jump","fall":"fixture/FallPose","hurt":"fixture/HurtPose","dead":"Death","attack":"Punch"}
    actor.add_child(driver)
    enemy.enabled = false
    enemy.max_health = 10
    enemy.process_mode = Node.PROCESS_MODE_PAUSABLE
    capsule(enemy,0.25,1.4)
    enemy.position = Vector3(0,0,-5)
    add_child(enemy)
    cube(enemy,Vector3(0.4,1.2,0.4),Vector3(0,0.6,0),Color(0.85,0.27,0.2))
    var camera := Camera3D.new()
    add_child(camera)
    camera.position = Vector3(3.4,2.5,-4.8)
    camera.look_at(Vector3(0,0.95,0))
    var light := DirectionalLight3D.new()
    light.rotation_degrees = Vector3(-40,-35,0)
    light.shadow_enabled = true
    add_child(light)
    var environment := WorldEnvironment.new()
    var settings := Environment.new()
    settings.background_mode = Environment.BG_COLOR
    settings.background_color = Color(0.055,0.075,0.11)
    settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    settings.ambient_light_color = Color(0.75,0.85,1.0)
    settings.ambient_light_energy = 0.5
    environment.environment = settings
    add_child(environment)
    if OS.get_cmdline_user_args().has("--noobi-rig-demo"):
        call_deferred("start_demo")
    else:
        call_deferred("run")
func run() -> void:
    await frames(20)
    check(driver.failure.is_empty(),"actual imported skeleton and morph tracks bind")
    check(hand.skin!=null and skeleton.get_bone_count()>20,"actual weighted skeleton imported")
    var contact: Dictionary = rig.sample_ground()
    observations["idleGround"] = contact
    check(contact.valid and contact.grounded,"real floor and grounded body")
    check(contact.feet.left.contact and contact.feet.right.contact,"neutral sole geometry contacts floor")
    await capture("idle")
    var collider_before := collider.transform
    var baseline := hand_vertices()
    var before_socket: Vector3 = rig.get_socket("right_hand").global_position
    Input.action_press("noobi_right")
    await frames(15)
    check(driver.active_state==&"run" and actor.position.x>0.2,"input drives imported running clip and body")
    var movement := displacement(baseline,hand_vertices())
    observations["weightedHandDisplacementMeters"] = movement
    check(movement>0.02,"weighted hand vertices deform during running")
    check(rig.get_socket("right_hand").global_position.distance_to(before_socket)>0.05,"equipment follows moving skeleton")
    var target := skeleton.global_transform*skeleton.get_bone_global_pose(skeleton.find_bone("Palm2.R"))
    check(rig.get_socket("right_hand").global_position.distance_to(target.origin)<0.001,"socket matches named hand bone")
    check(absf(tool.global_basis.get_scale().y*0.65-0.65)<0.001,"equipment world scale preserved across imported armature")
    observations["runGround"] = rig.sample_ground()
    await capture("running")
    Input.action_release("noobi_right")
    await frames(20)
    melee.cancel_attack()
    actor.reset_at(Vector3(0,0.03,0))
    await frames(10)
    Input.action_press("noobi_jump")
    await frames(4)
    Input.action_release("noobi_jump")
    contact = rig.sample_ground()
    check(driver.active_state==&"jump" and not contact.grounded,"real jump selects imported jump clip")
    check(not contact.feet.left.contact and not contact.feet.right.contact,"airborne feet are never reported as ground contact")
    await capture("jump")
    await frames(23)
    check(driver.active_state==&"fall","descent uses explicitly authored fixture fall pose")
    await frames(35)
    check(actor.is_on_floor() and driver.active_state==&"idle","landing returns to imported idle")
    enemy.position = Vector3(0,0,-1.3)
    await frames(3)
    var health_before: int = enemy.health
    Input.action_press("noobi_attack")
    await frames(3)
    Input.action_release("noobi_attack")
    check(driver.active_state==&"attack" and enemy.health==health_before,"punch starts before damage")
    await capture("windup")
    await frames(12)
    check(enemy.health==health_before-1 and hits.size()==1,"one damage event after authored windup")
    check(absf(hits[0].clipTime-melee.windup_time)<0.05,"damage clock agrees with attack playhead within 50ms")
    observations["hitTiming"] = hits.duplicate(true)
    await capture("impact")
    await frames(50)
    check(enemy.health==health_before-1,"no repeated damage from same swing")
    # Target moves after attack start: range is rechecked at impact.
    Input.action_press("noobi_attack")
    await frames(2)
    Input.action_release("noobi_attack")
    enemy.position.z = -5
    await frames(15)
    check(enemy.health==health_before-1 and misses==1,"target leaving range before impact is missed")
    await frames(45)
    enemy.position.z = -1.3
    Input.action_press("noobi_attack")
    await frames(2)
    Input.action_release("noobi_attack")
    get_tree().paused = true
    var frozen := player.current_animation_position
    await get_tree().create_timer(0.3,true).timeout
    check(player.current_animation_position==frozen and enemy.health==health_before-1,"pause freezes skeletal pose and pending damage")
    get_tree().paused = false
    await frames(15)
    check(enemy.health==health_before-2,"resume resolves pending strike once")
    await frames(50)
    Input.action_press("noobi_attack")
    await frames(2)
    Input.action_release("noobi_attack")
    actor.take_damage(1)
    await frames(15)
    check(enemy.health==health_before-2 and cancellations==1,"taking damage cancels pending strike")
    observations["hurtGround"] = rig.sample_ground()
    await capture("hurt")
    check(collider.transform==collider_before,"skeletal animation and sockets leave collider unchanged")
    # Explicit displacement is a negative geometry fixture, not silent correction.
    actor.visual.position.y = -0.15
    await frames(25)
    contact = rig.sample_ground()
    observations["penetrationNegative"] = contact
    check(contact.feet.left.penetrating and contact.feet.right.penetrating,"sole probes detect visual penetration")
    actor.visual.position.y = 0.25
    await frames(2)
    contact = rig.sample_ground()
    check(not contact.feet.left.contact and not contact.feet.right.contact,"raised grounded visual does not pass contact")
    actor.visual.position.y = 0.0
    # Missing surfaces and steep surfaces cannot be called walkable contact.
    floor_body.collision_layer = 0
    contact = rig.sample_ground()
    check(not contact.feet.left.surfaceFound and not contact.feet.right.surfaceFound,"missing floor remains unknown")
    floor_body.collision_layer = 1
    actor.set_physics_process(false)
    floor_body.rotation.z = deg_to_rad(60.0)
    await frames(2)
    contact = rig.sample_ground()
    observations["steepSurfaceNegative"] = contact
    check(contact.feet.left.surfaceFound and not contact.feet.left.walkable and not contact.feet.left.contact,"steep surface is not accepted as foot contact")
    floor_body.rotation.z = 0.0
    await frames(2)
    actor.set_physics_process(true)
    # A listener can cancel before an accepted windup begins advancing.
    await frames(60)
    var cancel_now := func(): melee.cancel_attack()
    melee.attack_started.connect(cancel_now)
    var count_before := hits.size()
    melee.attack()
    await frames(15)
    melee.attack_started.disconnect(cancel_now)
    check(hits.size()==count_before and cancellations==2,"synchronous start listener can cancel pending damage")
    # Exact imported names: typo must fail without creating attachments.
    var bad = Rig.new()
    bad.actor = actor
    bad.skeleton = skeleton
    bad.socket_specs = {"weapon":{"bone":"MissingHand"}}
    bad.sole_specs = rig.sole_specs
    actor.add_child(bad)
    check(not bad.failure.is_empty() and bad.sockets.is_empty(),"missing named bone rejected")
    bad.queue_free()
    # Existing animation target node with a nonexistent bone must also fail.
    var bad_player := AnimationPlayer.new()
    model.add_child(bad_player)
    bad_player.root_node = NodePath("..")
    var bad_library := AnimationLibrary.new()
    var bad_adapter = AnimationAdapter.new()
    bad_adapter.actor = actor
    bad_adapter.player = bad_player
    for state in ["idle","run","jump","fall","hurt","dead"]:
        var clip := Animation.new()
        var track := clip.add_track(Animation.TYPE_ROTATION_3D)
        clip.track_set_path(track,NodePath(str(model.get_path_to(skeleton))+":MissingBone"))
        clip.track_insert_key(track,0.0,Quaternion.IDENTITY)
        bad_library.add_animation(state,clip)
        bad_adapter.clips[state] = state
    bad_player.add_animation_library("",bad_library)
    actor.add_child(bad_adapter)
    check(bad_adapter.failure.contains("Missing imported bone"),"invalid animation bone rejected before playback")
    bad_adapter.queue_free()
    bad_player.queue_free()
    await frames(2)
    rig.queue_free()
    await frames(2)
    check(skeleton.find_children("NoobiBone_*","BoneAttachment3D",false,false).is_empty(),"removing rig cleans owned attachments")
    var file := FileAccess.open("res://report.json",FileAccess.WRITE)
    file.store_string(JSON.stringify({"passed":true,"checks":checks,"observations":observations,"scope":"CC0 RobotExpressive real bones/weighted hands; fixture authored fall/hurt, Godot Input actions; not autonomous generation, retargeting, IK or full game"}))
    file.close()
    print("SKELETAL_OK "+str(checks.size()))
    get_tree().quit()


# Interactive integration entry. Reuses the shipped UI and checkpoint components.
# It is deliberately labelled engineering validation, not a finished/generated game.
func start_demo() -> void:
    for pair in [["left",KEY_A],["right",KEY_D],["forward",KEY_W],["back",KEY_S],["jump",KEY_SPACE],["attack",KEY_F]]:
        var event := InputEventKey.new()
        event.physical_keycode = pair[1]
        InputMap.action_add_event("noobi_"+pair[0],event)
    demo_ui = preload("res://runtime/noobi/ui_v1.gd").new()
    demo_ui.game_title = "骨骼角色装配验证"
    demo_ui.subtitle = "CC0 机器人 · 工程验证场景 · 非自主生成成品"
    demo_ui.accent = Color("f4bc52")
    demo_ui.snapshot_provider = Callable(self,"demo_snapshot")
    demo_ui.command_handler = Callable(self,"demo_command")
    demo_ui.screen_changed.connect(func(screen):
        actor.controls_enabled = screen=="playing"
        melee.enabled = screen=="playing"
        if screen!="playing":
            for action in ["left","right","forward","back","jump","attack"]: Input.action_release("noobi_"+action)
    )
    enemy.died.connect(func(): demo_ui.show_victory())
    actor.died.connect(func(): demo_ui.show_failure("从检查点继续训练。"))
    add_child(demo_ui)
func demo_snapshot() -> Dictionary:
    return {"outcome":"victory" if enemy.health==0 else "playing","health":actor.health,"max_health":actor.max_health,"has_save":FileAccess.file_exists("user://rig-demo.json"),"goal":"训练靶剩余耐久："+str(enemy.health)+" / 3","interaction":"WASD 移动 · 空格跳跃 · F 攻击 · Esc 暂停","region":"骨骼装配工程场景","ending":"训练流程完成；这不代表完整游戏或参考风格验收。","controls":"WASD 移动 · 空格跳跃 · F 攻击 · I 背包 · J 任务 · Esc 暂停","items":[{"name":"挂点测试棒","count":1 if is_instance_valid(tool) else 0,"description":"实际跟随右手骨骼的装备。"}],"quests":[{"name":"命中训练靶三次","status":"已完成" if enemy.health==0 else "进行中"}],"regions":[{"name":"装配场地","status":"当前位置"}]}
func demo_valid(state: Dictionary) -> bool:
    if not state.get("health") is float and not state.get("health") is int: return false
    if not state.get("target") is float and not state.get("target") is int: return false
    if int(state.health)!=state.health or int(state.target)!=state.target or state.health<1 or state.health>3 or state.target<0 or state.target>3: return false
    var position: Variant = state.get("position")
    if not position is Array or position.size()!=3: return false
    for value in position:
        if (not value is float and not value is int) or not is_finite(float(value)) or absf(float(value))>8.0: return false
    return true
func demo_command(action: String) -> Dictionary:
    const Checkpoint = preload("res://runtime/noobi/checkpoint_v1.gd")
    if action=="save":
        var result: Dictionary = Checkpoint.save_slot("user://rig-demo.json","rig-demo",1,{"health":actor.health,"target":enemy.health,"position":[actor.position.x,actor.position.y,actor.position.z]},Callable(self,"demo_valid"))
        return {"ok":result.ok,"message":"装配测试进度已保存。" if result.ok else result.error}
    if action=="title": return {"ok":true}
    if action in ["new_game","continue","retry"]:
        var state := {"health":3,"target":3,"position":[0,0.03,0]}
        if action=="new_game":
            var archived: Dictionary = Checkpoint.archive_slot("user://rig-demo.json")
            if not archived.ok: return {"ok":false,"message":archived.error}
        elif FileAccess.file_exists("user://rig-demo.json"):
            var saved: Dictionary = Checkpoint.load_slot("user://rig-demo.json","rig-demo",1,Callable(self,"demo_valid"))
            if not saved.ok: return {"ok":false,"message":saved.error}
            state = saved.state
        elif action=="continue": return {"ok":false,"message":"尚无装配测试存档。"}
        melee.cancel_attack()
        actor.reset_at(Vector3(float(state.position[0]),float(state.position[1]),float(state.position[2])))
        actor.health = int(state.health)
        enemy.health = int(state.target)
        enemy.state = &"idle"
        enemy.position = Vector3(0,0,-1.3)
        return {"ok":true}
    return {"ok":false,"message":"未知训练操作"}
func _process(delta: float) -> void:
    if demo_ui==null: return
    if demo_ui.screen=="playing" and actor.position.y < -3: actor.take_damage(99)
    if not OS.get_cmdline_user_args().has("--noobi-native-probe"): return
    demo_clock += delta
    if demo_clock < 0.1: return
    demo_clock = 0.0
    var buttons := []
    for button: Button in demo_ui.find_children("*","Button",true,false):
        if button.is_visible_in_tree(): buttons.append({"text":button.text,"focused":button.has_focus(),"disabled":button.disabled})
    print("RIG_DEMO "+JSON.stringify({"screen":demo_ui.screen,"paused":get_tree().paused,"actorHealth":actor.health,"targetHealth":enemy.health,"actorPosition":[actor.position.x,actor.position.y,actor.position.z],"animation":str(driver.active_state),"clipTime":player.current_animation_position,"buttons":buttons}))
    if demo_capture!=demo_ui.screen:
        demo_capture = demo_ui.screen
        await capture("demo-"+demo_capture)
