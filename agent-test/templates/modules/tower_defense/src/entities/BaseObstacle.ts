import Phaser from 'phaser';
import { initScale } from '../utils';

// ============================================================================
// BASE OBSTACLE — Destructible obstacle that can be clicked to destroy
// ============================================================================
// Obstacles block tower placement. When destroyed, they can reveal a buildable
// cell or tower slot. Subclasses override hooks for custom behavior.
//
// HOOKS:
//   onClicked()                — click reaction (sound, visual)
//   onDamaged(remaining)       — damage feedback
//   onDestroyed()              — destruction effects (particles, sound)
//   getClickDamage()           — how much damage per click (default: 1)
// ============================================================================

export interface ObstacleConfig {
  textureKey: string;
  displayHeight?: number;
  maxHealth: number;
  /** Gold reward when destroyed */
  reward?: number;
}

export class BaseObstacle extends Phaser.GameObjects.Image {
  protected config: ObstacleConfig;
  protected _maxHealth: number;
  protected _currentHealth: number;
  protected reward: number;
  protected isDestroyed: boolean = false;

  private healthBar?: Phaser.GameObjects.Graphics;
  private healthBarBg?: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    config: ObstacleConfig,
  ) {
    super(scene, x, y, config.textureKey);
    this.config = config;

    this._maxHealth = config.maxHealth;
    this._currentHealth = this._maxHealth;
    this.reward = config.reward ?? 0;

    scene.add.existing(this);

    if (config.displayHeight) {
      initScale(this, { x: 0.5, y: 0.5 }, undefined, config.displayHeight);
    }

    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', this.handleClick, this);

    this.createHealthBar();
  }

  get health(): number {
    return this._currentHealth;
  }

  get maxHealth(): number {
    return this._maxHealth;
  }

  // ===================== CLICK HANDLING =====================

  private handleClick(): void {
    if (this.isDestroyed) return;

    const damage = this.getClickDamage();
    this._currentHealth -= damage;
    this.updateHealthBar();
    this.playDamageEffect();
    this.onClicked();
    this.onDamaged(this._currentHealth);

    if (this._currentHealth <= 0) {
      this._currentHealth = 0;
      this.destroyObstacle();
    }
  }

  private destroyObstacle(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.onDestroyed();
    this.scene.events.emit('obstacleDestroyed', this, this.reward);

    this.healthBar?.destroy();
    this.healthBarBg?.destroy();
    this.destroy();
  }

  // ===================== VISUAL FEEDBACK =====================

  private playDamageEffect(): void {
    this.setTint(0xff6666);
    this.scene.time.delayedCall(100, () => {
      if (!this.isDestroyed) this.clearTint();
    });

    this.scene.tweens.add({
      targets: this,
      x: this.x + Phaser.Math.Between(-3, 3),
      y: this.y + Phaser.Math.Between(-2, 2),
      duration: 50,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
  }

  // ===================== HEALTH BAR =====================

  private createHealthBar(): void {
    this.healthBarBg = this.scene.add.graphics();
    this.healthBar = this.scene.add.graphics();
    this.updateHealthBar();
  }

  private updateHealthBar(): void {
    if (!this.healthBar || !this.healthBarBg) return;

    const barWidth = 30;
    const barHeight = 4;
    const offsetY = -this.displayHeight / 2 - 8;

    this.healthBarBg.clear();
    this.healthBarBg.fillStyle(0x000000, 0.6);
    this.healthBarBg.fillRect(
      this.x - barWidth / 2,
      this.y + offsetY,
      barWidth,
      barHeight,
    );
    this.healthBarBg.setDepth(100);

    const healthPercent = this._currentHealth / this._maxHealth;
    const color =
      healthPercent > 0.5
        ? 0x88cc44
        : healthPercent > 0.25
          ? 0xffaa00
          : 0xff4444;

    this.healthBar.clear();
    this.healthBar.fillStyle(color, 0.9);
    this.healthBar.fillRect(
      this.x - barWidth / 2,
      this.y + offsetY,
      barWidth * healthPercent,
      barHeight,
    );
    this.healthBar.setDepth(101);
  }

  // ===================== HOOKS (override in subclass) =====================

  /** Called when the obstacle is clicked. Override for click sound/visual. */
  protected onClicked(): void {}

  /** Called after damage is applied. Override for damage feedback. */
  protected onDamaged(_remainingHealth: number): void {}

  /** Called when the obstacle is destroyed. Override for destruction effects. */
  protected onDestroyed(): void {}

  /**
   * Return how much damage each click deals.
   * Override to change click damage (e.g., based on player upgrades).
   */
  protected getClickDamage(): number {
    return 1;
  }
}
