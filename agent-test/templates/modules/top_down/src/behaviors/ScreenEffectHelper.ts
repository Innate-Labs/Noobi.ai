import Phaser from 'phaser';

/**
 * Screen shake configuration
 */
export interface ShakeConfig {
  /** Duration in milliseconds */
  duration: number;
  /** Intensity (0.001 = subtle, 0.02 = strong) */
  intensity: number;
}

/**
 * Trail effect configuration
 */
export interface TrailConfig {
  /** Image key for trail effect */
  imageKey: string;
  /** Number of trail images */
  count: number;
  /** Delay between each trail image (ms) */
  delay: number;
  /** Initial scale */
  scale: number;
  /** End scale */
  endScale: number;
  /** Tint color (optional) */
  tint?: number;
  /** Initial alpha */
  alpha: number;
  /** Duration of fade out (ms) */
  duration: number;
}

/**
 * Explosion effect configuration
 */
export interface ExplosionConfig {
  /** Image key */
  imageKey: string;
  /** Initial scale */
  scale: number;
  /** End scale */
  endScale: number;
  /** Initial alpha */
  alpha: number;
  /** Duration (ms) */
  duration: number;
  /** Ease function */
  ease?: string;
}

/**
 * ScreenEffectHelper - Static utility class for screen effects
 *
 * Provides reusable methods for common visual effects:
 * - Screen shake
 * - Trail effects (for dash abilities)
 * - Explosion effects
 * - Damage numbers
 *
 * All methods are static and can be called without instantiation.
 *
 * Usage:
 *   ScreenEffectHelper.shake(scene, { duration: 400, intensity: 0.01 });
 *   ScreenEffectHelper.createTrail(scene, player, config);
 *   ScreenEffectHelper.showDamageNumber(scene, x, y, 50);
 */
export class ScreenEffectHelper {
  // ============================================================================
  // SCREEN SHAKE
  // ============================================================================

  /**
   * Apply screen shake effect
   *
   * Common presets:
   * - Light: { duration: 200, intensity: 0.003 }
   * - Medium: { duration: 400, intensity: 0.008 }
   * - Strong: { duration: 500, intensity: 0.015 }
   */
  static shake(scene: Phaser.Scene, config: ShakeConfig): void {
    try {
      scene.cameras.main.shake(config.duration, config.intensity);
    } catch (error) {
      console.warn('ScreenEffectHelper.shake failed:', error);
    }
  }

  /** Light screen shake (for minor impacts) */
  static shakeLight(scene: Phaser.Scene): void {
    ScreenEffectHelper.shake(scene, { duration: 200, intensity: 0.003 });
  }

  /** Medium screen shake (for attacks) */
  static shakeMedium(scene: Phaser.Scene): void {
    ScreenEffectHelper.shake(scene, { duration: 400, intensity: 0.008 });
  }

  /** Strong screen shake (for powerful skills) */
  static shakeStrong(scene: Phaser.Scene): void {
    ScreenEffectHelper.shake(scene, { duration: 500, intensity: 0.015 });
  }

  // ============================================================================
  // TRAIL EFFECTS (for dash abilities)
  // ============================================================================

  /**
   * Create trail effect following an entity
   * Spawns multiple images over time that fade out
   */
  static createTrail(
    scene: Phaser.Scene,
    owner: { x: number; y: number },
    config: TrailConfig,
  ): void {
    for (let i = 0; i < config.count; i++) {
      scene.time.delayedCall(i * config.delay, () => {
        const trail = scene.add.image(owner.x, owner.y, config.imageKey);
        trail.setScale(config.scale);
        trail.setAlpha(config.alpha);
        trail.setOrigin(0.5, 0.5);

        if (config.tint !== undefined) {
          trail.setTint(config.tint);
        }

        scene.tweens.add({
          targets: trail,
          alpha: 0,
          scaleX: config.endScale,
          scaleY: config.endScale,
          duration: config.duration,
          onComplete: () => {
            trail.destroy();
          },
        });
      });
    }
  }

  /**
   * Create dash trail with default settings
   */
  static createDashTrail(
    scene: Phaser.Scene,
    owner: { x: number; y: number },
    imageKey: string,
    tint?: number,
  ): void {
    ScreenEffectHelper.createTrail(scene, owner, {
      imageKey,
      count: 5,
      delay: 60,
      scale: 0.2,
      endScale: 0.4,
      tint,
      alpha: 0.8,
      duration: 300,
    });
  }

  // ============================================================================
  // EXPLOSION EFFECTS
  // ============================================================================

  /**
   * Create explosion effect at a position
   */
  static createExplosion(
    scene: Phaser.Scene,
    x: number,
    y: number,
    config: ExplosionConfig,
  ): Phaser.GameObjects.Image {
    const explosion = scene.add.image(x, y, config.imageKey);
    explosion.setScale(config.scale);
    explosion.setOrigin(0.5, 0.5);
    explosion.setAlpha(config.alpha);

    scene.tweens.add({
      targets: explosion,
      scaleX: config.endScale,
      scaleY: config.endScale,
      alpha: 0,
      duration: config.duration,
      ease: config.ease ?? 'Power2',
      onComplete: () => {
        explosion.destroy();
      },
    });

    return explosion;
  }

  /**
   * Create default explosion effect
   */
  static createDefaultExplosion(
    scene: Phaser.Scene,
    x: number,
    y: number,
    imageKey: string,
  ): Phaser.GameObjects.Image {
    return ScreenEffectHelper.createExplosion(scene, x, y, {
      imageKey,
      scale: 0.5,
      endScale: 1.2,
      alpha: 0.8,
      duration: 600,
    });
  }

  // ============================================================================
  // DAMAGE NUMBER
  // ============================================================================

  /**
   * Show floating damage number
   */
  static showDamageNumber(
    scene: Phaser.Scene,
    x: number,
    y: number,
    damage: number,
    color: string = '#ff3333',
  ): void {
    const offsetX = (Math.random() - 0.5) * 40;
    const offsetY = -40 - Math.random() * 20;

    const damageText = scene.add
      .text(x + offsetX, y + offsetY, `-${damage}`, {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: color,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5);

    scene.tweens.add({
      targets: damageText,
      y: damageText.y - 60,
      x: damageText.x + (Math.random() - 0.5) * 30,
      scaleX: 1.3,
      scaleY: 1.3,
      alpha: 0,
      duration: 1000,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        damageText.destroy();
      },
    });
  }
}
