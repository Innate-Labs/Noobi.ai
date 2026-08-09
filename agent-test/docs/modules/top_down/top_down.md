# Top-Down Module Manual

> Implementation reference and code guide for the coding agent.
> For behavior tables, hook tables, and capability reference → see `template_api.md`.
> For game design rules and ASCII map templates → see `design_rules.md`.

---

## 1. Template Guide

### Creating Player

1. **Read**: `src/characters/_TemplatePlayer.ts`
2. **Copy**: `cp _TemplatePlayer.ts Player.ts`
3. **Modify**:
   - Rename class to `Player`
   - Update `textureKey` (from asset-pack.json — MUST be IMAGE key, first frame)
   - Update `stats` (from gameConfig.json `playerConfig`)
   - Update `animKeys` (from animations.json)
   - Configure `combat` (melee range/width, ranged key/speed)
   - Configure `dash` (speed, duration, cooldown)
   - Override hooks as needed (`onDamageTaken`, `onDeath`, etc.)

### Creating Enemies

1. **Read**: `src/characters/_TemplateEnemy.ts`
2. **Create**: New file `Enemy.ts` (do not rename template)
3. **Configure**:
   - Set `aiType`: `'patrol'` | `'chase'` | `'stationary'` | `'custom'`
   - Set `combat`: `hasMelee` and/or `hasRanged`
   - Override `getAnimationKey()` for auto-animation, OR manage manually in `onUpdate()`
   - Override `onDeath()` for death effects
   - Override `executeAI()` for boss logic
   - Call `enemy.setTarget(this.player)` after creation for chase AI

### Creating Boss (Custom AI)

```typescript
// In Boss.ts
protected override executeAI(): void {
  const player = (this.scene as any).player;
  if (!player || player.isDead) return;
  const distance = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

  // Phase 1: Ranged at distance
  if (this.health > this.maxHealth * 0.5) {
    if (distance < 400 && this.ranged?.canShoot()) {
      this.ranged.shootAt(player, 'enemyBullets');
    }
  }
  // Phase 2: Melee up close
  else {
    if (distance < 100 && this.melee?.canAttack()) {
      this.melee.startAttack();
    }
  }
}
```

**IMPORTANT**: For bosses with melee, add the melee trigger to `scene.enemyMeleeTriggers`:

```typescript
this.enemies.add(boss);
if (boss.meleeTrigger) {
  this.enemyMeleeTriggers.add(boss.meleeTrigger);
}
```

### Import Guide

All utilities live in a single `utils.ts` file:

```typescript
// All utilities (core + top-down specific)
import * as utils from '../utils';
// Usage: utils.initScale(...), utils.safeAddSound(...), utils.addCollider(...)
// Also:  utils.createBulletTextures(...), utils.createProjectileAtAngle(...), utils.angleToDirection(...)

// Or use named imports for specific functions
import {
  createBulletTextures,
  createProjectileAtAngle,
  scaleCollectible,
  COLLECTIBLE_SIZES,
} from '../utils';

// Behaviors (from barrel export)
import { ScreenEffectHelper } from '../behaviors';
```

### Creating Levels — Tilemap Mode

1. **Read**: `src/scenes/_TemplateLevel.ts`
2. **Copy**: `cp _TemplateLevel.ts Level1Scene.ts`
3. **Implement abstract methods** (called in this order by `createBaseElements()`):
   - `setupMapSize()` — Set `mapWidth`, `mapHeight` (called first)
   - `createEnvironment()` — Tilemap, decorations, obstacles (groups available)
   - `createEntities()` — Player, enemies, boss (`this.player` set here)
   - `setupCustomCollisions()` — Hook, called after entities exist
4. **Override hooks** for custom collisions, scoring, camera

### Creating Levels — Arena Mode

1. **Read**: `src/scenes/_TemplateArena.ts`
2. **Copy**: `cp _TemplateArena.ts SpaceLevel.ts`
3. **Implement abstract methods** (called in this order by `createBaseElements()`):
   - `createBackground()` — `this.setupScrollingBg('bg_key')` or solid color
   - `createEntities()` — Create player only (enemies are spawned, NOT pre-placed)
   - `spawnEnemy()` — Called by timer; create one enemy, add to `this.enemies`
4. **Override hooks** for scoring, spawning, difficulty, boss

### Preload Bullet Textures

If using ranged combat, add to `preload()`:

```typescript
import * as utils from '../utils';

preload(): void {
  utils.createBulletTextures(this);
}
```

