import Phaser from 'phaser';
import { BaseGameScene, type PlayerClassMap } from './BaseGameScene';
import * as utils from '../utils';

// Re-export for backward compatibility
export { type PlayerClassMap } from './BaseGameScene';

/**
 * BaseLevelScene - Tilemap-Based Level Scene (Top-Down)
 *
 * Extends BaseGameScene with tilemap-specific functionality:
 *   - Dual tileset loading (floor + walls)
 *   - Camera follow with zoom and bounds
 *   - Wall collision layers (player/enemies/bullets vs walls)
 *   - Map-based world bounds
 *
 * Use this for: dungeon crawlers, exploration games, room-clearing shooters,
 * RPG combat, any game with a designed tilemap layout.
 *
 * For fixed-screen arena/shooter games, use BaseArenaScene instead.
 *
 * KEY DIFFERENCES FROM PLATFORMER BaseLevelScene:
 *   - Zero gravity (arcade physics with gravity.y = 0)
 *   - Y-Sort depth rendering (entities at lower Y appear in front)
 *   - 2D camera follow (lerp on both axes)
 *   - No bottom-world-bound death (no falling off map)
 *   - Full 2D world bounds (all 4 sides enabled)
 *   - Contact damage uses 2D knockback
 *   - Tilemap uses top-down dual tilesets (floor + walls)
 *
 * TEMPLATE METHOD PATTERN:
 *   The createBaseElements() method defines the algorithm skeleton.
 *   Subclasses implement abstract methods to fill in the specifics.
 *
 * ABSTRACT METHODS (MUST implement):
 *   - setupMapSize(): Set map dimensions
 *   - createEnvironment(): Create tilemap, decorations, obstacles
 *   - createEntities(): Create player and enemies
 *
 * HOOK METHODS (CAN override — inherited from BaseGameScene):
 *   - onPreCreate(), onPostCreate()
 *   - onPreUpdate(), onPostUpdate()
 *   - onPlayerDeath(), onLevelComplete(), onEnemyKilled(enemy)
 *   - setupCustomCollisions()
 *   - getCameraConfig(), createCrosshair()
 *   - createPlayerBullet(...), createEnemyBullet(...)
 *
 * Usage:
 *   export class Level1Scene extends BaseLevelScene {
 *     constructor() { super({ key: 'Level1Scene' }); }
 *     setupMapSize() { this.mapWidth = 18 * this.tileSize; this.mapHeight = 12 * this.tileSize; }
 *     createEnvironment() { ... }
 *     createEntities() { this.player = new Player(this, x, y); ... }
 *   }
 */
export abstract class BaseLevelScene extends BaseGameScene {
  // ============================================================================
  // MAP DIMENSIONS
  // ============================================================================

  /** Map width in pixels (columns × tileSize) */
  public mapWidth: number = 0;

  /** Map height in pixels (rows × tileSize) */
  public mapHeight: number = 0;

  /** Tile size in pixels (default 64) */
  public tileSize: number = 64;

  // ============================================================================
  // TILEMAP (Dual Tilesets: floor + walls)
  // ============================================================================

  /** Primary map reference (typically the floor map) — used for dimensions & Object Layer */
  public map!: Phaser.Tilemaps.Tilemap;

  /** Floor tileset image */
  public floorTileset!: Phaser.Tilemaps.Tileset;

  /** Walls tileset image */
  public wallsTileset!: Phaser.Tilemaps.Tileset;

  /** Floor layer — walkable area, no collision */
  public floorLayer!: Phaser.Tilemaps.TilemapLayer;

  /** Walls layer — collision boundaries */
  public wallsLayer!: Phaser.Tilemaps.TilemapLayer;

  // ============================================================================
  // BACKGROUND
  // ============================================================================

  public background!: Phaser.GameObjects.TileSprite | Phaser.GameObjects.Image;

  // ============================================================================
  // TEMPLATE METHOD: CREATE FLOW (Tilemap Mode)
  // ============================================================================

