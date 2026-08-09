# Platformer — Template Capability Reference

> What the template provides: project structure, available behaviors, hooks, effects, and operation patterns.
> This document ensures GDD designs stay within template capabilities — no custom code needed.

---

## 1. Project Structure

```
src/
  main.ts              # UPDATE: register level scenes via game.scene.add()
  LevelManager.ts      # UPDATE: set LEVEL_ORDER array with level scene keys
  gameConfig.json      # UPDATE: set playerConfig, enemyConfig, ultimateConfig
  utils.ts             # KEEP (core + platformer utilities, never modify)
  StateMachine.ts      # KEEP (generic FSM)
  characters/
    BasePlayer.ts          # KEEP (base class for players)
    BaseEnemy.ts           # KEEP (base class for enemies)
    PlayerFSM.ts           # KEEP (player state machine)
    _TemplatePlayer.ts     # COPY -> rename to your Player class
    _TemplateEnemy.ts      # REFERENCE -> create new enemy files
  behaviors/
    index.ts               # KEEP (barrel export for all behaviors)
    PlatformerMovement.ts  # KEEP (movement behavior)
    MeleeAttack.ts         # KEEP (melee combat)
    RangedAttack.ts        # KEEP (ranged combat)
    SkillBehavior.ts       # KEEP (ultimate skills)
    PatrolAI.ts            # KEEP (patrol enemy AI)
    ChaseAI.ts             # KEEP (chase enemy AI)
    ScreenEffectHelper.ts  # KEEP (visual effects)
  scenes/
    Preloader.ts           # KEEP (asset loading)
    TitleScreen.ts         # KEEP (uses LevelManager to start first level)
    BaseLevelScene.ts      # KEEP (base class for level scenes)
    _TemplateLevel.ts      # COPY -> rename to your Level scene
    CharacterSelectScene.ts # KEEP (optional: multi-character)
    UIScene.ts             # KEEP (in-game HUD overlay)
```

**TitleScreen** navigates to `LevelManager.LEVEL_ORDER[0]`. Default is empty — level keys MUST be added, or the game will crash on start.

**Scene flow**: TitleScreen → Level1 → (Victory → Level2 → ...) → GameComplete. Death → GameOver → Restart level.

---

## 2. Available Behaviors

### 2.1 Movement & Combat

| Behavior             | Config Parameters                                                                                                   | Purpose                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `PlatformerMovement` | `walkSpeed`, `jumpPower`, `airControl?`, `coyoteTime?`, `jumpBufferTime?`, `doubleJumpEnabled?`, `doubleJumpPower?` | Horizontal movement + jumping (optional double jump) |
| `MeleeAttack`        | `damage`, `range?`, `width?`, `cooldown?`                                                                           | Close-range attack (creates trigger zone)            |
| `RangedAttack`       | `damage`, `projectileKey`, `projectileSpeed?`, `cooldown?`                                                          | Shoots projectiles                                   |

### 2.2 AI Behaviors

| Behavior   | Config Parameters                                              | Purpose              |
| ---------- | -------------------------------------------------------------- | -------------------- |
| `PatrolAI` | `speed`, `minX?`, `maxX?`, `detectCliffs?`                     | Walk back and forth  |
| `ChaseAI`  | `speed`, `detectionRange?`, `giveUpDistance?`, `stopDistance?` | Follow target player |

### 2.3 Ultimate Skills

| Skill Class              | Config Parameters                                                                            | Visual Style                            |
| ------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------- |
| `DashAttackSkill`        | `dashDistance`, `dashDuration`, `damage`, `hitRange`, `warningDuration?`                     | Linear dash with energy trail           |
| `TargetedAOESkill`       | `aoeRadius`, `damage`, `strikeDelay`, `effectKey`                                            | Lock target + AOE explosion             |
| `AreaDamageSkill`        | `attackRange`, `damage`, `effectKey`, `chargeEffectKey?`                                     | AOE burst around player                 |
| `TargetedExecutionSkill` | `executionDelay`, `totalDuration`, `effectKey`                                               | Lock target + instant kill              |
| `BeamAttackSkill`        | `beamLength`, `beamWidth`, `damage`, `penetrating?`                                          | Horizontal laser beam                   |
| `GroundQuakeSkill`       | `damage`, `effectRange`, `effectCount`                                                       | Ground slam shockwave                   |
| `BoomerangSkill`         | `projectileKey`, `throwSpeed?`, `returnSpeed?`, `maxDistance?`, `damage?`                    | Returning projectile (hammer, shuriken) |
| `MultishotSkill`         | `projectileKey`, `projectileCount?`, `spreadAngle?`, `projectileSpeed?`, `damage?`           | Spread fire N projectiles               |
| `ArcProjectileSkill`     | `projectileKey`, `launchSpeedX?`, `launchSpeedY?`, `damage?`, `gravity?`, `explosionRadius?` | Gravity arc with optional AOE           |

All skills share base config: `id`, `name`, `cooldown`, `screenShake?`.

---

