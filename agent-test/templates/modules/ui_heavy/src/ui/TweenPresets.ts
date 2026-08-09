/**
 * ============================================================================
 * TWEEN PRESETS - Common UI animations for UI-heavy games
 * ============================================================================
 *
 * Utility functions for common UI animations. These are ADDITIONAL helpers
 * that supplement core/utils.ts (which is NOT overwritten by this module).
 *
 * This file exports INDIVIDUAL FUNCTIONS, not a class or object.
 *
 * CORRECT IMPORT:
 *   import { fadeIn, shake, popIn } from '../ui/TweenPresets';
 *   fadeIn(this, myImage, 300);
 *   shake(this, enemy, 5, 200);
 *
 * ALSO VALID (namespace import):
 *   import * as TweenPresets from '../ui/TweenPresets';
 *   TweenPresets.fadeIn(this, myImage, 300);
 *
 * !! WRONG - WILL CAUSE RUNTIME ERROR !!
 *   import { TweenPresets } from '../ui/TweenPresets';  // <-- NO SUCH EXPORT
 *   new TweenPresets(...)                               // <-- NOT A CLASS
 * ============================================================================
 */

import Phaser from 'phaser';

/** Fade in a game object. */
export const fadeIn = (
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  duration: number = 300,
  onComplete?: () => void,
): Phaser.Tweens.Tween => {
  (target as any).alpha = 0;
  return scene.tweens.add({
    targets: target,
    alpha: 1,
    duration,
    onComplete,
  });
};

/** Fade out a game object. */
export const fadeOut = (
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  duration: number = 300,
  onComplete?: () => void,
): Phaser.Tweens.Tween => {
  return scene.tweens.add({
    targets: target,
    alpha: 0,
    duration,
    onComplete,
  });
};

/** Slide a game object to a position. */
export const slideTo = (
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  toX: number,
  toY: number,
  duration: number = 400,
  ease: string = 'Cubic.easeOut',
  onComplete?: () => void,
): Phaser.Tweens.Tween => {
  return scene.tweens.add({
    targets: target,
    x: toX,
    y: toY,
    duration,
    ease,
    onComplete,
  });
};

/** Scale bounce effect (pop in). */
export const popIn = (
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  duration: number = 200,
  onComplete?: () => void,
): Phaser.Tweens.Tween => {
  (target as any).setScale(0);
  return scene.tweens.add({
    targets: target,
    scaleX: 1,
    scaleY: 1,
    duration,
    ease: 'Back.easeOut',
    onComplete,
  });
};

/** Shake effect (for damage feedback, errors). */
export const shake = (
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  intensity: number = 5,
  duration: number = 200,
  onComplete?: () => void,
): void => {
  const originalX = (target as any).x;
  scene.tweens.add({
    targets: target,
    x: originalX + intensity,
    duration: duration / 8,
    yoyo: true,
    repeat: 3,
    onComplete: () => {
      (target as any).x = originalX;
      onComplete?.();
    },
  });
};

/** Pulse/breathe effect (infinite loop). */
export const pulse = (
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  minScale: number = 0.95,
  maxScale: number = 1.05,
  duration: number = 600,
): Phaser.Tweens.Tween => {
  // Set initial scale to minScale so the tween oscillates between min and max
  (target as any).setScale(minScale);
  return scene.tweens.add({
    targets: target,
    scaleX: { from: minScale, to: maxScale },
    scaleY: { from: minScale, to: maxScale },
    duration: duration / 2,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
};

/** Get screen center coordinates. */
export const getScreenCenter = (
  scene: Phaser.Scene,
): { x: number; y: number } => {
  return {
    x: scene.cameras.main.width / 2,
    y: scene.cameras.main.height / 2,
  };
};

/** Distribute items evenly across a horizontal line. Returns x positions. */
export const distributeHorizontally = (
  count: number,
  totalWidth: number,
  padding: number = 0,
): number[] => {
  if (count <= 0) return [];
  if (count === 1) return [totalWidth / 2];
  const usableWidth = totalWidth - 2 * padding;
  const spacing = usableWidth / (count - 1);
  return Array.from({ length: count }, (_, i) => padding + i * spacing);
};
