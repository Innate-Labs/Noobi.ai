import Phaser from 'phaser';

/**
 * BaseGameScene — Meta Template M0 Extension
 *
 * Minimal, game-agnostic scene base class.
 * Provides the Template Method skeleton and lifecycle hooks shared by
 * ALL specialized template families (platformer, top_down, grid_logic,
 * tower_defense, ui_heavy) without assuming any physics regime, entity
 * model, or gameplay mechanic.
 *
 * Specialized families extend this with physics-specific world setup,
 * entity management, and domain hooks.
 */
export abstract class BaseGameScene extends Phaser.Scene {
  /** Prevents duplicate completion triggers */
  public gameCompleted: boolean = false;

  // ---------------------------------------------------------------------------
  // Abstract methods — subclasses MUST implement
  // ---------------------------------------------------------------------------

  /** Set up the game world (tilemap, grid, arena, UI panels, etc.) */
  protected abstract setupWorld(): void;

  /** Create all game entities (player, enemies, towers, cards, etc.) */
  protected abstract createEntities(): void;

  // ---------------------------------------------------------------------------
  // Lifecycle hooks — subclasses CAN override (no-op by default)
  // ---------------------------------------------------------------------------

  /** Called before any creation logic runs */
  protected onPreCreate(): void {}

  /** Called after all creation logic completes */
  protected onPostCreate(): void {}

  /** Called at the start of every update frame */
  protected onPreUpdate(_time: number, _delta: number): void {}

  /** Called at the end of every update frame */
  protected onPostUpdate(_time: number, _delta: number): void {}

  // ---------------------------------------------------------------------------
  // Template Method — fixed skeleton
  // ---------------------------------------------------------------------------

  public create(): void {
    this.gameCompleted = false;
    this.onPreCreate();
    this.setupWorld();
    this.createEntities();
    this.scene.launch('UIScene', { gameSceneKey: this.scene.key });
    this.onPostCreate();
  }

  public update(time: number, delta: number): void {
    if (this.gameCompleted) return;
    this.onPreUpdate(time, delta);
    this.onPostUpdate(time, delta);
  }

  // ---------------------------------------------------------------------------
  // Shared utilities
  // ---------------------------------------------------------------------------

  /** Mark the level as complete and transition to victory */
  protected onLevelComplete(): void {
    if (this.gameCompleted) return;
    this.gameCompleted = true;
    this.scene.stop('UIScene');
    this.scene.launch('VictoryUIScene', { gameSceneKey: this.scene.key });
  }

  /** Mark the level as failed and transition to game-over */
  protected onGameOver(): void {
    if (this.gameCompleted) return;
    this.gameCompleted = true;
    this.scene.stop('UIScene');
    this.scene.launch('GameOverUIScene', { currentLevelKey: this.scene.key });
  }
}
