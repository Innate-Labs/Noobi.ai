import Phaser from 'phaser';
import FSM from 'phaser3-rex-plugins/plugins/fsm.js';

/**
 * PlayerAnimKeys - Configurable animation key mapping
 *
 * Allows customization of animation keys without modifying FSM code.
 * All keys are optional - defaults are used if not provided.
 */
export interface PlayerAnimKeys {
  idle?: string;
  walk?: string;
  jumpUp?: string;
  jumpDown?: string;
  /** Punch animation (odd melee attacks) */
  punch?: string;
  /** Kick animation (even melee attacks) */
  kick?: string;
  /** Ranged attack animation */
  shoot?: string;
  /** Ultimate skill animation */
  ultimate?: string;
  die?: string;
}

/**
 * Default animation keys - used when custom keys not provided
 */
export const DEFAULT_PLAYER_ANIM_KEYS: Required<PlayerAnimKeys> = {
  idle: 'player_idle_anim',
  walk: 'player_walk_anim',
  jumpUp: 'player_jump_up_anim',
  jumpDown: 'player_jump_down_anim',
  punch: 'player_punch_anim',
  kick: 'player_kick_anim',
  shoot: 'player_shoot_anim',
  ultimate: 'player_ultimate_anim',
  die: 'player_die_anim',
};

/**
 * PlayerFSM - Player Finite State Machine (Platformer)
 *
 * CONTROLS:
 *   - WASD: Move Left/Right or Jump
 *   - Space / W: Jump
 *   - Shift: Melee Attack (alternating combo: odd=punch, even=kick)
 *   - E: Ranged Attack
 *   - Q: Ultimate Skill (long cooldown)
 *
 * STATES:
 *   - idle: Standing still
 *   - moving: Walking left/right
 *   - jumping: In the air
 *   - punching: Melee attack (odd count)
 *   - kicking: Melee attack (even count)
 *   - shooting: Ranged attack
 *   - ultimate: Using ultimate skill
 *   - hurting: Taking damage
 *   - dying: Death sequence
 *
 * Each state has:
 *   - enter_xxx(): Called when entering the state
 *   - update_xxx(): Called every frame while in the state
 */
export class PlayerFSM extends FSM {
  scene: Phaser.Scene;
  player: any;
  animKeys: Required<PlayerAnimKeys>;

  constructor(scene: Phaser.Scene, player: any, animKeys?: PlayerAnimKeys) {
    super({
      extend: {
        eventEmitter: new Phaser.Events.EventEmitter(),
      },
    });
    this.scene = scene;
    this.player = player;

    // Merge custom keys with defaults
    this.animKeys = {
      ...DEFAULT_PLAYER_ANIM_KEYS,
      ...animKeys,
    };

    // Start in idle state
    this.goto('idle');
  }

  // ============================================================================
  // DEATH CHECK
  // ============================================================================

  /**
   * Check if player should die (health-based only)
   * Returns true if transitioning to dying state
   *
   * NOTE: Fall death (player.y > mapHeight) is handled by
   * BaseLevelScene.checkPlayerFall(), which correctly calls
   * the onPlayerDeath() hook. Do NOT duplicate that check here,
   * or the hook will be bypassed.
   */
  checkDeath(): boolean {
    if (this.player.health <= 0 && !this.player.isDead) {
      this.player.health = 0;
      this.player.isDead = true;
      this.goto('dying');
      return true;
    }

    return false;
  }

  // ============================================================================
  // INPUT HELPERS
  // ============================================================================

  /**
   * Check if moving left (A key)
   */
  isMovingLeft(): boolean {
    return this.player.wasdKeys?.A?.isDown ?? false;
  }

  /**
   * Check if moving right (D key)
   */
  isMovingRight(): boolean {
    return this.player.wasdKeys?.D?.isDown ?? false;
  }

  /**
   * Check if jumping (W or Space)
   */
  isJumping(): boolean {
    const wDown = this.player.wasdKeys?.W?.isDown ?? false;
    const spaceDown = this.player.spaceKey?.isDown ?? false;
    return wDown || spaceDown;
  }

  /**
   * Check if melee attack pressed (Shift - JustDown)
   */
  isMeleePressed(): boolean {
    return (
      this.player.shiftKey &&
      Phaser.Input.Keyboard.JustDown(this.player.shiftKey)
    );
  }

