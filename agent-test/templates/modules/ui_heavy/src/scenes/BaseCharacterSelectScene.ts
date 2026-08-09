/**
 * ============================================================================
 * BASE CHARACTER SELECT SCENE - Player character/avatar selection
 * ============================================================================
 *
 * Displays a grid of selectable characters/avatars/personas.
 * Designed for UI-heavy games: card battlers (choose deck master),
 * visual novels (choose protagonist), quiz battles (choose avatar), etc.
 *
 * Stores the selected character data in Phaser registry for retrieval
 * by subsequent scenes.
 *
 * LIFECYCLE (Template Method Pattern):
 *   create() calls in order:
 *     1. createBackground()           -- HOOK: set background
 *     2. createTitle()                -- HOOK: display title text
 *     3. getSelectableCharacters()    -- HOOK (REQUIRED): define characters
 *     4. createCharacterGrid()        -- builds interactive character cards
 *     5. createControlHints()         -- HOOK: display control hints
 *     6. createCustomUI()             -- HOOK: add extra UI elements
 *     7. setupInputs()                -- keyboard/mouse bindings
 *     8. playBackgroundMusic()        -- uses getBackgroundMusicKey()
 *
 * HOOK METHODS:
 *   - getSelectableCharacters(): Return array of character configs (REQUIRED)
 *   - createBackground(): Custom background
 *   - createTitle(): Custom title display
 *   - createControlHints(): Custom control hints
 *   - createCustomUI(): Add extra UI elements (decorations, etc.)
 *   - onSelectionChanged(character, index): Highlight changed
 *   - onCharacterSelected(character): Character confirmed
 *   - shouldAutoTransition(): Return false for PVP sequential pick mode
 *   - triggerTransition(): Call manually after all picks in PVP mode
 *   - getNextSceneKey(): Scene to transition to after selection
 *   - getBackgroundMusicKey(): Audio key for background music
 *   - getGridConfig(): Customize grid layout (columns, card size, spacing)
 *   - createCharacterCard(container, character, cardW, cardH): Custom card rendering
 *   - playSelectSound(): SFX when highlight changes
 *   - playConfirmSound(): SFX when character is confirmed
 *
 * REGISTRY: 'selectedCharacter' stores the full SelectableCharacter object.
 *   Retrieve in other scenes: this.registry.get('selectedCharacter')
 *
 * PVP SEQUENTIAL PICK PATTERN:
 *   For games where two players each pick a character:
 *   1. Override shouldAutoTransition() to return false.
 *   2. Track whose turn it is (P1 or P2) in your subclass.
 *   3. In onCharacterSelected():
 *      - P1 turn: store P1 choice (registry.set('p1Character', char)),
 *        call this.resetForNextPick(index) to gray out P1's card,
 *        update titleText ("Player 2, choose!").
 *      - P2 turn: store P2 choice, call this.triggerTransition().
 *
 * PROTECTED PROPERTIES (available to subclasses):
 *   - this.characters: SelectableCharacter[]       -- character data
 *   - this.selectedIndex: number                   -- current highlight index
 *   - this.isConfirming: boolean                   -- lock during transition
 *   - this.titleText: Phaser.GameObjects.Text      -- title (update for PVP)
 *   - this.cardContainers: Container[]             -- per-card containers
 *   - this.cardBackgrounds: Rectangle[]            -- per-card backgrounds
 *   - this.disabledIndices: Set<number>            -- cards disabled for PVP
 *
 * Usage:
 *   export class HeroSelectScene extends BaseCharacterSelectScene {
 *     constructor() { super({ key: 'HeroSelectScene' }); }
 *
 *     protected getSelectableCharacters(): SelectableCharacter[] {
 *       return [
 *         { id: 'mage', name: 'Dark Mage', description: 'Master of arcane spells',
 *           imageKey: 'mage_portrait', stats: { hp: 80, atk: 25, def: 10 } },
 *         { id: 'knight', name: 'Holy Knight', description: 'Armored defender',
 *           imageKey: 'knight_portrait', stats: { hp: 120, atk: 15, def: 25 } },
 *       ];
 *     }
 *
 *     protected getNextSceneKey(): string {
 *       return 'Chapter1Scene';
 *     }
 *   }
 */

import Phaser from 'phaser';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** Character data for the selection screen */
export interface SelectableCharacter {
  /** Unique character identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description text */
  description?: string;
  /** Preview image texture key */
  imageKey?: string;
  /** Character stats for display (e.g., { hp: 100, atk: 15, def: 10 }) */
  stats?: Record<string, number>;
  /** Extra metadata the game scene can read later */
  metadata?: Record<string, any>;
}

