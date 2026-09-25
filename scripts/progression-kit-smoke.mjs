// Real Godot component transactions and checkpoints; not a generated game.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';import { promisify } from 'node:util';import assert from 'node:assert/strict';
import { PROGRESSION_KIT } from '../dist/main/runtime/progressionKit.js';import { CHECKPOINT_KIT } from '../dist/main/runtime/checkpointKit.js';
import { parseProgression, analyzeProgression } from '../dist/main/production/progressionGraph.js';
const out=resolve('.noobi-private/stage-08/runtime',new Date().toISOString().replaceAll(':','-'));await mkdir(out,{recursive:true});
const definition=JSON.parse(await readFile('examples/progression/three-regions.json','utf8'));const analysis=analyzeProgression(parseProgression(definition));assert.ok(analysis.ok);
await writeFile(join(out,'progression.gd'),PROGRESSION_KIT);await writeFile(join(out,'checkpoint.gd'),CHECKPOINT_KIT);await writeFile(join(out,'definition.json'),JSON.stringify(definition));
await writeFile(join(out,'project.godot'),'[application]\nconfig/name="Progression engineering fixture"\nconfig/use_custom_user_dir=true\nconfig/custom_user_dir="noobi-progress-'+Date.now()+'"\n');
await writeFile(join(out,'main.gd'),`extends SceneTree
const Progression = preload("res://progression.gd")
const Checkpoint = preload("res://checkpoint.gd")
var progress = Progression.new()
var checks := 0
func check(ok: bool, label: String) -> void:
    if not ok:
        push_error("PROGRESSION_FAILURE " + label)
        quit(1)
        assert(ok,label)
    checks += 1
func _initialize():
    var d = JSON.parse_string(FileAccess.get_file_as_string("res://definition.json"))
    check(progress.configure(d).ok,"definition")
    if "--reload" in OS.get_cmdline_user_args():
        var disk = Checkpoint.load_slot("user://slot.json","fixture",1,progress.valid_state)
        check(disk.ok and progress.restore(disk.state).ok,"independent process restore")
        check(progress.snapshot().region == "ruins" and "glide" in progress.snapshot().abilities,"saved region and ability")
        check(not progress.complete_quest("ruins-glide",true).ok,"no reward replay after process restart")
        print("PROGRESSION_RELOAD_OK ",checks)
        quit()
        return
    var initial = progress.snapshot()
    check(not progress.complete_quest("camp-key",false).ok,"real objective required")
    check(not progress.travel("camp-ruins").ok,"locked gate")
    check(progress.snapshot() == initial,"failure atomic")
    check(progress.complete_quest("camp-key",true).ok,"first reward")
    check(not progress.complete_quest("camp-key",true).ok,"no duplicate reward")
    var snapshot = progress.snapshot()
    snapshot.inventory.key = 99
    check(progress.snapshot().inventory.key == 1,"snapshot isolation")
    check(progress.travel("camp-ruins").ok,"first opening")
    check(progress.snapshot().inventory.key == 0,"key consumed")
    check(progress.travel("camp-ruins").ok and progress.travel("camp-ruins").ok,"return without second cost")
    check(progress.complete_quest("ruins-glide",true).ok,"second ability")
    check(Checkpoint.save_slot("user://slot.json","fixture",1,progress.snapshot(),progress.valid_state).ok,"save normalized state")
    var checkpoint = progress.snapshot()
    check(progress.travel("ruins-summit").ok,"ability gate")
    check(not progress.at_ending(),"final challenge required")
    check(progress.complete_quest("finale",true).ok and progress.at_ending(),"ending")
    var invalid = progress.snapshot()
    invalid.inventory.gem = 1
    check(not progress.restore(invalid).ok and progress.at_ending(),"bad totals preserve live state")
    var loaded = Checkpoint.load_slot("user://slot.json","fixture",1,progress.valid_state)
    check(loaded.ok and progress.restore(loaded.state).ok,"checkpoint restore")
    check(progress.snapshot() == checkpoint and not progress.at_ending(),"death retry restores exact progress")
    check(not progress.complete_quest("ruins-glide",true).ok,"reload cannot duplicate reward")
    var malformed = d.duplicate(true)
    malformed.quests[0].requires.quests = ["ruins-glide"]
    check(not progress.configure(malformed).ok and progress.snapshot() == checkpoint,"reject cycle without wiping state")
    check(progress.reset().ok and progress.snapshot() == initial,"new game resets all progress")
    print("PROGRESSION_KIT_OK ",checks)
    quit()
`);
const checked=await promisify(execFile)('godot',['--headless','--path',out,'--script','res://main.gd'],{timeout:30000,maxBuffer:1024*1024});
await writeFile(join(out,'godot.log'),checked.stdout+'\n'+checked.stderr);assert.ok(checked.stdout.includes('PROGRESSION_KIT_OK'),checked.stderr);assert.ok(!checked.stderr.includes('ERROR'),checked.stderr);
await writeFile(join(out,'logical-check.json'),JSON.stringify(analysis,null,2));console.log(checked.stdout.trim(),out);

const reload=await promisify(execFile)('godot',['--headless','--path',out,'--script','res://main.gd','--','--reload'],{timeout:30000,maxBuffer:1024*1024});
await writeFile(join(out,'reload.log'),reload.stdout+'\n'+reload.stderr);assert.ok(reload.stdout.includes('PROGRESSION_RELOAD_OK'),reload.stderr);assert.ok(!reload.stderr.includes('ERROR'),reload.stderr);console.log(reload.stdout.trim());
