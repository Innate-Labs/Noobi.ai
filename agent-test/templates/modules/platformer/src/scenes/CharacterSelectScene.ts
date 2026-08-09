import Phaser from 'phaser';
import { LevelManager } from '../LevelManager';

/**
 * Character data interface for selection screen
 */
export interface CharacterData {
  /** Display name shown on screen */
  name: string;
  /** Texture key for character preview image */
  previewKey: string;
  /** Description text (supports \n for line breaks) */
  description: string;
  /** Player class identifier - stored in registry for dynamic loading */
  playerClass: string;
}

/**
 * CharacterSelectScene - Character selection screen
 *
 * This scene allows players to choose their character before starting the game.
 * The selected character is stored in the Phaser registry for later retrieval.
 *
 * USAGE:
 *   1. Define your characters in the CHARACTERS array
 *   2. Register this scene in main.ts
 *   3. Navigate here from TitleScreen (or directly start here)
 *   4. In BaseLevelScene.createPlayer(), use registry.get('selectedCharacter')
 *
 * REGISTRY KEY: 'selectedCharacter' - contains the playerClass string
 *
 * CUSTOMIZATION HOOKS:
 *   - Override getCharacters() to define available characters
 *   - Override createCustomUI() to add game-specific UI elements
 *   - Override onCharacterSelected(character) for custom selection effects
 */
export class CharacterSelectScene extends Phaser.Scene {
  // ============================================================================
  // STATE
  // ============================================================================

  /** Currently selected character index */
  protected selectedCharacterIndex: number = 0;

  /** Prevents double-selection during transition */
  protected isSelecting: boolean = false;

  /** Character data array - populated from getCharacters() */
  protected characters: CharacterData[] = [];

  // ============================================================================
  // UI ELEMENTS
  // ============================================================================

  /** Character preview sprites */
  protected characterSprites: Phaser.GameObjects.Image[] = [];

  /** Character name text objects */
  protected characterNames: Phaser.GameObjects.Text[] = [];

  /** Character description text objects */
  protected characterDescriptions: Phaser.GameObjects.Text[] = [];

  /** Selection highlight frames */
  protected selectionFrames: Phaser.GameObjects.Graphics[] = [];

  /** Default border graphics */
  protected characterBorders: Phaser.GameObjects.Graphics[] = [];

  /** Interactive zones for mouse input */
  protected characterZones: Phaser.GameObjects.Zone[] = [];

  /** Title text */
  protected titleText?: Phaser.GameObjects.Text;

  /** Control hints text */
  protected controlsText?: Phaser.GameObjects.Text;

  // ============================================================================
  // INPUT
  // ============================================================================

  protected cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  protected aKey!: Phaser.Input.Keyboard.Key;
  protected dKey!: Phaser.Input.Keyboard.Key;
  protected enterKey!: Phaser.Input.Keyboard.Key;
  protected spaceKey!: Phaser.Input.Keyboard.Key;

  // ============================================================================
  // AUDIO
  // ============================================================================

  protected backgroundMusic?: Phaser.Sound.BaseSound;

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor() {
    super({ key: 'CharacterSelectScene' });
  }

  init(): void {
    this.selectedCharacterIndex = 0;
    this.isSelecting = false;

    // Clear arrays
    this.characterSprites = [];
    this.characterNames = [];
    this.characterDescriptions = [];
    this.selectionFrames = [];
    this.characterBorders = [];
    this.characterZones = [];
  }

  create(): void {
    // Cleanup any lingering UI scenes
    this.cleanupUIScenes();

    // Get character data
    this.characters = this.getCharacters();

    // Create UI elements
    this.createBackground();
    this.createTitle();
    this.createCharacterDisplay();
    this.createControlHints();
    this.createCustomUI();

    // Setup input
    this.setupInputs();

    // Play music
    this.playBackgroundMusic();

    // Initial selection highlight
    this.updateSelection();
  }

  // ============================================================================
  // HOOK: Define available characters
  // ============================================================================

