import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PRESENTATION_KIT } from '../src/main/runtime/presentationKit.js';
import { installGodotRuntimeProbe } from '../src/main/runtime/godotRuntimeProbe.js';
import type { RuntimePacket } from '../src/main/runtime/runtimeEvidence.js';

await mkdir(resolve('.tmp'), { recursive: true });
const root = await mkdtemp(join(resolve('.tmp'), 'presentation-engine-'));
await writeFile(join(root, 'project.godot'), '[application]\nrun/main_scene="res://main.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
await writeFile(join(root, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Main" type="Node2D"]\nscript = ExtResource("1")\n');
await writeFile(join(root, 'presentation.gd'), PRESENTATION_KIT);
await writeFile(join(root, 'main.gd'), `extends Node2D
const Kit = preload("res://presentation.gd")
func _ready():
    var tex := ImageTexture.create_from_image(Image.create(384, 512, false, Image.FORMAT_RGBA8))
    var panel := HBoxContainer.new()
    panel.name = "HUD"
    add_child(panel)
    var icon := Kit.icon(tex, Vector2(42, 56))
    icon.name = "Fixed"
    panel.add_child(icon)
    var bad := TextureRect.new()
    bad.name = "Broken"
    bad.texture = tex
    bad.custom_minimum_size = Vector2(42, 56)
    bad.size = Vector2(42, 56)
    add_child(bad)
    var sprite := Kit.atlas_sprite(tex, 2, 2, 3, Vector2(48, 64))
    sprite.name = "Actor"
    add_child(sprite)
    var scaled_parent := Node2D.new()
    scaled_parent.name = "ScaledParent"
    scaled_parent.scale = Vector2(2, 2)
    add_child(scaled_parent)
    var scaled_icon := Kit.icon(tex, Vector2(42, 56))
    scaled_icon.name = "Icon"
    scaled_parent.add_child(scaled_icon)
    var letterbox := Kit.icon(tex, Vector2(56, 56))
    letterbox.name = "Letterbox"
    add_child(letterbox)
    var transparent := Node2D.new()
    transparent.name = "Transparent"
    transparent.modulate.a = 0.0
    add_child(transparent)
    var hidden_art := Kit.atlas_sprite(tex, 2, 2, 0, Vector2(48, 64))
    hidden_art.name = "Art"
    transparent.add_child(hidden_art)
    var button := Button.new()
    button.name = "Button"
    add_child(button)
    Kit.button_feedback(button)
    for i in range(20):
        button.emit_signal("mouse_entered")
        button.emit_signal("button_down")
        button.emit_signal("mouse_exited")
    await get_tree().process_frame
    assert(icon.size == Vector2(42, 56), "Fixed icon native minimum regressed")
    assert(bad.size == Vector2(384, 512), "Fault injection did not reproduce oversized icon")
    assert(sprite.frame == 3 and sprite.get_rect().end.y == 0.0, "Atlas feet drifted")
`);
await installGodotRuntimeProbe(root, 'presentation-engine-v1');
const result = await promisify(execFile)('/Applications/Godot.app/Contents/MacOS/Godot',
  ['--headless', '--path', root, '--quit-after', '45'], { timeout: 20_000, maxBuffer: 2_000_000 });
if (/SCRIPT ERROR|Parse Error|ERROR:/.test(result.stdout + result.stderr)) throw Error(result.stdout + result.stderr);
const packets: RuntimePacket[] = result.stdout.split('\n').filter(l => l.startsWith('NOOBI_RUNTIME ')).map(l => JSON.parse(l.slice(14)));
const sample = packets.at(-1)!;
const node = (path: string) => sample?.nodes.find(n => n.path === path);
if (JSON.stringify(node('HUD/Fixed')?.displaySize) !== '[42,56]'
  || JSON.stringify(node('Broken')?.displaySize) !== '[384,512]'
  || JSON.stringify(node('Actor')?.displaySize) !== '[48,64]'
  || JSON.stringify(node('ScaledParent/Icon')?.displaySize) !== '[84,112]'
  || JSON.stringify(node('Letterbox')?.displaySize) !== '[42,56]'
  || node('Actor')?.frame !== 3 || node('Transparent/Art')?.opacity !== 0) throw Error('Real engine geometry/probe check failed');
await writeFile(join(root, 'evidence.json'), JSON.stringify({ kind: 'headless-engine-fixture', ok: true, packets }, null, 2));
console.log(JSON.stringify({ ok: true, evidence: join(root, 'evidence.json'), checks: ['42x56 container icon', '384x512 fault reproduced', 'atlas frame and feet anchor', 'inherited transparency', 'repeated feedback tween'] }));