### Dual Tileset Loading (CRITICAL)

Top-down games use **TWO tilemap JSONs** per level, generated from the same ASCII map:

- `level1_floor.json` — floor/walkable tiles (no collision)
- `level1_walls.json` — wall/barrier tiles (with collision)

Each JSON has a single tile layer named `"Ground"`. The floor JSON also has an `"Objects"` layer for spawn points.

Tileset naming convention: `{theme}_floor` and `{theme}_walls` (e.g., `dungeon_floor`, `dungeon_walls`).

```typescript
// In createEnvironment() — load BOTH tilemap JSONs
// 1. Floor map (walkable area, no collision)
const floorMap = this.make.tilemap({ key: 'level1_floor' });
this.floorTileset = floorMap.addTilesetImage('theme_floor', 'theme_floor')!;
this.floorLayer = floorMap.createLayer('Ground', this.floorTileset, 0, 0)!;
this.floorLayer.setDepth(-50);

// 2. Walls map (collision boundaries)
const wallsMap = this.make.tilemap({ key: 'level1_walls' });
this.wallsTileset = wallsMap.addTilesetImage('theme_walls', 'theme_walls')!;
this.wallsLayer = wallsMap.createLayer('Ground', this.wallsTileset, 0, 0)!;
this.wallsLayer.setCollisionByExclusion([-1, 0]);
this.wallsLayer.setDepth(0);

// 3. Store primary map for dimensions + object layer
this.map = floorMap;
const objectLayer = this.map.getObjectLayer('Objects');
const playerSpawn = objectLayer?.objects.find(
  (obj) => obj.type === 'player_spawn',
);
```

**Both** `floorLayer` and `wallsLayer` are **required** — `BaseLevelScene` uses `wallsLayer` for all collision setup (walls, bullets).

### Creating Obstacles & Decorations

Obstacles are **separate image assets** (NOT tilemap tiles) with physics bodies that block movement like walls. They are Y-sorted with characters. Place them at `O` positions from the tilemap's Objects layer:

```typescript
// In createEnvironment(), after tilemap setup:
const obstacleTextures = ['supply_crate', 'barrel'];
let idx = 0;
const objectLayer = this.map.getObjectLayer('Objects');
if (objectLayer) {
  for (const obj of objectLayer.objects) {
    if (obj.type === 'obstacle') {
      const key = obstacleTextures[idx % obstacleTextures.length];
      this.createObstacle(key, obj.x!, obj.y!, 48);
      idx++;
    }
  }
}

// Decorations (visual only, no physics):
utils.createDecoration(
  this,
  this.decorations,
  'computer_terminal',
  2 * 64,
  5 * 64,
  64,
);
```

The `createObstacle()` helper is in `_TemplateLevel.ts`:

```typescript
private createObstacle(key: string, x: number, y: number, height: number): Phaser.Physics.Arcade.Image {
  const obstacle = this.physics.add.image(x, y, key);
  utils.initScale(obstacle, { x: 0.5, y: 1.0 }, undefined, height, 0.8, 0.5);
  (obstacle.body as Phaser.Physics.Arcade.Body).setImmovable(true);
  (obstacle.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  (obstacle.body as Phaser.Physics.Arcade.Body).pushable = false;
  this.obstacles.add(obstacle);
  return obstacle;
}
```

---

## 2. PlayerConfig Interface

| Field                     | Type           | Description                                             |
| ------------------------- | -------------- | ------------------------------------------------------- |
| `textureKey`              | string         | Initial texture (IMAGE key from asset-pack)             |
| `displayHeight?`          | number         | Sprite height in pixels (default **64** = 1 tile)       |
| `bodyWidthFactor?`        | number         | Body width ratio 0-1 (default 0.5 — narrow feet hitbox) |
| `bodyHeightFactor?`       | number         | Body height ratio 0-1 (default 0.4 — short feet hitbox) |
| `stats.maxHealth`         | number         | From gameConfig                                         |
| `stats.walkSpeed`         | number         | From gameConfig                                         |
| `stats.attackDamage`      | number         | From gameConfig                                         |
| `stats.hurtingDuration?`  | number         | Hurt stun duration in ms (default 100)                  |
| `stats.invulnerableTime?` | number         | I-frames duration in ms (default 1000)                  |
| `movement.friction?`      | number         | 1 = instant stop, lower = slidey (default 1)            |
| `combat.meleeRange?`      | number         | Melee attack forward distance (default 80)              |
| `combat.meleeWidth?`      | number         | Melee attack perpendicular width (default 60)           |
| `combat.rangedKey?`       | string         | Projectile texture key (enables shooting)               |
| `combat.rangedSpeed?`     | number         | Projectile speed (default 600)                          |
| `combat.rangedCooldown?`  | number         | Ranged cooldown in ms (default 300)                     |
| `dash.dashSpeed?`         | number         | Dash speed (default 500)                                |
| `dash.dashDuration?`      | number         | Dash duration in ms (default 200)                       |
| `dash.cooldown?`          | number         | Dash cooldown in ms (default 1000)                      |
| `dash.invulnerable?`      | boolean        | I-frames during dash (default true)                     |
| `animKeys`                | PlayerAnimKeys | Animation key mappings                                  |

