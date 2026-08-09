# Tower Defense — Game Design Guide

> From a game designer's perspective: what makes a great tower defense game.
> This document focuses on gameplay, map design, wave balance, and feel — not code.

---

## 1. Core Loop

**Place → Defend → Earn → Upgrade → Repeat**

1. Enemies spawn in waves, following a predefined path from spawn to exit
2. Player places towers on buildable grid cells using earned gold
3. Towers automatically target and shoot enemies in range
4. Killing enemies earns gold; gold funds new towers and upgrades
5. If too many enemies reach the exit, player loses lives
6. Clear all waves to win the level

**No player character** — interaction is mouse cursor + keyboard shortcuts:

- **Left Click**: Place tower (with tower selected) or interact with existing tower
- **Right Click / ESC**: Cancel tower selection
- **Spacebar**: Force start next wave immediately
- **ESC**: Pause menu (when no tower selected)

Between waves, a countdown timer is displayed on screen so the player knows how long they have to build before the next wave arrives. Pressing Spacebar skips the countdown.

---

## 2. Map Design

### 2.1 Grid System

Every TD level is defined by a grid:

- **Grid dimensions**: Typically 12–18 columns \* 8–12 rows
- **Cell size**: Default 64px (configurable in gameConfig.json)
- **Cell types**:

| Symbol | CellType      | Meaning                          |
| ------ | ------------- | -------------------------------- |
| `B`    | BUILDABLE (0) | Player can place towers here     |
| `P`    | PATH (1)      | Enemy walking path               |
| `X`    | BLOCKED (2)   | Impassable (walls, water, trees) |
| `S`    | SPAWN (3)     | Enemy entry point                |
| `E`    | EXIT (4)      | Enemy exit point (player base)   |

### 2.2 Map Templates

Use these templates as starting points. Modify path shape and buildable zones.

**Template A — Straight with turns** (Easy)

```
X X X X X X X X X X X X
S P P P B B B B B B B X
X B B P B B B B B B B X
X B B P P P P B B B B X
X B B B B B P B B B B X
X B B B B B P P P B B X
X B B B B B B B P B B X
X B B B B B B B P P P E
X B B B B B B B B B B X
X X X X X X X X X X X X
```

**Template B — S-curve** (Medium)

```
X X X X X X X X X X X X X X
S P P P P P P B B B B B B X
X B B B B B P B B B B B B X
X B B B B B P P P P P B B X
X B B B B B B B B B P B B X
X B B P P P P P P P P B B X
X B B P B B B B B B B B B X
X P P P B B B B B B B B B X
X P B B B B B B B B B B B X
X P P P P P P P P P P P P E
X X X X X X X X X X X X X X
```

**Template C — Central loop** (Hard)

```
X X X X X X X X X X X X X X X X
S P P P B B B B B B B B B B B X
X B B P B B B B B B B B B B B X
X B B P P P P P P P P P B B B X
X B B B B B B B B B B P B B B X
X B B B P P P P P B B P B B B X
X B B B P B B B P B B P B B B X
X B B B P B B B P P P P B B B X
X B B B P B B B B B B B B B B X
X B B B P P P P P P P P P P P E
X X X X X X X X X X X X X X X X
```

### 2.3 Map Design Rules

1. **Path must be connected**: Spawn → waypoints → exit, with no breaks
2. **Buildable cells NEVER touch path diagonally only**: There must be clear visual separation
3. **Single path per level** (multi-path is an advanced variation — only if GDD explicitly requests it)
4. **Border is always BLOCKED**: Edge cells should be X or part of S/E entry
5. **Minimum 5 buildable cells adjacent to path**: Player needs room to build strategically
6. **Path length**: Longer paths = easier level (more time to attack enemies)
7. **Path turns**: More turns = more strategic positions (corners are premium spots)

### 2.4 Path Waypoints

Waypoints are defined in grid coordinates and must be in order:

```
Waypoint 0 (spawn) → Waypoint 1 → ... → Waypoint N (exit)
```

- Waypoints are placed at **turns** — not every path cell
- Enemies move in straight lines between consecutive waypoints
- Include the spawn and exit as first and last waypoints

---

## 3. Tower Design

### 3.1 Tower Archetypes

Every TD game should have 3–5 distinct tower types:

| Archetype         | Role                       | Stats Pattern                                                   | Example      |
| ----------------- | -------------------------- | --------------------------------------------------------------- | ------------ |
| **Basic/Arrow**   | Cheap, fast, single-target | Low damage, high fire rate, medium range                        | Arrow Tower  |
| **Cannon/Splash** | AOE damage                 | High damage, low fire rate, small range                         | Cannon Tower |
| **Sniper/Long**   | Long range, high damage    | Very high damage, very low fire rate, large range               | Sniper Tower |
| **Slow/Utility**  | Debuff enemies             | Low damage, applies slow effect via status system, medium range | Ice Tower    |
| **Multi/Machine** | Rapid fire                 | Very low per-shot damage, very high fire rate                   | Machine Gun  |

### 3.2 Tower Balance Guidelines

| Parameter               | Low     | Medium  | High     | Very High |
| ----------------------- | ------- | ------- | -------- | --------- |
| Cost                    | 30–50g  | 60–100g | 120–200g | 250–400g  |
| Damage                  | 5–10    | 15–25   | 30–50    | 60–100    |
| Range (px)              | 80–120  | 130–170 | 180–240  | 250–350   |
| Fire Rate (shots/sec)   | 0.3–0.5 | 0.8–1.2 | 1.5–2.0  | 2.5–4.0   |
| Projectile Speed (px/s) | 150–200 | 250–350 | 400–500  | 600+      |

### 3.3 Upgrade System

- **3 levels per tower** (base + 2 upgrades)
- Each upgrade costs ~60–100% of the previous level's cost
- Stat increases per upgrade: ~40–80% damage, ~10–20% range, ~15–30% fire rate
- Visual feedback on upgrade (texture change or tint)

### 3.4 Targeting Modes

| Mode        | Behavior              | Best For                       |
| ----------- | --------------------- | ------------------------------ |
| `first`     | Furthest along path   | Default — focuses exit threats |
| `last`      | Most recently spawned | Prevent enemies from entering  |
| `closest`   | Nearest to tower      | Maximizes shot count           |
| `strongest` | Highest current HP    | Focus tough enemies            |

### 3.5 Target Prediction

Towers automatically lead their shots based on enemy velocity, aiming at the predicted position where the projectile will intercept the target rather than firing at the enemy's current location. This significantly improves hit rates, especially against fast-moving enemies. No design configuration is required; prediction is built into the template's projectile system.

### 3.6 Homing Projectiles

Towers can be configured with `homing: true` to make their projectiles track the target each frame. Homing projectiles continuously adjust velocity and rotation toward the target, guaranteeing a hit as long as the target is alive. If the target dies mid-flight, the projectile is destroyed.

- **When to use homing**: For arrow/sniper towers where guaranteed hits are desired, or for slow projectiles that would otherwise miss fast enemies.
- **When NOT to use homing**: For splash/AOE towers (splash should land at a position, not track a single enemy) or machine-gun towers (rapid fire with prediction is more satisfying).
- **Target prediction is automatically disabled** when homing is enabled — the two systems are mutually exclusive.

---

## 4. Enemy Design

### 4.1 Enemy Archetypes

| Archetype | Role          | Stats Pattern                                    | Example |
| --------- | ------------- | ------------------------------------------------ | ------- |
| **Basic** | Cannon fodder | Low HP, low speed, low reward                    | Goblin  |
| **Fast**  | Speed rush    | Very low HP, high speed, medium reward           | Scout   |
| **Tank**  | Damage sponge | Very high HP, very low speed, high reward        | Ogre    |
| **Swarm** | Overwhelm     | Tiny HP, medium speed, tiny reward, many spawned | Bat     |
| **Boss**  | Wave boss     | Extreme HP, slow, high reward                    | Dragon  |

### 4.2 Enemy Balance Guidelines

| Parameter           | Low   | Medium | High    | Very High | Boss      |
| ------------------- | ----- | ------ | ------- | --------- | --------- |
| Max Health          | 30–60 | 80–150 | 200–400 | 500–800   | 1000–3000 |
| Speed (px/s)        | 30–50 | 60–90  | 100–140 | 150–200   | 20–40     |
| Reward (gold)       | 5–8   | 10–15  | 20–30   | 35–50     | 100–200   |
| Exit Damage (lives) | 1     | 1      | 2       | 3         | 5–10      |

### 4.3 Display Height Guidelines

| Enemy Size   | displayHeight | When to Use                    |
| ------------ | ------------- | ------------------------------ |
| Tiny (swarm) | 24–32 px      | Bats, insects, small creatures |
| Small        | 36–44 px      | Goblins, scouts                |
| Medium       | 48–56 px      | Standard infantry              |
| Large        | 60–72 px      | Tanks, ogres                   |
| Boss         | 80–96 px      | Wave bosses                    |

