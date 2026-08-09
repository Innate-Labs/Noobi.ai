/**
 * ============================================================================
 * TEMPLATE: Level Scene (Top-Down)
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
 * ABSTRACT METHODS TO IMPLEMENT:
 * - setupMapSize(): Set map dimensions
 * - createEnvironment(): Create background, tilemap, decorations
 * - createEntities(): Create player and enemies
 *
 * HOOK METHODS AVAILABLE:
 * - onPreCreate(): Before creation
 * - onPostCreate(): After creation
 * - onPreUpdate(): Before each frame
 * - onPostUpdate(): After each frame
 * - onPlayerDeath(): When player dies
 * - onLevelComplete(): When level completed
 * - onEnemyKilled(enemy): When enemy dies
 * - setupCustomCollisions(): Custom collision handlers
 * - getCameraConfig(): Customize camera settings
 * - createCrosshair(): Custom cursor/crosshair
 * ============================================================================
 */

import { BaseLevelScene } from './BaseLevelScene';
import * as utils from '../utils';
// TODO: Import your character classes
// import { Player } from "../characters/Player";
// import { Trooper } from "../characters/Trooper";

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
   * Preload — create bullet textures here
   */
  preload(): void {
    // Create default bullet textures (if using shooting)
    utils.createBulletTextures(this);
  }

  /**
   * Create — build the level
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
   * Update — called every frame
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
    // Default: 18×12 tiles (compact, fills screen)
    this.mapWidth = 18 * this.tileSize; // 1152px
    this.mapHeight = 12 * this.tileSize; // 768px
  }

  createEnvironment(): void {
    // =========================================================================
    // STEP 1: Background
    // =========================================================================
    // Top-down games with dual tilesets usually DON'T need a background image.
    // Floor tiles cover walkable areas, wall tiles cover barriers.
    // Use setBackgroundColor for any void areas outside the map.
    this.cameras.main.setBackgroundColor('#1a1a2e');
    // OPTIONAL: If your game has large open spaces without tiles, add a TileSprite:
    // this.background = this.add.tileSprite(0, 0, this.mapWidth, this.mapHeight, "bg_key");
    // (this.background as Phaser.GameObjects.TileSprite).setOrigin(0, 0);
    // this.background.setDepth(-100);

    // =========================================================================
    // STEP 2: Tilemap (DUAL TILESETS — floor + walls)
    // =========================================================================
    // Top-down games use TWO tilemap JSONs generated from the SAME ASCII map
    // (copied from design_rules.md Template A/B/C/D):
    //
    //   generate_tilemap({ tileset_key: "theme_floor", map_key: "level1_floor", mode: "floor",
    //     object_markers: { "P": "player_spawn", "E": "enemy_spawn", "B": "boss_spawn", "D": "door", "O": "obstacle" } })
    //   generate_tilemap({ tileset_key: "theme_walls", map_key: "level1_walls", mode: "walls" })
    //
    // NAMING CHAIN (all must match):
    //   Asset key ("theme_floor") = tileset_key = addTilesetImage(name, cacheKey)
    //   map_key ("level1_floor") = this.make.tilemap({ key: "level1_floor" })
    //
    // TODO: Replace "theme_floor/walls" and "level1_floor/walls" with your actual keys.

    // 2a. Floor map — walkable area (no collision)
    const floorMap = this.make.tilemap({ key: 'level1_floor' }); // TODO: = map_key from generate_tilemap
    this.floorTileset = floorMap.addTilesetImage(
      'theme_floor', // TODO: = tileset_key (tileset name inside JSON)
      'theme_floor', // TODO: = tileset_key (asset-pack.json cache key)
    )!;
    this.floorLayer = floorMap.createLayer('Ground', this.floorTileset, 0, 0)!;
    this.floorLayer.setDepth(-50);

    // 2b. Walls map — collision boundaries
    const wallsMap = this.make.tilemap({ key: 'level1_walls' }); // TODO: = map_key from generate_tilemap
    this.wallsTileset = wallsMap.addTilesetImage(
      'theme_walls', // TODO: = tileset_key (tileset name inside JSON)
      'theme_walls', // TODO: = tileset_key (asset-pack.json cache key)
    )!;
    this.wallsLayer = wallsMap.createLayer('Ground', this.wallsTileset, 0, 0)!;
    this.wallsLayer.setCollisionByExclusion([-1, 0]);
    this.wallsLayer.setDepth(0);

    // 2c. Store primary map for dimensions & object layer queries
    this.map = floorMap;

    // =========================================================================
    // STEP 3: Obstacles from tilemap O markers (physics-enabled, Y-sorted)
    // =========================================================================
    // Obstacles are NOT tilemap tiles — they are separate image assets with
    // physics bodies that block movement like walls. They are Y-sorted with
    // player and enemies. Collisions are handled by BaseLevelScene.
    //
    // O positions from ASCII map are stored in the Objects layer of the
    // floor JSON (via object_markers: { "O": "obstacle" }).
    // Read them and create physics sprites:
    const obstacleTextures = ['supply_crate', 'barrel']; // TODO: Your obstacle keys
    let obstacleIndex = 0;
    const objectLayer = this.map.getObjectLayer('Objects');
    if (objectLayer) {
      for (const obj of objectLayer.objects) {
        if (obj.type === 'obstacle') {
          const key = obstacleTextures[obstacleIndex % obstacleTextures.length];
          this.createObstacle(key, obj.x!, obj.y!, 48);
          obstacleIndex++;
        }
      }
    }

    // =========================================================================
    // STEP 4: Decorations (visual-only props — NOT Y-sorted, no physics)
    // =========================================================================
    // Decorations add visual interest without affecting gameplay.
    // Place near room edges, corners, or specific locations.
    /*
    utils.createDecoration(this, this.decorations, "computer_terminal", 2 * this.tileSize, 5 * this.tileSize, 64);
    utils.createDecoration(this, this.decorations, "energy_pillar", 12 * this.tileSize, 3 * this.tileSize, 80);
    */
  }

  // ============================================================================
  // HELPER: Create physics obstacle
  // ============================================================================

  /**
   * Create a physics-enabled obstacle (crate, barrel, etc.)
   * Added to this.obstacles group (auto Y-sorted + auto collision).
   */
  private createObstacle(
    key: string,
    x: number,
    y: number,
    height: number,
  ): Phaser.Physics.Arcade.Image {
    const obstacle = this.physics.add.image(x, y, key);
    utils.initScale(obstacle, { x: 0.5, y: 1.0 }, undefined, height, 0.8, 0.5);

    // Static obstacle — immovable and not affected by gravity
    (obstacle.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    (obstacle.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    (obstacle.body as Phaser.Physics.Arcade.Body).pushable = false;

    this.obstacles.add(obstacle);
    return obstacle;
  }

  createEntities(): void {
    // =========================================================================
    // STEP 1: Create Player
    // =========================================================================
    // Get spawn position from tilemap Objects layer (player_spawn marker)
    let spawnX = 3 * this.tileSize;
    let spawnY = 10 * this.tileSize;

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
    // this.player = this.createPlayerByType(spawnX, spawnY, Player);

    // PLACEHOLDER: Replace with your actual player class!
    // Example: this.player = this.createPlayerByType(spawnX, spawnY, Player);
    //
    // This stub satisfies BaseLevelScene and UIScene interfaces.
    // Remove it when you create a real player class extending BasePlayer.
    this.player = this.physics.add.sprite(spawnX, spawnY, 'player_idle_frame1');
    this.player.setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.player.update = () => {};
    this.player.meleeTrigger = null;
    this.player.isAttacking = false;
    this.player.attackDamage = 25;
    this.player.isDead = false;
    this.player.isHurting = false;
    this.player.isInvulnerable = false; // OK: this is a plain sprite, not BasePlayer
    this.player.health = 100;
    this.player.maxHealth = 100;
    this.player.getHealthPercentage = () =>
      (this.player.health / this.player.maxHealth) * 100;
    this.player.getDashCooldownProgress = () => 1;
    this.player.takeDamage = (d: number) => {
      this.player.health -= d;
    };

    // =========================================================================
    // STEP 2: Create Enemies
    // =========================================================================
    // TODO: Create enemies from tilemap or hardcode positions

    // Example: Create enemy from class
    /*
    const trooper = new Trooper(this, 10 * this.tileSize, 10 * this.tileSize);
    trooper.setTarget(this.player);
    this.enemies.add(trooper);
    */

    // Example: Create from tilemap object layer
    /*
    if (objectLayer) {
      for (const obj of objectLayer.objects) {
        if (obj.type === 'enemy_spawn') {
          const enemy = new Trooper(this, obj.x!, obj.y!);
          enemy.setTarget(this.player);
          this.enemies.add(enemy);
        }
        if (obj.type === 'boss_spawn') {
          const boss = new Boss(this, obj.x!, obj.y!);
          boss.setTarget(this.player);
          this.enemies.add(boss);
          if (boss.meleeTrigger) {
            this.enemyMeleeTriggers.add(boss.meleeTrigger);
          }
          this.boss = boss;
        }
      }
    }
    */
  }

  // ============================================================================
  // HOOKS — Override for custom behavior
  // ============================================================================

  /**
   * Setup custom collisions (player-decoration, triggers, etc.)
   * Player EXISTS at this point — safe to add player collisions
   */
  protected override setupCustomCollisions(): void {
    // Add custom collision/overlap logic here
    // Player EXISTS at this point — safe to add player collisions
  }

  /**
   * Called when an enemy is killed
   */
  protected override onEnemyKilled(enemy: any): void {
    // Example: Add score
    // this.score += 100;
  }

  /**
   * Called when player dies
   */
  protected override onPlayerDeath(): void {
    this.backgroundMusic?.stop();
    super.onPlayerDeath();
  }

  /**
   * Called when level is completed
   */
  protected override onLevelComplete(): void {
    this.backgroundMusic?.stop();
    super.onLevelComplete();
  }

  /**
   * Customize camera settings
   */
  protected override getCameraConfig(): {
    lerpX: number;
    lerpY: number;
    zoom: number;
  } {
    return {
      lerpX: 0.1,
      lerpY: 0.1,
      zoom: 1, // Keep at 1.0 for compact maps (18×12). Only reduce for large exploration maps.
    };
  }
}
