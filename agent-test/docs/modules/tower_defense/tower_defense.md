# Tower Defense Module Manual

> Implementation reference and code guide for the coding agent.
> For hook tables, system APIs, and capability reference → see `template_api.md`.
> For game design rules, map templates, and balance → see `design_rules.md`.

---

## 1. Template Guide

### Creating a Tower Type

1. **Read**: `src/towers/_TemplateTower.ts`
2. **Copy**: `cp _TemplateTower.ts ArrowTower.ts`
3. **Modify**:
   - Rename class to `ArrowTower`
   - Update `TOWER_CONFIG` → `ARROW_TOWER_CONFIG` with GDD values
   - Set `textureKey` (from asset-pack.json — must match Preloader key)
   - Set `cost`, `damage`, `range`, `fireRate`
   - Set `projectileKey` and `projectileSpeed`
   - Set `targetingMode` (`'first'` | `'last'` | `'closest'` | `'strongest'`)
   - Define `upgrades` array (level, cost, damage, range, fireRate)
   - Override hooks as needed (`onFire`, `onUpgrade`, `createProjectile`)
4. **Export** the config object AND class from the file
5. **Add** to `towers/index.ts` barrel exports

### Creating an Enemy Type

1. **Read**: `src/enemies/_TemplateTDEnemy.ts`
2. **Copy**: `cp _TemplateTDEnemy.ts Goblin.ts`
3. **Modify**:
   - Rename class to `Goblin`
   - Update `ENEMY_CONFIG` with GDD values
   - Set `textureKey` (must match Preloader key)
   - Set `displayHeight` (see design_rules.md Section 4.3)
   - Set `stats.maxHealth`, `stats.speed`, `stats.reward`, `stats.damage`
   - Override hooks as needed (`onSpawn`, `onDamageTaken`, `onDeath`, `getAnimationKey`)
4. **Add** to `enemies/index.ts` barrel exports

### Creating an Obstacle Type

1. **Read**: `src/entities/_TemplateObstacle.ts`
2. **Copy**: `cp _TemplateObstacle.ts TreeObstacle.ts`
3. **Modify**:
   - Rename class to `TreeObstacle`
   - Update `OBSTACLE_CONFIG` with GDD values
   - Set `textureKey` (must match Preloader key)
   - Set `displayHeight`, `maxHealth`, `reward`
   - Override hooks as needed (`onClicked`, `onDamaged`, `onDestroyed`, `getClickDamage`)
4. **Place** obstacles in level scene's `onPostCreate()` hook
5. **Add** to `entities/index.ts` barrel exports

### Creating a Level

1. **Read**: `src/scenes/_TemplateTDLevel.ts`
2. **Copy**: `cp _TemplateTDLevel.ts Level1.ts`
3. **Modify**:
   - Rename class to `Level1`
   - Update constructor scene key: `super({ key: 'Level1' })`
   - Implement all 6 abstract methods (see Section 2)
   - Import your tower/enemy classes at the top
   - Override hooks as needed
4. **Register** in `main.ts`:
   ```typescript
   import Level1 from './scenes/Level1';
   // In game config scene array:
   game.scene.add('Level1', Level1);
   ```
5. **Register** in `LevelManager.ts`:
   ```typescript
   static readonly LEVEL_ORDER: string[] = ['Level1'];
   ```

---

## 2. Abstract Method Implementation Guide

### 2.1 getGridConfig()

Returns the grid layout. Use CellType enum values.

```typescript
import { CellType } from '../utils';

protected getGridConfig(): GridConfig {
  const cellSize = CONFIG.towerDefenseConfig.cellSize.value;
  const screenW = CONFIG.screenSize.width.value;
  const screenH = CONFIG.screenSize.height.value;
  const cols = 12;
  const rows = 10;
  const mapW = cols * cellSize;
  const mapH = rows * cellSize;
  const offsetX = Math.floor((screenW - mapW) / 2);
  const offsetY = Math.floor((screenH - mapH) / 2);

  const cells: CellType[][] = [
    // From GDD Section 4 — map grid
    // S=SPAWN(3), P=PATH(1), E=EXIT(4), B=BUILDABLE(0), X=BLOCKED(2)
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    [3, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 2],
    [2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2],
    // ... rest of grid
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  ];
  return { cols, rows, cellSize, cells, offsetX, offsetY };
}
```

