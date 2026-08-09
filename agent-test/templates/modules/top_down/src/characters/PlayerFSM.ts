import Phaser from 'phaser';
import FSM from 'phaser3-rex-plugins/plugins/fsm.js';

/**
 * PlayerAnimKeys - Configurable animation key mapping for top-down player
 *
 * Allows customization of animation keys without modifying FSM code.
 * All keys are optional — defaults are used if not provided.
 *
 * For directional sprites: The FSM uses a single BASE key per action.
 * Override playAnimation() in your BasePlayer subclass to resolve
 * directional variants (e.g., walk_front, walk_back, walk_side) based
 * on facingDirection. See _TemplatePlayer.ts for the standard pattern.
 */
export interface PlayerAnimKeys {
  idle?: string;
  walk?: string;
  melee?: string;
  shoot?: string;
  dash?: string;
  die?: string;
}

/**
 * Default animation keys - used when custom keys not provided
 */
export const DEFAULT_PLAYER_ANIM_KEYS: Required<PlayerAnimKeys> = {
  idle: 'player_idle_anim',
  walk: 'player_walk_anim',
  melee: 'player_melee_anim',
  shoot: 'player_shoot_anim',
  dash: 'player_dash_anim',
  die: 'player_die_anim',
};

/**
 * PlayerFSM - Player Finite State Machine (Top-Down)
 *
 * CONTROLS:
 *   - WASD: 8-directional movement
 *   - Mouse: Aiming (handled by FaceTarget behavior)
 *   - Shift: Melee Attack
 *   - E: Ranged Attack
 *   - Space: Dash (in movement direction or facing direction)
 *   - Q: Reserved for special abilities (hook)
 *
 * STATES:
 *   - idle: Standing still
 *   - walking: Moving in 8 directions
 *   - melee: Melee attack animation (ROOTS player)
 *   - shooting: Ranged attack animation (allows movement — twin-stick)
 *   - dashing: Dash movement (i-frames)
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

  /** Prevents double-triggering of death UI (animation complete + fallback timer) */
  private _deathTriggered: boolean = false;

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
   * Check if player should die.
   * Safety net — normally, lethal damage is handled directly in
   * BasePlayer.takeDamage() via kill(). This catches edge cases
   * where health drops below 0 from external code.
   *
   * Returns true if transitioning to dying state
   */
  checkDeath(): boolean {
    if (this.player.health <= 0 && !this.player.isDead) {
      this.player.kill(); // Properly triggers onDeath() hook + FSM transition
      return true;
    }
    return false;
  }

  // ============================================================================
  // INPUT HELPERS
  // ============================================================================

  /** Check if moving left (A key) */
  isMovingLeft(): boolean {
    return this.player.wasdKeys?.A?.isDown ?? false;
  }

  /** Check if moving right (D key) */
  isMovingRight(): boolean {
    return this.player.wasdKeys?.D?.isDown ?? false;
  }

  /** Check if moving up (W key) */
  isMovingUp(): boolean {
    return this.player.wasdKeys?.W?.isDown ?? false;
  }

  /** Check if moving down (S key) */
  isMovingDown(): boolean {
    return this.player.wasdKeys?.S?.isDown ?? false;
  }

  /** Check if any movement key is pressed */
  hasMovementInput(): boolean {
    return (
      this.isMovingLeft() ||
      this.isMovingRight() ||
      this.isMovingUp() ||
      this.isMovingDown()
    );
  }

  /**
   * Check if melee attack triggered.
   * Delegates to player.checkMeleeInput() — override that for custom input.
   */
  isMeleePressed(): boolean {
    return this.player.checkMeleeInput?.() ?? false;
  }

  /**
   * Check if ranged attack triggered.
   * Delegates to player.checkRangedInput() — override that for custom input.
   */
  isRangedPressed(): boolean {
    return this.player.checkRangedInput?.() ?? false;
  }

  /**
   * Check if dash triggered.
   * Delegates to player.checkDashInput() — override that for custom input.
   */
  isDashPressed(): boolean {
    return this.player.checkDashInput?.() ?? false;
  }

  /**
   * Check if special ability triggered.
   * Delegates to player.checkSpecialInput() — override that for custom input.
   */
  isSpecialPressed(): boolean {
    return this.player.checkSpecialInput?.() ?? false;
  }

  // ============================================================================
  // MOVEMENT INPUT HELPER
  // ============================================================================

  /**
   * Get movement input as direction values
   * Used to feed EightWayMovement behavior
   */
  getMovementInput(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isMovingLeft()) x -= 1;
    if (this.isMovingRight()) x += 1;
    if (this.isMovingUp()) y -= 1;
    if (this.isMovingDown()) y += 1;
    return { x, y };
  }

  /**
   * Return to appropriate base state based on current input
   */
  returnToBaseState(): void {
    if (this.hasMovementInput()) {
      this.goto('walking');
    } else {
      this.goto('idle');
    }
  }

  // ============================================================================
  // IDLE STATE
  // ============================================================================

  enter_idle(): void {
    this.player.setVelocity(0, 0);
    this.player.movement.stop();
    this.player.playAnimation(this.animKeys.idle);
  }

  update_idle(): void {
    if (this.checkDeath()) return;

    // Movement
    if (this.hasMovementInput()) {
      this.goto('walking');
      return;
    }

    // Melee attack (Shift)
    if (this.isMeleePressed()) {
      this.goto('melee');
      return;
    }

    // Ranged attack (E)
    if (this.isRangedPressed() && this.player.ranged) {
      this.goto('shooting');
      return;
    }

    // Dash (Space)
    if (this.isDashPressed() && this.player.canDash()) {
      this.goto('dashing');
      return;
    }
  }

  // ============================================================================
  // WALKING STATE
  // ============================================================================

  enter_walking(): void {
    this.player.playAnimation(this.animKeys.walk);
  }

  update_walking(): void {
    if (this.checkDeath()) return;

    const input = this.getMovementInput();

    // No movement input — return to idle
    if (input.x === 0 && input.y === 0) {
      this.goto('idle');
      return;
    }

    // Feed input to movement behavior
    this.player.movement.setInput(input.x, input.y);

    // Melee attack (Shift)
    if (this.isMeleePressed()) {
      this.goto('melee');
      return;
    }

    // Ranged attack (E)
    if (this.isRangedPressed() && this.player.ranged) {
      this.goto('shooting');
      return;
    }

    // Dash (Space)
    if (this.isDashPressed() && this.player.canDash()) {
      this.goto('dashing');
      return;
    }
  }

  // ============================================================================
  // MELEE STATE
  // ============================================================================

  enter_melee(): void {
    this.player.isAttacking = true;
    this.player.movement.stop();
    this.player.setVelocity(0, 0);
    this.player.playAnimation(this.animKeys.melee);
    this.player.attackSound?.play();
    this.player.meleeComboCount++;
    this.player.currentMeleeTargets.clear();

    // Hook: notify player of melee start
    this.player.onMeleeStart?.();

    const exitMelee = () => {
      if (!this.player.isAttacking) return;
      this.player.isAttacking = false;
      this.player.currentMeleeTargets.clear();
      this.returnToBaseState();
    };

    // Exit on animation complete or after timeout
    this.player.once(`animationcomplete-${this.animKeys.melee}`, exitMelee);
    this.scene.time.delayedCall(300, exitMelee);
  }

  update_melee(): void {
    if (this.checkDeath()) return;
    // Player is rooted during melee attack
  }

  // ============================================================================
  // SHOOTING STATE
  // ============================================================================

  enter_shooting(): void {
    // Top-down: Allow movement during shooting (twin-stick shooter style).
    // Do NOT stop movement or zero velocity — player keeps moving while firing.
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

    // Allow movement during shooting (twin-stick style)
    const input = this.getMovementInput();
    if (input.x !== 0 || input.y !== 0) {
      this.player.movement.setInput(input.x, input.y);
    } else {
      this.player.movement.stop();
    }
  }

  // ============================================================================
  // DASHING STATE
  // ============================================================================

  enter_dashing(): void {
    // Stop movement input before dashing (prevents EightWayMovement from
    // fighting DashAbility velocity during behaviors.update())
    this.player.movement.stop();
    this.player.playAnimation(this.animKeys.dash);

    // Calculate dash direction from movement input, or fall back to facing direction
    const input = this.getMovementInput();
    let dirX = input.x;
    let dirY = input.y;

    // If no movement input, dash in facing direction
    if (dirX === 0 && dirY === 0) {
      switch (this.player.facingDirection) {
        case 'right':
          dirX = 1;
          break;
        case 'left':
          dirX = -1;
          break;
        case 'up':
          dirY = -1;
          break;
        case 'down':
          dirY = 1;
          break;
      }
    }

    // Execute dash via player method (handles i-frames, sound, etc.)
    this.player.performDash(dirX, dirY);
  }

  update_dashing(): void {
    if (this.checkDeath()) return;

    // Wait for dash to complete
    if (!this.player.isDashing) {
      this.returnToBaseState();
    }
  }

  // ============================================================================
  // HURTING STATE
  // ============================================================================

  enter_hurting(): void {
    // Stop movement input (but DON'T zero velocity — preserve knockback)
    this.player.movement.stop();
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

    this._deathTriggered = false;
    this.player.movement.stop();
    this.player.setVelocity(0, 0);
    this.player.playAnimation(this.animKeys.die);

    /**
     * Trigger death UI exactly once.
     * Delegates to scene.onPlayerDeath() hook if available, giving
     * subclasses control over death flow (save progress, custom UI, etc.).
     * Falls back to launching GameOverUIScene directly.
     */
    const triggerGameOver = () => {
      if (this._deathTriggered) return;
      this._deathTriggered = true;

      const scene = this.scene as any;
      if (typeof scene.onPlayerDeath === 'function') {
        scene.onPlayerDeath();
      } else {
        this.scene.scene.launch('GameOverUIScene', {
          currentLevelKey: this.scene.scene.key,
        });
      }
    };

    // Primary: Trigger on death animation complete
    this.player.once(`animationcomplete-${this.animKeys.die}`, triggerGameOver);

    // Fallback: If animation doesn't exist or never completes, trigger after 2s
    this.scene.time.delayedCall(2000, triggerGameOver);
  }
}
