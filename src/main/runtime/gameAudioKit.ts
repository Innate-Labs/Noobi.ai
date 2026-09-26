export const GAME_AUDIO_KIT = `extends Node
class_name NoobiGameAudio

@export var pause_music_with_tree := true
const EFFECT_VOICES := 8
var _music: Array[AudioStreamPlayer] = []
var _effects: Array[AudioStreamPlayer] = []
var _menu_effect: Array[bool] = []
var _source: AudioStream
var _active := -1
var _elapsed := 0.0
var _duration := 0.0
var _starts: Array[float] = [0.0, 0.0]
var _goals: Array[float] = [0.0, 0.0]
var _pending: AudioStream
var _pending_fade := 0.5
var _next_effect := 0

func _ready() -> void:
    if not get_tree().get_nodes_in_group("noobi_audio_manager").is_empty():
        push_warning("NOOBI_AUDIO_DUPLICATE: keep one persistent manager per game")
        queue_free()
        return
    add_to_group("noobi_audio_manager")
    process_mode = Node.PROCESS_MODE_ALWAYS
    for bus: String in ["NoobiMusic", "NoobiSFX"]:
        if AudioServer.get_bus_index(bus) < 0:
            AudioServer.add_bus()
            var index := AudioServer.bus_count - 1
            AudioServer.set_bus_name(index, bus)
            AudioServer.set_bus_send(index, "Master")
    for index in 2: _music.append(_player("NoobiMusic"))
    for index in EFFECT_VOICES:
        _effects.append(_player("NoobiSFX"))
        _menu_effect.append(false)

func _player(bus: String) -> AudioStreamPlayer:
    var player := AudioStreamPlayer.new()
    # Web Sample playback can disconnect dynamic buses in the bundled exporter.
    # Use the engine mixer consistently for looping, pause and per-bus gain.
    player.playback_type = AudioServer.PLAYBACK_TYPE_STREAM
    player.bus = bus
    player.max_polyphony = 1
    player.volume_linear = 0.0
    add_child(player)
    return player

func _same(a: AudioStream, b: AudioStream) -> bool:
    return a == b or (a != null and b != null and not a.resource_path.is_empty() and a.resource_path == b.resource_path)

func _stream(source: AudioStream, looped: bool) -> AudioStream:
    if not source is AudioStreamOggVorbis and not source is AudioStreamMP3 and not source is AudioStreamWAV: return null
    if looped and source is AudioStreamWAV: return null
    var copy: AudioStream = source.duplicate()
    if copy is AudioStreamWAV: copy.loop_mode = AudioStreamWAV.LOOP_DISABLED
    else:
        copy.loop = looped
        if looped: copy.loop_offset = 0.0
    return copy

func set_music(source: AudioStream, fade_seconds: float = 0.5, restart: bool = false) -> bool:
    if _music.size() != 2 or source == null or not is_finite(fade_seconds): return false
    var stream := _stream(source, true)
    if stream == null: return false
    if not restart and _same(source, _source) and _active >= 0 and _music[_active].playing:
        _pending = null
        return true
    if not restart and _duration > 0.0:
        # Keep only the latest requested region while two tracks crossfade.
        # Do not cut a still-audible third track or allocate unbounded players.
        _pending = source
        _pending_fade = clampf(fade_seconds, 0.0, 5.0)
        return true
    if restart: stop_music()
    var next := 0 if _active != 0 else 1
    _music[next].stop()
    _music[next].stream = stream
    _music[next].volume_linear = 0.0
    _music[next].play()
    _music[next].stream_paused = get_tree().paused and pause_music_with_tree
    _source = source
    _active = next
    _elapsed = 0.0
    _duration = clampf(fade_seconds, 0.0, 5.0)
    for index in 2:
        _starts[index] = _music[index].volume_linear
        _goals[index] = 1.0 if index == next else 0.0
    if _duration == 0.0: _finish_fade()
    return true

func _finish_fade() -> void:
    for index in 2:
        _music[index].volume_linear = _goals[index]
        if _goals[index] == 0.0: _music[index].stop()
    _duration = 0.0
    if _pending != null:
        var source := _pending
        _pending = null
        set_music(source, _pending_fade)

func _process(delta: float) -> void:
    var paused := get_tree().paused
    for player: AudioStreamPlayer in _music: player.stream_paused = paused and pause_music_with_tree
    for index in _effects.size(): _effects[index].stream_paused = paused and not _menu_effect[index]
    if _duration > 0.0 and not (paused and pause_music_with_tree):
        _elapsed += delta
        var fraction := clampf(_elapsed / _duration, 0.0, 1.0)
        for index in 2: _music[index].volume_linear = lerpf(_starts[index], _goals[index], fraction)
        if fraction >= 1.0: _finish_fade()

func play_effect(source: AudioStream, menu: bool = false, gain_db: float = -6.0) -> bool:
    if _effects.size() != EFFECT_VOICES or source == null or not is_finite(gain_db): return false
    if get_tree().paused and not menu: return false
    var stream := _stream(source, false)
    if stream == null: return false
    var slot := _next_effect
    for index in EFFECT_VOICES:
        var candidate := (_next_effect + index) % EFFECT_VOICES
        if not _effects[candidate].playing:
            slot = candidate
            break
    var player := _effects[slot]
    player.stop()
    player.stream = stream
    player.volume_db = clampf(gain_db, -60.0, 0.0)
    _menu_effect[slot] = menu
    player.stream_paused = false
    player.play()
    _next_effect = (slot + 1) % EFFECT_VOICES
    return true

func stop_music() -> void:
    _pending = null
    _duration = 0.0
    _source = null
    _active = -1
    for player: AudioStreamPlayer in _music:
        player.stop()
        player.stream = null
        player.volume_linear = 0.0

func stop_all() -> void:
    stop_music()
    for player: AudioStreamPlayer in _effects:
        player.stop()
        player.stream = null

func _exit_tree() -> void:
    stop_all()
`;