**CRITICAL**:

- Use number literals (0-4), not enum names, in the cells array. The enum is for readability in other code.
- When the grid is smaller than `screenSize`, calculate `offsetX`/`offsetY` to center the map. This ensures the game fills the entire screen with the background while the gameplay grid is centered.
- Cells that will have obstacles placed on them should be pre-marked as BLOCKED (2) in the grid, not changed later in `onPostCreate()`. This ensures tower slots and buildable markers are correct from the start.

### 2.2 getPathWaypoints()

Returns ordered waypoints in grid coordinates. Only turns need waypoints — enemies move in straight lines between them.

```typescript
protected getPathWaypoints(): PathPoint[] {
  return [
    { gridX: 0, gridY: 1 },   // spawn point
    { gridX: 3, gridY: 1 },   // first turn
    { gridX: 3, gridY: 3 },   // second turn
    // ... more waypoints
    { gridX: 11, gridY: 7 },  // exit point
  ];
}
```

**CRITICAL**: First waypoint must be on SPAWN cell. Last must be on EXIT cell. All intermediate waypoints must be on PATH cells.

### 2.3 createEnvironment()

Sets up the visual layer. The grid logic is already initialized.

```typescript
protected createEnvironment(): void {
  const screenW = CONFIG.screenSize.width.value;
  const screenH = CONFIG.screenSize.height.value;

  // Background image — stretch to FULL SCREEN (not just grid area)
  if (textureExists(this, 'level1_bg')) {
    const bg = this.add.image(0, 0, 'level1_bg').setOrigin(0, 0);
    bg.setDisplaySize(screenW, screenH);
    bg.setDepth(-10);
  }

  // Tower slot visuals: hidden by default, shown when player selects a tower type
  this.towerSlotGroup = drawTowerSlots(
    this, this.cells, this.cellSize, this.gridOffsetX, this.gridOffsetY
  );

  // Draw the enemy path with increased visibility for busy backgrounds
  drawPathLine(this, this.pathWaypoints, 6, 0xd4a574, 0.5);
}
```

**IMPORTANT**:

- Background image is stretched to `screenSize`, NOT to grid dimensions. When the grid is smaller than the screen, use `offsetX`/`offsetY` in `getGridConfig()` to center the map.
- Tower slots start hidden and are automatically shown/hidden by BaseTDScene when the player enters/exits placement mode. Assign the result to `this.towerSlotGroup`.
- `drawPathLine` is essential because AI-generated backgrounds do not encode path information. Use increased `lineWidth` (6+) and `alpha` (0.5+) for visibility.
- `drawBuildableMarkers` is **not needed** when using tower slots — the slot system provides better UX by only showing placement options during placement mode.

### 2.4 getWaveDefinitions()

Returns all waves. See design_rules.md Section 5 for balance.

```typescript
protected getWaveDefinitions(): WaveDefinition[] {
  return [
    {
      preDelay: 2000,
      groups: [{ enemyType: 'goblin', count: 5, interval: 1200 }],
      reward: 10,
    },
    {
      groups: [
        { enemyType: 'goblin', count: 8, interval: 1000 },
      ],
      reward: 15,
    },
    {
      groups: [
        { enemyType: 'goblin', count: 6, interval: 800 },
        { enemyType: 'scout', count: 3, interval: 500 },
      ],
      reward: 20,
    },
  ];
}
```

**IMPORTANT**: `enemyType` strings must match the `case` labels in `createEnemy()`.

### 2.5 getTowerTypes()

Returns available tower configs. Import from tower files.

```typescript
import { ARROW_TOWER_CONFIG } from '../towers/ArrowTower';
import { CANNON_TOWER_CONFIG } from '../towers/CannonTower';

protected getTowerTypes(): TowerTypeConfig[] {
  return [ARROW_TOWER_CONFIG, CANNON_TOWER_CONFIG];
}
```