  /**
   * HOOK: Define the characters available for selection
   * Override this method to customize available characters
   *
   * @returns Array of character data
   */
  protected getCharacters(): CharacterData[] {
    // Default example characters - OVERRIDE THIS IN YOUR GAME
    return [
      {
        name: 'HERO',
        previewKey: 'player_idle_frame1',
        description: 'Balanced fighter\nStrong melee attacks',
        playerClass: 'Player',
      },
      // Add more characters here
    ];
  }

  // ============================================================================
  // HOOK: Custom UI elements
  // ============================================================================

  /**
   * HOOK: Add custom UI elements
   * Override this to add game-specific decorations
   */
  protected createCustomUI(): void {
    // Override in subclass
  }

  // ============================================================================
  // HOOK: Character selection callback
  // ============================================================================

  /**
   * HOOK: Called when a character is selected
   * Override to add custom selection effects
   * @param character - The selected character data
   */
  protected onCharacterSelected(character: CharacterData): void {
    // Override in subclass for custom effects
  }

  // ============================================================================
  // UI CLEANUP
  // ============================================================================

  protected cleanupUIScenes(): void {
    const scenesToStop = [
      'UIScene',
      'PauseUIScene',
      'VictoryUIScene',
      'GameOverUIScene',
      'GameCompleteUIScene',
    ];

    scenesToStop.forEach((sceneKey) => {
      try {
        if (this.scene.isActive(sceneKey)) {
          this.scene.stop(sceneKey);
        }
      } catch (error) {
        // Scene doesn't exist, ignore
      }
    });
  }

  // ============================================================================
  // UI CREATION
  // ============================================================================

