# Grid Logic -- Game Design Guide

> From a game designer's perspective: what makes a great grid logic game.
> This document focuses on gameplay, puzzle design, level design, and feel -- not code.

---

## 0. Sub-Type Detection (decide FIRST)

Grid logic games share a grid-based world but differ in timing and interaction:

| Sub-Type      | Timing Mode | Input Style                     | Key Question                              | Examples                                  |
| ------------- | ----------- | ------------------------------- | ----------------------------------------- | ----------------------------------------- |
| **puzzle**    | `step`      | Direction keys                  | Does each input = one discrete move?      | Sokoban, sliding puzzles, Baba Is You     |
| **roguelike** | `step`      | Direction keys + Spacebar       | Step-based with combat and enemy AI?      | Mystery Dungeon, Shiren, dungeon crawlers |
| **tactics**   | `turn`      | Click to select + click to move | Do units take turns with movement ranges? | Fire Emblem, Into the Breach, chess       |
| **match**     | `freeform`  | Click/swap cells                | Do matching cells clear and cascade?      | Candy Crush, Bejeweled, Puyo Puyo         |
| **arcade**    | `realtime`  | Direction keys (timed)          | Does the game advance on a timer?         | Snake, Pac-Man, Tetris                    |

**Default**: `puzzle` (step mode). Roguelike is puzzle mode with combat, enemy AI, and HP systems. Use the keywords above to detect sub-type.

---

## 1. Core Loop by Sub-Type

### Puzzle (step mode)

**Observe -> Plan -> Move -> Evaluate -> Repeat**

1. Player observes the board state
2. Player inputs one direction (arrow keys / WASD)
3. Game processes the move (push boxes, slide on ice, activate rules)
4. Game checks win/lose conditions
5. Player can undo if stuck

### Tactics (turn mode)

**Select -> Move -> Act -> End Turn -> Enemy Turn -> Repeat**

1. Player selects a unit
2. Movement range is highlighted
3. Player moves unit, optionally attacks
4. After all actions, turn ends
5. AI/enemy takes their turn
6. Check victory/defeat conditions

### Match (freeform mode)

**Select -> Swap -> Match -> Clear -> Gravity -> Chain -> Repeat**

1. Player clicks/drags to swap two adjacent cells
2. If swap creates a 3+ match, matched cells clear
3. Remaining cells fall (gravity)
4. New cells spawn at top
5. Check for chain reactions; repeat until stable
6. Score is accumulated

### Roguelike (step mode with combat)

**Observe -> Move/Attack -> World Reacts -> Enemies Act -> Repeat**

1. Player observes the board (enemies, items, terrain)
2. Player inputs direction (move or bump attack) or Spacebar (special ability)
3. **Player Phase**: movement resolves, bump attack deals damage
4. **World Phase**: traps activate, terrain effects trigger, items collected
5. **Enemy Phase**: each enemy takes one step (chase, patrol, or emit area effect)
6. Check win/lose (all enemies dead, player HP = 0, reach exit)

### Arcade (realtime mode)

**Move -> Tick -> Evaluate -> Repeat (on timer)**

1. Player inputs direction between ticks
2. On each timer tick, game advances one step
3. Player entity moves in the current direction
4. Collisions, scoring, and growth evaluated
5. Speed increases over time for difficulty

---

## 2. Level Design

### 2.1 Grid System

Every grid logic game is defined by a rectangular grid:

- **Grid dimensions**: Typically 6-16 columns x 6-16 rows (puzzle), up to 20x20 (tactics)
- **Cell size**: Default 64px (configurable in gameConfig.json)
- **Cell types**:

| Symbol | CellType | Value | Meaning                                        |
| ------ | -------- | ----- | ---------------------------------------------- |
| `.`    | EMPTY    | 0     | Nothing / void / out of bounds                 |
| `#`    | WALL     | 1     | Impassable barrier                             |
| `_`    | FLOOR    | 2     | Walkable ground                                |
| `G`    | GOAL     | 3     | Target/objective cell                          |
| `!`    | HAZARD   | 4     | Dangerous cell (damage, death)                 |
| `S`    | SPAWN    | 5     | Starting position                              |
| `*`    | SPECIAL  | 6     | Game-specific meaning                          |
| `~`    | ICE      | 7     | Slippery surface (entity slides until stopped) |
| `O`    | PORTAL   | 8     | Teleportation pad (paired with another portal) |

### 2.2 Level Templates

**Template A -- Small Puzzle** (8x8, Easy)

```
# # # # # # # #
# S _ _ _ _ _ #
# _ # _ # _ _ #
# _ _ _ _ _ _ #
# _ # _ # _ _ #
# _ _ _ _ _ G #
# _ _ _ _ _ _ #
# # # # # # # #
```

**Template B -- Medium Puzzle** (10x10, Medium)

```
# # # # # # # # # #
# S _ _ # _ _ _ _ #
# _ # _ _ _ # _ _ #
# _ _ _ # _ _ _ _ #
# # _ _ _ _ _ # _ #
# _ _ # _ _ _ _ _ #
# _ _ _ _ # _ _ _ #
# _ # _ _ _ _ # _ #
# _ _ _ _ _ _ _ G #
# # # # # # # # # #
```

**Template C -- Large Tactics** (12x10, for unit battles)

```
# # # # # # # # # # # #
# S _ _ _ _ _ _ _ _ _ #
# _ _ _ _ _ _ _ _ _ _ #
# _ _ # # _ _ # # _ _ #
# _ _ # _ _ _ _ # _ _ #
# _ _ _ _ _ _ _ _ _ _ #
# _ _ # _ _ _ _ # _ _ #
# _ _ # # _ _ # # _ _ #
# _ _ _ _ _ _ _ _ _ _ #
# # # # # # # # # # # #
```

**Template D -- Match-3 Board** (7x9, vertical gravity)

```
_ _ _ _ _ _ _
_ _ _ _ _ _ _
_ _ _ _ _ _ _
_ _ _ _ _ _ _
_ _ _ _ _ _ _
_ _ _ _ _ _ _
_ _ _ _ _ _ _
_ _ _ _ _ _ _
_ _ _ _ _ _ _
```

### 2.3 Level Design Rules

1. **Walls define the boundary**: Edge cells should be WALL for puzzle/tactics
2. **One SPAWN cell per player entity**: Place S where the player starts
3. **Goal cells are reachable**: Every GOAL must have a valid path from SPAWN
4. **Puzzle solvability**: Every puzzle level MUST have at least one solution
5. **Progressive difficulty**: Introduce mechanics gradually across levels
6. **Symmetry is appealing**: Symmetric boards feel fair and elegant
7. **Dead-end prevention**: Avoid states where undo is the only option (or ensure undo is available)
8. **Match-3 boards use FLOOR only**: No walls, no special cells -- the cell VALUE is the piece type

### 2.4 Dual-Layer ASCII Map Pattern (Recommended)

For levels with entities placed on walkable cells, use two separate ASCII layers to avoid symbol conflicts:

**Layer 1 -- Terrain** (cell types only):

```
##########
#___~__!G#
#___~____#
#A__#__*_#
#S_______#
##########
```

**Layer 2 -- Entities** (placed on top of terrain, `.` = empty):

```
..........
.....R....
..C.......
......>...
...K......
..........
```

Entity markers: `P` = player, `C` = crate, `K` = key/item, `R` = chaser enemy, `H` = horizontal patroller, `V` = vertical patroller, `^v<>` = turret (with direction).

This avoids the problem of a single-layer map where a crate on a FLOOR cell cannot be represented (both need the same position). The terrain layer defines `getBoardConfig().cells`, and the entity layer drives `createEntities()`.

### 2.5 Undo System Scope

The built-in undo system (`saveUndoState()` / `undo()`) automatically saves and restores:

- All cell types in the grid (BoardManager)
- Entity grid positions (BoardManager)

It does NOT automatically save:

- Entity HP, cooldowns, facing direction
- Inventory flags (hasKey, etc.)
- Patrol directions, turret counters
- Any game-specific state variables

For games with combat, cooldowns, or inventory, override `getCustomUndoData()` to snapshot these values and `restoreCustomUndoData()` to restore them. See template_api.md Section 4.4 for details.

---

## 3. Entity Design

### 3.1 Common Entity Types

| Entity      | entityType | isWalkable | isPushable | isDestructible | Description               |
| ----------- | ---------- | ---------- | ---------- | -------------- | ------------------------- |
| Player      | `'player'` | false      | false      | false          | Player-controlled unit    |
| Box/Crate   | `'box'`    | false      | true       | false          | Pushable object (Sokoban) |
| Wall Block  | `'wall'`   | false      | false      | false          | Immovable obstacle        |
| Enemy       | `'enemy'`  | false      | false      | true           | AI-controlled opponent    |
| Collectible | `'item'`   | true       | false      | true           | Pickups (coins, keys)     |
| Goal Marker | `'goal'`   | true       | false      | false          | Visual target indicator   |
| Bomb        | `'bomb'`   | false      | true       | true           | Explosive (Bomberman)     |
| Ice         | `'ice'`    | true       | false      | false          | Sliding surface           |
| Portal      | `'portal'` | true       | false      | false          | Teleport pad              |

### 3.2 Entity Design Guidelines

- Each entity type needs a **clear, distinct visual** -- players must identify types instantly
- **Size**: Entity sprites should fill ~80% of a cell (cellSize - 8px padding)
- **Art direction**: Top-down or isometric-top-down for puzzle/tactics; front-facing for Match-3 pieces
- **Animation**: Most grid entities use static images. Animated entities (walk, idle) use `type: "animation"` assets

---

## 4. Art Direction

### 4.1 Visual Layers (back to front)

1. **Background image**: Full-screen environmental art, stretched to screenSize
2. **Grid overlay**: Semi-transparent grid lines (optional, subtle)
3. **Cell type visualization**: Color-coded cells for debug (hidden in production)
4. **Cell highlights**: Movement range, selection, attack range indicators
5. **Entities**: Player, boxes, enemies, items -- each clearly distinct
6. **Selection indicator**: Pulsing border on selected entity
7. **UI**: DOM-based HUD overlay (moves, score, undo, pause)

### 4.2 Asset Requirements

| Category    | Assets Needed                        | Key Format                                       |
| ----------- | ------------------------------------ | ------------------------------------------------ |
| Background  | 1 per level                          | `{level}_bg`                                     |
| Player      | 1+ per player type                   | `player` or `player_{variant}`                   |
| Entities    | 1 per entity type                    | `{entityType}` (e.g., `box`, `enemy_1`)          |
| Grid cells  | 1 per special cell type (optional)   | `cell_{type}` (e.g., `cell_goal`, `cell_hazard`) |
| UI elements | Score icon, move icon                | `icon_{name}`                                    |
| SFX         | Move, push, collect, win, lose, undo | `sfx_{action}`                                   |
| BGM         | 1 per level or theme                 | `bgm_{name}`                                     |

### 4.3 View Direction Rules

| Sub-Type | Character View               | Board View                  |
| -------- | ---------------------------- | --------------------------- |
| Puzzle   | Top-down (viewed from above) | Top-down grid               |
| Tactics  | Top-down or 3/4 isometric    | Top-down grid               |
| Match-3  | Front-facing icons/gems      | Front-facing vertical board |
| Arcade   | Top-down                     | Top-down grid               |

### 4.4 Match-3 Piece Art

Match-3 games need 5-7 visually distinct piece types:

- Each piece should have a unique **shape AND color** (color-blind accessibility)
- Common themes: gems, fruits, candies, elements, animals
- Size: fill the cell clearly (~48px for 64px cells)
- Style: clean, round, high-contrast outlines

---

## 5. Puzzle Design

### 5.1 Sokoban-Style Rules

