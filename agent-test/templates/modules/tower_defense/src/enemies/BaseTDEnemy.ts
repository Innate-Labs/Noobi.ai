import Phaser from 'phaser';
import { initScale, type WorldPoint, getDirectionBetween } from '../utils';

// ============================================================================
// BASE TD ENEMY — Path-following enemy for tower defense
// ============================================================================
// Follows an ordered array of waypoints. When it reaches the last waypoint,
// it emits 'enemyReachedEnd'. When health drops to 0, emits 'enemyKilled'.
//
// Features:
//   - Path following with waypoint interpolation
//   - Health bar rendering
//   - Status effect system (slow, etc.) with duration tracking
//   - Public getters for targeting (pathProgress, health)
//
// HOOKS:
//   onSpawn()                  — spawn effects
//   onDamageTaken(damage)      — damage reaction
//   onDeath()                  — death effects, drops
//   onReachEnd()               — reaching exit effect
//   onStatusEffectApplied(id)  — when a status effect is applied
//   onStatusEffectRemoved(id)  — when a status effect expires
//   getAnimationKey(direction) — directional animation
// ============================================================================

export interface TDEnemyConfig {
  textureKey: string;
  displayHeight?: number;
  stats: {
    maxHealth: number;
    speed: number;
    /** gold reward on kill */
    reward: number;
    /** lives lost when reaching exit (default: 1) */
    damage?: number;
  };
}

export interface StatusEffect {
  id: string;
  speedMultiplier: number;
  duration: number;
  elapsed: number;
  tint?: number;
}

export class BaseTDEnemy extends Phaser.Physics.Arcade.Sprite {
  protected config: TDEnemyConfig;

  protected _maxHealth: number;
  protected _currentHealth: number;
  protected baseSpeed: number;
  protected reward: number;
  protected exitDamage: number;

  protected waypoints: WorldPoint[] = [];
  protected _currentWaypointIndex: number = 0;
  protected isDead: boolean = false;

