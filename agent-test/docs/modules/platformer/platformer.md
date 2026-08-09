# Platformer Module Manual

> API reference and template guide. Minimal code.

---

## 1. Available Behaviors

Import from `../behaviors`. Use in `Player.ts` or enemy files.

### Movement & Combat (Basic)

| Behavior             | Config Params                                                                                                       | Description                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `PlatformerMovement` | `walkSpeed`, `jumpPower`, `airControl?`, `coyoteTime?`, `jumpBufferTime?`, `doubleJumpEnabled?`, `doubleJumpPower?` | Horizontal movement and jumping (optional double jump) |
| `MeleeAttack`        | `damage`, `range?`, `width?`, `cooldown?`                                                                           | Creates attack trigger zone                            |
| `RangedAttack`       | `damage`, `projectileKey`, `projectileSpeed?`, `cooldown?`                                                          | Shoots projectiles                                     |
| `PatrolAI`           | `speed`, `minX?`, `maxX?`, `detectCliffs?`                                                                          | Walk back and forth                                    |
| `ChaseAI`            | `speed`, `detectionRange?`, `giveUpDistance?`, `stopDistance?`, `chaseVertical?`                                    | Follow target                                          |

### Ultimate Skills (Advanced)

| Skill                    | Style                         | Key Config                                                                                   |
| ------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `DashAttackSkill`        | Linear dash with collision    | `dashDistance`, `dashDuration`, `damage`, `hitRange`, `warningDuration?`                     |
| `TargetedAOESkill`       | Lock target + AOE at position | `aoeRadius`, `damage`, `strikeDelay`, `effectKey`                                            |
| `AreaDamageSkill`        | AOE around player             | `attackRange`, `damage`, `effectKey`, `chargeEffectKey?`                                     |
| `TargetedExecutionSkill` | Lock target + instant kill    | `executionDelay`, `totalDuration`, `effectKey`                                               |
| `BeamAttackSkill`        | Horizontal beam               | `beamLength`, `beamWidth`, `damage`, `penetrating?`                                          |
| `GroundQuakeSkill`       | Ground slam (grounded only)   | `damage`, `effectRange`, `effectCount`                                                       |
| `BoomerangSkill`         | Returning projectile          | `projectileKey`, `throwSpeed?`, `returnSpeed?`, `maxDistance?`, `damage?`                    |
| `MultishotSkill`         | Spread fire N projectiles     | `projectileKey`, `projectileCount?`, `spreadAngle?`, `damage?`                               |
| `ArcProjectileSkill`     | Gravity arc (grenade/boulder) | `projectileKey`, `launchSpeedX?`, `launchSpeedY?`, `damage?`, `gravity?`, `explosionRadius?` |

### Skill Usage Pattern

```typescript
// In Player.ts
protected initUltimate(): void {
  this.ultimate = this.behaviors.add('ultimate', new DashAttackSkill({
    id: 'dash',
    name: 'Power Dash',
    cooldown: 5000,
    dashDistance: 300,
    damage: 60,
    screenShake: { duration: 400, intensity: 0.01 },
  }));
}
```

---

## 2. Base Class Hooks

### BasePlayer Hooks

Override these in `Player.ts`:

| Hook                        | When Called        | Purpose                     |
| --------------------------- | ------------------ | --------------------------- |
| `initBehaviors(config)`     | Constructor        | Add custom behaviors        |
| `initUltimate()`            | Constructor        | Setup ultimate skill        |
| `onUpdate()`                | Every frame        | Custom per-frame logic      |
| `onDamageTaken(damage)`     | Taking damage      | Camera shake, sound effects |
| `onDeath()`                 | Player dies        | Death particles, effects    |
| `onHealthChanged(old, new)` | Health changes     | UI updates                  |
| `onUltimateUsed()`          | Ultimate activated | Sound, visual feedback      |
| `onUltimateComplete()`      | Ultimate finished  | Cleanup                     |

### BaseEnemy Hooks

Override these in enemy files:

| Hook                    | When Called                         | Purpose                |
| ----------------------- | ----------------------------------- | ---------------------- |
| `initBehaviors(config)` | Constructor                         | Add custom behaviors   |
| `onUpdate()`            | Every frame                         | Custom per-frame logic |
| `onDamageTaken(damage)` | Taking damage                       | Flash, knockback       |
| `onDeath()`             | Enemy dies                          | Drop items, score      |
| `executeAI()`           | Every frame (if `aiType: 'custom'`) | Custom AI logic        |

