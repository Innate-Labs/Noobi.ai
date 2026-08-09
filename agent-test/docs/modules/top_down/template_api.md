# Top-Down — Template Capability Reference

> What the template provides: project structure, available behaviors, hooks, effects, and operation patterns.
> This document ensures GDD designs stay within template capabilities — no custom code needed.

---

## Hook Integrity Rule (CRITICAL)

Every hook name referenced in the GDD and implementation code **MUST** exist in this document's hook tables (Sections 4.5–4.7). Do NOT invent, hallucinate, or assume hooks that aren't listed here. If a hook isn't documented below, it **does not exist** — design around the hooks that DO exist. Using a non-existent hook will cause a compilation failure.

---

## 1. Project Structure

```
src/
  main.ts              # UPDATE: register level scenes via game.scene.add()
  LevelManager.ts      # UPDATE: set LEVEL_ORDER array with level scene keys
  gameConfig.json      # UPDATE: set playerConfig, enemyConfig values
  utils.ts             # KEEP (all utilities — core + top-down specific, never modify)
  characters/
    BasePlayer.ts          # KEEP (base class for players)
    BaseEnemy.ts           # KEEP (base class for enemies)
    PlayerFSM.ts           # KEEP (player state machine)
    index.ts               # KEEP (barrel exports)
    _TemplatePlayer.ts     # COPY -> rename to your Player class
    _TemplateEnemy.ts      # REFERENCE -> create new enemy files
  behaviors/
    index.ts               # KEEP (barrel export for all behaviors)
    BehaviorManager.ts     # KEEP (manages entity behaviors)
    EightWayMovement.ts    # KEEP (8-directional movement)
    FaceTarget.ts          # KEEP (mouse/target aiming)
    MeleeAttack.ts         # KEEP (melee combat)
    RangedAttack.ts        # KEEP (ranged combat)
    DashAbility.ts         # KEEP (dash with i-frames)
    PatrolAI.ts            # KEEP (2D patrol enemy AI)
    ChaseAI.ts             # KEEP (2D chase enemy AI)
    ScreenEffectHelper.ts  # KEEP (visual effects)
    IBehavior.ts           # KEEP (behavior interface)
  scenes/
    Preloader.ts           # KEEP (asset loading)
    TitleScreen.ts         # KEEP (uses LevelManager to start first level)
    BaseGameScene.ts       # KEEP (shared base — groups, collisions, Y-sort, hooks)
    BaseLevelScene.ts      # KEEP (tilemap mode — dual tilesets, camera follow, walls)
    BaseArenaScene.ts      # KEEP (arena mode — scrolling bg, screen bounds, spawner)
    _TemplateLevel.ts      # COPY -> rename for TILEMAP levels
    _TemplateArena.ts      # COPY -> rename for ARENA levels
    UIScene.ts             # KEEP (in-game HUD: health bar, dash cooldown, pause)
    index.ts               # KEEP (barrel exports)
```

### Scene Hierarchy (Two-Layer Inheritance)

```
BaseGameScene           ← shared: groups, collisions, Y-sort, input, hooks
  ├── BaseLevelScene    ← tilemap: dual tilesets, camera follow, wall collisions
  └── BaseArenaScene    ← arena: scrolling bg, screen bounds, wave spawner
```

- **Tilemap games** (dungeon, exploration, room-clearing): extend `BaseLevelScene`, copy `_TemplateLevel.ts`
- **Arena games** (space shooter, survival, bullet-hell): extend `BaseArenaScene`, copy `_TemplateArena.ts`

**TitleScreen** navigates to `LevelManager.LEVEL_ORDER[0]`. Default is empty — level keys MUST be added, or the game will crash on start.

**Scene flow**: TitleScreen -> Level1 -> (Victory -> Level2 -> ...) -> GameComplete. Death -> GameOver -> Restart level.

**Key difference from platformer**: Zero gravity, Y-Sort depth, 2D camera, 8-directional movement, mouse aiming, dash instead of jump.

---

## 2. Available Behaviors

### 2.1 Movement & Aiming

