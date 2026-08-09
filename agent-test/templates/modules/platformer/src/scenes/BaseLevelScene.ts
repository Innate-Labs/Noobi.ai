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
 * BaseLevelScene - Level Scene Base Class (Platformer)
 *
 * This is the foundation for all platformer level scenes.
 * It uses the Template Method Pattern with extensive Hooks for customization.
 *
 * CONTROLS:
 *   - WASD: Move Left/Right or Jump
 *   - Space / W: Jump
 *   - Shift: Melee Attack (alternating combo: odd=punch, even=kick)
 *   - E: Ranged Attack
 *   - Q: Ultimate Skill (long cooldown)
 *
 * TEMPLATE METHOD PATTERN:
 *   The createBaseElements() method defines the algorithm skeleton.
 *   Subclasses implement abstract methods to fill in the specifics.
 *
 * HOOK PATTERN:
 *   Protected methods prefixed with "on" are hooks that can be overridden.
 *   Hooks provide extension points without modifying the base class.
 *
 * ABSTRACT METHODS (MUST implement):
 *   - setupMapSize(): Set map dimensions
 *   - createBackground(): Create background sprite
 *   - createTileMap(): Load tilemap and layers
 *   - createDecorations(): Create non-interactive elements
 *   - createPlayer(): Create player instance
 *   - createEnemies(): Create enemy instances
 *
 * HOOK METHODS (CAN override):
 *   - onPreCreate(): Before any creation
 *   - onPostCreate(): After all creation complete
 *   - onPreUpdate(): Before each frame update
 *   - onPostUpdate(): After each frame update
 *   - onPlayerDeath(): When player dies
 *   - onLevelComplete(): When level is completed
 *   - onEnemyKilled(enemy): When an enemy is killed
 *   - setupCustomCollisions(): Add custom collision handlers
 *
 * Usage:
 *   export class Level1Scene extends BaseLevelScene {
 *     constructor() { super({ key: 'Level1Scene' }); }
 *
 *     setupMapSize() { this.mapWidth = 1920; this.mapHeight = 1280; }
 *     createBackground() { ... }
 *     createTileMap() { ... }
 *     createDecorations() { ... }
 *     createPlayer() { this.player = new Player(this, x, y); }
 *     createEnemies() { ... }
 *   }
 */
export abstract class BaseLevelScene extends Phaser.Scene {
  // ============================================================================
  // SCENE STATE
  // ============================================================================

  /** Flag to prevent multiple completion triggers */
  public gameCompleted: boolean = false;

  // ============================================================================
  // MAP DIMENSIONS
  // ============================================================================

  /** Map width in pixels */
  public mapWidth: number = 0;

  /** Map height in pixels */
  public mapHeight: number = 0;

  /** Tile size in pixels (default 64) */
  public tileSize: number = 64;

  // ============================================================================
  // CORE GAME OBJECTS
  // ============================================================================

  /** Player character - set in createPlayer() */
  public player: any;

  /** Enemies group */
  public enemies!: Phaser.GameObjects.Group;

  /** Enemy melee triggers group (for boss attacks) */
  public enemyMeleeTriggers!: Phaser.GameObjects.Group;

  /** Decorations group (collectibles, props) */
  public decorations!: Phaser.GameObjects.Group;

  // ============================================================================
  // BULLET GROUPS
  // ============================================================================

  /** Player bullets group */
  public playerBullets!: Phaser.GameObjects.Group;

  /** Enemy bullets group */
  public enemyBullets!: Phaser.GameObjects.Group;

  // ============================================================================
  // INPUT CONTROLS
  // ============================================================================

  /** WASD keys for movement */
  public wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  /** Space key for jump */
  public spaceKey!: Phaser.Input.Keyboard.Key;

  /** Shift key for melee attack */
  public shiftKey!: Phaser.Input.Keyboard.Key;

  /** E key for ranged attack */
  public eKey!: Phaser.Input.Keyboard.Key;

  /** Q key for ultimate skill */
  public qKey!: Phaser.Input.Keyboard.Key;

  // ============================================================================
  // TILEMAP
  // ============================================================================

  public map!: Phaser.Tilemaps.Tilemap;
  public groundTileset!: Phaser.Tilemaps.Tileset;
  public groundLayer!: Phaser.Tilemaps.TilemapLayer;

  // ============================================================================
  // BACKGROUND
  // ============================================================================

  public background!: Phaser.GameObjects.TileSprite;

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
  // TEMPLATE METHOD: CREATE FLOW
  // ============================================================================