---

## 5. Wave Design

### 5.1 Wave Structure

Each wave is a sequence of enemy groups:

```
Wave {
  preDelay?: ms        // pause before wave starts
  groups: [            // spawned sequentially
    { enemyType, count, interval }
  ]
  reward?: gold        // bonus for clearing this wave
}
```

### 5.2 Wave Progression Rules

1. **Start simple**: Wave 1 is always basic enemies only, slow interval (1000ms+)
2. **Introduce types gradually**: New enemy types appear every 2–3 waves
3. **Mixed waves** start by wave 4–5: combine basic + fast, or basic + tank
4. **Boss waves** every 5 waves (wave 5, 10, 15...) or as the final wave
5. **Difficulty scaling**: Increase count, decrease interval, mix tougher enemies

### 5.3 Wave Template (10-wave standard level)

| Wave | Composition                             | Interval | Reward |
| ---- | --------------------------------------- | -------- | ------ |
| 1    | 5× basic                                | 1200ms   | 10g    |
| 2    | 8× basic                                | 1000ms   | 15g    |
| 3    | 6× basic + 3× fast                      | 800ms    | 20g    |
| 4    | 10× basic                               | 700ms    | 20g    |
| 5    | 8× basic + 1× boss                      | 600ms    | 50g    |
| 6    | 5× fast + 5× basic                      | 500ms    | 25g    |
| 7    | 12× basic + 4× tank                     | 600ms    | 30g    |
| 8    | 8× fast + 8× basic                      | 400ms    | 30g    |
| 9    | 6× tank + 10× basic                     | 500ms    | 40g    |
| 10   | 15× basic + 5× fast + 3× tank + 1× boss | 400ms    | 100g   |

### 5.4 Timing

- **Pre-delay**: 2000ms for wave 1, 0ms for subsequent (timeBetweenWaves config handles gaps)
- **Time between waves**: 5000ms default (gives player time to build)
- **Spawn interval**: Range from 400ms (intense) to 1500ms (relaxed)

---

## 6. Economy Balance

### 6.1 Starting Gold

- **Easy levels**: 150–200g (can build 3–4 towers before wave 1)
- **Medium levels**: 80–120g (can build 1–2 towers)
- **Hard levels**: 50–70g (can build 1 cheap tower)

### 6.2 Income Sources

| Source           | Amount  | Frequency |
| ---------------- | ------- | --------- |
| Kill basic enemy | 5–10g   | Per kill  |
| Kill fast enemy  | 8–15g   | Per kill  |
| Kill tank enemy  | 20–30g  | Per kill  |
| Kill boss        | 50–200g | Per boss  |
| Wave clear bonus | 10–100g | Per wave  |

### 6.3 Sell Refund

- Default: 70% of total invested (base cost + upgrade costs)
- Encourages strategic building without penalty for experimentation

---

## 7. Art Direction

### 7.1 Visual Layers (back to front)

1. **Background image**: Full-screen environmental art stretched to `screenSize` dimensions. The background is purely decorative; gameplay elements (path, towers, grid) are positioned by code offsets
2. **Grid overlay**: Semi-transparent cell type indicators (debug only, buildable=green, path=tan)
3. **Path line**: Semi-transparent line along enemy route (visible in production, not just debug)
4. **Tower slots**: Visual foundations on buildable cells. **Hidden by default**, shown only when player enters placement mode (selects a tower type). Should blend with the game theme (cushions, platforms, glowing circles)
5. **Towers**: Clear silhouettes, facing direction optional, upgrade visual changes
6. **Enemies**: Distinct per type, health bars above, directional animation
7. **Projectiles**: Small, fast, color-coded per tower type
8. **UI**: DOM-based themed HUD on top (gold, lives, wave, tower panel with styled buttons)

### 7.2 Asset Requirements per Level

| Category       | Assets Needed                                                                | Key Format                           |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| Background     | 1 full-map image                                                             | `{level}_bg`                         |
| Towers         | 1 per tower type (+ optional upgrade variants)                               | `tower_{type}`, `tower_{type}_lv{N}` |
| Enemies        | 1+ per enemy type (spritesheet for animation)                                | `enemy_{type}`                       |
| Projectiles    | 1 dedicated image per tower type (distinct shape/color)                      | `proj_{type}`                        |
| Tower Slots    | 1 image for empty placement slots (if using slot-based placement)            | `tower_slot`                         |
| Obstacles      | 1 per obstacle type (if using destructible obstacles)                        | `obstacle_{type}`                    |
| Defense Target | 1 image for the object being defended (if using a visible target entity)     | `defense_target`                     |
| UI icons       | Tower icons for selection panel                                              | `icon_tower_{type}`                  |
| SFX            | Fire, hit, enemy death, wave start, place tower, sell, combo, obstacle break | `sfx_{action}`                       |

