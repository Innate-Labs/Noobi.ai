/**
 * ============================================================================
 * TEMPLATE: Arena/Shooter Scene (Top-Down)
 * ============================================================================
 *
 * INSTRUCTIONS FOR AGENT:
 * 1. Copy this file and rename (e.g., SpaceLevel.ts)
 * 2. Update constructor key to match scene name
 * 3. Implement all abstract methods:
 *    - createBackground(): Scrolling or static background
 *    - createEntities(): Create player only (enemies are spawned dynamically)
 *    - spawnEnemy(): Called by spawner timer to create one enemy
 * 4. Add scene to main.ts: game.scene.add('SpaceLevel', SpaceLevel)
 * 5. Add to LevelManager.ts LEVEL_ORDER array
 * 6. Optionally override hooks for custom behavior
 *
 * WHEN TO USE THIS (instead of _TemplateLevel):
 *   - Space shooters, bullet-hell, survival arenas
 *   - Scrolling background (no tilemap)
 *   - Enemies spawn dynamically in waves (not pre-placed on map)
 *   - Fixed camera (no camera follow)
 *   - Score-based progression
 *
 * HOOK METHODS AVAILABLE (inherited from BaseGameScene + BaseArenaScene):
 *   - onPreCreate(), onPostCreate()
 *   - onPreUpdate(), onPostUpdate()
 *   - onPlayerDeath(), onLevelComplete(), onEnemyKilled(enemy)
 *   - setupCustomCollisions()
 *   - getCameraConfig(), createCrosshair()
 *   - getScrollSpeed(), getScrollDirection()
 *   - getSpawnInterval(), onDifficultyUp(level)
 *   - onScoreChanged(score)
 *   - onBossSpawn(), onBossDeath()
 *
 * COMMON PITFALLS:
 *   - checkWinCondition() is PROTECTED in BaseGameScene. If you add your own,
 *     use "protected override checkWinCondition()" — NOT "private".
 *     Using "private" causes TS2415: incompatible with base class.
 *   - Background: Use setupScrollingBg() ONLY for space shooters / vertical scrollers
 *     where the camera moves through space. For fixed-camera arena games (survival,
 *     obstacle, Red Light Green Light), use a STATIC background image instead.
 *   - Timer initialization: If you implement a countdown timer with stateTimer,
 *     initialize it to the ACTUAL duration, not 0. stateTimer = 0 triggers
 *     immediate state transitions on the first frame!
 * ============================================================================
 */

import { BaseArenaScene } from './BaseArenaScene';
import * as utils from '../utils';
// TODO: Import your character classes
// import { Player } from "../characters/Player";
// import { EnemyShip } from "../characters/EnemyShip";
// import { Boss } from "../characters/Boss";

export class _TemplateArena extends BaseArenaScene {
  // Add any level-specific properties here
  // public boss: any;

  constructor() {
    super({
      key: 'ArenaLevel1', // TODO: Change to your scene key
    });
  }

  // ============================================================================
  // SCENE LIFECYCLE
  // ============================================================================

  /**
   * Preload — create bullet textures here
   */
  preload(): void {
    utils.createBulletTextures(this);
  }

  /**
   * Create — call createBaseElements() then add level-specific setup
   */
  create(): void {
    this.createBaseElements();
  }

  /**
   * Update — call baseUpdate() for core loop
   */
  update(): void {
    this.baseUpdate();
  }

  // ============================================================================
  // ABSTRACT METHOD: Background
  // ============================================================================

  /**
   * Create scrolling or static background.
   *
   * CHOOSE ONE:
   *   - Scrolling: this.setupScrollingBg('bg_key')  — for space shooters / scrollers
   *   - Static:    this.add.image(...)               — for fixed-camera arenas / survival games
   *   - Solid:     this.cameras.main.setBackgroundColor('#hex')
   *
   * WARNING: Do NOT use setupScrollingBg() for fixed-camera games (survival, obstacle,
   * Red Light/Green Light). The background should remain stationary when the player
   * moves within a fixed arena.
   */
  createBackground(): void {
    // =========================================================================
    // Option A: Scrolling background (ONLY for space shooters, vertical scrollers)
    // =========================================================================
    // this.setupScrollingBg('space_background');

    // =========================================================================
    // Option B: Static background (survival arenas, obstacle games, fixed camera)
    // =========================================================================
    // this.cameras.main.setBackgroundColor('#87CEEB');
    // this.add.image(this.screenWidth / 2, this.screenHeight / 2, 'arena_bg')
    //   .setDisplaySize(this.screenWidth, this.screenHeight)
    //   .setDepth(-10);

    // =========================================================================
    // Option C: Solid color background only
    // =========================================================================
    this.cameras.main.setBackgroundColor('#1a1a2e');
  }

