import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
// An explicit engineering fixture, not a generated game or an aesthetic benchmark.
export async function createSceneFixture(root,{extra=false,missingCollision=false,overflow=false}={}) {
  await mkdir(join(root,'.noobi'),{recursive:true});
  await writeFile(join(root,'project.godot'),'[application]\nconfig/name="Noobi 3D evidence fixture"\nrun/main_scene="res://main.tscn"\n[display]\nwindow/size/viewport_width=960\nwindow/size/viewport_height=640\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nenvironment/defaults/default_clear_color=Color(0.08,0.12,0.16,1)\n');
  await writeFile(join(root,'main.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Main" type="Node3D"]\nscript = ExtResource("1")\n');
  await writeFile(join(root,'main.gd'),`extends Node3D
var state := "playing"
var collected := 0
var player: CharacterBody3D
var label: Label
var active := true
func _ready() -> void:
    var ground := StaticBody3D.new()
    ground.name = "Terrain"
    add_child(ground)
    ground.position.y = -0.25
    var floor_mesh := BoxMesh.new()
    floor_mesh.size = Vector3(18, 0.5, 18)
    art(ground, floor_mesh, Color("345b4a"))
    shape(ground, Vector3(18, 0.5, 18))
    player = CharacterBody3D.new()
    player.name = "Player"
    add_child(player)
    player.position = Vector3(0,0.75,0)
    var capsule := CapsuleMesh.new()
    capsule.radius = 0.3
    capsule.height = 1.4
    art(player,capsule,Color("e8b957"))
    shape(player, Vector3(0.6,1.4,0.6))
    var camera := Camera3D.new()
    camera.name = "Camera"
    player.add_child(camera)
    camera.position = Vector3(2,3.5,6)
    camera.look_at(Vector3(0,0,0))
    camera.current = true
    var gate := StaticBody3D.new()
    gate.name = "Gate"
    add_child(gate)
    gate.position = Vector3(-1,0.7,-2)
    var cabinet := BoxMesh.new()
    cabinet.size = Vector3(1,1.4,0.6)
    art(gate,cabinet,Color("698dc6"))
    ${missingCollision?'# Intentionally missing gate collision.':'shape(gate,Vector3(1,1.4,0.6))'}
    var foliage := MultiMeshInstance3D.new()
    foliage.name = "Foliage"
    foliage.multimesh = MultiMesh.new()
    foliage.multimesh.transform_format = MultiMesh.TRANSFORM_3D
    var leaf := SphereMesh.new()
    leaf.radius = 0.45
    leaf.height = 0.9
    var leaf_mat := StandardMaterial3D.new()
    leaf_mat.albedo_color = Color("739c67")
    leaf.material = leaf_mat
    foliage.multimesh.mesh = leaf
    foliage.multimesh.instance_count = 6
    add_child(foliage)
    for index in range(6):
        foliage.multimesh.set_instance_transform(index,Transform3D(Basis.IDENTITY,Vector3(-4+index*1.5,0.6,-4)))
    var light := DirectionalLight3D.new()
    add_child(light)
    light.rotation_degrees = Vector3(-45,-25,0)
    light.light_energy = 1.0
    var world := WorldEnvironment.new()
    world.environment = Environment.new()
    world.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    world.environment.ambient_light_color = Color(0.7,0.8,0.9)
    world.environment.ambient_light_energy = 0.5
    add_child(world)
    var hud := CanvasLayer.new()
    hud.name = "HUD"
    add_child(hud)
    label = Label.new()
    label.name = "Status"
    label.position = Vector2(20,20)
    label.add_theme_font_size_override("font_size",24)
    hud.add_child(label)
    label.text = "ENGINEERING FIXTURE | arrows move | SPACE interact"
    ${extra?'var forgotten := Node3D.new()\n    forgotten.name = "UnregisteredRock"\n    add_child(forgotten)\n    forgotten.position = Vector3(50,1,0)\n    art(forgotten,BoxMesh.new(),Color.RED)':''}
    ${overflow?'for index in range(620):\n        var extra_shape := CollisionShape3D.new()\n        extra_shape.name = "Overflow"+str(index)\n        ground.add_child(extra_shape)':''}
func _physics_process(delta: float) -> void:
    if player == null:
        return
    player.velocity.x = (float(Input.is_physical_key_pressed(KEY_RIGHT)) - float(Input.is_physical_key_pressed(KEY_LEFT))) * 2.0
    player.velocity.z = (float(Input.is_physical_key_pressed(KEY_DOWN)) - float(Input.is_physical_key_pressed(KEY_UP))) * 2.0
    player.velocity.y -= 20.0 * delta
    player.move_and_slide()
func _unhandled_key_input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and not event.echo and event.physical_keycode == KEY_SPACE:
        collected += 1
        label.text = "REAL INPUT | collected: " + str(collected)
func art(parent: Node3D, mesh: Mesh, color: Color) -> void:
    var instance := MeshInstance3D.new()
    instance.name = "Art"
    instance.mesh = mesh
    var material := StandardMaterial3D.new()
    material.albedo_color = color
    instance.material_override = material
    parent.add_child(instance)
func shape(parent: Node3D, size: Vector3) -> void:
    var collision := CollisionShape3D.new()
    collision.name = "Shape"
    var box := BoxShape3D.new()
    box.size = size
    collision.shape = box
    parent.add_child(collision)
`);
  const contract={version:1,representative:'fixture',artDirection:{style:'Explicit engineering fixture, not visual quality approval',palette:['#345b4a','#e8b957','#698dc6'],proportions:'Meter scale primitive test pieces',lighting:'Directional sunlight and ambient fill'},scenes:[{id:'fixture',resource:'res://main.tscn',views:['move-a','move-b'],collisionSteps:['blocked'],interaction:{before:'blocked',after:'use',key:'collected'},subjects:[
    {id:'player',node:'Player',role:'player',treatment:'procedural',design:'Primitive capsule for control evidence only',collision:'solid'},
    {id:'terrain',node:'Terrain',role:'terrain',treatment:'procedural',design:'Flat floor for collision evidence only',collision:'solid'},
    {id:'gate',node:'Gate',role:'interactive',treatment:'procedural',design:'Box cabinet for registration and collision evidence only',collision:'solid'},
    {id:'foliage',node:'Foliage',role:'environment',treatment:'procedural',design:'Sphere instances for MultiMesh inventory evidence only',collision:'none'},
    {id:'hud',node:'HUD',role:'hud',treatment:'interface',design:'Readable ASCII evidence instructions',collision:'none'}]}]};
  await writeFile(join(root,'.noobi/scene-quality.json'),JSON.stringify(contract,null,2));return contract;
}
