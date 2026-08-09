import Phaser from 'phaser';
import { BaseTDEnemy } from './BaseTDEnemy';
import type { TDEnemyConfig } from './BaseTDEnemy';
import * as CONFIG from '../gameConfig.json';

// ============================================================================
// _TEMPLATE TD ENEMY — Copy this file to create a new enemy type
// ============================================================================
// Operation: COPY
//
// Steps:
// 1. Copy this file → rename to your enemy class (e.g., Goblin.ts)
// 2. Rename the class
// 3. Update the config object with your enemy's stats
// 4. Override hooks as needed for custom behavior
// 5. Export from enemies/index.ts
// ============================================================================

// TODO-CONFIG: Define enemy config using GDD values
const ENEMY_CONFIG: TDEnemyConfig = {
  textureKey: 'enemy_basic', // TODO-ASSET: Match asset key from Preloader
  displayHeight: 48, // TODO-GDD: Adjust based on GDD art direction
  stats: {
    maxHealth: 100, // TODO-GDD: From GDD enemy stats
    speed: 80, // TODO-GDD: Pixels per second
    reward: 10, // TODO-GDD: Gold reward on kill
    damage: 1, // TODO-GDD: Lives lost if reaches exit
  },
};

export class _TemplateTDEnemy extends BaseTDEnemy {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ENEMY_CONFIG);
  }

  // ===================== HOOK OVERRIDES =====================

  // --- onSpawn: Called when enemy is placed on the path ---
  // protected onSpawn(): void {
  //   // Example: spawn flash effect
  //   this.setAlpha(0);
  //   this.scene.tweens.add({
  //     targets: this,
  //     alpha: 1,
  //     duration: 300,
  //   });
  // }

  // --- onDamageTaken: Called when enemy takes damage ---
  // protected onDamageTaken(damage: number): void {
  //   // Example: damage flash
  //   this.setTint(0xff0000);
  //   this.scene.time.delayedCall(100, () => {
  //     this.clearTint();
  //   });
  // }

  // --- onDeath: Called when enemy health reaches 0 ---
  // protected onDeath(): void {
  //   // Example: death particle effect
  //   // const particles = this.scene.add.particles(this.x, this.y, 'particle', {
  //   //   speed: 100, lifespan: 300, quantity: 10,
  //   // });
  //   // this.scene.time.delayedCall(500, () => particles.destroy());
  // }

  // --- onReachEnd: Called when enemy reaches the exit ---
  // protected onReachEnd(): void {
  //   // Example: fade out effect
  // }

  // --- onStatusEffectApplied: Called when a status effect is applied ---
  // protected onStatusEffectApplied(effectId: string): void {
  //   // Example: play slow sound
  //   // if (effectId === 'slow') {
  //   //   safeAddSound(this.scene, 'sfx_slow')?.play();
  //   // }
  // }

  // --- onStatusEffectRemoved: Called when a status effect expires ---
  // protected onStatusEffectRemoved(effectId: string): void {
  //   // Example: visual feedback when slow wears off
  // }

  // --- getAnimationKey: Return directional animation key ---
  // protected getAnimationKey(direction: 'left' | 'right' | 'up' | 'down'): string | null {
  //   // Example: directional walk animation
  //   // return `enemy_basic_walk_${direction}`;
  //   return null;
  // }
}
