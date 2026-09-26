/** Opt-in interaction/defeat adventure composition. Content and art remain authored assets. */
export const GAME_ASSEMBLY_KIT = `extends Node3D
class_name NoobiGameAssembly
const Progression = preload("res://runtime/noobi/progression_v1.gd")
const Checkpoint = preload("res://runtime/noobi/checkpoint_v1.gd")
const UI = preload("res://runtime/noobi/ui_v1.gd")
const Controller = preload("res://runtime/noobi/adventure_controller_v1.gd")
const Interactable = preload("res://runtime/noobi/interactable_v1.gd")
const Enemy = preload("res://runtime/noobi/enemy_v1.gd")
var manifest: Dictionary = {}
var definition: Dictionary = {}
var progression = Progression.new()
var actor: CharacterBody3D
var world: Node3D
var ui: CanvasLayer
var state := "ready"
var player_health := 0
var collected := 0
var last_event := ""
var failure := ""
var _signature := ""
var _save_path := ""
var _busy := false
var _message := ""
var _clock := 0.0

func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    var manifest_text := _read("res://data/game-assembly.json",131072)
    var definition_text := _read("res://data/progression.json",65536)
    var parsed: Variant = JSON.parse_string(manifest_text)
    var rules: Variant = JSON.parse_string(definition_text)
    if not parsed is Dictionary or not rules is Dictionary:
        _fatal("Missing or invalid assembly/progression JSON")
        return
    manifest = parsed
    definition = rules
    if manifest.get("version") != 1 or not manifest.get("regions") is Dictionary or not manifest.get("style") is Dictionary or not manifest.get("labels") is Dictionary:
        _fatal("Invalid assembly contract")
        return
    var configured: Dictionary = progression.configure(definition)
    if not configured.ok:
        _fatal(configured.error)
        return
    _signature = (manifest_text+"\\n"+definition_text).sha256_text()
    _save_path = "user://assembly-"+str(manifest.get("gameId","invalid"))+".json"
    var resource: Variant = load("res://"+str(manifest.get("playerScene","")))
    if not resource is PackedScene:
        _fatal("Player scene missing")
        return
    var candidate: Node = resource.instantiate()
    if not candidate is Controller:
        candidate.free()
        _fatal("Player must use the adventure controller")
        return
    actor = candidate
    actor.process_mode = Node.PROCESS_MODE_PAUSABLE
    add_child(actor)
    actor.controls_enabled = false
    actor.died.connect(_died)
    actor.damaged.connect(func(_remaining): last_event="damage")
    var prepared := _prepare(progression.snapshot().region)
    if not prepared.ok:
        _fatal(prepared.error)
        return
    _install(prepared.node, progression.snapshot())
    ui = UI.new()
    ui.game_title = str(manifest.get("title","新的冒险"))
    ui.subtitle = str(manifest.get("subtitle",""))
    var colors: Variant = manifest.style.get("colors")
    if not colors is Dictionary:
        _fatal("Missing style colors")
        return
    for role in ["background","surface","text","accent","accentText","border","success"]:
        if not colors.get(role) is String or not Color.html_is_valid(colors[role]):
            _fatal("Invalid style color: "+role)
            return
        ui.palette[role] = Color.html(colors[role])
    ui.accent = ui.palette.accent
    ui.snapshot_provider = Callable(self,"_snapshot")
    ui.command_handler = Callable(self,"_command")
    ui.screen_changed.connect(_screen_changed)
    add_child(ui)
    progression.changed.connect(func(_next): _sync())
    _sync()

func _read(path: String, limit: int) -> String:
    var file := FileAccess.open(path,FileAccess.READ)
    if file == null or file.get_length()>limit: return ""
    return file.get_as_text()

func _fatal(reason: String) -> void:
    failure = reason
    last_event = "assembly-error"
    if is_instance_valid(actor): actor.controls_enabled = false
    get_tree().paused = true
    push_error("ASSEMBLY: "+reason)
    if is_instance_valid(ui) and ui.is_inside_tree():
        ui.show_failure("游戏加载失败，原存档已保留。")
    else:
        var layer := CanvasLayer.new()
        var label := Label.new()
        label.text = "游戏加载失败，原存档已保留。"
        label.add_theme_font_override("font",UI.FONT)
        label.position = Vector2(32,32)
        layer.add_child(label)
        add_child(layer)

func _prepare(region: String) -> Dictionary:
    if not manifest.regions.has(region): return {"ok":false,"error":"Missing region binding: "+region}
    var binding: Dictionary = manifest.regions[region]
    var resource: Variant = load("res://"+str(binding.get("scene","")))
    if not resource is PackedScene: return {"ok":false,"error":"Missing region scene: "+region}
    var candidate: Node = resource.instantiate()
    var error := ""
    if not candidate is Node3D: error = "Region scene must be Node3D"
    elif not candidate.get_node_or_null(str(binding.get("spawn",""))) is Marker3D: error = "Missing spawn marker: "+region
    elif not binding.get("quests") is Dictionary or not binding.get("exits") is Dictionary: error = "Missing gameplay bindings"
    else:
        for id in binding.quests:
            var trigger: Dictionary = binding.quests[id]
            var node := candidate.get_node_or_null(str(trigger.get("node","")))
            if trigger.get("kind")=="interact" and not node is Interactable: error = "Missing objective interactable: "+id
            elif trigger.get("kind")=="defeat" and not node is Enemy: error = "Missing objective enemy: "+id
            elif not trigger.get("kind") in ["interact","defeat"]: error = "Unsupported objective: "+id
        for id in binding.exits:
            if not candidate.get_node_or_null(str(binding.exits[id])) is Interactable: error = "Missing physical exit: "+id
    if not error.is_empty():
        candidate.free()
        return {"ok":false,"error":error}
    return {"ok":true,"node":candidate}

func _install(candidate: Node3D, next: Dictionary) -> void:
    if is_instance_valid(world):
        remove_child(world)
        world.queue_free()
    world = candidate
    world.process_mode = Node.PROCESS_MODE_PAUSABLE
    add_child(world)
    var binding: Dictionary = manifest.regions[next.region]
    var spawn: Marker3D = world.get_node(str(binding.spawn))
    # Switching regions/checkpoints clears transient combat and movement.
    for component in actor.find_children("*","Node",true,false):
        if component.has_method("cancel_attack"): component.cancel_attack()
    actor.reset_at(spawn.global_position)
    for node in world.find_children("*","CharacterBody3D",true,false):
        if node is Enemy: node.target = actor
    for id in binding.quests:
        var trigger: Dictionary = binding.quests[id]
        var node := world.get_node(str(trigger.node))
        if trigger.kind=="interact":
            node.one_shot = false
            node.activated.connect(_interacted.bind(str(id),node))
        else:
            node.died.connect(_defeated.bind(str(id),node))
        if id in next.completed:
            if node is Interactable:
                node.consumed = true
                node.enabled = false
            else: node.queue_free()
    for id in binding.exits:
        var node := world.get_node(str(binding.exits[id]))
        node.one_shot = false
        node.activated.connect(_exit_activated.bind(str(id)))

func _active() -> bool:
    return failure.is_empty() and not _busy and is_instance_valid(ui) and ui.screen=="playing" and not get_tree().paused and actor.health>0

func _interacted(who: Node3D, id: String, node: Node) -> void:
    if not _active() or who!=actor: return
    var result: Dictionary = progression.complete_quest(id,true)
    if result.ok:
        node.consumed = true
        node.enabled = false
    _feedback(result,"quest")

func _defeated(id: String, node: Node) -> void:
    if not _active() or node.health>0: return
    _feedback(progression.complete_quest(id,true),"quest")

func _exit_activated(who: Node3D, id: String) -> void:
    if not _active() or who!=actor: return
    var trial = Progression.new()
    trial.configure(definition)
    trial.restore(progression.snapshot())
    var result: Dictionary = trial.travel(id)
    if not result.ok:
        _feedback(result,"travel")
        return
    var next: Dictionary = trial.snapshot()
    var prepared := _prepare(next.region)
    if not prepared.ok:
        push_warning("ASSEMBLY: "+str(prepared.error))
        _feedback({"ok":false,"error":"下一区域暂时无法进入，当前进度已保留。"},"travel")
        return
    _busy = true
    var health: int = actor.health
    _install(prepared.node,next)
    actor.health = health
    progression.restore(next)
    _busy = false
    _feedback({"ok":true},"travel")

func _feedback(result: Dictionary, event: String) -> void:
    last_event = event if result.ok else "invalid"
    _message = "" if result.ok else str(result.error)
    _sync()
    if result.ok and progression.at_ending(): ui.show_victory()

func _screen_changed(screen: String) -> void:
    state = "playing" if screen=="playing" else "won" if screen=="victory" else "lost" if screen=="failure" else "ready" if screen=="title" else "paused"
    actor.controls_enabled = screen=="playing"
    for component in actor.find_children("*","Node",true,false):
        if component.has_method("resume_controls") and component.has_method("release_pointer"):
            if screen=="playing": component.resume_controls()
            else:
                component.enabled = false
                component.release_pointer()
    _sync()

func _died() -> void:
    if is_instance_valid(ui): ui.show_failure("从上次保存的区域检查点重新出发。")
    _sync()

func _sync() -> void:
    player_health = actor.health if is_instance_valid(actor) else 0
    collected = progression.snapshot().get("completed",[]).size()
    if is_instance_valid(ui) and ui.is_inside_tree(): ui.refresh()

func _snapshot() -> Dictionary:
    var current: Dictionary = progression.snapshot()
    var items := []
    var abilities := []
    var quests := []
    var regions := []
    var goal := "探索区域，寻找下一条通路"
    for id in current.inventory:
        if current.inventory[id]>0: items.append({"name":manifest.labels.items[id],"count":current.inventory[id]})
    for id in current.abilities: abilities.append({"name":manifest.labels.abilities[id],"status":"已解锁"})
    for q in definition.quests:
        var complete: bool = q.id in current.completed
        quests.append({"name":manifest.labels.quests[q.id],"status":"已完成" if complete else "进行中" if q.region==current.region else "尚未完成"})
        if q.region==current.region and not complete: goal = manifest.labels.quests[q.id]
    for id in definition.regions: regions.append({"name":manifest.labels.regions[id],"status":"当前位置" if id==current.region else "其他区域"})
    return {"health":actor.health,"max_health":actor.max_health,"has_save":FileAccess.file_exists(_save_path),"outcome":"victory" if progression.at_ending() else "failure" if actor.health<=0 else "playing","goal":goal,"interaction":_message if not _message.is_empty() else manifest.controls,"controls":manifest.controls,"region":manifest.labels.regions[current.region],"ending":"已完成当前方案声明的目标。","items":items,"abilities":abilities,"quests":quests,"regions":regions}

func _valid_save(value: Dictionary) -> bool:
    return value.size()==3 and value.get("signature")==_signature and (value.get("health") is int or value.get("health") is float) and is_finite(float(value.health)) and value.health==int(value.health) and value.health>=1 and value.health<=actor.max_health and value.get("progression") is Dictionary and progression.valid_state(value.progression)

func _command(action: String) -> Dictionary:
    if not failure.is_empty() or _busy: return {"ok":false,"message":"游戏暂时无法继续，原存档已保留。"}
    if action=="title": return {"ok":true}
    if action=="save":
        var result: Dictionary = Checkpoint.save_slot(_save_path,manifest.gameId,int(manifest.contentVersion),{"signature":_signature,"health":actor.health,"progression":progression.snapshot()},Callable(self,"_valid_save"))
        return {"ok":result.ok,"message":"已保存至当前区域检查点。" if result.ok else result.error}
    if not action in ["new_game","continue","retry"]: return {"ok":false,"message":"未知操作"}
    var trial = Progression.new()
    trial.configure(definition)
    var health: int = actor.max_health
    if action!="new_game" and FileAccess.file_exists(_save_path):
        var saved: Dictionary = Checkpoint.load_slot(_save_path,manifest.gameId,int(manifest.contentVersion),Callable(self,"_valid_save"))
        if not saved.ok: return {"ok":false,"message":saved.error}
        trial.restore(saved.state.progression)
        health = int(saved.state.health)
    elif action=="continue": return {"ok":false,"message":"尚无存档"}
    var next: Dictionary = trial.snapshot()
    var prepared := _prepare(next.region)
    if not prepared.ok:
        push_warning("ASSEMBLY: "+str(prepared.error))
        return {"ok":false,"message":"区域暂时无法加载，原存档与当前进度已保留。"}
    if action=="new_game":
        var archived: Dictionary = Checkpoint.archive_slot(_save_path)
        if not archived.ok:
            prepared.node.free()
            return {"ok":false,"message":archived.error}
    _busy = true
    _install(prepared.node,next)
    actor.health = health
    progression.restore(next)
    _message = ""
    _busy = false
    last_event = action
    _sync()
    return {"ok":true}

func _process(delta: float) -> void:
    if failure.is_empty() and is_instance_valid(actor) and is_instance_valid(ui):
        _clock += delta
        if _clock>=0.15:
            _clock = 0.0
            _sync()
        if ui.screen=="playing" and actor.global_position.y < -20.0: actor.take_damage(actor.max_health)
`;