export const GAME_AUDIO_GUIDE = `# Noobi game audio v1

Create one persistent audio_v1.gd Node for the game, outside replaceable region scenes. Import approved CC0 tracks through the free audio library and retain license/provenance files. No paid generation is needed. This component manages non-positional background/UI/gameplay sounds; spatial ambience needs separately authored AudioStreamPlayer3D sources and scene cleanup.

Call set_music(load(path), 0.5) on entering a region. Repeated requests for the same resource/path preserve the playhead. Music supports Ogg/MP3 engine looping from time zero, using a duplicate so imported resources remain unchanged. Looping does not make an arbitrary song seamless: choose a loop-authored track and verify its boundary. The two music voices crossfade in linear gain; rapid changes retain only the latest pending request until the current fade ends (at most 5 seconds). No third music voice is created. set_music(stream, 0.0, true) explicitly restarts; stop_all before a new run or returning to a silent title clears pending transitions and effects.

play_effect(stream, menu=false, gain_db=-6) supports Ogg/MP3/WAV as one-shot audio, stripping loop settings from the private copy. It uses eight bounded voices, replacing the next round-robin voice if full. Call from real game events, not per rendering frame. During SceneTree pause, music and gameplay effects freeze and resume at the playhead; new gameplay effects are rejected. menu=true permits UI feedback while paused. Set pause_music_with_tree=false only when the selected design calls for music continuing in menus. Fade timers follow the same pause policy.

Players explicitly use engine Stream playback on all platforms to avoid the bundled Web Sample bus-routing failure. Single-threaded Web mixing may have higher latency than Sample playback; measure timing in the actual game. NoobiMusic and NoobiSFX buses are created only if absent; existing volume, mute and routing are preserved. ui_v1.gd owns Master/music/effects settings and their persistence; this manager never resets them. Ensure bus settings initialize before playback. Browser audio still requires a real user gesture; do not claim sound based solely on playing=true. Full-range music gain plus many effects can clip: author mix levels and validate the actual final output.

Acceptance: capture engine mixed PCM for both music tracks, the real loop boundary, crossfade, pause/resume, independent bus mute/volume, bounded repeated effects and stop/restart. Keep frame/event logs beside the recording. PCM and bus checks demonstrate signal output, not speaker hardware, perceived loudness, musical seam quality or audiovisual timing in a generated game; human listening and game-specific input playback remain separate.
`;
