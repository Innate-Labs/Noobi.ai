import Phaser from 'phaser';
import * as utils from '../utils';

/**
 * Pause UI Scene - STANDARD TEMPLATE
 *
 * Displays when game is paused (ESC key or pause button).
 * Provides options to resume game or return to menu.
 *
 * Features:
 * - Semi-transparent overlay
 * - Resume game button
 * - Back to menu button
 * - Keyboard shortcuts (ESC/Space/Enter to resume)
 */
export class PauseUIScene extends Phaser.Scene {
  private currentLevelKey: string = 'Level1Scene';
  private uiContainer: Phaser.GameObjects.DOMElement | null = null;

  constructor() {
    super({ key: 'PauseUIScene' });
  }

  init(data: { currentLevelKey?: string }): void {
    this.currentLevelKey = data.currentLevelKey || 'Level1Scene';
  }

  create(): void {
    this.createPauseUI();
    this.setupInputs();
  }

  /**
   * Create the pause menu UI using DOM elements
   */
  private createPauseUI(): void {
    // IMPORTANT: pointer-events-auto is required for buttons to be clickable
    const pauseHTML = `
      <div id="pause-overlay" class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[2000] font-retro pointer-events-auto">
        <div class="bg-gray-900 bg-opacity-95 rounded-xl p-8 border-4 border-blue-500 shadow-2xl text-center min-w-[320px]">
          <!-- Title -->
          <h2 class="text-4xl text-white mb-8" style="text-shadow: 0 0 10px #4a90e2, 2px 2px 0 #000;">
            GAME PAUSED
          </h2>
          
          <!-- Buttons -->
          <div class="space-y-4">
            <button id="resume-btn" class="w-full py-3 px-6 bg-gray-700 hover:bg-blue-600 text-white text-xl rounded-lg border-2 border-gray-600 hover:border-blue-400 transition-all duration-200 transform hover:scale-105 cursor-pointer pointer-events-auto" style="text-shadow: 2px 2px 0 #000;">
              CONTINUE GAME
            </button>
            
            <button id="menu-btn" class="w-full py-3 px-6 bg-gray-700 hover:bg-red-600 text-white text-xl rounded-lg border-2 border-gray-600 hover:border-red-400 transition-all duration-200 transform hover:scale-105 cursor-pointer pointer-events-auto" style="text-shadow: 2px 2px 0 #000;">
              BACK TO MENU
            </button>
          </div>
          
          <!-- Hint -->
          <p class="text-gray-400 text-sm mt-6" style="text-shadow: 1px 1px 0 #000;">
            Press ESC or SPACE to resume
          </p>
        </div>
      </div>
    `;

    this.uiContainer = utils.initUIDom(this, pauseHTML);

    // Add button event listeners
    this.time.delayedCall(100, () => {
      const resumeBtn = document.getElementById('resume-btn');
      const menuBtn = document.getElementById('menu-btn');

      if (resumeBtn) {
        resumeBtn.addEventListener('click', () => this.resumeGame());
      }
      if (menuBtn) {
        menuBtn.addEventListener('click', () => this.backToMenu());
      }
    });
  }

  /**
   * Set up keyboard inputs for pause menu
   */
  private setupInputs(): void {
    // ESC key to resume
    this.input.keyboard?.on('keydown-ESC', () => {
      this.resumeGame();
    });

    // Space key to resume
    this.input.keyboard?.on('keydown-SPACE', () => {
      this.resumeGame();
    });

    // Enter key to resume
    this.input.keyboard?.on('keydown-ENTER', () => {
      this.resumeGame();
    });
  }

  /**
   * Resume the game
   */
  private resumeGame(): void {
    // Resume the level scene
    this.scene.resume(this.currentLevelKey);

    // Stop this pause scene
    this.scene.stop();
  }

  /**
   * Return to main menu
   */
  private backToMenu(): void {
    // Stop the level scene
    this.scene.stop(this.currentLevelKey);

    // Stop the UI scene
    this.scene.stop('UIScene');

    // Stop all sounds
    this.sound.stopAll();

    // Stop this pause scene
    this.scene.stop();

    // Go to title screen
    this.scene.start('TitleScreen');
  }
}
