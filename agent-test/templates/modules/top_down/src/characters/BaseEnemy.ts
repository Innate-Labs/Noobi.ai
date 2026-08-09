import Phaser from 'phaser';
import * as utils from '../utils';
import {
  BehaviorManager,
  PatrolAI,
  ChaseAI,
  MeleeAttack,
  RangedAttack,
} from '../behaviors';

/**
 * Enemy AI type
 */
export type EnemyAIType = 'patrol' | 'chase' | 'stationary' | 'custom';

/**
 * Enemy configuration interface
 */
export interface EnemyConfig {
  /** Texture key for initial frame (must be IMAGE key from asset-pack.json) */
  textureKey: string;
  /** Display height in pixels (default 64 = 1 tile; use 80 for boss) */
  displayHeight?: number;
  /** Body width factor (0-1, default 0.5) — narrow for top-down foot hitbox */
  bodyWidthFactor?: number;
  /** Body height factor (0-1, default 0.4) — short for top-down foot hitbox */
  bodyHeightFactor?: number;
  /** Enemy stats */
  stats: {
    maxHealth: number;
    speed: number;
    damage: number;
  };
  /** AI configuration */
  ai?: {
    type: EnemyAIType;
    /** For patrol: rectangular area bounds */
    patrolArea?: { minX: number; maxX: number; minY: number; maxY: number };
    /** For patrol: ms between direction changes (default 2000) */
    directionChangeInterval?: number;
    /** For chase: detection range */
    detectionRange?: number;
    /** For chase: give up distance */
    giveUpDistance?: number;
    /** For chase: stop distance (maintain distance for ranged enemies) */
    stopDistance?: number;
  };
  /** Combat configuration */
  combat?: {
    /** Enable melee attacks */
    hasMelee?: boolean;
    meleeRange?: number;
    meleeWidth?: number;
    meleeCooldown?: number;
    /** Enable ranged attacks */
    hasRanged?: boolean;
    rangedKey?: string;
    rangedCooldown?: number;
  };
}

/**
 * BaseEnemy - Foundation class for enemy characters in top-down games
 *
 * KEY DIFFERENCES FROM PLATFORMER:
 *   - No gravity (top-down view, setAllowGravity(false))
 *   - 4-direction facing (up/down/left/right)
 *   - PatrolAI wanders in 2D area (not just left/right)
 *   - ChaseAI always chases in 2D (no chaseVertical flag needed)
 *   - Body positioned at sprite feet for Y-sort
 *
 * This class provides:
 * - Integration with BehaviorManager for AI and combat
 * - Health and damage system
 * - Various AI modes (patrol, chase, stationary, custom)
 * - Hooks for customization
 *
 * HOOK METHODS (override in subclass):
 * - initBehaviors(config): Add custom behaviors
 * - onUpdate(): Custom per-frame logic
 * - onDamageTaken(damage): React to taking damage
 * - onDeath(): React to dying
 * - executeAI(): Custom AI logic (called when using aiType: 'custom')
 *
 * Usage:
 *   export class Trooper extends BaseEnemy {
 *     constructor(scene, x, y) {
 *       super(scene, x, y, {
 *         textureKey: 'trooper_idle_frame1', // gitleaks:allow -- example asset key
 *         stats: { maxHealth: 50, speed: 80, damage: 15 },
 *         ai: { type: 'patrol' },
 *       });
 *     }
 *   }
 */
