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
  /** Display name shown in boss health bar UI (optional) */
  displayName?: string;
  /** Display height in pixels (default 80) */
  displayHeight?: number;
  /** Body width factor (0-1, default 0.7) */
  bodyWidthFactor?: number;
  /** Body height factor (0-1, default 0.8) */
  bodyHeightFactor?: number;
  /** Whether enemy is affected by gravity (default true) */
  hasGravity?: boolean;
  /** Enemy stats */
  stats: {
    maxHealth: number;
    speed: number;
    damage: number;
  };
  /** AI configuration */
  ai?: {
    type: EnemyAIType;
    /** For patrol: min/max X bounds */
    patrolMinX?: number;
    patrolMaxX?: number;
    /** For chase: detection range, give up distance */
    detectionRange?: number;
    giveUpDistance?: number;
    stopDistance?: number;
    /** For flying enemies */
    chaseVertical?: boolean;
  };
  /**
   * Visual offset Y to sink sprite into ground (in pixels, positive = sink down)
   *
   * AI-generated sprites often have extra whitespace above the character.
   * This offset compensates by moving the physics body UP, making the sprite
   * visually sink so feet touch the ground.
   *
   * Default: 50. Set to 0 to disable.
   */
  verticalVisualOffset?: number;
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
    rangedRange?: number;
    rangedCooldown?: number;
  };
}

/**
 * BaseEnemy - Foundation class for enemy characters in platformer games
 *
 * This class provides:
 * - Integration with BehaviorManager for AI and combat
 * - Health and damage system
 * - Various AI modes (patrol, chase, stationary)
 * - Hooks for customization
 *
 * HOOK METHODS (override in subclass):
 * - initBehaviors(config): Add custom behaviors
 * - onUpdate(): Custom per-frame logic
 * - onDamageTaken(damage): React to taking damage
 * - onDeath(): React to dying
 * - executeAI(): Custom AI logic (called when not using built-in AI)
 *
 * Usage:
 *   export class Slime extends BaseEnemy {
 *     constructor(scene, x, y) {
 *       super(scene, x, y, {
 *         textureKey: 'slime_idle_frame1',
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

  /** Current facing direction */
  public facingDirection: 'left' | 'right' = 'right';

  /** Movement speed */
  public speed: number;

  /** Damage dealt to player */
  public damage: number;

  // ============================================================================
  // VISUAL OFFSET
  // ============================================================================

  /** Visual offset Y to sink sprite into ground (pixels) */
  public verticalVisualOffset: number;

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

  /** Display name for boss health bar UI */
  public displayName?: string;

  // ============================================================================
  // ATTACK SYSTEM (Legacy compatibility for melee boss)
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
    this.verticalVisualOffset = config.verticalVisualOffset ?? 50;
    this.displayName = config.displayName;

    // Physics setup
    if (config.hasGravity !== false) {
      this.body.setGravityY(1200);
      this.body.setMaxVelocityY(800);
    } else {
      this.body.setAllowGravity(false);
    }

    // Sprite scaling
    utils.initScale(
      this,
      { x: 0.5, y: 1.0 },
      undefined,
      config.displayHeight ?? 80,
      config.bodyWidthFactor ?? 0.7,
      config.bodyHeightFactor ?? 0.8,
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

    // Random initial direction
    this.facingDirection = Math.random() > 0.5 ? 'right' : 'left';
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
            minX: config.ai?.patrolMinX,
            maxX: config.ai?.patrolMaxX,
            detectCliffs: true,
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
            chaseVertical: config.ai?.chaseVertical ?? false,
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
   *
   * Therefore, any instance variables you initialize AFTER super() will be
   * undefined when this method runs.
   *
   * Solution: Initialize custom behaviors/skills INSIDE this method, not in constructor.
   *
   * @example
   * // CORRECT - initialize skill inside initBehaviors:
   * protected initBehaviors(config: EnemyConfig): void {
   *   this.mySkill = new DashAttackSkill({ ... });
   *   this.behaviors.add('dash', this.mySkill);
   * }
   */
  protected initBehaviors(config: EnemyConfig): void {
    // Override in subclass
  }

  /**
   * HOOK: Called every frame after standard update
   * Override this to add custom per-frame logic
   */
  protected onUpdate(): void {
    // Override in subclass
  }

  /**
   * HOOK: Called when enemy takes damage
   * Override this to add custom damage reactions
   */
  protected onDamageTaken(damage: number): void {
    // Override in subclass
  }

  /**
   * HOOK: Called when enemy dies
   * Override this to add custom death logic (drops, effects, etc.)
   */
  protected onDeath(): void {
    // Override in subclass
  }

  /**
   * HOOK: Custom AI logic
   * Override this when using aiType: 'custom'
   */
  protected executeAI(): void {
    // Override in subclass for custom AI
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
   * Main update method - call every frame from scene
   */
  update(): void {
    if (!this.body || !this.active || this.isDead) return;

    // Update visual flip
    this.setFlipX(this.facingDirection === 'left');

    // Update origin and offset for animation frame normalization
    utils.resetOriginAndOffset(this, this.facingDirection);

    // Apply visual offset correction (sink sprite into ground)
    if (this.verticalVisualOffset !== 0) {
      const currentOffset = this.body.offset;
      this.body.setOffset(
        currentOffset.x,
        currentOffset.y - this.verticalVisualOffset,
      );
    }

    // Update all behaviors
    this.behaviors.update();

    // Sync facing direction from AI behaviors
    if (this.patrol) {
      this.facingDirection = this.patrol.facingDirection;
    } else if (this.chase) {
      this.facingDirection = this.chase.facingDirection;
    }

    // Run AI if not hurt or attacking
    if (!this.isHurting && !this.isAttacking) {
      if (this.aiType === 'custom') {
        this.executeAI();
      }

      // Try ranged attack if has target in range
      this.tryRangedAttack();
    }

    // Hook: Custom update
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
    this.target = target;
    if (this.chase) {
      this.chase.setTarget(target);
    }
  }

  /**
   * Set patrol bounds
   */
  setPatrolBounds(minX: number, maxX: number): void {
    if (this.patrol) {
      this.patrol.setBounds(minX, maxX);
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
