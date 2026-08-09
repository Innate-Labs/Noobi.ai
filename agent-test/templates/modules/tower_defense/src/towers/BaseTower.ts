import Phaser from 'phaser';
import {
  initScale,
  createProjectile,
  launchProjectileAt,
  createBulletTextures,
  createRangeIndicator,
  PROJECTILE_SIZES,
} from '../utils';
import type { BaseTDEnemy } from '../enemies/BaseTDEnemy';

// ============================================================================
// BASE TOWER -- Static tower with targeting, firing, and upgrade hooks
// ============================================================================
// Placed on the grid. Finds enemies in range, fires projectiles at them.
// Supports upgrade levels, different targeting modes, and hover range display.
//
// HOOKS:
//   onFire(target)               -- fire sound/animation
//   onUpgrade(newLevel)          -- visual upgrade effect
//   createProjectile(target)     -- customize projectile
//   getUpgradeStats()            -- return next level stats (null = max)
//   playFireAnimation()          -- customize fire animation (default: scale pulse)
//   getRangeCircleColor()        -- type-specific hover range color
//
// BUILT-IN:
//   - Target prediction (lead shots) in fire()
//   - Hover range circle display
//   - Fire animation (scale pulse)
// ============================================================================

export type TargetingMode = 'first' | 'last' | 'closest' | 'strongest';

export interface TowerUpgrade {
  level: number;
  cost: number;
  damage: number;
  range: number;
  fireRate: number;
}

export interface TowerTypeConfig {
  id: string;
  name: string;
  textureKey: string;
  cost: number;
  damage: number;
  /** range in pixels */
  range: number;
  /** shots per second */
  fireRate: number;
  projectileKey?: string;
  projectileSpeed?: number;
  /** when true, projectile tracks target each frame (homing) */
  homing?: boolean;
  upgrades?: TowerUpgrade[];
  targetingMode?: TargetingMode;
}

export class BaseTower extends Phaser.GameObjects.Image {
  protected towerConfig: TowerTypeConfig;

  protected currentLevel: number = 1;
  protected currentDamage: number;
  protected currentRange: number;
  protected currentFireRate: number;
  protected projectileKey: string;
  protected projectileSpeed: number;
  protected targetingMode: TargetingMode;

  protected fireTimer: number = 0;
  protected totalInvested: number;

  /** Grid coordinates where this tower is placed */
  public gridX: number;
  public gridY: number;

  protected projectilesGroup!: Phaser.Physics.Arcade.Group;
  protected enemiesGroup!: Phaser.Physics.Arcade.Group;

  private rangeCircle: Phaser.GameObjects.Graphics | null = null;

  constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    gridX: number,
    gridY: number,
    config: TowerTypeConfig,
    projectilesGroup: Phaser.Physics.Arcade.Group,
    enemiesGroup: Phaser.Physics.Arcade.Group,
  ) {
    super(scene, worldX, worldY, config.textureKey);
    this.towerConfig = config;
    this.gridX = gridX;
    this.gridY = gridY;

    this.currentDamage = config.damage;
    this.currentRange = config.range;
    this.currentFireRate = config.fireRate;
    this.projectileKey = config.projectileKey ?? 'tower_bullet';
    this.projectileSpeed = config.projectileSpeed ?? 300;
    this.targetingMode = config.targetingMode ?? 'first';
    this.totalInvested = config.cost;

    this.projectilesGroup = projectilesGroup;
    this.enemiesGroup = enemiesGroup;

    scene.add.existing(this);
    initScale(this, { x: 0.5, y: 0.5 }, undefined, 72, 0.8, 0.8);

    createBulletTextures(scene);

    this.setInteractive();
    this.on('pointerover', this.showRangeCircle, this);
    this.on('pointerout', this.hideRangeCircle, this);
  }

  get level(): number {
    return this.currentLevel;
  }

  get invested(): number {
    return this.totalInvested;
  }

  get range(): number {
    return this.currentRange;
  }

  get typeId(): string {
    return this.towerConfig.id;
  }

  get typeName(): string {
    return this.towerConfig.name;
  }

  // ===================== UPDATE LOOP =====================

  update(time: number, delta: number): void {
    this.fireTimer += delta;
    const fireInterval = 1000 / this.currentFireRate;

    if (this.fireTimer >= fireInterval) {
      const target = this.findTarget();
      if (target) {
        this.fire(target);
        this.fireTimer = 0;
      }
    }
  }

  // ===================== TARGETING =====================

  protected findTarget(): BaseTDEnemy | null {
    const enemies = this.enemiesGroup.getChildren() as BaseTDEnemy[];
    const inRange: BaseTDEnemy[] = [];

    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dist = Phaser.Math.Distance.Between(
        this.x,
        this.y,
        enemy.x,
        enemy.y,
      );
      if (dist <= this.currentRange) {
        inRange.push(enemy);
      }
    }

    if (inRange.length === 0) return null;

    switch (this.targetingMode) {
      case 'first':
        return this.getFirstEnemy(inRange);
      case 'last':
        return this.getLastEnemy(inRange);
      case 'closest':
        return this.getClosestEnemy(inRange);
      case 'strongest':
        return this.getStrongestEnemy(inRange);
      default:
        return inRange[0];
    }
  }

  /** "First" = furthest along the path (highest pathProgress) */
  private getFirstEnemy(enemies: BaseTDEnemy[]): BaseTDEnemy {
    return enemies.reduce((best, e) =>
      e.pathProgress > best.pathProgress ? e : best,
    );
  }

  private getLastEnemy(enemies: BaseTDEnemy[]): BaseTDEnemy {
    return enemies.reduce((best, e) =>
      e.pathProgress < best.pathProgress ? e : best,
    );
  }

  private getClosestEnemy(enemies: BaseTDEnemy[]): BaseTDEnemy {
    return enemies.reduce((best, e) => {
      const distE = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
      const distBest = Phaser.Math.Distance.Between(
        this.x,
        this.y,
        best.x,
        best.y,
      );
      return distE < distBest ? e : best;
    });
  }

  private getStrongestEnemy(enemies: BaseTDEnemy[]): BaseTDEnemy {
    return enemies.reduce((best, e) => (e.health > best.health ? e : best));
  }

  // ===================== FIRING =====================

  protected fire(target: BaseTDEnemy): void {
    const projectile = this.createProjectile(target);
    if (projectile) {
      this.projectilesGroup.add(projectile);

      if (this.towerConfig.homing) {
        (projectile as any).homingTarget = target;
        (projectile as any).homingSpeed = this.projectileSpeed;
      }

      const body = target.body as Phaser.Physics.Arcade.Body | undefined;
      let aimX = target.x;
      let aimY = target.y;
      if (body && this.projectileSpeed > 0 && !this.towerConfig.homing) {
        const dist = Phaser.Math.Distance.Between(
          this.x,
          this.y,
          target.x,
          target.y,
        );
        const flightTime = dist / this.projectileSpeed;
        aimX += body.velocity.x * flightTime * 0.5;
        aimY += body.velocity.y * flightTime * 0.5;
      }

      launchProjectileAt(projectile, aimX, aimY, this.projectileSpeed);
    }
    this.playFireAnimation();
    this.onFire(target);
  }

  // ===================== FIRE ANIMATION =====================

  /**
   * Subtle scale pulse when the tower fires.
   * Override to customize the animation per tower type.
   */
  protected playFireAnimation(): void {
    this.scene.tweens.add({
      targets: this,
      scaleX: this.scaleX * 1.15,
      scaleY: this.scaleY * 1.15,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  // ===================== RANGE INDICATOR =====================

  /**
   * Return the color used for this tower's range circle.
   * Override to provide type-specific colors (e.g., blue for ice, red for cannon).
   */
  protected getRangeCircleColor(): number {
    return 0xffffff;
  }

  private showRangeCircle(): void {
    this.hideRangeCircle();
    this.rangeCircle = createRangeIndicator(
      this.scene,
      this.x,
      this.y,
      this.currentRange,
      this.getRangeCircleColor(),
      0.2,
    );
  }

  private hideRangeCircle(): void {
    this.rangeCircle?.destroy();
    this.rangeCircle = null;
  }

  // ===================== UPGRADE =====================

  canUpgrade(): boolean {
    const stats = this.getUpgradeStats();
    return stats !== null;
  }

  getUpgradeCost(): number | null {
    const stats = this.getUpgradeStats();
    return stats?.cost ?? null;
  }

  upgrade(): boolean {
    const stats = this.getUpgradeStats();
    if (!stats) return false;

    this.currentLevel = stats.level;
    this.currentDamage = stats.damage;
    this.currentRange = stats.range;
    this.currentFireRate = stats.fireRate;
    this.totalInvested += stats.cost;

    this.onUpgrade(this.currentLevel);
    return true;
  }

  // ===================== HOOKS (override in subclass) =====================

  /** Called when the tower fires at a target. Override for fire sound/animation. */
  protected onFire(_target: BaseTDEnemy): void {}

  /** Called after upgrade. Override for visual upgrade effect. */
  protected onUpgrade(_newLevel: number): void {}

  /**
   * Create and return the projectile sprite.
   * Override to create splash projectiles, slow projectiles, etc.
   * The returned projectile will be added to projectilesGroup and launched.
   */
  protected createProjectile(
    _target: BaseTDEnemy,
  ): Phaser.Physics.Arcade.Sprite | null {
    const size =
      this.projectileKey === 'tower_bullet'
        ? PROJECTILE_SIZES.BULLET_SMALL
        : PROJECTILE_SIZES.ARROW;
    return createProjectile(
      this.scene,
      this.x,
      this.y,
      this.projectileKey,
      size,
      this.currentDamage,
    );
  }

  /**
   * Return stats for the next upgrade level.
   * Return null if tower is at max level.
   * Override to provide custom upgrade paths.
   */
  protected getUpgradeStats(): TowerUpgrade | null {
    if (!this.towerConfig.upgrades || this.towerConfig.upgrades.length === 0)
      return null;
    const next = this.towerConfig.upgrades.find(
      (u) => u.level === this.currentLevel + 1,
    );
    return next ?? null;
  }

  // ===================== CLEANUP =====================

  destroy(fromScene?: boolean): void {
    this.hideRangeCircle();
    super.destroy(fromScene);
  }
}