  /**
   * Check if ranged attack pressed (E - JustDown)
   */
  isRangedPressed(): boolean {
    return this.player.eKey && Phaser.Input.Keyboard.JustDown(this.player.eKey);
  }

  /**
   * Check if ultimate pressed (Q - JustDown)
   */
  isUltimatePressed(): boolean {
    return this.player.qKey && Phaser.Input.Keyboard.JustDown(this.player.qKey);
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  /**
   * Return to appropriate base state based on current input
   */
  returnToBaseState(): void {
    if (!this.player.body.onFloor()) {
      this.goto('jumping');
    } else if (this.isMovingLeft() || this.isMovingRight()) {
      this.goto('moving');
    } else {
      this.goto('idle');
    }
  }

  // ============================================================================
  // IDLE STATE
  // ============================================================================

  enter_idle(): void {
    this.player.setVelocityX(0);
    this.player.playAnimation(this.animKeys.idle);
  }

  update_idle(): void {
    if (this.checkDeath()) return;

    // Movement
    if (this.isMovingLeft() || this.isMovingRight()) {
      this.goto('moving');
      return;
    }

    // Jump (W or Space, must be on ground)
    if (this.isJumping() && this.player.body.onFloor()) {
      this.goto('jumping');
      return;
    }

    // Melee attack (Shift)
    if (this.isMeleePressed()) {
      this.player.meleeComboCount++;
      if (this.player.meleeComboCount % 2 === 1) {
        this.goto('punching');
      } else {
        this.goto('kicking');
      }
      return;
    }

    // Ranged attack (E)
    if (this.isRangedPressed() && this.player.ranged) {
      this.goto('shooting');
      return;
    }

    // Ultimate (Q)
    if (this.isUltimatePressed() && this.player.canUseUltimate()) {
      this.goto('ultimate');
      return;
    }
  }

  // ============================================================================
  // MOVING STATE
  // ============================================================================

  enter_moving(): void {
    this.player.playAnimation(this.animKeys.walk);
  }

  update_moving(): void {
    if (this.checkDeath()) return;

    // Handle movement
    if (this.isMovingLeft()) {
      this.player.setVelocityX(-this.player.walkSpeed);
      this.player.facingDirection = 'left';
    } else if (this.isMovingRight()) {
      this.player.setVelocityX(this.player.walkSpeed);
      this.player.facingDirection = 'right';
    } else {
      this.goto('idle');
      return;
    }

    // Update visual flip
    this.player.setFlipX(this.player.facingDirection === 'left');

    // Jump
    if (this.isJumping() && this.player.body.onFloor()) {
      this.goto('jumping');
      return;
    }

    // Melee attack
    if (this.isMeleePressed()) {
      this.player.meleeComboCount++;
      if (this.player.meleeComboCount % 2 === 1) {
        this.goto('punching');
      } else {
        this.goto('kicking');
      }
      return;
    }

    // Ranged attack
    if (this.isRangedPressed() && this.player.ranged) {
      this.goto('shooting');
      return;
    }

    // Ultimate
    if (this.isUltimatePressed() && this.player.canUseUltimate()) {
      this.goto('ultimate');
      return;
    }
  }

  // ============================================================================
  // JUMPING STATE
  // ============================================================================

  enter_jumping(): void {
    // Apply jump force only when on ground
    if (this.player.body.onFloor()) {
      this.player.body.setVelocityY(-this.player.jumpPower);
      this.player.jumpSound?.play();
    }
    this.player.playAnimation(this.animKeys.jumpUp);
  }

  update_jumping(): void {
    if (this.checkDeath()) return;

    // Air movement (80% speed)
    if (this.isMovingLeft()) {
      this.player.setVelocityX(-this.player.walkSpeed * 0.8);
      this.player.facingDirection = 'left';
    } else if (this.isMovingRight()) {
      this.player.setVelocityX(this.player.walkSpeed * 0.8);
      this.player.facingDirection = 'right';
    } else {
      this.player.setVelocityX(0);
    }

    // Update visual flip
    this.player.setFlipX(this.player.facingDirection === 'left');

    // Switch to falling animation when descending
    if (this.player.body.velocity.y > 0) {
      if (this.player.anims.currentAnim?.key !== this.animKeys.jumpDown) {
        this.player.playAnimation(this.animKeys.jumpDown);
      }
    }

    // Landing detection
    if (this.player.body.onFloor()) {
      if (this.isMovingLeft() || this.isMovingRight()) {
        this.goto('moving');
      } else {
        this.goto('idle');
      }
      return;
    }

    // Air melee attack
    if (this.isMeleePressed()) {
      this.player.meleeComboCount++;
      if (this.player.meleeComboCount % 2 === 1) {
        this.goto('punching');
      } else {
        this.goto('kicking');
      }
      return;
    }

    // Air ranged attack
    if (this.isRangedPressed() && this.player.ranged) {
      this.goto('shooting');
      return;
    }
  }

  // ============================================================================
  // PUNCHING STATE (odd melee attacks)
  // ============================================================================

  enter_punching(): void {
    this.player.isAttacking = true;
    this.player.setVelocityX(0);
    this.player.playAnimation(this.animKeys.punch);
    this.player.attackSound?.play();
    this.player.currentMeleeTargets.clear();

    const exitPunching = () => {
      if (!this.player.isAttacking) return;
      this.player.isAttacking = false;
      this.player.currentMeleeTargets.clear();
      this.returnToBaseState();
    };

    this.player.once(`animationcomplete-${this.animKeys.punch}`, exitPunching);
    this.scene.time.delayedCall(300, exitPunching);
  }

  update_punching(): void {
    if (this.checkDeath()) return;
    if (this.player.body.onFloor()) {
      this.player.setVelocityX(0);
    }
  }

  // ============================================================================
  // KICKING STATE (even melee attacks)
  // ============================================================================

  enter_kicking(): void {
    this.player.isAttacking = true;
    this.player.setVelocityX(0);
    this.player.playAnimation(this.animKeys.kick);
    this.player.attackSound?.play();
    this.player.currentMeleeTargets.clear();

    const exitKicking = () => {
      if (!this.player.isAttacking) return;
      this.player.isAttacking = false;
      this.player.currentMeleeTargets.clear();
      this.returnToBaseState();
    };

    this.player.once(`animationcomplete-${this.animKeys.kick}`, exitKicking);
    this.scene.time.delayedCall(350, exitKicking);
  }

  update_kicking(): void {
    if (this.checkDeath()) return;
    if (this.player.body.onFloor()) {
      this.player.setVelocityX(0);
    }
  }

  // ============================================================================
  // SHOOTING STATE (E key)
  // ============================================================================

  enter_shooting(): void {
    this.player.setVelocityX(0);
    this.player.playAnimation(this.animKeys.shoot);
    this.player.shoot();

    const exitShooting = () => {
      this.returnToBaseState();
    };

    this.player.once(`animationcomplete-${this.animKeys.shoot}`, exitShooting);
    this.scene.time.delayedCall(200, exitShooting);
  }

  update_shooting(): void {
    if (this.checkDeath()) return;
    if (this.player.body.onFloor()) {
      this.player.setVelocityX(0);
    }
  }

  // ============================================================================
  // ULTIMATE STATE (Q key)
  // ============================================================================

  enter_ultimate(): void {
    // Check if player can use ultimate
    if (!this.player.canUseUltimate()) {
      this.returnToBaseState();
      return;
    }

    // Play charge animation if specified
    this.player.playAnimation(this.animKeys.ultimate);

    // Execute the ultimate (it handles its own completion)
    this.player.useUltimate();
  }

  update_ultimate(): void {
    if (this.checkDeath()) return;

    // Wait for ultimate to complete
    if (!this.player.isUsingUltimate) {
      this.returnToBaseState();
    }
  }

  // ============================================================================
  // HURTING STATE
  // ============================================================================

  enter_hurting(): void {
    this.player.setVelocityX(0);
    this.player.hurtSound?.play();

    this.player.hurtingTimer = this.scene.time.delayedCall(
      this.player.hurtingDuration,
      () => {
        this.player.isHurting = false;
        this.returnToBaseState();
      },
    );
  }

  // ============================================================================
  // DYING STATE
  // ============================================================================

  enter_dying(): void {
    if (this.player.hurtingTimer) {
      this.player.hurtingTimer.destroy();
    }

    this.player.setVelocityX(0);
    this.player.playAnimation(this.animKeys.die);

    this.player.once(`animationcomplete-${this.animKeys.die}`, () => {
      this.scene.scene.launch('GameOverUIScene', {
        currentLevelKey: this.scene.scene.key,
      });
    });
  }
}