  protected createBackground(): void {
    const { width, height } = this.cameras.main;

    // Dark background - override in subclass for custom background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Overlay for better text visibility
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4);
  }

  protected createTitle(): void {
    const { width } = this.cameras.main;

    this.titleText = this.add
      .text(width / 2, 80, 'SELECT CHARACTER', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 6,
        align: 'center',
      })
      .setOrigin(0.5, 0.5);

    // Glow effect
    this.titleText.setShadow(0, 0, '#ffff00', 8);
  }

  protected createCharacterDisplay(): void {
    const { width, height } = this.cameras.main;

    const characterY = height * 0.5;
    const spacing = width / (this.characters.length + 1);

    // Frame dimensions
    const frameWidth = 220;
    const frameHeight = 300;

    this.characters.forEach((character, index) => {
      const x = spacing * (index + 1);

      // Character preview sprite
      const sprite = this.add.image(x, characterY, character.previewKey);
      const scale = Math.min(200 / sprite.width, 280 / sprite.height);
      sprite.setScale(scale).setOrigin(0.5, 0.5);
      this.characterSprites.push(sprite);

      // Default border (gray)
      const border = this.add.graphics();
      border.lineStyle(3, 0x666666, 0.8);
      border.strokeRoundedRect(
        x - frameWidth / 2,
        characterY - frameHeight / 2,
        frameWidth,
        frameHeight,
        10,
      );
      this.characterBorders.push(border);

      // Character name
      const nameText = this.add
        .text(x, characterY + 180, character.name, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4,
          align: 'center',
        })
        .setOrigin(0.5, 0.5);
      this.characterNames.push(nameText);

      // Character description
      const descText = this.add
        .text(x, characterY + 220, character.description, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#cccccc',
          stroke: '#000000',
          strokeThickness: 2,
          align: 'center',
          wordWrap: { width: 200 },
        })
        .setOrigin(0.5, 0.5);
      this.characterDescriptions.push(descText);

      // Selection highlight frame (hidden by default)
      const frame = this.add.graphics();
      frame.lineStyle(4, 0xffff00, 1);
      frame.strokeRoundedRect(
        x - frameWidth / 2,
        characterY - frameHeight / 2,
        frameWidth,
        frameHeight,
        10,
      );
      frame.setVisible(false);
      this.selectionFrames.push(frame);

      // Interactive zone for mouse input
      const zone = this.add
        .zone(x, characterY, frameWidth, frameHeight)
        .setInteractive();
      this.characterZones.push(zone);

      // Mouse events
      zone.on('pointerdown', () => {
        if (!this.isSelecting) {
          this.selectedCharacterIndex = index;
          this.updateSelection();
          this.confirmSelection();
        }
      });

      zone.on('pointerover', () => {
        if (!this.isSelecting && index !== this.selectedCharacterIndex) {
          this.showHoverEffect(index);
        }
      });

      zone.on('pointerout', () => {
        if (!this.isSelecting && index !== this.selectedCharacterIndex) {
          this.hideHoverEffect(index);
        }
      });
    });
  }

  protected createControlHints(): void {
    const { width, height } = this.cameras.main;

    this.controlsText = this.add
      .text(
        width / 2,
        height - 80,
        'A/D or Arrow Keys: Select    ENTER/SPACE: Confirm',
        {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
          align: 'center',
        },
      )
      .setOrigin(0.5, 0.5);

    // Blinking animation
    this.tweens.add({
      targets: this.controlsText,
      alpha: 0.5,
      duration: 1000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  // ============================================================================
  // INPUT SETUP
  // ============================================================================

  protected setupInputs(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.aKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.dKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.enterKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    );
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );
  }

  // ============================================================================
  // AUDIO
  // ============================================================================

  protected playBackgroundMusic(): void {
    // Override in subclass to play background music
    // this.backgroundMusic = this.sound.add("select_music", { volume: 0.5, loop: true });
    // this.backgroundMusic.play();
  }

  protected playSelectSound(): void {
    // Override in subclass
    // this.sound.play("ui_select", { volume: 0.3 });
  }

  protected playConfirmSound(): void {
    // Override in subclass
    // this.sound.play("ui_confirm", { volume: 0.3 });
  }

  // ============================================================================
  // SELECTION LOGIC
  // ============================================================================

  protected updateSelection(): void {
    const { width } = this.cameras.main;
    const spacing = width / (this.characters.length + 1);
    const frameWidth = 220;
    const frameHeight = 300;
    const characterY = this.cameras.main.height * 0.5;

    // Update all characters
    this.characters.forEach((_, index) => {
      const x = spacing * (index + 1);
      const isSelected = index === this.selectedCharacterIndex;

      // Selection frame visibility
      this.selectionFrames[index].setVisible(isSelected);

      // Border styling
      const border = this.characterBorders[index];
      border.clear();

      if (isSelected) {
        // Selected: gold border
        border.lineStyle(5, 0xffaa00, 1);
        border.strokeRoundedRect(
          x - frameWidth / 2,
          characterY - frameHeight / 2,
          frameWidth,
          frameHeight,
          10,
        );

        // Sprite highlight
        this.characterSprites[index].setTint(0xffffaa);
        const baseScale = Math.min(
          200 / this.characterSprites[index].width,
          280 / this.characterSprites[index].height,
        );
        this.characterSprites[index].setScale(baseScale * 1.1);

        // Name highlight
        this.characterNames[index].setColor('#ffff00');
        this.characterNames[index].setShadow(0, 0, '#ffffff', 4);
      } else {
        // Not selected: gray border
        border.lineStyle(3, 0x666666, 0.8);
        border.strokeRoundedRect(
          x - frameWidth / 2,
          characterY - frameHeight / 2,
          frameWidth,
          frameHeight,
          10,
        );

        // Sprite normal
        this.characterSprites[index].clearTint();
        const baseScale = Math.min(
          200 / this.characterSprites[index].width,
          280 / this.characterSprites[index].height,
        );
        this.characterSprites[index].setScale(baseScale);

        // Name normal
        this.characterNames[index].setColor('#ffffff');
        this.characterNames[index].setShadow(0, 0, '#000000', 0);
      }
    });
  }

  protected showHoverEffect(index: number): void {
    const { width } = this.cameras.main;
    const spacing = width / (this.characters.length + 1);
    const x = spacing * (index + 1);
    const frameWidth = 220;
    const frameHeight = 300;
    const characterY = this.cameras.main.height * 0.5;

    // Brighten border
    const border = this.characterBorders[index];
    border.clear();
    border.lineStyle(4, 0xaaaaaa, 1);
    border.strokeRoundedRect(
      x - frameWidth / 2,
      characterY - frameHeight / 2,
      frameWidth,
      frameHeight,
      10,
    );

    // Slight scale and tint
    const sprite = this.characterSprites[index];
    const baseScale = Math.min(200 / sprite.width, 280 / sprite.height);
    sprite.setScale(baseScale * 1.05);
    sprite.setTint(0xf0f0f0);

    // Name brighten
    this.characterNames[index].setColor('#f0f0f0');
  }

  protected hideHoverEffect(index: number): void {
    const { width } = this.cameras.main;
    const spacing = width / (this.characters.length + 1);
    const x = spacing * (index + 1);
    const frameWidth = 220;
    const frameHeight = 300;
    const characterY = this.cameras.main.height * 0.5;

    // Restore border
    const border = this.characterBorders[index];
    border.clear();
    border.lineStyle(3, 0x666666, 0.8);
    border.strokeRoundedRect(
      x - frameWidth / 2,
      characterY - frameHeight / 2,
      frameWidth,
      frameHeight,
      10,
    );

    // Restore sprite
    const sprite = this.characterSprites[index];
    const baseScale = Math.min(200 / sprite.width, 280 / sprite.height);
    sprite.setScale(baseScale);
    sprite.clearTint();

    // Restore name
    this.characterNames[index].setColor('#ffffff');
  }

  protected confirmSelection(): void {
    if (this.isSelecting) return;
    this.isSelecting = true;

    this.playConfirmSound();

    const selectedCharacter = this.characters[this.selectedCharacterIndex];

    // Stop background music
    if (this.backgroundMusic) {
      this.backgroundMusic.stop();
    }

    // *** CRITICAL: Store selected character in registry ***
    this.registry.set('selectedCharacter', selectedCharacter.playerClass);

    // Hook: Custom selection callback
    this.onCharacterSelected(selectedCharacter);

    // Selection animation
    const selectedSprite = this.characterSprites[this.selectedCharacterIndex];
    this.tweens.add({
      targets: selectedSprite,
      scaleX: selectedSprite.scaleX * 1.2,
      scaleY: selectedSprite.scaleY * 1.2,
      duration: 300,
      yoyo: true,
      onComplete: () => {
        // Fade out and start first level
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          const firstLevel = LevelManager.getFirstLevelScene();
          if (firstLevel) {
            this.scene.start(firstLevel);
          }
        });
      },
    });

    // Show confirmation text
    const { width, height } = this.cameras.main;
    const confirmText = this.add
      .text(width / 2, height - 150, `${selectedCharacter.name} SELECTED!`, {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5, 0.5);

    // Flash effect
    this.tweens.add({
      targets: confirmText,
      alpha: 0.3,
      duration: 150,
      yoyo: true,
      repeat: 3,
    });
  }

  // ============================================================================
  // UPDATE LOOP
  // ============================================================================

  update(): void {
    if (this.isSelecting) return;

    // Left/Right selection
    if (
      Phaser.Input.Keyboard.JustDown(this.cursors.left) ||
      Phaser.Input.Keyboard.JustDown(this.aKey)
    ) {
      this.selectedCharacterIndex =
        (this.selectedCharacterIndex - 1 + this.characters.length) %
        this.characters.length;
      this.updateSelection();
      this.playSelectSound();
    } else if (
      Phaser.Input.Keyboard.JustDown(this.cursors.right) ||
      Phaser.Input.Keyboard.JustDown(this.dKey)
    ) {
      this.selectedCharacterIndex =
        (this.selectedCharacterIndex + 1) % this.characters.length;
      this.updateSelection();
      this.playSelectSound();
    }

    // Confirm selection
    if (
      Phaser.Input.Keyboard.JustDown(this.enterKey) ||
      Phaser.Input.Keyboard.JustDown(this.spaceKey)
    ) {
      this.confirmSelection();
    }
  }
}