### 7.3 Style

- **Top-down perspective**: All sprites viewed from above or slightly angled
- **Clear readability**: Player must instantly distinguish tower types and enemy types
- **Color coding**: Each tower type has a signature color (e.g., arrow=green, cannon=red, ice=blue)
- **Size hierarchy**: Enemies slightly smaller than towers, bosses larger than towers

### 7.4 Visual Helpers

The template provides built-in visual helpers that improve gameplay clarity without requiring custom art.

**Path Visualization** -- `drawPathLine()` renders a semi-transparent line along the enemy path on top of the background but below all game entities. This is especially useful when AI-generated background images do not align with the actual path coordinates, giving players a clear indication of where enemies will travel. Use increased `lineWidth` (6+) and `alpha` (0.5+) for better visibility against busy backgrounds.

**Buildable Cell Markers** -- `drawBuildableMarkers()` draws dashed borders on grid cells where towers can be placed. **Not needed when using tower slots** — the tower slot system provides better visual feedback by showing placement locations only during placement mode, keeping the game view clean otherwise.

**Floating Reward Text** -- `showFloatingText()` displays animated floating text popups (e.g., "+10g") when enemies are killed. Use this in the `onEnemyKilled` hook to give satisfying per-kill reward feedback.

**Wave Countdown Timer** -- The UI automatically displays a countdown between waves, showing the player how much time remains before the next wave begins. No additional design or implementation is needed; this is handled by the template.

**Tower Hover Range** -- Hovering over a placed tower shows its attack range circle. Each tower type can have a distinct color for its range indicator (e.g., blue for ice, red for cannon). This helps players evaluate tower coverage.

**Tower Fire Animation** -- Towers play a subtle scale pulse when firing, giving visual feedback that the tower is actively attacking. This is automatic and requires no design configuration.

**Projectile Hit Effect** -- When projectiles hit enemies, a brief scale-up and fade-out effect plays at the impact point. This provides satisfying hit feedback. Can be customized per projectile type.

**Combo Kill Display** -- The UI can display a combo counter when multiple enemies are killed in quick succession. Use the `onComboKill` hook to emit `'showCombo'` events to the UI.

**Wave Bonus Display** -- The UI can display a wave completion bonus message. Use the `onWaveComplete` hook to emit `'showWaveBonus'` events to the UI.

### 7.5 Tower Slot Art Direction

Tower slots are visual foundations rendered on buildable cells. They are **hidden by default** and only appear when the player selects a tower type to place, providing a clean game view that reveals placement options on demand.

- **Asset**: Generate a `tower_slot` image (~64\*64) that blends with the game theme (e.g., a carpet/mat, stone platform, wooden pedestal, glowing circle). The slot should look like a natural part of the environment, not a UI element
- **Fallback**: If no `tower_slot` asset exists, the template draws a subtle rounded-rect graphic
- **Depth**: Tower slots render below towers, enemies, and path lines (depth -4)
- **Opacity**: Semi-transparent (60%) — visible enough to guide placement but not visually dominant
- **Visibility**: Automatically toggled by BaseTDScene when tower selection changes. No manual show/hide needed

### 7.7 UI Art Direction

The tower selection panel and HUD elements should match the game's visual theme. The template provides themed UI with gradient backgrounds and styled borders.

- **Tower panel**: Bottom bar with themed buttons for each tower type. Each button displays the tower's sprite image (extracted from Phaser textures automatically), tower name, and cost. Buttons use warm gradient backgrounds with border highlights
- **Tower icons**: UIScene automatically extracts each tower's `textureKey` sprite from Phaser's texture manager and injects it as a base64 image into the DOM button. No separate icon assets needed
- **HUD elements**: Top-left status displays (gold, lives, wave) with color-coded themed backgrounds
- **Selected state**: Active tower button changes to a contrasting color (blue gradient) with yellow border
- **Controls hint**: Displayed in the top-right corner (below pause button) with compact multi-line layout. Keeps the bottom area clean for the tower panel
- **Asset requirement**: No dedicated UI panel images needed -- the template uses CSS gradients and Tailwind classes for theming. However, if the game has a specific art style, generate `ui_panel` and `button_bg` assets and reference them in the UIScene's `createDOMUI()` method

