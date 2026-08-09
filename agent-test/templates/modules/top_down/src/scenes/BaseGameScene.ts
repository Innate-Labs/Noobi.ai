import Phaser from 'phaser';
import { LevelManager } from '../LevelManager';
import * as utils from '../utils';

/**
 * Player class registry for dynamic player creation
 * Maps playerClass string to actual class constructor
 */
export type PlayerClassMap = Record<
  string,
  new (scene: Phaser.Scene, x: number, y: number) => any
>;

/**
 * BaseGameScene - Common Foundation for ALL Top-Down Game Scenes
 *
 * This is the **shared layer** inherited by both:
 *   - BaseLevelScene  (tilemap-based levels: dungeons, exploration)
 *   - BaseArenaScene  (fixed-screen arenas: space shooters, survival)
 *
 * PROVIDES:
 *   - Group management (enemies, bullets, obstacles, decorations, ySortGroup)
 *   - Core collision setup (entity-vs-entity, NOT entity-vs-tilemap)
 *   - Y-Sort depth rendering
 *   - Update loop (player, enemies, bullets, Y-sort)
 *   - Input setup (WASD, mouse, dash, melee, ranged)
 *   - Hook system (onEnemyKilled, onPlayerDeath, onLevelComplete, …)
 *   - Bullet creation hooks
 *
 * DOES NOT CONTAIN (subclass responsibility):
 *   - World construction (tilemap OR scrolling background)
 *   - Camera configuration (follow player OR static)
 *   - World/screen bounds setup
 *   - Tilemap-layer collisions (BaseLevelScene only)
 *   - Scrolling background / spawner (BaseArenaScene only)
 *
 * ARCHITECTURE:
 *   BaseGameScene  (you are here — shared utilities, no abstract methods)
 *     ├── BaseLevelScene   — tilemap: dual-tileset, camera follow, wall collisions
 *     └── BaseArenaScene   — arena: scrolling bg, screen bounds, wave spawner
 */
export abstract class BaseGameScene extends Phaser.Scene {
  // ============================================================================
  // SCENE STATE
  // ============================================================================

  /** Flag to prevent multiple completion triggers */
  public gameCompleted: boolean = false;

  // ============================================================================
  // WORLD DIMENSIONS (set by subclass before first update)
  // ============================================================================

  /**
   * World width in pixels.
   * - BaseLevelScene sets this to mapWidth (tile columns × tileSize)
   * - BaseArenaScene sets this to screenSize.width
   */
  public worldWidth: number = 0;

  /**
   * World height in pixels.
   * - BaseLevelScene sets this to mapHeight (tile rows × tileSize)
   * - BaseArenaScene sets this to screenSize.height
   */
  public worldHeight: number = 0;

  // ============================================================================
  // CORE GAME OBJECTS
  // ============================================================================

  /** Player character — set in createEntities() / createPlayer() */
  public player: any;

  /** Enemies group */
  public enemies!: Phaser.GameObjects.Group;

  /** Enemy melee triggers group (for boss attacks) */
  public enemyMeleeTriggers!: Phaser.GameObjects.Group;

  /** Decorations group (visual props — NOT Y-sorted, no physics) */
  public decorations!: Phaser.GameObjects.Group;

  /** Obstacles group (physics-enabled props like crates — auto Y-sorted) */
  public obstacles!: Phaser.GameObjects.Group;

  // ============================================================================
  // BULLET GROUPS
  // ============================================================================

  /** Player bullets group */
  public playerBullets!: Phaser.GameObjects.Group;

  /** Enemy bullets group */
  public enemyBullets!: Phaser.GameObjects.Group;

  // ============================================================================
  // Y-SORT CONTAINER
  // ============================================================================

  /**
   * Container for Y-sorted entities.
   * All entities that need depth sorting should be added here.
   * The base update loop sorts children by Y position each frame.
   */
  public ySortGroup!: Phaser.GameObjects.Group;

  // ============================================================================
  // INPUT CONTROLS
  // ============================================================================

