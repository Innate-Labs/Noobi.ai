/**
 * Scenes - Game scene hierarchy for top-down games
 *
 * Architecture (two-layer inheritance):
 *
 *   BaseGameScene       ← shared: groups, collisions, Y-sort, input, hooks
 *     ├── BaseLevelScene  ← tilemap mode: dual tilesets, camera follow, wall collisions
 *     └── BaseArenaScene  ← arena mode: scrolling bg, screen bounds, wave spawner
 *
 * Templates:
 *   - _TemplateLevel  → copy for tilemap-based levels (dungeon, exploration)
 *   - _TemplateArena  → copy for arena/shooter levels (space shooter, survival)
 *   - UIScene         → in-game HUD (health bar, dash cooldown, pause)
 *
 * Usage (tilemap):
 *   import { BaseLevelScene, type PlayerClassMap } from './scenes';
 *   export class Level1 extends BaseLevelScene { ... }
 *
 * Usage (arena):
 *   import { BaseArenaScene } from './scenes';
 *   export class SpaceLevel extends BaseArenaScene { ... }
 */

export { BaseGameScene, type PlayerClassMap } from './BaseGameScene';
export { BaseLevelScene } from './BaseLevelScene';
export { BaseArenaScene } from './BaseArenaScene';
export { default as UIScene } from './UIScene';
