import Phaser from 'phaser';
import { LevelManager } from '../LevelManager.js';
import * as utils from '../utils.js';

/**
 * Title Screen Scene - Game start screen
 * This file is a STANDARD TEMPLATE
 *
 * TODO for AI: Customize the following:
 * 1. createDOMUI() - Modify the HTML/CSS to match game theme
 * 2. initializeSounds() - Change background music key to your game's music
 * 3. startGame() - Change UI click sound key if needed
 */
export class TitleScreen extends Phaser.Scene {
  // UI elements
  public uiContainer!: Phaser.GameObjects.DOMElement;

  // Input controls - HTML event handlers
  public keydownHandler?: (event: KeyboardEvent) => void;
  public clickHandler?: (event: Event) => void;

  // Audio
  public backgroundMusic!: Phaser.Sound.BaseSound;

  // State flags
  public isStarting: boolean = false;

  constructor() {
    super({
      key: 'TitleScreen',
    });
    this.isStarting = false;
  }

  init(): void {
    // Reset start flag
    this.isStarting = false;
  }

  create(): void {
    // Initialize sounds first
    this.initializeSounds();

    // Create background image (Phaser layer, behind DOM)
    this.createBackground();

    // Create DOM UI (text overlay on top of background)
    this.createDOMUI();

    // Set up input controls
    this.setupInputs();

    // Play background music
    this.playBackgroundMusic();

    // Listen for scene shutdown to cleanup event listeners
    this.events.once('shutdown', () => {
      this.cleanupEventListeners();
    });
  }

  /**
   * Create the title screen background using a Phaser image.
   * Shows the background art with a semi-transparent dark overlay for text contrast.
   * Falls back to a solid dark color if the texture is not available.
   * TODO: Change 'title_bg' to your actual background asset key.
   */
  createBackground(): void {
    const cam = this.cameras.main;

    // TODO: Replace 'title_bg' with your actual background asset key
    const bgKey = 'title_bg';
    if (this.textures.exists(bgKey)) {
      const bg = this.add.image(cam.width / 2, cam.height / 2, bgKey);
      bg.setDisplaySize(cam.width, cam.height);
      bg.setDepth(0);
      // Light semi-transparent overlay so background art remains visible
      const overlay = this.add.rectangle(
        cam.width / 2,
        cam.height / 2,
        cam.width,
        cam.height,
        0x000000,
        0.3,
      );
      overlay.setDepth(1);
    } else {
      // Fallback: solid dark background when no title_bg asset is available
      this.add
        .rectangle(
          cam.width / 2,
          cam.height / 2,
          cam.width,
          cam.height,
          0x1a1a2e,
          1,
        )
        .setDepth(0);
    }
  }

  /**
   * TODO: Customize this method to match your game's visual theme
   * - Change background image/color
   * - Change game title image or text
   * - Modify animations and styles
   */
  createDOMUI(): void {
    const uiHTML = `
      <div id="title-screen-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000] font-retro flex flex-col justify-between items-center" style="image-rendering: pixelated; background-color: transparent;">
        
        <!-- Main Content Container -->
        <div class="flex flex-col items-center space-y-10 justify-between pt-12 pb-20 w-full text-center pointer-events-auto h-full relative z-10">
          
          <!-- Game Title Container -->
          <div id="game-title-container" class="flex-shrink-0 flex items-center justify-center">
            <!-- TODO-TITLE: Replace "GAME TITLE" with your game's name from the GDD -->
            <div class="text-white text-6xl font-bold" style="text-shadow: 4px 4px 0px #000000;">
              GAME TITLE
            </div>
          </div>

          <!-- Spacer -->
          <div class="flex-grow"></div>

          <!-- Press Enter Text -->
          <div id="press-enter-text" class="text-amber-400 font-bold pointer-events-none flex-shrink-0" style="
            font-size: 48px;
            text-shadow: 5px 5px 0px #000000;
            animation: titleBlink 1s ease-in-out infinite alternate;
          ">PRESS ENTER</div>

        </div>

        <!-- Custom Animations and Styles -->
        <style>
          @keyframes titleBlink {
            from { opacity: 0.3; }
            to { opacity: 1; }
          }
        </style>
      </div>
    `;

    // Add DOM element to the scene - MUST use utils.initUIDom
    this.uiContainer = utils.initUIDom(this, uiHTML);
  }

  /**
   * Standard input setup - DO NOT MODIFY
   */
  setupInputs(): void {
    // Add HTML event listeners for keyboard and mouse events
    const handleStart = (event: Event) => {
      event.preventDefault();
      this.startGame();
    };

    // Listen for Enter and Space key events on the document
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        this.startGame();
      }
    };

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);

    // Add click event to the UI container
    if (this.uiContainer && this.uiContainer.node) {
      this.uiContainer.node.addEventListener('click', handleStart);
    }

    // Store event listeners for cleanup
    this.keydownHandler = handleKeyDown;
    this.clickHandler = handleStart;
  }

  /**
   * TODO: Change the music key to your game's title screen music
   */
  initializeSounds(): void {
    // TODO: Replace "title_screen_music" with your actual music asset key
    // this.backgroundMusic = this.sound.add("title_screen_music", {
    //   volume: 0.4,
    //   loop: true,
    // });
  }

  playBackgroundMusic(): void {
    // Play the initialized background music
    if (this.backgroundMusic) {
      this.backgroundMusic.play();
    }
  }

  /**
   * Standard game start logic - DO NOT MODIFY structure
   * TODO: Change "ui_click" to your actual UI click sound key
   */
  startGame(): void {
    // Prevent multiple triggers
    if (this.isStarting) return;
    this.isStarting = true;

    // Play click sound
    // TODO: Replace "ui_click" with your actual sound asset key
    // this.sound.play("ui_click", { volume: 0.3 });

    // Clean up event listeners
    this.cleanupEventListeners();

    // Stop background music
    if (this.backgroundMusic) {
      this.backgroundMusic.stop();
    }

    // Add transition effect
    this.cameras.main.fadeOut(500, 0, 0, 0);

    // Start first level after delay
    this.time.delayedCall(500, () => {
      const firstLevelScene = LevelManager.getFirstLevelScene();
      if (firstLevelScene) {
        this.scene.start(firstLevelScene);
      } else {
        console.error('No first level scene found in LEVEL_ORDER');
      }
    });
  }

  /**
   * Standard cleanup - DO NOT MODIFY
   */
  cleanupEventListeners(): void {
    // Remove HTML event listeners
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
    }

    if (this.clickHandler && this.uiContainer && this.uiContainer.node) {
      this.uiContainer.node.removeEventListener('click', this.clickHandler);
    }
  }

  update(): void {
    // Title screen doesn't need special update logic
  }
}