### 2.6 createEnemy() — Factory Method

Maps type strings to actual enemy subclass instances.

```typescript
import { Goblin } from '../enemies/Goblin';
import { Scout } from '../enemies/Scout';

protected createEnemy(enemyType: string): BaseTDEnemy | null {
  switch (enemyType) {
    case 'goblin': return new Goblin(this, 0, 0);
    case 'scout': return new Scout(this, 0, 0);
    default:
      console.warn(`Unknown enemy type: ${enemyType}`);
      return null;
  }
}
```

**CRITICAL**: The position (0, 0) is correct — `setPath()` repositions the enemy to the first waypoint.

---

## 3. Import Guide

### Utility Imports

All utilities are in a single `utils.ts` file:

```typescript
// All utilities (core + TD-specific)
import * as utils from '../utils';
// Usage: utils.gridToWorld(...), utils.safeAddSound(...), utils.addOverlap(...)

// Or named imports
import {
  CellType,
  gridToWorld,
  worldToGrid,
  isValidPlacement,
  getPathLength,
  getPositionAlongPath,
  getDirectionBetween,
  createRangeIndicator,
  createProjectile,
  launchProjectileAt,
  PROJECTILE_SIZES,
  drawGridOverlay,
  drawPathLine,
  drawTowerSlots,
  drawBuildableMarkers,
  showFloatingText,
  textureExists,
  safeAddSound,
  initScale,
} from '../utils';
```

### Type Imports

Always use `import type` for interfaces:

```typescript
import type { GridConfig, PathPoint } from './BaseTDScene';
import type { TowerTypeConfig, TowerUpgrade } from '../towers/BaseTower';
import type { TDEnemyConfig } from '../enemies/BaseTDEnemy';
import type { ObstacleConfig } from '../entities/BaseObstacle';
import type { BaseObstacle } from '../entities/BaseObstacle';
import type { WaveDefinition, WaveGroup } from '../systems/WaveManager';
```

### Config Import

```typescript
import * as CONFIG from '../gameConfig.json';
// Usage: CONFIG.towerDefenseConfig.startingGold.value
```

---

## 4. Cross-Script Consistency Rules

### Scene Keys

- Scene keys in constructor MUST match `main.ts` registration and `LevelManager.ts` order
- UIScene is always `'UIScene'`, PauseUIScene is `'PauseUIScene'`, etc.
- Level scenes: `'Level1'`, `'Level2'`, etc.

### Config Keys

- All config values accessed via `CONFIG.towerDefenseConfig.{key}.value`
- Tower stats defined in `TowerTypeConfig` objects, not in gameConfig.json
- Enemy stats defined in `TDEnemyConfig` objects, not in gameConfig.json

### Asset Keys

- Tower textures: `tower_{type}` (e.g., `tower_arrow`, `tower_cannon`)
- Tower upgrade textures: `tower_{type}_lv{N}` (e.g., `tower_arrow_lv2`)
- Enemy textures: `enemy_{type}` (e.g., `enemy_goblin`, `enemy_scout`)
- Projectiles: `proj_{type}` (dedicated image per tower type -- each projectile must have its own distinct asset)
- Tower slots: `tower_slot` (empty placement indicator, if using slot-based placement)
- Obstacles: `obstacle_{type}` (e.g., `obstacle_tree`, `obstacle_rock`)
- Defense target: `defense_target` (the object being defended, if visible)
- Background: `{level}_bg` (e.g., `level1_bg`)
- SFX: `sfx_{action}` (e.g., `sfx_fire`, `sfx_place`, `sfx_death`, `sfx_combo`, `sfx_break`)

### Enemy Type String Mapping

The `enemyType` string in `WaveGroup` MUST match the `case` in `createEnemy()`:

```
WaveGroup.enemyType = 'goblin'  →  createEnemy('goblin')  →  new Goblin(...)
```

---

## 5. UIScene Event Protocol