/** Grid layout configuration */
export interface GridConfig {
  /** Max columns in the grid (default: 4) */
  maxColumns: number;
  /** Card width in pixels (default: 180) */
  cardWidth: number;
  /** Card height in pixels (default: 240) */
  cardHeight: number;
  /** Horizontal gap between cards (default: 20) */
  gapX: number;
  /** Vertical gap between cards (default: 20) */
  gapY: number;
}

// ============================================================================
// BASE CLASS
// ============================================================================

export class BaseCharacterSelectScene extends Phaser.Scene {
  // -- State --
  protected characters: SelectableCharacter[] = [];
  protected selectedIndex: number = 0;
  protected isConfirming: boolean = false;

  /** Indices of disabled cards (PVP: already-picked characters). */
  protected disabledIndices: Set<number> = new Set();

  // -- UI element tracking (protected for PVP subclass access) --
  protected titleText?: Phaser.GameObjects.Text;
  protected cardContainers: Phaser.GameObjects.Container[] = [];
  protected cardBackgrounds: Phaser.GameObjects.Rectangle[] = [];
  private highlightGraphics?: Phaser.GameObjects.Graphics;

  // -- Scroll state (for many characters) --
  private scrollOffset: number = 0;
  private gridConfig!: GridConfig;

  // -- Audio --
  protected backgroundMusic?: Phaser.Sound.BaseSound;

  // ============================================================================
  // CONSTRUCTOR
  // IMPORTANT: Subclasses pass their own key via super({ key: 'MyScene' }).
  // The "config ??" fallback ensures the base class still works standalone.
  // Do NOT remove the "config ??" part -- it enables subclass scene key override.
  // ============================================================================

