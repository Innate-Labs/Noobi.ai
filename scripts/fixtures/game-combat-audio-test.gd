# Authored combat/audio integration on the formal assembly. Never a generated sample.
extends "res://scripts/base-test.gd"
var enemy_health := -1
var audio_clock := 0.0
var hits := 0
func _ready() -> void:
    InputMap.add_action("noobi_attack")
    var event := InputEventKey.new()
    event.physical_keycode = KEY_F
    InputMap.action_add_event("noobi_attack",event)
    super._ready()
    actor.melee.hit.connect(func(_target): hits+=1)
func observation() -> Dictionary:
    var music := []
    var effects := []
    if is_instance_valid(audio):
        for player in audio._music: music.append({"playing":player.playing,"paused":player.stream_paused,"position":player.get_playback_position(),"gain":player.volume_linear,"path":player.stream.resource_path if player.stream else ""})
        for player in audio._effects: effects.append({"playing":player.playing,"paused":player.stream_paused,"path":player.stream.resource_path if player.stream else ""})
    var guard := world.get_node_or_null("Guard") if is_instance_valid(world) else null
    return {"screen":ui.screen,"region":progression.snapshot().region,"completed":progression.snapshot().completed,"health":actor.health,"enemyHealth":guard.health if guard else -1,"locked":guard.objective_locked if guard else false,"hits":hits,"music":music,"effects":effects,"source":audio._source.resource_path if is_instance_valid(audio) and audio._source else "","fade":audio._duration if is_instance_valid(audio) else 0,"managers":get_tree().get_nodes_in_group("noobi_audio_manager").size()}
func _process(delta: float) -> void:
    super._process(delta)
    if not is_instance_valid(world) or not is_instance_valid(ui): return
    var guard := world.get_node_or_null("Guard")
    enemy_health = guard.health if guard else -1
    audio_clock += delta
    if audio_clock<0.1: return
    audio_clock = 0.0
    if OS.has_feature("web"):
        JavaScriptBridge.eval("window.__assemblyCombat="+JSON.stringify(observation()),true)
    elif OS.get_cmdline_user_args().has("--noobi-native-probe"):
        print("COMBAT_AUDIO_PROBE ",JSON.stringify(observation()))
func run() -> void:
    await frames(15)
    check(failure.is_empty(),"combat and audio assembly initializes")
    check(observation().managers==1 and audio._active==-1,"title has one silent persistent manager")
    check(ui._command("new_game"),"new game starts combat route")
    await frames(55)
    check(_snapshot().goal==manifest.labels.quests["camp-key"],"HUD selects an available prerequisite before a locked fight")
    check(audio._source.resource_path.ends_with("exploration.ogg") and audio._music[audio._active].playing,"camp starts mapped music")
    await approach(-1.0)
    var guard := world.get_node("Guard")
    check(guard.objective_locked and guard.state==&"idle","enemy remains dormant before prerequisite")
    await key("attack")
    await frames(25)
    check(guard.health==2 and hits==0,"actual melee rejects damage to locked objective")
    await approach(0.4)
    await key("interact")
    check(not guard.objective_locked and collected==1,"physical quest unlocks enemy without overriding authored AI enabled flag")
    await approach(-1.0)
    Input.action_press("noobi_attack")
    await frames(2)
    Input.action_release("noobi_attack")
    check(guard.health==2,"attack windup has not dealt early damage")
    ui.show_screen("pause")
    var playhead: float = audio._music[audio._active].get_playback_position()
    await get_tree().create_timer(0.35,true).timeout
    check(guard.health==2 and audio._music[audio._active].stream_paused,"pause freezes pending strike and music")
    check(absf(audio._music[audio._active].get_playback_position()-playhead)<0.08,"paused music playhead stays bounded")
    ui.show_screen("playing")
    await frames(20)
    check(guard.health==1 and hits==1,"resume delivers one real melee hit")
    ui.show_screen("pause")
    check(ui._command("save"),"partial encounter checkpoint saved with quest progress")
    ui.show_screen("playing")
    actor.take_damage(actor.max_health)
    check(ui.screen=="failure" and audio._active==-1,"death stops music and opens failure UI")
    check(ui._command("retry"),"retry restores checkpoint")
    await frames(55)
    guard = world.get_node("Guard")
    check(guard.health==2 and not guard.objective_locked and collected==1,"region checkpoint resets partial enemy and preserves prerequisite")
    check(audio._source.resource_path.ends_with("exploration.ogg") and audio._music.filter(func(p):return p.playing).size()==1,"retry clears old voices and restarts one track")
    await approach(-1.0)
    await key("attack")
    await frames(40)
    await key("attack")
    await frames(25)
    check(guard.health==0 and collected==2 and guard.collision_layer==0,"real defeat grants quest once and corpse no longer blocks player")
    await key("attack")
    await frames(25)
    check(collected==2,"dead target cannot duplicate reward")
    await capture("defeated-guard")
    await approach(-3.0)
    await key("interact")
    check(progression.snapshot().region=="ruins" and audio._duration>0 and audio._music.filter(func(p):return p.playing).size()==2,"physical region transition starts bounded two-voice crossfade")
    await frames(55)
    check(audio._source.resource_path.ends_with("happy-adventure.mp3") and audio._music.filter(func(p):return p.playing).size()==1,"crossfade completes to ruins track")
    await approach(0.4)
    await key("interact")
    ui.show_screen("pause")
    check(ui._command("save"),"ruins music region checkpoint saved")
    check(ui._command("title") and audio._active==-1 and audio._effects.all(func(p):return not p.playing),"title stops music and all effects")
    check(ui._command("continue"),"continue restores ruins")
    await frames(55)
    check(audio._source.resource_path.ends_with("happy-adventure.mp3") and collected==3,"continue selects restored region music")
    await approach(-1.7)
    await key("interact")
    await frames(55)
    check(audio._source.resource_path.ends_with("exploration.ogg"),"summit uses its own mapped track")
    await approach(0.4)
    await key("interact")
    check(ui.screen=="victory" and collected==4 and audio._active==-1,"final objective stops gameplay audio for victory sting")
    check(audio._effects.any(func(p):return p.playing and not p.stream_paused),"terminal menu effect can play while tree is paused")
    await capture("combat-victory")
    var file := FileAccess.open("res://report.json",FileAccess.WRITE)
    file.store_string(JSON.stringify({"passed":true,"checks":checks,"state":observation(),"scope":"Engineering component state and Input actions; browser PCM evidence required for actual output"},"  "))
    file.close()
    print("COMBAT_AUDIO_OK ",checks.size())
    # Give the asynchronous audio mixer time to release the terminal sting before harness exit.
    audio.stop_all()
    await frames(15)
    get_tree().quit()
