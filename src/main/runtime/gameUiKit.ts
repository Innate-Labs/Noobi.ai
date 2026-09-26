/** Game-owned state adapters + native Control UI; no simulated inventory or completion. */
export const GAME_UI_KIT = String.raw`extends CanvasLayer
class_name NoobiGameUI
# Version 1. A game supplies snapshot() and command(action) -> {ok, message}.
signal screen_changed(screen: String)
signal settings_changed(settings: Dictionary)

const FONT = preload("res://runtime/noobi/fonts/fusion-pixel-12px-proportional-zh_hans.otf.woff2")
var game_title := "新的冒险"
var subtitle := "每一次出发，都有新的发现。"
var accent := Color("bfa4ee")
var palette: Dictionary = {}
var background_art: Texture2D
var snapshot_provider: Callable
var command_handler: Callable
var screen := "title"
var previous_screen := "title"
var snapshot: Dictionary = {}
var settings := {"master": 0.8, "music": 0.65, "effects": 0.85, "muted": false, "reduced_motion": false, "graphics": "normal"}
var _root: Control
var _hud: Control
var _overlay: Control
var _message: Label
var _health: ProgressBar
var _health_text: Label
var _goal: Label
var _hint: Label
var _region: Label
var _clock := 0.0
var _busy := false
var _failure_reason := "调整一下节奏，再试一次。"
var _return_target := "title"

func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    layer = 80
    var config := ConfigFile.new()
    if config.load("user://noobi-ui-settings-v1.cfg") == OK:
        for key in settings:
            var value: Variant = config.get_value("settings", key, settings[key])
            if typeof(value) == typeof(settings[key]) and (not value is float or is_finite(value)): settings[key] = value
    _apply_settings()
    _root = Control.new()
    _root.name = "GameUI"
    _root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    _root.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _root.theme = _theme()
    add_child(_root)
    _hud = _build_hud()
    _root.add_child(_hud)
    _root.resized.connect(_resize_overlay)
    refresh()
    show_screen("title")

func refresh() -> void:
    if snapshot_provider.is_valid():
        var value: Variant = snapshot_provider.call()
        if value is Dictionary: snapshot = value.duplicate(true)
    if not is_instance_valid(_health): return
    var maximum := maxf(1.0, float(snapshot.get("max_health", 100)))
    var health := clampf(float(snapshot.get("health", maximum)), 0.0, maximum)
    _health.max_value = maximum
    _health.value = health
    _health_text.text = "生命  %d / %d" % [health, maximum]
    _goal.text = str(snapshot.get("goal", "查看任务，开始探索"))
    _hint.text = str(snapshot.get("interaction", ""))
    _region.text = str(snapshot.get("region", ""))

func _process(delta: float) -> void:
    _clock += delta
    if _clock >= 0.15:
        _clock = 0.0
        refresh()

func _unhandled_input(event: InputEvent) -> void:
    if not event is InputEventKey or not event.pressed or event.echo: return
    if event.keycode == KEY_ESCAPE:
        if screen == "playing": show_screen("pause")
        elif screen == "pause": show_screen("playing")
        elif screen in ["inventory", "quests", "map"]: show_screen("playing")
        elif screen in ["settings", "confirm_new", "confirm_title"]: show_screen(previous_screen)
        else: return
    elif screen == "playing" and event.keycode in [KEY_I, KEY_J, KEY_M]:
        show_screen({KEY_I: "inventory", KEY_J: "quests", KEY_M: "map"}[event.keycode])
    else: return
    get_viewport().set_input_as_handled()

func show_failure(reason: String) -> void:
    _failure_reason = reason
    show_screen("failure")

func show_victory() -> void:
    show_screen("victory")

func show_screen(next: String) -> void:
    if not next in ["title", "playing", "pause", "settings", "inventory", "quests", "map", "failure", "victory", "confirm_new", "confirm_title"]: return
    if next in ["settings", "confirm_new", "confirm_title"]: previous_screen = screen
    screen = next
    get_tree().paused = screen != "playing"
    if screen != "playing":
        Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
        for action in InputMap.get_actions():
            if str(action).begins_with("noobi_"): Input.action_release(action)
    if is_instance_valid(_overlay):
        _root.remove_child(_overlay)
        _overlay.queue_free()
    _overlay = null
    _hud.visible = screen == "playing"
    refresh()
    if screen != "playing": _build_overlay()
    screen_changed.emit(screen)

func _color(role: String, fallback: Color) -> Color:
    var value: Variant = palette.get(role, fallback)
    return value if value is Color else fallback

func _theme() -> Theme:
    var theme := Theme.new()
    theme.default_font = FONT
    theme.default_font_size = 24
    theme.set_color("font_color", "Label", _color("text", Color("f7f2df")))
    for state in ["normal", "hover", "pressed", "disabled", "focus"]:
        var box := _box(_color("surface", Color("34384b")), _color("border", Color("56576c")), 12)
        if state == "hover": box.bg_color = _color("surface", Color("4c435d")); box.border_color = accent
        if state == "pressed": box.bg_color = _color("surface", Color("242838")); box.border_color = accent
        if state == "focus": box.bg_color = Color(0,0,0,0); box.border_color = _color("accent", Color("f3d891")); box.set_border_width_all(3)
        if state == "disabled": box.bg_color = _color("surface", Color("252939")); box.border_color = _color("border", Color("323748"))
        theme.set_stylebox(state, "Button", box)
    theme.set_color("font_color", "Button", _color("text", Color("f7f2df")))
    theme.set_color("font_disabled_color", "Button", _color("text", Color("858895")))
    if not palette.is_empty():
        theme.set_color("font_hover_color", "Button", _color("text", Color("f7f2df")))
        theme.set_color("font_pressed_color", "Button", _color("text", Color("f7f2df")))
        theme.set_color("font_focus_color", "Button", _color("text", Color("f7f2df")))
    theme.set_constant("separation", "VBoxContainer", 14)
    theme.set_constant("separation", "HBoxContainer", 12)
    theme.set_stylebox("background", "ProgressBar", _box(_color("background", Color("242839")), _color("border", Color("56576c")), 8))
    theme.set_stylebox("fill", "ProgressBar", _box(_color("success", Color("a5dab4")), _color("success", Color("a5dab4")), 8))
    return theme

func _box(fill: Color, border: Color, radius: int) -> StyleBoxFlat:
    var box := StyleBoxFlat.new()
    box.bg_color = fill
    box.border_color = border
    box.set_border_width_all(2)
    box.set_corner_radius_all(radius)
    box.content_margin_left = 18
    box.content_margin_right = 18
    box.content_margin_top = 12
    box.content_margin_bottom = 12
    return box

func _label(text: String, size: int = 24) -> Label:
    var node := Label.new()
    node.text = text
    node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    node.add_theme_font_size_override("font_size", size)
    node.mouse_filter = Control.MOUSE_FILTER_IGNORE
    return node

func _button(text: String, action: Callable, primary: bool = false) -> Button:
    var button := Button.new()
    button.text = text
    button.custom_minimum_size.y = 48
    button.focus_mode = Control.FOCUS_ALL
    if primary:
        button.add_theme_color_override("font_color", _color("accentText", Color("29243a")))
        button.add_theme_stylebox_override("normal", _box(accent, _color("border", Color("eadcff")), 12))
        button.add_theme_stylebox_override("hover", _box(accent.lightened(0.12), _color("border", Color("fff5dc")), 12))
        button.add_theme_color_override("font_hover_color", _color("accentText", Color("29243a")))
        if not palette.is_empty():
            button.add_theme_color_override("font_focus_color", _color("accentText", Color("29243a")))
            button.add_theme_color_override("font_pressed_color", _color("accentText", Color("29243a")))
            button.add_theme_stylebox_override("pressed", _box(accent, _color("border", Color("eadcff")), 12))
    button.pressed.connect(action)
    return button

func _build_hud() -> Control:
    var hud := Control.new()
    hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
    var top := MarginContainer.new()
    top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
    top.add_theme_constant_override("margin_left", 24)
    top.add_theme_constant_override("margin_right", 24)
    top.add_theme_constant_override("margin_top", 24)
    var row := HBoxContainer.new()
    var stats := VBoxContainer.new()
    stats.custom_minimum_size.x = 210
    _health_text = _label("生命")
    stats.add_child(_health_text)
    _health = ProgressBar.new()
    _health.custom_minimum_size = Vector2(210, 16)
    _health.show_percentage = false
    stats.add_child(_health)
    _region = _label("", 20)
    stats.add_child(_region)
    row.add_child(stats)
    var spacer := Control.new()
    spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    row.add_child(spacer)
    var goal_panel := PanelContainer.new()
    goal_panel.custom_minimum_size.x = 290
    goal_panel.add_theme_stylebox_override("panel", _box(_color("surface", Color("242839e8")), _color("border", Color("57536e")), 14))
    var goal_box := VBoxContainer.new()
    goal_box.add_child(_label("当前目标", 20))
    _goal = _label("")
    goal_box.add_child(_goal)
    goal_panel.add_child(goal_box)
    row.add_child(goal_panel)
    top.add_child(row)
    hud.add_child(top)
    var bottom := VBoxContainer.new()
    bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
    bottom.offset_left = 24
    bottom.offset_right = -24
    bottom.offset_top = -135
    bottom.offset_bottom = -24
    _hint = _label("")
    _hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    bottom.add_child(_hint)
    var buttons := HBoxContainer.new()
    buttons.alignment = BoxContainer.ALIGNMENT_CENTER
    for entry in [["I 背包", "inventory"], ["J 任务", "quests"], ["M 地图", "map"], ["Esc 暂停", "pause"]]:
        buttons.add_child(_button(entry[0], show_screen.bind(entry[1])))
    bottom.add_child(buttons)
    hud.add_child(bottom)
    return hud

func _build_overlay() -> void:
    _overlay = Control.new()
    _overlay.name = "Screen_" + screen
    _overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    _overlay.mouse_filter = Control.MOUSE_FILTER_STOP
    _root.add_child(_overlay)
    if screen == "title" and background_art:
        var art := TextureRect.new()
        art.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
        art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
        art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
        art.texture = background_art
        art.mouse_filter = Control.MOUSE_FILTER_IGNORE
        _overlay.add_child(art)
    var dim := ColorRect.new()
    dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    dim.color = _color("background", Color("171b2ee6")) if screen == "title" else _color("background", Color("151928ce"))
    dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _overlay.add_child(dim)
    var panel := PanelContainer.new()
    panel.name = "MenuPanel"
    panel.add_theme_stylebox_override("panel", _box(_color("surface", Color("252b3a")), _color("border", Color("777087")), 20))
    var scroll := ScrollContainer.new()
    scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
    scroll.follow_focus = true
    var content := VBoxContainer.new()
    content.name = "Content"
    content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    scroll.add_child(content)
    panel.add_child(scroll)
    _overlay.add_child(panel)
    var titles := {"title": game_title, "pause": "歇一会儿", "settings": "冒险设置", "inventory": "行囊", "quests": "冒险手记", "map": "区域地图", "failure": "这次先到这里", "victory": "旅程完成", "confirm_new": "重新开始冒险？", "confirm_title": "返回标题？"}
    var eyebrow := _label("ADVENTURE JOURNAL" if screen in ["quests", "map", "inventory"] else "YOUR NEXT ADVENTURE", 16)
    eyebrow.modulate = accent
    content.add_child(eyebrow)
    content.add_child(_label(titles[screen], 40))
    if screen == "title":
        content.add_child(_label(subtitle, 22))
        var continue_button := _button("继续冒险", _command.bind("continue"), true)
        continue_button.disabled = not bool(snapshot.get("has_save", false))
        content.add_child(continue_button)
        content.add_child(_button("开始新的冒险", _new_game))
        content.add_child(_button("设置", show_screen.bind("settings")))
        content.add_child(_label(str(snapshot.get("controls", "WASD 移动 · 空格跳跃 · 右键拖拽镜头")), 20))
    elif screen == "pause":
        content.add_child(_label("进度不会在暂停时推进。", 22))
        content.add_child(_button("继续冒险", show_screen.bind("playing"), true))
        content.add_child(_button("保存进度", _command.bind("save")))
        content.add_child(_button("设置", show_screen.bind("settings")))
        content.add_child(_button("返回标题", show_screen.bind("confirm_title")))
    elif screen == "settings":
        _build_settings(content)
        content.add_child(_button("返回", show_screen.bind(previous_screen)))
    elif screen == "inventory":
        _list_rows(content, "items", "行囊里暂时没有物品。")
        content.add_child(_label("已掌握的能力", 28))
        _list_rows(content, "abilities", "还未解锁能力。")
        content.add_child(_button("回到冒险", show_screen.bind("playing")))
    elif screen == "quests":
        _list_rows(content, "quests", "暂时没有任务。")
        content.add_child(_button("回到冒险", show_screen.bind("playing")))
    elif screen == "map":
        content.add_child(_label("当前位置 · " + str(snapshot.get("region", "未知区域")), 22))
        _list_rows(content, "regions", "尚未发现其他区域。")
        content.add_child(_button("回到冒险", show_screen.bind("playing")))
    elif screen == "failure":
        content.add_child(_label(_failure_reason, 24))
        content.add_child(_button("从检查点重试", _command.bind("retry"), true))
        content.add_child(_button("返回标题", show_screen.bind("confirm_title")))
    elif screen == "victory":
        content.add_child(_label(str(snapshot.get("ending", "你完成了这次冒险。")), 24))
        content.add_child(_button("保存这段旅程", _command.bind("save"), true))
        content.add_child(_button("返回标题", show_screen.bind("confirm_title")))
    elif screen == "confirm_new":
        content.add_child(_label("现有存档将按游戏的存档规则归档，新的冒险从起点开始。", 24))
        content.add_child(_button("确认新冒险", _command.bind("new_game"), true))
        content.add_child(_button("取消", show_screen.bind(previous_screen)))
    elif screen == "confirm_title":
        content.add_child(_label("保留最近一次存档，未保存的进度会丢失。", 24))
        content.add_child(_button("保存并返回", _save_and_title, true))
        content.add_child(_button("不保存，返回标题", _command.bind("title")))
        content.add_child(_button("取消", show_screen.bind(previous_screen)))
    _message = _label("", 20)
    _message.modulate = _color("accent", Color("f3d891"))
    content.add_child(_message)
    _resize_overlay()
    _fit_overlay_height.call_deferred()
    _focus_first.call_deferred(content)

func _resize_overlay() -> void:
    if not is_instance_valid(_overlay): return
    var panel: Control = _overlay.get_node("MenuPanel")
    var available := _root.size
    panel.size = Vector2(minf(620, available.x - 40), maxf(100, minf(660, available.y - 40)))
    panel.position = (available - panel.size) * 0.5
    _fit_overlay_height.call_deferred()

func _fit_overlay_height() -> void:
    if not is_instance_valid(_overlay): return
    var panel: Control = _overlay.get_node("MenuPanel")
    var content: Control = panel.get_child(0).get_child(0)
    var available := _root.size
    panel.size.y = minf(maxf(220, content.get_combined_minimum_size().y + 32), maxf(100, available.y - 40))
    panel.position = (available - panel.size) * 0.5

func _focus_first(node: Node) -> void:
    if not is_instance_valid(node) or not node.is_inside_tree(): return
    for child in node.get_children():
        if child is Button and not child.disabled:
            child.grab_focus()
            return

func _list_rows(parent: VBoxContainer, key: String, empty: String) -> void:
    var rows: Variant = snapshot.get(key, [])
    if not rows is Array or rows.is_empty():
        parent.add_child(_label(empty, 22))
        return
    for row in rows:
        if not row is Dictionary: continue
        var panel := PanelContainer.new()
        panel.add_theme_stylebox_override("panel", _box(_color("surface", Color("303849")), _color("border", Color("475267")), 12))
        var lines := VBoxContainer.new()
        var title := str(row.get("name", row.get("title", "")))
        if row.has("count"): title += "  x%d" % int(row.count)
        if row.has("status"): title += "  ·  " + str(row.status)
        lines.add_child(_label(title, 24))
        if row.has("description"): lines.add_child(_label(str(row.description), 20))
        panel.add_child(lines)
        parent.add_child(panel)

func _new_game() -> void:
    if bool(snapshot.get("has_save", false)): show_screen("confirm_new")
    else: _command("new_game")

func _command(action: String) -> bool:
    if _busy: return false
    _busy = true
    var result: Variant = command_handler.call(action) if command_handler.is_valid() else {"ok": false, "message": "游戏还没有连接此操作。"}
    _busy = false
    if not result is Dictionary or result.get("ok", false) != true:
        if is_instance_valid(_message): _message.text = str(result.get("message", "操作失败，请重试。")) if result is Dictionary else "游戏返回了无效结果。"
        return false
    refresh()
    if action in ["new_game", "continue", "retry"]:
        var outcome := str(snapshot.get("outcome", "playing"))
        if outcome == "victory": show_victory()
        elif outcome == "failure": show_failure(str(snapshot.get("failure_reason", "从检查点重新出发。")))
        else: show_screen("playing")
    elif action == "title": show_screen("title")
    elif is_instance_valid(_message): _message.text = str(result.get("message", "进度已保存。"))
    return true

func _save_and_title() -> void:
    if _command("save"): _command("title")

func _build_settings(content: VBoxContainer) -> void:
    for entry in [["master", "总音量"], ["music", "音乐"], ["effects", "音效"]]:
        content.add_child(_label(entry[1], 22))
        var slider := HSlider.new()
        slider.name = "Volume_" + entry[0]
        slider.min_value = 0
        slider.max_value = 1
        slider.step = 0.05
        slider.value = float(settings[entry[0]])
        slider.custom_minimum_size.y = 32
        slider.value_changed.connect(_set_setting.bind(entry[0]))
        content.add_child(slider)
    for entry in [["muted", "静音"], ["reduced_motion", "减少动态效果"]]:
        var check := CheckButton.new()
        check.text = entry[1]
        check.button_pressed = bool(settings[entry[0]])
        check.toggled.connect(_set_setting.bind(entry[0]))
        content.add_child(check)
    var graphics := OptionButton.new()
    graphics.add_item("画面：标准", 0)
    graphics.add_item("画面：省电", 1)
    graphics.selected = 1 if settings.graphics == "low" else 0
    graphics.item_selected.connect(func(index): _set_setting("low" if index == 1 else "normal", "graphics"))
    content.add_child(graphics)

func _set_setting(value: Variant, key: String) -> void:
    settings[key] = value
    _apply_settings()
    var config := ConfigFile.new()
    for setting in settings: config.set_value("settings", setting, settings[setting])
    var error := config.save("user://noobi-ui-settings-v1.cfg")
    if error != OK and is_instance_valid(_message): _message.text = "本次设置已生效，但未能保存。"
    settings_changed.emit(settings.duplicate(true))

func _apply_settings() -> void:
    if not settings.graphics in ["normal", "low"]: settings.graphics = "normal"
    for entry in [["Master", "master"], ["NoobiMusic", "music"], ["NoobiSFX", "effects"]]:
        var index := AudioServer.get_bus_index(entry[0])
        if index < 0:
            AudioServer.add_bus()
            index = AudioServer.bus_count - 1
            AudioServer.set_bus_name(index, entry[0])
            AudioServer.set_bus_send(index, "Master")
        var level := clampf(float(settings[entry[1]]), 0, 1)
        settings[entry[1]] = level
        AudioServer.set_bus_volume_db(index, linear_to_db(maxf(level, 0.0001)))
        AudioServer.set_bus_mute(index, level == 0 or (entry[0] == "Master" and bool(settings.muted)))
    get_viewport().scaling_3d_scale = 0.75 if settings.graphics == "low" else 1.0
`;

