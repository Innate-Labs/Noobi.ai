import Phaser from 'phaser';
import * as utils from '../utils';

/**
 * UI Scene - In-game HUD overlay
 * This file is a STANDARD TEMPLATE
 *
 * This scene runs parallel to the game scene and displays:
 * - Player health bar
 * - Boss health bar (optional)
 * - Pause button
 * - Controls hint
 *
 * TODO for AI: Customize the following:
 * 1. createDOMUI() - Modify HTML/CSS for your game's HUD
 * 2. Controls hint text - Update to match your game's controls
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
    // Create DOM UI
    this.createDOMUI();

    // Setup pause button and ESC key
    this.setupPauseControls();
  }

  /**
   * Setup pause button click and ESC key listener
   */
  private setupPauseControls(): void {
    // Wait for DOM to be ready
    this.time.delayedCall(100, () => {
      const pauseBtn = document.getElementById('pause-btn');
      if (pauseBtn) {
        pauseBtn.addEventListener('click', () => this.pauseGame());
      }
    });

    // ESC key to pause
    this.input.keyboard?.on('keydown-ESC', () => {
      this.pauseGame();
    });
  }

  /**
   * Pause the game and show pause menu
   */
  private pauseGame(): void {
    if (!this.currentGameSceneKey) return;

    // Check if game scene is active (not already paused)
    const gameScene = this.scene.get(this.currentGameSceneKey);
    if (!gameScene || !this.scene.isActive(this.currentGameSceneKey)) return;

    // Pause the game scene
    this.scene.pause(this.currentGameSceneKey);

    // Launch pause UI
    this.scene.launch('PauseUIScene', {
      currentLevelKey: this.currentGameSceneKey,
    });
  }

  /**
   * Create HUD elements:
   * - Player health bar
   * - Boss health bar (optional)
   * - Pause button
   * - Controls hint
   *
   * TODO: Customize controls hint for your game
   */
  createDOMUI(): void {
    const uiHTML = `
      <div id="ui-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000] font-retro p-4">
        <!-- Player Health Bar -->
        <div id="player-health-container" class="absolute top-4 left-4 w-64">
          <div class="flex items-center justify-between mb-1">
            <div id="player-name" class="text-white text-sm" style="text-shadow: 2px 2px 0px #000000;">PLAYER</div>
            <span id="health-text" class="text-white text-xs" style="text-shadow: 1px 1px 0 #000; font-family: monospace;"></span>
          </div>
          <div class="game-pixel-container-slot-gray-700 p-1 relative h-6">
            <div id="player-health-fill" class="game-pixel-container-progress-fill-green-500 h-full transition-all duration-300" style="width: 100%;"></div>
          </div>
          <!-- Ultimate Skill Cooldown -->
          <div class="mt-1 flex items-center gap-2">
            <span class="text-yellow-400 text-xs" style="text-shadow: 1px 1px 0 #000;">Q</span>
            <div class="game-pixel-container-slot-gray-700 p-0.5 relative h-3 flex-1">
              <div id="ultimate-fill" class="h-full transition-all duration-200" style="width: 100%; background: linear-gradient(90deg, #7c3aed, #a78bfa);"></div>
            </div>
            <span id="ultimate-label" class="text-xs" style="color: #a78bfa; text-shadow: 1px 1px 0 #000; min-width: 40px; text-align: right;">READY</span>
          </div>
        </div>

        <!-- Boss Health Bar (hidden by default) -->
        <div id="boss-health-container" class="absolute top-4 left-1/2 transform -translate-x-1/2 w-96 hidden">
          <div id="boss-name" class="text-red-400 text-sm mb-1 text-center" style="text-shadow: 2px 2px 0px #000000;">BOSS</div>
          <div class="game-pixel-container-slot-gray-700 p-1 relative h-8">
            <div id="boss-health-fill" class="game-pixel-container-progress-fill-red-500 h-full transition-all duration-300" style="width: 100%;"></div>
          </div>
        </div>

        <!-- Pause Button -->
        <button id="pause-btn" class="absolute top-4 right-4 px-4 py-2 bg-gray-800 bg-opacity-80 hover:bg-blue-600 text-white text-sm rounded-lg border-2 border-gray-600 hover:border-blue-400 transition-all duration-200 pointer-events-auto cursor-pointer" style="text-shadow: 2px 2px 0 #000;">
          PAUSE
        </button>

        <!-- Controls Hint - TODO: Customize for your game's actual controls -->
        <div id="controls-hint" class="absolute top-16 right-4 text-right text-white text-xs leading-relaxed" style="text-shadow: 1px 1px 0 #000;">
          <div class="text-yellow-400 mb-1">CONTROLS</div>
          <!-- TODO: Update these to match your game's controls -->
          <div>A/D: Move Left/Right</div>
          <div>W/Space: Jump</div>
          <div>SHIFT: Attack (Combo)</div>
          <div>Q: Ultimate Skill</div>
          <div>ESC: Pause</div>
        </div>
      </div>
    `;

    // Add DOM element to scene - MUST use utils.initUIDom
    this.uiContainer = utils.initUIDom(this, uiHTML);

    // Set player name from character selection registry
    this.time.delayedCall(50, () => {
      const selectedCharacter = this.registry.get('selectedCharacter') as
        | string
        | undefined;
      const playerNameEl = document.getElementById('player-name');
      if (playerNameEl && selectedCharacter) {
        playerNameEl.textContent = selectedCharacter.toUpperCase();
      }
    });
  }

  /**
   * Update UI elements based on game state
   * Called every frame
   */
  update(): void {
    if (!this.currentGameSceneKey) return;

    // Get reference to the game scene
    const gameScene = this.scene.get(this.currentGameSceneKey) as any;
    if (!gameScene || !gameScene.player) return;

    // Update player health bar
    this.updatePlayerHealthBar(gameScene);

    // Update boss health bar if boss exists
    this.updateBossHealthBar(gameScene);

    // Update ultimate skill cooldown display
    this.updateUltimateCooldown(gameScene);
  }

  /**
   * Update player health bar display
   */
  private updatePlayerHealthBar(gameScene: any): void {
    const playerHealthFill = document.getElementById('player-health-fill');
    if (!playerHealthFill) return;

    const healthPercent = gameScene.player.getHealthPercentage?.() ?? 100;
    playerHealthFill.style.width = `${healthPercent}%`;

    // Change color based on health level
    playerHealthFill.className = 'h-full transition-all duration-300 ';
    if (healthPercent <= 25) {
      playerHealthFill.className +=
        'game-pixel-container-progress-fill-red-500';
    } else if (healthPercent <= 50) {
      playerHealthFill.className +=
        'game-pixel-container-progress-fill-yellow-500';
    } else {
      playerHealthFill.className +=
        'game-pixel-container-progress-fill-green-500';
    }

    // HP text (e.g. "75/100")
    const healthText = document.getElementById('health-text');
    if (healthText) {
      const current = gameScene.player.health ?? 0;
      const max = gameScene.player.maxHealth ?? current;
      healthText.textContent = `${Math.round(current)}/${Math.round(max)}`;
    }
  }

  /**
   * Update boss health bar display (if boss exists in scene)
   */
  private updateBossHealthBar(gameScene: any): void {
    const bossHealthContainer = document.getElementById(
      'boss-health-container',
    );
    const bossHealthFill = document.getElementById('boss-health-fill');
    const bossNameEl = document.getElementById('boss-name');

    // Check if boss exists in the game scene
    if (gameScene.boss && bossHealthContainer && bossHealthFill) {
      bossHealthContainer.classList.remove('hidden');
      const bossHealthPercent = gameScene.boss.getHealthPercentage?.() ?? 100;
      bossHealthFill.style.width = `${bossHealthPercent}%`;

      if (bossNameEl && gameScene.boss.displayName) {
        bossNameEl.textContent = gameScene.boss.displayName;
      }
    } else if (bossHealthContainer) {
      bossHealthContainer.classList.add('hidden');
    }
  }

  /**
   * Update ultimate skill cooldown bar and label.
   * Uses player.ultimate.getCooldownProgress() (0→1) and
   * player.ultimate.getCooldownRemaining() (ms remaining).
   */
  private updateUltimateCooldown(gameScene: any): void {
    const ultimateFill = document.getElementById('ultimate-fill');
    const ultimateLabel = document.getElementById('ultimate-label');
    if (!ultimateFill || !ultimateLabel) return;

    const player = gameScene.player;

    if (
      player.ultimate &&
      typeof player.ultimate.getCooldownProgress === 'function'
    ) {
      const pct = player.ultimate.getCooldownProgress();
      const remaining = player.ultimate.getCooldownRemaining?.() ?? 0;
      ultimateFill.style.width = `${pct * 100}%`;

      if (pct >= 1) {
        ultimateLabel.textContent = 'READY';
        ultimateLabel.style.color = '#a78bfa';
      } else {
        const secs = (remaining / 1000).toFixed(1);
        ultimateLabel.textContent = `${secs}s`;
        ultimateLabel.style.color = '#666';
      }
    } else {
      ultimateFill.style.width = '100%';
      ultimateLabel.textContent = 'READY';
    }
  }
}
