import Phaser from 'phaser';
import * as utils from '../utils';

/**
 * UI Scene - In-game HUD overlay (Top-Down)
 *
 * This is the top-down module's UIScene with game-specific HUD elements:
 * - Health bar
 * - Dash cooldown indicator
 * - Pause button + ESC key
 *
 * This file OVERWRITES the core UIScene.ts during scaffold.
 * It extends the core version with top-down specific UI elements.
 *
 * HOOK POINTS for customization:
 * Override createDOMUI() in your _TemplateLevel subclass's onPostCreate
 * to customize the HUD, or override this entire file.
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
   * Create the HUD with health bar, dash cooldown, and pause button
   */
  createDOMUI(): void {
    const uiHTML = `
      <div id="ui-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000] font-retro p-4">
        <!-- Top-left: Health Bar -->
        <div class="absolute top-4 left-4 flex flex-col gap-2">
          <!-- Health Bar -->
          <div class="flex items-center gap-2">
            <span class="text-red-400 text-xs" style="text-shadow: 1px 1px 0 #000;">HP</span>
            <div class="w-40 h-4 bg-gray-800 bg-opacity-80 rounded border border-gray-600 overflow-hidden">
              <div id="health-bar" class="h-full bg-red-500 transition-all duration-300" style="width: 100%;"></div>
            </div>
            <span id="health-text" class="text-white text-xs" style="text-shadow: 1px 1px 0 #000;">100%</span>
          </div>

          <!-- Dash Cooldown -->
          <div class="flex items-center gap-2">
            <span class="text-cyan-400 text-xs" style="text-shadow: 1px 1px 0 #000;">DASH</span>
            <div class="w-24 h-3 bg-gray-800 bg-opacity-80 rounded border border-gray-600 overflow-hidden">
              <div id="dash-bar" class="h-full bg-cyan-400 transition-all duration-100" style="width: 100%;"></div>
            </div>
          </div>
        </div>

        <!-- Top-right: Pause Button -->
        <button id="pause-btn" class="absolute top-4 right-4 px-4 py-2 bg-gray-800 bg-opacity-80 hover:bg-blue-600 text-white text-sm rounded-lg border-2 border-gray-600 hover:border-blue-400 transition-all duration-200 pointer-events-auto cursor-pointer" style="text-shadow: 2px 2px 0 #000;">
          PAUSE
        </button>

        <!-- Bottom-left: Controls Hint -->
        <div class="absolute bottom-4 left-4 text-gray-400 text-xs opacity-70" style="text-shadow: 1px 1px 0 #000;">
          WASD: Move | Shift: Melee | E: Shoot | Space: Dash | ESC: Pause
        </div>
      </div>
    `;

    this.uiContainer = utils.initUIDom(this, uiHTML);
  }

  /**
   * Update UI elements based on game state
   */
  update(): void {
    if (!this.currentGameSceneKey) return;

    const gameScene = this.scene.get(this.currentGameSceneKey) as any;
    if (!gameScene?.player) return;

    const player = gameScene.player;

    // Update health bar
    const healthBar = document.getElementById('health-bar');
    const healthText = document.getElementById('health-text');
    if (healthBar && player.getHealthPercentage) {
      const pct = Math.max(0, player.getHealthPercentage());
      healthBar.style.width = `${pct}%`;

      // Color transitions
      if (pct <= 25) {
        healthBar.className = 'h-full bg-red-700 transition-all duration-300';
      } else if (pct <= 50) {
        healthBar.className =
          'h-full bg-yellow-500 transition-all duration-300';
      } else {
        healthBar.className = 'h-full bg-red-500 transition-all duration-300';
      }
    }
    if (
      healthText &&
      player.health !== undefined &&
      player.maxHealth !== undefined
    ) {
      healthText.textContent = `${Math.max(0, Math.ceil(player.health))}/${player.maxHealth}`;
    }

    // Update dash cooldown bar
    const dashBar = document.getElementById('dash-bar');
    if (dashBar && player.getDashCooldownProgress) {
      const progress = player.getDashCooldownProgress();
      dashBar.style.width = `${progress * 100}%`;

      if (progress >= 1) {
        dashBar.className = 'h-full bg-cyan-400 transition-all duration-100';
      } else {
        dashBar.className = 'h-full bg-gray-500 transition-all duration-100';
      }
    }
  }
}
