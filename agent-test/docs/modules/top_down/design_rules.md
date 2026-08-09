# Top-Down — Game Design Guide

> From a game designer's perspective: what makes a great top-down action game.
> This document focuses on gameplay, level design, and feel — not code.

---

## 0. Sub-Mode Selection (Decide FIRST)

Top-down games have **two sub-modes**. The GDD MUST state which one:

| Sub-Mode    | Base Class       | World Model                                       | Best For                                                 |
| ----------- | ---------------- | ------------------------------------------------- | -------------------------------------------------------- |
| **tilemap** | `BaseLevelScene` | Designed ASCII map, dual tilesets, camera follow  | Dungeon crawlers, exploration, room-clearing, RPG combat |
| **arena**   | `BaseArenaScene` | Fixed screen, scrolling background, wave spawning | Space shooters, bullet-hell, survival arenas, endless    |

**Detection keywords:**

- tilemap → dungeon, exploration, room, maze, RPG combat, adventure, designed map
- arena → space shooter, 飞行射击, 弹幕, bullet hell, survival, endless, waves, scrolling, galaga

**Default**: If unclear, use **tilemap** (safer, more structured).

**CRITICAL**: Arena mode does NOT use tilesets, ASCII maps, or `generate_tilemap`. Tilemap mode does NOT use scrolling backgrounds or wave spawners.

---

## 1. Mechanics

### 1.1 Movement

Every top-down game MUST have movement:

- **8-Way Movement**: WASD with diagonal normalization (no faster diagonal)
- **Mouse Aiming**: 360-degree facing direction tracked from mouse pointer
- **Dash**: Short burst movement with i-frames and cooldown (replaces jump)

No gravity, no jumping — this is overhead/top-down view.

### 1.2 Combat

Two combat styles available:

| Style      | Description                           | When to Use                      |
| ---------- | ------------------------------------- | -------------------------------- |
| **Melee**  | 4-directional close-range attack zone | Brawlers, Zelda-like             |
| **Ranged** | 360-degree projectile toward mouse    | Twin-stick shooters, run-and-gun |

Both can be combined. Ranged combat uses mouse aim direction. Melee repositions its trigger zone to match `facingDirection`.

**Twin-stick**: Player can move and shoot simultaneously (NOT rooted during shooting). Melee attacks DO root the player briefly.

### 1.3 Enemy AI Types

| AI Type        | Behavior                    | When to Use           |
| -------------- | --------------------------- | --------------------- |
| **Patrol**     | Wander randomly in 2D area  | Basic enemies, guards |
| **Chase**      | Follow player when detected | Aggressive enemies    |
| **Stationary** | Don't move, just attack     | Turrets, sentries     |
| **Custom**     | Designer-defined behavior   | Bosses with phases    |

Chase AI has `stopDistance` — ranged enemies stop at a distance to shoot, melee enemies get close.

Boss enemies can have phase-based AI (e.g., patrol at >50% HP, chase at <50% HP).

---

## 2. Level Design (ASCII Tilemap)

> **TILEMAP RULES (READ FIRST — violations cause downstream tool failures):**
>
> 1. If user doesn't specify level count -> **default to 1 level**
> 2. MUST copy from Templates A/B/C/D below — **NEVER design ASCII maps from scratch**
> 3. Only minor modifications allowed (see Section 2.4)
> 4. Write the **COMPLETE** ASCII map for each level in the GDD
> 5. Top-down games use **DUAL TILESETS** (floor + walls) — call `generate_tilemap` **TWICE** per level, once with `mode: "floor"`, once with `mode: "walls"`
> 6. Each call produces a separate JSON; both share the same ASCII map but auto-tile different characters
> 7. Tileset naming convention: `{theme}_floor` and `{theme}_walls` (e.g., `dungeon_floor`, `dungeon_walls`)
> 8. **DO NOT pass `tileset_grid_size`** to `generate_tilemap` — the default (7) enables 47-tile auto-tiling. The `tileset_size: 3` in `generate_game_assets` is only for the BASE image; `TilesetProcessor` auto-expands it to 7x7.
> 9. **Background image is usually NOT needed** — floor tiles cover walkable area, wall tiles cover barriers. Use `cameras.main.setBackgroundColor()` for void areas. Only add a background image if the game has large open spaces without tiles.
> 10. `setupMapSize()` MUST match the actual tilemap dimensions: `mapWidth = ascii_columns * tileSize`, `mapHeight = ascii_rows * tileSize`. Count the ASCII rows carefully!