  /**
   * Create all level elements in the correct order.
   * This is the Template Method — call this in your create() method.
   */
  createBaseElements(): void {
    this.gameCompleted = false;

    // HOOK: Pre-create
    this.onPreCreate();

    // === PHASE 1: Map Setup ===
    this.setupMapSize();
    this.worldWidth = this.mapWidth;
    this.worldHeight = this.mapHeight;

    // === PHASE 2: Group Initialization (BEFORE environment!) ===
    this.initializeGroups();

    // === PHASE 3: Environment (tilemap) ===
    this.createEnvironment();

    // === PHASE 4: Entity Creation ===
    this.createEntities();

    // === PHASE 4.5: Crosshair (HOOK) ===
    this.createCrosshair();

    // === PHASE 5: System Setup ===
    this.setupCamera();
    this.setupWorldBounds();
    this.setupInputs();
    this.configurePhysics();

    // === PHASE 6: Collision Setup ===
    this.setupCoreCollisions(); // entity-vs-entity (from BaseGameScene)
    this.setupWallCollisions(); // entity-vs-tilemap (tilemap-specific)
    this.setupCustomCollisions(); // HOOK

    // === PHASE 7: UI Launch ===
    this.scene.launch('UIScene', { gameSceneKey: this.scene.key });

    // HOOK: Post-create
    this.onPostCreate();
  }

  // ============================================================================
  // TILEMAP-SPECIFIC SETUP
  // ============================================================================

  /**
   * Setup camera to follow player with 2D lerp, bounded to map
   */
  private setupCamera(): void {
    if (!this.player) {
      console.warn(
        'BaseLevelScene.setupCamera: this.player is null — did createEntities() set it?',
      );
      return;
    }

    const cameraConfig = this.getCameraConfig();

    this.cameras.main.setBounds(0, 0, this.mapWidth, this.mapHeight);
    this.cameras.main.startFollow(this.player);
    this.cameras.main.setLerp(cameraConfig.lerpX, cameraConfig.lerpY);

    if (cameraConfig.zoom !== 1) {
      this.cameras.main.setZoom(cameraConfig.zoom);
    }
  }

  /**
   * Setup world physics bounds — all 4 sides for top-down, based on map size
   */
  private setupWorldBounds(): void {
    this.physics.world.setBounds(
      0,
      0,
      this.mapWidth,
      this.mapHeight,
      true,
      true,
      true,
      true,
    );

    if (this.player?.setCollideWorldBounds) {
      this.player.setCollideWorldBounds(true);
    }

    this.enemies.children.iterate((enemy: any) => {
      if (enemy?.setCollideWorldBounds) {
        enemy.setCollideWorldBounds(true);
      }
      return true;
    });
  }

  /**
   * Setup wall collisions — player, enemies, and bullets vs tilemap walls layer
   * This is tilemap-specific (BaseArenaScene has no walls layer).
   */
  private setupWallCollisions(): void {
    if (!this.wallsLayer) return;

    // Player & enemies vs walls
    utils.addCollider(this, this.player, this.wallsLayer);
    utils.addCollider(this, this.enemies, this.wallsLayer);

    // Bullets vs walls (destroy on hit)
    utils.addCollider(
      this,
      this.playerBullets,
      this.wallsLayer,
      (bullet: any) => this.destroyBullet(bullet),
    );
    utils.addCollider(this, this.enemyBullets, this.wallsLayer, (bullet: any) =>
      this.destroyBullet(bullet),
    );
  }

  // ============================================================================
  // WIN CONDITION (Tilemap Mode: all enemies dead)
  // ============================================================================

  /**
   * Check if all enemies are defeated — triggers onLevelComplete().
   */
  protected override checkWinCondition(): void {
    const activeEnemyCount = this.enemies.children.entries.filter(
      (enemy: any) => enemy.active && !enemy.isDead,
    ).length;

    if (activeEnemyCount === 0 && !this.gameCompleted) {
      this.gameCompleted = true;
      this.onLevelComplete();
    }
  }

  // ============================================================================
  // ABSTRACT METHODS — MUST be implemented by subclass
  // ============================================================================

  /**
   * Set map dimensions. Must set: this.mapWidth, this.mapHeight
   * Example: this.mapWidth = 18 * this.tileSize;
   */
  abstract setupMapSize(): void;

  /**
   * Create the game environment (tilemap, decorations, obstacles).
   *
   * Must set: this.map, this.floorTileset, this.wallsTileset,
   *           this.floorLayer, this.wallsLayer
   *
   * Top-down games use DUAL TILESETS (floor + walls):
   *   - Load two tilemap JSONs (one floor, one walls)
   *   - Floor layer: walkable area, no collision
   *   - Walls layer: collision boundaries
   *   - Store the floor map as this.map (for dimensions & Object Layer)
   *
   * NOTE: All groups (this.decorations, this.obstacles, etc.) are already
   * initialized — safe to add items to them.
   */
  abstract createEnvironment(): void;

  /**
   * Create all entities (player, enemies).
   * Must set: this.player
   * Must add enemies to: this.enemies
   * Must add boss melee triggers to: this.enemyMeleeTriggers
   */
  abstract createEntities(): void;
}
