# Tower Defense — Template Capability Reference

> What the template provides: project structure, available systems, hooks, utilities, and operation patterns.
> This document ensures GDD designs stay within template capabilities — no custom code needed.

---

## Hook Integrity Rule (CRITICAL)

Every hook name referenced in the GDD and implementation code **MUST** exist in this document's hook tables (Sections 4–6). Do NOT invent, hallucinate, or assume hooks that aren't listed here. If a hook isn't documented below, it **does not exist** — design around the hooks that DO exist. Using a non-existent hook will cause a compilation failure.

---

## 1. Project Structure

```
src/
  main.ts              # UPDATE: register level scenes via game.scene.add()
  LevelManager.ts      # UPDATE: set LEVEL_ORDER array with level scene keys
  gameConfig.json      # UPDATE: set towerDefenseConfig values, add per-tower/enemy stats
  utils.ts             # KEEP (all utilities — core + TD-specific, never modify)
  scenes/
    Preloader.ts           # KEEP (asset loading)
    TitleScreen.ts         # KEEP (uses LevelManager to start first level)
    BaseTDScene.ts         # KEEP (main TD engine: grid, towers, waves, economy, combos)
    _TemplateTDLevel.ts    # COPY -> rename for each TD level
    UIScene.ts             # KEEP (TD HUD: gold, lives, wave, tower panel, combo display)
    index.ts               # KEEP (barrel exports)
  towers/
    BaseTower.ts           # KEEP (tower base: targeting, firing, upgrades, range indicator)
    _TemplateTower.ts      # COPY -> rename for each tower type
    index.ts               # KEEP (barrel exports)
  enemies/
    BaseTDEnemy.ts         # KEEP (path-following enemy base)
    _TemplateTDEnemy.ts    # COPY -> rename for each enemy type
    index.ts               # KEEP (barrel exports)
  entities/
    BaseObstacle.ts        # KEEP (destructible obstacle base)
    _TemplateObstacle.ts   # COPY -> rename for each obstacle type
    index.ts               # KEEP (barrel exports)
  systems/
    WaveManager.ts         # KEEP (wave spawning system)
    EconomyManager.ts      # KEEP (gold/currency system)
    index.ts               # KEEP (barrel exports)
```

### Scene Hierarchy

```
BaseTDScene             ← grid, groups, tower placement, wave system, economy
  └── _TemplateTDLevel  ← COPY: level-specific grid, path, waves, tower types
```

