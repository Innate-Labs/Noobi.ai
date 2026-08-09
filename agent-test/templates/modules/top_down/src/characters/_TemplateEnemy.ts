/**
 * ============================================================================
 * TEMPLATE: Enemy Character (Top-Down)
 * ============================================================================
 *
 * INSTRUCTIONS FOR AGENT:
 * 1. Copy this file and rename to your enemy class (e.g., Trooper.ts, Droid.ts)
 * 2. Rename the class
 * 3. Update textureKey to match your asset-pack.json IMAGE key
 * 4. Update stats (health, speed, damage)
 * 5. Choose AI type and configure
 * 6. Optionally add combat abilities (melee, ranged)
 *
 * CRITICAL RULES:
 * - textureKey MUST be an IMAGE key, NOT an animation key
 * - Always use playAnimation(), never play() directly
 * - Add to scene.enemies group after creation
 * - For melee bosses, add meleeTrigger to scene.enemyMeleeTriggers
 * - No gravity — top-down view
 * ============================================================================
 */

import Phaser from 'phaser';
import { BaseEnemy, type EnemyConfig } from './BaseEnemy';
// RECOMMENDED: Use default import for JSON, then extract with defaults
import gameConfig from '../gameConfig.json';

// Extract config with safe defaults in case values are missing
const enemyConfig = gameConfig.enemyConfig ?? {
  maxHealth: { value: 100 },
  walkSpeed: { value: 80 },
  damage: { value: 10 },
};

export class _TemplateEnemy extends BaseEnemy {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Build configuration
    const config: EnemyConfig = {
      // ========================================
      // TEXTURE KEY
      // ========================================
      textureKey: 'enemy_idle_frame1', // TODO: Replace with your texture key

      // ========================================
      // DISPLAY SETTINGS
      // ========================================
      displayHeight: 64, // Normal enemy height (= 1 tile); use 80 for bosses/heavies
      bodyWidthFactor: 0.5, // Collision body width ratio (feet area)
      bodyHeightFactor: 0.4, // Collision body height ratio (feet area)

      // ========================================
      // STATS
      // ========================================
      stats: {
        maxHealth: enemyConfig.maxHealth.value,
        speed: enemyConfig.walkSpeed.value,
        damage: enemyConfig.damage.value,
      },

      // ========================================
      // AI CONFIGURATION
      // ========================================
      ai: {
        // AI Types: 'patrol' | 'chase' | 'stationary' | 'custom'
        type: 'patrol',

        // For patrol AI (optional rectangular area):
        // patrolArea: { minX: 100, maxX: 500, minY: 100, maxY: 400 },
        // directionChangeInterval: 2000,

        // For chase AI:
        // detectionRange: 300,   // Start chasing when player within this range
        // giveUpDistance: 500,   // Stop chasing when player beyond this range
        // stopDistance: 50,      // Stop when this close to player (for ranged enemies)
      },

      // ========================================
      // COMBAT CONFIGURATION (optional)
      // ========================================
      combat: {
        // Melee attacks (for bosses or melee enemies):
        hasMelee: false,
        // meleeRange: 80,
        // meleeWidth: 60,
        // meleeCooldown: 1000,

        // Ranged attacks:
        hasRanged: false,
        // rangedKey: 'enemy_bullet',
        // rangedCooldown: 2000,
      },
    };

    super(scene, x, y, config);

    // Play initial animation
    // TODO: Uncomment and use your animation key
    // this.playAnimation('enemy_idle_anim');
  }

  // ============================================================================
  // OPTIONAL HOOKS - Override for custom behavior
  // ============================================================================

  /**
   * Add custom behaviors
   *
   * CRITICAL: This method is called DURING super() constructor!
   * Any instance variables initialized AFTER super() will be undefined here.
   * Initialize custom skills INSIDE this method, not after super().
   */
  protected override initBehaviors(config: EnemyConfig): void {
    // Example: Add custom skill behavior
    // this.chargeAttack = new ChargeAttack({ ... });
    // this.behaviors.add('charge', this.chargeAttack);
  }

  /**
   * Automatic animation selection based on movement state.
   * Return an animation key, or null to manage animations manually in onUpdate.
   */
  protected override getAnimationKey(
    isMoving: boolean,
    facingDirection: 'left' | 'right' | 'up' | 'down',
  ): string | null {
    // RECOMMENDED: Directional animation (front/back/side convention)
    // const suffix = facingDirection === 'down' ? '_front' : facingDirection === 'up' ? '_back' : '_side';
    // if (this.isDead) return 'enemy_die_front_anim';
    // const action = isMoving ? 'walk' : 'idle';
    // return `enemy_${action}${suffix}_anim`;

    return null; // No auto-animation (manage manually if needed)
  }

  /**
   * Custom per-frame update logic
   */
  protected override onUpdate(): void {
    // Example: Manual animation control (alternative to getAnimationKey)
    // if (this.chase?.isChasing()) {
    //   this.playAnimation('enemy_run_anim');
    // } else {
    //   this.playAnimation('enemy_idle_anim');
    // }
  }

  /**
   * React to taking damage
   */
  protected override onDamageTaken(damage: number): void {
    // Example: Aggro on player when hit
    // if (this.aiType === 'patrol') {
    //   this.aiType = 'chase';
    //   this.setTarget((this.scene as any).player);
    // }
  }

  /**
   * React to death
   */
  protected override onDeath(): void {
    // Example: Death effects, score events
    // this.playAnimation('enemy_die_anim');
  }

  /**
   * React to detecting a target for the first time
   */
  protected override onAggro(target: Phaser.Physics.Arcade.Sprite): void {
    // Example: Play alert sound (use safeAddSound in initializeSounds, then play here)
    // this.attackSound?.play();
  }

  /**
   * Override to customize sounds.
   * BaseEnemy provides: this.attackSound, this.deathSound
   * Override to reassign these to custom audio keys.
   * DO NOT use this.sounds.xxx — that pattern does not exist!
   */
  protected override initializeSounds(): void {
    super.initializeSounds();
    // Example: Override with custom sounds
    // this.attackSound = utils.safeAddSound(this.scene, 'enemy_shoot_sfx', { volume: 0.3 });
    // this.deathSound = utils.safeAddSound(this.scene, 'enemy_death_sfx', { volume: 0.3 });
  }

  /**
   * Custom AI logic (when using aiType: 'custom')
   *
   * Use this for boss AI with complex attack patterns.
   *
   * MELEE ATTACK USAGE:
   *   if (this.melee && this.melee.canAttack()) {
   *     this.melee.startAttack();
   *     this.playAnimation('enemy_attack_anim');
   *   }
   *
   * RANGED ATTACK USAGE:
   *   if (this.ranged && this.ranged.canShoot()) {
   *     this.ranged.shootAt(player, 'enemyBullets');
   *   }
   */
  protected override executeAI(): void {
    // Example: Boss AI with melee attack when close, ranged when far
    // const player = (this.scene as any).player;
    // if (!player || player.isDead) return;
    //
    // const distance = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    //
    // if (distance < 100 && this.melee?.canAttack()) {
    //   this.melee.startAttack();
    //   this.playAnimation('enemy_attack_anim');
    // } else if (distance < 400 && this.ranged?.canShoot()) {
    //   this.ranged.shootAt(player, 'enemyBullets');
    // }
  }
}
