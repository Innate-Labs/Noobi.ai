import Phaser from 'phaser';
import { BaseBehavior } from './IBehavior';

/**
 * ChaseAI configuration
 */
export interface ChaseAIConfig {
  /** Movement speed when chasing in pixels per second */
  speed: number;
  /** Distance at which to start chasing (default: always chase) */
  detectionRange?: number;
  /** Distance at which to stop (too close) */
  stopDistance?: number;
  /** Distance at which to give up chase (default: never) */
  giveUpDistance?: number;
  /** Whether to chase in Y direction as well (for flying enemies) */
  chaseVertical?: boolean;
  /** Vertical speed multiplier when chasing vertically (default 1.0) */
  verticalSpeedMultiplier?: number;
}

/**
 * ChaseAI - Chase behavior for enemies
 *
 * This behavior makes an enemy chase a target (usually the player).
 * It can optionally:
 * - Only start chasing when target is within detection range
 * - Stop at a minimum distance from target
 * - Give up chase when target is too far
 * - Chase vertically (for flying enemies)
 *
 * Usage:
 *   const chase = new ChaseAI({
 *     speed: 100,
 *     detectionRange: 300,
 *     stopDistance: 50,
 *   });
 *   this.behaviors.add('chase', chase);
 *   chase.setTarget(player);
 *
 *   // In update:
 *   if (chase.isChasing()) {
 *     // Maybe play chase animation
 *   }
 */
export class ChaseAI extends BaseBehavior {
  // Configuration
  public speed: number;
  public detectionRange?: number;
  public stopDistance: number;
  public giveUpDistance?: number;
  public chaseVertical: boolean;
  public verticalSpeedMultiplier: number;

  // State
  public target: Phaser.Physics.Arcade.Sprite | null = null;
  public facingDirection: 'left' | 'right' = 'right';
  private _isChasing: boolean = false;

  constructor(config: ChaseAIConfig) {
    super();
    this.speed = config.speed;
    this.detectionRange = config.detectionRange;
    this.stopDistance = config.stopDistance ?? 0;
    this.giveUpDistance = config.giveUpDistance;
    this.chaseVertical = config.chaseVertical ?? false;
    this.verticalSpeedMultiplier = config.verticalSpeedMultiplier ?? 1.0;
  }

  /**
   * Set the target to chase
   */
  setTarget(target: Phaser.Physics.Arcade.Sprite | null): void {
    this.target = target;
  }

  /**
   * Update chase behavior
   */
  update(): void {
    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();

    // No target or target inactive
    if (!this.target || !this.target.active) {
      this._isChasing = false;
      owner.setVelocityX(0);
      if (this.chaseVertical) {
        owner.setVelocityY(0);
      }
      return;
    }

    // Calculate distance to target
    const distance = Phaser.Math.Distance.Between(
      owner.x,
      owner.y,
      this.target.x,
      this.target.y,
    );

    // Check if should chase
    const shouldChase = this.shouldChase(distance);

    if (!shouldChase) {
      this._isChasing = false;
      owner.setVelocityX(0);
      if (this.chaseVertical) {
        owner.setVelocityY(0);
      }
      return;
    }

    this._isChasing = true;

    // Calculate direction to target
    const dx = this.target.x - owner.x;
    const dy = this.target.y - owner.y;

    // Update facing direction
    this.facingDirection = dx < 0 ? 'left' : 'right';

    // Sync owner's facing direction if it has one
    if ('facingDirection' in owner) {
      (owner as any).facingDirection = this.facingDirection;
    }

    // Check if too close
    if (distance <= this.stopDistance) {
      owner.setVelocityX(0);
      if (this.chaseVertical) {
        owner.setVelocityY(0);
      }
      return;
    }

    // Apply horizontal movement
    const dirX = dx > 0 ? 1 : -1;
    owner.setVelocityX(dirX * this.speed);

    // Apply vertical movement if enabled
    if (this.chaseVertical) {
      const dirY = dy > 0 ? 1 : -1;
      owner.setVelocityY(dirY * this.speed * this.verticalSpeedMultiplier);
    }
  }

  /**
   * Determine if should be chasing based on distance
   */
  private shouldChase(distance: number): boolean {
    // Check give up distance (too far)
    if (this.giveUpDistance !== undefined && distance > this.giveUpDistance) {
      return false;
    }

    // Check detection range (not close enough to start)
    if (this.detectionRange !== undefined && distance > this.detectionRange) {
      // If already chasing and still within give up distance, continue
      if (
        this._isChasing &&
        (this.giveUpDistance === undefined || distance <= this.giveUpDistance)
      ) {
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Check if currently chasing target
   */
  isChasing(): boolean {
    return this._isChasing;
  }

  /**
   * Get distance to target
   */
  getDistanceToTarget(): number {
    if (!this.target) return Infinity;

    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    return Phaser.Math.Distance.Between(
      owner.x,
      owner.y,
      this.target.x,
      this.target.y,
    );
  }

  /**
   * Check if target is within a specific range
   */
  isTargetInRange(range: number): boolean {
    return this.getDistanceToTarget() <= range;
  }

  /**
   * Check if target is to the left
   */
  isTargetLeft(): boolean {
    if (!this.target) return false;
    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    return this.target.x < owner.x;
  }

  /**
   * Check if target is to the right
   */
  isTargetRight(): boolean {
    if (!this.target) return false;
    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    return this.target.x > owner.x;
  }
}