  // ============================================================================
  // ABSTRACT METHOD: Entity Creation
  // ============================================================================

  /**
   * Create the player character.
   * Enemies are NOT created here — they are spawned by spawnEnemy().
   *
   * Must set: this.player
   * Optional: configure spawner settings (bossKillThreshold, etc.)
   */
  createEntities(): void {
    // TODO: Create player at initial position (usually center-bottom for vertical shooters)
    // this.player = new Player(this, this.screenWidth / 2, this.screenHeight * 0.8);
    // Optional: Configure spawner
    // this.bossKillThreshold = 20;    // Boss spawns after 20 kills
    // this.difficultyInterval = 30000; // Difficulty increases every 30s
  }

  // ============================================================================
  // ABSTRACT METHOD: Enemy Spawning
  // ============================================================================

  /**
   * Spawn a single enemy instance.
   * Called automatically by the spawner timer.
   *
   * Choose enemy type based on this.difficultyLevel.
   * Spawn off-screen and give velocity toward play area.
   */
  spawnEnemy(): any {
    // TODO: Create enemy at off-screen position
    // For vertical scrollers, spawn above screen:
    // const x = Phaser.Math.Between(50, this.screenWidth - 50);
    // const y = -50;
    // const enemy = new EnemyShip(this, x, y);
    // this.enemies.add(enemy);
    //
    // Give downward velocity so enemy enters screen:
    // enemy.setVelocityY(Phaser.Math.Between(50, 100 + this.difficultyLevel * 20));
    //
    // return enemy;
  }

  // ============================================================================
  // HOOKS (override as needed)
  // ============================================================================

  /**
   * Override: Customize scroll speed (pixels per frame).
   * Can increase with difficulty for faster-paced gameplay.
   */
  protected getScrollSpeed(): number {
    return 1 + this.difficultyLevel * 0.2;
  }

  /**
   * Override: Customize spawn interval based on difficulty.
   * Lower = more enemies. Default formula: 2000ms - 200ms per level (min 500ms).
   */
  protected getSpawnInterval(): number {
    return Math.max(500, 2000 - (this.difficultyLevel - 1) * 200);
  }

  /**
   * Override: Called when enemy is killed.
   * Add score, handle drops, etc.
   */
  protected onEnemyKilled(enemy: any): void {
    // Call super to track kill count and boss trigger
    super.onEnemyKilled(enemy);

    // TODO: Add score
    // this.addScore(enemy.scoreValue ?? 100);

    // TODO: Drop power-ups (optional)
    // if (Phaser.Math.Between(1, 100) <= 20) {
    //   this.spawnPowerUp(enemy.x, enemy.y);
    // }
  }

  /**
   * Override: Called when difficulty increases.
   */
  protected onDifficultyUp(level: number): void {
    console.log(`Difficulty increased to level ${level}`);
    // TODO: Announce difficulty increase, spawn harder enemies, etc.
  }

  /**
   * Override: Called when score changes.
   * Emit events for UIScene to display.
   */
  protected onScoreChanged(score: number): void {
    // UIScene can listen via: this.scene.get('ArenaLevel1').events.on('scoreChanged', ...)
    // Or: this.events.emit('updateScore', score);  // if UIScene listens for this
  }

  // ============================================================================
  // BOSS HOOKS (optional — set this.bossKillThreshold > 0 to enable)
  // ============================================================================

  /**
   * Override: Spawn boss when kill threshold reached.
   * Clear existing enemies, show warning, create boss.
   */
  protected onBossSpawn(): void {
    // TODO: Clear enemies, show boss warning, spawn boss
    // this.enemies.clear(true, true);
    // this.boss = new Boss(this, this.screenWidth / 2, -100);
    // this.enemies.add(this.boss);
  }

  /**
   * Override: Called when boss is defeated.
   * Celebrate, resume spawning or end level.
   */
  protected onBossDeath(): void {
    this.bossActive = false;
    // this.onLevelComplete();  // End level after boss
    // OR: resume normal spawning
    // this.killCount = 0;
    // this.bossKillThreshold += 10;  // Next boss in 10 more kills
  }
}