---

## 3. EnemyConfig Interface

| Field                         | Type    | Description                                              |
| ----------------------------- | ------- | -------------------------------------------------------- |
| `textureKey`                  | string  | Initial texture                                          |
| `displayHeight?`              | number  | Sprite height (default **64** = 1 tile; use 80 for boss) |
| `bodyWidthFactor?`            | number  | Body width ratio (default 0.5)                           |
| `bodyHeightFactor?`           | number  | Body height ratio (default 0.4)                          |
| `stats.maxHealth`             | number  | Enemy health                                             |
| `stats.speed`                 | number  | Movement speed                                           |
| `stats.damage`                | number  | Contact/attack damage                                    |
| `ai.type`                     | string  | `'patrol'` / `'chase'` / `'stationary'` / `'custom'`     |
| `ai.patrolArea?`              | object  | `{ minX, maxX, minY, maxY }`                             |
| `ai.directionChangeInterval?` | number  | ms between patrol direction changes (default 2000)       |
| `ai.detectionRange?`          | number  | Chase detection range                                    |
| `ai.giveUpDistance?`          | number  | Chase give-up distance                                   |
| `ai.stopDistance?`            | number  | Chase stop distance (default 50)                         |
| `combat.hasMelee?`            | boolean | Enable melee attacks                                     |
| `combat.meleeRange?`          | number  | Melee range (default 80)                                 |
| `combat.meleeWidth?`          | number  | Melee width (default 60)                                 |
| `combat.meleeCooldown?`       | number  | Melee cooldown (default 1000)                            |
| `combat.hasRanged?`           | boolean | Enable ranged attacks                                    |
| `combat.rangedKey?`           | string  | Projectile texture                                       |
| `combat.rangedCooldown?`      | number  | Ranged cooldown (default 2000)                           |

---

## 4. Animation Keys & Directional Sprites

### 4.1 Core Principle: Views Over Frames

In top-down view, **facing direction** is more visually important than animation frame count. Each action has **3 directional images** (front/back/side), each as a 1-frame animation. The `playAnimation()` hook resolves the correct direction at runtime.

### 4.2 Player (PlayerAnimKeys)

animKeys store **base keys** — `playAnimation()` maps them to directional variants:

| Key     | Base Default        | Resolved at Runtime                                     |
| ------- | ------------------- | ------------------------------------------------------- |
| `idle`  | `player_idle_anim`  | `player_idle_front_anim` / `_back_anim` / `_side_anim`  |
| `walk`  | `player_walk_anim`  | `player_walk_front_anim` / `_back_anim` / `_side_anim`  |
| `melee` | `player_melee_anim` | `player_melee_front_anim` / `_back_anim` / `_side_anim` |
| `shoot` | `player_shoot_anim` | `player_shoot_front_anim` / `_back_anim` / `_side_anim` |
| `dash`  | `player_dash_anim`  | `player_dash_front_anim` / `_back_anim` / `_side_anim`  |
| `die`   | `player_die_anim`   | `player_die_front_anim` (single direction)              |

### 4.3 playAnimation() Override (MANDATORY)

Every player class MUST override this hook:

```typescript
protected override playAnimation(animKey: string): void {
  const dir = this.facingDirection;
  const suffix = dir === 'down' ? '_front' : dir === 'up' ? '_back' : '_side';
  const directionalKey = animKey.replace('_anim', `${suffix}_anim`);

  if (this.scene.anims.exists(directionalKey)) {
    this.play(directionalKey, true);
  } else {
    this.play(animKey, true);  // Safe fallback
  }
  utils.resetOriginAndOffset(this, this.facingDirection);
}
```

### 4.4 Enemy (via getAnimationKey hook)

Enemies use `getAnimationKey(isMoving, facingDirection)` for direction-aware animations:

```typescript
protected override getAnimationKey(isMoving: boolean, facingDirection: string): string | null {
  const suffix = facingDirection === 'down' ? '_front' : facingDirection === 'up' ? '_back' : '_side';
  if (this.isDead) return 'trooper_die_front_anim';
  const action = isMoving ? 'walk' : 'idle';
  return `trooper_${action}${suffix}_anim`;
}
```

### 4.5 animations.json Format (CRITICAL — game will crash without this)

> The template ships with an EMPTY `animations.json` (`{"anims": []}`). You MUST populate it with entries for EVERY directional animation, or sprites will be invisible/frozen.

**Directional format** — each direction is a 1-frame animation:

```json
{
  "anims": [
    {
      "key": "hero_idle_front_anim",
      "type": "frame",
      "frames": [{ "key": "hero_idle_front", "duration": 400 }],
      "repeat": -1
    },
    {
      "key": "hero_idle_back_anim",
      "type": "frame",
      "frames": [{ "key": "hero_idle_back", "duration": 400 }],
      "repeat": -1
    },
    {
      "key": "hero_idle_side_anim",
      "type": "frame",
      "frames": [{ "key": "hero_idle_side", "duration": 400 }],
      "repeat": -1
    }
  ]
}
```

**Naming conventions (three-layer sync):**

- **Image key** (asset-pack.json): `{char}_{action}_{direction}` → `hero_idle_front`
- **Animation key** (animations.json): `{char}_{action}_{direction}_anim` → `hero_idle_front_anim`
- **Base animKey** (Player.ts): `idle: 'hero_idle_anim'` (resolved by `playAnimation()`)

**Direction values**: `front` (facing camera/down), `back` (facing away/up), `side` (right profile, flipX for left).

See `docs/asset_protocol.md#3.3` for full format details.

---

## 5. Scene Registration and LevelManager

### 5.1 LevelManager (CRITICAL)

The core `TitleScreen` calls `LevelManager.getFirstLevelScene()` to navigate after the player presses Enter. Default: `["Level1Scene"]`.

**You MUST update `LevelManager.ts`** to match your actual level scenes:

```typescript
// In LevelManager.ts
static readonly LEVEL_ORDER: string[] = [
  "DesertScene",     // First level
  "ForestScene",     // Second level
  "BossArenaScene",  // Final boss
];
```

| Pattern                | LEVEL_ORDER                                    |
| ---------------------- | ---------------------------------------------- |
| Single Level           | `["Level1Scene"]`                              |
| Multi-Level            | `["Level1Scene", "Level2Scene", "BossScene"]`  |
| Character Select first | `["CharacterSelectScene", "Level1Scene", ...]` |

**If `LEVEL_ORDER[0]` doesn't match a registered scene key, the game will CRASH with "Scene key not found".**

### 5.2 main.ts Scene Registration

```typescript
// Import ALL custom scenes
import { Level1Scene } from './scenes/Level1Scene';
import { Level2Scene } from './scenes/Level2Scene';
import { BossScene } from './scenes/BossScene';

// Register BEFORE UI scenes
game.scene.add('Level1Scene', Level1Scene);
game.scene.add('Level2Scene', Level2Scene);
game.scene.add('BossScene', BossScene);
```

**Every `scene.start('X')` call MUST have a matching `game.scene.add('X', X)` in main.ts.**

### 5.3 Registration Checklist

- [ ] `LevelManager.ts` — `LEVEL_ORDER` lists all level scenes in correct play order
- [ ] `main.ts` — Import and register ALL level scenes (+ `CharacterSelectScene` if using multi-character)
- [ ] Scene keys in `LEVEL_ORDER` match the `key` property in each scene class exactly
- [ ] Every `scene.start('X')` target has a matching registration

---

## 6. Base Class Lifecycle (EXECUTION ORDER)

**READ THIS before overriding any hooks.** The order matters.

### 6.1 BaseLevelScene.createBaseElements() (Tilemap Mode)