| Behavior           | Config Parameters                                        | Purpose                                                                                                           |
| ------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `EightWayMovement` | `walkSpeed`, `friction?`                                 | 8-directional movement with diagonal normalization                                                                |
| `FaceTarget`       | `useMouseAim?`, `rotateSprite?`                          | Mouse aiming: tracks pointer, provides aimAngle and 4-way facingDirection. rotateSprite mode for vehicles/turrets |
| `DashAbility`      | `dashSpeed`, `dashDuration`, `cooldown`, `invulnerable?` | Dash with i-frames and cooldown                                                                                   |

### 2.2 Combat

| Behavior       | Config Parameters                                                                               | Purpose                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `MeleeAttack`  | `damage`, `range?`, `width?`, `cooldown?`                                                       | 4-directional melee trigger zone (repositions based on facingDirection) |
| `RangedAttack` | `damage`, `projectileKey`, `projectileSpeed?`, `projectileSize?`, `spawnDistance?`, `cooldown?` | 360-degree projectile shooting (shootAtAngle or shootAt target)         |

### 2.3 AI Behaviors

| Behavior   | Config Parameters                                              | Purpose                                                           |
| ---------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `PatrolAI` | `speed`, `patrolArea?`, `directionChangeInterval?`             | 2D area wandering (random direction changes, boundary reflection) |
| `ChaseAI`  | `speed`, `detectionRange?`, `giveUpDistance?`, `stopDistance?` | 2D target chasing (stops at stopDistance for ranged enemies)      |

---

## 3. Screen Effects

| Effect            | Method                                           | Purpose                |
| ----------------- | ------------------------------------------------ | ---------------------- |
| Screen shake      | `ScreenEffectHelper.shake(scene, config)`        | Impact feedback        |
| Preset shakes     | `shakeLight/Medium/Strong(scene)`                | Quick calls            |
| Dash trail        | `createDashTrail(scene, owner, imageKey, tint?)` | Dash visual            |
| Trail effect      | `createTrail(scene, owner, config)`              | Custom trail sequences |
| Explosion         | `createExplosion(scene, x, y, config)`           | AOE impact visual      |
| Default explosion | `createDefaultExplosion(scene, x, y, imageKey)`  | Quick explosion        |
| Damage numbers    | `showDamageNumber(scene, x, y, damage, color?)`  | Floating combat text   |

---

## 4. Available Hooks

### 4.1 Player Hooks (BasePlayer)

| Hook                         | Purpose                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `initBehaviors(config)`      | Add custom behaviors (called during constructor)                                                                                 |
| `initAbilities()`            | Setup special abilities (called during constructor)                                                                              |
| `onUpdate()`                 | Custom per-frame logic                                                                                                           |
| `onDamageTaken(damage)`      | React to damage (camera shake, sound)                                                                                            |
| `onDeath()`                  | Death effect (particles, flash)                                                                                                  |
| `onHealthChanged(old, new)`  | Health UI updates                                                                                                                |
| `onDashUsed()`               | Dash start feedback (trail effect, sound)                                                                                        |
| `onDashComplete()`           | Dash end cleanup                                                                                                                 |
| `onShoot(bullet)`            | React to ranged attack (play sound, ammo tracking — **NO screen shake**)                                                         |
| `onMeleeStart()`             | React to melee attack (play sound, combo logic — **NO screen shake**)                                                            |
| `initializeSounds()`         | Override to reassign `this.shootSound`, `this.attackSound`, `this.hurtSound`, `this.dashSound`. **DO NOT use `this.sounds.xxx`** |
| **`playAnimation(animKey)`** | **MANDATORY** — Resolve base anim keys to directional variants (front/back/side). See Section 4.3                                |

> **Twin-stick shooting**: The `shooting` FSM state allows movement — player is NOT rooted while firing. Only `melee` roots the player briefly.

### 4.2 Player Input Hooks (BasePlayer)

These hooks control WHEN actions trigger. Override to add mouse/gamepad input:

| Hook                  | Default              | Purpose                              |
| --------------------- | -------------------- | ------------------------------------ |
| `checkMeleeInput()`   | Shift key (JustDown) | Override to add right-click melee    |
| `checkRangedInput()`  | E key (JustDown)     | Override to add left-click shooting  |
| `checkDashInput()`    | Space key (JustDown) | Override to add custom dash trigger  |
| `checkSpecialInput()` | Q key (JustDown)     | Override for special ability trigger |

### 4.3 Player Animation Hook (BasePlayer) — MANDATORY Override

| Hook                     | Purpose                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `playAnimation(animKey)` | **MUST override** to resolve base animation keys to directional variants using `facingDirection` |

**Direction mapping** (enforced by convention):

| `facingDirection`    | Suffix   | Image Key Pattern       | Notes                           |
| -------------------- | -------- | ----------------------- | ------------------------------- |
| `'down'`             | `_front` | `{name}_{action}_front` | Facing camera                   |
| `'up'`               | `_back`  | `{name}_{action}_back`  | Facing away                     |
| `'left'` / `'right'` | `_side`  | `{name}_{action}_side`  | Side profile + `flipX` for left |

**Standard override pattern** (copy into every player class):

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

**Why safe fallback?** If `{name}_die_back_anim` doesn't exist (die action often has only `_front`), the base `{name}_die_anim` plays instead. This makes the system robust to partial directional coverage.

### 4.4 Enemy Hooks (BaseEnemy)

| Hook                                         | Purpose                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `initBehaviors(config)`                      | Add custom behaviors (called during constructor)                                             |
| `onUpdate()`                                 | Custom per-frame logic                                                                       |
| `onDamageTaken(damage)`                      | React to damage (flash, aggro switch)                                                        |
| `onDeath()`                                  | Death effects, score events                                                                  |
| `executeAI()`                                | Custom AI logic (when `aiType: 'custom'`)                                                    |
| `getAnimationKey(isMoving, facingDirection)` | Return animation key for auto-play (return null for manual control)                          |
| `onAggro(target)`                            | React to first target detection (alert sound, appearance change)                             |
| `initializeSounds()`                         | Override to reassign `this.attackSound`, `this.deathSound`. **DO NOT use `this.sounds.xxx`** |

### 4.5 Scene Hooks — Shared (BaseGameScene → both modes)

| Hook                                                          | Purpose                                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `onPreCreate()` / `onPostCreate()`                            | Before/after scene creation                                                                               |
| `onPreUpdate()` / `onPostUpdate()`                            | Before/after each frame                                                                                   |
| `onPlayerDeath()`                                             | Custom game over logic (default: launch GameOverUIScene)                                                  |
| `onLevelComplete()`                                           | Custom victory logic (default: launch VictoryUIScene/GameCompleteUIScene)                                 |
| `onEnemyKilled(enemy)`                                        | Score tracking, effects                                                                                   |
| `setupCustomCollisions()`                                     | Custom triggers, zones                                                                                    |
| `getCameraConfig()`                                           | Customize camera lerp and zoom                                                                            |
| `createCrosshair()`                                           | Custom cursor/crosshair for aiming (after entities created)                                               |
| `createPlayerBullet(x, y, angle, speed, damage, textureKey?)` | Override to customize player bullet. **MUST call `this.playerBullets.add(bullet)` and return the sprite** |
| `createEnemyBullet(x, y, angle, speed, damage, textureKey?)`  | Override to customize enemy bullet. **MUST call `this.enemyBullets.add(bullet)` and return the sprite**   |
| `getPlayerClasses()`                                          | Multi-character support (returns PlayerClassMap)                                                          |

### 4.6 Scene Hooks — Tilemap Only (BaseLevelScene)

| Hook / Abstract       | Purpose                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `setupMapSize()`      | **Abstract** — set `this.mapWidth`, `this.mapHeight`                     |
| `createEnvironment()` | **Abstract** — load tilemaps, create layers, place obstacles/decorations |
| `createEntities()`    | **Abstract** — create player + enemies from Object Layer                 |
| `checkWinCondition()` | Override (default: all enemies dead → `onLevelComplete()`)               |

### 4.7 Scene Hooks — Arena Only (BaseArenaScene)

