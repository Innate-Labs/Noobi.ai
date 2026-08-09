import Phaser from 'phaser';
import * as utils from '../utils';
import {
  BehaviorManager,
  PlatformerMovement,
  MeleeAttack,
  RangedAttack,
  SkillBehavior,
} from '../behaviors';
import { PlayerFSM, type PlayerAnimKeys } from './PlayerFSM';

/**
 * Player configuration interface
 */
export interface PlayerConfig {
  /** Texture key for initial frame (must be IMAGE key from asset-pack.json) */
  textureKey: string;
  /** Display height in pixels (default 128) */
  displayHeight?: number;
  /** Body width factor (0-1, default 0.6) */
  bodyWidthFactor?: number;
  /** Body height factor (0-1, default 0.85) */
  bodyHeightFactor?: number;
  /** Player stats */
  stats: {
    maxHealth: number;
    walkSpeed: number;
    jumpPower: number;
    attackDamage: number;
    hurtingDuration?: number;
    invulnerableTime?: number;
    gravityY?: number;
  };
  /** Movement behavior config overrides */
  movement?: {
    airControl?: number;
    coyoteTime?: number;
    jumpBufferTime?: number;
    doubleJumpEnabled?: boolean;
    doubleJumpPower?: number;
  };
  /** Combat config */
  combat?: {
    meleeRange?: number;
    meleeWidth?: number;
    rangedKey?: string;
    rangedSpeed?: number;
    rangedCooldown?: number;
  };
  /** Animation keys mapping */
  animKeys?: PlayerAnimKeys;
  /**
   * Visual offset Y to sink sprite into ground (in pixels, positive = sink down)
   *
   * PURPOSE: AI-generated character sprites often have extra whitespace above
   * the character (for hair, weapons, etc). This causes the character to
   * "float" above the ground. This offset moves the physics body UP relative
   * to the sprite, making the sprite visually sink into the ground so feet
   * appear to touch the tiles.
   *
   * IMPORTANT: This does NOT cause sprite/tile overlap issues because Phaser's
   * collision detection only uses the physics body, not the sprite image.
   *
   * Default: 50 (works well for most AI-generated sprites)
   * Set to 0 to disable the correction.
   */
  verticalVisualOffset?: number;
}

/**
 * BasePlayer - Foundation class for player characters in platformer games
 *
 * CONTROLS:
 *   - WASD: Move Left/Right or Jump
 *   - Space / W: Jump
 *   - Shift: Melee Attack (alternating combo: odd=punch, even=kick)
 *   - E: Ranged Attack
 *   - Q: Ultimate Skill (long cooldown)
 *
 * This class provides:
 * - Integration with BehaviorManager for movement and combat
 * - Integration with PlayerFSM for state management
 * - Health and damage system
 * - Melee attack trigger
 * - Ultimate skill system with cooldown
 * - Hooks for customization
 *
 * HOOK METHODS (override in subclass):
 * - initBehaviors(config): Add custom behaviors
 * - initUltimate(): Initialize ultimate skill
 * - onUpdate(): Custom per-frame logic
 * - onDamageTaken(damage): React to taking damage
 * - onDeath(): React to dying
 * - onHealthChanged(oldHealth, newHealth): React to health changes
 * - onUltimateUsed(): React to ultimate skill usage
 *
 * Usage:
 *   export class Player extends BasePlayer {
 *     constructor(scene, x, y) {
 *       super(scene, x, y, {
 *         textureKey: 'player_idle_frame1',
 *         stats: { maxHealth: 100, walkSpeed: 200, jumpPower: 620, attackDamage: 25 },
 *         animKeys: { idle: 'player_idle_anim', ... },
 *       });
 *     }
 *   }
 */
