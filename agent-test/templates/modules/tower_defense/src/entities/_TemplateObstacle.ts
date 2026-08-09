import Phaser from 'phaser';
import { BaseObstacle } from './BaseObstacle';
import type { ObstacleConfig } from './BaseObstacle';
import * as CONFIG from '../gameConfig.json';

// ============================================================================
// _TEMPLATE OBSTACLE — Copy this file to create a new obstacle type
// ============================================================================
// Operation: COPY
//
// Steps:
// 1. Copy this file -> rename to your obstacle class (e.g., TreeObstacle.ts)
// 2. Rename the class
// 3. Update OBSTACLE_CONFIG with your obstacle's stats from the GDD
// 4. Override hooks as needed for custom behavior
// 5. Place obstacles in your level scene's onPostCreate() hook
// ============================================================================

// TODO-CONFIG: Define obstacle config using GDD values
const OBSTACLE_CONFIG: ObstacleConfig = {
  textureKey: 'obstacle_tree', // TODO-ASSET: Match asset key from Preloader
  displayHeight: 56, // TODO-GDD: Adjust based on GDD art direction
  maxHealth: 5, // TODO-GDD: Clicks needed to destroy
  reward: 15, // TODO-GDD: Gold reward on destruction
};

export class _TemplateObstacle extends BaseObstacle {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, OBSTACLE_CONFIG);
  }

  // ===================== HOOK OVERRIDES =====================

  // --- onClicked: Called when obstacle is clicked ---
  // protected onClicked(): void {
  //   // Example: play click sound
  //   // safeAddSound(this.scene, 'sfx_hit')?.play();
  // }

  // --- onDamaged: Called after damage is applied ---
  // protected onDamaged(remainingHealth: number): void {
  //   // Example: change appearance as health decreases
  //   // if (remainingHealth <= 2) {
  //   //   this.setAlpha(0.6);
  //   // }
  // }

  // --- onDestroyed: Called when obstacle is destroyed ---
  // protected onDestroyed(): void {
  //   // Example: particle burst
  //   // Example: play destruction sound
  //   // safeAddSound(this.scene, 'sfx_break')?.play();
  // }

  // --- getClickDamage: Override to change damage per click ---
  // protected getClickDamage(): number {
  //   return 1;
  // }
}
