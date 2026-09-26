# Third-party CC0 engineering character. Fixture Fall/Hurt poses, source GLB unchanged.
extends "res://runtime/noobi/adventure_controller_v1.gd"
const Adapter = preload("res://runtime/noobi/adventure_animation_v1.gd")
var player: AnimationPlayer
var driver = Adapter.new()
func _ready() -> void:
    super._ready()
    player = visual.find_children("*","AnimationPlayer",true,false)[0]
    make_fixture_clips()
    driver.actor = self
    driver.player = player
    driver.clips = {"idle":"Idle","run":"Running","jump":"Jump","fall":"fixture/FallPose","hurt":"fixture/HurtPose","dead":"Death"}
    add_child(driver)
func sampled_clip(source: Animation, time: float, length: float) -> Animation:
    var result := Animation.new()
    result.length = length
    for i in source.get_track_count():
        var type := source.track_get_type(i)
        var track := result.add_track(type)
        result.track_set_path(track,source.track_get_path(i))
        var value: Variant
        match type:
            Animation.TYPE_POSITION_3D: value = source.position_track_interpolate(i,time)
            Animation.TYPE_ROTATION_3D: value = source.rotation_track_interpolate(i,time)
            Animation.TYPE_SCALE_3D: value = source.scale_track_interpolate(i,time)
            Animation.TYPE_BLEND_SHAPE: value = source.blend_shape_track_interpolate(i,time)
        result.track_insert_key(track,0.0,value)
        result.track_insert_key(track,length,value)
    return result
func make_fixture_clips() -> void:
    # Explicit engineering authoring: source contains no dedicated Fall or Hurt.
    # Do not relabel No/Yes/Wave as a semantic action and do not edit source GLB.
    var lib := AnimationLibrary.new()
    lib.add_animation("FallPose",sampled_clip(player.get_animation("Jump"),0.34,0.4))
    var hurt := sampled_clip(player.get_animation("Idle"),0.0,0.35)
    for i in hurt.get_track_count():
        var path := hurt.track_get_path(i)
        if str(path).ends_with(":Body") and hurt.track_get_type(i)==Animation.TYPE_ROTATION_3D:
            var original: Quaternion = hurt.track_get_key_value(i,0)
            hurt.track_insert_key(i,0.1,original*Quaternion(Vector3.RIGHT,-0.25))
        if str(path).ends_with(":Angry"):
            hurt.track_insert_key(i,0.1,1.0)
    lib.add_animation("HurtPose",hurt)
    player.add_animation_library("fixture",lib)