## 3. Screen Effects

| Effect                  | Method                                                                        | Purpose                                         |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| Screen shake            | `ScreenEffectHelper.shake(scene, config)`                                     | Impact feedback                                 |
| Preset shakes           | `shakeLight/Medium/Strong(scene)`                                             | Quick calls                                     |
| Dash trail              | `createDashTrail(scene, owner, key, tint?)`                                   | Dash skill visual                               |
| Explosion               | `createExplosion(scene, x, y, config)`                                        | AOE impact                                      |
| Vortex                  | `createVortex(scene, x, y, config)`                                           | Execution skill visual                          |
| Damage numbers (effect) | `ScreenEffectHelper.showDamageNumber(scene, x, y, damage, color?)`            | Floating combat text (standalone helper)        |
| Damage numbers (scene)  | `BaseLevelScene.showDamageNumber(x, y, damage, color?, fontSize?, duration?)` | Floating combat text (auto-called on every hit) |

### 3.1 Built-in Damage Numbers

`BaseLevelScene` automatically shows floating damage numbers on **every** collision:

- **Yellow** (`#ffdd44`) for damage dealt to enemies (melee, ranged, contact)
- **Red** (`#ff4444`) for damage dealt to the player

No extra code needed — damage numbers appear as soon as collisions happen. To show custom numbers (e.g. "KO" on kill), call `this.showDamageNumber(x, y, value, color)` from any hook.

### 3.2 Camera Offset

`BaseLevelScene.setupCamera()` applies `setFollowOffset(0, -128)` by default, placing the player in the **lower 1/3** of the screen. This gives better vertical visibility for platforming — players can see platforms above them.

---

## 4. Available Hooks

### 4.1 Player Hooks

| Hook                        | Purpose                               |
| --------------------------- | ------------------------------------- |
| `initBehaviors(config)`     | Add custom behaviors (constructor)    |
| `initUltimate()`            | Setup ultimate skill (constructor)    |
| `onUpdate()`                | Custom per-frame logic                |
| `onDamageTaken(damage)`     | React to damage (camera shake, sound) |
| `onDeath()`                 | Death effect (particles, flash)       |
| `onHealthChanged(old, new)` | Health UI updates                     |
| `onUltimateUsed()`          | Ultimate activation feedback          |
| `onUltimateComplete()`      | Ultimate completion cleanup           |

### 4.2 Enemy Hooks

| Hook                    | Purpose                                   |
| ----------------------- | ----------------------------------------- |
| `initBehaviors(config)` | Add custom behaviors (constructor)        |
| `onUpdate()`            | Custom per-frame logic                    |
| `onDamageTaken(damage)` | React to damage (flash, knockback)        |
| `onDeath()`             | Drop items, score effects                 |
| `executeAI()`           | Custom AI logic (when `aiType: 'custom'`) |

### 4.3 Scene Hooks

| Hook                               | Purpose                                      |
| ---------------------------------- | -------------------------------------------- |
| `onPreCreate()` / `onPostCreate()` | Before/after scene creation                  |
| `onPreUpdate()` / `onPostUpdate()` | Before/after each frame                      |
| `onPlayerDeath()`                  | Custom game over logic                       |
| `onLevelComplete()`                | Custom victory logic (500 ms delay built-in) |
| `onEnemyKilled(enemy)`             | Score, drops, effects                        |
| `setupCustomCollisions()`          | Collectibles, triggers, zones                |
| `getPlayerClasses()`               | Multi-character support                      |

### 4.4 Scene Abstract Methods (MUST implement)

| Method                | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `setupMapSize()`      | Set `mapWidth`, `mapHeight`                  |
| `createBackground()`  | Add background sprite                        |
| `createTileMap()`     | Load tilemap and create layers               |
| `createDecorations()` | Create collectibles (player NOT created yet) |
| `createPlayer()`      | Create player instance                       |
| `createEnemies()`     | Create enemy instances                       |

---

## 5. Template Operation Pattern

| Operation     | Files                                                                                 | Rule                                      |
| ------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| **KEEP**      | `Base*.ts`, `behaviors/*`, `PlayerFSM.ts`, `utils.ts`, UI scenes                      | Never modify                              |
| **COPY**      | `_TemplatePlayer.ts`, `_TemplateLevel.ts`                                             | Copy to new file, rename class, configure |
| **REFERENCE** | `_TemplateEnemy.ts`                                                                   | Create new files based on it              |
| **UPDATE**    | `main.ts`, `LevelManager.ts`, `gameConfig.json`, `asset-pack.json`, `animations.json` | Modify values only                        |

GDD's Implementation Roadmap should follow this pattern:

1. UPDATE config files first (LevelManager, main.ts, gameConfig, animations.json)
2. COPY/REFERENCE templates, specify which hooks to override

---

## 6. Scene Cleanup Pattern

`TitleScreen` and `CharacterSelectScene` both call `cleanupUIScenes()` in their `create()` method. This stops any residual UI overlay scenes (UIScene, PauseUIScene, VictoryUIScene, GameOverUIScene, GameCompleteUIScene) that may still be running from a previous game session.

