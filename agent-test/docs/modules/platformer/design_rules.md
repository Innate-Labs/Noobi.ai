# Platformer — Game Design Guide

> From a game designer's perspective: what makes a great side-scrolling platformer.
> This document focuses on gameplay, level design, and feel — not code.

---

## 1. Mechanics

### 1.1 Movement

Every platformer MUST have movement:

- **Walk**: Left/Right with configurable speed
- **Jump**: With gravity, configurable power
- **Optional**: Coyote time (grace period after leaving ledge), jump buffer (input registered before landing)
- **Optional**: Double jump (`doubleJumpEnabled: true`) — allows one extra jump while airborne

### 1.2 Combat

Two combat styles available:

| Style      | Description                  | When to Use                  |
| ---------- | ---------------------------- | ---------------------------- |
| **Melee**  | Close-range punch/kick combo | Brawlers, action platformers |
| **Ranged** | Shoot projectiles            | Shooters, run-and-gun        |

Both can be combined. Melee has an alternating combo system (punch → kick → punch...).

### 1.3 Ultimate Skills

For games with special abilities, these skill types are available:

| Skill                  | Style                               | Best For                                    |
| ---------------------- | ----------------------------------- | ------------------------------------------- |
| **Dash Attack**        | Charge-up dash with energy trail    | Melee characters, fast attacks              |
| **Targeted AOE**       | Lock target + AOE at their position | Ranged characters, area denial              |
| **Area Damage**        | AOE burst around player             | Berserker characters, close combat          |
| **Beam Attack**        | Horizontal laser beam               | Tech characters, long range                 |
| **Ground Quake**       | Ground slam (grounded enemies only) | Heavy characters, crowd control             |
| **Targeted Execution** | Lock target + instant kill          | Assassin characters, single target          |
| **Boomerang**          | Projectile that returns to owner    | Thrown-weapon characters, returning attacks |
| **Multishot**          | N projectiles in spread pattern     | Gunner/mech characters, spread fire         |
| **Arc Projectile**     | Gravity arc with optional explosion | Heavy/siege characters, arcing throws       |

**GDD should describe skills like:**

```
Ultimate: "Thunder Strike"
- Type: TargetedAOESkill
- Config: aoeRadius=200, damage=70, effectKey="lightning_bolt"
- Animation: player_ultimate_anim (2 frames)
```

### 1.4 Enemy AI Types

| AI Type        | Behavior                    | When to Use           |
| -------------- | --------------------------- | --------------------- |
| **Patrol**     | Walk back and forth         | Basic enemies, guards |
| **Chase**      | Follow player when detected | Aggressive enemies    |
| **Stationary** | Don't move, just attack     | Turrets, traps        |
| **Custom**     | Designer-defined behavior   | Bosses with phases    |

Boss enemies can have phase-based AI (e.g., patrol at >50% HP, chase at <50% HP).

---

## 2. Level Design (ASCII Tilemap)

> **TILEMAP RULES (READ FIRST — violations cause downstream tool failures):**
>
> 1. If user doesn't specify level count → **default to 1 level**
> 2. MUST copy from Templates A/B/C/D below — **NEVER design ASCII maps from scratch**
> 3. Only minor modifications allowed (see Section 2.4)
> 4. Write the **COMPLETE** ASCII map for each level in the GDD

### 2.1 How Many Levels?

| User says                          | Levels to design | Template selection                               |
| ---------------------------------- | ---------------- | ------------------------------------------------ |
| Nothing about levels               | **1 level**      | Template A (simple) or D (if boss)               |
| "A few levels" / "some levels"     | **2-3 levels**   | A + D, optionally B or C                         |
| Specific number (e.g., "5 levels") | That number      | One template per level, reuse with modifications |

### 2.2 Map Symbols

| Symbol | Meaning       | Usage                           |
| ------ | ------------- | ------------------------------- |
| `.`    | Air           | Empty space                     |
| `#`    | Solid terrain | Use in blocks, not single lines |
| `=`    | Platform      | One-way jump-through            |
| `P`    | Player spawn  | Left side of map                |
| `E`    | Enemy spawn   | Needs flat ground (3+ tiles)    |
| `B`    | Boss spawn    | Right side of map               |
| `C`    | Coin          | Collectible reward              |
| `D`    | Door          | Exit point                      |

