# GDD Core Rules (Universal)

> Applies to ALL game archetypes. Config-First philosophy.

---

## Design Philosophy

1. **Config-Driven**: All numeric values in `gameConfig.json` — never hardcode
2. **Behavior-Based**: Use existing behaviors from module, not custom code
3. **Hook-Oriented**: Extend via hook overrides, not base class modification
4. **Template-First**: Copy templates, modify config — never write from scratch

---

## Output Structure (6 Sections)

The GDD is a **Technical Specification** — every section is a contract for one execution step:

| Section | Title                         | Downstream Consumer                                             |
| ------- | ----------------------------- | --------------------------------------------------------------- |
| **0**   | Technical Architecture        | `LevelManager.ts`, `main.ts` — scene registration               |
| **1**   | Visual Style & Asset Registry | `generate_game_assets` tool — asset generation                  |
| **2**   | Game Configuration            | `src/gameConfig.json` — merge into the existing base config     |
| **3**   | Entity/Scene Architecture     | Template files — behavior composition / hook implementation     |
| **4**   | Level/Content Design          | `generate_tilemap` tool (platformer) or content data (ui_heavy) |
| **5**   | Implementation Roadmap        | `todo_write` — file-level task list                             |

---

## Section Guidelines

### Section 0: Technical Architecture

- State archetype, base classes, resolution
- Draw the scene flow diagram: `TitleScreen -> SceneA -> SceneB -> ...`
- List `LevelManager.LEVEL_ORDER` as an exact array of strings
- List EVERY scene key string used in `scene.start()` calls

### Section 1: Asset Registry (CRITICAL — most important for downstream)

**Style Anchor**: One vivid sentence describing the art direction.

**Asset Table Format** (STRICT):
| type | key | description | params |
|------|-----|-------------|--------|
| background | xxx_bg | [vivid environment description for AI generation] | resolution: "1536\*1024" |
| tileset | xxx_tiles | [terrain style] | tileset_size: 3 |
| animation | player | [character desc, VIEW direction] | idle(2), run(2), jump(2), attack_1(2), attack_2(2), die(2) |
| image | xxx_portrait | [character desc, VIEW direction] | - |
| audio | xxx_sfx | [sound description] | audioType: "sfx" |
| audio | xxx_bgm | [music mood description] | audioType: "bgm", duration: 20 |

**View Direction by Archetype**:

- platformer: "SIDE VIEW facing RIGHT" (animation)
- top_down: "TOP-DOWN VIEW facing DOWN" (animation)
- ui_heavy: "FRONT VIEW, bust shot, portrait style" (image, NOT animation)

### Section 2: Game Configuration

Write the COMPLETE **game-specific config delta** with exact numbers and comments.
Use the config schema from `design_rules.md` as the template and fill every game-specific value. This section is merged into the existing template file; it MUST NOT replace or remove base keys such as `screenSize`, `debugConfig`, or `renderConfig`.

### Section 3: Entity / Scene Architecture

See archetype-specific guidance in `template_api.md` for:

- Which base classes to extend
- Which behaviors/components to attach (with exact config params)
- Which hooks to override (with exact descriptions of what each does)
- animKeys mapping (for platformer characters)

### Section 4: Level / Content Design

See archetype-specific `design_rules.md` for:

- platformer: ASCII map blueprints (use predefined templates!)
- ui_heavy: Dialogue scripts, card decks, question banks

### Section 5: Implementation Roadmap

Numbered list of file-level operations:

```
1. UPDATE LevelManager.ts: LEVEL_ORDER = [...]
2. UPDATE main.ts: register scenes
3. UPDATE gameConfig.json: paste Section 2
4. COPY _TemplateX.ts -> NewFile.ts: override hooks [list them]
5. ...
```

---

## Balance Guidelines

### Entity Sizes (pixels)

| Entity             | Typical Height |
| ------------------ | -------------- |
| Player             | 64-128         |
| Small Enemy        | 48-80          |
| Large Enemy / Boss | 128-192        |
| Collectible        | 32-48          |

### Health/Damage (Action Games)

| Entity | Health  | Damage |
| ------ | ------- | ------ |
| Player | 100     | 20-40  |
| Enemy  | 20-80   | 10-30  |
| Boss   | 150-400 | 25-60  |

---

## Forbidden in GDD

Do NOT write:

- "Implement X from scratch"
- "Create custom physics/AI/UI system"
- "Write new behavior class"
- Any code snippets (pseudocode descriptions only)
- Unspecified numeric values ("appropriate amount", "some damage")

Instead write:

- "Use [BehaviorName] with config: param1=X, param2=Y"
- "Override [hookName]: [exact description of what it does]"
- "Set gameConfig.playerConfig.maxHealth = 100"
- "Use predefined template [A/B/C/D] with modification: add 2 coins at row 10"
