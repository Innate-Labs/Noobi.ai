/**
 * ============================================================================
 * TEMPLATE: Player Character
 * ============================================================================
 *
 * INSTRUCTIONS FOR AGENT:
 * 1. Copy this file and rename to your player class (e.g., Player.ts, Hero.ts)
 * 2. Rename the class (e.g., Player, Hero)
 * 3. Update textureKey to match your asset-pack.json IMAGE key
 * 4. Update stats from gameConfig.json values
 * 5. Update animKeys to match your animations.json keys
 * 6. Optionally override hooks for custom behavior
 *
 * CRITICAL RULES:
 * - textureKey MUST be an IMAGE key, NOT an animation key
 * - Always use playAnimation(), never play() directly
 * - Stats should come from gameConfig.json
 * ============================================================================
 */

import Phaser from 'phaser';
import { BasePlayer, type PlayerConfig } from './BasePlayer';
// RECOMMENDED: Use default import for JSON, then extract with defaults
import gameConfig from '../gameConfig.json';

// Extract config with safe defaults in case values are missing
const playerConfig = gameConfig.playerConfig ?? {
  maxHealth: { value: 100 },
  walkSpeed: { value: 200 },
  jumpPower: { value: 620 },
  attackDamage: { value: 25 },
  hurtingDuration: { value: 100 },
  invulnerableTime: { value: 1000 },
  gravityY: { value: 1200 },
};

// Optional: Import custom behaviors if needed
// import { DoubleJump } from '../behaviors/DoubleJump';

export class _TemplatePlayer extends BasePlayer {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Build configuration
    const config: PlayerConfig = {
      // ========================================
      // TEXTURE KEY
      // ========================================
      // MUST be an IMAGE key from asset-pack.json (first frame of idle animation)
      // Example: "player_idle_frame1" or "hero_idle_01"
      textureKey: 'player_idle_frame1', // TODO: Replace with your texture key

      // ========================================
      // DISPLAY SETTINGS
      // ========================================
      displayHeight: 128, // Standard player height (2 tiles)
      bodyWidthFactor: 0.6, // Collision body width ratio
      bodyHeightFactor: 0.85, // Collision body height ratio
      // Visual offset to make sprite feet align with ground tiles (pixels)
      // Default 50 works for most AI-generated sprites. Set 0 to disable.
      verticalVisualOffset: 50,

      // ========================================
      // STATS (from gameConfig.json)
      // ========================================
      stats: {
        maxHealth: playerConfig.maxHealth.value,
        walkSpeed: playerConfig.walkSpeed.value,
        jumpPower: playerConfig.jumpPower.value,
        attackDamage: playerConfig.attackDamage.value,
        hurtingDuration: playerConfig.hurtingDuration.value,
        invulnerableTime: playerConfig.invulnerableTime.value,
        gravityY: playerConfig.gravityY.value,
      },

      // ========================================
      // MOVEMENT BEHAVIOR CONFIG (optional)
      // ========================================
      movement: {
        airControl: 0.8, // Air movement speed multiplier
        coyoteTime: 0, // ms to jump after leaving platform (0 = disabled)
        jumpBufferTime: 0, // ms to buffer jump input (0 = disabled)
        // doubleJumpEnabled: true, // Allow one extra jump while airborne
        // doubleJumpPower: 500,    // Double jump force (defaults to jumpPower)
      },

      // ========================================
      // COMBAT CONFIG (optional)
      // ========================================
      combat: {
        meleeRange: 100, // Melee attack range in pixels
        meleeWidth: 80, // Melee attack width in pixels
        // Uncomment for ranged attacks:
        // rangedKey: 'player_bullet',
        // rangedSpeed: 600,
        // rangedCooldown: 300,
      },

      // ========================================
      // ANIMATION KEYS
      // ========================================
      // Must match keys in animations.json
      // CRITICAL: FSM uses punch/kick for alternating melee combo.
      //   Do NOT use a single "attack" key — the FSM will ignore it!
      animKeys: {
        idle: 'player_idle_anim',
        walk: 'player_walk_anim', // TODO: Or 'player_run_anim' if using run
        jumpUp: 'player_jump_up_anim',
        jumpDown: 'player_jump_down_anim',
        punch: 'player_attack_1_anim', // TODO: Odd melee attacks (combo hit 1)
        kick: 'player_attack_2_anim', // TODO: Even melee attacks (combo hit 2)
        // shoot: 'player_shoot_anim',  // TODO: Uncomment if using ranged attacks
        // ultimate: 'player_ultimate_anim', // TODO: Uncomment if using ultimate skill
        die: 'player_die_anim',
      },
    };