### Visual Proportion Guide (CRITICAL — read before designing)

All entities must maintain consistent proportions relative to **tile size = 64px**:

| Element                 | Display Height | Tiles       | Notes                                            |
| ----------------------- | -------------- | ----------- | ------------------------------------------------ |
| Player character        | **64px**       | 1 tile      | Standard — player occupies exactly 1 tile height |
| Normal enemy            | **64px**       | 1 tile      | Same scale as player                             |
| Boss / heavy enemy      | **80px**       | 1.25 tiles  | Slightly larger to convey power                  |
| Obstacle (crate/barrel) | **48px**       | 0.75 tile   | Smaller than characters, clearly a prop          |
| Decoration              | 48-64px        | 0.75-1 tile | Visual objects, match obstacle scale             |
| Bullet / projectile     | 8-12px         | ~0.15 tile  | Small, fast-moving                               |

**Camera zoom**: Default `1.0`. Only reduce (0.8-0.9) for large exploration maps (>20×14). Never zoom in (>1.0).

**Map-to-screen fit**: A compact map (18×12 tiles = 1152×768px) fills the screen at zoom 1.0 — this is the industry standard. Compact maps feel dense and action-packed.

**Anti-pattern**: Making the map huge (30×20+) then zooming out (0.6-0.8) to compensate — this makes everything tiny and the scene feels distant and empty. Instead, **keep the map compact** and camera at 1.0.

### Why Templates, Not From Scratch?

The tilemap pipeline is: **GDD ASCII map → `generate-tilemap` tool (×2 calls) → 2 Phaser JSONs → game code**.

For each level, the agent calls `generate_tilemap` **twice** with the same ASCII map:

1. `mode: "floor"` — auto-tiles walkable chars (`.`, `P`, `E`, etc.) → `level1_floor.json`
2. `mode: "walls"` — auto-tiles wall chars (`#`) → `level1_walls.json`

The `generate-tilemap` tool has been validated against the 4 templates below. Custom ASCII maps risk:

- Invalid tile indices (tool doesn't know your custom symbols)
- Broken spawn point parsing (tool expects specific `P`, `E`, `B`, `D` patterns)
- Dimension mismatches (tool validates width/height against known templates)

**Bottom line**: If the agent invents a new ASCII layout, the tilemap tool will produce broken JSON, causing silent runtime crashes (invisible walls, missing spawn points, etc.).

### 2.1 How Many Levels?

| User says                          | Levels to design | Template selection                               |
| ---------------------------------- | ---------------- | ------------------------------------------------ |
| Nothing about levels               | **1 level**      | Template A (simple) or D (if boss)               |
| "A few levels" / "some levels"     | **2-3 levels**   | A + D, optionally B or C                         |
| Specific number (e.g., "5 levels") | That number      | One template per level, reuse with modifications |

### 2.2 Map Symbols

| Symbol | Meaning                 | Usage                                     |
| ------ | ----------------------- | ----------------------------------------- |
| `.`    | Floor (walkable)        | Open ground                               |
| `#`    | Wall (blocked)          | Impassable barriers                       |
| `P`    | Player spawn            | Usually center-left area                  |
| `E`    | Enemy spawn             | Needs open floor around it (3+ tiles)     |
| `B`    | Boss spawn              | Usually center or far side of arena       |
| `O`    | Obstacle (crate/barrel) | Physics object, blocks movement, Y-sorted |
| `D`    | Door/Exit               | Level exit point                          |

### 2.3 Map Templates (COPY THESE — do NOT invent new maps)

> **About `O` (Obstacle) markers**: `O` positions become entries in the tilemap's Objects layer (type `"obstacle"`). In code, the agent reads these positions and creates **physics sprite obstacles** (crates, barrels, pillars) that block movement like walls but are rendered as separate images with Y-sort depth. See Section 2.8 for the obstacle asset system.

#### Template A: "Open Field" (Level 1)

```
##################
#................#
#.OO..........OO.#
#.P.......E......#
#................#
#.....####.......#
#................#
#..E..OO......E..#
#................#
#.OO..........OO.#
#................#
##################
```

- Width: 18, Height: 12 (fills screen at zoom 1.0)
- Focus: Learning movement and combat
- Enemies: 3, Obstacles: 4 pairs + 1 center pair

#### Template B: "Maze Corridors" (Exploration)

```
######################
#..........#.........#
#.OO.......#.....OO..#
#.P........#..E......#
#..........#.........#
#...###..###.........#
#....................#
#....................#
#..........####......#
#...E.......#........#
#...........#....E...#
#.OO.............OO..#
#....................#
######################
```

- Width: 22, Height: 14
- Focus: Exploration with corridors
- Enemies: 3, Obstacles: 4 pairs (corridor cover)

#### Template C: "Arena" (Combat Focus)

```
####################
#..................#
#.OO............OO.#
#..................#
#....E.............#
#......####........#
#..................#
#.P..OO......OO..E.#
#..................#
#......####........#
#....E.............#
#..................#
#.OO............OO.#
####################
```

- Width: 20, Height: 14
- Focus: Symmetric arena combat
- Enemies: 3, Obstacles: 4 corner pairs + 1 center pair

#### Template D: "Boss Chamber" (Final Level)

```
######################
#....................#
#....................#
#....OO........OO....#
#....................#
#........####........#
#..P.......OO........#
#........####........#
#....................#
#....OO........OO....#
#....................#
#.................B..#
#....................#
######################
```

- Width: 22, Height: 14
- Focus: Boss fight with cover
- Structure: Symmetric arena with 5 obstacle positions + central cover

### 2.4 Allowed Modifications (minor tweaks ONLY)

After copying a template, you may ONLY:

- Add/remove `O` (obstacles) on `.` floor tiles — use `OO` pairs for visual weight
- Add/remove `E` (enemies, max 5 per level) with 3+ tiles open floor around each
- Adjust internal `#` wall shapes (keep 2-tile minimum thickness)

**NEVER change:**

- Map dimensions (width x height) — tool validates these
- Outer wall border (must stay solid `#` perimeter)
- `P` position region (left/center area)
- `D`/`B` position region (right/center area)
- Symbol set — only use symbols from Section 2.2 table
- Overall template structure (room layout, corridor pattern)

### 2.5 Tilemap-to-Code Pipeline (Dual Tilesets)

After the ASCII map is defined in the GDD, the agent calls `generate_tilemap` **TWICE** per level (same ASCII map):

1. `mode: "floor"` with `object_markers` → produces `{map_key}_floor.json` (walkable tiles + spawn points)
2. `mode: "walls"` → produces `{map_key}_walls.json` (barrier tiles)

Both JSONs use `"Ground"` as their single tile layer name. The `"Objects"` layer (spawn points) only appears in the floor JSON.

> **Implementation details** (dual tileset loading code, layer creation, obstacle placement) → see `top_down.md` Section 1.

### 2.6 Tileset Art Direction

| Tileset                     | Art Style                                                                                                                               | Rationale                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Floor** (`{theme}_floor`) | **Solid/simple color**, minimal detail. At most subtle grid lines, seam marks, or gentle texture. Flat fill, uniform tone.              | Floor is pure background — busy patterns make characters hard to see and the scene visually cluttered. |
| **Walls** (`{theme}_walls`) | Clear contrast with floor. Darker/thicker/raised appearance. Can have slightly more detail than floor (e.g., brick edges, panel lines). | Walls must be immediately recognizable as impassable.                                                  |

**Common tileset description mistakes** (avoid these):

- "hexagonal floor with glowing accent lines" → too complex, makes floor look like UI
- "detailed mechanical grating with bolts and pipes" → unreadable at small tile sizes
- "colorful mosaic floor pattern" → distracting, competes with characters

**Good tileset descriptions**:

- "clean grey metal floor, flat uniform color with subtle panel seams"
- "dark stone dungeon floor, solid charcoal color with faint grid lines"
- "sandy desert ground, flat beige with minimal texture variation"

### 2.7 Obstacles & Decorations (Sprite-Based Props)

Obstacles are **NOT part of the tilemap** — they are separate image assets with physics bodies, placed at `O` positions from the tilemap's Objects layer. This is how professional top-down games work.

#### Two categories:

| Type           | Physics                               | Group              | Y-Sorted | Examples                                    |
| -------------- | ------------------------------------- | ------------------ | -------- | ------------------------------------------- |
| **Obstacle**   | `setImmovable(true)`, blocks movement | `this.obstacles`   | Yes      | Supply crates, barrels, barriers            |
| **Decoration** | None, visual only                     | `this.decorations` | No       | Computer terminals, floor markings, pillars |

Obstacles function **like walls** (immovable, collide with player/enemies/bullets) but are rendered as Y-sorted sprites that characters can appear in front of or behind.

#### GDD asset rules for obstacles/decorations:

In the GDD Section 1 (Asset Registry), include obstacle and decoration images:

```
// Obstacles — type: "image", TOP-DOWN view, these BLOCK movement
{ "key": "supply_crate", "type": "image",
  "description": "military supply crate, top-down view, metallic, compact square shape" }
{ "key": "barrel", "type": "image",
  "description": "metal barrel container, top-down view, round shape, industrial" }

// Decorations — type: "image", TOP-DOWN view, these are VISUAL ONLY
{ "key": "computer_terminal", "type": "image",
  "description": "computer terminal console, top-down view, with screen glow" }
```

**Art direction**: All obstacle/decoration images must use **TOP-DOWN / OVERHEAD view** (same as characters). Keep them at a size that fits within 1-2 tiles.

The `createObstacle()` helper (in `_TemplateLevel.ts`) creates a physics sprite with `setImmovable(true)` and adds it to `this.obstacles` group (auto Y-sorted, auto collision with walls/player/enemies/bullets). See `top_down.md` Section 4 for implementation code.

#### Design guidelines:

- Place `O` in **pairs** (`OO`) for visual weight — a single-tile obstacle feels too small
- Use obstacles as **cover points** — players and enemies can hide behind them
- Place obstacles at **symmetrical positions** for fair gameplay
- 4-6 obstacle groups per level is good — too many clutters the floor
- Decorations add visual interest without affecting gameplay — scatter a few around the room edges

### 2.8 Complete Worked Example (Follow This Flow)

Suppose the user wants a Star Wars Imperial Base game. Here is the **exact sequence** from template selection to code:

**Step 1 — GDD: Pick a template and copy it verbatim**

```
I choose Template A (Open Field) for Level 1:

##################
#................#
#.OO..........OO.#
#.P.......E......#
#................#
#.....####.......#
#................#
#..E..OO......E..#
#................#
#.OO..........OO.#
#................#
##################

Width: 18, Height: 12
```

**Step 2 — GDD: Define tilesets + obstacle/decoration assets**

```json
// Tilesets (required)
{ "key": "imperial_floor", "type": "tileset", "tileset_size": 3,
  "description": "clean grey metal floor, flat solid color with subtle panel seams, top-down view" }
{ "key": "imperial_walls", "type": "tileset", "tileset_size": 3,
  "description": "dark metal wall panels, raised appearance with clear edges, top-down view" }

// Obstacles — type: "image", block movement (placed at O positions from tilemap)
{ "key": "supply_crate", "type": "image",
  "description": "imperial military supply crate, top-down overhead view, metallic grey, compact square" }
{ "key": "barrel", "type": "image",
  "description": "metal barrel container, top-down overhead view, cylindrical, industrial" }

// Decorations — type: "image", visual only (placed near room edges)
{ "key": "computer_terminal", "type": "image",
  "description": "computer terminal console, top-down overhead view, screen glow, dark metal" }
```

**Step 3 — Implementation: Call `generate_tilemap` TWICE (same ASCII map)**

The agent calls `generate_tilemap` twice with the same ASCII map, using `tileset_key` matching the asset key and `map_key` as the JSON filename:

| Call | `tileset_key`    | `map_key`             | `mode`    | Produces                   |
| ---- | ---------------- | --------------------- | --------- | -------------------------- |
| 1    | `imperial_floor` | `imperial_base_floor` | `"floor"` | `imperial_base_floor.json` |
| 2    | `imperial_walls` | `imperial_base_walls` | `"walls"` | `imperial_base_walls.json` |

Floor call includes `object_markers: { "P": "player_spawn", "E": "enemy_spawn", "B": "boss_spawn", "D": "door", "O": "obstacle" }`.

**Step 4 — Code: Load both maps + place obstacles**

See `top_down.md` Section 4 "Dual Tileset Loading" for the full `createEnvironment()` implementation pattern.

**Naming consistency chain** (all must match — mismatch causes silent black screen):

| Location                         | Floor                 | Walls                 |
| -------------------------------- | --------------------- | --------------------- |
| Asset `key`                      | `imperial_floor`      | `imperial_walls`      |
| `generate_tilemap` `tileset_key` | `imperial_floor`      | `imperial_walls`      |
| `generate_tilemap` `map_key`     | `imperial_base_floor` | `imperial_base_walls` |

> In code: `addTilesetImage` and `make.tilemap` use the same keys above. Details in `top_down.md`.

---

## 2.9 Arena Sub-Mode (NO Tilemap)

> **This section applies ONLY when sub-mode = arena. Skip entirely for tilemap games.**

Arena-mode games have NO tilemap, NO ASCII maps, NO `generate_tilemap` calls.

### World Model

- The "world" IS the screen — `worldWidth = screenWidth`, `worldHeight = screenHeight`
- Player is confined to screen bounds (`setCollideWorldBounds(true)`)
- Camera is static (no follow, no zoom)
- Background scrolls to create illusion of movement

### Background Design

- Generate ONE `type: "background"` image that tiles seamlessly (vertically or horizontally)
- Call `this.setupScrollingBg('bg_key')` in `createBackground()` for auto-scrolling
- Alternatively: use `cameras.main.setBackgroundColor('#1a1a2e')` for solid color

### Enemy Spawning

- Enemies are NOT placed on a map — they spawn dynamically during gameplay
- Built-in spawner calls `spawnEnemy()` at regular intervals
- Spawn interval decreases with difficulty: `getSpawnInterval()` hook
- Spawn enemies off-screen with velocity toward play area

### Score & Difficulty

- `this.addScore(points)` tracks score and emits `'scoreChanged'` event for UIScene
- Difficulty auto-increases every `difficultyInterval` ms (default 30s)
- `onDifficultyUp(level)` hook for reactions (faster enemies, new types, etc.)

### Boss System (Optional)

- Set `this.bossKillThreshold = N` in `createEntities()` to enable boss trigger
- When `killCount >= bossKillThreshold`: spawner pauses, `onBossSpawn()` fires
- After boss death: call `onBossDeath()`, set `this.bossActive = false` to resume spawning

### Arena Design Mistakes

| Wrong                                        | Correct                                               |
| -------------------------------------------- | ----------------------------------------------------- |
| Generating ASCII map for space shooter       | Use `BaseArenaScene` — no tilemap                     |
| Pre-placing enemies in createEntities        | Spawn dynamically via `spawnEnemy()`                  |
| Using `BaseLevelScene` for scrolling shooter | Use `BaseArenaScene`                                  |
| Calling `generate_tilemap` for arena game    | Skip entirely — no tilemap needed                     |
| No `super.onEnemyKilled()` call in arena     | MUST call `super.onEnemyKilled(enemy)` to track kills |

---

## 3. Config Schema

The GDD's Section 2 should contain **game-specific config values** that override the template defaults. The agent will **merge** these into the existing `gameConfig.json`, preserving infrastructure fields.

All values use `{ "value": X, "type": "...", "description": "..." }` wrapper format. Access in code: `playerConfig.maxHealth.value`.

**Game-specific fields** (GDD Section 2 should specify these — values override template defaults):

```json
{
  "playerConfig": {
    "maxHealth": {
      "value": 100,
      "type": "number",
      "description": "Player max health"
    },
    "walkSpeed": {
      "value": 200,
      "type": "number",
      "description": "Player walk speed"
    },
    "attackDamage": {
      "value": 25,
      "type": "number",
      "description": "Player attack damage"
    },
    "hurtingDuration": {
      "value": 100,
      "type": "number",
      "description": "Hurt animation duration (ms)"
    },
    "invulnerableTime": {
      "value": 1000,
      "type": "number",
      "description": "Invulnerability after hit (ms)"
    },
    "dashSpeed": {
      "value": 500,
      "type": "number",
      "description": "Dash speed"
    },
    "dashDuration": {
      "value": 200,
      "type": "number",
      "description": "Dash duration (ms)"
    },
    "dashCooldown": {
      "value": 1000,
      "type": "number",
      "description": "Dash cooldown (ms)"
    }
  },
  "enemyConfig": {
    "maxHealth": {
      "value": 50,
      "type": "number",
      "description": "Enemy max health"
    },
    "walkSpeed": {
      "value": 80,
      "type": "number",
      "description": "Enemy walk speed"
    },
    "damage": { "value": 15, "type": "number", "description": "Enemy damage" }
  }
}
```

**Optional fields** (only add if the game uses these features):

```json
{
  "bossConfig": {
    "maxHealth": {
      "value": 200,
      "type": "number",
      "description": "Boss max health"
    },
    "damage": { "value": 35, "type": "number", "description": "Boss damage" },
    "speed": {
      "value": 120,
      "type": "number",
      "description": "Boss movement speed"
    }
  }
}
```

**Infrastructure fields** (already in template — do NOT remove, do NOT include in GDD):
`screenSize`, `debugConfig`, `renderConfig` — these are managed by the template.

---

## 4. Animation Requirements

### 4.1 Core Principle: Views Over Frames

In top-down view, **facing direction** is more important than animation frame count. Each action has **3 directional images** (front/back/side), each as a 1-frame animation. The `playAnimation()` hook resolves the correct direction at runtime.

### 4.2 Three-Layer Architecture

Animations require synchronization across **3 files**:

```
asset-pack.json  →  IMAGE keys (directional sprite frames)
animations.json  →  ANIMATION keys (1-frame per direction)
Character.ts     →  animKeys (BASE key mapping, resolved by playAnimation())
```

### 4.3 Required Animations Per Player Character

For each playable character named `{name}`:

| Action  | Image Keys                                                     | Notes                                  |
| ------- | -------------------------------------------------------------- | -------------------------------------- |
| `idle`  | `{name}_idle_front`, `{name}_idle_back`, `{name}_idle_side`    | Standing still                         |
| `walk`  | `{name}_walk_front`, `{name}_walk_back`, `{name}_walk_side`    | Walking                                |
| `melee` | `{name}_melee_front`, `{name}_melee_back`, `{name}_melee_side` | Melee attack                           |
| `shoot` | `{name}_shoot_front`, `{name}_shoot_back`, `{name}_shoot_side` | Ranged attack                          |
| `dash`  | `{name}_dash_front`, `{name}_dash_back`, `{name}_dash_side`    | Dashing                                |
| `die`   | `{name}_die_front`                                             | Death (single direction is sufficient) |

**Total**: 16 images per player character (5 actions × 3 directions + 1 die).

### 4.4 animations.json Convention

Each directional image becomes a **1-frame animation** in animations.json. Naming: `{char}_{action}_{direction}_anim`.

- Looping actions (`idle`, `walk`): `"repeat": -1`
- One-shot actions (`melee`, `shoot`, `dash`, `die`): `"repeat": 0`
- 1-frame animations with `repeat: 0` fire `animationcomplete` immediately — FSM transitions work correctly

> Full format and examples → see `top_down.md` Section 7.5.

### 4.5 animKeys Mapping (MANDATORY)

The FSM expects these **base animation keys** per character. `playAnimation()` resolves them to directional variants at runtime:

| Base Key            | Resolves To                         | Required When       |
| ------------------- | ----------------------------------- | ------------------- |
| `{name}_idle_anim`  | `{name}_idle_front/back/side_anim`  | Always              |
| `{name}_walk_anim`  | `{name}_walk_front/back/side_anim`  | Always              |
| `{name}_melee_anim` | `{name}_melee_front/back/side_anim` | Melee combat        |
| `{name}_shoot_anim` | `{name}_shoot_front/back/side_anim` | Ranged combat       |
| `{name}_dash_anim`  | `{name}_dash_front/back/side_anim`  | Dash ability        |
| `{name}_die_anim`   | `{name}_die_front_anim`             | Always (single dir) |

**WARNING**: If any of these keys are missing, the FSM defaults to `player_idle_anim`, `player_walk_anim`, etc. — which won't exist for custom characters and will cause invisible/frozen sprites.

### 4.6 playAnimation() Override (MANDATORY)

Every player class MUST override `playAnimation()` to resolve directional variants. The logic: replace `_anim` suffix with `_front_anim` / `_back_anim` / `_side_anim` based on `facingDirection`, with safe fallback. `flipX` for left/right is handled by `BasePlayer.update()` automatically.

> Implementation code → see `top_down.md` Section 7.3 and `template_api.md` Section 4.3.

### 4.7 Enemy Animations

Enemy directional sprites follow the same convention. Minimum recommended set:

| Action   | Image Keys                                                        | Notes                          |
| -------- | ----------------------------------------------------------------- | ------------------------------ |
| `idle`   | `{name}_idle_front`, `{name}_idle_back`, `{name}_idle_side`       | Required                       |
| `walk`   | `{name}_walk_front`, `{name}_walk_back`, `{name}_walk_side`       | Required for patrol/chase      |
| `attack` | `{name}_attack_front`, `{name}_attack_back`, `{name}_attack_side` | Optional                       |
| `die`    | `{name}_die_front`                                                | Single direction is sufficient |

Enemy classes use the `getAnimationKey(isMoving, facingDirection)` hook to return direction-aware keys. Implementation → see `top_down.md` Section 7.4.

---

## 5. Character Art Direction

### 5.1 Player Characters

**CRITICAL**: Top-down characters use OVERHEAD or 3/4 TOP-DOWN VIEW with **3 directional views**.

| Rule              | Requirement                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------- |
| **One Per Image** | Each image must contain **EXACTLY one character** — no groups, no multiple figures        |
| **View Angle**    | TOP-DOWN / OVERHEAD view (looking from above)                                             |
| **Directions**    | Generate **front** (facing camera), **back** (facing away), **side** (profile) per action |
| **Type**          | Use `type: "animation"` with `frameCount: 1` per directional sprite                       |
| **Style**         | 1-frame per direction per action — prioritize directional coverage over frame count       |
| **Side Sprites**  | Always face RIGHT; engine uses `flipX` for left                                           |

### 5.2 Enemy Characters

Same top-down/overhead perspective with **3 directional views**. Can have fewer actions (idle + walk + die minimum).

---

## 6. Character Selection

For games with multiple playable characters:

1. Add `CharacterSelectScene` to scene flow
2. Define characters with: `name`, `previewKey`, `description`, `playerClass`
3. Each character is a separate Player class with different stats/abilities

**GDD should list:**

- Character name and description
- Unique abilities (melee focus vs ranged focus vs dash-heavy)
- Stats differences (speed vs damage vs health)

---

## 7. Screen Shake Guidelines

| Event           | Recommended                         | Rationale                                          |
| --------------- | ----------------------------------- | -------------------------------------------------- |
| `onDamageTaken` | `shakeLight` or `shakeMedium`       | Damage is infrequent — gives feedback              |
| `onDeath`       | `shakeStrong`                       | Major event, strong feedback is appropriate        |
| `onShoot`       | **NO shake**                        | Shooting is rapid — constant shake is disorienting |
| `onMeleeStart`  | **NO shake**                        | Attacks are frequent — shake overwhelms gameplay   |
| `onDashUsed`    | **NO shake** (trail effect instead) | Visual trail is better feedback for dash           |

---

## 8. Common Design Mistakes

| Wrong                                                                                              | Correct                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Implement movement physics"                                                                       | "Use EightWayMovement, set walkSpeed=200"                                                                                                                                             |
| "Create patrol AI"                                                                                 | "Use PatrolAI behavior with speed=80"                                                                                                                                                 |
| "Write damage system"                                                                              | "Use BasePlayer.takeDamage(), override onDamageTaken hook"                                                                                                                            |
| "Code dash ability"                                                                                | "Use DashAbility with dashSpeed=500, dashDuration=200"                                                                                                                                |
| "Design map from scratch"                                                                          | "Use Template A, modify obstacle positions"                                                                                                                                           |
| Missing animation in animations.json                                                               | Add ALL required anims before running game                                                                                                                                            |
| Character as SIDE VIEW                                                                             | Character as **TOP-DOWN / OVERHEAD VIEW**                                                                                                                                             |
| Single direction for all sprites                                                                   | Generate **3 directions** (front/back/side) per action — prioritize views over frames                                                                                                 |
| 2-frame animation, 1 direction                                                                     | 1-frame sprite, 3 directions — directional coverage >> frame count for top-down                                                                                                       |
| No `playAnimation()` override                                                                      | MUST override `playAnimation()` to map base keys to directional variants                                                                                                              |
| Single melee animation                                                                             | Provide idle/walk/melee/shoot/dash/die with 3 directional sprites each                                                                                                                |
| Jump/gravity in top-down                                                                           | NO gravity, NO jumping — use dash instead                                                                                                                                             |
| `animKeys: { attack: '...' }`                                                                      | `animKeys: { melee: '...', shoot: '...', dash: '...' }`                                                                                                                               |
| Named import: `import { playerConfig }`                                                            | Default import: `import gameConfig from '../gameConfig.json'` then destructure                                                                                                        |
| Design tilemap from scratch                                                                        | Copy Template A/B/C/D — tool validates known templates only                                                                                                                           |
| Detailed/busy floor tileset description                                                            | **Solid simple color** floor — floor is background, keeps scene clean                                                                                                                 |
| `ScreenEffectHelper.shake` on every attack                                                         | Screen shake on **damage/death ONLY** — shake on shoot/melee is annoying at high fire rates                                                                                           |
| Single tileset for top-down                                                                        | Use DUAL tilesets: `{theme}_floor` + `{theme}_walls`, call `generate_tilemap` twice with `mode`                                                                                       |
| Inventing scene groups (`this.players`, `this.doors`)                                              | Use ONLY auto-initialized groups: `this.enemies`, `this.obstacles`, `this.decorations`, `this.playerBullets`, `this.enemyBullets`, `this.enemyMeleeTriggers`                          |
| `this.sounds.shoot` / `this.sounds.xxx`                                                            | Use individual properties: `this.shootSound`, `this.attackSound`, `this.hurtSound`, `this.dashSound` (player), `this.attackSound`, `this.deathSound` (enemy)                          |
| Using `BaseLevelScene` for space shooter                                                           | Use `BaseArenaScene` — no tilemap, scrolling background instead                                                                                                                       |
| Generating tilesets for arena game                                                                 | Arena mode has NO tilesets — use background image + solid color                                                                                                                       |
| Pre-placing enemies in arena `createEntities()`                                                    | Enemies are spawned dynamically via `spawnEnemy()` — only create player in `createEntities()`                                                                                         |
| Forgetting `super.onEnemyKilled(enemy)` in arena                                                   | MUST call `super.onEnemyKilled(enemy)` to track kills and trigger boss                                                                                                                |
| No sub-mode declaration in GDD Section 0                                                           | MUST state `Sub-mode: tilemap` or `Sub-mode: arena`                                                                                                                                   |
| `displayHeight: 128` (player twice tile height)                                                    | `displayHeight: 64` (= 1 tile) — character should match tile scale, not tower over it                                                                                                 |
| Large map (30×20) + zoom 0.75                                                                      | Compact map (18×12) + zoom 1.0 — fill screen naturally, not by shrinking everything                                                                                                   |
| Characters look tiny and scene feels empty                                                         | Check proportions: player = 1 tile, enemies = 1 tile, obstacle = 0.75 tile, zoom = 1.0                                                                                                |
| Missing asset files — game crashes with `Cannot read properties of undefined (reading 'duration')` | After generating assets, verify that EVERY image key in `animations.json` has a corresponding image file in `asset-pack.json` AND on disk. Missing textures cause this runtime crash. |
| `playerConfig.attackDamage.value` crashes — gameConfig has no `attackDamage`                       | Use safe access: `playerConfig.attackDamage?.value ?? 0`. Not all games have combat, so `attackDamage` may be absent from gameConfig.json.                                            |
| `stateTimer = 0` → state machine fires instantly on first frame                                    | Initialize timers to the ACTUAL duration: `this.stateTimer = this.getRandomDuration(min, max)`. Starting at 0 causes `stateTimer <= 0` to be true on the very first frame.            |
| `private checkWinCondition()` causes TS2415                                                        | BaseGameScene defines `protected checkWinCondition()`. Use `protected override checkWinCondition()` in your scene — never `private`.                                                  |
| NPC AI re-decides every frame during a phase                                                       | Decision logic (e.g., "50% chance to stop") must run ONCE per phase transition, not every frame. Use a `hasDecided` flag that resets when the phase changes.                          |
| `setupScrollingBg()` for a fixed-camera arena                                                      | Use a static image background for survival/arena games. `setupScrollingBg()` is only for space shooters or vertical scrollers.                                                        |
| Red light detection eliminates entity repeatedly                                                   | Always guard elimination with `if (entity.isDead) return;` and set `entity.setVelocity(0, 0)` immediately to prevent re-detection on the next frame.                                  |
