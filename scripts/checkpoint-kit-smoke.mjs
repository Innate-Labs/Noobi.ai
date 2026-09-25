// Real Godot filesystem persistence and corrupt/incompatible-slot preservation.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { CHECKPOINT_KIT } from '../dist/main/runtime/checkpointKit.js';
const root = resolve('.noobi-private/stage-06/checkpoint'); await mkdir(root, { recursive: true });
const exec = promisify(execFile), engine = process.env.NOOBI_GODOT_PATH || 'godot';
await writeFile(join(root, 'checkpoint.gd'), CHECKPOINT_KIT);
await writeFile(join(root, 'project.godot'), `[application]\nconfig/name="Noobi checkpoint engineering fixture"\nconfig/use_custom_user_dir=true\nconfig/custom_user_dir="noobi-checkpoint-fixture-${Date.now()}"\nrun/main_scene="res://main.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n`);
await writeFile(join(root, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Main" type="Node"]\nscript = ExtResource("1")\n');
await writeFile(join(root, 'main.gd'), `extends Node
const Checkpoint = preload("res://checkpoint.gd")
const SLOT := "user://fixture.json"
func valid(state: Dictionary) -> bool:
    return state.keys().size() == 4 and state.get("checkpoint") in ["spawn", "bridge"] and (state.get("health") is float or state.get("health") is int) and state.health >= 1 and state.health <= 3 and fmod(state.health, 1.0) == 0.0 and state.get("ability") is bool and state.get("consumed") is Array and state.consumed.size() <= 3 and state.consumed.all(func(id): return id is String and id in ["key", "reward", "flower"])
func check(ok: bool, message: String) -> void:
    if not ok:
        push_error("CHECKPOINT_FAILURE: " + message)
        get_tree().quit(1)
func _ready() -> void:
    var validate := Callable(self, "valid")
    if "--load-only" in OS.get_cmdline_user_args():
        var restored: Dictionary = Checkpoint.load_slot(SLOT, "fixture", 1, validate)
        check(restored.ok and restored.state.checkpoint == "bridge" and restored.state.consumed == ["key"] and restored.state.ability, "new process reads complete state")
        print("CHECKPOINT_RESTART_OK")
        get_tree().quit(0)
        return
    var state := {"checkpoint": "spawn", "health": 3, "ability": false, "consumed": []}
    check(not Checkpoint.load_slot(SLOT, "fixture", 1, validate).ok, "missing slot")
    check(Checkpoint.save_slot(SLOT, "fixture", 1, state, validate).ok, "first save")
    state.checkpoint = "bridge"
    state.consumed = ["key"]
    state.ability = true
    check(Checkpoint.save_slot(SLOT, "fixture", 1, state, validate).ok, "second atomic save")
    check(FileAccess.file_exists(SLOT + ".bak"), "previous slot retained")
    var before := FileAccess.get_file_as_string(SLOT)
    check(not Checkpoint.load_slot(SLOT, "other-game", 1, validate).ok, "wrong game rejected")
    check(not Checkpoint.load_slot(SLOT, "fixture", 2, validate).ok, "incompatible version rejected")
    check(not Checkpoint.save_slot(SLOT, "fixture", 2, state, validate).ok, "new version cannot overwrite old save")
    check(FileAccess.get_file_as_string(SLOT) == before, "incompatible save preserved")
    var invalid := state.duplicate(true)
    invalid.health = -1
    check(not Checkpoint.save_slot(SLOT, "fixture", 1, invalid, validate).ok, "invalid state rejected")
    check(not Checkpoint.save_slot("user://../escape.json", "fixture", 1, state, validate).ok, "path escape rejected")
    var file := FileAccess.open(SLOT, FileAccess.WRITE)
    file.store_string(before.replace("bridge", "broken"))
    file.close()
    check(not Checkpoint.load_slot(SLOT, "fixture", 1, validate).ok, "corrupt checksum rejected")
    check(not Checkpoint.save_slot(SLOT, "fixture", 1, state, validate).ok, "corrupt source not overwritten")
    var archived: Dictionary = Checkpoint.archive_slot(SLOT)
    check(archived.ok and FileAccess.file_exists(archived.archived), "explicit archive preserves corrupt original")
    check(Checkpoint.save_slot(SLOT, "fixture", 1, state, validate).ok, "new game after explicit archive")
    print("CHECKPOINT_BOUNDARIES_OK")
    get_tree().quit(0)
`);
const imported = await exec(engine, ['--headless', '--path', root, '--editor', '--import'], { timeout: 60000, maxBuffer: 4000000 });
await writeFile(join(root, 'import.log'), imported.stdout + imported.stderr); assert.doesNotMatch(imported.stdout + imported.stderr, /SCRIPT ERROR|Parse Error/);
for (const resume of [false, true]) {
  const result = await exec(engine, ['--headless', '--path', root, ...(resume ? ['--', '--load-only'] : [])], { timeout: 20000, maxBuffer: 4000000 });
  await writeFile(join(root, resume ? 'restart.log' : 'runtime.log'), result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /SCRIPT ERROR|CHECKPOINT_FAILURE|Parse Error/); assert.match(result.stdout, resume ? /CHECKPOINT_RESTART_OK/ : /CHECKPOINT_BOUNDARIES_OK/);
}
console.log('CHECKPOINT_KIT_OK: real Godot saves, checksums, validation, incompatible preservation, archive and new-process reload');