The game scene and UI communicate via events. This is automatic — BaseTDScene handles event wiring.

### What the agent needs to do:

1. **Nothing for events** — BaseTDScene wires all events automatically
2. **Tower panel** — UIScene reads tower types from `init(data)` and `towerTypesReady` event
3. **Custom UI** — Override `UIScene.createDOMUI()` only if the game needs non-standard HUD elements

### Event Flow Diagram

```
[UIScene] ─── towerTypeSelected(typeId) ───→ [BaseTDScene]
                                               ↓ (placement click)
                                             placeTower()
                                               ↓
                                             goldChanged(old, new)
[UIScene] ←── goldChanged ──────────────── [BaseTDScene]
[UIScene] ←── livesChanged ─────────────── [BaseTDScene]
[UIScene] ←── waveChanged ──────────────── [BaseTDScene]
```

---

## 6. Implementing Special Tower Effects

### 6.1 Splash Damage Tower (AOE)

Set `splashRadius` on the projectile in `createProjectile()`:

```typescript
export class CannonTower extends BaseTower {
  protected createProjectile(
    target: BaseTDEnemy,
  ): Phaser.Physics.Arcade.Sprite | null {
    const proj = createProjectile(
      this.scene,
      this.x,
      this.y,
      this.projectileKey,
      16,
      this.currentDamage,
    );
    (proj as any).splashRadius = 60;
    return proj;
  }
}
```

The base `onProjectileHitEnemy` in `BaseTDScene` automatically checks for `splashRadius` and deals damage to all enemies within that radius.

### 6.2 Slow Tower (Debuff)

Set slow properties on the projectile, then override `onProjectileHitEnemy` in the level scene:

```typescript
// In your tower subclass:
export class IceTower extends BaseTower {
  protected createProjectile(target: BaseTDEnemy): Phaser.Physics.Arcade.Sprite | null {
    const proj = createProjectile(this.scene, this.x, this.y, this.projectileKey, 10, this.currentDamage);
    (proj as any).slowAmount = 0.5;     // 50% speed
    (proj as any).slowDuration = 2000;  // 2 seconds
    return proj;
  }
}

// In your level scene:
protected onProjectileHitEnemy(
  projectile: Phaser.Physics.Arcade.Sprite,
  enemy: BaseTDEnemy
): void {
  super.onProjectileHitEnemy(projectile, enemy);

  const slowAmount = (projectile as any).slowAmount as number | undefined;
  const slowDuration = (projectile as any).slowDuration as number | undefined;
  if (slowAmount !== undefined && slowDuration !== undefined) {
    enemy.applyStatusEffect('slow', slowAmount, slowDuration, 0x4488ff);
  }
}
```

**IMPORTANT**: Call `super.onProjectileHitEnemy()` first — it handles damage and destroys the projectile. Read the slow properties BEFORE calling super if the projectile reference is needed after destruction.

Actually, since `super` destroys the projectile, read properties first:

```typescript
protected onProjectileHitEnemy(
  projectile: Phaser.Physics.Arcade.Sprite,
  enemy: BaseTDEnemy
): void {
  const slowAmount = (projectile as any).slowAmount as number | undefined;
  const slowDuration = (projectile as any).slowDuration as number | undefined;

  super.onProjectileHitEnemy(projectile, enemy);

  if (slowAmount !== undefined && slowDuration !== undefined) {
    enemy.applyStatusEffect('slow', slowAmount, slowDuration, 0x4488ff);
  }
}
```

### 6.3 Splash Damage with Distance Falloff

Splash damage now attenuates with distance from the impact point. Enemies at the center take full damage; those at the edge of the splash radius take 50%. This is automatic when using `splashRadius` on projectiles -- no additional code is needed.

The falloff formula: `actualDamage = baseDamage * (1 - (distance / splashRadius) * 0.5)`

### 6.4 Custom Projectile Hit Effects

Override `playProjectileHitEffect()` in your level scene to customize the visual effect when projectiles hit enemies:

```typescript
protected playProjectileHitEffect(projectile: Phaser.Physics.Arcade.Sprite): void {
  const towerType = (projectile as any).towerType as string | undefined;

  if (towerType === 'ice') {
    // Custom ice burst effect
    const burst = this.add.circle(projectile.x, projectile.y, 20, 0x4488ff, 0.6);
    burst.setDepth(150);
    this.tweens.add({
      targets: burst,
      scaleX: 2, scaleY: 2, alpha: 0,
      duration: 300,
      onComplete: () => burst.destroy(),
    });
  } else {
    super.playProjectileHitEffect(projectile);
  }
}
```

### 6.5 Tower Fire Animation

Towers automatically play a scale pulse when firing. Override `playFireAnimation()` in tower subclasses for custom effects:

```typescript
export class CannonTower extends BaseTower {
  protected playFireAnimation(): void {
    // Heavier recoil for cannon
    this.scene.tweens.add({
      targets: this,
      scaleX: this.scaleX * 1.25,
      scaleY: this.scaleY * 0.85,
      duration: 100,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }
}
```

### 6.6 Tower Range Circle Color

Override `getRangeCircleColor()` in tower subclasses to set type-specific hover range colors:

```typescript
export class IceTower extends BaseTower {
  protected getRangeCircleColor(): number {
    return 0x4488ff; // blue for ice
  }
}
```

### 6.7 Combo Kill System

The base scene tracks rapid sequential kills. Override `onComboKill()` to award bonuses and show UI:

```typescript
protected onComboKill(comboCount: number): void {
  const bonus = comboCount * 2;
  this.economyManager.earn(bonus);
  this.events.emit('showCombo', comboCount);
  showFloatingText(this, this.scale.width / 2, 100,
    `COMBO x${comboCount}! +${bonus}g`, '#FF8800', 20, 1200, 50);
}
```

### 6.8 Wave Bonus UI

Show wave completion feedback via the UI event:

```typescript
protected onWaveComplete(waveNumber: number): void {
  const wave = this.getWaveDefinitions()[waveNumber - 1];
  this.events.emit('showWaveBonus', wave?.reward ?? 0);
}
```

### 6.9 Homing Tower (Tracking Projectiles)

Set `homing: true` in the tower config. No code override needed — BaseTower and BaseTDScene handle everything:

```typescript
export const ARROW_TOWER_CONFIG: TowerTypeConfig = {
  id: 'arrow_tower',
  name: 'Arrow Tower',
  textureKey: 'tower_arrow',
  cost: 50,
  damage: 10,
  range: 150,
  fireRate: 1.0,
  projectileKey: 'proj_arrow', // custom projectile image (auto-scaled to 16px)
  projectileSpeed: 300,
  homing: true, // projectile tracks target each frame
  targetingMode: 'first',
};
```

When `homing: true`:

- `fire()` attaches `homingTarget` and `homingSpeed` to the projectile
- `updateProjectiles()` in BaseTDScene adjusts velocity toward the target each frame
- If the target dies mid-flight, the projectile is destroyed
- Target prediction (lead shots) is automatically disabled since homing handles tracking

### 6.10 Tower Slot Visuals

Tower slots are rendered automatically in `createEnvironment()` via `drawTowerSlots()`. If a `tower_slot` asset exists, it is used as an image; otherwise a rounded-rect graphic is drawn as fallback.

```typescript
// In createEnvironment():
this.towerSlotGroup = drawTowerSlots(
  this,
  this.cells,
  this.cellSize,
  this.gridOffsetX,
  this.gridOffsetY,
);
```

The `tower_slot` asset should be a `type: "image"` asset at ~64\*64 resolution matching the cell size. It is purely decorative and does not affect gameplay logic.

### 6.11 Destructible Obstacles

Place obstacles in `onPostCreate()` and handle their destruction:

```typescript
import { TreeObstacle } from '../entities/TreeObstacle';

protected onPostCreate(): void {
  const obs1 = new TreeObstacle(this, 300, 200);
  this.obstaclesGroup.add(obs1);

  const obs2 = new TreeObstacle(this, 500, 400);
  this.obstaclesGroup.add(obs2);
}

protected onObstacleDestroyed(obstacle: BaseObstacle): void {
  // Convert the cell to BUILDABLE so a tower can be placed there
  const grid = worldToGrid(obstacle.x, obstacle.y,
    this.cellSize, this.gridOffsetX, this.gridOffsetY);
  if (grid.gridY >= 0 && grid.gridY < this.cells.length &&
      grid.gridX >= 0 && grid.gridX < this.cells[0].length) {
    this.cells[grid.gridY][grid.gridX] = CellType.BUILDABLE;
  }
  showFloatingText(this, obstacle.x, obstacle.y, '+15g', '#FFD700');
}
```

**IMPORTANT**: Obstacles should be placed on BLOCKED cells. When destroyed, converting the cell to BUILDABLE creates a strategic choice: invest clicks now for more tower positions later.

### 6.12 Tower Click Interaction (Upgrade/Sell)

Override `onTowerClicked` in the level scene to handle clicking on placed towers:

```typescript
protected onTowerClicked(tower: BaseTower): void {
  if (tower.canUpgrade()) {
    this.upgradeTower(tower);
  }
}
```

For more complex UI (showing upgrade cost, sell button), emit an event to UIScene or create a DOM popup.

### 6.13 Hook Examples

#### onEnemyKilled -- Reward Popup

Override `onEnemyKilled` in your level scene to show floating reward text when an enemy dies:

```typescript
protected onEnemyKilled(enemy: BaseTDEnemy): void {
  super.onEnemyKilled(enemy);

  // Show a floating gold reward popup at the enemy's position
  showFloatingText(this, enemy.x, enemy.y, '+' + enemy.killReward, '#FFD700');
}
```

**Note**: `BaseTDEnemy` exposes a public `killReward` getter that returns the gold reward value for killing that enemy (from `stats.reward` in the enemy config). Use this getter instead of accessing the config directly.

#### Tower Projectile Leading (Automatic)

Towers now automatically predict target movement when firing (lead shots). Projectiles aim at where the enemy will be, not where it currently is. This significantly improves projectile accuracy against fast-moving enemies. No code changes are needed in tower subclasses or level scenes -- this behavior is built into the base tower firing logic.

---

## 7. Common Mistakes

### ❌ Forgetting to register scene in main.ts

Every level scene must be added:

```typescript
game.scene.add('Level1', Level1);
```

### ❌ Forgetting to add scene key to LevelManager

```typescript
static readonly LEVEL_ORDER: string[] = ['Level1', 'Level2'];
```

### ❌ Mismatched enemy type strings

If `WaveGroup` uses `'goblin'` but `createEnemy()` has `case 'basic'`, enemies won't spawn.

### ❌ Wrong waypoint order

Waypoints must go from SPAWN to EXIT. Reversed order means enemies walk backward.

### ❌ Placing buildable cells where a tower already exists

The template handles this automatically via `towerGrid` Map — no extra code needed.

### ❌ Using `new BaseTower()` instead of custom subclass

If you defined custom tower classes (e.g., `ArrowTower`), override `createTower()` in the level to use them. Otherwise hooks in your tower subclass won't fire.

### ❌ Not exporting tower config

Each tower file should export BOTH the config object AND the class:

```typescript
export const ARROW_TOWER_CONFIG: TowerTypeConfig = { ... };
export class ArrowTower extends BaseTower { ... }
```

### ❌ Reading projectile properties after super.onProjectileHitEnemy()

`super.onProjectileHitEnemy()` destroys the projectile. Read custom properties (slowAmount, etc.) BEFORE calling super.

### ❌ Forgetting to call drawTowerSlots/drawPathLine in createEnvironment()

Without these calls, players cannot see the enemy path or valid tower positions on the AI-generated background. The background image alone does not convey gameplay-relevant information. Always call both after setting up the background:

```typescript
this.towerSlotGroup = drawTowerSlots(
  this,
  this.cells,
  this.cellSize,
  this.gridOffsetX,
  this.gridOffsetY,
);
drawPathLine(this, this.pathWaypoints, 6, 0xd4a574, 0.5);
```

