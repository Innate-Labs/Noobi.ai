export const PROGRESSION_KIT = `extends RefCounted
class_name NoobiProgression
signal changed(state: Dictionary)
var _definition: Dictionary = {}
var _state: Dictionary = {}

func configure(definition: Dictionary) -> Dictionary:
    var error := _definition_error(definition)
    if not error.is_empty(): return {"ok":false,"error":error}
    _definition = definition.duplicate(true)
    return reset()

func reset() -> Dictionary:
    if _definition.is_empty(): return {"ok":false,"error":"尚未配置进度规则"}
    var inventory := {}
    for key in _definition.items: inventory[key] = int(_definition.initial.items.get(key,0))
    _state = {"region":_definition.start,"inventory":inventory,"abilities":_definition.initial.abilities.duplicate(),"completed":[],"opened":[]}
    changed.emit(snapshot())
    return {"ok":true}

func snapshot() -> Dictionary:
    return _state.duplicate(true)

func restore(value: Dictionary) -> Dictionary:
    if not valid_state(value): return {"ok":false,"error":"进度存档无效，当前状态未改动"}
    _state = value.duplicate(true)
    for key in _state.inventory: _state.inventory[key] = int(_state.inventory[key])
    changed.emit(snapshot())
    return {"ok":true}

func valid_state(s: Dictionary) -> bool:
    if _definition.is_empty() or s.size() != 5: return false
    if not s.get("region") in _definition.regions or not s.get("inventory") is Dictionary: return false
    if s.inventory.size() != _definition.items.size(): return false
    for key in _definition.items:
        if not s.inventory.has(key) or not _whole(s.inventory[key],0,int(_definition.items[key].max)): return false
    var quest_ids: Array = _definition.quests.map(func(q): return q.id)
    var link_ids: Array = _definition.links.map(func(e): return e.id)
    if not _ids(s.get("abilities"),_definition.abilities) or not _ids(s.get("completed"),quest_ids) or not _ids(s.get("opened"),link_ids): return false
    var expected := {}
    var earned: Array = _definition.initial.abilities.duplicate()
    for key in _definition.items: expected[key] = int(_definition.initial.items.get(key,0))
    for q in _definition.quests:
        if q.id in s.completed:
            for prior in q.requires.quests:
                if not prior in s.completed: return false
            for key in q.reward.items: expected[key] += int(q.reward.items[key])
            for ability in q.reward.abilities:
                if not ability in earned: earned.append(ability)
    for e in _definition.links:
        if e.id in s.opened:
            for prior in e.requires.quests:
                if not prior in s.completed: return false
            for ability in e.requires.abilities:
                if not ability in s.abilities: return false
            for key in e.consume: expected[key] -= int(e.consume[key])
    if earned.size() != s.abilities.size(): return false
    for ability in earned:
        if not ability in s.abilities: return false
    for key in expected:
        if expected[key] != s.inventory[key]: return false
    var visited: Array = [_definition.start]
    var index := 0
    while index < visited.size():
        for e in _definition.links:
            if not e.id in s.opened: continue
            if e.from == visited[index] and not e.to in visited: visited.append(e.to)
            if e.bidirectional and e.to == visited[index] and not e.from in visited: visited.append(e.from)
        index += 1
    if not s.region in visited: return false
    for q in _definition.quests:
        if q.id in s.completed and not q.region in visited: return false
    return true

func _satisfies(needs: Dictionary) -> bool:
    for key in needs.items:
        if _state.inventory[key] < needs.items[key]: return false
    for key in needs.quests:
        if not key in _state.completed: return false
    for key in needs.abilities:
        if not key in _state.abilities: return false
    return true

func complete_quest(id: String, objective_met: bool) -> Dictionary:
    if _definition.is_empty(): return {"ok":false,"error":"尚未配置进度规则"}
    if not objective_met: return {"ok":false,"error":"任务目标尚未达成"}
    for q in _definition.quests:
        if q.id != id: continue
        if id in _state.completed: return {"ok":false,"error":"奖励已领取"}
        if q.region != _state.region or not _satisfies(q.requires): return {"ok":false,"error":"任务前置条件未满足"}
        for key in q.reward.items:
            if _state.inventory[key]+q.reward.items[key] > _definition.items[key].max: return {"ok":false,"error":"背包容量不足，未发放奖励"}
        var next := snapshot()
        for key in q.reward.items: next.inventory[key] += int(q.reward.items[key])
        for ability in q.reward.abilities:
            if not ability in next.abilities: next.abilities.append(ability)
        next.completed.append(id)
        _state = next
        changed.emit(snapshot())
        return {"ok":true}
    return {"ok":false,"error":"任务不存在"}

func travel(id: String) -> Dictionary:
    if _definition.is_empty(): return {"ok":false,"error":"尚未配置进度规则"}
    for e in _definition.links:
        if e.id != id: continue
        if e.from != _state.region and not (e.bidirectional and e.to == _state.region): return {"ok":false,"error":"不在通路入口"}
        var next := snapshot()
        if not id in _state.opened:
            if not _satisfies(e.requires): return {"ok":false,"error":"缺少通路所需道具、任务或能力"}
            for key in e.consume: next.inventory[key] -= int(e.consume[key])
            next.opened.append(id)
        next.region = e.to if e.from == _state.region else e.from
        _state = next
        changed.emit(snapshot())
        return {"ok":true}
    return {"ok":false,"error":"通路不存在"}

func at_ending() -> bool:
    if _state.is_empty() or not _state.region in _definition.goals: return false
    for id in _definition.goalQuests:
        if not id in _state.completed: return false
    return true

static func _whole(value, minimum: int, maximum: int) -> bool:
    return (value is int or value is float) and is_finite(float(value)) and fmod(float(value),1.0) == 0.0 and value >= minimum and value <= maximum

static func _ids(value, allowed: Array) -> bool:
    if not value is Array or value.size() > 64: return false
    var seen := {}
    for key in value:
        if not key is String or not key in allowed or seen.has(key): return false
        seen[key] = true
    return true

static func _counts(value, items: Dictionary) -> bool:
    if not value is Dictionary: return false
    for key in value:
        if not items.has(key) or not _whole(value[key],1,int(items[key].max)): return false
    return true

static func _needs(value, d: Dictionary, quest_ids: Array) -> bool:
    return value is Dictionary and _ids(value.get("quests"),quest_ids) and _ids(value.get("abilities"),d.abilities) and _counts(value.get("items"),d.items)

static func _definition_error(d: Dictionary) -> String:
    if d.get("version") != 1 or not d.get("items") is Dictionary or d.items.size() > 32: return "进度规则格式无效"
    var pattern := RegEx.create_from_string("^[a-z][a-z0-9_-]{0,63}$")
    for key in d.items:
        if not key is String or pattern.search(key) == null or not d.items[key] is Dictionary or not _whole(d.items[key].get("max"),1,99): return "道具规则无效"
    for field in ["abilities","regions"]:
        if not d.get(field) is Array or d[field].size() > 32 or not _ids(d[field],d[field]): return "区域或能力规则无效"
        for key in d[field]:
            if pattern.search(key) == null: return "区域或能力编号无效"
    if d.regions.is_empty() or not d.get("start") in d.regions or not _ids(d.get("goals"),d.regions) or d.goals.is_empty(): return "缺少起点或终点"
    if not d.get("quests") is Array or d.quests.size() > 32 or not d.get("links") is Array or d.links.size() > 64: return "任务或区域通路无效"
    var quest_ids: Array = []
    var link_ids: Array = []
    for pair in [[d.quests,quest_ids],[d.links,link_ids]]:
        for entry in pair[0]:
            if not entry is Dictionary or not entry.get("id") is String or pattern.search(entry.id) == null or entry.id in pair[1]: return "重复或无效编号"
            pair[1].append(entry.id)
    if not _ids(d.get("goalQuests"),quest_ids) or not d.get("initial") is Dictionary or not _counts(d.initial.get("items"),d.items) or not _ids(d.initial.get("abilities"),d.abilities): return "初始进度无效"
    for q in d.quests:
        if not q.get("region") in d.regions or not _needs(q.get("requires"),d,quest_ids) or not q.get("reward") is Dictionary or not _counts(q.reward.get("items"),d.items) or not _ids(q.reward.get("abilities"),d.abilities): return "任务前置或奖励无效"
    var resolved: Array = []
    for index in d.quests.size():
        for q in d.quests:
            if not q.id in resolved and q.requires.quests.all(func(prior): return prior in resolved): resolved.append(q.id)
    if resolved.size() != d.quests.size(): return "任务存在循环前置"
    for e in d.links:
        if not e.get("from") in d.regions or not e.get("to") in d.regions or e.from == e.to or not e.get("bidirectional") is bool or not _needs(e.get("requires"),d,quest_ids) or not _counts(e.get("consume"),d.items): return "区域通路规则无效"
        for key in e.consume:
            if e.requires.items.get(key,0) < e.consume[key]: return "通路消耗超过前置要求"
    return ""
`;
export const PROGRESSION_GUIDE = `# Progression contract v1

Use data/progression.json for version 1 progression: items {id:{max:1..99}}, abilities [ids], regions [ids], start, goals [ids], goalQuests [quest ids], initial {items:{id:count},abilities:[]}, quests [{id,region,requires:{quests:[],abilities:[],items:{}},reward:{items:{},abilities:[]}}], links [{id,from,to,bidirectional,requires:{quests:[],abilities:[],items:{}},consume:{}}]. IDs are lowercase ASCII identifiers starting with a letter. Omit zero-count inventory entries in the definition. Limits: 32 items/abilities/regions/quests, 64 links. Include data/*.json in the Web export filter.

The host build checks this optional file against a bounded logical-state graph. Quests are assumed achievable once their region/prerequisites are accessible. It rejects cyclic quest prerequisites, unreachable declared regions/endings, and reachable states with no possible ending (including consuming the only key on a wrong one-way path). Opening a link consumes its keys once; the same bidirectional link stays open on return. A goal is terminal. If exploration exceeds 10000 states, 300000 action checks or 2 seconds, it returns unverified instead of declaring success. Actual geometry, objectives, enemies and difficulty still require real-input playtesting.

Configure NoobiProgression with this exact definition. complete_quest(id, objective_met) requires a real gameplay objective/interaction check; never pass true merely to make the report succeed. travel(id) validates logical conditions only: call it after the player reaches the physical exit, then load/position the player safely. Link entry and exit geometry, enemy/reset policies, objective tracking and animations belong to the game. Do not teleport through locked geometry or add developer-only completion controls.

Completion atomically grants rewards/abilities and records the quest once; overflow, duplicate rewards and missing conditions leave state unchanged. Opening a passage consumes a key once. Snapshot returns a copy. Drive HUD, quest journal, inventory/ability and region UI from changed signals; do not maintain a second independent UI inventory. Pause/failed gameplay must prevent actions at the game layer.

Save snapshot() via NoobiCheckpointStore with valid_state as validator and your content version. Restore validates item totals against earned quest rewards and consumed openings, ability provenance, prerequisite consistency and reachable region IDs before changing state. JSON numeric values may be floats. For death/retry restore the last safe checkpoint; reset() is an explicit new game and resets all progress. Preserve incompatible saves. This is corruption/consistency protection, not anti-cheat or proof of gameplay completion.
`;