- Player moves one cell per input in 4 directions
- Pushing: player moves into a pushable entity -> entity moves in same direction
- Cannot push into walls or other non-walkable entities
- Cannot push two entities at once (standard rule)
- Win: all boxes on goal cells

### 5.2 Sliding Puzzle Rules

- Player/piece slides in a direction until hitting a wall or another piece
- No pushing -- movement is self-only
- Ice physics: keep moving until stopped
- Win: reach goal cell or arrange pieces in target pattern

### 5.3 Match-3 Rules

- Swap two adjacent cells (4-directional, not diagonal)
- If swap creates 3+ matching cells in a line, clear them
- Gravity: pieces above cleared cells fall down
- New pieces spawn at top of columns
- Chain reactions: matches caused by gravity score bonus
- Win: reach target score, clear specific cells, or complete objectives

### 5.4 Tactics Rules

- Units have movement range (BFS-based)
- Units have attack range (Manhattan distance or custom shape)
- Turn order: player first, then AI
- Combat: attack reduces HP; 0 HP = death
- Win: defeat all enemies, survive N turns, or reach objective

### 5.5 Roguelike / Dungeon Crawler Rules

- Player moves one cell per input in 4 directions (same as puzzle)
- **Bump attack**: move into an enemy cell = deal damage instead of moving
- **Special ability** (Spacebar): ranged attack, area effect, or interaction (game-specific)
- **Enemy AI types**:
  - Chaser: uses A\* pathfinding (`findPath`) to move toward player each step
  - Patroller: moves in a fixed pattern, reverses on wall
  - Static emitter: does not move, emits area effect every N turns
- **Three-phase turn**: Player Phase (move/attack) -> World Phase (traps, tiles) -> Enemy Phase (AI steps)
- **Interactive tiles**: entering HAZARD cells deals damage, SPECIAL cells have game-specific effects (stealth, teleport, heal)
- **HP system**: player and enemies have maxHealth; game ends when player HP reaches 0
- **Items**: walkable + destructible entities, collected on enter (keys, potions, energy)
- Win: reach exit cell, defeat boss, clear all enemies, or complete objective

### 5.6 Combat Design Guidelines

- **Bump attack damage**: typically 1-3 HP per hit (define in config)
- **Special ability**: 2-4 tiles range, cooldown 3-5 turns, damage 2-5 HP
- **Enemy HP**: scale with difficulty (basic: 1-2 HP, tough: 3-5 HP, boss: 8-15 HP)
- **Player HP**: 3-10 HP (less = harder, more = forgiving)
- **Healing**: rare items, fixed amount (1-3 HP), placed at strategic locations
- **Death behavior**: entity shakes, fades out, is removed from board
- **Cooldown tracking**: use turnNumber from onStep() or onTurnStart()

### 5.7 Advanced Puzzle Mechanics

These mechanics can be combined with any sub-type to create deeper puzzle or action experiences.

#### Sliding (Ice Physics)

- Entity enters an ICE cell and keeps moving in the same direction until blocked
- Blocking conditions: wall, out-of-bounds, non-walkable entity, non-ICE cell
- Uses `slideEntity(entity, direction, shouldStop)` -- fires `onEntityEnteredCell` at every intermediate cell
- Interactions mid-slide: entity can trigger traps, collect items, or enter portals while sliding
- Design tip: combine ice with walls and gaps to create path-planning puzzles

#### Teleportation (Portal Pairs)

- PORTAL cells come in pairs identified by a shared ID (e.g., color or number)
- When an entity enters a portal, it instantly appears at the paired portal's location
- Portals are one-way per step: entering the destination portal does NOT re-teleport
- Implement via `onEntityEnteredCell`: detect PORTAL cell, find paired portal entity, call `moveEntity` with animate=false
- Design tip: portals break spatial intuition -- use them to create non-linear paths and shortcuts

#### Elemental Interaction (Environment Conduction)