### BaseLevelScene Hooks

Override these in level scenes:

| Hook                      | When Called           | Purpose                                |
| ------------------------- | --------------------- | -------------------------------------- |
| `onPreCreate()`           | Before creation       | Pre-initialization                     |
| `onPostCreate()`          | After creation        | Post-initialization                    |
| `onPreUpdate()`           | Start of frame        | Pre-frame logic                        |
| `onPostUpdate()`          | End of frame          | Post-frame logic                       |
| `onPlayerDeath()`         | Player dies           | Custom game over                       |
| `onLevelComplete()`       | All enemies killed    | Custom victory (500 ms delay built-in) |
| `onEnemyKilled(enemy)`    | Enemy killed          | Score, drops                           |
| `setupCustomCollisions()` | After base collisions | Collectibles, triggers                 |
| `getPlayerClasses()`      | Player creation       | Multi-character support                |

### BaseLevelScene Built-in Features

| Feature           | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| Damage numbers    | Floating text on every hit (yellow for enemies, red for player) |
| Camera offset     | Player at bottom 1/3 of screen (`setFollowOffset(0, -128)`)     |
| Victory delay     | 500 ms pause before showing victory/complete screen             |
| Defensive updates | try-catch around player and enemy update calls                  |
| Scene cleanup     | `cleanupUIScenes()` in TitleScreen and CharacterSelectScene     |

---

## 3. Screen Effects Helper

Import `ScreenEffectHelper` from `../behaviors` for visual effects:

| Method                                           | Purpose         | Example                              |
| ------------------------------------------------ | --------------- | ------------------------------------ |
| `shake(scene, config)`                           | Screen shake    | `{ duration: 400, intensity: 0.01 }` |
| `shakeLight/Medium/Strong(scene)`                | Preset shakes   | Quick calls                          |
| `createDashTrail(scene, owner, key, tint?)`      | Dash trail      | Energy effects                       |
| `createExplosion(scene, x, y, config)`           | Explosion       | AOE visuals                          |
| `createVortex(scene, x, y, config, onComplete?)` | Vortex effect   | Execution skills                     |
| `showDamageNumber(scene, x, y, damage, color?)`  | Floating damage | Combat feedback                      |

**Bullet texture fallback**: `RangedAttack.shoot()` auto-generates fallback bullet textures if the configured `projectileKey` is missing. It will use `player_bullet` (yellow) or `enemy_bullet` (red) as a safe default.

---

## 4. Template Guide

### Creating Player

1. **Read**: `src/characters/_TemplatePlayer.ts`
2. **Copy**: `cp _TemplatePlayer.ts Player.ts`
3. **Modify**:
   - Rename class to `Player`
   - Update `textureKey` (from asset-pack.json)
   - Update `stats` (from gameConfig.json)
   - Update `animKeys` (from animations.json)
   - Override `initUltimate()` if using ultimate skill
   - Override other hooks as needed

### Creating Enemies

1. **Read**: `src/characters/_TemplateEnemy.ts`
2. **Create**: New file `Enemy.ts` (do not rename template)
3. **Configure**:
   - Set `aiType`: `'patrol'` | `'chase'` | `'stationary'` | `'custom'`
   - Set `combat`: `hasMelee` or `hasRanged`
   - Override `onDeath()` for drops
   - Override `executeAI()` for boss logic

### Creating Boss (Custom AI)

```typescript
// In Boss.ts
protected executeAI(): void {
  // Phase-based boss logic
  if (this.getHealthPercentage() > 50) {
    // Phase 1: Patrol and punch
    this.behaviors.get('patrol')?.update();
  } else {
    // Phase 2: Chase and dash attack
    this.behaviors.get('chase')?.update();
    if (this.canUseDash()) this.useDash();
  }
}
```

### Creating Levels

1. **Read**: `src/scenes/_TemplateLevel.ts`
2. **Copy**: `cp _TemplateLevel.ts Level1Scene.ts`
3. **Implement abstract methods**:
   - `setupMapSize()` - Set mapWidth, mapHeight
   - `createBackground()` - Add background sprite
   - `createTileMap()` - Load tilemap
   - `createDecorations()` - Add collectibles (player NOT created yet)
   - `createPlayer()` - Create player instance
   - `createEnemies()` - Create enemy instances
