import Phaser from 'phaser';
import { BaseBehavior } from './IBehavior';
import { angleToDirection } from '../utils';

/**
 * FaceTarget configuration
 */
export interface FaceTargetConfig {
  /**
   * Whether to track mouse position for aiming (default true)
   * When true, the behavior continuously tracks the mouse world position
   * and updates facingDirection accordingly.
   */
  useMouseAim?: boolean;
  /**
   * Whether to rotate the sprite to face the aim angle (default false)
   * When false, uses 4-direction facing + flipX for left/right.
   * When true, directly rotates the sprite (useful for vehicles/turrets).
   */
  rotateSprite?: boolean;
}

/**
 * FaceTarget - Handles aiming and facing direction for top-down characters
 *
 * This behavior tracks a target (mouse or entity) and updates the owner's
 * facing direction. It's the core aiming system for top-down games.
 *
 * Features:
 * - Mouse tracking (converts screen position to world position via camera)
 * - Manual aim override via aimAt()
 * - 4-direction facing output (up/down/left/right)
 * - Optional sprite rotation mode
 * - Provides aim angle and aim vector for projectile direction
 *
 * Usage:
 *   const faceTarget = new FaceTarget({ useMouseAim: true });
 *   this.behaviors.add('faceTarget', faceTarget);
 *
 *   // Read aim state:
 *   faceTarget.facingDirection; // 'left' | 'right' | 'up' | 'down'
 *   faceTarget.aimAngle;       // radians
 *   faceTarget.getAimVector();  // { x: cos, y: sin }
 */
export class FaceTarget extends BaseBehavior {
  // Configuration
  public useMouseAim: boolean;
  public rotateSprite: boolean;

  // State
  /** Current aim angle in radians */
  public aimAngle: number = 0;
  /** Current 4-direction facing derived from aimAngle */
  public facingDirection: 'left' | 'right' | 'up' | 'down' = 'down';

  constructor(config?: FaceTargetConfig) {
    super();
    this.useMouseAim = config?.useMouseAim ?? true;
    this.rotateSprite = config?.rotateSprite ?? false;
  }

  /**
   * Update aim direction from mouse position each frame
   */
  update(): void {
    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    if (!owner.scene) return;

    if (this.useMouseAim) {
      const pointer = owner.scene.input.activePointer;
      const worldPoint = owner.scene.cameras.main.getWorldPoint(
        pointer.x,
        pointer.y,
      );
      this.aimAngle = Phaser.Math.Angle.Between(
        owner.x,
        owner.y,
        worldPoint.x,
        worldPoint.y,
      );
    }

    // Update 4-direction facing from angle
    this.facingDirection = angleToDirection(this.aimAngle);

    // Optionally rotate sprite directly
    if (this.rotateSprite) {
      owner.setRotation(this.aimAngle);
    }
  }

  /**
   * Manually aim at a specific world position
   * Useful for AI enemies or overriding mouse aim
   *
   * @param x - Target world X
   * @param y - Target world Y
   */
  aimAt(x: number, y: number): void {
    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    this.aimAngle = Phaser.Math.Angle.Between(owner.x, owner.y, x, y);
    this.facingDirection = angleToDirection(this.aimAngle);
  }

  /**
   * Get a normalized aim direction vector
   * Useful for projectile velocity calculation
   */
  getAimVector(): { x: number; y: number } {
    return {
      x: Math.cos(this.aimAngle),
      y: Math.sin(this.aimAngle),
    };
  }
}
