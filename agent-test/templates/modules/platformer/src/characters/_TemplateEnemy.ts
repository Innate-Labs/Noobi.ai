/**
 * ============================================================================
 * TEMPLATE: Enemy Character
 * ============================================================================
 *
 * INSTRUCTIONS FOR AGENT:
 * 1. Copy this file and rename to your enemy class (e.g., Slime.ts, Goblin.ts)
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
      // MUST be an IMAGE key from asset-pack.json (first frame of idle animation)
      textureKey: 'enemy_idle_frame1', // TODO: Replace with your texture key

      // ========================================
      // DISPLAY SETTINGS
      // ========================================
      displayHeight: 80, // Enemy height in pixels
      bodyWidthFactor: 0.7, // Collision body width ratio
      bodyHeightFactor: 0.8, // Collision body height ratio
      hasGravity: true, // Set false for flying enemies
      // Visual offset to make sprite feet align with ground tiles (pixels)
      // Default 50 works for most AI-generated sprites. Set 0 to disable.
      verticalVisualOffset: 50,

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

        // For patrol AI (optional bounds):
        // patrolMinX: 100,
        // patrolMaxX: 500,

        // For chase AI:
        // detectionRange: 300,   // Start chasing when player within this range
        // giveUpDistance: 500,   // Stop chasing when player beyond this range
        // stopDistance: 50,      // Stop when this close to player
        // chaseVertical: false,  // Set true for flying enemies
      },

      // ========================================
      // COMBAT CONFIGURATION (optional)
      // ========================================
      combat: {
        // Melee attacks (for bosses):
        hasMelee: false,
        // meleeRange: 80,
        // meleeWidth: 60,
        // meleeCooldown: 1000,

        // Ranged attacks:
        hasRanged: false,
        // rangedKey: 'enemy_bullet',
        // rangedRange: 300,
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
   *
   * WRONG:
   *   constructor() {
   *     super(scene, x, y, config);
   *     this.mySkill = new Skill();  // Initialized AFTER super()
   *   }
   *   initBehaviors() {
   *     this.behaviors.add('skill', this.mySkill);  // ERROR: mySkill is undefined!
   *   }
   *
   * CORRECT:
   *   initBehaviors() {
   *     this.mySkill = new Skill();  // Initialize HERE
   *     this.behaviors.add('skill', this.mySkill);  // Now it works
   *   }
   */
  protected override initBehaviors(config: EnemyConfig): void {
    // Example: Add custom skill behavior
    // this.mySkill = new DashAttackSkill({ ... });  // Create skill HERE
    // this.behaviors.add('dash', this.mySkill);
  }

  /**
   * Custom per-frame update logic
   */
  protected override onUpdate(): void {
    // Example: Change animation based on state
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
    // Example: Play hurt animation
    // this.playAnimation('enemy_hurt_anim');
    // Example: Aggro on player
    // if (this.aiType === 'patrol') {
    //   this.aiType = 'chase';
    //   this.setTarget((this.scene as any).player);
    // }
  }

  /**
   * React to death
   */
  protected override onDeath(): void {
    // Example: Play death animation
    // this.playAnimation('enemy_die_anim');
    // Example: Drop item
    // this.dropLoot();
    // Example: Spawn particles
    // this.scene.add.particles(this.x, this.y, 'particle', { ... });
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
    // Example: Boss AI with melee attack
    // const player = (this.scene as any).player;
    // if (!player || player.isDead) return;
    //
    // const distance = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    //
    // // Attack if in range
    // if (distance < 100 && this.melee?.canAttack()) {
    //   this.melee.startAttack();
    //   this.playAnimation('enemy_attack_anim');
    // }
  }
}

// ============================================================================
// BOSS TEMPLATE EXAMPLE
// ============================================================================

/**
 * Example boss configuration with special skills
 * Demonstrates safe JSON import and defensive programming
 *
 * CRITICAL: Use default import for JSON with fallback values!
 * Named imports like `import { bossConfig } from '../gameConfig.json'`
 * can fail in some TypeScript/build configurations.
 */
/*
import Phaser from 'phaser';
import { BaseEnemy, type EnemyConfig } from './BaseEnemy';
import { DashAttackSkill, type DashAttackConfig } from '../behaviors/SkillBehavior';
// SAFE JSON IMPORT: Use default import, then extract with defaults
import gameConfig from '../gameConfig.json';

const bossConfig = gameConfig.bossConfig ?? {
  maxHealth: { value: 400 },
  speed: { value: 120 },
  damage: { value: 40 },
  dashCooldown: { value: 4000 },
  dashDistance: { value: 400 },
  dashDamage: { value: 60 },
};

export class _TemplateBoss extends BaseEnemy {
  // Declare skill with definite assignment assertion
  public dashSkill!: DashAttackSkill;
  private lastDashTime: number = 0;
  public isDashing: boolean = false;
  
  constructor(scene: Phaser.Scene, x: number, y: number) {
    const config: EnemyConfig = {
      textureKey: 'boss_idle_01',
      displayName: 'BOSS NAME',
      displayHeight: 160,  // Bosses are larger
      
      // Use optional chaining and defaults for safety
      stats: {
        maxHealth: bossConfig.maxHealth?.value ?? 400,
        speed: bossConfig.speed?.value ?? 120,
        damage: bossConfig.damage?.value ?? 40,
      },
      
      ai: {
        type: 'custom',  // Use custom AI for complex boss patterns
      },
      
      combat: {
        hasMelee: true,
        meleeRange: 120,
        meleeWidth: 100,
        meleeCooldown: 1500,
      },
    };

    super(scene, x, y, config);
    this.playAnimation('boss_idle_anim');
  }

  // CRITICAL: Initialize skills in initBehaviors, NOT after super()
  protected override initBehaviors(config: EnemyConfig): void {
    const dashConfig: DashAttackConfig = {
      id: 'power_dash',
      name: 'Power Dash',
      // Use optional chaining with defaults
      cooldown: bossConfig.dashCooldown?.value ?? 4000,
      dashDistance: bossConfig.dashDistance?.value ?? 400,
      dashDuration: 400,
      hitRange: 100,
      damage: bossConfig.dashDamage?.value ?? 60,
      knockbackForceX: 400,
      knockbackForceY: -200,
      screenShake: { duration: 500, intensity: 0.02 },
    };

    try {
      this.dashSkill = new DashAttackSkill(dashConfig);
      this.behaviors.add('dash', this.dashSkill);
    } catch (error) {
      console.error('Failed to initialize boss dashSkill:', error);
    }
  }

  // Custom boss AI logic
  protected override executeAI(): void {
    const player = (this.scene as any).player;
    if (!player || player.isDead) return;

    const distance = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const now = this.scene.time.now;

    // DEFENSIVE: Check skill exists before using
    if (distance > 200 && this.dashSkill?.canUse() && now - this.lastDashTime > 5000) {
      this.useDashAttack(player);
      return;
    }

    // Melee attack when close
    if (distance < 100 && this.melee?.canAttack()) {
      this.melee.startAttack();
      this.playAnimation('boss_attack_anim');
    }
  }

  private useDashAttack(player: any): void {
    // DEFENSIVE: Early return if skill not initialized
    if (!this.dashSkill) return;
    
    this.isDashing = true;
    this.lastDashTime = this.scene.time.now;
    // ... dash implementation
  }
}
*/
