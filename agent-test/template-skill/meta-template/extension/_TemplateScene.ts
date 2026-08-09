import { BaseGameScene } from './BaseGameScene';

/**
 * _TemplateScene — COPY this file to create a new game scene.
 *
 * Usage:
 *   1. Copy this file and rename it (e.g., Level1Scene.ts)
 *   2. Rename the class
 *   3. Implement setupWorld() and createEntities()
 *   4. Override any lifecycle hooks as needed
 *   5. Register the scene in main.ts and LevelManager.ts
 */
export class _TemplateScene extends BaseGameScene {
  constructor() {
    super({ key: '_TemplateScene' }); // <-- rename the key
  }

  protected setupWorld(): void {
    // TODO: Set up your game world here
    // - For platformer: create tilemap, set gravity
    // - For top-down: create tilemap or arena background
    // - For grid: create code-defined grid
    // - For tower defense: create path and placement grid
    // - For UI-heavy: create background panels
  }

  protected createEntities(): void {
    // TODO: Create your game entities here
    // - Player, enemies, NPCs, towers, cards, etc.
  }

  // Optional: override lifecycle hooks
  // protected onPreCreate(): void {}
  // protected onPostCreate(): void {}
  // protected onPreUpdate(time: number, delta: number): void {}
  // protected onPostUpdate(time: number, delta: number): void {}
}
