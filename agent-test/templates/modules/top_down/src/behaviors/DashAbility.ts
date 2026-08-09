import Phaser from 'phaser';
import { BaseBehavior } from './IBehavior';

/**
 * DashAbility configuration
 */
export interface DashAbilityConfig {
  /** Dash speed in pixels per second */
  dashSpeed: number;
  /** Dash duration in milliseconds */
  dashDuration: number;
  /** Cooldown between dashes in milliseconds */
  cooldown: number;
  /**
   * Whether player should be invulnerable during dash (default true).
   * NOTE: This is a FLAG read by the character class (e.g., BasePlayer).
   * DashAbility itself does NOT manage isInvulnerable on the owner.
   * The character class is responsible for granting/revoking invulnerability
   * to avoid conflicts with damage i-frames.
   */
  invulnerable?: boolean;
}

/**
 * DashAbility - Handles dash/dodge mechanic for top-down characters
 *
 * Features:
 * - Direction-based dash (toward movement direction)
 * - Configurable speed, duration, and cooldown
 * - Optional invulnerability frames (i-frames) during dash
 * - Cooldown management with progress tracking
 *
 * The dash direction is provided by the caller (usually from movement input
 * or facing direction). During the dash, this behavior overrides the owner's
 * velocity and optionally sets invulnerability.
 *
 * Usage:
 *   const dash = new DashAbility({
 *     dashSpeed: 500,
 *     dashDuration: 200,
 *     cooldown: 1000,
 *   });
 *   this.behaviors.add('dash', dash);
 *
 *   // When dash input is pressed:
 *   if (dash.canDash()) {
 *     dash.dash(directionX, directionY);
 *   }
 */
export class DashAbility extends BaseBehavior {
  // Configuration
  public dashSpeed: number;
  public dashDuration: number;
  public cooldown: number;
  /** Flag indicating if dash should grant invulnerability (read by character class) */
  public readonly invulnerable: boolean;

  // State
  public isDashing: boolean = false;
  private dashTimer?: Phaser.Time.TimerEvent;
  private lastDashTime: number = 0;
  private dashDirection: { x: number; y: number } = { x: 0, y: 0 };

  constructor(config: DashAbilityConfig) {
    super();
    this.dashSpeed = config.dashSpeed;
    this.dashDuration = config.dashDuration;
    this.cooldown = config.cooldown;
    this.invulnerable = config.invulnerable ?? true;
  }

  /**
   * During dash, maintain dash velocity (overrides normal movement)
   */
  update(): void {
    if (this.isDashing) {
      const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
      owner.setVelocity(
        this.dashDirection.x * this.dashSpeed,
        this.dashDirection.y * this.dashSpeed,
      );
    }
  }

  /**
   * Check if dash is available (not currently dashing and cooldown elapsed)
   */
  canDash(): boolean {
    if (this.isDashing) return false;
    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    const now = owner.scene.time.now;
    return now - this.lastDashTime >= this.cooldown;
  }

  /**
   * Execute a dash in the specified direction
   *
   * @param directionX - X component of dash direction (will be normalized)
   * @param directionY - Y component of dash direction (will be normalized)
   * @returns true if dash started, false if on cooldown or zero direction
   */
  dash(directionX: number, directionY: number): boolean {
    if (!this.canDash()) return false;

    // Normalize direction vector
    const len = Math.sqrt(directionX * directionX + directionY * directionY);
    if (len === 0) return false;

    this.dashDirection.x = directionX / len;
    this.dashDirection.y = directionY / len;

    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();

    this.isDashing = true;
    this.lastDashTime = owner.scene.time.now;

    // NOTE: Invulnerability is managed by the character class (BasePlayer),
    // NOT here. This avoids conflicts with damage i-frames.

    // Schedule dash end
    this.dashTimer = owner.scene.time.delayedCall(this.dashDuration, () => {
      this.endDash();
    });

    return true;
  }

  /**
   * End the current dash (called automatically by timer)
   */
  private endDash(): void {
    if (!this.isDashing) return;
    this.isDashing = false;

    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    owner.setVelocity(0, 0);

    // NOTE: Invulnerability cleanup is handled by the character class
    // (BasePlayer.performDash monitors dash completion)
  }

  /**
   * Called when detached - clean up timer
   */
  protected onDetach(): void {
    if (this.dashTimer) {
      this.dashTimer.destroy();
      this.dashTimer = undefined;
    }
    this.isDashing = false;
  }

  /**
   * Get time remaining until dash is ready (ms)
   */
  getCooldownRemaining(): number {
    if (this.cooldown <= 0) return 0;
    const owner = this.getOwner<Phaser.Physics.Arcade.Sprite>();
    const elapsed = owner.scene.time.now - this.lastDashTime;
    return Math.max(0, this.cooldown - elapsed);
  }

  /**
   * Get cooldown progress (0 = on cooldown, 1 = ready)
   */
  getCooldownProgress(): number {
    if (this.cooldown <= 0) return 1;
    return 1 - this.getCooldownRemaining() / this.cooldown;
  }
}