export const GAME_UI_GUIDE = `# Noobi game UI v1

Instantiate ui_v1.gd before play and set game_title, subtitle, accent (approved ArtBible color), optional background_art (a real game image), snapshot_provider and command_handler before add_child. Optionally supply palette entries (Color values) background/surface/text/accent/accentText/border/success before add_child; full scene assembly derives these roles from the bound ArtBible. These color roles do not certify reference likeness or recolor scene assets. Default typography is the bundled licensed Chinese font; substitute a licensed family if pixel typography does not fit the art direction.

Snapshot callback returns current health/max_health, goal, interaction, region, has_save, controls, ending; items/abilities/quests/regions are arrays of {name, description?, count?, status?}. Values come from real authoritative game state, never fake UI inventory or fixed quest completions. The map is a list of known regions and their state, not an invented spatial map. Call refresh after transactions and show_failure(reason)/show_victory on real outcomes. Include outcome="victory" or "failure" (and optional failure_reason) when restoring a terminal save; new/continue/retry then opens the authoritative ending/failure screen rather than reviving completed gameplay. Omit outcome or use "playing" for active runs.

command_handler(action) synchronously returns {ok:bool,message?:String}. Handle new_game, continue, retry, save and title. Use CHECKPOINT_V1 and PROGRESSION_V1 for validated durable state. Save must return true only after successful persistence, new_game must archive/explicitly clear old progress, retry must restore authored safe state. On title, stop audio/clear transient gameplay as needed but keep the most recent save. Errors keep the menu open. Missing handlers fail visibly. Long asynchronous operations need a game-owned loading adapter and must not prematurely return success.

The UI pauses the SceneTree for every menu and uses PROCESS_MODE_ALWAYS itself. World/controller/enemies must inherit pause mode; also bind screen_changed to the camera's controls_enabled and clear custom input actions. Never add PROCESS_MODE_ALWAYS to the whole game. Right-drag camera must remain released in menus. Esc pauses/resumes; I/J/M open inventory/journal/regions. Visible controls support mouse and keyboard focus; gameplay uses _unhandled_input so UI clicks never swing weapons. No direct game-win or debug teleport button exists.

AudioStreamPlayers for music/effects must use NoobiMusic/NoobiSFX buses; the UI sets Master and those bus levels. Muting zero volume is explicit. Connect settings_changed.reduced_motion to game motion/camera shake; the kit itself has no large animation. Low graphics sets viewport 3D scale to .75; scenes may add documented detail changes. Settings persist to user://noobi-ui-settings-v1.cfg and are separate from progression saves. Keep browser origin stable for persistence; configure separate game user-data paths when distributing games with the same title.

Acceptance: real title -> new -> HUD -> inventory/quests/map -> pause/settings -> save -> reload/continue -> failure/retry -> ending/title. Test no save, invalid save, failed save, repeated commands, keyboard focus, paused physics/audio settings, 1280x720 and 800x600; menus scroll and focus stays reachable. Test settings reload in a second process and inspect actual audio bus/scaling values. A template menu is not finished game art: review themed screens alongside the approved references.
`;
