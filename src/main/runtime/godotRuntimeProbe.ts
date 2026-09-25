import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Read-only telemetry. This never changes scores, input, physics or win state.
 * Values remain observations, not an authority allowed to self-report pass. */
export async function installGodotRuntimeProbe(root: string, buildId: string): Promise<string[]> {
  if (!/^[a-zA-Z0-9_-]+$/u.test(buildId)) throw new Error('Invalid runtime build identity');
  // Godot omits dot-directories from exported packs, even for an autoload.
  // Keep the app-owned runtime in an ordinary resource directory.
  const path = 'runtime/noobi_host/runtime_probe.gd';
  const projectPath = join(root, 'project.godot');
  const original = await readFile(projectPath, 'utf8');
  if (/^NoobiHostProbe\s*=/mu.test(original)) throw new Error('NoobiHostProbe is reserved for app-owned runtime diagnostics');
  const entry = `NoobiHostProbe="*res://${path}"\n`;
  const project = /^\[autoload\]\r?$/mu.test(original)
    ? original.replace(/^\[autoload\]\r?$/mu, `[autoload]\n${entry}`)
    : `${original}\n[autoload]\n${entry}`;
  await mkdir(join(root, 'runtime/noobi_host'), { recursive: true });
  await writeFile(join(root, path), probeSource(buildId), { flag: 'wx' });
  await writeFile(projectPath, project);
  return ['project.godot', path];
}