- Certain abilities or effects interact differently depending on the target cell type or entity type
- Example: Electric attack + HAZARD(water) cell = AOE damage to all entities in/adjacent to the water
- Example: Electric attack + mechanical entity = activate mechanism (open door, toggle switch)
- Implement via `onActionInput()`: check target cell type with `boardManager.getCell()`, apply different effects
- Chain reactions: use `boardManager.setCell()` to mutate cells, `getCellsInRadius()` for AOE, `damageEntity()` for damage
- **Connected AOE (advanced)**: for large water bodies, use `floodFill()` from utils.ts to find all connected HAZARD cells, then damage entities on or adjacent to any of them. This rewards players for observing terrain shapes and creates more interesting AOE patterns than a fixed radius
- Design tip: teach one interaction per level, then combine them in later levels

#### Turrets (Turn-Based Auto-Fire)

- Turret entities fire a projectile in a fixed direction every N turns
- Projectile travels instantly along the line (`getCellsInDirection`), damaging the first entity hit
- Turrets fire during the Enemy Phase via `onStep(turnNumber)`: if `turnNumber % fireInterval === 0`, fire
- **Initial delay**: each turret can have a different `initialDelay` (turns before first fire), enabling staggered timing patterns (e.g., two turrets alternating fire)
- Players must observe turret timing patterns and move between safe windows
- Design tip: use turrets to create timing puzzles -- the player must count turns to pass safely

#### Combining Advanced Mechanics

- **Ice + Portals**: slide onto a portal mid-slide, teleport, continue sliding in the same direction
- **Ice + Turrets**: time your slide to pass through a turret's firing line between shots
- **Elemental + Turrets**: activate a turret by conducting electricity to its power source
- **Portals + Turrets**: teleport behind a turret to avoid its line of fire
- Introduce mechanics one at a time, then layer combinations for increasing difficulty

---

## 6. Difficulty Scaling

### 6.1 Puzzle Difficulty Progression

| Level | Grid Size | Mechanics           | Boxes/Entities   | Moves     |
| ----- | --------- | ------------------- | ---------------- | --------- |
| 1     | 6x6       | Push only           | 1 box, 1 goal    | Unlimited |
| 2     | 7x7       | Push only           | 2 boxes, 2 goals | Unlimited |
| 3     | 8x8       | Push + ice          | 2 boxes, 2 goals | 30 moves  |
| 4     | 8x8       | Push + ice + hazard | 3 boxes, 3 goals | 25 moves  |
| 5     | 10x10     | All mechanics       | 4 boxes, 4 goals | 20 moves  |

### 6.2 Match-3 Difficulty Progression

| Level | Grid Size | Piece Types | Objective                  | Moves |
| ----- | --------- | ----------- | -------------------------- | ----- |
| 1     | 7x7       | 4 colors    | Score 500                  | 20    |
| 2     | 7x8       | 5 colors    | Score 1000                 | 18    |
| 3     | 7x9       | 5 colors    | Clear 10 red               | 15    |
| 4     | 8x9       | 6 colors    | Score 2000                 | 12    |
| 5     | 8x9       | 6 colors    | Clear 15 blue + Score 3000 | 10    |

### 6.3 Tactics Difficulty

| Level | Grid Size | Player Units | Enemy Units        | Special         |
| ----- | --------- | ------------ | ------------------ | --------------- |
| 1     | 8x8       | 1            | 2 basic            | Tutorial        |
| 2     | 10x8      | 2            | 3 basic + 1 ranged | --              |
| 3     | 12x10     | 3            | 4 mixed            | Terrain effects |
| 4     | 12x10     | 3            | 5 mixed + 1 boss   | Boss mechanic   |

### 6.4 Roguelike Difficulty

| Level | Grid Size | Player HP | Enemies                 | Items           | Special        |
| ----- | --------- | --------- | ----------------------- | --------------- | -------------- |
| 1     | 8x8       | 5         | 2 chasers               | 1 potion        | Tutorial       |
| 2     | 10x10     | 5         | 3 chasers + 1 patroller | 1 potion, 1 key | Locked door    |
| 3     | 12x10     | 5         | 4 mixed + 1 emitter     | 2 potions       | Traps, ability |
| 4     | 12x12     | 5         | 5 mixed + 1 boss        | 3 potions       | Boss fight     |

