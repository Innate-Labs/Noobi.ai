import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { installGodotRuntimeProbe } from '../dist/main/runtime/godotRuntimeProbe.js';
const exec = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), 'noobi-coverage-'));
const output = resolve('.noobi-private/runtime-coverage');
await mkdir(output, { recursive: true });
try {
  for (const overflow of [false, true]) {
    const root = join(temporary, overflow ? 'overflow' : 'mixed'); await mkdir(root);
    await writeFile(join(root, 'project.godot'), '[application]\nconfig/name="Runtime coverage regression"\nrun/main_scene="res://main.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
    await writeFile(join(root, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Main" type="Node3D"]\nscript = ExtResource("1")\n');
    await writeFile(join(root, 'main.gd'), `extends Node3D
var state := "playing"
func _ready() -> void:
    var camera := Camera3D.new()
    add_child(camera)
    camera.position = Vector3(0, 2, 5)
    camera.look_at(Vector3.ZERO)
    camera.current = true
    for i: int in range(${overflow ? 0 : 400}):
        var mesh := MeshInstance3D.new()
        mesh.mesh = BoxMesh.new()
        mesh.material_override = StandardMaterial3D.new()
        mesh.name = "Mesh%d" % i
        add_child(mesh)
    for i: int in range(${overflow ? 0 : 400}):
        var decoration := Node2D.new()
        decoration.name = "Decoration%d" % i
        add_child(decoration)
    var player := CharacterBody3D.new()
    player.name = "Player"
    add_child(player)
    var hud := CanvasLayer.new()
    hud.name = "HUD"
    add_child(hud)
    for i: int in range(${overflow ? 400 : 1}):
        var label := Label.new()
        label.name = "Target%d" % i
        label.text = "Collect 3 pearls"
        hud.add_child(label)
`);
    await installGodotRuntimeProbe(root, overflow ? 'overflow' : 'mixed');
    const engine = process.env.NOOBI_GODOT_PATH || 'godot';
    await exec(engine, ['--headless', '--path', root, '--editor', '--import'], { timeout: 60000, maxBuffer: 4000000 });
    const result = await exec(engine, ['--headless', '--path', root, '--quit-after', '40'], { timeout: 30000, maxBuffer: 4000000 });
    assert.doesNotMatch(result.stderr, /SCRIPT ERROR|Parse Error/);
    const packet = JSON.parse(result.stdout.split('\n').find(line => line.startsWith('NOOBI_RUNTIME ')).slice(14));
    assert.equal(packet.nodes.length, 350);
    assert.equal(packet.nodesTruncated, true);
    if (overflow) assert.ok(packet.findings.some(f => f.code === 'critical-telemetry-truncated'));
    else {
      assert.ok(packet.nodes.some(n => n.path === 'HUD/Target0' && n.text === 'Collect 3 pearls' && n.visible));
      assert.ok(packet.nodes.some(n => n.path === 'Player' && n.class === 'CharacterBody3D' && n.visible === true && n.inViewport === true));
      assert.equal(packet.scene3d.nodes.filter(n => n.kind === 'geometry').length, 400);
      assert.equal(packet.scene3d.truncated, false);
      assert.ok(!packet.findings.some(f => f.code === 'critical-telemetry-truncated'));
    }
    await writeFile(join(output, `${overflow ? 'overflow' : 'mixed'}-runtime.json`), JSON.stringify(packet, null, 2));
  }
  console.log('RUNTIME_COVERAGE_SMOKE_OK: real Godot, 400 meshes plus 400 decorations retain HUD/player; critical overflow fails explicitly');
} finally { await rm(temporary, { recursive: true, force: true }); }