export function probeSource(buildId: string): string {
  return `extends Node
const BUILD_ID := "${buildId}"
var ticks := 0
var sequence := 0
var findings: Array = []
var nodes: Array = []
var missing_fonts: Dictionary = {}
const STATE_KEYS := ["state", "phase", "score", "lives", "collected", "target_score", "has_relic", "seal_broken", "turn_number", "player_health", "enemy_health", "mana", "last_event"]

func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS

func _process(_delta: float) -> void:
    ticks += 1
    if ticks % 15 != 0:
        return
    var scene: Node = get_tree().current_scene
    if scene == null:
        return
    sequence += 1
    findings = []
    nodes = []
    _collect(scene, scene)
    var values: Dictionary = {}
    for property: Dictionary in scene.get_property_list():
        var key: String = str(property.get("name", ""))
        if key in STATE_KEYS:
            var value: Variant = scene.get(key)
            if typeof(value) in [TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_STRING_NAME]:
                values[key] = value
    var packet := {"version": 1, "buildId": BUILD_ID, "sequence": sequence, "engineFrame": Engine.get_process_frames(), "paused": get_tree().paused, "state": values, "nodes": nodes, "findings": findings}
    var encoded: String = JSON.stringify(packet)
    if OS.has_feature("web"):
        JavaScriptBridge.eval("window.__noobiRuntime=" + encoded + ";window.__noobiRuntimeReceivedAt=performance.now();", true)
    elif sequence <= 2:
        print("NOOBI_RUNTIME " + encoded)

func _collect(node: Node, scene: Node) -> void:
    if nodes.size() >= 350:
        return
    var item := {"path": str(scene.get_path_to(node)), "class": node.get_class()}
    if node is CanvasItem:
        item["visible"] = node.is_visible_in_tree()
        var opacity: float = node.self_modulate.a * node.modulate.a
        var parent: Node = node.get_parent()
        while parent != null:
            if parent is CanvasItem:
                opacity *= parent.modulate.a
            parent = parent.get_parent()
        item["opacity"] = opacity
        item["z"] = node.z_index
        item["customDraw"] = _custom_draw(node)
    if node is CanvasLayer:
        item["layer"] = node.layer
    if node is Control:
        var bounds: Rect2 = node.get_global_rect()
        item["rect"] = [bounds.position.x, bounds.position.y, bounds.size.x, bounds.size.y]
        item["minimumSize"] = [node.get_combined_minimum_size().x, node.get_combined_minimum_size().y]
        var screen_bounds: Rect2 = node.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, node.size)
        item["inViewport"] = screen_bounds.intersects(node.get_viewport_rect())
        var control_scale: Vector2 = node.get_global_transform_with_canvas().get_scale().abs()
        item["displaySize"] = [node.size.x * control_scale.x, node.size.y * control_scale.y]
    if node is Node2D:
        item["position"] = [node.global_position.x, node.global_position.y]
        item["scale"] = [node.global_scale.x, node.global_scale.y]
        item["inViewport"] = node.get_viewport_rect().has_point(node.get_global_transform_with_canvas().origin)
    elif node is Node3D:
        item["position"] = [node.global_position.x, node.global_position.y, node.global_position.z]
    if node is CharacterBody2D:
        item["velocity"] = [node.velocity.x, node.velocity.y]
        item["onFloor"] = node.is_on_floor()
    if node is CharacterBody3D:
        item["velocity"] = [node.velocity.x, node.velocity.y, node.velocity.z]
        item["onFloor"] = node.is_on_floor()
    if node is AnimatedSprite2D:
        item["animation"] = str(node.animation)
        item["frame"] = node.frame
        item["playing"] = node.is_playing()
        if node.sprite_frames != null and node.sprite_frames.has_animation(node.animation):
            var frame_texture: Texture2D = node.sprite_frames.get_frame_texture(node.animation, node.frame)
            item["texture"] = _texture_path(frame_texture)
            var frame_scale: Vector2 = node.get_global_transform_with_canvas().get_scale().abs()
            item["displaySize"] = [frame_texture.get_width() * frame_scale.x, frame_texture.get_height() * frame_scale.y] if frame_texture else []
    if node is Sprite2D:
        item["texture"] = _texture_path(node.texture)
        var sprite_rect: Rect2 = node.get_rect()
        var sprite_scale: Vector2 = node.get_global_transform_with_canvas().get_scale().abs()
        item["displaySize"] = [sprite_rect.size.x * sprite_scale.x, sprite_rect.size.y * sprite_scale.y]
        item["inViewport"] = (node.get_global_transform_with_canvas() * sprite_rect).intersects(node.get_viewport_rect())
        item["frame"] = node.frame
        item["frames"] = [node.hframes, node.vframes]
        item["offset"] = [node.offset.x, node.offset.y]
        item["centered"] = node.centered
        item["regionEnabled"] = node.region_enabled
        item["region"] = [node.region_rect.position.x, node.region_rect.position.y, node.region_rect.size.x, node.region_rect.size.y]
        if node.z_index < 0 and node.get_parent() != null and _custom_draw(node.get_parent()):
            findings.append({"code": "possible-occlusion", "severity": "review", "path": item["path"], "message": "Sprite is behind a parent with custom drawing; compare its expected platform/foreground visibility with screenshots."})
    if node is TextureRect:
        item["texture"] = _texture_path(node.texture)
        item["textureSize"] = [node.texture.get_width(), node.texture.get_height()] if node.texture else []
        item["expandMode"] = node.expand_mode
        item["stretchMode"] = node.stretch_mode
        if node.texture != null:
            var image_size: Vector2 = node.texture.get_size()
            if node.stretch_mode in [TextureRect.STRETCH_SCALE, TextureRect.STRETCH_TILE, TextureRect.STRETCH_KEEP_ASPECT_COVERED]:
                image_size = node.size
            elif node.stretch_mode in [TextureRect.STRETCH_KEEP_ASPECT, TextureRect.STRETCH_KEEP_ASPECT_CENTERED]:
                image_size *= minf(node.size.x / image_size.x, node.size.y / image_size.y)
            var image_scale: Vector2 = node.get_global_transform_with_canvas().get_scale().abs()
            item["displaySize"] = [image_size.x * image_scale.x, image_size.y * image_scale.y]
    if node is CollisionShape2D:
        item["disabled"] = node.disabled
        item["shape"] = node.shape.get_class() if node.shape else "missing"
        if node.shape is RectangleShape2D:
            item["size"] = [node.shape.size.x, node.shape.size.y]
    if node is Label or node is Button:
        var text_value: String = node.text
        item["text"] = text_value.left(180)
        if node.is_visible_in_tree() and not text_value.is_empty():
            var font: Font = node.get_theme_font("font")
            var absent := ""
            if font != null:
                for character: String in text_value.left(500):
                    if character.unicode_at(0) > 32 and not font.has_char(character.unicode_at(0)) and not absent.contains(character):
                        absent += character
            if not absent.is_empty():
                findings.append({"code": "missing-glyphs", "severity": "error", "path": item["path"], "characters": absent, "message": "Visible UI text has characters absent from the bound font."})
    nodes.append(item)
    for child: Node in node.get_children():
        _collect(child, scene)

func _texture_path(texture: Texture2D) -> String:
    if texture is AtlasTexture:
        return texture.atlas.resource_path if texture.atlas else ""
    return texture.resource_path if texture else ""

func _custom_draw(node: Node) -> bool:
    var script: Script = node.get_script()
    if script == null:
        return false
    for method: Dictionary in script.get_script_method_list():
        if str(method.get("name", "")) == "_draw":
            return true
    return false
`;
}
