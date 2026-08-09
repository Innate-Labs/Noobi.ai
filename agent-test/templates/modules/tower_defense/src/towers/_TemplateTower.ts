import Phaser from 'phaser';
import { BaseTower } from './BaseTower';
import type { TowerTypeConfig } from './BaseTower';
import type { BaseTDEnemy } from '../enemies/BaseTDEnemy';
import { createProjectile, safeAddSound } from '../utils';
import * as CONFIG from '../gameConfig.json';

// ============================================================================
// _TEMPLATE TOWER — Copy this file to create a new tower type
// ============================================================================
// Operation: COPY
//
// Steps:
// 1. Copy this file → rename to your tower class (e.g., ArrowTower.ts)
// 2. Rename the class
// 3. Update TOWER_CONFIG with your tower's stats from the GDD
// 4. Override hooks as needed for custom behavior
// 5. Export from towers/index.ts
// 6. Register in the level's getTowerTypes() method
// ============================================================================

// TODO-CONFIG: Define tower config using GDD values
export const TEMPLATE_TOWER_CONFIG: TowerTypeConfig = {
  id: 'basic_tower', // TODO-GDD: Unique tower type ID
  name: 'Basic Tower', // TODO-GDD: Display name
  textureKey: 'tower_basic', // TODO-ASSET: Match asset key from Preloader
  cost: 50, // TODO-GDD: Gold cost
  damage: 10, // TODO-GDD: Damage per hit
  range: 150, // TODO-GDD: Range in pixels
  fireRate: 1.0, // TODO-GDD: Shots per second
  projectileKey: 'tower_bullet', // TODO-ASSET: Projectile asset key (custom image or 'tower_bullet')
  projectileSpeed: 300, // TODO-GDD: Projectile speed pixels/sec
  homing: false, // TODO-GDD: Set true for homing/tracking projectiles
  targetingMode: 'first', // 'first' | 'last' | 'closest' | 'strongest'
  upgrades: [
    // TODO-GDD: Define upgrade levels from GDD
    { level: 2, cost: 40, damage: 18, range: 160, fireRate: 1.2 },
    { level: 3, cost: 80, damage: 30, range: 180, fireRate: 1.5 },
  ],
};

export class _TemplateTower extends BaseTower {
  // ===================== HOOK OVERRIDES =====================
  // --- onFire: Called when tower fires at a target ---
  // protected onFire(target: BaseTDEnemy): void {
  //   // Example: play fire sound
  //   // const fireSound = safeAddSound(this.scene, 'tower_fire_sfx');
  //   // fireSound?.play();
  //
  //   // Example: muzzle flash tween
  //   // this.scene.tweens.add({
  //   //   targets: this,
  //   //   scaleX: 1.1, scaleY: 1.1,
  //   //   duration: 50,
  //   //   yoyo: true,
  //   // });
  // }
  // --- onUpgrade: Called when tower is upgraded ---
  // protected onUpgrade(newLevel: number): void {
  //   // Example: change texture for upgraded tower
  //   // this.setTexture(`tower_basic_lv${newLevel}`);
  //
  //   // Example: upgrade flash
  //   // this.scene.tweens.add({
  //   //   targets: this,
  //   //   scaleX: 1.3, scaleY: 1.3,
  //   //   duration: 200,
  //   //   yoyo: true,
  //   // });
  // }
  // --- createProjectile: Customize projectile creation ---
  // protected createProjectile(target: BaseTDEnemy): Phaser.Physics.Arcade.Sprite | null {
  //   // Example A: splash damage projectile (AOE tower)
  //   // const proj = createProjectile(this.scene, this.x, this.y, this.projectileKey, 16, this.currentDamage);
  //   // (proj as any).splashRadius = 60;
  //   // return proj;
  //
  //   // Example B: slow projectile (utility tower)
  //   // const proj = createProjectile(this.scene, this.x, this.y, this.projectileKey, 10, this.currentDamage);
  //   // (proj as any).slowAmount = 0.5;    // 50% speed
  //   // (proj as any).slowDuration = 2000; // 2 seconds
  //   // return proj;
  //
  //   // NOTE: Homing is handled automatically by BaseTower.fire() when
  //   //       config.homing = true — no need to override createProjectile.
  //   //       Custom projectile images auto-scale to PROJECTILE_SIZES.ARROW (20px).
  //   //       Falls back to 'tower_bullet' if textureKey doesn't exist.
  //
  //   // Default behavior (calls base):
  //   return super.createProjectile(target);
  // }
  // --- getUpgradeStats: Custom upgrade path ---
  // protected getUpgradeStats(): TowerUpgrade | null {
  //   // Override for non-standard upgrade logic
  //   return super.getUpgradeStats();
  // }
  // --- getRangeCircleColor: Type-specific hover range color ---
  // protected getRangeCircleColor(): number {
  //   // Example: blue for ice tower, red for cannon
  //   // return 0x4488ff;
  //   return super.getRangeCircleColor();
  // }
  // --- playFireAnimation: Custom fire animation ---
  // protected playFireAnimation(): void {
  //   // Example: heavier recoil for cannon tower
  //   // this.scene.tweens.add({
  //   //   targets: this,
  //   //   scaleX: this.scaleX * 1.25,
  //   //   scaleY: this.scaleY * 0.85,
  //   //   duration: 100,
  //   //   yoyo: true,
  //   //   ease: 'Back.easeOut',
  //   // });
  //   super.playFireAnimation();
  // }
}
