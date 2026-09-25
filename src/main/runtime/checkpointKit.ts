/** JSON-only, version-bound game checkpoints. Applying game state is the caller's job. */
export const CHECKPOINT_KIT = `extends RefCounted
class_name NoobiCheckpointStore
const MAX_BYTES := 1048576
const SCHEMA := 1

static func _path_ok(path: String) -> bool:
    if not path.begins_with("user://"): return false
    var name := path.trim_prefix("user://")
    return not name.is_empty() and name.length() <= 80 and name.is_valid_filename() and name.ends_with(".json")

static func _failure(message: String) -> Dictionary:
    return {"ok": false, "error": message}

static func load_slot(path: String, game_id: String, content_version: int, validate_state: Callable) -> Dictionary:
    if not _path_ok(path) or game_id.is_empty() or content_version < 1 or not validate_state.is_valid(): return _failure("存档配置无效")
    if not FileAccess.file_exists(path): return _failure("尚无存档")
    var file := FileAccess.open(path, FileAccess.READ)
    if file == null: return _failure("无法读取存档，原文件保留")
    if file.get_length() > MAX_BYTES:
        file.close()
        return _failure("存档超过大小限制，原文件保留")
    var text := file.get_as_text()
    file.close()
    var envelope = JSON.parse_string(text)
    if not envelope is Dictionary or not envelope.get("payload") is String or not envelope.get("sha256") is String: return _failure("存档结构损坏，原文件保留")
    var payload: String = envelope.payload
    if payload.sha256_text() != envelope.sha256: return _failure("存档校验失败，原文件保留")
    var packet = JSON.parse_string(payload)
    if not packet is Dictionary: return _failure("存档内容无效")
    if packet.get("schema") != SCHEMA or packet.get("game_id") != game_id or packet.get("content_version") != content_version: return _failure("存档版本不兼容，请选择原版本或保留原档后开始新游戏")
    if not packet.get("state") is Dictionary or not bool(validate_state.call(packet.state)): return _failure("存档状态不符合当前规则，未应用")
    return {"ok": true, "state": packet.state.duplicate(true)}

static func save_slot(path: String, game_id: String, content_version: int, state: Dictionary, validate_state: Callable) -> Dictionary:
    if not _path_ok(path) or game_id.is_empty() or content_version < 1 or not validate_state.is_valid(): return _failure("存档配置无效")
    # Validate the JSON round-trip, not live engine objects or non-finite values.
    var normalized = JSON.parse_string(JSON.stringify(state))
    if not normalized is Dictionary or not bool(validate_state.call(normalized)): return _failure("当前状态无法保存")
    if FileAccess.file_exists(path):
        var previous := load_slot(path, game_id, content_version, validate_state)
        if not previous.ok: return _failure("原存档不可覆盖：" + previous.error)
    var payload := JSON.stringify({"schema": SCHEMA, "game_id": game_id, "content_version": content_version, "state": normalized})
    var text := JSON.stringify({"payload": payload, "sha256": payload.sha256_text()})
    if text.to_utf8_buffer().size() > MAX_BYTES: return _failure("存档超过大小限制")
    var temporary := path + ".tmp"
    var file := FileAccess.open(temporary, FileAccess.WRITE)
    if file == null: return _failure("无法创建存档临时文件")
    file.store_string(text)
    file.flush()
    var write_error := file.get_error()
    file.close()
    if write_error != OK: return _failure("写入失败，原存档保留")
    if FileAccess.file_exists(path):
        if DirAccess.copy_absolute(ProjectSettings.globalize_path(path), ProjectSettings.globalize_path(path + ".bak")) != OK: return _failure("无法保留上一存档，原存档未改动")
    if DirAccess.rename_absolute(ProjectSettings.globalize_path(temporary), ProjectSettings.globalize_path(path)) != OK: return _failure("无法提交新存档，原存档保留")
    return {"ok": true}

static func archive_slot(path: String) -> Dictionary:
    # Call only after the player explicitly chooses a new game / incompatible-slot reset.
    if not _path_ok(path): return _failure("存档路径无效")
    if not FileAccess.file_exists(path): return {"ok": true, "archived": ""}
    var archived := path + ".archive-" + str(Time.get_unix_time_from_system()).replace(".", "-")
    if DirAccess.rename_absolute(ProjectSettings.globalize_path(path), ProjectSettings.globalize_path(archived)) != OK: return _failure("无法保留旧存档，未开始覆盖")
    return {"ok": true, "archived": archived}
`;
export const CHECKPOINT_GUIDE = `# Checkpoint v1

Use runtime/noobi/checkpoint_v1.gd with a user://<slot>.json filename, a stable game ID and a positive content version. Supply a mandatory validate_state callable on both save and load; check all fields, ranges, array limits, authored region/checkpoint IDs, objective dependencies, inventory quantities and abilities before applying anything. Return false for unknown state. JSON round-trips numeric values as floats: accept finite integral values where required, not arbitrary coercion.

Save authored safe checkpoint IDs plus progression, not an arbitrary player transform that may be inside new geometry. Only apply a successful load after the entire state has been validated; reset velocity, attack/dash timers, transient UI and camera state. Persist consumed one-shot interaction IDs with inventory/rewards in the same transaction. A restored item must not grant its reward again. Keep world/object state separate from temporary UI focus.

Files include game/content/schema versions and SHA-256 of their exact payload. Writes use a flushed temporary file then rename, keeping the previous slot as .bak. This is local corruption detection, not an anti-cheat signature or a cloud save. Missing/corrupt/incompatible saves return an error and never silently reset or overwrite the original. A game-specific migration must validate before commit; otherwise offer to keep the old slot and start a new game. archive_slot preserves the old file and must only be called after that explicit player choice. No live objects, code, credentials or engine resources belong in state.

Browser exports must validate persistence across a real reload/close; native file success alone is not browser persistence proof. Never overwrite a future-version save to make a test pass.
`;