| Hook / Abstract         | Purpose                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `createBackground()`    | **Abstract** — scrolling bg: `this.setupScrollingBg('key')` or static bg  |
| `createEntities()`      | **Abstract** — create player only. Set `bossKillThreshold`, etc.          |
| `spawnEnemy()`          | **Abstract** — called by timer to create one enemy, add to `this.enemies` |
| `getSpawnInterval()`    | Spawn timing per difficulty. Default: `2000 - (level-1)*200`, min 500ms   |
| `getScrollSpeed()`      | Background scroll speed (px/frame). Default: `1`                          |
| `getScrollDirection()`  | `'vertical'` (default) or `'horizontal'`                                  |
| `onDifficultyUp(level)` | React to difficulty increase (every 30s default)                          |
| `onScoreChanged(score)` | React to score change. UIScene can listen via `'scoreChanged'` event      |
| `onBossSpawn()`         | Kill threshold reached — spawn boss, clear enemies                        |
| `onBossDeath()`         | Boss defeated — set `this.bossActive = false` to resume spawning          |
| `addScore(points)`      | Public method — call to increase score + emit event                       |

### 4.8 Available Groups (auto-initialized by BaseGameScene)

These groups are created automatically in `initializeGroups()`. Use ONLY these — do NOT invent new group names like `this.players` or `this.doors`.

| Group                     | Type                       | Purpose                                          |
| ------------------------- | -------------------------- | ------------------------------------------------ |
| `this.enemies`            | `Phaser.GameObjects.Group` | All enemy sprites. Add enemies here.             |
| `this.obstacles`          | `Phaser.GameObjects.Group` | Physics obstacles (crates, barrels). Y-sorted.   |
| `this.decorations`        | `Phaser.GameObjects.Group` | Visual props, doors, ground items.               |
| `this.playerBullets`      | `Phaser.GameObjects.Group` | Player projectiles. Auto-collision with enemies. |
| `this.enemyBullets`       | `Phaser.GameObjects.Group` | Enemy projectiles. Auto-collision with player.   |
| `this.enemyMeleeTriggers` | `Phaser.GameObjects.Group` | Melee attack zones from enemies.                 |

**Player**: Set `this.player = new YourPlayer(this, x, y)` directly — do NOT add to any group.

### 4.7 Scene Abstract Methods (MUST implement)

