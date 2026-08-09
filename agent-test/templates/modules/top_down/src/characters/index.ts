/**
 * Characters - Player and Enemy base classes for top-down games
 *
 * Architecture:
 * - BasePlayer: Abstract foundation for player characters (8-way movement, mouse aim, dash)
 * - BaseEnemy: Abstract foundation for enemy characters (2D AI, 4-direction facing)
 * - PlayerFSM: Finite state machine for player states
 * - _TemplatePlayer: Copy-and-modify template for new player classes
 * - _TemplateEnemy: Copy-and-modify template for new enemy classes
 *
 * Usage:
 *   import { BasePlayer, type PlayerConfig } from './characters';
 *
 *   export class Player extends BasePlayer {
 *     constructor(scene, x, y) {
 *       super(scene, x, y, { ... });
 *     }
 *   }
 */

// Player
export { BasePlayer, type PlayerConfig } from './BasePlayer';
export {
  PlayerFSM,
  type PlayerAnimKeys,
  DEFAULT_PLAYER_ANIM_KEYS,
} from './PlayerFSM';

// Enemy
export { BaseEnemy, type EnemyConfig, type EnemyAIType } from './BaseEnemy';