This prevents ghost UI elements from appearing when the player returns to the title screen after a game over or victory.

```typescript
protected cleanupUIScenes(): void {
  const scenesToStop = ["UIScene", "PauseUIScene", "VictoryUIScene", "GameOverUIScene", "GameCompleteUIScene"];
  scenesToStop.forEach((key) => {
    try { if (this.scene.isActive(key)) this.scene.stop(key); } catch (_) {}
  });
}
```

## 7. UIScene — Skill Cooldown Display

The template `UIScene` includes:

| Element               | ID                    | Purpose                                               |
| --------------------- | --------------------- | ----------------------------------------------------- |
| Player name           | `#player-name`        | Shows `registry.get('selectedCharacter')` (uppercase) |
| HP text               | `#health-text`        | Numeric `health/maxHealth` next to player name        |
| Health bar            | `#player-health-fill` | Color changes at 50% (yellow) and 25% (red)           |
| Ultimate cooldown bar | `#ultimate-fill`      | Fills from 0→100% as cooldown recharges               |
| Ultimate label        | `#ultimate-label`     | Shows remaining seconds or "READY"                    |
| Boss name             | `#boss-name`          | Shows `boss.displayName` if set                       |
| Boss health bar       | `#boss-health-fill`   | Hidden until `gameScene.boss` exists                  |

The cooldown bar uses `player.ultimate.getCooldownProgress()` (returns 0→1) and `player.ultimate.getCooldownRemaining()` (returns ms). These are provided by `SkillBehavior` base class.

---

## 8. Built-in Collision Systems

The base scene automatically handles (with damage numbers shown automatically):

| Collision                      | Behavior                    |
| ------------------------------ | --------------------------- |
| Player/Enemy vs Ground         | Standard platformer physics |
| Player touching Enemy          | Contact damage to player    |
| Player melee vs Enemy          | Damage to enemy             |
| Enemy melee vs Player          | Damage to player            |
| Player bullets vs Enemy/Ground | Damage + bullet destroyed   |
| Enemy bullets vs Player/Ground | Damage + bullet destroyed   |

Custom collisions (coins, triggers) go in `setupCustomCollisions()` hook.

---

## 9. Implementation Roadmap Template

```
1. UPDATE LevelManager.ts: set LEVEL_ORDER to level scene keys
2. UPDATE main.ts: register ALL level scenes + CharacterSelectScene if used
3. UPDATE gameConfig.json: set playerConfig, enemyConfig, ultimateConfig values
4. UPDATE animations.json: define all character animations (idle, run, jump, attack_1, attack_2, die)
5. COPY _TemplatePlayer.ts -> Player.ts: configure animKeys, stats, override initUltimate()
6. REFERENCE _TemplateEnemy.ts -> Enemy.ts: set aiType='patrol', configure stats
7. (Optional) Create Boss.ts: aiType='custom', override executeAI() with phase logic
8. COPY _TemplateLevel.ts -> Level1Scene.ts: implement abstract methods
9. Override hooks: setupCustomCollisions (coins), onEnemyKilled (score), onDamageTaken (shake)
```

**Roadmap MUST include** steps 1-4 (LevelManager, main.ts, gameConfig, animations). These are the #1 source of runtime errors when omitted.

---

## 10. Common Capability Mistakes

These are mistakes where the GDD asks for something that already exists in the template:

| Wrong (GDD asks for custom work) | Correct (use existing template capability)                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| "Implement jump physics"         | Use `PlatformerMovement` behavior, set `jumpPower` in config                                            |
| "Create patrol AI"               | Use `PatrolAI` behavior with `speed=80`                                                                 |
| "Write damage system"            | Use `BasePlayer.takeDamage()`, override `onDamageTaken` hook                                            |
| "Code dash attack"               | Use `DashAttackSkill` with `dashDistance=300`                                                           |
| "Build screen shake system"      | Use `ScreenEffectHelper.shake()`                                                                        |
| "Design map from scratch"        | Use predefined template, modify platform positions                                                      |
| "Custom collision detection"     | Use `addCollider`/`addOverlap` from utils, add in `setupCustomCollisions` hook                          |
| "Build projectile system"        | Use `RangedAttack` behavior with `projectileKey` (auto-falls back to generic bullet if texture missing) |
| "Implement double jump"          | Set `doubleJumpEnabled: true` in PlatformerMovement config                                              |
| "Create returning weapon skill"  | Use `BoomerangSkill` with `projectileKey`                                                               |
| "Implement multi-missile volley" | Use `MultishotSkill` with `projectileCount` and `spreadAngle`                                           |
| "Create grenade/boulder throw"   | Use `ArcProjectileSkill` with `gravity` and `explosionRadius`                                           |
| "Create health bar UI"           | Override `UIScene` with health display                                                                  |
| "Implement scoring system"       | Override `onEnemyKilled` hook, track score in scene                                                     |
