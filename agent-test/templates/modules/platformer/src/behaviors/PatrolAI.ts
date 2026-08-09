import Phaser from 'phaser';
import { BaseBehavior } from './IBehavior';

/**
 * PatrolAI configuration
 */
export interface PatrolAIConfig {
  /** Movement speed in pixels per second */
  speed: number;
  /** Minimum patrol X position (optional - uses cliff detection if not set) */
  minX?: number;
  /** Maximum patrol X position (optional - uses cliff detection if not set) */
  maxX?: number;
  /** Delay before changing direction in ms (default 500) */
  directionChangeDelay?: number;
  /** Distance ahead to check for cliffs in pixels (default 32) */
  cliffCheckDistance?: number;
  /** Whether to detect and turn at cliffs (default true) */
  detectCliffs?: boolean;
}

/**
 * PatrolAI - Simple patrol behavior for enemies
 *
 * This behavior makes an enemy walk back and forth.
 * It can use either:
 * 1. Fixed patrol bounds (minX/maxX) - turns at specified positions
 * 2. Cliff detection - turns when about to walk off a platform
 *
 * Usage:
 *   const patrol = new PatrolAI({
 *     speed: 80,
 *     detectCliffs: true,
 *   });
 *   this.behaviors.add('patrol', patrol);
 *
 *   // In update or AI logic:
 *   patrol.update(); // Handles movement and turning
 */
export class PatrolAI extends BaseBehavior {
  // Configuration
  public speed: number;
  public minX?: number;
  public maxX?: number;
  public directionChangeDelay: number;
  public cliffCheckDistance: number;
  public detectCliffs: boolean;

  // State
  public facingDirection: 'left' | 'right' = 'right';
  private lastDirectionChangeTime: number = 0;

  constructor(config: PatrolAIConfig) {
    super();
    this.speed = config.speed;
    this.minX = config.minX;
    this.maxX = config.maxX;
    this.directionChangeDelay = config.directionChangeDelay ?? 500;
    this.cliffCheckDistance = config.cliffCheckDistance ?? 32;
    this.detectCliffs = config.detectCliffs ?? true;

    // Random initial direction
    this.facingDirection = Math.random() > 0.5 ? 'right' : 'left';
  }

  /**
   * Called when attached - sync with owner's facing direction if it has one
   */
  protected onAttach(): void {
    const owner = this.getOwner<any>();
    if (owner.facingDirection) {
      this.facingDirection = owner.facingDirection;
    }
  }

  /**
   * Update patrol behavior
   */
  update(): void {
    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    const body = owner.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    const scene = owner.scene as any;
    const now = scene.time.now;

    // Check if should turn around
    let shouldTurn = false;

    // Check patrol bounds
    if (
      this.minX !== undefined &&
      owner.x <= this.minX &&
      this.facingDirection === 'left'
    ) {
      shouldTurn = true;
    } else if (
      this.maxX !== undefined &&
      owner.x >= this.maxX &&
      this.facingDirection === 'right'
    ) {
      shouldTurn = true;
    }

    // Check for cliffs (only when on ground)
    if (this.detectCliffs && body.onFloor() && !shouldTurn) {
      shouldTurn = this.checkCliff(owner, scene);
    }

    // Apply direction change with delay
    if (
      shouldTurn &&
      now - this.lastDirectionChangeTime > this.directionChangeDelay
    ) {
      this.facingDirection =
        this.facingDirection === 'right' ? 'left' : 'right';
      this.lastDirectionChangeTime = now;
    }

    // Apply movement
    const velocityX =
      this.facingDirection === 'right' ? this.speed : -this.speed;
    owner.setVelocityX(velocityX);

    // Sync owner's facing direction if it has one
    if ('facingDirection' in owner) {
      (owner as any).facingDirection = this.facingDirection;
    }
  }

  /**
   * Check if there's a cliff ahead
   */
  private checkCliff(owner: Phaser.Physics.Arcade.Sprite, scene: any): boolean {
    const groundLayer = scene.groundLayer;
    if (!groundLayer) return false;

    const body = owner.body as Phaser.Physics.Arcade.Body;

    // Calculate check position
    const checkX =
      this.facingDirection === 'right'
        ? owner.x + body.width / 2 + this.cliffCheckDistance
        : owner.x - body.width / 2 - this.cliffCheckDistance;
    const checkY = owner.y + 10; // Slightly below feet

    // Get tile at check position
    const tileX = groundLayer.worldToTileX(checkX);
    const tileY = groundLayer.worldToTileY(checkY);
    const tile = groundLayer.getTileAt(tileX, tileY);

    // If no tile or empty tile, there's a cliff
    return !tile || tile.index === -1;
  }

  /**
   * Set patrol bounds
   */
  setBounds(minX: number, maxX: number): void {
    this.minX = minX;
    this.maxX = maxX;
  }

  /**
   * Force direction change
   */
  turnAround(): void {
    this.facingDirection = this.facingDirection === 'right' ? 'left' : 'right';
    this.lastDirectionChangeTime =
      this.getOwner<Phaser.Physics.Arcade.Sprite>().scene.time.now;
  }

  /**
   * Set facing direction
   */
  setDirection(direction: 'left' | 'right'): void {
    this.facingDirection = direction;
  }
}
