import Phaser from 'phaser';
import * as utils from '../utils';

/**
 * UI Scene - In-game HUD overlay (UNIVERSAL BASE)
 *
 * This is the CORE version with only universal features:
 * - Pause button (top-right)
 * - ESC key to pause
 *
 * Game-type modules (platformer, ui_heavy, etc.) should provide their own
 * UIScene.ts that OVERWRITES this file during scaffold, adding game-specific
 * HUD elements (health bars, controls hints, combo displays, etc.).
 *
 * If no module provides a UIScene.ts, this minimal version is used.
 */
export default class UIScene extends Phaser.Scene {
  public currentGameSceneKey: string | null;
  public uiContainer: Phaser.GameObjects.DOMElement | null;

  constructor() {
    super({
      key: 'UIScene',
    });
    this.currentGameSceneKey = null;
    this.uiContainer = null;
  }

  /**
   * Receive game scene key from level scene
   * Called when level scene launches this UI scene
   */
  init(data: { gameSceneKey?: string }): void {
    this.currentGameSceneKey = data.gameSceneKey || null;
  }

  create(): void {
    this.createDOMUI();
    this.setupPauseControls();
  }

  /**
   * Setup pause button click and ESC key listener
   */
  private setupPauseControls(): void {
    this.time.delayedCall(100, () => {
      const pauseBtn = document.getElementById('pause-btn');
      if (pauseBtn) {
        pauseBtn.addEventListener('click', () => this.pauseGame());
      }
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      this.pauseGame();
    });
  }

  /**
   * Pause the game and show pause menu
   */
  private pauseGame(): void {
    if (!this.currentGameSceneKey) return;

    const gameScene = this.scene.get(this.currentGameSceneKey);
    if (!gameScene || !this.scene.isActive(this.currentGameSceneKey)) return;

    this.scene.pause(this.currentGameSceneKey);
    this.scene.launch('PauseUIScene', {
      currentLevelKey: this.currentGameSceneKey,
    });
  }

  /**
   * Create minimal HUD - just a pause button.
   * Module-specific UIScene.ts should override this entire file
   * to add game-specific HUD elements (health bars, controls, etc.).
   */
  createDOMUI(): void {
    const uiHTML = `
      <div id="ui-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000] font-retro p-4">
        <!-- Pause Button (universal) -->
        <button id="pause-btn" class="absolute top-4 right-4 px-4 py-2 bg-gray-800 bg-opacity-80 hover:bg-blue-600 text-white text-sm rounded-lg border-2 border-gray-600 hover:border-blue-400 transition-all duration-200 pointer-events-auto cursor-pointer" style="text-shadow: 2px 2px 0 #000;">
          PAUSE
        </button>
      </div>
    `;

    this.uiContainer = utils.initUIDom(this, uiHTML);
  }

  /**
   * Update UI elements based on game state.
   * The core version does nothing - module-specific UIScene.ts adds update logic.
   */
  update(): void {
    // Module-specific UIScene.ts overrides this with game-specific update logic
    // (e.g., health bars, combo display, score updates)
  }
}