### 7.6 Projectile Art Direction

Each tower type should have a **dedicated projectile image** with a distinct shape and color that visually matches the tower. This is critical for readability -- players need to instantly recognize which tower fired which projectile.

| Tower Archetype | Projectile Style              | Example                    |
| --------------- | ----------------------------- | -------------------------- |
| Basic/Arrow     | Small, elongated, fast-moving | Green arrow, yellow bullet |
| Cannon/Splash   | Round, heavy-looking          | Red cannonball, bomb       |
| Sniper/Long     | Thin, sharp                   | Silver needle, laser beam  |
| Slow/Utility    | Soft, rounded, cool-colored   | Blue ice shard, purple orb |
| Multi/Machine   | Tiny, numerous                | Small yellow pellets       |

Projectile images should be small (8-20px) and clearly distinct from each other. Use the `proj_{type}` key naming convention.

**Auto-sizing**: The template automatically scales custom projectile images to 16px display size. The default `tower_bullet` (yellow circle) is 8px. If a `projectileKey` texture is missing, the template falls back to `tower_bullet` to prevent crashes.

---

## 8. Optional Game Mechanics

### 8.1 Destructible Obstacles

Obstacles are interactive objects placed on the map that block tower placement. Players click them to deal damage; when destroyed, they can reward gold and optionally reveal a new buildable cell.

**Design Guidelines:**

- Place obstacles on BLOCKED cells adjacent to the path for strategic value
- Health should require 3-8 clicks to destroy (not trivial, not tedious)
- Gold reward should be meaningful but not game-breaking (10-30g)
- Converting destroyed obstacle cells to BUILDABLE adds a strategic layer: players must decide when to invest clicks vs. building towers

| Parameter       | Low    | Medium | High   |
| --------------- | ------ | ------ | ------ |
| Health (clicks) | 3-4    | 5-6    | 7-8    |
| Gold Reward     | 10-15g | 15-25g | 25-40g |

### 8.2 Combo Kill System

The template tracks rapid sequential kills within a configurable time window (default: 2 seconds). When 2+ enemies are killed in quick succession, the `onComboKill` hook fires with the current combo count.

**Design Guidelines:**

- Combo bonuses should be small per-kill (2-5g per combo level) to reward skill without breaking economy
- Display combo text via the UI `'showCombo'` event for satisfying feedback
- Higher combos (5+) can trigger special effects (screen flash, sound)
- Combos naturally occur during dense wave segments, rewarding good tower placement

### 8.3 Wave Completion Bonus

Waves can define a `reward` field for bonus gold awarded on wave clear. Use the `onWaveComplete` hook to emit `'showWaveBonus'` to the UI for visual feedback.

### 8.4 Splash Damage Falloff

Splash damage uses distance-based falloff: enemies at the center of the explosion take full damage, while those at the edge take 50%. This creates more tactical AOE behavior -- players must aim splash towers at clusters for maximum effect.

---

## 9. Config Schema

All game-specific values go in `gameConfig.json` using the wrapper format:

```json
{
  "towerDefenseConfig": {
    "startingGold": { "value": 100, "type": "number", "description": "..." },
    "startingLives": { "value": 20, "type": "number", "description": "..." },
    "cellSize": { "value": 64, "type": "number", "description": "..." },
    "timeBetweenWaves": {
      "value": 5000,
      "type": "number",
      "description": "..."
    },
    "sellRefundRate": { "value": 0.7, "type": "number", "description": "..." }
  }
}
```

Per-tower and per-enemy stats are defined in their COPY template files as `TowerTypeConfig` / `TDEnemyConfig` objects, reading values from `gameConfig.json` where appropriate.

---

## 10. Forbidden in GDD

The following are NOT supported by the template and must NOT appear in GDD designs:

- ❌ Player character with movement (no WASD, no sprite)
- ❌ Multiple simultaneous paths (single path only, unless explicitly designed)
- ❌ Tower abilities requiring manual activation (towers are automatic)
- ❌ Tilemap-based maps (grid is code-defined, not tile-based)
- ❌ Real-time terrain modification (grid is static after level start)
- ❌ Enemy abilities (enemies only walk and have HP)
- ❌ PvP or multiplayer
- ❌ Resources other than gold (single currency system)
- ❌ Tower placement outside the grid system