export abstract class BaseEnemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  // ============================================================================
  // BEHAVIOR SYSTEM
  // ============================================================================

  /** Behavior manager for this enemy */
  public behaviors: BehaviorManager;

  /** Patrol AI behavior (optional) */
  public patrol?: PatrolAI;

  /** Chase AI behavior (optional) */
  public chase?: ChaseAI;

  /** Melee attack behavior (optional) */
  public melee?: MeleeAttack;

  /** Ranged attack behavior (optional) */
  public ranged?: RangedAttack;

  // ============================================================================
  // ATTRIBUTES
  // ============================================================================

  /** Current facing direction (4-way) */
  public facingDirection: 'left' | 'right' | 'up' | 'down' = 'down';

  /** Movement speed */
  public speed: number;

  /** Damage dealt to player */
  public damage: number;

  // ============================================================================
  // STATE FLAGS
  // ============================================================================

  /** Is enemy dead */
  public isDead: boolean = false;

  /** Is enemy in hurt state */
  public isHurting: boolean = false;

  /** Is enemy attacking */
  public isAttacking: boolean = false;

  // ============================================================================
  // HEALTH SYSTEM
  // ============================================================================

  /** Maximum health */
  public maxHealth: number;

  /** Current health */
  public health: number;

  // ============================================================================
  // AI
  // ============================================================================

  /** AI type */
  public aiType: EnemyAIType;

  /** Target (usually player) */
  public target?: Phaser.Physics.Arcade.Sprite;

  // ============================================================================
  // ATTACK SYSTEM
  // ============================================================================

  /** Melee trigger zone (from MeleeAttack behavior) */
  public get meleeTrigger(): Phaser.GameObjects.Zone | undefined {
    return this.melee?.meleeTrigger;
  }

  /** Targets hit in current melee attack */
  public get currentMeleeTargets(): Set<any> {
    return this.melee?.currentTargets ?? new Set();
  }

  // ============================================================================
  // AUDIO
  // ============================================================================

  public deathSound?: Phaser.Sound.BaseSound;
  public attackSound?: Phaser.Sound.BaseSound;

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor(scene: Phaser.Scene, x: number, y: number, config: EnemyConfig) {
    super(scene, x, y, config.textureKey);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Initialize stats
    this.maxHealth = config.stats.maxHealth;
    this.health = this.maxHealth;
    this.speed = config.stats.speed;
    this.damage = config.stats.damage;

    // NO GRAVITY — top-down view
    this.body.setAllowGravity(false);

    // Sprite scaling — origin at bottom-center for Y-sort
    // Body covers feet area only
    utils.initScale(
      this,
      { x: 0.5, y: 1.0 },
      undefined,
      config.displayHeight ?? 64,
      config.bodyWidthFactor ?? 0.5,
      config.bodyHeightFactor ?? 0.4,
    );

    // Initialize behavior system
    this.behaviors = new BehaviorManager(this);

    // Set up AI type
    this.aiType = config.ai?.type ?? 'stationary';

    // Set up AI behaviors based on type
    this.setupAI(config);

    // Set up combat behaviors
    this.setupCombat(config);

    // Hook: Allow subclass to add custom behaviors
    this.initBehaviors(config);

    // Initialize sounds
    this.initializeSounds();

    // Random initial facing direction
    const directions: Array<'left' | 'right' | 'up' | 'down'> = [
      'left',
      'right',
      'up',
      'down',
    ];
    this.facingDirection =
      directions[Math.floor(Math.random() * directions.length)];
  }

  /**
   * Set up AI behaviors based on configuration
   */
  private setupAI(config: EnemyConfig): void {
    switch (this.aiType) {
      case 'patrol':
        this.patrol = this.behaviors.add(
          'patrol',
          new PatrolAI({
            speed: this.speed,
            patrolArea: config.ai?.patrolArea,
            directionChangeInterval: config.ai?.directionChangeInterval,
          }),
        );
        break;

      case 'chase':
        this.chase = this.behaviors.add(
          'chase',
          new ChaseAI({
            speed: this.speed,
            detectionRange: config.ai?.detectionRange,
            giveUpDistance: config.ai?.giveUpDistance,
            stopDistance: config.ai?.stopDistance ?? 50,
          }),
        );
        break;

      case 'stationary':
      case 'custom':
        // No built-in AI behavior
        break;
    }
  }

  /**
   * Set up combat behaviors based on configuration
   */
  private setupCombat(config: EnemyConfig): void {
    // Melee attack
    if (config.combat?.hasMelee) {
      this.melee = this.behaviors.add(
        'melee',
        new MeleeAttack({
          damage: this.damage,
          range: config.combat.meleeRange ?? 80,
          width: config.combat.meleeWidth ?? 60,
          cooldown: config.combat.meleeCooldown ?? 1000,
        }),
      );
    }

    // Ranged attack
    if (config.combat?.hasRanged && config.combat.rangedKey) {
      this.ranged = this.behaviors.add(
        'ranged',
        new RangedAttack({
          damage: this.damage,
          projectileKey: config.combat.rangedKey,
          cooldown: config.combat.rangedCooldown ?? 2000,
        }),
      );
    }
  }

  // ============================================================================
  // HOOKS - Override in subclass
  // ============================================================================

  /**
   * HOOK: Initialize custom behaviors
   * Override this to add additional behaviors
   *
   * CRITICAL TIMING: This method is called DURING the super() constructor,
   * BEFORE the rest of the subclass constructor executes.
   */
  protected initBehaviors(config: EnemyConfig): void {
    // Override in subclass
  }

  /**
   * HOOK: Called every frame after standard update
   */
  protected onUpdate(): void {
    // Override in subclass
  }

  /**
   * HOOK: Called when enemy takes damage
   */
  protected onDamageTaken(damage: number): void {
    // Override in subclass
  }

  /**
   * HOOK: Called when enemy dies
   */
  protected onDeath(): void {
    // Override in subclass
  }

  /**
   * HOOK: Custom AI logic (when using aiType: 'custom')
   */
  protected executeAI(): void {
    // Override in subclass for custom AI
  }

  /**
   * HOOK: Get animation key for the current state.
   * Override to provide idle/walk/attack/directional animations.
   *
   * Default returns null (no animation management by base class).
   * Return an animation key string to have BaseEnemy play it automatically.
   *
   * @param isMoving - Whether the enemy is currently moving
   * @param facingDirection - Current facing direction
   * @returns Animation key to play, or null to skip
   *
   * @example
   *   protected override getAnimationKey(isMoving: boolean): string | null {
   *     if (this.isDead) return 'enemy_die_anim';
   *     return isMoving ? 'enemy_walk_anim' : 'enemy_idle_anim';
   *   }
   */
  protected getAnimationKey(
    isMoving: boolean,
    facingDirection: 'left' | 'right' | 'up' | 'down',
  ): string | null {
    return null;
  }

  /**
   * HOOK: Called when enemy switches to chase mode (e.g., player detected).
   * Useful for playing alert sound effects or changing appearance.
   */
  protected onAggro(target: Phaser.Physics.Arcade.Sprite): void {
    // Override in subclass
  }

  // ============================================================================
  // ANIMATION
  // ============================================================================

  /**
   * Play animation and reset origin/offset
   */
  playAnimation(animKey: string): void {
    this.play(animKey, true);
    utils.resetOriginAndOffset(this, this.facingDirection);
  }

  // ============================================================================
  // UPDATE
  // ============================================================================

  /**
   * Main update method — call every frame from scene.
   *
   * UPDATE ORDER (intentional):
   *   1. Behaviors update — AI sets velocity & facing, melee trigger repositions
   *   2. Sync facingDirection from AI behaviors
   *   3. Custom AI / ranged attack logic
   *   4. Visual updates (flipX, animation, resetOriginAndOffset)
   *   5. onUpdate() hook
   */
  update(): void {
    if (!this.body || !this.active || this.isDead) return;

    // --- PHASE 1: Behaviors drive AI and combat ---
    // PatrolAI/ChaseAI set velocity and facingDirection on owner.
    // MeleeAttack repositions trigger zone.
    this.behaviors.update();

    // --- PHASE 2: Sync facing direction from AI behaviors ---
    // AI behaviors already sync to owner, but we also read back explicitly
    // in case subclass modifies facingDirection in a hook.
    if (this.patrol) {
      this.facingDirection = this.patrol.facingDirection;
    } else if (this.chase) {
      this.facingDirection = this.chase.facingDirection;
    }

    // --- PHASE 3: Custom AI and ranged attack ---
    if (!this.isHurting && !this.isAttacking) {
      if (this.aiType === 'custom') {
        this.executeAI();
      }

      // Try ranged attack if has target in range
      this.tryRangedAttack();
    }

    // --- PHASE 4: Visual updates (AFTER facing is resolved) ---
    if (this.facingDirection === 'left') {
      this.setFlipX(true);
    } else if (this.facingDirection === 'right') {
      this.setFlipX(false);
    }

    // Automatic animation state management via hook
    const isMoving = this.body.velocity.length() > 10;
    const animKey = this.getAnimationKey(isMoving, this.facingDirection);
    if (animKey) {
      this.playAnimation(animKey);
    }

    // Normalize animation frame size and reposition body at feet
    utils.resetOriginAndOffset(this, this.facingDirection);

    // --- PHASE 5: Custom update logic ---
    this.onUpdate();
  }

  /**
   * Try to perform ranged attack if possible
   */
  private tryRangedAttack(): void {
    if (!this.ranged || !this.target || !this.target.active) return;

    if (this.ranged.canShoot()) {
      const distance = Phaser.Math.Distance.Between(
        this.x,
        this.y,
        this.target.x,
        this.target.y,
      );

      // Only shoot if within reasonable range
      if (distance < 400) {
        const bullet = this.ranged.shootAt(this.target, 'enemyBullets');
        if (bullet) {
          this.attackSound?.play();
        }
      }
    }
  }

  // ============================================================================
  // TARGET MANAGEMENT
  // ============================================================================

  /**
   * Set the target for this enemy (usually the player)
   */
  setTarget(target: Phaser.Physics.Arcade.Sprite): void {
    const hadTarget = this.target != null;
    this.target = target;
    if (this.chase) {
      this.chase.setTarget(target);
    }
    // Hook: notify subclass of new target acquisition
    if (target && !hadTarget) {
      this.onAggro(target);
    }
  }

  /**
   * Set patrol area
   */
  setPatrolArea(minX: number, maxX: number, minY: number, maxY: number): void {
    if (this.patrol) {
      this.patrol.setPatrolArea(minX, maxX, minY, maxY);
    }
  }

  // ============================================================================
  // DAMAGE HANDLING
  // ============================================================================

  /**
   * Take damage from an attack
   */
  takeDamage(damage: number): void {
    if (this.isDead || this.isHurting) return;

    this.health -= damage;
    this.isHurting = true;

    // Hook: Damage taken
    this.onDamageTaken(damage);

    // Flash red
    this.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => {
      if (this.active) {
        this.clearTint();
        this.isHurting = false;
      }
    });

    if (this.health <= 0) {
      this.die();
    }
  }

  /**
   * Kill this enemy
   */
  die(): void {
    if (this.isDead) return;

    this.isDead = true;
    this.setVelocity(0, 0);
    this.deathSound?.play();

    // Hook: Death
    this.onDeath();

    // Destroy after delay
    this.scene.time.delayedCall(500, () => {
      if (this.active) {
        this.destroy();
      }
    });
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  /**
   * Get health as percentage (0-100)
   */
  getHealthPercentage(): number {
    return (this.health / this.maxHealth) * 100;
  }

  /**
   * Initialize sound effects
   */
  protected initializeSounds(): void {
    this.deathSound = utils.safeAddSound(this.scene, 'enemy_death', {
      volume: 0.3,
    });
    this.attackSound = utils.safeAddSound(this.scene, 'enemy_attack', {
      volume: 0.3,
    });
  }
}
