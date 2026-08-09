/**
 * ============================================================================
 * TEMPLATE: Level Scene
 * ============================================================================
 *
 * INSTRUCTIONS FOR AGENT:
 * 1. Copy this file and rename (e.g., Level1Scene.ts)
 * 2. Update constructor key to match scene name
 * 3. Implement all abstract methods
 * 4. Add scene to main.ts: game.scene.add('Level1Scene', Level1Scene)
 * 5. Add to LevelManager.ts LEVEL_ORDER array
 * 6. Optionally override hooks for custom behavior
 *
 * HOOK METHODS AVAILABLE:
 * - onPreCreate(): Before creation
 * - onPostCreate(): After creation
 * - onPreUpdate(): Before each frame
 * - onPostUpdate(): After each frame
 * - onPlayerDeath(): When player dies
 * - onLevelComplete(): When level completed (500 ms delay built-in)
 * - onEnemyKilled(enemy): When enemy dies
 * - setupCustomCollisions(): Custom collision handlers
 *
 * BUILT-IN FEATURES (from BaseLevelScene):
 * - Floating damage numbers on every hit (yellow for enemies, red for player)
 * - Camera offset: player positioned at bottom 1/3 of screen
 * - Victory delay: 500 ms before showing victory/complete screen
 * - Defensive update loop with try-catch for player and enemies
 * ============================================================================
 */

import { BaseLevelScene } from './BaseLevelScene';
import * as utils from '../utils';
// TODO: Import your character classes
// import { Player } from "../characters/Player";
// import { Slime } from "../characters/Slime";

export class _TemplateLevel extends BaseLevelScene {
  // Add any level-specific properties here
  // public score: number = 0;
  // public boss: any;

  constructor() {
    super({
      key: 'Level1Scene', // TODO: Change to your scene key
    });
  }

  // ============================================================================
  // SCENE LIFECYCLE
  // ============================================================================

  /**
   * Preload - create bullet textures here
   */
  preload(): void {
    // Create default bullet textures (if using shooting)
    utils.createBulletTextures(this);
  }

  /**
   * Create - build the level
   */
  create(): void {
    // Call template method to create all elements
    this.createBaseElements();

    // Optional: Background music
    // this.backgroundMusic = utils.safeAddSound(this, "level_bgm", { loop: true, volume: 0.6 });
    // this.backgroundMusic?.play();

    // Optional: Camera fade in
    this.cameras.main.fadeIn(500);
  }