Tower slots are hidden by default and auto-shown during placement mode. `drawBuildableMarkers` is not needed when using tower slots.

### ❌ Stretching background to grid size instead of screen size

The background should fill the entire screen (`screenSize.width/height`), not just the grid area. When the grid is smaller than the screen, use `offsetX`/`offsetY` in `getGridConfig()` to center the map:

```typescript
bg.setDisplaySize(
  CONFIG.screenSize.width.value,
  CONFIG.screenSize.height.value,
);
```

### ❌ Marking obstacle cells as BLOCKED in onPostCreate instead of getGridConfig

Obstacle cells should be pre-marked as BLOCKED (2) directly in the `getGridConfig()` cells array. Changing cells in `onPostCreate()` causes tower slots and buildable markers to render incorrectly because they are drawn before `onPostCreate()` runs.

### ❌ Not implementing onTowerClicked

Without overriding `onTowerClicked()`, clicking on placed towers does nothing. Always implement upgrade/sell logic:

```typescript
protected onTowerClicked(tower: BaseTower): void {
  if (tower.canUpgrade()) {
    this.upgradeTower(tower);
  } else {
    this.sellTower(tower);
  }
}
```

### ❌ Passing hex number to showFloatingText color parameter

`showFloatingText()` expects a CSS color **string** (e.g., `'#FFD700'`), NOT a Phaser hex number (e.g., `0xffd700`). Passing a number will display broken text colors:

```typescript
// WRONG:
showFloatingText(this, x, y, '+10', 0xffd700);
// CORRECT:
showFloatingText(this, x, y, '+10', '#FFD700');
```

### ❌ Calling playFireAnimation() inside onFire() hook

`BaseTower.fire()` already calls `playFireAnimation()` before `onFire()`. Calling it again inside `onFire()` causes a double animation:

```typescript
// WRONG:
protected onFire(target: BaseTDEnemy): void {
  safeAddSound(this.scene, 'sfx_spit', { volume: 0.4 });
  this.playFireAnimation(); // Double animation!
}
// CORRECT:
protected onFire(target: BaseTDEnemy): void {
  safeAddSound(this.scene, 'sfx_spit', { volume: 0.4 });
}
```

### ❌ Using the same projectile image for all tower types

Each tower type should have a dedicated projectile image with a distinct shape and color. Using the generic `tower_bullet` for all towers makes it impossible for players to tell which tower fired which projectile. Always set `projectileKey` to a unique `proj_{type}` asset.

### ❌ Placing obstacles on PATH or BUILDABLE cells

Obstacles should only be placed on cells pre-marked as BLOCKED in `getGridConfig()`. Placing them on PATH cells would block enemies; placing them on BUILDABLE cells wastes a tower position. Mark the obstacle cells as BLOCKED in the grid definition, then place the obstacle sprites in `onPostCreate()`.

### ❌ Forgetting homing: true for tracking towers

If the GDD specifies homing/tracking projectiles, set `homing: true` in the `TowerTypeConfig`. Do NOT try to implement homing manually — the template handles it automatically in `BaseTower.fire()` and `BaseTDScene.updateProjectiles()`.

### ❌ Hardcoding projectile size instead of using auto-sizing

`createProjectile()` automatically uses 20px (`PROJECTILE_SIZES.ARROW`) for custom textures and 10px for `tower_bullet`. Do NOT pass a manual size unless you specifically need a non-standard size (e.g., `PROJECTILE_SIZES.CANNONBALL` for splash towers).

### ❌ Enemy sprites overlapping on spawn

When enemy display sizes are large (60-140px), the default wave `interval` may be too short, causing sprites to visually overlap. Override `getMinSpawnInterval()` in your level class to enforce a safe gap:

```typescript
protected getMinSpawnInterval(): number {
  // largest enemy is 96px tall, slowest speed is 40px/s
  // 96/40 * 1000 * 1.2 = 2880ms -- but that's too slow for gameplay
  // Use a balanced value that prevents overlap for most enemies:
  return 900;
}
```