    super(scene, x, y, config);
  }

  // ============================================================================
  // OPTIONAL HOOKS - Override for custom behavior
  // ============================================================================

  /**
   * Add custom behaviors
   */
  protected override initBehaviors(config: PlayerConfig): void {
    // No custom behaviors by default
  }

  /**
   * Initialize ultimate skill (Q key)
   *
   * AVAILABLE SKILL TYPES — pick the one that fits your character:
   *
   * DashAttackSkill       — Linear dash that damages enemies in path
   * AreaDamageSkill       — AOE burst around the player
   * TargetedExecutionSkill — Lock-on to nearest enemy, instant kill
   * TargetedAOESkill      — Lock-on with AOE at target
   * BeamAttackSkill       — Horizontal beam across the screen
   * GroundQuakeSkill      — Ground slam (affects grounded enemies only)
   * BoomerangSkill        — Returning projectile (hammer, shuriken)
   * MultishotSkill        — Fires N projectiles in a spread
   * ArcProjectileSkill    — Gravity arc projectile (boulder, grenade)
   */
  // protected override initUltimate(): void {
  //   // Example: Boomerang (returning projectile)
  //   // this.ultimate = this.behaviors.add('ultimate', new BoomerangSkill({
  //   //   id: 'hammer_throw', name: 'Hammer Throw', cooldown: 6000,
  //   //   projectileKey: 'hammer', throwSpeed: 500, returnSpeed: 600,
  //   //   maxDistance: 400, damage: 40,
  //   // }));
  //
  //   // Example: Multishot (spread fire)
  //   // this.ultimate = this.behaviors.add('ultimate', new MultishotSkill({
  //   //   id: 'missile_volley', name: 'Missile Volley', cooldown: 5000,
  //   //   projectileKey: 'missile', projectileCount: 3, spreadAngle: 30,
  //   //   projectileSpeed: 400, damage: 25,
  //   // }));
  //
  //   // Example: Arc Projectile (gravity arc)
  //   // this.ultimate = this.behaviors.add('ultimate', new ArcProjectileSkill({
  //   //   id: 'boulder_throw', name: 'Boulder Throw', cooldown: 7000,
  //   //   projectileKey: 'boulder', launchSpeedX: 400, launchSpeedY: -200,
  //   //   damage: 50, gravity: 400, hasExplosion: true, explosionRadius: 150,
  //   // }));
  // }

  /**
   * Custom per-frame update logic
   */
  protected override onUpdate(): void {
    // Example: Check for special ability input
    // if (Phaser.Input.Keyboard.JustDown(this.dashKey)) {
    //   this.behaviors.get('dash')?.execute();
    // }
  }

  /**
   * React to taking damage
   */
  protected override onDamageTaken(damage: number): void {
    // Example: Screen shake on damage
    // this.scene.cameras.main.shake(100, 0.01);
    // Example: Play hurt sound
    // this.hurtSound?.play();
  }

  /**
   * React to death
   */
  protected override onDeath(): void {
    // Example: Play death effect
    // this.scene.cameras.main.flash(500, 255, 0, 0);
  }

  /**
   * React to health changes
   */
  protected override onHealthChanged(
    oldHealth: number,
    newHealth: number,
  ): void {
    // Example: Update UI or trigger effects
    // if (newHealth < oldHealth * 0.25) {
    //   // Low health warning
    // }
  }

  /**
   * Override to customize sounds
   */
  protected override initializeSounds(): void {
    super.initializeSounds();
    // Add custom sounds:
    // this.dashSound = utils.safeAddSound(this.scene, 'dash_sfx', { volume: 0.3 });
  }
}