  constructor(config?: Phaser.Types.Scenes.SettingsConfig) {
    super(config ?? { key: 'CharacterSelectScene' });
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  create(): void {
    // Reset mutable state (Phaser reuses scene instances)
    this.selectedIndex = 0;
    this.isConfirming = false;
    this.disabledIndices = new Set();
    this.titleText = undefined;
    this.cardContainers = [];
    this.cardBackgrounds = [];
    this.highlightGraphics = undefined;
    this.scrollOffset = 0;
    // Stop music before clearing the reference to prevent orphaned playback
    if (this.backgroundMusic?.isPlaying) {
      this.backgroundMusic.stop();
    }
    this.backgroundMusic = undefined;

    this.gridConfig = this.getGridConfig();
    this.characters = this.getSelectableCharacters();

    this.createBackground();
    this.createTitle();
    this.buildCharacterGrid();
    this.createControlHints();
    this.createCustomUI();
    this.setupInputs();
    this.playBackgroundMusic();

    // Initial highlight
    this.updateHighlight();
  }

  update(time: number, delta: number): void {
    this.onUpdate(time, delta);
  }

  // ============================================================================
  // HOOKS - REQUIRED
  // ============================================================================

  /**
   * HOOK (REQUIRED): Define the characters available for selection.
   * Override in subclass to return your game's characters.
   */
  protected getSelectableCharacters(): SelectableCharacter[] {
    return [];
  }

  // ============================================================================
  // HOOKS WITH DEFAULT IMPLEMENTATION
  // ============================================================================

  /** HOOK: Create the scene background. Default: dark solid background. */
  protected createBackground(): void {
    const cam = this.cameras.main;
    this.add.rectangle(
      cam.width / 2,
      cam.height / 2,
      cam.width,
      cam.height,
      0x1a1a2e,
    );
  }

  /**
   * HOOK: Create the title text. Default: centered title at top.
   * The created text is stored in this.titleText for PVP title updates.
   * If you override, remember to assign this.titleText = yourText.
   */
  protected createTitle(): void {
    const cam = this.cameras.main;
    this.titleText = this.add
      .text(cam.width / 2, 50, 'SELECT CHARACTER', {
        fontSize: '36px',
        fontFamily: 'Arial',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
  }

  /** HOOK: Create control hints text. Default: bottom-center instructions. */
  protected createControlHints(): void {
    const cam = this.cameras.main;
    const hint = this.add
      .text(
        cam.width / 2,
        cam.height - 40,
        'Arrow Keys / Click: Select    Enter / Space: Confirm',
        {
          fontSize: '14px',
          fontFamily: 'Arial',
          color: '#aaaaaa',
        },
      )
      .setOrigin(0.5);
    this.tweens.add({
      targets: hint,
      alpha: 0.4,
      duration: 1000,
      yoyo: true,
      repeat: -1,
    });
  }

  /** HOOK: Add custom UI elements (decorations, panels, etc.). */
  protected createCustomUI(): void {}

  /**
   * HOOK: Return grid layout configuration.
   * Override to change card sizes and grid layout.
   */
  protected getGridConfig(): GridConfig {
    return {
      maxColumns: 4,
      cardWidth: 180,
      cardHeight: 240,
      gapX: 20,
      gapY: 20,
    };
  }

  /**
   * HOOK: Create a single character card's visual content.
   *
   * DEFAULT: Creates image + name + description + stats inside the container.
   * Override to fully customize card appearance.
   *
   * @param container - The card container to add children to
   * @param character - Character data
   * @param cardW - Card width
   * @param cardH - Card height
   */
  protected createCharacterCard(
    container: Phaser.GameObjects.Container,
    character: SelectableCharacter,
    cardW: number,
    cardH: number,
  ): void {
    // Character image (top portion)
    if (character.imageKey && this.textures.exists(character.imageKey)) {
      const img = this.add.image(0, -cardH / 2 + 70, character.imageKey);
      const scale = Math.min((cardW - 20) / img.width, 100 / img.height);
      img.setScale(scale).setOrigin(0.5);
      container.add(img);
    } else {
      // Placeholder silhouette
      const placeholder = this.add.rectangle(
        0,
        -cardH / 2 + 70,
        60,
        80,
        0x444466,
      );
      container.add(placeholder);
      const questionMark = this.add
        .text(0, -cardH / 2 + 70, '?', {
          fontSize: '32px',
          color: '#888888',
          fontFamily: 'Arial',
        })
        .setOrigin(0.5);
      container.add(questionMark);
    }

    // Character name
    const nameText = this.add
      .text(0, 10, character.name, {
        fontSize: '16px',
        fontFamily: 'Arial',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        align: 'center',
      })
      .setOrigin(0.5);
    container.add(nameText);

    // Description
    if (character.description) {
      const desc = this.add
        .text(0, 35, character.description, {
          fontSize: '11px',
          fontFamily: 'Arial',
          color: '#cccccc',
          align: 'center',
          wordWrap: { width: cardW - 20 },
          lineSpacing: 2,
        })
        .setOrigin(0.5, 0);
      container.add(desc);
    }

    // Stats (if provided)
    if (character.stats && Object.keys(character.stats).length > 0) {
      const statEntries = Object.entries(character.stats);
      const statY = cardH / 2 - 15 - statEntries.length * 14;
      statEntries.forEach(([key, value], i) => {
        const label = this.add.text(
          -cardW / 2 + 15,
          statY + i * 14,
          `${key.toUpperCase()}`,
          { fontSize: '10px', fontFamily: 'Arial', color: '#aaaaaa' },
        );
        container.add(label);

        const val = this.add
          .text(cardW / 2 - 15, statY + i * 14, `${value}`, {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: '#ffffff',
          })
          .setOrigin(1, 0);
        container.add(val);
      });
    }
  }

  /**
   * HOOK: Called when the keyboard/mouse highlight changes to a different character.
   * Use for sound effects, description panel updates, etc.
   */
  protected onSelectionChanged(
    character: SelectableCharacter,
    index: number,
  ): void {}

  /**
   * HOOK: Called when a character is confirmed.
   * Default: store in registry and transition to next scene.
   * Override for custom post-selection logic (e.g., team building, animation).
   */
  protected onCharacterSelected(character: SelectableCharacter): void {}

  /**
   * HOOK: Return the scene key to transition to after character selection.
   * Default: 'ChapterSelectScene' (go to chapter/level select).
   */
  protected getNextSceneKey(): string {
    return 'ChapterSelectScene';
  }

  /** HOOK: Return audio key for background music. */
  protected getBackgroundMusicKey(): string | undefined {
    return undefined;
  }

  /** HOOK: Play SFX when highlight moves to a different character. */
  protected playSelectSound(): void {}

  /** HOOK: Play SFX when a character is confirmed. */
  protected playConfirmSound(): void {}

  /** HOOK: Per-frame logic. */
  protected onUpdate(time: number, delta: number): void {}

  // ============================================================================
  // GRID BUILDING (internal)
  // ============================================================================

  private buildCharacterGrid(): void {
    if (this.characters.length === 0) return;

    const cam = this.cameras.main;
    const gc = this.gridConfig;
    const cols = Math.min(gc.maxColumns, this.characters.length);
    const rows = Math.ceil(this.characters.length / cols);

    // Center the grid
    const totalW = cols * gc.cardWidth + (cols - 1) * gc.gapX;
    const totalH = rows * gc.cardHeight + (rows - 1) * gc.gapY;
    const startX = (cam.width - totalW) / 2 + gc.cardWidth / 2;
    const startY = (cam.height - totalH) / 2 + gc.cardHeight / 2 + 20; // +20 for title offset

    // Highlight graphics (drawn behind cards)
    this.highlightGraphics = this.add.graphics();
    this.highlightGraphics.setDepth(99);

    this.characters.forEach((character, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (gc.cardWidth + gc.gapX);
      const y = startY + row * (gc.cardHeight + gc.gapY);

      // Card background
      const bg = this.add.rectangle(
        0,
        0,
        gc.cardWidth,
        gc.cardHeight,
        0x222244,
        0.85,
      );
      bg.setStrokeStyle(2, 0x444466);

      // Container
      const container = this.add.container(x, y, [bg]);
      container.setSize(gc.cardWidth, gc.cardHeight);
      container.setDepth(100);

      // Let hook fill the card content
      this.createCharacterCard(
        container,
        character,
        gc.cardWidth,
        gc.cardHeight,
      );

      // Make interactive
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        if (!this.isConfirming && !this.disabledIndices.has(i)) {
          this.selectedIndex = i;
          this.updateHighlight();
          this.confirmSelection();
        }
      });
      bg.on('pointerover', () => {
        if (
          !this.isConfirming &&
          !this.disabledIndices.has(i) &&
          i !== this.selectedIndex
        ) {
          bg.setFillStyle(0x333366, 0.9);
        }
      });
      bg.on('pointerout', () => {
        if (
          !this.isConfirming &&
          !this.disabledIndices.has(i) &&
          i !== this.selectedIndex
        ) {
          bg.setFillStyle(0x222244, 0.85);
        }
      });

      this.cardContainers.push(container);
      this.cardBackgrounds.push(bg);
    });
  }

  // ============================================================================
  // SELECTION LOGIC (internal)
  // ============================================================================

  /**
   * Update the visual highlight to reflect the current selectedIndex.
   * Protected so PVP subclasses can call after resetting selectedIndex.
   */
  protected updateHighlight(): void {
    if (!this.highlightGraphics || this.characters.length === 0) return;

    this.highlightGraphics.clear();

    // Reset all card backgrounds
    this.cardBackgrounds.forEach((bg, i) => {
      if (this.disabledIndices.has(i)) {
        // Disabled card (already picked in PVP)
        bg.setFillStyle(0x111122, 0.5);
        bg.setStrokeStyle(2, 0x333344);
      } else if (i === this.selectedIndex) {
        bg.setFillStyle(0x334488, 0.95);
        bg.setStrokeStyle(3, 0xffcc00);
      } else {
        bg.setFillStyle(0x222244, 0.85);
        bg.setStrokeStyle(2, 0x444466);
      }
    });

    // Dim disabled card containers
    this.cardContainers.forEach((container, i) => {
      container.setAlpha(this.disabledIndices.has(i) ? 0.4 : 1);
    });

    // Notify hook
    if (this.characters[this.selectedIndex]) {
      this.onSelectionChanged(
        this.characters[this.selectedIndex],
        this.selectedIndex,
      );
    }
  }

  private confirmSelection(): void {
    if (this.isConfirming || this.characters.length === 0) return;

    // PVP: Prevent selecting a disabled (already-picked) card
    if (this.disabledIndices.has(this.selectedIndex)) return;

    const selected = this.characters[this.selectedIndex];

    // Play confirm SFX
    this.playConfirmSound();

    // Store in registry for other scenes to read
    this.registry.set('selectedCharacter', selected);

    // Notify hook
    this.onCharacterSelected(selected);

    // Check if we should auto-transition (default: true).
    // Override shouldAutoTransition() to return false for PVP sequential pick:
    //   P1 picks -> store P1 choice -> resetForNextPick() -> P2 picks -> transition
    if (!this.shouldAutoTransition()) return;

    this.isConfirming = true;

    // Selection animation: flash the selected card
    const container = this.cardContainers[this.selectedIndex];
    if (container) {
      this.tweens.add({
        targets: container,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 200,
        yoyo: true,
        onComplete: () => {
          this.triggerTransition();
        },
      });
    } else {
      this.triggerTransition();
    }
  }

  /**
   * HOOK: Whether to auto-transition to next scene after a character is selected.
   *
   * Default: true (immediately transition after one selection).
   * Override to return false for PVP games where both players pick sequentially.
   * When returning false, call this.triggerTransition() manually when all
   * players have made their selections.
   */
  protected shouldAutoTransition(): boolean {
    return true;
  }

  /**
   * Trigger the scene fade-out and transition to the next scene.
   * Call this manually if shouldAutoTransition() returns false.
   */
  protected triggerTransition(): void {
    this.isConfirming = true;

    // Stop music
    if (this.backgroundMusic) {
      this.backgroundMusic.stop();
    }

    // Fade out and go to next scene
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(this.getNextSceneKey());
    });
  }

  /**
   * PVP HELPER: Reset the selection state for the next player's pick.
   * Disables the card at disableIndex (grayed out, non-interactive),
   * resets selectedIndex to the first non-disabled card, and updates highlight.
   *
   * Call this from onCharacterSelected() in PVP sequential pick mode.
   *
   * @param disableIndex - Index of the card to disable (the just-picked card).
   *   Pass undefined to skip disabling (e.g., if same character can be picked twice).
   */
  protected resetForNextPick(disableIndex?: number): void {
    // Disable the picked card
    if (
      disableIndex !== undefined &&
      disableIndex >= 0 &&
      disableIndex < this.characters.length
    ) {
      this.disabledIndices.add(disableIndex);
    }

    // Move selectedIndex to first non-disabled card
    this.selectedIndex = 0;
    while (
      this.disabledIndices.has(this.selectedIndex) &&
      this.selectedIndex < this.characters.length
    ) {
      this.selectedIndex++;
    }
    // Safety: if all cards are disabled, clamp to 0
    if (this.selectedIndex >= this.characters.length) {
      this.selectedIndex = 0;
    }

    this.updateHighlight();
  }

  // ============================================================================
  // INPUT (internal)
  // ============================================================================

  private setupInputs(): void {
    if (this.characters.length === 0) return;

    const cols = Math.min(this.gridConfig.maxColumns, this.characters.length);

    // Arrow keys for grid navigation
    const leftKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.LEFT,
    );
    const rightKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    );
    const upKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.UP,
    );
    const downKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.DOWN,
    );
    const enterKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    );
    const spaceKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    leftKey?.on('down', () => {
      if (this.isConfirming) return;
      let next =
        (this.selectedIndex - 1 + this.characters.length) %
        this.characters.length;
      // Skip disabled cards (PVP mode)
      let attempts = this.characters.length;
      while (this.disabledIndices.has(next) && attempts > 0) {
        next = (next - 1 + this.characters.length) % this.characters.length;
        attempts--;
      }
      this.selectedIndex = next;
      this.updateHighlight();
      this.playSelectSound();
    });

    rightKey?.on('down', () => {
      if (this.isConfirming) return;
      let next = (this.selectedIndex + 1) % this.characters.length;
      // Skip disabled cards (PVP mode)
      let attempts = this.characters.length;
      while (this.disabledIndices.has(next) && attempts > 0) {
        next = (next + 1) % this.characters.length;
        attempts--;
      }
      this.selectedIndex = next;
      this.updateHighlight();
      this.playSelectSound();
    });

    upKey?.on('down', () => {
      if (this.isConfirming) return;
      const newIdx = this.selectedIndex - cols;
      if (newIdx >= 0 && !this.disabledIndices.has(newIdx)) {
        this.selectedIndex = newIdx;
        this.updateHighlight();
        this.playSelectSound();
      }
    });

    downKey?.on('down', () => {
      if (this.isConfirming) return;
      const newIdx = this.selectedIndex + cols;
      if (
        newIdx < this.characters.length &&
        !this.disabledIndices.has(newIdx)
      ) {
        this.selectedIndex = newIdx;
        this.updateHighlight();
        this.playSelectSound();
      }
    });

    enterKey?.on('down', () => {
      if (!this.isConfirming) this.confirmSelection();
    });

    spaceKey?.on('down', () => {
      if (!this.isConfirming) this.confirmSelection();
    });
  }

  // ============================================================================
  // AUDIO (internal)
  // ============================================================================

  private playBackgroundMusic(): void {
    const key = this.getBackgroundMusicKey();
    if (!key) return;
    try {
      if (this.sound.get(key)) {
        this.backgroundMusic = this.sound.get(key);
      } else {
        this.backgroundMusic = this.sound.add(key, { loop: true, volume: 0 });
      }
      this.backgroundMusic?.play();
      this.tweens.add({
        targets: this.backgroundMusic,
        volume: 0.4,
        duration: 800,
      });
    } catch (e) {
      console.warn('[BaseCharacterSelectScene] Could not play music:', e);
    }
  }
}