### 2.3 Map Templates (COPY THESE — do NOT invent new maps)

#### Template A: "Tutorial Flatlands" (Level 1)

```
..............................
..............................
..............................
..............................
..............................
..............................
..............................
..............................
..............................
..............................
............E.................
..........====................
.....................===......
..............................
..............................
..P........................E..
######.........E........######
######........###.......######
#########.....###.......######
##############################
```

- Width: 30, Height: 20
- Focus: Learning movement
- Enemies: 3-4

#### Template B: "The Climb" (Vertical Challenge)

```
...................................
...................................
...................................
...................................
...................................
...................................
.............................E.....
..........................#######..
..........................#######..
.............E.....................
..........#######..................
..........#######.......=======....
...................................
.......=======....................
....................E..............
..................#####............
.P.................................
#####...E.....................#####
#####..####....=======........#####
#####..####..............E....#####
###################################
###################################
```

- Width: 35, Height: 22
- Focus: Jumping skill
- Enemies: 4-5

#### Template C: "The Fortress" (Combat Focus)

```
........................................
........................................
........................................
........................................
........................................
........................................
........................................
......................E.................
...................#######..............
...................#######..............
...........===..........................
............===.............===.........
......E......===....................E...
...#######.......................#######
...#######.......................#######
.....................E...........#######
................########................
................########................
.P......................................
#####.............................######
########....#########.............######
########....#########....#####....######
```

- Width: 40, Height: 22
- Focus: Enemy combat
- Enemies: 4-5

#### Template D: "Boss Chamber" (Final Level)

```
........................................
........................................
........................................
........................................
........................................
........................................
........................................
........................................
........................................
........................................
........................................
........................................
........................................
........................................
.......===....................===.......
...................===..................
........................................
..P..........===.........===.........B..
####................................####
#####............######............#####
#######........##########........#######
########################################
```

- Width: 40, Height: 22
- Focus: Boss fight
- Structure: Central arena with side platforms for dodging

### 2.4 Allowed Modifications (minor tweaks ONLY)

After copying a template, you may ONLY:

- Add/remove `C` (coins)
- Add/remove `=` (platforms)
- Add/remove `E` (enemies, max 4 per level)
- Adjust `#` block shapes (keep 2-tile thickness)

**NEVER change:**

- Map dimensions (width × height)
- Bottom 2 rows (must stay solid `#`)
- `P` position (left side)
- `D`/`B` position (right side)
- `E` placement requires 3+ tile flat floor underneath

---

## 3. Config Schema

The GDD's Section 2 should contain **game-specific config values** that override the template defaults. The agent will **merge** these into the existing `gameConfig.json`, preserving infrastructure fields.

All values use `{ "value": X, "type": "...", "description": "..." }` wrapper format. Access in code: `playerConfig.maxHealth.value`.

**Game-specific fields** (GDD Section 2 should specify these):

```json
{
  "playerConfig": {
    "maxHealth": {
      "value": 100,
      "type": "number",
      "description": "Player max health"
    },
    "walkSpeed": {
      "value": 360,
      "type": "number",
      "description": "Player walk speed"
    },
    "jumpPower": {
      "value": 2400,
      "type": "number",
      "description": "Player jump power"
    },
    "attackDamage": {
      "value": 40,
      "type": "number",
      "description": "Player attack damage"
    },
    "gravityY": {
      "value": 1200,
      "type": "number",
      "description": "Gravity Y value"
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
    "damage": { "value": 20, "type": "number", "description": "Enemy damage" }
  },
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
  },
  "ultimateConfig": {
    "cooldown": {
      "value": 5000,
      "type": "number",
      "description": "Ultimate cooldown (ms)"
    },
    "damage": {
      "value": 80,
      "type": "number",
      "description": "Ultimate damage"
    }
  }
}
```

**Infrastructure fields** (already in template — do NOT remove, do NOT include in GDD):
`screenSize`, `debugConfig`, `renderConfig`, `characterConfig` — these are managed by the template.