4. **Override hooks** for custom collisions, scoring

### Tilemap Layer Names (CRITICAL)

The `generate-tilemap` tool creates JSON with these **exact** layer names:

- Tile layer: `"Ground"` (capital G)
- Object layer: `"Objects"` (capital O)

```typescript
// In createTileMap()
this.groundLayer = this.map.createLayer('Ground', this.groundTileset, 0, 0)!;

// Read spawn points from Objects layer
const objectLayer = this.map.getObjectLayer('Objects');
const playerSpawn = objectLayer?.objects.find(
  (obj) => obj.type === 'player_spawn',
);
```

---

## 5. PlayerConfig Interface

| Field                         | Type    | Description                                         |
| ----------------------------- | ------- | --------------------------------------------------- |
| `textureKey`                  | string  | Initial texture (IMAGE key from asset-pack)         |
| `displayHeight?`              | number  | Sprite height in pixels (default 128)               |
| `stats.maxHealth`             | number  | From gameConfig                                     |
| `stats.walkSpeed`             | number  | From gameConfig                                     |
| `stats.jumpPower`             | number  | From gameConfig                                     |
| `stats.attackDamage`          | number  | From gameConfig                                     |
| `movement.coyoteTime?`        | number  | Grace period after leaving platform (ms)            |
| `movement.jumpBufferTime?`    | number  | Buffer jump input before landing (ms)               |
| `movement.doubleJumpEnabled?` | boolean | Allow one extra jump while airborne (default false) |
| `movement.doubleJumpPower?`   | number  | Double jump force (defaults to jumpPower)           |
| `combat.rangedKey?`           | string  | Projectile texture key (enables shooting)           |
| `animKeys`                    | object  | Animation key mappings                              |

---

## 6. EnemyConfig Interface

| Field                | Type    | Description                                          |
| -------------------- | ------- | ---------------------------------------------------- |
| `textureKey`         | string  | Initial texture                                      |
| `displayName?`       | string  | Boss name shown in UI health bar                     |
| `displayHeight?`     | number  | Sprite height (default 80)                           |
| `hasGravity?`        | boolean | Affected by gravity (default true)                   |
| `stats.maxHealth`    | number  | Enemy health                                         |
| `stats.speed`        | number  | Movement speed                                       |
| `stats.damage`       | number  | Contact/attack damage                                |
| `ai.type`            | string  | `'patrol'` / `'chase'` / `'stationary'` / `'custom'` |
| `ai.patrolMinX?`     | number  | Left patrol bound                                    |
| `ai.patrolMaxX?`     | number  | Right patrol bound                                   |
| `ai.detectionRange?` | number  | Chase detection range                                |
| `combat.hasMelee?`   | boolean | Enable melee attacks                                 |
| `combat.hasRanged?`  | boolean | Enable ranged attacks                                |
| `combat.rangedKey?`  | string  | Projectile texture                                   |

---

## 7. Multi-Character System

### CharacterSelectScene

Provides character selection before gameplay:

```typescript
// Override in your CharacterSelectScene
protected getCharacters(): CharacterData[] {
  return [
    {
      name: "HERO",
      previewKey: "hero_idle_frame1",
      description: "Balanced fighter",
      playerClass: "HeroPlayer",
    },
    {
      name: "MAGE",
      previewKey: "mage_idle_frame1",
      description: "Powerful magic",
      playerClass: "MagePlayer",
    },
  ];
}
```

### Dynamic Player Loading

In level scenes:

```typescript
protected getPlayerClasses(): PlayerClassMap {
  return {
    "HeroPlayer": HeroPlayer,
    "MagePlayer": MagePlayer,
  };
}

protected createPlayer(): void {
  // Uses registry to get selected character
  this.player = this.createPlayerByType(spawnX, spawnY, HeroPlayer);
}
```

---

## 8. Animation Keys (animKeys)

| Key        | Default                 | Purpose                     |
| ---------- | ----------------------- | --------------------------- |
| `idle`     | `player_idle_anim`      | Standing still              |
| `walk`     | `player_walk_anim`      | Walking/running             |
| `jumpUp`   | `player_jump_up_anim`   | Jumping upward              |
| `jumpDown` | `player_jump_down_anim` | Falling                     |
| `punch`    | `player_punch_anim`     | Melee attack 1 (odd combo)  |
| `kick`     | `player_kick_anim`      | Melee attack 2 (even combo) |
| `shoot`    | `player_shoot_anim`     | Ranged attack               |
| `ultimate` | `player_ultimate_anim`  | Ultimate skill              |
| `die`      | `player_die_anim`       | Death                       |