  /** WASD keys for 8-directional movement */
  public wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  /** Space key for dash */
  public spaceKey!: Phaser.Input.Keyboard.Key;

  /** Shift key for melee attack */
  public shiftKey!: Phaser.Input.Keyboard.Key;

  /** E key for ranged attack */
  public eKey!: Phaser.Input.Keyboard.Key;

  /** Q key for special ability */
  public qKey!: Phaser.Input.Keyboard.Key;

  // ============================================================================
  // AUDIO
  // ============================================================================

  public backgroundMusic?: Phaser.Sound.BaseSound;

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor(config: string | Phaser.Types.Scenes.SettingsConfig) {
    super(config);
  }

  // ============================================================================
  // SHARED INITIALIZATION UTILITIES
  // Called by subclass createBaseElements() in the correct order
  // ============================================================================

  /**
   * Initialize all game-object groups.
   * Must be called BEFORE createEnvironment / createEntities.
   */
  protected initializeGroups(): void {
    this.decorations = this.add.group();
    this.obstacles = this.add.group();
    this.enemies = this.add.group();
    this.enemyMeleeTriggers = this.add.group();
    this.playerBullets = this.add.group();
    this.enemyBullets = this.add.group();
    this.ySortGroup = this.add.group();
  }

  /**
   * Setup input controls (WASD, Space, Shift, E, Q, mouse)
   */
  protected setupInputs(): void {
    // Disable browser context menu (required for right-click game actions)
    this.input.mouse?.disableContextMenu();

    // WASD 8-directional movement
    this.wasdKeys = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );
    this.shiftKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
    );
    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.qKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
  }

  /**
   * Configure physics for top-down — disable gravity
   */
  protected configurePhysics(): void {
    this.physics.world.gravity.y = 0;
  }

  // ============================================================================
  // CORE COLLISION SETUP (entity-vs-entity — NO tilemap layers)
  // ============================================================================

  /**
   * Setup all entity-vs-entity collisions.
   * Does NOT include tilemap wall collisions (BaseLevelScene adds those).
   */
  protected setupCoreCollisions(): void {
    this.setupObstacleCollisions();
    this.setupContactDamage();
    this.setupMeleeCollisions();
    this.setupBulletVsEntityCollisions();
  }

  /**
   * Obstacle collisions: player, enemies, and bullets vs physics obstacles
   */
  private setupObstacleCollisions(): void {
    // NOTE: Do NOT early-return if obstacles is empty — Phaser group colliders
    // are dynamic, so obstacles added later will be included automatically.
    utils.addCollider(this, this.player, this.obstacles);
    utils.addCollider(this, this.enemies, this.obstacles);
    utils.addCollider(this, this.playerBullets, this.obstacles, (bullet: any) =>
      this.destroyBullet(bullet),
    );
    utils.addCollider(this, this.enemyBullets, this.obstacles, (bullet: any) =>
      this.destroyBullet(bullet),
    );
  }

  /**
   * Contact damage: player touching enemy → 2D knockback + damage
   */
  private setupContactDamage(): void {
    utils.addOverlap(
      this,
      this.player,
      this.enemies,
      (player: any, enemy: any) => {
        if (player.isInvulnerable || player.isHurting || player.isDead) return;
        if (enemy.isDead) return;

        const knockbackForce = 200;
        const angle = Phaser.Math.Angle.Between(
          enemy.x,
          enemy.y,
          player.x,
          player.y,
        );
        player.setVelocity(
          Math.cos(angle) * knockbackForce,
          Math.sin(angle) * knockbackForce,
        );
        player.takeDamage(enemy.damage);
      },
    );
  }

  /**
   * Melee collisions: player melee ↔ enemies, enemy melee ↔ player
   */
  private setupMeleeCollisions(): void {
    // Player melee attacks enemies
    const playerMeleeTrigger =
      this.player.meleeTrigger || this.player.melee?.meleeTrigger;
    if (playerMeleeTrigger) {
      utils.addOverlap(
        this,
        playerMeleeTrigger,
        this.enemies,
        (trigger: any, enemy: any) => {
          if (!this.player.isAttacking) return;

          const meleeTargets =
            this.player.currentMeleeTargets ||
            this.player.melee?.currentTargets;
          if (meleeTargets?.has(enemy)) return;
          if (enemy.isHurting || enemy.isDead) return;

          meleeTargets?.add(enemy);

          const knockbackForce = 150;
          const angle = Phaser.Math.Angle.Between(
            this.player.x,
            this.player.y,
            enemy.x,
            enemy.y,
          );
          enemy.setVelocity(
            Math.cos(angle) * knockbackForce,
            Math.sin(angle) * knockbackForce,
          );

          const damage = this.player.attackDamage || this.player.melee?.damage;
          enemy.takeDamage(damage);

          if (enemy.isDead) {
            this.onEnemyKilled(enemy);
          }
        },
      );
    }

    // Enemy melee attacks player (for bosses)
    utils.addOverlap(
      this,
      this.enemyMeleeTriggers,
      this.player,
      (trigger: any, player: any) => {
        const enemy = trigger.owner;
        if (!enemy?.isAttacking) return;

        const meleeTargets =
          enemy.currentMeleeTargets || enemy.melee?.currentTargets;
        if (meleeTargets?.has(player)) return;
        if (player.isInvulnerable || player.isHurting || player.isDead) return;

        meleeTargets?.add(player);

        const knockbackForce = 300;
        const angle = Phaser.Math.Angle.Between(
          enemy.x,
          enemy.y,
          player.x,
          player.y,
        );
        player.setVelocity(
          Math.cos(angle) * knockbackForce,
          Math.sin(angle) * knockbackForce,
        );

        player.takeDamage(enemy.damage);
      },
    );
  }

  /**
   * Bullet-vs-entity collisions (NOT bullet-vs-wall — that's tilemap-specific)
   */
  private setupBulletVsEntityCollisions(): void {
    // Player bullets hit enemies
    utils.addOverlap(
      this,
      this.playerBullets,
      this.enemies,
      (bullet: any, enemy: any) => {
        if (enemy.isDead || enemy.isHurting) return;

        const knockbackForce = 100;
        if (bullet.body?.velocity) {
          const angle = Math.atan2(
            bullet.body.velocity.y,
            bullet.body.velocity.x,
          );
          enemy.setVelocity(
            Math.cos(angle) * knockbackForce,
            Math.sin(angle) * knockbackForce,
          );
        }

        const damage = bullet.damage ?? this.player.attackDamage ?? 10;
        enemy.takeDamage(damage);

        this.destroyBullet(bullet);

        if (enemy.isDead) {
          this.onEnemyKilled(enemy);
        }
      },
    );

    // Enemy bullets hit player
    utils.addOverlap(
      this,
      this.player,
      this.enemyBullets,
      (player: any, bullet: any) => {
        if (player.isInvulnerable || player.isHurting || player.isDead) return;

        const knockbackForce = 100;
        if (bullet.body?.velocity) {
          const angle = Math.atan2(
            bullet.body.velocity.y,
            bullet.body.velocity.x,
          );
          player.setVelocity(
            Math.cos(angle) * knockbackForce,
            Math.sin(angle) * knockbackForce,
          );
        }

        const damage = bullet.damage ?? 15;
        player.takeDamage(damage);

        this.destroyBullet(bullet);
      },
    );
  }

  /**
   * Destroy a bullet properly (calls bullet.hit() if available, else destroy)
   */
  protected destroyBullet(bullet: any): void {
    if (typeof bullet.hit === 'function') {
      bullet.hit();
    } else {
      bullet.destroy();
    }
  }

  // ============================================================================
  // TEMPLATE METHOD: UPDATE FLOW
  // ============================================================================

  /**
   * Base update logic — call this in your update() method.
   *
   * Includes virtual extension points that subclasses override:
   *   - updateBackground(): BaseArenaScene overrides for scrolling background
   *   - updateSpawner():    BaseArenaScene overrides for wave spawning
   *   - checkWinCondition(): BaseLevelScene overrides for "all enemies dead"
   */
  baseUpdate(): void {
    if (!this.player?.active) return;

    // HOOK: Pre-update
    this.onPreUpdate();

    // Virtual: scrolling background (BaseArenaScene)
    this.updateBackground();

    // Update player with input keys
    this.player.update(
      this.wasdKeys,
      this.spaceKey,
      this.shiftKey,
      this.eKey,
      this.qKey,
    );

    // Virtual: wave spawner (BaseArenaScene)
    this.updateSpawner();

    // Update enemies
    this.updateEnemies();

    // Update bullets (off-world cleanup)
    this.updateBullets();

    // Y-Sort depth rendering
    this.updateYSort();

    // Virtual: win condition (BaseLevelScene: all enemies dead)
    this.checkWinCondition();

    // HOOK: Post-update
    this.onPostUpdate();
  }

  /**
   * Update all enemies
   */
  private updateEnemies(): void {
    this.enemies.children.iterate((enemy: any) => {
      if (enemy?.update) {
        enemy.update();
      }
      return true;
    });
  }

  /**
   * Update bullets — destroy off-world projectiles
   */
  private updateBullets(): void {
    const destroyOffWorld = (bullet: any) => {
      if (!bullet?.active) return;
      if (bullet.update) bullet.update();

      if (
        bullet.x < -100 ||
        bullet.x > this.worldWidth + 100 ||
        bullet.y < -100 ||
        bullet.y > this.worldHeight + 100
      ) {
        this.destroyBullet(bullet);
      }
    };

    this.playerBullets.children.iterate((bullet: any) => {
      destroyOffWorld(bullet);
      return true;
    });

    this.enemyBullets.children.iterate((bullet: any) => {
      destroyOffWorld(bullet);
      return true;
    });
  }

  /**
   * Y-Sort: Sort entities by Y position for depth rendering.
   * Entities with higher Y (lower on screen) appear in front.
   *
   * Auto-includes: player, enemies, obstacles, ySortGroup items.
   * Does NOT include decorations (ground-level visual props).
   *
   * Uses body.bottom if available (foot position), otherwise sprite.y.
   */
  private updateYSort(): void {
    const sortables: any[] = [];

    if (this.player?.active) {
      sortables.push(this.player);
    }

    this.enemies.children.iterate((enemy: any) => {
      if (enemy?.active) sortables.push(enemy);
      return true;
    });

    this.obstacles.children.iterate((obstacle: any) => {
      if (obstacle?.active) sortables.push(obstacle);
      return true;
    });

    this.ySortGroup.children.iterate((entity: any) => {
      if (entity?.active) sortables.push(entity);
      return true;
    });

    sortables.sort((a, b) => {
      const aY = a.body?.bottom ?? a.y;
      const bY = b.body?.bottom ?? b.y;
      return aY - bY;
    });

    for (let i = 0; i < sortables.length; i++) {
      sortables[i].setDepth(i + 1);
    }
  }

  // ============================================================================
  // VIRTUAL EXTENSION POINTS (overridden by subclasses)
  // ============================================================================

  /**
   * Virtual: Update background each frame.
   * BaseArenaScene overrides for scrolling background.
   * BaseLevelScene: no-op (tilemap is static).
   */
  protected updateBackground(): void {
    // no-op — override in BaseArenaScene
  }

  /**
   * Virtual: Update enemy spawner each frame.
   * BaseArenaScene overrides for wave-based spawning.
   * BaseLevelScene: no-op (enemies are pre-placed on map).
   */
  protected updateSpawner(): void {
    // no-op — override in BaseArenaScene
  }

  /**
   * Virtual: Check win/lose conditions each frame.
   * BaseLevelScene overrides: all enemies dead → onLevelComplete()
   * BaseArenaScene: no default (endless mode — override for boss-kill, etc.)
   */
  protected checkWinCondition(): void {
    // no-op — override in subclass
  }

  // ============================================================================
  // HOOKS - Override in concrete class for custom behavior
  // ============================================================================

  /** HOOK: Called before any creation in createBaseElements() */
  protected onPreCreate(): void {}

  /** HOOK: Called after all creation in createBaseElements() */
  protected onPostCreate(): void {}

  /** HOOK: Called at the start of baseUpdate() */
  protected onPreUpdate(): void {}

  /** HOOK: Called at the end of baseUpdate() */
  protected onPostUpdate(): void {}

  /**
   * HOOK: Called when player dies.
   * Default: Launch GameOverUIScene
   */
  protected onPlayerDeath(): void {
    this.scene.launch('GameOverUIScene', {
      currentLevelKey: this.scene.key,
    });
  }

  /**
   * HOOK: Called when level is completed.
   * Default: Launch VictoryUIScene or GameCompleteUIScene
   */
  protected onLevelComplete(): void {
    if (LevelManager.isLastLevel(this.scene.key)) {
      this.scene.launch('GameCompleteUIScene', {
        currentLevelKey: this.scene.key,
      });
    } else {
      this.scene.launch('VictoryUIScene', {
        currentLevelKey: this.scene.key,
      });
    }
  }

  /**
   * HOOK: Called when an enemy is killed.
   * Use for scoring, drops, effects.
   */
  protected onEnemyKilled(enemy: any): void {
    // Override in subclass
  }

  /**
   * HOOK: Setup custom collision handlers.
   * Called after setupCoreCollisions() in createBaseElements().
   */
  protected setupCustomCollisions(): void {
    // Override in subclass
  }

  /**
   * HOOK: Create crosshair cursor (top-down aiming reticle).
   * Called after entity creation in createBaseElements().
   */
  protected createCrosshair(): void {
    // Override in subclass
  }

  /**
   * HOOK: Get camera configuration.
   * Override to customize camera behavior.
   */
  protected getCameraConfig(): { lerpX: number; lerpY: number; zoom: number } {
    return { lerpX: 0.1, lerpY: 0.1, zoom: 1 };
  }

  // ============================================================================
  // BULLET CREATION HOOKS
  // ============================================================================

  /**
   * HOOK: Create a player bullet and add it to the playerBullets group.
   * MUST call this.playerBullets.add(bullet) if overriding!
   */
  protected createPlayerBullet(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    textureKey: string = 'player_bullet',
  ): Phaser.Physics.Arcade.Sprite {
    const bullet = utils.createProjectileAtAngle(
      this,
      x,
      y,
      textureKey,
      angle,
      speed,
      undefined,
      damage,
    );
    this.playerBullets.add(bullet);
    return bullet;
  }

  /**
   * HOOK: Create an enemy bullet and add it to the enemyBullets group.
   * MUST call this.enemyBullets.add(bullet) if overriding!
   */
  protected createEnemyBullet(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    textureKey: string = 'enemy_bullet',
  ): Phaser.Physics.Arcade.Sprite {
    const bullet = utils.createProjectileAtAngle(
      this,
      x,
      y,
      textureKey,
      angle,
      speed,
      undefined,
      damage,
    );
    this.enemyBullets.add(bullet);
    return bullet;
  }

  // ============================================================================
  // DYNAMIC PLAYER CREATION (Character Select Integration)
  // ============================================================================

  /**
   * Get the player class map for dynamic player creation.
   * Override to register your player classes.
   */
  protected getPlayerClasses(): PlayerClassMap {
    return {};
  }

  /**
   * Create player based on registry selection or default.
   */
  protected createPlayerByType(
    x: number,
    y: number,
    defaultClass: new (scene: Phaser.Scene, x: number, y: number) => any,
  ): any {
    const selectedCharacter = this.registry.get('selectedCharacter') as
      | string
      | undefined;
    const playerClasses = this.getPlayerClasses();

    let PlayerClass = defaultClass;
    if (selectedCharacter && playerClasses[selectedCharacter]) {
      PlayerClass = playerClasses[selectedCharacter];
    }

    return new PlayerClass(this, x, y);
  }
}