---

## 7. Config Schema

All game-specific values go in `gameConfig.json` using the wrapper format:

```json
{
  "gridConfig": {
    "cellSize": {
      "value": 64,
      "type": "number",
      "description": "Grid cell size in pixels"
    },
    "gridWidth": {
      "value": 10,
      "type": "number",
      "description": "Grid width in cells"
    },
    "gridHeight": {
      "value": 10,
      "type": "number",
      "description": "Grid height in cells"
    },
    "maxMoves": {
      "value": -1,
      "type": "number",
      "description": "Max moves (-1 = unlimited)"
    },
    "animationSpeed": {
      "value": 200,
      "type": "number",
      "description": "Move animation ms"
    },
    "inputDebounceMs": {
      "value": 150,
      "type": "number",
      "description": "Input debounce ms"
    }
  }
}
```

Add game-specific config sections as needed:

```json
{
  "puzzleConfig": {
    "canPushMultiple": {
      "value": false,
      "type": "boolean",
      "description": "Allow pushing chains"
    },
    "hasIcePhysics": {
      "value": false,
      "type": "boolean",
      "description": "Sliding on ice cells"
    }
  },
  "matchConfig": {
    "minMatchLength": {
      "value": 3,
      "type": "number",
      "description": "Minimum match size"
    },
    "pieceTypes": {
      "value": 5,
      "type": "number",
      "description": "Number of piece colors"
    },
    "hasGravity": {
      "value": true,
      "type": "boolean",
      "description": "Pieces fall down"
    }
  },
  "tacticsConfig": {
    "moveRange": {
      "value": 3,
      "type": "number",
      "description": "Unit movement range"
    },
    "attackRange": {
      "value": 1,
      "type": "number",
      "description": "Unit attack range"
    },
    "actionsPerTurn": {
      "value": 1,
      "type": "number",
      "description": "Actions per turn"
    }
  },
  "combatConfig": {
    "playerHP": {
      "value": 5,
      "type": "number",
      "description": "Player starting HP"
    },
    "bumpDamage": {
      "value": 1,
      "type": "number",
      "description": "Bump attack damage"
    },
    "abilityDamage": {
      "value": 2,
      "type": "number",
      "description": "Special ability damage"
    },
    "abilityRange": {
      "value": 2,
      "type": "number",
      "description": "Special ability range in cells"
    },
    "abilityCooldown": {
      "value": 3,
      "type": "number",
      "description": "Cooldown in turns"
    }
  },
  "advancedMechanics": {
    "slideStepDuration": {
      "value": 80,
      "type": "number",
      "description": "Animation ms per ice slide step"
    },
    "turretFireInterval": {
      "value": 3,
      "type": "number",
      "description": "Turret fires every N turns"
    },
    "turretDamage": {
      "value": 1,
      "type": "number",
      "description": "Damage per turret shot"
    },
    "aoeDamage": {
      "value": 1,
      "type": "number",
      "description": "Elemental AOE damage"
    }
  }
}
```

---

## 8. Map Rendering: Code-Defined Grids (NOT Tilemaps)

### 8.1 Why Code-Defined

Grid logic games use **code-defined grids** (same pattern as tower_defense). The visual layer is a background image; the logic layer is a 2D array in BoardManager. This choice is deliberate:

| Concern             | Tilemap Approach                   | Code-Defined Approach           |
| ------------------- | ---------------------------------- | ------------------------------- |
| Data authority      | Dual: tilemap + BoardManager       | Single: BoardManager only       |
| Dynamic cells       | Must sync tilemap AND data         | Change data array only          |
| Runtime mutations   | Difficult (putTileAt + setCell)    | Trivial (setCell)               |
| Visual quality      | Depends on tileset art quality     | Background image + code overlay |
| AI tileset risk     | Seams, inconsistencies             | No tileset needed               |
| Pipeline complexity | Extra tool step (generate_tilemap) | No extra step                   |
| Collision detection | NOT using Phaser physics anyway    | Manual grid lookup              |

