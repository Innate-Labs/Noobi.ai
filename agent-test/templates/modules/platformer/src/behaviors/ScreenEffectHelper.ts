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
 * Vortex effect configuration
 */
export interface VortexConfig {
  /** Image key */
  imageKey: string;
  /** Initial scale */
  initialScale: number;
  /** Max scale */
  maxScale: number;
  /** Total rotation (in radians) */
  rotation: number;
  /** Grow duration (ms) */
  growDuration: number;
  /** Sustain duration (ms) */
  sustainDuration: number;
  /** Fade duration (ms) */
  fadeDuration: number;
}

/**
 * ScreenEffectHelper - Static utility class for screen effects
 *
 * Provides reusable methods for common visual effects:
 * - Screen shake
 * - Trail effects (for dash attacks)
 * - Explosion effects
 * - Vortex effects (for targeted abilities)
 *
 * All methods are static and can be called without instantiation.
 *
 * Usage:
 *   ScreenEffectHelper.shake(scene, { duration: 400, intensity: 0.01 });
 *   ScreenEffectHelper.createTrail(scene, x, y, config);
 */
export class ScreenEffectHelper {
  // ============================================================================
  // SCREEN SHAKE
  // ============================================================================

  /**
   * Apply screen shake effect
   *
   * @param scene - The scene
   * @param config - Shake configuration
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

  /**
   * Light screen shake (for minor impacts)
   */
  static shakeLight(scene: Phaser.Scene): void {
    ScreenEffectHelper.shake(scene, { duration: 200, intensity: 0.003 });
  }

  /**
   * Medium screen shake (for attacks)
   */
  static shakeMedium(scene: Phaser.Scene): void {
    ScreenEffectHelper.shake(scene, { duration: 400, intensity: 0.008 });
  }

  /**
   * Strong screen shake (for powerful skills)
   */
  static shakeStrong(scene: Phaser.Scene): void {
    ScreenEffectHelper.shake(scene, { duration: 500, intensity: 0.015 });
  }

  // ============================================================================
  // TRAIL EFFECTS (for dash attacks)
  // ============================================================================

