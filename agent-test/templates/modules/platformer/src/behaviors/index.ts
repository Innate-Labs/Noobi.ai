/**
 * Behaviors - Reusable behavior components for platformer games
 *
 * Behaviors follow the Component pattern - entities are composed of behaviors
 * rather than inheriting from complex class hierarchies.
 *
 * Available behaviors:
 * - PlatformerMovement: Horizontal movement and jumping
 * - MeleeAttack: Close-range combat
 * - RangedAttack: Projectile-based combat
 * - PatrolAI: Walk back and forth
 * - ChaseAI: Follow a target
 * - SkillBehavior: Base class for special skills with cooldown
 *   - DashAttackSkill: Linear dash with collision
 *   - AreaDamageSkill: AOE damage around player
 *   - TargetedExecutionSkill: Lock-on instant kill
 *   - TargetedAOESkill: Lock-on with AOE at target
 *   - BeamAttackSkill: Horizontal beam attack
 *   - GroundQuakeSkill: Ground slam (grounded enemies only)
 *   - BoomerangSkill: Returning projectile (hammer, shuriken)
 *   - MultishotSkill: Spread-fire multiple projectiles
 *   - ArcProjectileSkill: Gravity arc projectile (boulder, grenade)
 *
 * Usage:
 *   import { BehaviorManager, PlatformerMovement } from './behaviors';
 *
 *   // In entity constructor:
 *   this.behaviors = new BehaviorManager(this);
 *   this.movement = this.behaviors.add('movement', new PlatformerMovement({
 *     walkSpeed: 200,
 *     jumpPower: 600,
 *   }));
 *
 *   // In entity update:
 *   this.behaviors.update();
 */

// Core
export { type IBehavior, BaseBehavior } from './IBehavior';
export { BehaviorManager } from './BehaviorManager';

// Movement
export {
  PlatformerMovement,
  type PlatformerMovementConfig,
} from './PlatformerMovement';

// Combat
export { MeleeAttack, type MeleeAttackConfig } from './MeleeAttack';
export { RangedAttack, type RangedAttackConfig } from './RangedAttack';

// Skills
export {
  SkillBehavior,
  DashAttackSkill,
  AreaDamageSkill,
  TargetedExecutionSkill,
  TargetedAOESkill,
  BeamAttackSkill,
  GroundQuakeSkill,
  BoomerangSkill,
  MultishotSkill,
  ArcProjectileSkill,
  type SkillConfig,
  type SkillContext,
  type DashAttackConfig,
  type AreaDamageConfig,
  type TargetedExecutionConfig,
  type TargetedAOEConfig,
  type BeamAttackConfig,
  type GroundQuakeConfig,
  type BoomerangConfig,
  type MultishotConfig,
  type ArcProjectileConfig,
} from './SkillBehavior';

// Screen Effects
export {
  ScreenEffectHelper,
  type ShakeConfig,
  type TrailConfig,
  type ExplosionConfig,
  type VortexConfig,
} from './ScreenEffectHelper';

// AI
export { PatrolAI, type PatrolAIConfig } from './PatrolAI';
export { ChaseAI, type ChaseAIConfig } from './ChaseAI';
