import Phaser from 'phaser';
import { BaseBehavior } from './IBehavior';
import { angleToDirection } from '../utils';

/**
 * ChaseAI configuration
 */
export interface ChaseAIConfig {
  /** Movement speed when chasing in pixels per second */
  speed: number;
  /** Distance at which to start chasing (default: always chase) */
  detectionRange?: number;
  /** Distance at which to stop (too close to target) */
  stopDistance?: number;
  /** Distance at which to give up chase (default: never) */
  giveUpDistance?: number;
}

/**
 * ChaseAI - 2D chase behavior for top-down enemies
 *
 * Unlike the platformer version (which has an optional vertical flag),
 * this always chases in full 2D — natural for top-down games.
 *
 * Features:
 * - Full 2D chase (no gravity considerations)
 * - Optional detection range (only chase when target is close)
 * - Stop distance (maintain distance for ranged enemies)
 * - Give up distance (stop chasing when target is too far)
 * - Hysteresis: once chasing, continues until give-up distance
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
 *   // Check state:
 *   if (chase.isChasing()) {
 *     // Play chase animation
 *   }
 */
export class ChaseAI extends BaseBehavior {
  // Configuration
  public speed: number;
  public detectionRange?: number;
  public stopDistance: number;
  public giveUpDistance?: number;

  // State
  public target: Phaser.Physics.Arcade.Sprite | null = null;
  public facingDirection: 'left' | 'right' | 'up' | 'down' = 'down';
  private _isChasing: boolean = false;

  constructor(config: ChaseAIConfig) {
    super();
    this.speed = config.speed;
    this.detectionRange = config.detectionRange;
    this.stopDistance = config.stopDistance ?? 0;
    this.giveUpDistance = config.giveUpDistance;
  }

  /**
   * Set the target to chase
   */
  setTarget(target: Phaser.Physics.Arcade.Sprite | null): void {
    this.target = target;
  }

  /**
   * Update chase behavior — moves toward target in 2D
   */
  update(): void {
    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();

    // No target or target inactive
    if (!this.target || !this.target.active) {
      this._isChasing = false;
      owner.setVelocity(0, 0);
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
    if (!this.shouldChase(distance)) {
      this._isChasing = false;
      owner.setVelocity(0, 0);
      return;
    }

    this._isChasing = true;

    // Calculate angle to target
    const angle = Phaser.Math.Angle.Between(
      owner.x,
      owner.y,
      this.target.x,
      this.target.y,
    );

    // Update facing direction (always face target even when stopped)
    this.facingDirection = angleToDirection(angle);
    if ('facingDirection' in owner) {
      (owner as any).facingDirection = this.facingDirection;
    }

    // Check if too close (stop distance)
    if (distance <= this.stopDistance) {
      owner.setVelocity(0, 0);
      return;
    }

    // Chase in 2D
    const vx = Math.cos(angle) * this.speed;
    const vy = Math.sin(angle) * this.speed;
    owner.setVelocity(vx, vy);
  }

  /**
   * Determine if should be chasing based on distance and hysteresis
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
   * Get distance to current target
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
}
