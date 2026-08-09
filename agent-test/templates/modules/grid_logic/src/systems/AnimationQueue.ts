import Phaser from 'phaser';

// ============================================================================
// ANIMATION QUEUE - Sequential/parallel animation system for grid games
// ============================================================================
// Grid games need precise control over animation ordering:
// 1. Move entity A from (0,0) to (1,0)  [wait]
// 2. Push entity B from (2,0) to (3,0)  [wait]
// 3. Destroy entity B + show particles  [parallel, then wait]
// 4. Gravity: drop entities C,D,E       [parallel, then wait]
//
// The AnimationQueue handles this by queuing animation steps that can be
// sequential (one after another) or parallel (simultaneous within a group).
// ============================================================================

export type AnimationCallback = () => Promise<void>;

interface AnimationStep {
  type: 'sequential' | 'parallel';
  animations: AnimationCallback[];
}

export class AnimationQueue extends Phaser.Events.EventEmitter {
  private _scene: Phaser.Scene;
  private _queue: AnimationStep[] = [];
  private _isPlaying: boolean = false;

  constructor(scene: Phaser.Scene) {
    super();
    this._scene = scene;
  }

  // --------------------------------------------------------------------------
  // Properties
  // --------------------------------------------------------------------------

  get isPlaying(): boolean {
    return this._isPlaying;
  }
  get isEmpty(): boolean {
    return this._queue.length === 0;
  }
  get length(): number {
    return this._queue.length;
  }

  // --------------------------------------------------------------------------
  // Queue Management
  // --------------------------------------------------------------------------

  /**
   * Add a single animation step to the queue (plays after previous steps finish).
   */
  enqueue(animation: AnimationCallback): void {
    this._queue.push({ type: 'sequential', animations: [animation] });
  }

  /**
   * Add multiple animations that play simultaneously, then wait for all to finish.
   */
  enqueueParallel(animations: AnimationCallback[]): void {
    if (animations.length === 0) return;
    this._queue.push({ type: 'parallel', animations });
  }

  /**
   * Clear all queued animations (does not stop currently playing animation).
   */
  clear(): void {
    this._queue.length = 0;
  }

  // --------------------------------------------------------------------------
  // Playback
  // --------------------------------------------------------------------------

  /**
   * Play all queued animations in order.
   * Returns a Promise that resolves when ALL animations are done.
   * Emits 'started' and 'completed' events.
   */
  async play(): Promise<void> {
    if (this._isPlaying || this._queue.length === 0) return;

    this._isPlaying = true;
    this.emit('started');

    while (this._queue.length > 0) {
      const step = this._queue.shift()!;

      if (step.type === 'parallel') {
        await Promise.all(step.animations.map((fn) => fn()));
      } else {
        for (const fn of step.animations) {
          await fn();
        }
      }
    }

    this._isPlaying = false;
    this.emit('completed');
  }

  // --------------------------------------------------------------------------
  // Animation Factories (convenience methods)
  // --------------------------------------------------------------------------

  /**
   * Create an animation callback that moves a game object to a world position.
   */
  static move(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject & { x: number; y: number },
    toX: number,
    toY: number,
    duration: number = 200,
    ease: string = 'Power2',
  ): AnimationCallback {
    return () =>
      new Promise<void>((resolve) => {
        if (!target.active) {
          resolve();
          return;
        }
        scene.tweens.add({
          targets: target,
          x: toX,
          y: toY,
          duration,
          ease,
          onComplete: () => resolve(),
        });
      });
  }

  /**
   * Create an animation callback that moves a game object along a path of world positions.
   */
  static movePath(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject & { x: number; y: number },
    path: { x: number; y: number }[],
    stepDuration: number = 150,
    ease: string = 'Power2',
  ): AnimationCallback {
    return async () => {
      for (const point of path) {
        if (!target.active) return;
        await new Promise<void>((resolve) => {
          scene.tweens.add({
            targets: target,
            x: point.x,
            y: point.y,
            duration: stepDuration,
            ease,
            onComplete: () => resolve(),
          });
        });
      }
    };
  }