  /**
   * Create all level elements in the correct order.
   * This is the Template Method - it defines the algorithm skeleton.
   * Call this in your create() method.
   */
  createBaseElements(): void {
    this.gameCompleted = false;

    // HOOK: Pre-create
    this.onPreCreate();

    // === PHASE 1: Environment Setup ===
    this.setupMapSize();
    this.createBackground();
    this.createTileMap();

    // === PHASE 2: Group Initialization ===
    this.initializeGroups();

    // === PHASE 3: Entity Creation ===
    this.createDecorations();
    this.createPlayer();
    this.createEnemies();

    // === PHASE 4: System Setup ===
    this.setupCamera();
    this.setupWorldBounds();
    this.setupInputs();

    // === PHASE 5: Collision Setup ===
    this.setupBaseCollisions();
    this.setupCustomCollisions(); // HOOK

    // === PHASE 6: UI Launch ===
    this.scene.launch('UIScene', { gameSceneKey: this.scene.key });

    // HOOK: Post-create
    this.onPostCreate();
  }

  /**
   * Initialize all groups
   */
  private initializeGroups(): void {
    this.decorations = this.add.group();
    this.enemies = this.add.group();
    this.enemyMeleeTriggers = this.add.group();
    this.playerBullets = this.add.group();
    this.enemyBullets = this.add.group();
  }

  /**
   * Setup camera to follow player.
   * Offset places the player in the lower 1/3 of the screen so platforms
   * above are visible — standard for side-scrolling platformers.
   */
  private setupCamera(): void {
    this.cameras.main.setBounds(0, 0, this.mapWidth, this.mapHeight);
    this.cameras.main.startFollow(this.player);
    this.cameras.main.setFollowOffset(0, -128);
    this.cameras.main.setLerp(0.1, 0.1);
  }

  /**
   * Setup world physics bounds
   */
  private setupWorldBounds(): void {
    // Disable bottom bound for fall death
    this.physics.world.setBounds(
      0,
      0,
      this.mapWidth,
      this.mapHeight,
      true,
      true,
      true,
      false,
    );

    this.player.setCollideWorldBounds(true);

    this.enemies.children.iterate((enemy: any) => {
      if (enemy?.setCollideWorldBounds) {
        enemy.setCollideWorldBounds(true);
      }
      return true;
    });
  }

  /**
   * Setup input controls
   *
   * Key bindings:
   * - WASD: Move Left/Right or Jump
   * - Space / W: Jump
   * - Shift: Melee Attack (alternating combo)
   * - E: Ranged Attack
   * - Q: Ultimate Skill
   */
  setupInputs(): void {
    // WASD movement
    this.wasdKeys = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Jump
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    // Melee attack (alternating)
    this.shiftKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
    );

