import { mkdir,mkdtemp,writeFile } from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {installGodotRuntimeProbe} from '../src/main/runtime/godotRuntimeProbe.js';
// Use a fresh fixture so repeated checks never overwrite earlier evidence.
await mkdir(resolve('.tmp'), { recursive: true });
const root = await mkdtemp(join(resolve('.tmp'), 'quality-probe-'));
await writeFile(join(root,'project.godot'),'[application]\nconfig/name="Probe geometry test"\nrun/main_scene="res://main.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
await writeFile(join(root,'main.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Main" type="Node2D"]\nscript = ExtResource("1")\n');
await writeFile(join(root,'main.gd'),`extends Node2D
func _ready():
    var texture := ImageTexture.create_from_image(Image.create(4, 4, false, Image.FORMAT_RGBA8))
    var sprite := Sprite2D.new()
    sprite.name = "Actor"
    sprite.texture = texture
    sprite.hframes = 2
    sprite.vframes = 2
    sprite.frame = 3
    sprite.offset = Vector2(0, -10)
    sprite.scale = Vector2(2, 2)
    add_child(sprite)
    var icon := TextureRect.new()
    icon.name = "HudIcon"
    icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    icon.texture = texture
    icon.position = Vector2(12, 16)
    icon.size = Vector2(48, 52)
    add_child(icon)
func _draw():
    draw_rect(Rect2(0, 0, 20, 20), Color.GREEN)
`);
await installGodotRuntimeProbe(root,'probe-geometry');
const result=await promisify(execFile)('/Applications/Godot.app/Contents/MacOS/Godot',['--headless','--path',root,'--quit-after','35'],{timeout:15000,maxBuffer:2000000});
if(/SCRIPT ERROR|Parse Error|ERROR:/.test(result.stdout+result.stderr))throw Error(result.stderr);
const packets=result.stdout.split('\n').filter(x=>x.startsWith('NOOBI_RUNTIME ')).map(x=>JSON.parse(x.slice(14)));
const packet=packets[0];
const sprite=packet?.nodes.find((n:any)=>n.path==='Actor');
const icon=packet?.nodes.find((n:any)=>n.path==='HudIcon');
if(sprite?.frame!==3 || sprite?.offset[1]!==-10 || sprite?.scale[0]!==2 || icon?.rect[2]!==48 || icon?.textureSize[0]!==4 || packet.nodes[0]?.customDraw!==true)throw Error('Probe geometry did not match the real Godot nodes');
await writeFile(join(root,'evidence.json'),JSON.stringify({ok:true,packets},null,2));
console.log(JSON.stringify({ok:true,packets:packets.length,evidence:join(root,'evidence.json')}));