Grid logic games frequently mutate cells at runtime: boxes fill holes (HAZARD to FLOOR), doors open (WALL to FLOOR), items are collected (SPECIAL to FLOOR), traps activate. Keeping a tilemap in sync with BoardManager is error-prone and unnecessary.

### 8.2 Visual Layer Architecture

```
Layer -10: Background image (full-screen, stretched to screenSize)
Layer  -5: Grid overlay (optional, semi-transparent colored cells)
Layer  -3: Cell sprites (optional, for goal/hazard/special cell images)
Layer   0: Entity sprites (player, boxes, enemies, items)
Layer  10: Selection/highlight overlays
Layer 200: DOM-based UI (UIScene)
```

Background images should depict the entire map environment from top-down view (e.g., "dark stone dungeon floor with subtle cracks" or "bright garden with grass tiles"). The code renders grid lines and colored cell overlays on top.

### 8.3 Cell Sprite Pattern (Optional)

For games that need per-cell-type visuals beyond colored rectangles:

```
1. Generate cell images as type: "image" assets (cell_goal, cell_hazard, cell_ice)
2. In createEnvironment(), iterate cells and place sprites at grid positions
3. Store references for runtime updates (cellSprites[row][col])
4. When a cell changes type, swap or destroy the sprite
```

This is more flexible than tilemaps and produces cleaner results with AI-generated art.

---

## 9. Forbidden in GDD

The following are NOT supported by the template and must NOT appear in GDD designs:

- Continuous physics (gravity, velocity, acceleration) -- all movement is discrete
- Real-time free movement -- entities snap to grid positions
- Multiplayer / PvP -- single player only
- Hex grids -- rectangular grids only
- 3D or isometric rendering -- 2D top-down only
- Procedural level generation -- levels are hand-designed (defined in code)
- Save/load to persistent storage -- only in-memory undo stack
- Custom physics engines -- use the built-in discrete grid movement
- Tilemap-based maps -- grids are code-defined (see Section 8 for rationale)
- Phaser Arcade Physics for collision -- all collision is manual grid lookup

---

## 10. Visual Polish Guidelines

### 10.1 Animation Feedback

- **Move**: Smooth tween between cells (200ms default)
- **Push**: Pushed entity tweens slightly after the pusher
- **Collect**: Item scales down + fades out
- **Win**: All goal cells pulse green, floating "Victory!" text
- **Undo**: Quick snap to previous position (100ms)
- **Match clear**: Matched cells scale up then burst then fade out
- **Gravity drop**: Pieces fall with slight bounce at landing
- **Chain reaction**: Brief delay between cascading matches for dramatic effect
- **Bump attack**: Attacker moves halfway then bounces back; target shakes
- **Ranged attack**: Projectile-like tween from attacker to target cells
- **Death**: Entity shakes then fades out then destroyed
- **Damage**: Brief red tint (0xff0000) then restore original tint

### 10.2 Audio Feedback

- Every player action should have a sound
- Distinct sounds for: move, push, collect, attack, damage, hit wall, win, lose, undo
- Match-3: ascending pitch for chain combos
- Roguelike/tactics: distinct attack/damage/death sounds per entity type
- Background music should match the game mood (calm for puzzles, tense for tactics/roguelike)

### 10.3 Selection & Highlighting

- Selected entity: pulsing yellow/white border
- Movement range: blue semi-transparent fill
- Attack range: red semi-transparent fill
- Hover: subtle brightness increase on hovered cell
- Invalid move: brief red flash

### 10.4 HP and Status Display

- Use UIScene events for HP/status display (not in-game sprites)
- Emit `hpChanged` event with (current, max) after damage/heal
- Emit `statusChanged` event with text string for ability cooldowns, inventory, etc.
- UIScene renders DOM-based HUD that auto-updates on events
