import{readFile,writeFile,mkdir}from'node:fs/promises';import{join,resolve}from'node:path';import{execFile}from'node:child_process';import{promisify}from'node:util';import assert from'node:assert/strict';
const input=JSON.parse(await readFile('.noobi-private/game-ui/latest-build.json','utf8'));const out=join(input.out,'native-settings');await mkdir(out,{recursive:true});
// A separate native component test script in the engineering workspace; not a gameplay input verdict.
await writeFile(join(input.root,'ui_settings_test.gd'),`extends SceneTree
var checks := 0
func check(value: bool, message: String) -> void:
    if not value: push_error(message); quit(1)
    assert(value, message)
    checks += 1
func _initialize() -> void:
    call_deferred("run")
func run() -> void:
    var reload_mode := OS.get_cmdline_user_args().has("--reload")
    var ui = load("res://runtime/noobi/ui_v1.gd").new()
    ui.snapshot_provider = func(): return {"health": 2, "max_health": 3, "has_save": false}
    ui.command_handler = func(_action): return {"ok": false, "message": "磁盘不可写，保留当前进度。"}
    root.add_child(ui)
    await process_frame
    if reload_mode:
        check(ui.settings.muted == true, "mute persists")
        check(absf(ui.settings.master - 0.35) < 0.001, "volume persists")
        check(ui.settings.graphics == "low", "graphics persists")
        check(ui.settings.reduced_motion == true, "motion preference persists")
    else:
        check(paused and ui.screen == "title", "title pauses world")
        ui.show_screen("playing")
        check(not paused, "play resumes world")
        ui.show_screen("pause")
        check(not ui._command("save") and ui.screen == "pause", "failed save keeps pause")
        check(ui._message.text.contains("磁盘不可写"), "failed save visible")
        ui._set_setting(0.35, "master")
        ui._set_setting(true, "muted")
        ui._set_setting(0.25, "music")
        ui._set_setting(0.0, "effects")
        ui._set_setting("low", "graphics")
        ui._set_setting(true, "reduced_motion")
        check(absf(db_to_linear(AudioServer.get_bus_volume_db(0)) - 0.35) < 0.001, "actual master gain")
        check(AudioServer.is_bus_mute(0), "actual master mute")
        check(absf(db_to_linear(AudioServer.get_bus_volume_db(AudioServer.get_bus_index("NoobiMusic"))) - 0.25) < 0.001, "music bus gain")
        check(AudioServer.is_bus_mute(AudioServer.get_bus_index("NoobiSFX")), "zero effects mute")
        check(absf(root.scaling_3d_scale - 0.75) < 0.001, "actual viewport scale")
    print("UI_NATIVE_OK ", checks, " reload=", reload_mode)
    ui.queue_free()
    await process_frame
    quit(0)
`);
const exec=promisify(execFile),user=join(out,'home');await mkdir(user,{recursive:true});const env={...process.env,XDG_DATA_HOME:user};const args=['--headless','--path',input.root,'--script','res://ui_settings_test.gd'];
await exec('/opt/homebrew/bin/godot',['--headless','--path',input.root,'--editor','--quit'],{env,timeout:30000,maxBuffer:1024*1024});
for(const reload of [false,true]){const result=await exec('/opt/homebrew/bin/godot',[...args,...(reload?['--','--reload']:[])],{env,timeout:30000,maxBuffer:1024*1024});await writeFile(join(out,reload?'reload.log':'first.log'),result.stdout+result.stderr);assert.ok(result.stdout.includes('UI_NATIVE_OK'),result.stderr);assert.ok(!/SCRIPT ERROR|ERROR:/u.test(result.stderr),result.stderr);}
console.log('UI_NATIVE_OK',out);