export const GAME_ASSEMBLY_GUIDE = `# Opt-in adventure assembly v1

For selected interaction/defeat exploration games, use a Node3D root with game_assembly_v1.gd. It composes the declared authored player and region PackedScenes, progression, native UI, palette and region checkpoint saves. It does not generate level geometry, character assets or complete gameplay from a filename. Do not force this profile onto unrequested game genres.

Create data/game-assembly.json version 1: gameId (lowercase stable ID), contentVersion (positive integer), title/subtitle/controls, playerScene (project-relative .tscn), regions keyed by every progression region. Each region has scene (.tscn), spawn (Marker3D NodePath), quests keyed by its quest IDs ({node,kind:interact|defeat}), exits keyed by outgoing/bidirectional link IDs (Interactable NodePath). Nodes must exist in the packed scene before _ready, paths must be distinct. Every logical objective and outgoing route needs a physical binding. The host checks files and mappings; runtime checks actual node types. Invalid target scenes must leave the current progress and world intact.

The player scene root uses adventure_controller_v1.gd, with authored visual/collision/camera/animation/rig and interactor. Its interactor.actor points to itself, actual InputMap actions match displayed controls. Quest/exit nodes use interactable_v1.gd with real distance/obstruction/can_activate conditions; bind completed interaction objectives only when the interaction itself fulfills the authored quest. Defeat objectives use enemy_v1.gd; the session supplies the real target. For other objective types build a separate explicit adapter, not fake completion events. Critical defeat objectives must be reachable only after prerequisites are met; this first profile does not respawn a prerequisite-blocked objective enemy. Runtime scene scripts/physics still need independent playtesting.

Provide labels.{regions,quests,items,abilities} for every definition ID. UI values derive from the single NoobiProgression state, not duplicate counters. Persist completed quests/rewards/opened passages and player health at a REGION checkpoint. On continue, rebuild that region at its authored safe spawn, restore completed pickups/enemies and outcome. Other transient enemies reset; partial encounter/position persistence is not implemented. Keep contentVersion honest. A checksum of assembly+progression binds saves; incompatible saves fail without overwrite, while explicit new-game archives the old save.

style contains artBibleId, artBibleHash (SHA256 of exact .noobi/art-bible.json bytes), references (0–8 project-relative PNG/JPG/WebP source paths), and colors {background,surface,text,accent,accentText,border,success}. All seven roles are #RRGGBB members of the bound ArtBible palette; text/surface and accentText/accent need contrast >=4.5. Keep style source files in the authoring project. Runtime uses colors in exported data/game-assembly.json; the hidden ArtBible need not ship. Scene materials, models and lighting must separately follow the same authored style. Matching palette/file hashes is provenance, not reference similarity or art approval. Inspect actual UI, world and reference together. Fonts retain original licenses.

The host freezes files and writes assembly-check.json with source and reference hashes. Its finding is deliberately limited to wiring and provenance. Declare data/*.json in export filters. Actual input must prove gated routes, single rewards, travel, pause, death/retry, save/reload and ending. Failure, unsupported cases and missing model/API budget stay visible; no engineering assembly may be presented as autonomous generation.
`;