  private statusEffects: Map<string, StatusEffect> = new Map();
  private healthBar?: Phaser.GameObjects.Graphics;
  private healthBarBg?: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    config: TDEnemyConfig,
  ) {
    super(scene, x, y, config.textureKey);
    this.config = config;

    this._maxHealth = config.stats.maxHealth;
    this._currentHealth = this._maxHealth;
    this.baseSpeed = config.stats.speed;
    this.reward = config.stats.reward;
    this.exitDamage = config.stats.damage ?? 1;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    if (config.displayHeight) {
      initScale(
        this,
        { x: 0.5, y: 0.5 },
        undefined,
        config.displayHeight,
        0.6,
        0.6,
      );
    }

    this.createHealthBar();
  }

  // ===================== PUBLIC GETTERS (for targeting) =====================

  get health(): number {
    return this._currentHealth;
  }

  get maxHealth(): number {
    return this._maxHealth;
  }

  get currentWaypointIndex(): number {
    return this._currentWaypointIndex;
  }

  /** Effective speed after all status effect multipliers */
  get effectiveSpeed(): number {
    let multiplier = 1;
    for (const effect of this.statusEffects.values()) {
      multiplier *= effect.speedMultiplier;
    }
    return this.baseSpeed * multiplier;
  }

  /** 0 = at spawn, 1 = at exit. Used by tower targeting ('first'/'last') */
  get pathProgress(): number {
    if (this.waypoints.length <= 1) return 0;
    return this._currentWaypointIndex / (this.waypoints.length - 1);
  }

  /** Gold reward when this enemy is killed */
  get killReward(): number {
    return this.reward;
  }

  /**
   * Initialize the path for this enemy to follow.
   * Called by BaseTDScene after spawning.
   */
  setPath(waypoints: WorldPoint[]): void {
    this.waypoints = waypoints;
    this._currentWaypointIndex = 0;

    if (waypoints.length > 0) {
      this.setPosition(waypoints[0].x, waypoints[0].y);
    }

    this.onSpawn();
  }

  update(time: number, delta: number): void {
    if (this.isDead || this.waypoints.length === 0) return;

    this.updateStatusEffects(delta);
    this.moveAlongPath(delta);
    this.updateHealthBar();
    this.updateAnimation();
  }

  // ===================== PATH FOLLOWING =====================

  private moveAlongPath(delta: number): void {
    if (this._currentWaypointIndex >= this.waypoints.length) {
      this.reachEnd();
      return;
    }

    const target = this.waypoints[this._currentWaypointIndex];
    const distance = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      target.x,
      target.y,
    );
    const step = this.effectiveSpeed * (delta / 1000);

    if (distance <= step) {
      this.setPosition(target.x, target.y);
      this._currentWaypointIndex++;
      if (this._currentWaypointIndex >= this.waypoints.length) {
        this.reachEnd();
      }
    } else {
      const angle = Phaser.Math.Angle.Between(
        this.x,
        this.y,
        target.x,
        target.y,
      );
      this.setPosition(
        this.x + Math.cos(angle) * step,
        this.y + Math.sin(angle) * step,
      );
    }

    // Sync physics body position with sprite after manual setPosition.
    // Required for overlap/collision detection to work correctly.
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.reset(this.x, this.y);
    }
  }

  private updateAnimation(): void {
    if (this._currentWaypointIndex >= this.waypoints.length) return;

    const target = this.waypoints[this._currentWaypointIndex];
    const direction = getDirectionBetween({ x: this.x, y: this.y }, target);
    const animKey = this.getAnimationKey(direction);

    if (animKey && this.anims?.currentAnim?.key !== animKey) {
      if (this.scene.anims.exists(animKey)) {
        this.play(animKey, true);
      }
    }

    if (direction === 'left') {
      this.setFlipX(true);
    } else if (direction === 'right') {
      this.setFlipX(false);
    }
  }

  // ===================== DAMAGE =====================

  takeDamage(damage: number): void {
    if (this.isDead) return;

    this._currentHealth -= damage;
    this.onDamageTaken(damage);

    if (this._currentHealth <= 0) {
      this._currentHealth = 0;
      this.die();
    }
  }

  private die(): void {
    if (this.isDead) return;
    this.isDead = true;

    this.onDeath();
    this.scene.events.emit('enemyKilled', this, this.reward);
    this.destroySelf();
  }

  private reachEnd(): void {
    if (this.isDead) return;
    this.isDead = true;

    this.onReachEnd();
    this.scene.events.emit('enemyReachedEnd', this, this.exitDamage);
    this.destroySelf();
  }

  private destroySelf(): void {
    this.statusEffects.clear();
    this.healthBar?.destroy();
    this.healthBarBg?.destroy();
    this.destroy();
  }

  // ===================== STATUS EFFECT SYSTEM =====================

  /**
   * Apply a status effect (e.g., slow). If the same id is already active,
   * the duration is refreshed (not stacked).
   */
  applyStatusEffect(
    id: string,
    speedMultiplier: number,
    duration: number,
    tint?: number,
  ): void {
    if (this.isDead) return;

    const existing = this.statusEffects.get(id);
    if (existing) {
      existing.speedMultiplier = speedMultiplier;
      existing.duration = duration;
      existing.elapsed = 0;
      existing.tint = tint;
    } else {
      this.statusEffects.set(id, {
        id,
        speedMultiplier,
        duration,
        elapsed: 0,
        tint,
      });
      this.onStatusEffectApplied(id);
    }

    this.updateTintFromEffects();
  }

  hasStatusEffect(id: string): boolean {
    return this.statusEffects.has(id);
  }

  private updateStatusEffects(delta: number): void {
    const toRemove: string[] = [];

    for (const [id, effect] of this.statusEffects) {
      effect.elapsed += delta;
      if (effect.elapsed >= effect.duration) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.statusEffects.delete(id);
      this.onStatusEffectRemoved(id);
    }

    if (toRemove.length > 0) {
      this.updateTintFromEffects();
    }
  }

  private updateTintFromEffects(): void {
    let tint: number | undefined;
    for (const effect of this.statusEffects.values()) {
      if (effect.tint !== undefined) {
        tint = effect.tint;
      }
    }
    if (tint !== undefined) {
      this.setTint(tint);
    } else {
      this.clearTint();
    }
  }

  // ===================== HEALTH BAR =====================

  private createHealthBar(): void {
    this.healthBarBg = this.scene.add.graphics();
    this.healthBar = this.scene.add.graphics();
  }

  private updateHealthBar(): void {
    if (!this.healthBar || !this.healthBarBg) return;

    const barWidth = 30;
    const barHeight = 4;
    const offsetY = -this.displayHeight / 2 - 8;

    this.healthBarBg.clear();
    this.healthBarBg.fillStyle(0x000000, 0.6);
    this.healthBarBg.fillRect(
      this.x - barWidth / 2,
      this.y + offsetY,
      barWidth,
      barHeight,
    );
    this.healthBarBg.setDepth(100);

    const healthPercent = this._currentHealth / this._maxHealth;
    const color =
      healthPercent > 0.5
        ? 0x00ff00
        : healthPercent > 0.25
          ? 0xffff00
          : 0xff0000;

    this.healthBar.clear();
    this.healthBar.fillStyle(color, 0.9);
    this.healthBar.fillRect(
      this.x - barWidth / 2,
      this.y + offsetY,
      barWidth * healthPercent,
      barHeight,
    );
    this.healthBar.setDepth(101);
  }

  // ===================== HOOKS (override in subclass) =====================

  /** Called when the enemy is spawned and path is set */
  protected onSpawn(): void {}

  /** Called when the enemy takes damage */
  protected onDamageTaken(_damage: number): void {}

  /** Called when the enemy health reaches 0 */
  protected onDeath(): void {}

  /** Called when the enemy reaches the last waypoint */
  protected onReachEnd(): void {}

  /** Called when a status effect is applied */
  protected onStatusEffectApplied(_effectId: string): void {}

  /** Called when a status effect expires */
  protected onStatusEffectRemoved(_effectId: string): void {}

  /**
   * Return an animation key based on facing direction.
   * Override to provide directional walking animations.
   */
  protected getAnimationKey(
    _direction: 'left' | 'right' | 'up' | 'down',
  ): string | null {
    return null;
  }
}