  /**
   * Create an animation callback that fades a game object.
   */
  static fade(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject & { alpha: number },
    toAlpha: number,
    duration: number = 300,
    ease: string = 'Linear',
  ): AnimationCallback {
    return () =>
      new Promise<void>((resolve) => {
        if (!target.active) {
          resolve();
          return;
        }
        scene.tweens.add({
          targets: target,
          alpha: toAlpha,
          duration,
          ease,
          onComplete: () => resolve(),
        });
      });
  }

  /**
   * Create an animation callback that scales a game object.
   */
  static scale(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject & { scaleX: number; scaleY: number },
    toScale: number,
    duration: number = 200,
    ease: string = 'Back.easeOut',
  ): AnimationCallback {
    return () =>
      new Promise<void>((resolve) => {
        if (!target.active) {
          resolve();
          return;
        }
        scene.tweens.add({
          targets: target,
          scaleX: toScale,
          scaleY: toScale,
          duration,
          ease,
          onComplete: () => resolve(),
        });
      });
  }

  /**
   * Create an animation callback that destroys a game object with a shrink+fade effect.
   */
  static destroy(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject & {
      alpha: number;
      scaleX: number;
      scaleY: number;
    },
    duration: number = 300,
  ): AnimationCallback {
    return () =>
      new Promise<void>((resolve) => {
        if (!target.active) {
          resolve();
          return;
        }
        scene.tweens.add({
          targets: target,
          alpha: 0,
          scaleX: 0,
          scaleY: 0,
          duration,
          ease: 'Back.easeIn',
          onComplete: () => {
            target.destroy();
            resolve();
          },
        });
      });
  }

  /**
   * Create an animation callback that shakes a game object.
   */
  static shake(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject & { x: number; y: number },
    intensity: number = 4,
    duration: number = 200,
  ): AnimationCallback {
    return () =>
      new Promise<void>((resolve) => {
        if (!target.active) {
          resolve();
          return;
        }
        const origX = target.x;
        const origY = target.y;
        const steps = Math.ceil(duration / 40);
        let step = 0;

        scene.time.addEvent({
          delay: 40,
          repeat: steps - 1,
          callback: () => {
            step++;
            if (!target.active || step >= steps) {
              if (target.active) {
                target.x = origX;
                target.y = origY;
              }
              resolve();
            } else {
              target.x = origX + (Math.random() - 0.5) * intensity * 2;
              target.y = origY + (Math.random() - 0.5) * intensity * 2;
            }
          },
        });
      });
  }

  /**
   * Create an animation callback that waits for a duration.
   */
  static delay(scene: Phaser.Scene, duration: number): AnimationCallback {
    return () =>
      new Promise<void>((resolve) => {
        scene.time.delayedCall(duration, resolve);
      });
  }

  /**
   * Create an animation callback that plays a pop-in effect (scale from 0 to target).
   */
  static popIn(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject & { scaleX: number; scaleY: number },
    targetScale: number = 1,
    duration: number = 300,
  ): AnimationCallback {
    return () =>
      new Promise<void>((resolve) => {
        if (!target.active) {
          resolve();
          return;
        }
        const sx = target.scaleX;
        const sy = target.scaleY;
        (target as any).setScale(0);
        scene.tweens.add({
          targets: target,
          scaleX: targetScale * (sx / Math.abs(sx || 1)),
          scaleY: targetScale * (sy / Math.abs(sy || 1)),
          duration,
          ease: 'Back.easeOut',
          onComplete: () => resolve(),
        });
      });
  }

  /**
   * Create an animation callback that bounces a game object (scale yoyo).
   */
  static bounce(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject & { scaleX: number; scaleY: number },
    bounceScale: number = 1.2,
    duration: number = 200,
  ): AnimationCallback {
    return () =>
      new Promise<void>((resolve) => {
        if (!target.active) {
          resolve();
          return;
        }
        const origSX = target.scaleX;
        const origSY = target.scaleY;
        scene.tweens.add({
          targets: target,
          scaleX: origSX * bounceScale,
          scaleY: origSY * bounceScale,
          duration: duration / 2,
          yoyo: true,
          ease: 'Quad.easeOut',
          onComplete: () => resolve(),
        });
      });
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  destroy(): void {
    this.clear();
    this.removeAllListeners();
    super.destroy();
  }
}