```
createBaseElements()
  -> onPreCreate()                  // HOOK
  -> setupMapSize()                 // ABSTRACT: set mapWidth, mapHeight
  -> worldWidth = mapWidth          // (auto-set)
  -> initializeGroups()             // Groups created (enemies, bullets, obstacles, etc.)
  -> createEnvironment()            // ABSTRACT: tilemap, decorations, obstacles
  -> createEntities()               // ABSTRACT: player, enemies
  -> createCrosshair()              // HOOK: custom cursor/crosshair
  -> setupCamera()                  // 2D follow with lerp, bounded to map
  -> setupWorldBounds()             // All 4 sides bounded to map
  -> setupInputs()                  // WASD, Shift, E, Space, Q, disable context menu
  -> configurePhysics()             // Zero gravity
  -> setupCoreCollisions()          // Contact damage, melee, bullets vs entities, obstacles
  -> setupWallCollisions()          // Tilemap walls: player/enemies/bullets vs wallsLayer
  -> setupCustomCollisions()        // HOOK
  -> scene.launch("UIScene")        // HUD overlay
  -> onPostCreate()                 // HOOK
```

### 6.1b BaseArenaScene.createBaseElements() (Arena Mode)

```
createBaseElements()
  -> onPreCreate()                  // HOOK
  -> worldWidth = screenWidth       // (auto-set from gameConfig)
  -> initializeGroups()             // Groups created (same groups as tilemap)
  -> createBackground()             // ABSTRACT: scrolling bg or static bg
  -> createEntities()               // ABSTRACT: create player, set spawner config
  -> createCrosshair()              // HOOK
  -> setupArenaCamera()             // Static, bounded to screen
  -> setupScreenBounds()            // Player confined to screen edges
  -> setupInputs()                  // Same input keys
  -> configurePhysics()             // Zero gravity
  -> setupCoreCollisions()          // Same entity-vs-entity collisions (NO wall collisions)
  -> setupCustomCollisions()        // HOOK
  -> scene.launch("UIScene")        // HUD overlay
  -> onPostCreate()                 // HOOK
```

**CRITICAL**: Groups are initialized BEFORE `createEnvironment()`/`createBackground()` — safe to add obstacles/decorations during setup.

### 6.2 baseUpdate() (Shared — both modes)

```
baseUpdate()
  -> onPreUpdate()                  // HOOK
  -> updateBackground()             // Virtual: no-op for tilemap, scrolling for arena
  -> player.update(keys)            // FSM -> behaviors -> facing -> visuals -> onUpdate hook
  -> updateSpawner()                // Virtual: no-op for tilemap, wave spawning for arena
  -> updateEnemies()                // For each: behaviors -> AI -> facing -> anim -> onUpdate
  -> updateBullets()                // Off-world cleanup (uses worldWidth/worldHeight)
  -> updateYSort()                  // Depth sort by body.bottom
  -> checkWinCondition()            // Virtual: all-enemies-dead for tilemap, no-op for arena
  -> onPostUpdate()                 // HOOK
```

### 6.3 BasePlayer.update() (per frame)

```
update(wasdKeys, spaceKey, shiftKey, eKey, qKey)
  -> store input references
  -> fsm.update()                   // Reads input, sets movement, drives state transitions
  -> behaviors.update()             // Movement applies velocity, FaceTarget updates aim
  -> sync facingDirection from FaceTarget (guarded: skip if hurting/dead)
  -> setFlipX based on facingDirection
  -> resetOriginAndOffset()         // ALWAYS runs — normalize frame + fix body offset
  -> onUpdate()                     // HOOK
```

### 6.4 BaseEnemy.update() (per frame)

```
update()
  -> behaviors.update()             // AI sets velocity, melee trigger repositions
  -> sync facingDirection from AI
  -> executeAI() (if 'custom')      // HOOK
  -> tryRangedAttack()              // Auto-shoot if in range
  -> setFlipX based on facingDirection
  -> getAnimationKey()              // HOOK -> playAnimation if not null
  -> resetOriginAndOffset()
  -> onUpdate()                     // HOOK
```

---

## 7. Multi-Character System

### Dynamic Player Loading

In level scenes:

```typescript
protected override getPlayerClasses(): PlayerClassMap {
  return {
    "WarriorPlayer": WarriorPlayer,
    "RangerPlayer": RangerPlayer,
  };
}

protected createEntities(): void {
  this.player = this.createPlayerByType(spawnX, spawnY, WarriorPlayer);
  // ...
}
```

Uses `registry.get("selectedCharacter")` from CharacterSelectScene.

---

## 8. Type Export Reference (EXACT Names)

### 8.1 Base Class Exports

