import { BaseEntity } from './BaseEntity';

/**
 * _TemplateEntity — COPY this file to create a new entity type.
 *
 * Usage:
 *   1. Copy this file and rename it (e.g., Player.ts, Enemy.ts)
 *   2. Rename the class
 *   3. Add physics body, behaviors, and game-specific logic
 *   4. Override hooks as needed
 */
export class _TemplateEntity extends BaseEntity {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'placeholder_texture'); // <-- set your texture key
  }

  protected override onUpdate(_time: number, _delta: number): void {
    // TODO: per-frame logic
  }

  protected override onDamageTaken(_damage: number): void {
    // TODO: damage reaction
  }

  protected override onDeath(): void {
    super.onDeath();
    // TODO: death effects
  }
}