### animations.json Format (CRITICAL — game will crash without this)

> **⚠️ The template ships with an EMPTY `animations.json` (`{"anims": []}`). You MUST populate it with entries for EVERY character animation, or all sprites will be invisible/frozen.**

**MUST use Phaser format** — copy structure from `templates/core/public/assets/animations.json`:

```json
{
  "anims": [
    {
      "key": "hero_idle_anim",
      "type": "frame",
      "frames": [
        { "key": "hero_idle_01", "frame": 0, "duration": 200 },
        { "key": "hero_idle_02", "frame": 0, "duration": 200 }
      ],
      "repeat": -1
    }
  ]
}
```

**Naming conventions (three-layer sync):**

- **Image frame** (asset-pack.json): `{char}_{action}_{frame}` → `hero_idle_01`
- **Animation key** (animations.json): `{char}_{action}_anim` → `hero_idle_anim`
- **animKeys** (Player.ts): `idle: 'hero_idle_anim'`

Each animation has **exactly 2 frames maximum**. See `docs/asset_protocol.md#3.4` for full format.

---

## 9. Control Scheme

Default controls (configurable in scene):

| Key           | Action                                |
| ------------- | ------------------------------------- |
| WASD / Arrows | Move                                  |
| Space / W     | Jump                                  |
| Shift         | Melee Attack (alternating punch/kick) |
| E             | Ranged Attack                         |
| Q             | Ultimate Skill                        |

---

## 10. Scene Registration and LevelManager

### 10.1 LevelManager (CRITICAL)

The core `TitleScreen` calls `LevelManager.getFirstLevelScene()` to navigate after the player presses Enter. Default: `["Level1Scene"]`.

**You MUST update `LevelManager.ts`** to match your actual level scenes:

```typescript
// In LevelManager.ts
static readonly LEVEL_ORDER: string[] = [
  "JungleScene",    // First level
  "TempleScene",    // Second level
  "BossArenaScene", // Final boss
];
```

| Pattern                | LEVEL_ORDER                                    |
| ---------------------- | ---------------------------------------------- |
| Single Level           | `["Level1Scene"]`                              |
| Multi-Level            | `["Level1Scene", "Level2Scene", "BossScene"]`  |
| Character Select first | `["CharacterSelectScene", "Level1Scene", ...]` |

**If `LEVEL_ORDER[0]` doesn't match a registered scene key, the game will CRASH with "Scene key not found".**

### 10.2 main.ts Scene Registration

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

### 10.3 Registration Checklist

- [ ] `LevelManager.ts` — `LEVEL_ORDER` lists all level scenes in correct play order
- [ ] `main.ts` — Import and register ALL level scenes (+ `CharacterSelectScene` if using multi-character)
- [ ] Scene keys in `LEVEL_ORDER` match the `key` property in each scene class exactly
- [ ] Every `scene.start('X')` target has a matching registration

---

## 11. Quick Reference

### AI Type Guide

| Type         | Use When                                          |
| ------------ | ------------------------------------------------- |
| `patrol`     | Simple back-and-forth enemy                       |
| `chase`      | Enemy that follows player                         |
| `stationary` | Turret, doesn't move                              |
| `custom`     | Complex boss with phases (override `executeAI()`) |

### Ultimate Skill Guide

| Skill                    | Best For                                    |
| ------------------------ | ------------------------------------------- |
| `DashAttackSkill`        | Melee characters, fast attacks              |
| `TargetedAOESkill`       | Ranged characters, area denial              |
| `AreaDamageSkill`        | Berserker characters, close combat          |
| `BeamAttackSkill`        | Tech characters, long range                 |
| `GroundQuakeSkill`       | Heavy characters, crowd control             |
| `TargetedExecutionSkill` | Assassin characters, single target          |
| `BoomerangSkill`         | Thrown-weapon characters, returning attacks |
| `MultishotSkill`         | Gunner/mech characters, spread fire         |
| `ArcProjectileSkill`     | Heavy/siege characters, arcing throws       |
