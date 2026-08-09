import Phaser from 'phaser';
import * as utils from '../utils.js';
import { LevelManager } from '../LevelManager.js';

/**
 * Game Over UI Scene - Death/Failure Screen
 * This file is a STANDARD TEMPLATE
 *
 * Displayed when player dies or fails the level.
 * Restarts current level on Enter/Space/Click.
 *
 * CALLER CONTRACT (when launching this scene):
 *   this.scene.launch('GameOverUIScene', { currentLevelKey: this.scene.key });
 *   OR: { gameSceneKey: this.scene.key }  (both accepted)
 *
 * Fallback: LevelManager.getFirstLevelScene() when no key passed.
 * Requires: LevelManager.LEVEL_ORDER populated, TitleScreen registered.
 *
 * TODO for AI: Customize createDOMUI() to match game theme
 */
export class GameOverUIScene extends Phaser.Scene {
  private currentLevelKey: string | null;
  private isRestarting: boolean;
  private uiContainer: Phaser.GameObjects.DOMElement | null;
  private enterKey?: Phaser.Input.Keyboard.Key;
  private spaceKey?: Phaser.Input.Keyboard.Key;

  constructor() {
    super({
      key: 'GameOverUIScene',
    });
    this.currentLevelKey = null;
    this.isRestarting = false;
    this.uiContainer = null;
  }

  /**
   * Receive game scene key from caller.
   * Accepts currentLevelKey or gameSceneKey (callers may use either).
   * Fallback: LevelManager.getFirstLevelScene() for robustness.
   */
  init(data?: { currentLevelKey?: string; gameSceneKey?: string }): void {
    this.currentLevelKey =
      data?.currentLevelKey ??
      data?.gameSceneKey ??
      LevelManager.getFirstLevelScene();
    this.isRestarting = false;
  }

  create(): void {
    // Create DOM UI
    this.createDOMUI();
    // Setup input controls
    this.setupInputs();
  }

  /**
   * TODO: Customize the game over screen appearance
   * Keep the overall structure but modify:
   * - Colors and styles (typically red/dark theme)
   * - Animations
   * - Text content
   */
  createDOMUI(): void {
    const uiHTML = `
      <div id="game-over-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000] font-retro flex flex-col justify-center items-center" style="background-color: rgba(51, 0, 0, 0.8);">
        <!-- Main Content Container -->
        <div class="flex flex-col items-center justify-center gap-16 p-8 text-center pointer-events-auto">
          
          <!-- Game Over Title -->
          <div id="game-over-title" class="text-red-500 font-bold pointer-events-none" style="
            font-size: clamp(56px, 8rem, 80px);
            text-shadow: 4px 4px 0px #000000;
            animation: dangerBlink 0.5s ease-in-out infinite alternate;
          ">GAME OVER</div>

          <!-- Failure Text -->
          <div id="failure-text" class="text-white font-bold pointer-events-none" style="
            font-size: clamp(24px, 3rem, 36px);
            text-shadow: 2px 2px 0px #000000;
            line-height: 1.4;
          ">Better luck next time!</div>

          <!-- Press Enter Text -->
          <div id="press-enter-text" class="text-yellow-400 font-bold pointer-events-none animate-pulse" style="
            font-size: clamp(24px, 3rem, 36px);
            text-shadow: 3px 3px 0px #000000;
            animation: blink 0.8s ease-in-out infinite alternate;
          ">PRESS ENTER TO RESTART</div>

        </div>

        <!-- Custom Animations -->
        <style>
          @keyframes dangerBlink {
            from { 
              opacity: 0.5; 
              filter: brightness(1);
            }
            to { 
              opacity: 1; 
              filter: brightness(1.2);
            }
          }
          
          @keyframes blink {
            from { opacity: 0.3; }
            to { opacity: 1; }
          }
        </style>
      </div>
    `;

    // Add DOM element to scene - MUST use utils.initUIDom
    this.uiContainer = utils.initUIDom(this, uiHTML);
  }

  /**
   * Standard input setup - pointer always works; keyboard if available
   */
  setupInputs(): void {
    this.input.off('pointerdown');
    this.input.on('pointerdown', () => this.restartGame());

    if (this.input.keyboard) {
      this.enterKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.ENTER,
      );
      this.spaceKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SPACE,
      );
      this.enterKey.on('down', () => this.restartGame());
      this.spaceKey.on('down', () => this.restartGame());
    }
  }

  /**
   * Restart current level - robust against missing/invalid scene key.
   * Stops BGM (backgroundMusic or bgm) before restart.
   */
  restartGame(): void {
    if (this.isRestarting) return;
    this.isRestarting = true;

    let keyToRestart =
      this.currentLevelKey ?? LevelManager.getFirstLevelScene();
    if (!keyToRestart) {
      this.safeReturnToTitleOrFirstLevel();
      return;
    }

    const sceneExists = !!this.scene.get(keyToRestart);
    if (!sceneExists) {
      const fallback = LevelManager.getFirstLevelScene();
      if (fallback && this.scene.get(fallback)) {
        keyToRestart = fallback;
      } else {
        this.safeReturnToTitleOrFirstLevel();
        return;
      }
    }

    this.stopBgmAndCleanup(keyToRestart);
    this.scene.stop('UIScene');
    this.scene.stop(keyToRestart);
    this.scene.start(keyToRestart);
  }

  /** Stop BGM (supports both backgroundMusic and bgm property names) */
  private stopBgmAndCleanup(sceneKey: string): void {
    const scene = this.scene.get(sceneKey) as
      | Record<string, unknown>
      | undefined;
    const bgm = scene?.backgroundMusic ?? scene?.bgm;
    if (bgm && typeof (bgm as { stop?: () => void }).stop === 'function') {
      (bgm as { stop: () => void }).stop();
    }
    this.input.off('pointerdown');
    if (this.enterKey) this.enterKey.off('down');
    if (this.spaceKey) this.spaceKey.off('down');
  }

  /** Fallback when no valid level to restart - go to TitleScreen or first level */
  private safeReturnToTitleOrFirstLevel(): void {
    const firstLevel = LevelManager.getFirstLevelScene();
    const target = this.scene.get('TitleScreen')
      ? 'TitleScreen'
      : firstLevel && this.scene.get(firstLevel)
        ? firstLevel
        : null;
    if (!target) {
      console.error(
        'GameOverUIScene: No TitleScreen or level scene found. Cannot restart.',
      );
      this.isRestarting = false;
      return;
    }
    this.input.off('pointerdown');
    if (this.enterKey) this.enterKey.off('down');
    if (this.spaceKey) this.spaceKey.off('down');
    this.scene.stop('UIScene');
    this.scene.stop('GameOverUIScene');
    this.scene.start(target);
  }

  update(): void {
    // Game Over UI scene doesn't need special update logic
  }
}
