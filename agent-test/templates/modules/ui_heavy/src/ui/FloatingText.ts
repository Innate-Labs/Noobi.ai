/**
 * ============================================================================
 * FLOATING TEXT - Animated popup text (damage numbers, score, etc.)
 * ============================================================================
 *
 * This is a STATIC utility class. It is NOT instantiated with `new`.
 *
 * Creates text that floats upward and fades out. Used for:
 * - Damage numbers ("25 DMG")
 * - Score popups ("+100")
 * - Status effects ("SHIELDED!", "MISS!")
 * - Combo indicators ("x1.5 COMBO!")
 *
 * Auto-destroys after animation completes.
 *
 * CORRECT USAGE:
 *   // From a scene (static method):
 *   FloatingText.show(scene, 400, 300, '-25', { color: '#ff0000' });
 *
 *   // From a BaseBattleScene subclass (inherited helper):
 *   this.showFloatingText('-25', 400, 300, { color: '#ff0000' });
 *
 * !! WRONG - WILL CAUSE RUNTIME ERROR !!
 *   new FloatingText(scene, ...)  // NOT a constructor!
 *   new FloatingText(...)         // NOT a constructor!
 */

import Phaser from 'phaser';

export interface FloatingTextConfig {
  /** Text color (CSS format, default: '#ffffff') */
  color?: string;
  /** Font size (CSS format, default: '24px') */
  fontSize?: string;
  /** Font family (default: 'Arial') */
  fontFamily?: string;
  /** Bold text (default: true) */
  bold?: boolean;
  /** Stroke color (default: '#000000') */
  strokeColor?: string;
  /** Stroke width (default: 4) */
  strokeWidth?: number;
  /** Float distance in pixels (default: 60) */
  floatDistance?: number;
  /** Animation duration in ms (default: 1000) */
  duration?: number;
  /** Start with a scale bounce (default: false) */
  bounce?: boolean;
  /** Horizontal drift (pixels, default: 0) */
  driftX?: number;
}

export class FloatingText {
  /**
   * Create and animate a floating text.
   * Static factory method -- auto-destroys on completion.
   */
  static show(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    config?: FloatingTextConfig,
  ): Phaser.GameObjects.Text {
    const c = config ?? {};
    const textObj = scene.add
      .text(x, y, text, {
        fontSize: c.fontSize ?? '24px',
        fontFamily: c.fontFamily ?? 'Arial',
        color: c.color ?? '#ffffff',
        fontStyle: c.bold !== false ? 'bold' : '',
        stroke: c.strokeColor ?? '#000000',
        strokeThickness: c.strokeWidth ?? 4,
      })
      .setOrigin(0.5)
      .setDepth(999);

    const duration = c.duration ?? 1000;
    const floatDist = c.floatDistance ?? 60;

    // Optional bounce
    if (c.bounce) {
      textObj.setScale(0.5);
      scene.tweens.add({
        targets: textObj,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 100,
        yoyo: true,
        onComplete: () => textObj.setScale(1),
      });
    }

    // Float up + fade out
    scene.tweens.add({
      targets: textObj,
      y: y - floatDist,
      x: x + (c.driftX ?? 0),
      alpha: 0,
      duration: duration,
      ease: 'Cubic.easeOut',
      onComplete: () => textObj.destroy(),
    });

    return textObj;
  }
}
