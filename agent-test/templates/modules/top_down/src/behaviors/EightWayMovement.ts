import Phaser from 'phaser';
import { BaseBehavior } from './IBehavior';
import { angleToDirection } from '../utils';

/**
 * EightWayMovement configuration
 */
export interface EightWayMovementConfig {
  /** Walking speed in pixels per second */
  walkSpeed: number;
  /**
   * Movement friction (0-1, default 1)
   * 1 = instant stop (snappy), lower values = gradual deceleration (slidey)
   */
  friction?: number;
}

/**
 * EightWayMovement - Handles 8-directional movement for top-down characters
 *
 * Features:
 * - 8-directional movement (WASD)
 * - Diagonal speed normalization (prevents faster diagonal movement)
 * - Configurable movement friction
 * - Automatic facing direction update (4-way: up/down/left/right)
 *
 * This behavior does NOT handle input directly — the FSM or scene sets
 * the input direction via setInput(). This keeps input handling separate
 * from movement logic, allowing the same behavior for player and AI.
 *
 * Usage:
 *   const movement = new EightWayMovement({
 *     walkSpeed: 200,
 *     friction: 1, // instant stop
 *   });
 *   this.behaviors.add('movement', movement);
 *
 *   // In FSM or update:
 *   movement.setInput(1, 0);   // Move right
 *   movement.setInput(-1, 1);  // Move down-left (diagonal)
 *   movement.setInput(0, 0);   // Stop
 */
export class EightWayMovement extends BaseBehavior {
  // Configuration
  public walkSpeed: number;
  public friction: number;

  // Current input direction (-1, 0, or 1 per axis)
  private inputX: number = 0;
  private inputY: number = 0;

  /** Last movement direction (for facing when input stops) */
  public movementDirection: 'left' | 'right' | 'up' | 'down' = 'down';

  constructor(config: EightWayMovementConfig) {
    super();
    this.walkSpeed = config.walkSpeed;
    this.friction = config.friction ?? 1;
  }

  /**
   * Called every frame — applies velocity based on current input
   */
  update(): void {
    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    const body = owner.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    let targetVX = this.inputX * this.walkSpeed;
    let targetVY = this.inputY * this.walkSpeed;

    // Diagonal normalization — prevent faster diagonal movement
    if (this.inputX !== 0 && this.inputY !== 0) {
      const factor = 1 / Math.SQRT2;
      targetVX *= factor;
      targetVY *= factor;
    }

    // Apply velocity (with optional friction smoothing)
    if (this.friction >= 1) {
      owner.setVelocity(targetVX, targetVY);
    } else {
      body.velocity.x = Phaser.Math.Linear(
        body.velocity.x,
        targetVX,
        this.friction,
      );
      body.velocity.y = Phaser.Math.Linear(
        body.velocity.y,
        targetVY,
        this.friction,
      );
    }

    // Update movement direction (only when actively moving)
    if (this.inputX !== 0 || this.inputY !== 0) {
      const angle = Math.atan2(this.inputY, this.inputX);
      this.movementDirection = angleToDirection(angle);
    }
  }

  /**
   * Set movement input direction
   * Values should be -1, 0, or 1 per axis (will be clamped via Math.sign)
   *
   * @param x - Horizontal input (-1 = left, 0 = none, 1 = right)
   * @param y - Vertical input (-1 = up, 0 = none, 1 = down)
   */
  setInput(x: number, y: number): void {
    this.inputX = Math.sign(x);
    this.inputY = Math.sign(y);
  }

  /**
   * Stop all movement input
   */
  stop(): void {
    this.inputX = 0;
    this.inputY = 0;
  }

  /**
   * Check if there is any movement input
   */
  isMoving(): boolean {
    return this.inputX !== 0 || this.inputY !== 0;
  }

  /**
   * Get raw input values
   */
  getInput(): { x: number; y: number } {
    return { x: this.inputX, y: this.inputY };
  }
}