  /**
   * Update - called every frame
   */
  update(): void {
    this.baseUpdate();
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  setupMapSize(): void {
    // TODO: Set map dimensions (in pixels)
    // Based on tilemap size: width_tiles * this.tileSize
    this.mapWidth = 30 * this.tileSize; // 1920px
    this.mapHeight = 20 * this.tileSize; // 1280px
  }

  createBackground(): void {
    // TODO: Replace texture key with your background
    this.background = this.add.tileSprite(
      0,
      0,
      this.mapWidth,
      this.mapHeight,
      'level1_background', // TODO: Your background texture key
    );
    this.background.setOrigin(0, 0);
    this.background.setScrollFactor(0);
    this.background.setDepth(-100);
  }

  createTileMap(): void {
    // TODO: Replace keys with your tilemap and tileset

    // 1. Create tilemap from JSON
    this.map = this.make.tilemap({ key: 'level1_map' });

    // 2. Add tileset image
    // First param: tileset name in Tiled JSON (CASE SENSITIVE!)
    // Second param: texture key from asset-pack.json
    this.groundTileset = this.map.addTilesetImage(
      'tileset_name_in_tiled', // TODO: Replace - must match JSON exactly
      'tileset_texture_key', // TODO: Replace - must match asset-pack.json
    )!;

    // 3. Create layer
    // CRITICAL: Layer name is CASE SENSITIVE! Must match JSON exactly.
    // Our generate-tilemap tool uses "Ground" (capital G)
    this.groundLayer = this.map.createLayer(
      'Ground',
      this.groundTileset,
      0,
      0,
    )!;

    // 4. Enable collision (exclude empty tiles)
    this.groundLayer.setCollisionByExclusion([-1, 0]);
  }

  createDecorations(): void {
    // =========================================================================
    // WARNING: Player does NOT exist yet!
    // Do NOT add player collisions here. Use setupCustomCollisions() instead.
    // =========================================================================
    // Example: Create collectibles from tilemap object layer
    /*
    const objectLayer = this.map.getObjectLayer('Objects');
    if (objectLayer) {
      for (const obj of objectLayer.objects) {
        if (obj.type === 'coin') {
          const coin = this.physics.add.sprite(obj.x!, obj.y!, 'coin');
          utils.scaleCollectible(coin, utils.COLLECTIBLE_SIZES.COIN);
          (coin.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
          this.decorations.add(coin);
        }
      }
    }
    */
    // Example: Static decorations
    // utils.createDecoration(this, this.decorations, "lamp", 5 * 64, 18 * 64, 192);
  }

  createPlayer(): void {
    // Get spawn position from tilemap Objects layer (player_spawn marker)
    let spawnX = 3 * this.tileSize; // Default fallback
    let spawnY = 18 * this.tileSize;

    const objectLayer = this.map.getObjectLayer('Objects');
    if (objectLayer) {
      const playerSpawn = objectLayer.objects.find(
        (obj) => obj.type === 'player_spawn',
      );
      if (playerSpawn) {
        spawnX = playerSpawn.x!;
        spawnY = playerSpawn.y!;
      }
    }

    // TODO: Create your player using createPlayerByType for character selection
    // Pass the CLASS, not a function! Example:
    // this.player = this.createPlayerByType(spawnX, spawnY, Player);
    //
    // For multiple characters, override getPlayerClasses():
    // protected getPlayerClasses(): PlayerClassMap {
    //   return { 'Warrior': Warrior, 'Mage': Mage };
    // }

    // Placeholder for template to work:
    // Remove this and use your Player class
    this.player = this.physics.add.sprite(spawnX, spawnY, 'player_idle_frame1');
    this.player.setCollideWorldBounds(true);
    this.player.update = () => {};
    this.player.meleeTrigger = null;
    this.player.isAttacking = false;
    this.player.attackDamage = 25;
    this.player.isDead = false;
    this.player.isHurting = false;
    this.player.isInvulnerable = false;
    this.player.health = 100;
    this.player.maxHealth = 100;
    this.player.getHealthPercentage = () =>
      (this.player.health / this.player.maxHealth) * 100;
    this.player.takeDamage = (d: number) => {
      this.player.health -= d;
    };
  }

  createEnemies(): void {
    // TODO: Create enemies from tilemap or hardcode positions
    // Example: Create enemy from class
    /*
    const slime = new Slime(this, 10 * this.tileSize, 18 * this.tileSize);
    this.enemies.add(slime);
    */
    // Example: Create from tilemap object layer
    /*
    const objectLayer = this.map.getObjectLayer('Objects');
    if (objectLayer) {
      for (const obj of objectLayer.objects) {
        if (obj.type === 'enemy_spawn') {
          const enemy = new Slime(this, obj.x!, obj.y!);
          this.enemies.add(enemy);
        }
        if (obj.type === 'boss_spawn') {
          const boss = new Boss(this, obj.x!, obj.y!);
          boss.setTarget(this.player);
          this.enemies.add(boss);
          if (boss.meleeTrigger) {
            this.enemyMeleeTriggers.add(boss.meleeTrigger);
          }
          this.boss = boss;  // Store reference for UI
        }
      }
    }
    */
  }

  // ============================================================================
  // HOOKS - Override for custom behavior
  // ============================================================================

  /**
   * Setup custom collisions (player-decoration, triggers, etc.)
   * Player EXISTS at this point - safe to add player collisions
   */
  protected override setupCustomCollisions(): void {
    // Example: Coin collection
    /*
    this.decorations.children.iterate((obj: any) => {
      if (obj?.texture?.key === 'coin') {
        utils.addOverlap(this, this.player, obj, () => {
          obj.destroy();
          this.score += 10;
          utils.safeAddSound(this, "coin_sfx", { volume: 0.5 })?.play();
        });
      }
      return true;
    });
    */
    // Example: Health pickup
    /*
    this.decorations.children.iterate((obj: any) => {
      if (obj?.texture?.key === 'health_pack') {
        utils.addOverlap(this, this.player, obj, () => {
          this.player.heal(25);
          obj.destroy();
        });
      }
      return true;
    });
    */
    // Example: Exit/door trigger
    /*
    utils.addOverlap(this, this.player, this.exitDoor, () => {
      this.gameCompleted = true;
      this.onLevelComplete();
    });
    */
  }

  /**
   * Called when an enemy is killed.
   * Damage numbers are shown automatically by BaseLevelScene on every hit.
   * Use this hook for scoring, item drops, or bonus effects on kill.
   */
  protected override onEnemyKilled(enemy: any): void {
    // Example: Add score
    // this.score += 100;
    // Example: Show a "KO" text at the enemy position
    // this.showDamageNumber(enemy.x, enemy.y - 20, 0, '#ff0000');
    // Example: Drop item
    // const coin = this.physics.add.sprite(enemy.x, enemy.y, 'coin');
    // this.decorations.add(coin);
  }

  /**
   * Called when player dies
   */
  protected override onPlayerDeath(): void {
    // Stop music
    this.backgroundMusic?.stop();

    // Default behavior: show game over screen
    super.onPlayerDeath();
  }

  /**
   * Called when level is completed.
   * BaseLevelScene adds a 500 ms delay before showing the victory screen
   * so the last kill animation can play out.
   */
  protected override onLevelComplete(): void {
    // Stop music
    this.backgroundMusic?.stop();

    // Example: Custom victory effect before the default screen appears
    // this.cameras.main.flash(300, 255, 255, 255);

    // Default behavior: show victory/complete screen (with built-in delay)
    super.onLevelComplete();
  }
}
