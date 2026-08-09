import Phaser from 'phaser';
import * as utils from '../utils';

/**
 * Game Complete UI Scene - All Levels Completed Screen
 * This file is a STANDARD TEMPLATE
 *
 * Displayed when player completes the final level
 * Returns to title screen on Enter/Space/Click
 *
 * TODO for AI: Customize createDOMUI() to match game theme
 */
export class GameCompleteUIScene extends Phaser.Scene {
  private currentLevelKey: string | null;
  private isTransitioning: boolean;
  private uiContainer: Phaser.GameObjects.DOMElement | null;
  private enterKey?: Phaser.Input.Keyboard.Key;
  private spaceKey?: Phaser.Input.Keyboard.Key;

  constructor() {
    super({
      key: 'GameCompleteUIScene',
    });
    this.currentLevelKey = null;
    this.isTransitioning = false;
    this.uiContainer = null;
  }

  /**
   * Receive current level key from game scene
   */
  init(data: { currentLevelKey?: string }) {
    this.currentLevelKey = data.currentLevelKey || 'Level1Scene';
    // Reset transition flag
    this.isTransitioning = false;
  }

  create(): void {
    // Create DOM UI
    this.createDOMUI();
    // Setup input controls
    this.setupInputs();
  }

  /**
   * TODO: Customize the game complete screen appearance
   * This is the celebration screen for completing the entire game!
   * Keep the overall structure but modify:
   * - Colors and styles (typically celebratory/golden theme)
   * - Animations (more elaborate than regular victory)
   * - Text content
   */
  createDOMUI(): void {
    const uiHTML = `
      <div id="game-complete-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000] font-retro flex flex-col justify-center items-center bg-black bg-opacity-70">
        <!-- Main Content Container -->
        <div class="flex flex-col items-center justify-center gap-16 p-8 text-center pointer-events-auto">
          
          <!-- Game Complete Title -->
          <div id="game-complete-title" class="text-yellow-400 font-bold pointer-events-none animate-pulse" style="
            font-size: clamp(48px, 6rem, 72px);
            text-shadow: 4px 4px 0px #000000;
            animation: glow 1.2s ease-in-out infinite alternate;
          ">GAME COMPLETE!</div>

          <!-- Congratulations Text -->
          <div id="congratulations-text" class="text-white font-bold pointer-events-none" style="
            font-size: clamp(24px, 3rem, 36px);
            text-shadow: 2px 2px 0px #000000;
            line-height: 1.4;
          ">
            Congratulations!<br>
            You have completed all levels!
          </div>

          <!-- Press Enter Text -->
          <div id="press-enter-text" class="text-green-400 font-bold pointer-events-none animate-pulse" style="
            font-size: clamp(20px, 2.5rem, 32px);
            text-shadow: 3px 3px 0px #000000;
            animation: blink 0.8s ease-in-out infinite alternate;
          ">PRESS ENTER TO RETURN TO MENU</div>

        </div>

        <!-- Custom Animations -->
        <style>
          @keyframes glow {
            from { transform: scale(1); }
            to { transform: scale(1.15); }
          }
          
          @keyframes blink {
            from { opacity: 0.3; }
            to { opacity: 1; }
          }
          
          @keyframes rainbow {
            0% { color: #ff0000; }
            16% { color: #ff8000; }
            33% { color: #ffff00; }
            50% { color: #00ff00; }
            66% { color: #00ffff; }
            83% { color: #8000ff; }
            100% { color: #ff0000; }
          }
          
          #congratulations-text {
            animation: rainbow 3s linear infinite;
          }
          
          /* Mobile Responsive */
          @media (max-width: 768px) {
            #game-complete-container > div {
              gap: 1.5rem !important;
              padding: 1.5rem !important;
            }
          }
          
          @media (max-height: 600px) {
            #game-complete-container > div {
              gap: 1rem !important;
              padding: 1rem !important;
            }
          }
        </style>
      </div>
    `;

    // Add DOM element to scene - MUST use utils.initUIDom
    this.uiContainer = utils.initUIDom(this, uiHTML);
  }

  /**
   * Standard input setup - DO NOT MODIFY
   */
  setupInputs(): void {
    // Clear previous event listeners
    this.input.off('pointerdown');

    // Create keyboard input
    this.enterKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    );
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    // Listen for mouse click events
    this.input.on('pointerdown', () => this.returnToMenu());

    // Listen for key events
    this.enterKey.on('down', () => this.returnToMenu());
    this.spaceKey.on('down', () => this.returnToMenu());
  }

  /**
   * Return to title screen - DO NOT MODIFY structure
   */
  returnToMenu(): void {
    // Prevent multiple triggers
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    console.log('Returning to title screen');

    // Stop current level's background music
    const currentScene = this.scene.get(this.currentLevelKey!) as any;
    if (currentScene?.backgroundMusic) {
      currentScene.backgroundMusic.stop();
    }

    // Clear event listeners
    this.input.off('pointerdown');
    if (this.enterKey) {
      this.enterKey.off('down');
    }
    if (this.spaceKey) {
      this.spaceKey.off('down');
    }

    // Stop all game-related scenes
    this.scene.stop('UIScene');
    this.scene.stop(this.currentLevelKey!);

    // Start title screen
    this.scene.start('TitleScreen');
  }

  update(): void {
    // Game Complete UI scene doesn't need special update logic
  }
}