- All TD games extend `BaseTDScene`, copy `_TemplateTDLevel.ts`
- No sub-modes (unlike top_down's tilemap/arena split)

**TitleScreen** navigates to `LevelManager.LEVEL_ORDER[0]`. Default is empty — level keys MUST be added, or the game will crash on start.

**Scene flow**: TitleScreen → Level1 → (Victory → Level2 → ...) → GameComplete. Lives=0 → GameOver → Restart level.

**Key differences from top_down**: No player sprite, no WASD movement, no combat behaviors. Interaction is mouse-only (click to place towers). Grid-based placement instead of free movement. Enemies follow paths instead of chasing players.

---

## 2. Available Systems

### 2.1 WaveManager

| Property / Method      | Type      | Purpose                                              |
| ---------------------- | --------- | ---------------------------------------------------- |
| `currentWave`          | `number`  | Current wave number (1-based)                        |
| `totalWaves`           | `number`  | Total waves in this level                            |
| `isWaveActive`         | `boolean` | Whether a wave is currently in progress              |
| `isAllWavesComplete`   | `boolean` | True when all waves cleared and no enemies alive     |
| `notifyEnemyRemoved()` | `void`    | Must call when an enemy dies or reaches exit         |
| `startFirstWave()`     | `void`    | Begin wave sequence (called by BaseTDScene)          |
| `skipToNextWave()`     | `void`    | Skip between-wave timer, start next wave immediately |
| `isWaitingForNextWave` | `boolean` | True during the between-wave countdown               |
| `timeBetweenWavesMs`   | `number`  | Configured time between waves in ms                  |

**Events emitted** (on scene event bus):

| Event                | Args                    | When                    |
| -------------------- | ----------------------- | ----------------------- |
| `'spawnEnemy'`       | `(enemyType: string)`   | Time to spawn one enemy |
| `'waveStart'`        | `(waveNum, totalWaves)` | Wave begins             |
| `'waveComplete'`     | `(waveNum, totalWaves)` | Wave cleared            |
| `'waveReward'`       | `(amount: number)`      | Wave clear bonus gold   |
| `'allWavesComplete'` | `()`                    | All waves cleared       |

### 2.2 EconomyManager

| Property / Method        | Type      | Purpose                                    |
| ------------------------ | --------- | ------------------------------------------ |
| `gold`                   | `number`  | Current gold balance                       |
| `canAfford(cost)`        | `boolean` | Check if purchase is possible              |
| `spend(amount)`          | `boolean` | Deduct gold; returns false if insufficient |
| `earn(amount)`           | `void`    | Add gold                                   |
| `getSellValue(invested)` | `number`  | Calculate sell refund                      |
| `sellTower(invested)`    | `number`  | Process sell: add refund, returns amount   |

**Events emitted**:

| Event           | Args                 | When                 |
| --------------- | -------------------- | -------------------- |
| `'goldChanged'` | `(oldGold, newGold)` | Gold balance changes |

---

## 3. Available Groups (BaseTDScene)

| Group              | Type                                  | Purpose                                                                                    |
| ------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `towersGroup`      | `Phaser.GameObjects.Group`            | All placed towers                                                                          |
| `enemiesGroup`     | `Phaser.Physics.Arcade.Group`         | All active enemies (runChildUpdate: true)                                                  |
| `projectilesGroup` | `Phaser.Physics.Arcade.Group`         | All active projectiles                                                                     |
| `obstaclesGroup`   | `Phaser.GameObjects.Group`            | All destructible obstacles                                                                 |
| `towerSlotGroup`   | `Phaser.GameObjects.Group` (optional) | Tower slot visuals on buildable cells. Hidden by default; auto-shown during placement mode |

### Built-in Collisions

| Object 1           | Object 2       | Effect                                                                                                    |
| ------------------ | -------------- | --------------------------------------------------------------------------------------------------------- |
| `projectilesGroup` | `enemiesGroup` | Calls `onProjectileHitEnemy()`. Default: deals damage (splash if `splashRadius` set), destroys projectile |

---

## 4. BaseTDScene Hooks

### 4.1 Abstract Methods (MUST implement in every level)

| Method                   | Returns               | Purpose                                            |
| ------------------------ | --------------------- | -------------------------------------------------- |
| `getGridConfig()`        | `GridConfig`          | Grid dimensions, cell size, 2D CellType array      |
| `getPathWaypoints()`     | `PathPoint[]`         | Ordered waypoints in grid coordinates              |
| `createEnvironment()`    | `void`                | Background image, grid visual overlay, decorations |
| `getWaveDefinitions()`   | `WaveDefinition[]`    | All wave configs for this level                    |
| `getTowerTypes()`        | `TowerTypeConfig[]`   | Available tower types with stats                   |
| `createEnemy(enemyType)` | `BaseTDEnemy \| null` | Factory: map type string to enemy class            |

### 4.2 Hook Methods (CAN override)

| Hook                                 | Default Behavior                                                                    | Purpose                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `onPreCreate()`                      | no-op                                                                               | Before scene creation begins                            |
| `onPostCreate()`                     | no-op                                                                               | After all scene creation is complete                    |
| `onPreUpdate()`                      | no-op                                                                               | Before each frame update                                |
| `onPostUpdate()`                     | no-op                                                                               | After each frame update                                 |
| `onWaveStart(waveNumber)`            | no-op                                                                               | New wave begins                                         |
| `onWaveComplete(waveNumber)`         | no-op                                                                               | Wave cleared                                            |
| `onAllWavesComplete()`               | Launch VictoryUIScene (if next level exists) or GameCompleteUIScene (if last level) | All waves cleared                                       |
| `onEnemyKilled(enemy)`               | no-op                                                                               | Enemy health reached 0                                  |
| `onEnemyReachedEnd(enemy)`           | no-op                                                                               | Enemy reached last waypoint                             |
| `onTowerPlaced(tower, gridX, gridY)` | no-op                                                                               | Tower successfully built                                |
| `onTowerClicked(tower)`              | no-op                                                                               | Player clicked an existing tower (show upgrade/sell UI) |
| `onTowerSold(tower)`                 | no-op                                                                               | Tower sold                                              |
| `onTowerUpgraded(tower, level)`      | no-op                                                                               | Tower upgraded to new level                             |
| `onLivesChanged(oldLives, newLives)` | no-op                                                                               | Lives changed                                           |
| `onGoldChanged(oldGold, newGold)`    | no-op                                                                               | Gold changed                                            |
| `onComboKill(comboCount)`            | no-op                                                                               | Multiple kills in quick succession (count >= 2)         |
| `onObstacleDestroyed(obstacle)`      | no-op                                                                               | A destructible obstacle was destroyed                   |
| `onGameOver()`                       | Launch GameOverUIScene                                                              | Lives reached 0                                         |

### 4.3 Overridable Methods

| Method                                              | Default                                                                                           | Purpose                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTower(worldX, worldY, gridX, gridY, config)` | `new BaseTower(...)`                                                                              | Override to use custom tower subclasses                                                                                                     |
| `onProjectileHitEnemy(projectile, enemy)`           | Deal damage (splash with distance falloff if `splashRadius`), play hit effect, destroy projectile | Override to add on-hit effects (slow, poison)                                                                                               |
| `playProjectileHitEffect(projectile)`               | Scale-up + fade-out tween at impact point                                                         | Override to customize per-projectile-type hit visuals                                                                                       |
| `getMinSpawnInterval()`                             | `700` (ms)                                                                                        | Minimum time between enemy spawns. Prevents visual overlap for large enemies. Formula: `(largestDisplayHeight / slowestSpeed) * 1000 * 1.2` |

---

## 5. BaseTower Hooks

| Hook                       | Default                    | Purpose                                                       |
| -------------------------- | -------------------------- | ------------------------------------------------------------- |
| `onFire(target)`           | no-op                      | Play fire sound/animation                                     |
| `onUpgrade(newLevel)`      | no-op                      | Visual upgrade effect                                         |
| `createProjectile(target)` | Standard projectile        | Override for splash, slow, etc.                               |
| `getUpgradeStats()`        | From config upgrades array | Custom upgrade path logic                                     |
| `playFireAnimation()`      | Scale pulse (1.15x bounce) | Override for custom fire animation per tower type             |
| `getRangeCircleColor()`    | `0xffffff` (white)         | Override to return type-specific color for hover range circle |

### Tower Properties (read-only)

| Property         | Type     | Description                           |
| ---------------- | -------- | ------------------------------------- |
| `level`          | `number` | Current upgrade level                 |
| `invested`       | `number` | Total gold invested (base + upgrades) |
| `range`          | `number` | Current range in pixels               |
| `typeId`         | `string` | Tower type identifier                 |
| `typeName`       | `string` | Tower display name                    |
| `gridX`, `gridY` | `number` | Grid cell coordinates                 |

### Tower Methods

| Method             | Returns          | Description                       |
| ------------------ | ---------------- | --------------------------------- |
| `canUpgrade()`     | `boolean`        | Whether next upgrade exists       |
| `getUpgradeCost()` | `number \| null` | Cost of next upgrade, null if max |
| `upgrade()`        | `boolean`        | Apply upgrade (true if success)   |

### Built-in Behaviors

- **Target Prediction**: `fire()` automatically predicts enemy movement and aims ahead of the target based on projectile speed and distance. No override needed. (Disabled when `homing: true`.)
- **Homing Projectiles**: When `TowerTypeConfig.homing = true`, projectiles track the target each frame, adjusting velocity and rotation. If the target dies mid-flight, the projectile is destroyed. No override needed — just set `homing: true` in the config.
- **Auto Projectile Sizing**: `createProjectile()` automatically uses `PROJECTILE_SIZES.ARROW` (20px) for custom projectile textures and `PROJECTILE_SIZES.BULLET_SMALL` (10px) for the default `tower_bullet`. No manual size parameter needed.
- **Texture Fallback**: `createProjectile()` automatically falls back to the built-in `tower_bullet` texture if the specified `projectileKey` texture does not exist. This prevents crashes from missing assets.
- **Fire Animation**: Towers play a subtle scale pulse when firing. Override `playFireAnimation()` to customize.
- **Hover Range Display**: Hovering over a placed tower shows its attack range circle. Override `getRangeCircleColor()` to set type-specific colors (e.g., blue for ice, red for cannon).
- **Projectile Hit Effect**: When a projectile hits an enemy, a brief scale-up + fade-out effect plays at the impact point. Override `playProjectileHitEffect()` in BaseTDScene to customize.
- **Splash Damage Falloff**: Splash damage attenuates with distance from impact. Enemies at the center take full damage; those at the edge take 50%. This creates more realistic AOE behavior.

---

## 6. BaseTDEnemy Hooks

| Hook                              | Default | Purpose                           |
| --------------------------------- | ------- | --------------------------------- |
| `onSpawn()`                       | no-op   | Spawn effects when placed on path |
| `onDamageTaken(damage)`           | no-op   | Damage reaction (flash, sound)    |
| `onDeath()`                       | no-op   | Death effects, drops              |
| `onReachEnd()`                    | no-op   | Reaching exit effect              |
| `onStatusEffectApplied(effectId)` | no-op   | When a status effect is applied   |
| `onStatusEffectRemoved(effectId)` | no-op   | When a status effect expires      |
| `getAnimationKey(direction)`      | `null`  | Directional animation key         |

### Enemy Properties (public getters)

| Property               | Type     | Description                                         |
| ---------------------- | -------- | --------------------------------------------------- |
| `health`               | `number` | Current health                                      |
| `maxHealth`            | `number` | Maximum health                                      |
| `currentWaypointIndex` | `number` | Current waypoint being targeted                     |
| `pathProgress`         | `number` | 0 = at spawn, 1 = at exit (used by tower targeting) |
| `effectiveSpeed`       | `number` | Base speed \* all status effect multipliers         |
| `killReward`           | `number` | Gold reward when this enemy is killed               |

### Enemy Methods

| Method                                                    | Returns   | Description                                                           |
| --------------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| `takeDamage(damage)`                                      | `void`    | Apply damage, triggers `onDamageTaken` hook                           |
| `applyStatusEffect(id, speedMultiplier, duration, tint?)` | `void`    | Apply a timed speed modifier (e.g., slow). Same id refreshes duration |
| `hasStatusEffect(id)`                                     | `boolean` | Check if effect is active                                             |

### Status Effect System

Enemies support timed status effects that modify speed. Effects are identified by string id. Applying the same id refreshes the duration (no stacking). Effects auto-expire and auto-clear tint.

```typescript
// In onProjectileHitEnemy override (BaseTDScene subclass):
enemy.applyStatusEffect('slow', 0.5, 2000, 0x4488ff);
// id='slow', speed*0.5, 2 seconds, blue tint
```

### Enemy Events (emitted on scene)

| Event               | Args              | When                        |
| ------------------- | ----------------- | --------------------------- |
| `'enemyKilled'`     | `(enemy, reward)` | Enemy health reaches 0      |
| `'enemyReachedEnd'` | `(enemy, damage)` | Enemy reaches last waypoint |

---

## 6b. BaseObstacle Hooks

| Hook                         | Default | Purpose                                         |
| ---------------------------- | ------- | ----------------------------------------------- |
| `onClicked()`                | no-op   | Click reaction (sound, visual)                  |
| `onDamaged(remainingHealth)` | no-op   | Damage feedback after each click                |
| `onDestroyed()`              | no-op   | Destruction effects (particles, sound)          |
| `getClickDamage()`           | `1`     | Damage per click (override for variable damage) |

### Obstacle Properties (public getters)

| Property    | Type     | Description    |
| ----------- | -------- | -------------- |
| `health`    | `number` | Current health |
| `maxHealth` | `number` | Maximum health |

### Obstacle Config

```typescript
interface ObstacleConfig {
  textureKey: string;
  displayHeight?: number;
  maxHealth: number;
  reward?: number; // gold reward on destruction
}
```

### Built-in Behaviors

- **Click-to-Damage**: Obstacles are interactive. Each click deals `getClickDamage()` damage.
- **Visual Feedback**: Built-in red tint flash and shake on each click.
- **Health Bar**: Automatic health bar above the obstacle with color changes.
- **Destruction Event**: Emits `'obstacleDestroyed'` on the scene event bus when health reaches 0. BaseTDScene automatically awards the gold reward.

### Obstacle Events (emitted on scene)

| Event                 | Args                 | When                      |
| --------------------- | -------------------- | ------------------------- |
| `'obstacleDestroyed'` | `(obstacle, reward)` | Obstacle health reaches 0 |

---

## 7. Type Definitions

### Grid Types

```typescript
enum CellType {
  BUILDABLE = 0,
  PATH = 1,
  BLOCKED = 2,
  SPAWN = 3,
  EXIT = 4,
}

interface GridConfig {
  cols: number;
  rows: number;
  cellSize: number;
  cells: CellType[][];
  offsetX?: number;
  offsetY?: number;
}

interface PathPoint {
  gridX: number;
  gridY: number;
}
```

### Tower Types

```typescript
type TargetingMode = 'first' | 'last' | 'closest' | 'strongest';

interface TowerTypeConfig {
  id: string;
  name: string;
  textureKey: string;
  cost: number;
  damage: number;
  range: number; // pixels
  fireRate: number; // shots per second
  projectileKey?: string;
  projectileSpeed?: number;
  homing?: boolean; // true = projectile tracks target each frame
  upgrades?: TowerUpgrade[];
  targetingMode?: TargetingMode;
}

interface TowerUpgrade {
  level: number;
  cost: number;
  damage: number;
  range: number;
  fireRate: number;
}
```

### Enemy Types

```typescript
interface TDEnemyConfig {
  textureKey: string;
  displayHeight?: number;
  stats: {
    maxHealth: number;
    speed: number;
    reward: number;
    damage?: number; // lives lost on exit, default: 1
  };
}

interface StatusEffect {
  id: string;
  speedMultiplier: number; // 0.5 = half speed
  duration: number; // ms
  elapsed: number; // ms (auto-tracked)
  tint?: number; // optional color tint while active
}
```

### Wave Types

```typescript
interface WaveDefinition {
  groups: WaveGroup[];
  reward?: number; // bonus gold for clearing wave
  preDelay?: number; // ms before wave starts
}

interface WaveGroup {
  enemyType: string;
  count: number;
  interval: number; // ms between spawns
}
```

---

## 8. Utility Functions (utils.ts)

### Core Utilities (shared with all modules)

| Function                                                  | Purpose                            |
| --------------------------------------------------------- | ---------------------------------- |
| `initScale(sprite, origin, maxW?, maxH?, bodyW?, bodyH?)` | Scale sprite with body alignment   |
| `resetOriginAndOffset(sprite, direction)`                 | Per-animation origin recalculation |
| `safeAddSound(scene, key, config?)`                       | Safe audio with cache check        |
| `addCollider(scene, obj1, obj2, cb?, proc?, ctx?)`        | Fixed parameter order collider     |
| `addOverlap(scene, obj1, obj2, cb?, proc?, ctx?)`         | Fixed parameter order overlap      |
| `initUIDom(scene, html)`                                  | Create DOM UI overlay              |
| `createDecoration(scene, group, key, x, y, height)`       | Scaled static decoration           |

### TD-Specific Utilities

| Function                                                                                         | Purpose                                                                                                |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `gridToWorld(gridX, gridY, cellSize, offsetX?, offsetY?)`                                        | Grid → pixel center                                                                                    |
| `worldToGrid(worldX, worldY, cellSize, offsetX?, offsetY?)`                                      | Pixel → grid cell                                                                                      |
| `isValidPlacement(cells, gridX, gridY)`                                                          | Check if cell is BUILDABLE                                                                             |
| `getPathLength(waypoints)`                                                                       | Total pixel distance of path                                                                           |
| `getPositionAlongPath(waypoints, progress)`                                                      | Interpolate position at 0–1                                                                            |
| `getDirectionBetween(from, to)`                                                                  | Facing direction for animation                                                                         |
| `createRangeIndicator(scene, x, y, range, color?, alpha?)`                                       | Tower range circle graphic                                                                             |
| `createProjectile(scene, x, y, key, size?, damage?)`                                             | Create physics projectile (auto-fallback to `tower_bullet` if key missing)                             |
| `launchProjectileAt(projectile, targetX, targetY, speed)`                                        | Set velocity toward target                                                                             |
| `createBulletTextures(scene)`                                                                    | Generate fallback bullet texture                                                                       |
| `drawGridOverlay(scene, cells, cellSize, offsetX?, offsetY?, alpha?)`                            | Debug grid visualization                                                                               |
| `drawPathLine(scene, waypoints, lineWidth?, color?, alpha?, depth?)`                             | Semi-transparent path line for enemy route visualization                                               |
| `drawTowerSlots(scene, cells, cellSize, offsetX?, offsetY?, textureKey?, depth?, startVisible?)` | Tower slot visuals on buildable cells. Hidden by default; BaseTDScene auto-shows during placement mode |
| `drawBuildableMarkers(scene, cells, cellSize, offsetX?, offsetY?, color?, alpha?, depth?)`       | Dashed border markers on buildable cells (optional, not needed when using drawTowerSlots)              |
| `showFloatingText(scene, x, y, text, color?, fontSize?, duration?, riseDistance?)`               | Rising/fading text effect for rewards/damage                                                           |

### Projectile Size Constants

| Constant                         | Value | Use Case                                                         |
| -------------------------------- | ----- | ---------------------------------------------------------------- |
| `PROJECTILE_SIZES.BULLET_SMALL`  | 10px  | Default `tower_bullet` fallback                                  |
| `PROJECTILE_SIZES.BULLET_MEDIUM` | 14px  | Medium bullets                                                   |
| `PROJECTILE_SIZES.ARROW`         | 20px  | Custom projectile images (auto-used for non-`tower_bullet` keys) |
| `PROJECTILE_SIZES.CANNONBALL`    | 24px  | Large splash projectiles                                         |
| `PROJECTILE_SIZES.LARGE`         | 36px  | Boss/special projectiles                                         |

---

## 9. gameConfig.json Structure

The module's config merges with core config. All values use the wrapper format.

```json
{
  "screenSize": { ... },
  "debugConfig": { ... },
  "renderConfig": { ... },
  "towerDefenseConfig": {
    "startingGold": { "value": 100, "type": "number", "description": "..." },
    "startingLives": { "value": 20, "type": "number", "description": "..." },
    "cellSize": { "value": 64, "type": "number", "description": "..." },
    "timeBetweenWaves": { "value": 5000, "type": "number", "description": "..." },
    "sellRefundRate": { "value": 0.7, "type": "number", "description": "..." }
  }
}
```

The GDD generates game-specific values (per-tower stats, per-enemy stats) that get added as additional config sections.

---

## 10. Operation Patterns

| Pattern    | Files                                                                                                                                  | Description                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **KEEP**   | `BaseTDScene.ts`, `BaseTower.ts`, `BaseTDEnemy.ts`, `BaseObstacle.ts`, `WaveManager.ts`, `EconomyManager.ts`, `UIScene.ts`, `utils.ts` | Engine files — never modify                         |
| **COPY**   | `_TemplateTDLevel.ts`, `_TemplateTower.ts`, `_TemplateTDEnemy.ts`, `_TemplateObstacle.ts`                                              | Copy → rename → fill abstract methods               |
| **UPDATE** | `main.ts`, `LevelManager.ts`, `gameConfig.json`                                                                                        | Add scene registrations, level order, config values |

---

## 11. UI Communication Protocol

### Game Scene → UIScene (via events on game scene)

| Event                   | Data                        | Purpose                                     |
| ----------------------- | --------------------------- | ------------------------------------------- |
| `'goldChanged'`         | `(oldGold, newGold)`        | Update gold display                         |
| `'livesChanged'`        | `(oldLives, newLives)`      | Update lives display                        |
| `'waveChanged'`         | `(currentWave, totalWaves)` | Update wave counter                         |
| `'towerTypeDeselected'` | `()`                        | Clear tower selection state                 |
| `'waveComplete'`        | `(waveNum, totalWaves)`     | Triggers between-wave countdown timer in UI |
| `'showCombo'`           | `(comboCount: number)`      | Display combo kill counter in UI            |
| `'showWaveBonus'`       | `(amount: number)`          | Display wave completion bonus text in UI    |

### UIScene → Game Scene (via events on game scene)

| Event                   | Data               | Purpose                          |
| ----------------------- | ------------------ | -------------------------------- |
| `'towerTypeSelected'`   | `(typeId: string)` | Player selected a tower to place |
| `'towerTypeDeselected'` | `()`               | Player cancelled tower selection |

---

## 12. Built-in Controls

| Input                                   | Action                                        |
| --------------------------------------- | --------------------------------------------- |
| Left Click (empty buildable cell)       | Place selected tower                          |
| Left Click (existing tower)             | Triggers `onTowerClicked()` hook              |
| Right Click / ESC (with tower selected) | Cancel tower selection                        |
| ESC (no tower selected)                 | Open pause menu                               |
| Spacebar                                | Skip to next wave (during between-wave timer) |

### Projectile Custom Properties

Projectiles can carry custom data via `(projectile as any).propertyName`. Built-in properties recognized automatically:

| Property       | Type          | Effect                                                                                             |
| -------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `damage`       | `number`      | Damage dealt to enemy (default: 10)                                                                |
| `splashRadius` | `number`      | If set, deals damage to enemies within radius (with distance falloff: 100% at center, 50% at edge) |
| `homingTarget` | `BaseTDEnemy` | Set automatically when `TowerTypeConfig.homing = true`. Projectile tracks this target each frame   |
| `homingSpeed`  | `number`      | Set automatically when `TowerTypeConfig.homing = true`. Speed for homing velocity updates          |

Custom properties (handled in `onProjectileHitEnemy` override):

| Property       | Type     | Example Use                                  |
| -------------- | -------- | -------------------------------------------- |
| `slowAmount`   | `number` | Speed multiplier for slow effect (e.g., 0.5) |
| `slowDuration` | `number` | Duration of slow in ms                       |

---

## 13. Visual Helpers

- **Tower Slots**: Call `drawTowerSlots()` in `createEnvironment()` and assign result to `this.towerSlotGroup`. Slots are **hidden by default** (alpha 0.35) and automatically shown when the player selects a tower type (placement mode). Uses `tower_slot` texture if available; falls back to subtle rounded-rect graphic. This replaces the need for `drawBuildableMarkers()`.
- **Path Line**: Call `drawPathLine()` in `createEnvironment()` to show the enemy route. Uses `this.pathWaypoints` (available after grid init). Increase `lineWidth` and `alpha` for better visibility against busy backgrounds.
- **Buildable Markers**: Call `drawBuildableMarkers()` in `createEnvironment()` to show tower-placeable cells with dashed borders. **Not needed** when using `drawTowerSlots()` -- the tower slots serve the same purpose with better visuals.
- **Floating Text**: Call `showFloatingText()` in hooks like `onEnemyKilled()` for reward popups. Color parameter is a CSS string (e.g., `'#FFD700'`), NOT a hex number.
- **Wave Countdown**: UIScene automatically shows a countdown timer between waves. No code needed.
- **Tower Hover Range**: Hovering over a placed tower automatically displays its attack range circle. Override `getRangeCircleColor()` in tower subclasses for type-specific colors.
- **Tower Fire Animation**: Towers automatically play a subtle scale pulse when firing. Override `playFireAnimation()` for custom effects. Do NOT call `playFireAnimation()` inside `onFire()` -- it is already called by `BaseTower.fire()` before `onFire()`.
- **Projectile Hit Effect**: Projectile impacts show a brief scale-up + fade-out visual. Override `playProjectileHitEffect()` in level scene for custom effects.
- **Combo Kill Display**: Emit `'showCombo'` event from `onComboKill()` hook to display combo counter in UI.
- **Wave Bonus Display**: Emit `'showWaveBonus'` event from `onWaveComplete()` hook to display wave bonus text in UI.
- **Tower Button Icons**: UIScene automatically extracts Phaser textures from `TowerTypeConfig.textureKey` and displays them as icons in the tower selection panel buttons. No additional code needed.
- **Controls Hint**: Displayed in the top-right corner (below pause button) with compact multi-line layout. Automatically included by UIScene.