The formula `(displayHeight / speed) * 1000` gives the exact time for an enemy to move one body-length. Multiply by 1.2 for a comfortable gap.

### ❌ Level rotation not working (always shows "No next level found")

`BaseTDScene.onAllWavesComplete()` automatically routes to `VictoryUIScene` (if next level exists in `LevelManager.LEVEL_ORDER`) or `GameCompleteUIScene` (if last level). The most common cause of failure is forgetting to add the level key to `LevelManager.LEVEL_ORDER`:

```typescript
// LevelManager.ts -- UPDATE this array
static readonly LEVEL_ORDER: string[] = [
  'Level1',  // must match the scene key exactly
  'Level2',  // add more levels here
];
```

The scene key in `LEVEL_ORDER` must exactly match the key passed to `super({ key: 'Level1' })` in the level constructor.

### ❌ Modifying KEEP files

Never modify `BaseTDScene.ts`, `BaseTower.ts`, `BaseTDEnemy.ts`, `BaseObstacle.ts`, `WaveManager.ts`, `EconomyManager.ts`, or `utils.ts`. Only modify COPY templates and UPDATE files.

---

## 8. Operation Checklist

When implementing a tower defense game from a GDD, follow this order:

### Phase 5 Steps (in order):

1. **Read** GDD Section 4 (enemy table, tower table, map grid, waves)
2. **Create tower types** — COPY `_TemplateTower.ts` for each tower, fill stats
3. **Create enemy types** — COPY `_TemplateTDEnemy.ts` for each enemy, fill stats
4. **Create obstacle types** (if GDD includes them) — COPY `_TemplateObstacle.ts` for each obstacle
5. **Create level scene** — COPY `_TemplateTDLevel.ts`, implement all 6 abstract methods
6. **Update** `main.ts` — import and register level scene
7. **Update** `LevelManager.ts` — add scene key to `LEVEL_ORDER`
8. **Update** `gameConfig.json` — add any game-specific config values
9. **Update** `Preloader.ts` — ensure all tower/enemy/projectile/obstacle/background assets are loaded

### Verification:

- [ ] All tower `textureKey` values have corresponding assets in Preloader
- [ ] All enemy `textureKey` values have corresponding assets in Preloader
- [ ] Each tower type has a dedicated `projectileKey` with a distinct projectile asset (not shared `tower_bullet`)
- [ ] All `enemyType` strings in waves match `createEnemy()` cases
- [ ] Tower configs exported and imported in level's `getTowerTypes()`
- [ ] Enemy classes imported in level's `createEnemy()`
- [ ] Scene key matches between constructor, main.ts, and LevelManager
- [ ] Path waypoints start at SPAWN cell and end at EXIT cell
- [ ] All BUILDABLE cells are reachable by mouse clicks
- [ ] Grid dimensions match the actual cells array size
- [ ] If using slow towers: `onProjectileHitEnemy` override reads properties BEFORE calling super
- [ ] If using splash towers: `splashRadius` set on projectile in `createProjectile()`
- [ ] If using `onTowerClicked`: upgrade/sell logic implemented in level scene
- [ ] If using obstacles: placed on BLOCKED cells, `onObstacleDestroyed` converts cell to BUILDABLE
- [ ] If using combos: `onComboKill` emits `'showCombo'` event for UI display
- [ ] If using wave bonus UI: `onWaveComplete` emits `'showWaveBonus'` event
- [ ] Tower subclasses override `getRangeCircleColor()` for type-specific range colors
- [ ] If using homing towers: `homing: true` set in `TowerTypeConfig` (no manual code needed)
- [ ] `drawTowerSlots()` called in `createEnvironment()` and result assigned to `this.towerSlotGroup`
- [ ] Each tower's `projectileKey` points to a valid asset or falls back to `tower_bullet` automatically
- [ ] Background image scaled to grid dimensions: `bg.setDisplaySize(cols * cellSize, rows * cellSize)`