export abstract class BasePlayer extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  // ============================================================================
  // BEHAVIOR SYSTEM
  // ============================================================================

  /** Behavior manager for this player */
  public behaviors: BehaviorManager;

  /** Movement behavior (walking, jumping) */
  public movement!: PlatformerMovement;

  /** Melee attack behavior */
  public melee!: MeleeAttack;

  /** Ranged attack behavior (optional) */
  public ranged?: RangedAttack;

  /** Ultimate skill behavior (optional) */
  public ultimate?: SkillBehavior;

  // ============================================================================
  // STATE MACHINE
  // ============================================================================

  /** Finite state machine for player states */
  public fsm: PlayerFSM;

  // ============================================================================
  // ATTRIBUTES
  // ============================================================================

  /** Current facing direction */
  public facingDirection: 'left' | 'right' = 'right';

  /** Attack damage */
  public attackDamage: number;

  /** Walk speed (from config) */
  public walkSpeed: number;

  /** Jump power (from config) */
  public jumpPower: number;

  // ============================================================================
  // VISUAL OFFSET
  // ============================================================================

  /** Visual offset Y to sink sprite into ground (pixels) */
  public verticalVisualOffset: number;

  // ============================================================================
  // STATE FLAGS
  // ============================================================================

  /** Is player dead */
  public isDead: boolean = false;

  /** Is player in hurt state */
  public isHurting: boolean = false;

  /** Is player attacking (melee) */
  public isAttacking: boolean = false;

  /** Is player invulnerable (after taking damage) */
  public isInvulnerable: boolean = false;

  /** Is player using ultimate skill */
  public isUsingUltimate: boolean = false;

  /** Hurt state duration in ms */
  public hurtingDuration: number;

  /** Invulnerability duration after taking damage in ms */
  public invulnerableTime: number;

  /** Timer for hurt state */
  public hurtingTimer?: Phaser.Time.TimerEvent;

  // ============================================================================
  // HEALTH SYSTEM
  // ============================================================================

  /** Maximum health */
  public maxHealth: number;

  /** Current health */
  public health: number;

  // ============================================================================
  // ATTACK SYSTEM
  // ============================================================================

  /** Melee trigger zone (from MeleeAttack behavior) */
  public get meleeTrigger(): Phaser.GameObjects.Zone {
    return this.melee.meleeTrigger;
  }

  /** Targets hit in current melee attack */
  public get currentMeleeTargets(): Set<any> {
    return this.melee.currentTargets;
  }

  /** Melee attack counter (for alternating combo) */
  public meleeComboCount: number = 0;

  // ============================================================================
  // INPUT REFERENCES
  // ============================================================================

  public wasdKeys?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  public spaceKey?: Phaser.Input.Keyboard.Key;
  public shiftKey?: Phaser.Input.Keyboard.Key;
  public eKey?: Phaser.Input.Keyboard.Key;
  public qKey?: Phaser.Input.Keyboard.Key;

  // ============================================================================
  // AUDIO
  // ============================================================================

  public jumpSound?: Phaser.Sound.BaseSound;
  public attackSound?: Phaser.Sound.BaseSound;
  public hurtSound?: Phaser.Sound.BaseSound;
  public shootSound?: Phaser.Sound.BaseSound;
  public ultimateSound?: Phaser.Sound.BaseSound;

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor(scene: Phaser.Scene, x: number, y: number, config: PlayerConfig) {
    super(scene, x, y, config.textureKey);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Initialize stats
    this.maxHealth = config.stats.maxHealth;
    this.health = this.maxHealth;
    this.attackDamage = config.stats.attackDamage;
    this.walkSpeed = config.stats.walkSpeed;
    this.jumpPower = config.stats.jumpPower;
    this.hurtingDuration = config.stats.hurtingDuration ?? 100;
    this.invulnerableTime = config.stats.invulnerableTime ?? 1000;
    this.verticalVisualOffset = config.verticalVisualOffset ?? 50;

    // Physics setup
    const gravityY = config.stats.gravityY ?? 1200;
    this.body.setGravityY(gravityY);
    this.body.setMaxVelocityY(800);

    // Sprite scaling
    utils.initScale(
      this,
      { x: 0.5, y: 1.0 },
      undefined,
      config.displayHeight ?? 128,
      config.bodyWidthFactor ?? 0.6,
      config.bodyHeightFactor ?? 0.85,
    );

    // Initialize behavior system
    this.behaviors = new BehaviorManager(this);

    // Add movement behavior
    this.movement = this.behaviors.add(
      'movement',
      new PlatformerMovement({
        walkSpeed: config.stats.walkSpeed,
        jumpPower: config.stats.jumpPower,
        airControl: config.movement?.airControl ?? 0.8,
        coyoteTime: config.movement?.coyoteTime ?? 0,
        jumpBufferTime: config.movement?.jumpBufferTime ?? 0,
        doubleJumpEnabled: config.movement?.doubleJumpEnabled ?? false,
        doubleJumpPower: config.movement?.doubleJumpPower,
      }),
    );

    // Add melee attack behavior
    this.melee = this.behaviors.add(
      'melee',
      new MeleeAttack({
        damage: config.stats.attackDamage,
        range: config.combat?.meleeRange ?? 100,
        width: config.combat?.meleeWidth ?? 80,
      }),
    );

    // Add ranged attack behavior if configured
    if (config.combat?.rangedKey) {
      this.ranged = this.behaviors.add(
        'ranged',
        new RangedAttack({
          damage: config.stats.attackDamage,
          projectileKey: config.combat.rangedKey,
          projectileSpeed: config.combat.rangedSpeed ?? 600,
          cooldown: config.combat.rangedCooldown ?? 300,
        }),
      );
    }

    // Hook: Allow subclass to add custom behaviors
    this.initBehaviors(config);

    // Hook: Allow subclass to initialize ultimate skill
    this.initUltimate();

    // Initialize sounds
    this.initializeSounds();

    // Initialize FSM
    this.fsm = new PlayerFSM(scene, this, config.animKeys);
  }

  // ============================================================================
  // HOOKS - Override in subclass
  // ============================================================================

  /**
   * HOOK: Initialize custom behaviors
   * Override this to add additional behaviors or modify existing ones
   *
   * CRITICAL TIMING: Called DURING super() constructor, BEFORE subclass
   * constructor code after super() executes. Initialize behaviors HERE.
   */
  protected initBehaviors(config: PlayerConfig): void {
    // Override in subclass to add custom behaviors
  }

  /**
   * HOOK: Initialize ultimate skill
   * Override this to add an ultimate skill behavior
   *
   * CRITICAL TIMING: Called DURING super() constructor. Initialize
   * your ultimate skill HERE, not after super() in the constructor.
   *
   * @example
   *   protected initUltimate(): void {
   *     this.ultimate = this.behaviors.add('ultimate', new DashAttackSkill({
   *       id: 'chidori',
   *       name: 'Chidori',
   *       cooldown: 5000,
   *       damage: 100,
   *     }));
   *   }
   */
  protected initUltimate(): void {
    // Override in subclass to add ultimate skill
  }

  /**
   * HOOK: Called every frame after standard update
   */
  protected onUpdate(): void {
    // Override in subclass
  }

  /**
   * HOOK: Called when player takes damage
   */
  protected onDamageTaken(damage: number): void {
    // Override in subclass
  }

  /**
   * HOOK: Called when player dies
   */
  protected onDeath(): void {
    // Override in subclass
  }

  /**
   * HOOK: Called when health changes
   */
  protected onHealthChanged(oldHealth: number, newHealth: number): void {
    // Override in subclass
  }

  /**
   * HOOK: Called when ultimate skill is used
   */
  protected onUltimateUsed(): void {
    // Override in subclass
  }

  /**
   * HOOK: Called when ultimate skill completes
   */
  protected onUltimateComplete(): void {
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
   * Main update method - call every frame from scene
   *
   * @param wasdKeys - WASD keys for movement
   * @param spaceKey - Space key for jump
   * @param shiftKey - Shift key for melee attack
   * @param eKey - E key for ranged attack
   * @param qKey - Q key for ultimate skill
   */
  update(
    wasdKeys: {
      W: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
    },
    spaceKey: Phaser.Input.Keyboard.Key,
    shiftKey: Phaser.Input.Keyboard.Key,
    eKey: Phaser.Input.Keyboard.Key,
    qKey: Phaser.Input.Keyboard.Key,
  ): void {
    // Store input references for FSM
    this.wasdKeys = wasdKeys;
    this.spaceKey = spaceKey;
    this.shiftKey = shiftKey;
    this.eKey = eKey;
    this.qKey = qKey;

    // Safety check
    if (!this.body || !this.active) return;

    // Block all input during ultimate
    if (this.isUsingUltimate) return;

    // Update visual flip
    this.setFlipX(this.facingDirection === 'left');

    // Update origin and offset for animation frame normalization
    utils.resetOriginAndOffset(this, this.facingDirection);

    // Apply visual offset correction (sink sprite into ground)
    // This moves the physics body UP relative to the sprite, so the sprite
    // appears to stand ON the ground rather than floating above it.
    // Safe because Phaser collision only checks body, not sprite image.
    if (this.verticalVisualOffset !== 0) {
      const currentOffset = this.body.offset;
      this.body.setOffset(
        currentOffset.x,
        currentOffset.y - this.verticalVisualOffset,
      );
    }

    // Update all behaviors
    this.behaviors.update();

    // Update FSM
    this.fsm.update(0, 0);

    // Hook: Custom update logic
    this.onUpdate();
  }

  // ============================================================================
  // SHOOTING (E key)
  // ============================================================================

  /**
   * Shoot a projectile (called by FSM)
   */
  shoot(): void {
    if (this.isDead || !this.ranged) return;

    const bullet = this.ranged.shoot(this.facingDirection, 'playerBullets');
    if (bullet) {
      this.shootSound?.play();
    }
  }

  // ============================================================================
  // ULTIMATE SKILL (Q key)
  // ============================================================================

  /**
   * Check if ultimate can be used
   */
  canUseUltimate(): boolean {
    if (this.isDead || this.isHurting || this.isUsingUltimate) return false;
    return this.ultimate?.canUse() ?? false;
  }

  /**
   * Use ultimate skill (called by FSM)
   */
  useUltimate(): void {
    if (!this.canUseUltimate() || !this.ultimate) return;

    this.isUsingUltimate = true;
    this.body.setVelocityX(0);

    // Hook: Ultimate used
    this.onUltimateUsed();
    this.ultimateSound?.play();

    // Execute skill
    const scene = this.scene as any;
    this.ultimate.use({
      scene: this.scene,
      owner: this,
      facingDirection: this.facingDirection,
      enemies: scene.enemies,
      onComplete: () => {
        this.isUsingUltimate = false;
        this.onUltimateComplete();
      },
    });
  }

  /**
   * Get ultimate cooldown remaining in milliseconds
   */
  getUltimateCooldownRemaining(): number {
    return this.ultimate?.getCooldownRemaining() ?? 0;
  }

  /**
   * Get ultimate cooldown progress (0 = on cooldown, 1 = ready)
   */
  getUltimateCooldownProgress(): number {
    return this.ultimate?.getCooldownProgress() ?? 1;
  }

  // ============================================================================
  // DAMAGE HANDLING
  // ============================================================================

  /**
   * Take damage from an attack
   */
  takeDamage(damage: number): void {
    if (this.isInvulnerable || this.isDead) return;

    const oldHealth = this.health;
    this.health -= damage;
    this.isHurting = true;
    this.isInvulnerable = true;

    // Hook: Damage taken
    this.onDamageTaken(damage);

    // Hook: Health changed
    this.onHealthChanged(oldHealth, this.health);

    // Switch to hurt state
    this.fsm.goto('hurting');

    // Blinking effect
    this.scene.tweens.add({
      targets: this,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      repeat: Math.floor(this.invulnerableTime / 200),
      onComplete: () => {
        this.alpha = 1;
        this.isInvulnerable = false;
      },
    });
  }

  /**
   * Heal the player
   */
  heal(amount: number): void {
    const oldHealth = this.health;
    this.health = Math.min(this.health + amount, this.maxHealth);

    if (this.health !== oldHealth) {
      this.onHealthChanged(oldHealth, this.health);
    }
  }

  /**
   * Kill the player immediately
   */
  kill(): void {
    if (this.isDead) return;

    this.health = 0;
    this.isDead = true;
    this.onDeath();
    this.fsm.goto('dying');
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
   * Check if player is on the ground
   */
  isGrounded(): boolean {
    return this.body?.onFloor() ?? false;
  }

  /**
   * Initialize sound effects
   * Override to customize sound keys
   */
  protected initializeSounds(): void {
    this.jumpSound = utils.safeAddSound(this.scene, 'player_jump', {
      volume: 0.3,
    });
    this.attackSound = utils.safeAddSound(this.scene, 'player_attack', {
      volume: 0.3,
    });
    this.hurtSound = utils.safeAddSound(this.scene, 'player_hurt', {
      volume: 0.3,
    });
    this.shootSound = utils.safeAddSound(this.scene, 'player_shoot', {
      volume: 0.3,
    });
    this.ultimateSound = utils.safeAddSound(this.scene, 'player_ultimate', {
      volume: 0.3,
    });
  }
}
