import{createAdventureFixture}from'./adventure-browser-fixture.mjs';import{readFile,writeFile}from'node:fs/promises';import{join}from'node:path';
// An engineering integration scene, not a Noobi-generated game or approved art.
export async function createGameUiFixture(root){
await createAdventureFixture(root,{dragOnly:true});let s=await readFile(join(root,'scripts/main.gd'),'utf8');
s=s.replace('var state := "ready"','var ui = preload("res://runtime/noobi/ui_v1.gd").new()\nvar state := "ready"');
const from=s.indexOf('    var layer := CanvasLayer.new()'),to=s.indexOf('func _valid(',from);
s=s.slice(0,from)+`    ui.game_title = "云苔旅行记"
    ui.subtitle = "游戏界面组件验证 · 找到遗物，打开出口。"
    ui.snapshot_provider = Callable(self, "_ui_snapshot")
    ui.command_handler = Callable(self, "_ui_command")
    ui.screen_changed.connect(func(next):
        state = next
        player.controls_enabled = next == "playing"
        if next == "playing": rig.resume_controls()
        else: rig.enabled = false; rig.release_pointer())
    add_child(ui)
    interactor.prompt_changed.connect(func(text): message = text)
    player.died.connect(func(): ui.show_failure("掉落或受伤后，可从安全检查点重新出发。"))
    goal.activated.connect(func(_actor): ui.show_victory())
func _process(_delta: float) -> void:
    if state == "playing" and player.position.y < -4: player.take_damage(99)
func _ui_snapshot() -> Dictionary:
    return {"health": player.health, "max_health": 3, "has_save": FileAccess.file_exists("user://adventure-fixture.json"), "goal": "前往紫色出口" if collected else "寻找草坪上的遗物", "interaction": message, "region": "练习草坪", "ending": "遗物已带到出口，这段路线完成了。", "controls": "WASD 移动 · 空格跳跃 · E 交互 · 右键拖拽镜头", "items": [{"name": "草原遗物", "count": collected, "description": "带到紫色出口，开启通路。"}] if collected else [], "abilities": [{"name": "短冲刺", "status": "已解锁", "description": "按 Shift 使用。"}] if collected else [], "quests": [{"name": "寻找遗物", "status": "已完成" if collected else "进行中"}, {"name": "抵达出口", "status": "已完成" if goal.consumed else "进行中"}], "regions": [{"name": "练习草坪", "status": "当前位置"}, {"name": "紫色出口", "status": "可以开启" if collected else "需要遗物"}]}
func _ui_command(action: String) -> Dictionary:
    if action == "save":
        var saved: Dictionary = Checkpoint.save_slot("user://adventure-fixture.json", "adventure-fixture", 1, {"checkpoint": "spawn", "collected": collected, "health": maxi(1,player.health)}, Callable(self, "_valid"))
        return {"ok": saved.ok, "message": "进度已保存。" if saved.ok else saved.error}
    if action == "new_game":
        var archived: Dictionary = Checkpoint.archive_slot("user://adventure-fixture.json")
        if not archived.ok: return {"ok": false, "message": archived.error}
        _restart()
        return {"ok": true}
    if action in ["continue", "retry"]:
        if action == "retry" and not FileAccess.file_exists("user://adventure-fixture.json"):
            _restart()
            return {"ok": true}
        var saved: Dictionary = Checkpoint.load_slot("user://adventure-fixture.json", "adventure-fixture", 1, Callable(self, "_valid"))
        if not saved.ok: return {"ok": false, "message": saved.error}
        _restart()
        collected = int(saved.state.collected)
        player.health = int(saved.state.health)
        pickup.consumed = collected == 1
        pickup.visible = not pickup.consumed
        player.dash_unlocked = collected == 1
        return {"ok": true}
    if action == "title":
        state = "title"
        return {"ok": true}
    return {"ok": false, "message": "未知操作"}
`+s.slice(to);
// Engineering checkpoint fixture does not use an exit one-shot reward; reset its presentation on a new run.
s=s.replace('    collected = 0\n    pickup.consumed', '    collected = 0\n    goal.consumed = false\n    pickup.consumed');
await writeFile(join(root,'scripts/main.gd'),s);
}
