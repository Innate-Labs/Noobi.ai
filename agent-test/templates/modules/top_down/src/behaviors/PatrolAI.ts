import Phaser from 'phaser';
import { BaseBehavior } from './IBehavior';
import { angleToDirection } from '../utils';

/**
 * PatrolAI configuration
 */
export interface PatrolAIConfig {
  /** Movement speed in pixels per second */
  speed: number;
  /** Rectangular patrol area (optional — if not set, walks in current direction) */
  patrolArea?: { minX: number; maxX: number; minY: number; maxY: number };
  /** Time between random direction changes in ms (default 2000) */
  directionChangeInterval?: number;
}

/**
 * PatrolAI - 2D patrol behavior for top-down enemies
 *
 * Unlike the platformer patrol (left/right with cliff detection), this
 * patrols freely in 2D space within an optional rectangular area.
 *
 * Features:
 * - Random 2D wandering within optional patrol bounds
 * - Periodic direction changes
 * - Automatic turn-around at patrol boundaries
 * - Facing direction output for animations
 *
 * Usage:
 *   const patrol = new PatrolAI({
 *     speed: 60,
 *     patrolArea: { minX: 100, maxX: 500, minY: 100, maxY: 400 },
 *     directionChangeInterval: 3000,
 *   });
 *   this.behaviors.add('patrol', patrol);
 */
export class PatrolAI extends BaseBehavior {
  // Configuration
  public speed: number;
  public patrolArea?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  public directionChangeInterval: number;

  // State
  public facingDirection: 'left' | 'right' | 'up' | 'down' = 'down';
  private moveDirection: { x: number; y: number } = { x: 0, y: 1 };
  private lastDirectionChangeTime: number = 0;

  constructor(config: PatrolAIConfig) {
    super();
    this.speed = config.speed;
    this.patrolArea = config.patrolArea;
    this.directionChangeInterval = config.directionChangeInterval ?? 2000;

    // Random initial direction
    this.pickRandomDirection();
  }

  /**
   * Update patrol behavior
   */
  update(): void {
    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    const now = owner.scene.time.now;

    // Check if at patrol boundary — if so, redirect AWAY from boundary
    let atBoundary = false;
    if (this.patrolArea) {
      if (owner.x <= this.patrolArea.minX && this.moveDirection.x < 0) {
        this.moveDirection.x = Math.abs(this.moveDirection.x); // Force positive X
        atBoundary = true;
      }
      if (owner.x >= this.patrolArea.maxX && this.moveDirection.x > 0) {
        this.moveDirection.x = -Math.abs(this.moveDirection.x); // Force negative X
        atBoundary = true;
      }
      if (owner.y <= this.patrolArea.minY && this.moveDirection.y < 0) {
        this.moveDirection.y = Math.abs(this.moveDirection.y); // Force positive Y
        atBoundary = true;
      }
      if (owner.y >= this.patrolArea.maxY && this.moveDirection.y > 0) {
        this.moveDirection.y = -Math.abs(this.moveDirection.y); // Force negative Y
        atBoundary = true;
      }

      if (atBoundary) {
        // Normalize direction after boundary correction
        const len = Math.sqrt(
          this.moveDirection.x ** 2 + this.moveDirection.y ** 2,
        );
        if (len > 0) {
          this.moveDirection.x /= len;
          this.moveDirection.y /= len;
        }
        this.lastDirectionChangeTime = now;
      }
    }

    // Periodic random direction change (only if not just corrected by boundary)
    if (
      !atBoundary &&
      now - this.lastDirectionChangeTime > this.directionChangeInterval
    ) {
      this.pickRandomDirection();
      this.lastDirectionChangeTime = now;
    }

    // Apply movement velocity
    owner.setVelocity(
      this.moveDirection.x * this.speed,
      this.moveDirection.y * this.speed,
    );

    // Update facing direction from movement angle
    const angle = Math.atan2(this.moveDirection.y, this.moveDirection.x);
    this.facingDirection = angleToDirection(angle);

    // Sync with owner
    if ('facingDirection' in owner) {
      (owner as any).facingDirection = this.facingDirection;
    }
  }

  /**
   * Pick a random 2D direction to walk in
   */
  private pickRandomDirection(): void {
    const angle = Math.random() * Math.PI * 2;
    this.moveDirection.x = Math.cos(angle);
    this.moveDirection.y = Math.sin(angle);
  }

  /**
   * Set the patrol area
   */
  setPatrolArea(minX: number, maxX: number, minY: number, maxY: number): void {
    this.patrolArea = { minX, maxX, minY, maxY };
  }

  /**
   * Reverse direction
   */
  turnAround(): void {
    this.moveDirection.x = -this.moveDirection.x;
    this.moveDirection.y = -this.moveDirection.y;
    const angle = Math.atan2(this.moveDirection.y, this.moveDirection.x);
    this.facingDirection = angleToDirection(angle);
  }
}