| Source File          | Exported Types                  | Exported Interfaces                                                                                                                                                                              |
| -------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BaseGameScene.ts`   | `PlayerClassMap`                | —                                                                                                                                                                                                |
| `BaseLevelScene.ts`  | — (re-exports `PlayerClassMap`) | —                                                                                                                                                                                                |
| `BaseArenaScene.ts`  | —                               | —                                                                                                                                                                                                |
| `BasePlayer.ts`      | —                               | `PlayerConfig`                                                                                                                                                                                   |
| `BaseEnemy.ts`       | `EnemyAIType`                   | `EnemyConfig`                                                                                                                                                                                    |
| `PlayerFSM.ts`       | —                               | `PlayerAnimKeys`                                                                                                                                                                                 |
| `behaviors/index.ts` | `IBehavior`, `BaseBehavior`     | `EightWayMovementConfig`, `FaceTargetConfig`, `DashAbilityConfig`, `MeleeAttackConfig`, `RangedAttackConfig`, `PatrolAIConfig`, `ChaseAIConfig`, `ShakeConfig`, `TrailConfig`, `ExplosionConfig` |

### 8.2 Import Pattern (CRITICAL)

```typescript
// CORRECT — class import + type import
import { BasePlayer, type PlayerConfig } from './BasePlayer';
import { BaseEnemy, type EnemyConfig } from './BaseEnemy';
import { PlayerFSM, type PlayerAnimKeys } from './PlayerFSM';

// WRONG — missing 'type' keyword for interfaces
import { BasePlayer, PlayerConfig } from './BasePlayer';
```

---

## 9. Common Code Mistakes (Agent MUST Avoid)

| Mistake                                         | Correct Approach                                                  | Why                                          |
| ----------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| Use `setScale()` directly                       | Use `utils.initScale()`                                           | Body sizing breaks without it                |
| Skip `resetOriginAndOffset()`                   | Call every frame in update                                        | Animation frames shift body position         |
| Missing `createBulletTextures(this)` in preload | Add to preload() if using ranged                                  | No default bullet textures exist             |
| Forget `enemy.setTarget(this.player)`           | Always call after creating chase enemies                          | ChaseAI has no target by default             |
| Boss melee trigger not in group                 | Add `boss.meleeTrigger` to `this.enemyMeleeTriggers`              | Collision won't be detected                  |
| Modify `Base*.ts` or `behaviors/*`              | Create new files, extend/override                                 | Breaking engine code                         |
| Leave `LEVEL_ORDER = ["Level1Scene"]`           | Set to your actual scene keys                                     | Game crashes if scene not registered         |
| Set `isInvulnerable = true/false`               | Use `player.grantInvulnerability(ms)`                             | isInvulnerable is a getter (timestamp-based) |
| Zero velocity in hurting state                  | Only call `movement.stop()`                                       | Zeroing velocity cancels knockback           |
| Call `play()` directly on sprite                | Use `playAnimation()`                                             | Skips resetOriginAndOffset                   |
| Import JSON with named import                   | Use default import: `import gameConfig from '../gameConfig.json'` | Named imports may fail for top-level keys    |

### Config Access Pattern

**CRITICAL**: gameConfig.json must be imported with **default import**, then destructured with safe defaults:

```typescript
import gameConfig from '../gameConfig.json';
const playerConfig = gameConfig.playerConfig ?? {};
const hp = playerConfig.maxHealth.value; // use .value accessor
```

**NEVER** use named imports: `import { playerConfig } from '../gameConfig.json'` — this can cause runtime errors.

All config values use the wrapper format `{ "value": X, "type": "...", "description": "..." }`. Always access the actual value via `.value`.

---

## 10. Quick Reference

### AI Type Guide

| Type         | Use When                                          |
| ------------ | ------------------------------------------------- |
| `patrol`     | Simple wandering enemy (2D area)                  |
| `chase`      | Enemy that follows player (with stop distance)    |
| `stationary` | Turret, doesn't move                              |
| `custom`     | Complex boss with phases (override `executeAI()`) |

### Facing Direction Values

4-way system used by FaceTarget, PatrolAI, ChaseAI:

| Value     | Meaning                      |
| --------- | ---------------------------- |
| `'right'` | Facing right (flipX = false) |
| `'left'`  | Facing left (flipX = true)   |
| `'up'`    | Facing up (away from camera) |
| `'down'`  | Facing down (toward camera)  |

### Invulnerability System

- `BasePlayer.isInvulnerable` is a **getter** (read-only)
- Uses timestamp-based system: `scene.time.now < _invulnerableUntil`
- Grant via `player.grantInvulnerability(durationMs)`
- Multiple sources (damage, dash) never conflict — longest duration wins via `Math.max`
- **NEVER** assign `player.isInvulnerable = true/false` — it's not a settable property