| Method                | Purpose                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setupMapSize()`      | Set `mapWidth`, `mapHeight`                                                                                                                                                                                                                                  |
| `createEnvironment()` | Create background, dual tilemaps (floor+walls), obstacles (from `O` object layer), decorations. Must set: `floorTileset`, `wallsTileset`, `floorLayer`, `wallsLayer`, `map`. Obstacles are separate `type: "image"` assets with physics (NOT tilemap tiles). |
| `createEntities()`    | Create player and enemies                                                                                                                                                                                                                                    |

---

## 5. Template Operation Pattern

| Operation     | Files                                                                                 | Rule                                      |
| ------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| **KEEP**      | `Base*.ts`, `behaviors/*`, `PlayerFSM.ts`, `utils.ts`, `UIScene.ts`                   | Never modify — these are the engine       |
| **COPY**      | `_TemplatePlayer.ts`, `_TemplateLevel.ts`                                             | Copy to new file, rename class, configure |
| **REFERENCE** | `_TemplateEnemy.ts`                                                                   | Create new files based on it              |
| **UPDATE**    | `main.ts`, `LevelManager.ts`, `gameConfig.json`, `asset-pack.json`, `animations.json` | Modify values only                        |

GDD's Implementation Roadmap should follow this pattern:

1. UPDATE config files first (LevelManager, main.ts, gameConfig, animations.json)
2. COPY/REFERENCE templates, specify which hooks to override

---

## 6. Built-in Collision Systems

The base scene automatically handles:

| Collision                         | Behavior                                             |
| --------------------------------- | ---------------------------------------------------- |
| Player/Enemy vs Walls             | Standard wall collision (wallsLayer)                 |
| Player/Enemy vs Obstacles         | Physics-enabled obstacle collision (crates, barrels) |
| Player touching Enemy             | Contact damage to player with 2D knockback           |
| Player melee vs Enemy             | Damage to enemy with 2D knockback                    |
| Enemy melee vs Player             | Damage to player with 2D knockback (for bosses)      |
| Player bullets vs Enemy           | Damage + bullet destroyed + 2D knockback             |
| Enemy bullets vs Player           | Damage + bullet destroyed + 2D knockback             |
| Player/Enemy bullets vs Walls     | Bullet destroyed                                     |
| Player/Enemy bullets vs Obstacles | Bullet destroyed                                     |

Custom collisions and triggers go in `setupCustomCollisions()` hook.

---

## 7. Top-Down Specific Systems

### 7.1 Y-Sort Depth Rendering

Entities with higher Y position (lower on screen) appear in front. Auto-includes:

- Player
- Enemies
- Obstacles group
- ySortGroup (manually added entities)

Does NOT include decorations (ground-level items like coins stay below characters).

Sort key: `body.bottom` (foot position) if physics body exists, otherwise `sprite.y`.

### 7.2 Physics

- Zero gravity (`physics.world.gravity.y = 0`)
- Full 2D world bounds (all 4 sides enabled)
- Body positioned at sprite "feet" (bottom 40% of sprite) for correct Y-sort
- 2D knockback on all damage (push away from attacker at computed angle)

### 7.3 Camera

- 2D follow with configurable lerp (default: 0.1 on both axes)
- Camera bounds match map dimensions
- Configurable zoom via `getCameraConfig()` hook

### 7.4 HUD (UIScene)

The UIScene overlay provides:

- Health bar (red, with color thresholds at 25% and 50%)
- Dash cooldown bar (cyan when ready, gray when cooling)
- Pause button + ESC key
- Controls hint text

UIScene reads from `player.getHealthPercentage()` and `player.getDashCooldownProgress()`.

---

## 7.5 Config Import Pattern (CRITICAL)

**gameConfig.json must use DEFAULT import**, then destructure with safe defaults:

```
import gameConfig from '../gameConfig.json';
const playerConfig = gameConfig.playerConfig ?? {};
const hp = playerConfig.maxHealth.value;  // use .value accessor
```

**NEVER** use named imports like `import { playerConfig } from '../gameConfig.json'` — this may cause runtime errors depending on the build system.

All config values use the wrapper format: `{ "value": X, "type": "...", "description": "..." }`. Access the actual value via `.value`.

---

## 8. Utilities (utils.ts)

All utilities live in a single `utils.ts` file. Import via `import * as utils from '../utils'` or named imports.

### 8.1 Core Utilities

| Function                                                                                | Purpose                                                          |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `initScale(sprite, origin, maxWidth?, maxHeight?, bodyWidthFactor?, bodyHeightFactor?)` | Scale sprite + set collision body (MUST use instead of setScale) |
| `resetOriginAndOffset(sprite, facingDirection)`                                         | Fix body offset after animation frame change (call every frame)  |
| `safeAddSound(scene, key, config?)`                                                     | Add sound safely (returns undefined if key missing)              |
| `addCollider(scene, obj1, obj2, callback?, processCallback?)`                           | Collision with fixed parameter order                             |
| `addOverlap(scene, obj1, obj2, callback?, processCallback?)`                            | Overlap with fixed parameter order                               |
| `initUIDom(scene, html)`                                                                | Create DOM element for UI scenes                                 |
| `createDecoration(scene, group, key, x, y, height)`                                     | Create scaled decoration in group                                |

### 8.2 Top-Down Specific Utilities

| Function                                                                  | Purpose                                       |
| ------------------------------------------------------------------------- | --------------------------------------------- |
| `angleToDirection(angle)`                                                 | Convert radians to 4-direction string         |
| `directionToAngle(direction)`                                             | Convert 4-direction string to radians         |
| `createTrigger(scene, owner, x, y, w, h)`                                 | Create physics zone for melee detection       |
| `updateMeleeTrigger(character, trigger, facing, range, width)`            | Reposition melee zone per facing              |
| `createProjectile(scene, x, y, key, size?, gravity?, damage?)`            | Create scaled projectile sprite               |
| `createProjectileAtAngle(scene, x, y, key, angle, speed, size?, damage?)` | Create + launch projectile                    |
| `createBulletTextures(scene)`                                             | Generate default player/enemy bullet textures |
| `scaleCollectible(sprite, targetSize?)`                                   | Scale collectible to standard size            |
| `computeRotation(assetDir, targetDir)`                                    | Calculate rotation between direction vectors  |

### 8.3 Size Constants

| Constant            | Values                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| `PROJECTILE_SIZES`  | `BULLET_SMALL: 8`, `BULLET_MEDIUM: 12`, `GRENADE: 20`, `ARROW: 24`, `LARGE: 32` |
| `COLLECTIBLE_SIZES` | `COIN: 32`, `SMALL_ITEM: 24`, `MEDIUM_ITEM: 32`, `LARGE_ITEM: 48`               |

---

## 9. Implementation Roadmap Template

```
1. UPDATE LevelManager.ts: set LEVEL_ORDER to level scene keys
2. UPDATE main.ts: register ALL level scenes
3. UPDATE gameConfig.json: set playerConfig, enemyConfig values
4. UPDATE animations.json: define all character animations (idle, walk, melee, shoot, dash, die)
5. COPY _TemplatePlayer.ts -> Player.ts: configure animKeys, stats, override hooks
6. REFERENCE _TemplateEnemy.ts -> Enemy.ts: set aiType, configure stats and combat
7. (Optional) Create Boss.ts: aiType='custom', override executeAI() with phase logic
8. COPY _TemplateLevel.ts -> Level1Scene.ts: implement abstract methods
9. Override hooks: setupCustomCollisions, onEnemyKilled (score), onDamageTaken (shake + hurt sound)
```

**Roadmap MUST include** steps 1-4 (LevelManager, main.ts, gameConfig, animations). These are the #1 source of runtime errors when omitted.

---

## 10. Common Capability Mistakes

These are mistakes where the GDD asks for something that already exists in the template:

| Wrong (GDD asks for custom work)        | Correct (use existing template capability)                                     |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| "Implement 8-way movement"              | Use `EightWayMovement` behavior, set `walkSpeed` in config                     |
| "Create patrol AI"                      | Use `PatrolAI` behavior with `speed=80`                                        |
| "Write damage system"                   | Use `BasePlayer.takeDamage()`, override `onDamageTaken` hook                   |
| "Code dash ability"                     | Use `DashAbility` with `dashSpeed=500`                                         |
| "Build screen shake system"             | Use `ScreenEffectHelper.shake()`                                               |
| "Design map from scratch"               | Use predefined template, modify obstacle positions                             |
| "Custom collision detection"            | Use `addCollider`/`addOverlap` from utils, add in `setupCustomCollisions` hook |
| "Build projectile system"               | Use `RangedAttack` behavior with `projectileKey`                               |
| "Create health bar UI"                  | Use built-in `UIScene` (auto health + dash cooldown)                           |
| "Implement scoring system"              | Override `onEnemyKilled` hook, track score in scene                            |
| "Mouse aiming system"                   | Use `FaceTarget` behavior with `useMouseAim: true` (built-in)                  |
| "Y-Sort rendering"                      | Built into `BaseGameScene.updateYSort()` — automatic (both modes)              |
| "Invulnerability system"                | Built into `BasePlayer.grantInvulnerability()` — timestamp-based               |
| Named import: `import { playerConfig }` | Default import: `import gameConfig from '../gameConfig.json'` then destructure |

---

## 11. Control Scheme

Default controls (managed by BaseGameScene + PlayerFSM):

| Key   | Action                              |
| ----- | ----------------------------------- |
| WASD  | 8-directional movement              |
| Mouse | Aiming direction (360-degree)       |
| Shift | Melee Attack (in facing direction)  |
| E     | Ranged Attack (toward mouse)        |
| Space | Dash (in movement/facing direction) |
| Q     | Special Ability (hook)              |
| ESC   | Pause                               |

All input keys are overridable via player input hooks (`checkMeleeInput`, `checkRangedInput`, `checkDashInput`, `checkSpecialInput`).