    // Ranged attack
    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    // Ultimate skill
    this.qKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
  }

  // ============================================================================
  // COLLISION SETUP
  // ============================================================================

  /**
   * Setup all base collision handlers
   */
  setupBaseCollisions(): void {
    this.setupGroundCollisions();
    this.setupContactDamage();
    this.setupMeleeCollisions();
    this.setupBulletCollisions();
  }

  /**
   * Setup ground collision
   */
  private setupGroundCollisions(): void {
    utils.addCollider(this, this.player, this.groundLayer);
    utils.addCollider(this, this.enemies, this.groundLayer);
  }

  /**
   * Setup contact damage (player touching enemy)
   */
  private setupContactDamage(): void {
    utils.addOverlap(
      this,
      this.player,
      this.enemies,
      (player: any, enemy: any) => {
        if (player.isInvulnerable || player.isHurting || player.isDead) return;
        if (enemy.isDead) return;

        // Knockback
        const knockbackForce = 200;
        const direction = player.x < enemy.x ? -1 : 1;
        player.setVelocityX(knockbackForce * direction);
        player.setVelocityY(-150);

        // Damage
        player.takeDamage(enemy.damage);
        this.showDamageNumber(player.x, player.y, enemy.damage, '#ff4444');
      },
    );
  }

  /**
   * Setup melee attack collisions
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

          // Check if already hit
          const meleeTargets =
            this.player.currentMeleeTargets ||
            this.player.melee?.currentTargets;
          if (meleeTargets?.has(enemy)) return;
          if (enemy.isHurting || enemy.isDead) return;

          // Register hit
          meleeTargets?.add(enemy);

          // Knockback
          const knockbackForce = 150;
          const direction = enemy.x > this.player.x ? 1 : -1;
          enemy.setVelocityX(knockbackForce * direction);

          // Damage
          const damage = this.player.attackDamage || this.player.melee?.damage;
          enemy.takeDamage(damage);
          this.showDamageNumber(enemy.x, enemy.y, damage, '#ffdd44');

          // HOOK: Enemy killed check
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
        const direction = player.x > enemy.x ? 1 : -1;
        player.setVelocityX(knockbackForce * direction);
        player.setVelocityY(-200);

        player.takeDamage(enemy.damage);
        this.showDamageNumber(player.x, player.y, enemy.damage, '#ff4444');
      },
    );
  }

  /**
   * Setup bullet collision detection
   */
  private setupBulletCollisions(): void {
    // Player bullets hit enemies
    utils.addOverlap(
      this,
      this.playerBullets,
      this.enemies,
      (bullet: any, enemy: any) => {
        if (enemy.isDead || enemy.isHurting) return;

        // Knockback
        const knockbackForce = 200;
        const direction = bullet.body?.velocity?.x > 0 ? 1 : -1;
        enemy.setVelocityX(knockbackForce * direction);

        // Damage
        const damage = bullet.damage ?? this.player.attackDamage ?? 10;
        enemy.takeDamage(damage);
        this.showDamageNumber(enemy.x, enemy.y, damage, '#ffdd44');

        // Destroy bullet
        this.destroyBullet(bullet);

        // HOOK: Enemy killed check
        if (enemy.isDead) {
          this.onEnemyKilled(enemy);
        }
      },
    );

    // Player bullets hit ground
    utils.addCollider(
      this,
      this.playerBullets,
      this.groundLayer,
      (bullet: any) => this.destroyBullet(bullet),
    );

    // Enemy bullets hit player
    utils.addOverlap(
      this,
      this.player,
      this.enemyBullets,
      (player: any, bullet: any) => {
        if (player.isInvulnerable || player.isHurting || player.isDead) return;

        // Knockback
        const knockbackForce = 150;
        const direction =
          (bullet as any).direction ?? (bullet.body?.velocity?.x > 0 ? 1 : -1);
        player.setVelocityX(knockbackForce * direction);

        // Damage
        const damage = bullet.damage ?? 15;
        player.takeDamage(damage);
        this.showDamageNumber(player.x, player.y, damage, '#ff4444');

        // Destroy bullet
        this.destroyBullet(bullet);
      },
    );

    // Enemy bullets hit ground
    utils.addCollider(
      this,
      this.enemyBullets,
      this.groundLayer,
      (bullet: any) => this.destroyBullet(bullet),
    );
  }

  /**
   * Destroy a bullet properly
   */
  private destroyBullet(bullet: any): void {
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
   * Base update logic - call this in your update() method
   */
  baseUpdate(): void {
    if (!this.player || !this.player.active) return;

    // HOOK: Pre-update
    this.onPreUpdate();

    // Update player with input keys
    try {
      this.player.update(
        this.wasdKeys,
        this.spaceKey,
        this.shiftKey,
        this.eKey,
        this.qKey,
      );
    } catch (error) {
      console.error('Error updating player:', error);
    }

    // Update enemies
    this.updateEnemies();

    // Update bullets
    this.updateBullets();

    // Check win condition
    this.checkWinCondition();

    // Update parallax background
    this.updateParallax();

    // Check player death (fell off map)
    this.checkPlayerFall();

    // HOOK: Post-update
    this.onPostUpdate();
  }

  /**
   * Update all enemies
   */
  private updateEnemies(): void {
    this.enemies.children.iterate((enemy: any) => {
      if (enemy?.active && enemy.update) {
        try {
          enemy.update();
        } catch (error) {
          console.error('Error updating enemy:', error);
        }
      }
      return true;
    });
  }

  /**
   * Update all bullets
   */
  private updateBullets(): void {
    this.enemyBullets.children.iterate((bullet: any) => {
      if (bullet?.active && bullet.update) {
        bullet.update();
      }
      return true;
    });

    this.playerBullets.children.iterate((bullet: any) => {
      if (bullet?.active && bullet.update) {
        bullet.update();
      }
      return true;
    });
  }

  /**
   * Update parallax background
   */
  private updateParallax(): void {
    if (this.background) {
      this.background.tilePositionX = this.cameras.main.scrollX * 0.2;
    }
  }

  /**
   * Check if player fell off map
   */
  private checkPlayerFall(): void {
    if (this.player.y > this.mapHeight + 100 && !this.player.isDead) {
      this.player.health = 0;
      this.player.isDead = true;
      this.onPlayerDeath();
    }
  }

  // ============================================================================
  // WIN/LOSE DETECTION
  // ============================================================================

  /**
   * Check if all enemies are defeated
   */
  checkWinCondition(): void {
    const activeEnemyCount = this.enemies.children.entries.filter(
      (enemy: any) => enemy.active && !enemy.isDead,
    ).length;

    if (activeEnemyCount === 0 && !this.gameCompleted) {
      this.gameCompleted = true;
      this.onLevelComplete();
    }
  }

  // ============================================================================
  // HOOKS - Override in subclass for custom behavior
  // ============================================================================

  /**
   * HOOK: Called before any creation in createBaseElements()
   */
  protected onPreCreate(): void {
    // Override in subclass
  }

  /**
   * HOOK: Called after all creation in createBaseElements()
   */
  protected onPostCreate(): void {
    // Override in subclass
  }

  /**
   * HOOK: Called at the start of baseUpdate()
   */
  protected onPreUpdate(): void {
    // Override in subclass
  }

  /**
   * HOOK: Called at the end of baseUpdate()
   */
  protected onPostUpdate(): void {
    // Override in subclass
  }

  /**
   * HOOK: Called when player dies
   * Default: Launch GameOverUIScene
   */
  protected onPlayerDeath(): void {
    this.scene.launch('GameOverUIScene', {
      currentLevelKey: this.scene.key,
    });
  }

  /**
   * HOOK: Called when level is completed (all enemies defeated).
   * Default: Launch VictoryUIScene or GameCompleteUIScene after a short
   * delay (500 ms) so the last kill animation can play out.
   */
  protected onLevelComplete(): void {
    this.time.delayedCall(500, () => {
      if (LevelManager.isLastLevel(this.scene.key)) {
        this.scene.launch('GameCompleteUIScene', {
          currentLevelKey: this.scene.key,
        });
      } else {
        this.scene.launch('VictoryUIScene', {
          currentLevelKey: this.scene.key,
        });
      }
    });
  }

  /**
   * HOOK: Called when an enemy is killed
   * Use for scoring, drops, effects
   */
  protected onEnemyKilled(enemy: any): void {
    // Override in subclass for scoring, drops, etc.
  }

  /**
   * HOOK: Setup custom collision handlers
   * Called after setupBaseCollisions() in createBaseElements()
   */
  protected setupCustomCollisions(): void {
    // Override in subclass
  }

  // ============================================================================
  // SCREEN EFFECTS
  // ============================================================================

  /**
   * Show floating damage number at the given world position.
   * The text floats upward and fades out over ~600 ms.
   *
   * @param x - World X position
   * @param y - World Y position
   * @param damage - Damage value to display
   * @param color - Text colour (default '#ffffff')
   */
  showDamageNumber(
    x: number,
    y: number,
    damage: number,
    color: string = '#ffffff',
    fontSize: number = 18,
    duration: number = 600,
  ): void {
    const text = this.add
      .text(x, y - 20, `${Math.round(damage)}`, {
        fontFamily: 'monospace',
        fontSize: `${fontSize}px`,
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1000);

    this.tweens.add({
      targets: text,
      y: y - 20 - fontSize * 2.5,
      alpha: 0,
      duration,
      ease: 'Power1',
      onComplete: () => text.destroy(),
    });
  }

  // ============================================================================
  // DYNAMIC PLAYER CREATION (Character Select Integration)
  // ============================================================================

  /**
   * Get the player class map for dynamic player creation
   * Override this method to register your player classes
   */
  protected getPlayerClasses(): PlayerClassMap {
    return {};
  }

  /**
   * Create player based on registry selection or default
   *
   * @param x - Spawn X position
   * @param y - Spawn Y position
   * @param defaultClass - Default class if no selection in registry
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

  // ============================================================================
  // ABSTRACT METHODS - MUST be implemented by subclass
  // ============================================================================

  /** Set map dimensions. Must set: this.mapWidth, this.mapHeight */
  abstract setupMapSize(): void;

  /** Create background sprite (typically TileSprite for parallax) */
  abstract createBackground(): void;

  /** Create tilemap and collision layers. Must set: this.map, this.groundTileset, this.groundLayer */
  abstract createTileMap(): void;

  /** Create decorations. WARNING: Player does not exist yet */
  abstract createDecorations(): void;

  /** Create player character. Must set: this.player */
  abstract createPlayer(): void;

  /** Create enemies. Add to: this.enemies */
  abstract createEnemies(): void;
}
