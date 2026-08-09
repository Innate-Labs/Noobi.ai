import Phaser from 'phaser';
import { BaseBehavior } from './IBehavior';
import * as utils from '../utils';

/**
 * MeleeAttack configuration
 */
export interface MeleeAttackConfig {
  /** Damage dealt per hit */
  damage: number;
  /** Attack range (forward distance in pixels) */
  range?: number;
  /** Attack width (perpendicular to direction in pixels) */
  width?: number;
  /** Cooldown between attacks in ms (default 0) */
  cooldown?: number;
}

/**
 * MeleeAttack - Handles melee combat for characters
 *
 * This behavior manages:
 * - Melee trigger zone (attack hitbox)
 * - Attack cooldown
 * - Tracking of targets hit in current attack
 *
 * The actual collision detection is handled by BaseLevelScene.
 * This behavior provides the melee trigger and tracks attack state.
 *
 * Usage:
 *   const melee = new MeleeAttack({ damage: 25, range: 100, width: 80 });
 *   this.behaviors.add('melee', melee);
 *
 *   // When attacking:
 *   if (melee.canAttack()) {
 *     melee.startAttack();
 *   }
 *
 *   // After attack animation completes:
 *   melee.endAttack();
 */
export class MeleeAttack extends BaseBehavior {
  // Configuration
  public damage: number;
  public range: number;
  public width: number;
  public cooldown: number;

  // State
  public isAttacking: boolean = false;
  public currentTargets: Set<any> = new Set();
  public meleeTrigger!: Phaser.GameObjects.Zone;

  // Timing
  private lastAttackTime: number = 0;

  constructor(config: MeleeAttackConfig) {
    super();
    this.damage = config.damage;
    this.range = config.range ?? 100;
    this.width = config.width ?? 80;
    this.cooldown = config.cooldown ?? 0;
  }

  /**
   * Called when attached to owner - create melee trigger
   */
  protected onAttach(): void {
    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    this.meleeTrigger = utils.createTrigger(
      owner.scene,
      owner,
      0,
      0,
      this.range,
      this.width,
    );
  }

  /**
   * Called when detached - destroy melee trigger
   */
  protected onDetach(): void {
    if (this.meleeTrigger) {
      this.meleeTrigger.destroy();
    }
  }

  /**
   * Update melee trigger position based on facing direction
   */
  update(): void {
    if (!this.meleeTrigger) return;

    const owner = this.getOwner<any>();
    const facingDirection = owner.facingDirection ?? 'right';

    utils.updateMeleeTrigger(
      owner,
      this.meleeTrigger,
      facingDirection,
      this.range,
      this.width,
    );
  }

  /**
   * Check if attack is ready (cooldown elapsed)
   */
  canAttack(): boolean {
    if (this.isAttacking) return false;
    if (this.cooldown <= 0) return true;

    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    const now = owner.scene.time.now;
    return now - this.lastAttackTime >= this.cooldown;
  }

  /**
   * Start an attack
   * @returns true if attack started, false if on cooldown
   */
  startAttack(): boolean {
    if (!this.canAttack()) return false;

    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();

    this.isAttacking = true;
    this.currentTargets.clear();
    this.lastAttackTime = owner.scene.time.now;

    return true;
  }

  /**
   * End the current attack
   * Call this when attack animation completes
   */
  endAttack(): void {
    this.isAttacking = false;
    this.currentTargets.clear();
  }

  /**
   * Register a target as hit (prevents multi-hit in same attack)
   * @param target - The target that was hit
   * @returns true if this is a new hit, false if already hit
   */
  registerHit(target: any): boolean {
    if (this.currentTargets.has(target)) {
      return false;
    }
    this.currentTargets.add(target);
    return true;
  }

  /**
   * Check if a target has been hit in current attack
   */
  hasHit(target: any): boolean {
    return this.currentTargets.has(target);
  }

  /**
   * Get the melee trigger for collision detection
   */
  getTrigger(): Phaser.GameObjects.Zone {
    return this.meleeTrigger;
  }

  /**
   * Get time remaining until attack is ready (ms)
   */
  getCooldownRemaining(): number {
    if (this.cooldown <= 0) return 0;

    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    const now = owner.scene.time.now;
    const elapsed = now - this.lastAttackTime;
    return Math.max(0, this.cooldown - elapsed);
  }
}
