/** Small versioned primitives; art direction remains game-owned. */
export const PRESENTATION_KIT = `extends RefCounted
# Noobi presentation primitives v1. Use a new version for breaking changes.

static func icon(texture: Texture2D, display_size: Vector2) -> TextureRect:
    assert(texture != null and display_size.x > 0 and display_size.y > 0)
    var result := TextureRect.new()
    # Set IGNORE_SIZE before texture; otherwise the native image minimum can
    # permanently inflate a Container before the requested size is applied.
    result.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    result.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
    result.texture = texture
    result.custom_minimum_size = display_size
    result.size = display_size
    result.mouse_filter = Control.MOUSE_FILTER_IGNORE
    return result

static func atlas_sprite(texture: Texture2D, columns: int, rows: int, frame: int, display_size: Vector2) -> Sprite2D:
    assert(texture != null and columns > 0 and rows > 0)
    assert(frame >= 0 and frame < columns * rows and display_size.x > 0 and display_size.y > 0)
    var result := Sprite2D.new()
    result.texture = texture
    result.hframes = columns
    result.vframes = rows
    result.frame = frame
    var cell := texture.get_size() / Vector2(columns, rows)
    result.scale = display_size / cell
    # The node origin is the feet across all frames, independent of atlas size.
    result.offset = Vector2(0, -cell.y * 0.5)
    return result

static func button_feedback(button: BaseButton) -> void:
    # At most one active tween per button; repeated hovering cannot stack scale.
    button.resized.connect(func(): button.pivot_offset = button.size * 0.5)
    button.mouse_entered.connect(func(): _button_scale(button, 1.04))
    button.mouse_exited.connect(func(): _button_scale(button, 1.0))
    button.button_down.connect(func(): _button_scale(button, 0.96))
    button.button_up.connect(func(): _button_scale(button, 1.0))

static func _button_scale(button: BaseButton, target: float) -> void:
    var old: Variant = button.get_meta("noobi_feedback_tween") if button.has_meta("noobi_feedback_tween") else null
    if old is Tween and old.is_valid():
        old.kill()
    button.pivot_offset = button.size * 0.5
    var tween := button.create_tween()
    tween.tween_property(button, "scale", Vector2.ONE * target, 0.10).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
    button.set_meta("noobi_feedback_tween", tween)
`;