  /**
   * Create trail effect at a position
   * Spawns multiple images over time that fade out
   *
   * @param scene - The scene
   * @param owner - The entity creating the trail (for position tracking)
   * @param config - Trail configuration
   *
   * @example
   *   // Blue lightning trail
   *   ScreenEffectHelper.createTrail(scene, player, {
   *     imageKey: 'lightning_effect',
   *     count: 5,
   *     delay: 80,
   *     scale: 0.2,
   *     endScale: 0.4,
   *     tint: 0x00ffff,
   *     alpha: 0.8,
   *     duration: 300,
   *   });
   */
  static createTrail(
    scene: Phaser.Scene,
    owner: { x: number; y: number },
    config: TrailConfig,
  ): void {
    for (let i = 0; i < config.count; i++) {
      scene.time.delayedCall(i * config.delay, () => {
        // Create trail image at current owner position
        const trail = scene.add.image(
          owner.x,
          owner.y - 30, // Slightly above ground
          config.imageKey,
        );

        trail.setScale(config.scale);
        trail.setAlpha(config.alpha);
        trail.setOrigin(0.5, 0.5);

        if (config.tint !== undefined) {
          trail.setTint(config.tint);
        }

        // Fade out and scale up
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
      delay: 80,
      scale: 0.2,
      endScale: 0.4,
      tint,
      alpha: 0.8,
      duration: 300,
    });
  }

  // ============================================================================
  // EXPLOSION EFFECTS (for AOE attacks)
  // ============================================================================

  /**
   * Create explosion effect at a position
   *
   * @param scene - The scene
   * @param x - X position
   * @param y - Y position
   * @param config - Explosion configuration
   * @returns The explosion image (already animated, will auto-destroy)
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
  // VORTEX EFFECTS (for targeted abilities)
  // ============================================================================

  /**
   * Create vortex effect at a position
   * Used for targeted execution abilities
   *
   * @param scene - The scene
   * @param x - X position
   * @param y - Y position
   * @param config - Vortex configuration
   * @param onComplete - Callback when effect completes
   * @returns The vortex image
   */
  static createVortex(
    scene: Phaser.Scene,
    x: number,
    y: number,
    config: VortexConfig,
    onComplete?: () => void,
  ): Phaser.GameObjects.Image {
    const vortex = scene.add.image(x, y, config.imageKey);
    vortex.setScale(config.initialScale);
    vortex.setOrigin(0.5, 0.5);

    // Phase 1: Grow and rotate
    scene.tweens.add({
      targets: vortex,
      scaleX: config.maxScale,
      scaleY: config.maxScale,
      rotation: config.rotation * 0.4,
      duration: config.growDuration,
      ease: 'Power2.easeOut',
    });

    // Phase 2: Continue rotating (sustain)
    scene.tweens.add({
      targets: vortex,
      rotation: config.rotation * 0.8,
      duration: config.sustainDuration,
      delay: config.growDuration,
      ease: 'Linear',
    });

    // Phase 3: Shrink and fade out
    scene.tweens.add({
      targets: vortex,
      scaleX: config.initialScale * 0.3,
      scaleY: config.initialScale * 0.3,
      alpha: 0,
      rotation: config.rotation,
      duration: config.fadeDuration,
      delay: config.growDuration + config.sustainDuration,
      ease: 'Power2.easeIn',
      onComplete: () => {
        vortex.destroy();
        onComplete?.();
      },
    });

    return vortex;
  }

  /**
   * Create default vortex effect
   */
  static createDefaultVortex(
    scene: Phaser.Scene,
    x: number,
    y: number,
    imageKey: string,
    onComplete?: () => void,
  ): Phaser.GameObjects.Image {
    return ScreenEffectHelper.createVortex(
      scene,
      x,
      y,
      {
        imageKey,
        initialScale: 0.3,
        maxScale: 0.6,
        rotation: Math.PI * 16,
        growDuration: 1000,
        sustainDuration: 1000,
        fadeDuration: 500,
      },
      onComplete,
    );
  }

  // ============================================================================
  // CHARGE EFFECT (spinning effect while charging)
  // ============================================================================

  /**
   * Create charging effect that spins while active
   * Used for AOE charge-up effects
   *
   * @param scene - The scene
   * @param x - X position
   * @param y - Y position
   * @param imageKey - Effect image key
   * @param duration - How long to spin (ms)
   * @returns The charge effect image
   */
  static createChargeEffect(
    scene: Phaser.Scene,
    x: number,
    y: number,
    imageKey: string,
    duration: number = 500,
  ): Phaser.GameObjects.Image {
    const charge = scene.add.image(x, y, imageKey);
    charge.setScale(0.3);
    charge.setOrigin(0.5, 0.5);

    // Spin animation
    scene.tweens.add({
      targets: charge,
      rotation: Math.PI * 4,
      duration: duration,
    });

    return charge;
  }

  // ============================================================================
  // DAMAGE NUMBER
  // ============================================================================

  /**
   * Show floating damage number
   *
   * @param scene - The scene
   * @param x - X position
   * @param y - Y position
   * @param damage - Damage amount
   * @param color - Text color (default: '#ff3333')
   */
  static showDamageNumber(
    scene: Phaser.Scene,
    x: number,
    y: number,
    damage: number,
    color: string = '#ff3333',
  ): void {
    const offsetX = 40 + Math.random() * 20;
    const offsetY = -60 - Math.random() * 20;

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
      y: damageText.y - 80,
      x: damageText.x + (Math.random() - 0.5) * 40,
      scaleX: 1.4,
      scaleY: 1.4,
      alpha: 0,
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        damageText.destroy();
      },
    });
  }
}