---

## 4. Animation Requirements

### 4.1 Three-Layer Architecture

Animations require synchronization across **3 files**:

```
asset-pack.json  →  IMAGE keys (sprite frames)
animations.json  →  ANIMATION keys (frame sequences)
Character.ts     →  animKeys (FSM state mapping)
```

### 4.2 Required Animations Per Character

For each playable character named `{name}`:

| Animation Key          | Asset-pack Frames                          | Purpose           |
| ---------------------- | ------------------------------------------ | ----------------- |
| `{name}_idle_anim`     | `{name}_idle_01`, `{name}_idle_02`         | Standing still    |
| `{name}_run_anim`      | `{name}_run_01`, `{name}_run_02`           | Walking/running   |
| `{name}_jump_anim`     | `{name}_jump_01`, `{name}_jump_02`         | In air            |
| `{name}_attack_1_anim` | `{name}_attack_1_01`, `{name}_attack_1_02` | Punch (odd combo) |
| `{name}_attack_2_anim` | `{name}_attack_2_01`, `{name}_attack_2_02` | Kick (even combo) |
| `{name}_die_anim`      | `{name}_idle_01`, `{name}_idle_02`         | Death             |

**Each animation has exactly 2 frames maximum.**

### 4.3 animKeys Mapping (MANDATORY)

The FSM expects these **exact keys**:

```
idle      → {name}_idle_anim
walk      → {name}_run_anim
jumpUp    → {name}_jump_anim
jumpDown  → {name}_jump_anim
punch     → {name}_attack_1_anim    # REQUIRED for melee combo
kick      → {name}_attack_2_anim    # REQUIRED for melee combo
ultimate  → {name}_idle_anim        # Use idle as fallback if no unique anim
die       → {name}_die_anim
```

**WARNING**: If `punch`, `kick`, or `ultimate` are missing, FSM defaults to `player_punch_anim`, `player_kick_anim`, `player_ultimate_anim` — which don't exist and will crash!

---

## 5. Character Selection

For games with multiple playable characters:

1. Add `CharacterSelectScene` to scene flow
2. Define characters with: `name`, `previewKey`, `description`, `playerClass`
3. Each character is a separate Player class with different stats/skills

**GDD should list:**

- Character name and description
- Unique skill/ultimate
- Stats differences (speed vs power vs defense)

---

## 6. Scene Transition Timing

### Victory Delay

`BaseLevelScene.onLevelComplete()` includes a **500 ms delay** before showing the victory or game-complete screen. This lets the last kill animation play out and gives the player a moment to register the win.

If you override `onLevelComplete()`, call `super.onLevelComplete()` to preserve this delay, or use `this.time.delayedCall(500, ...)` in your custom logic.

### Camera Positioning

The camera follows the player with `setFollowOffset(0, -128)`, placing the player in the **lower 1/3** of the screen. This is standard for side-scrolling platformers — it gives better visibility of platforms above.

The camera also uses `setLerp(0.1, 0.1)` for smooth following. Both values are set in `BaseLevelScene.setupCamera()`.

---

## 7. Common Design Mistakes

| Wrong                                | Correct                                                             |
| ------------------------------------ | ------------------------------------------------------------------- |
| "Implement jump physics"             | "Use PlatformerMovement, set jumpPower=2400"                        |
| "Create patrol AI"                   | "Use PatrolAI behavior with speed=80"                               |
| "Write damage system"                | "Use BasePlayer.takeDamage(), override onDamageTaken hook"          |
| "Code dash attack"                   | "Use DashAttackSkill with dashDistance=300"                         |
| "Design map from scratch"            | "Use Template B, modify platform positions"                         |
| `animKeys: { attack: '...' }`        | `animKeys: { punch: '...', kick: '...', ultimate: '...' }`          |
| Missing animation in animations.json | Add ALL required anims before running game                          |
| Character as FRONT VIEW              | Character as **SIDE VIEW facing RIGHT** (platformers use side view) |
| Single attack animation              | ALWAYS provide both punch AND kick animations (combo system)        |
