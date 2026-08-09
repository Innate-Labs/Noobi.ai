/**
 * ============================================================================
 * BASE CHAPTER SCENE - Foundation for narrative/dialogue-driven scenes
 * ============================================================================
 *
 * This is the MOST IMPORTANT base class in the ui_heavy module.
 * It provides the complete lifecycle for dialogue-driven game chapters:
 * visual novels, galgames, interactive fiction, tutorial sequences, etc.
 *
 * ARCHITECTURE: State Machine + Protected Hooks with Default Implementations
 *
 *   The base class owns the DIALOGUE STATE MACHINE (entry processing, advance,
 *   choice resolution, branching). All UI RENDERING is done through PROTECTED
 *   methods that have sensible defaults but can be fully overridden.
 *
 * LIFECYCLE (Template Method Pattern):
 *   create() calls in order:
 *     1. createBackground()         -- HOOK: set scene background
 *     2. createCharacters()         -- HOOK: register characters
 *     3. createDialogueUI()         -- HOOK (has default): create dialogue display
 *     4. createUI()                 -- HOOK: add scene-specific UI elements
 *     5. setupDefaultInputs()       -- HOOK (has default): click/Enter/Space
 *     6. setupInputs()              -- HOOK: bind custom key/click handlers
 *     7. playBackgroundMusic()      -- uses getBackgroundMusicKey() hook
 *     8. initializeScene()          -- HOOK: final setup before dialogue
 *     9. initializeDialogues()      -- HOOK (REQUIRED): define dialogue content
 *    10. startDialogue()            -- begins dialogue playback
 *
 * HOOKS WITH DEFAULTS (override to customize or replace):
 *   - createDialogueUI(): Creates DialogueBox + ChoicePanel. Override to use
 *     different UI components or skip entirely.
 *   - setupDefaultInputs(): Binds click/Enter/Space to advance. Override to
 *     change input scheme.
 *   - showDialogueText(speaker, text, expression): Displays text using
 *     DialogueBox. Override for speech bubbles, custom text displays, etc.
 *   - showChoiceUI(prompt, options): Shows choices via ChoicePanel. Override
 *     for custom choice presentation.
 *   - handleCharacterEnter(id, config, position): Creates CharacterPortrait
 *     and animates entry. Override for custom character display.
 *   - handleCharacterExit(id): Animates portrait exit. Override to customize.
 *   - getDialogueBoxConfig(): Returns DialogueBox config. Override to restyle.
 *
 * PURE HOOKS (no default, override as needed):
 *   - initializeDialogues(): REQUIRED, define dialogue content
 *   - createBackground(): Set scene background
 *   - createCharacters(): Register character configs
 *   - createUI(): Additional UI elements
 *   - setupInputs(): Additional input bindings
 *   - initializeScene(): Final setup
 *   - getBackgroundMusicKey(): Audio key
 *   - onDialogueEvent(action, data): React to events
 *   - onChoiceMade(choiceId, option): React to choices
 *   - onCharacterEnter(id, position): Called AFTER character enter
 *   - onCharacterExit(id): Called AFTER character exit
 *   - onChapterComplete(): All dialogues finished
 *   - onUpdate(time, delta): Per-frame logic
 *
 * Usage:
 *   export class Chapter1Scene extends BaseChapterScene {
 *     constructor() { super({ key: 'Chapter1Scene' }); }
 *
 *     protected initializeDialogues(): DialogueEntry[] {
 *       return [
 *         { type: 'text', speaker: 'narrator', text: 'Once upon a time...' },
 *         { type: 'character', action: 'enter', characterId: 'hero', position: 'left' },
 *         { type: 'text', speaker: 'hero', text: 'Where am I?' },
 *         { type: 'choice', id: 'first_choice', prompt: 'What do you do?', options: [
 *           { text: 'Look around', effects: { curiosity: +1 } },
 *           { text: 'Call for help', effects: { courage: -1 } },
 *         ]},
 *       ];
 *     }
 *   }
 *
 * SAFETY NOTES:
 *   - All type/interface imports MUST use the "type" keyword:
 *       import { type DialogueEntry } from './BaseChapterScene';
 *   - Config access: import directly from gameConfig.json:
 *       import gameConfig from '../gameConfig.json';
 *       const dialogueConfig = gameConfig.dialogueConfig ?? {};
 *       dialogueConfig.textSpeed.value  // use .value accessor
 *   - Scene cleanup: use this.events.once('shutdown', cb), NOT override shutdown()
 *   - Scene keys in scene.start('KEY') MUST match main.ts registration
 */

import Phaser from 'phaser';
import { DialogueBox, type DialogueBoxConfig } from '../ui/DialogueBox';
import {
  CharacterPortrait,
  type PortraitConfig,
} from '../ui/CharacterPortrait';
import { ChoicePanel, type ChoiceDisplayOption } from '../ui/ChoicePanel';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** A single dialogue entry in the sequence */
export interface DialogueEntry {
  /** Entry type */
  type: 'text' | 'choice' | 'event' | 'character' | 'branch' | 'wait';

  // -- For type: 'text' --
  /** Speaker name (or 'narrator' for narration) */
  speaker?: string;
  /** Dialogue text content */
  text?: string;
  /** Speaker expression key (e.g., 'happy', 'angry') */
  expression?: string;

  // -- For type: 'choice' --
  /** Unique choice identifier */
  id?: string;
  /** Choice prompt text */
  prompt?: string;
  /** Available options */
  options?: ChoiceOption[];

  // -- For type: 'event' --
  /** Event action name */
  action?: string;
  /** Event payload data */
  data?: Record<string, any>;

  // -- For type: 'character' --
  /** Character ID for enter/exit/expression changes */
  characterId?: string;
  /** Screen position: 'left', 'center', 'right' */
  position?: 'left' | 'center' | 'right';

  // -- For type: 'branch' --
  /** Condition function to evaluate which branch to take */
  condition?: () => boolean;
  /** Dialogues if condition is true */
  trueBranch?: DialogueEntry[];
  /** Dialogues if condition is false */
  falseBranch?: DialogueEntry[];

  // -- For type: 'wait' --
  /** Duration in ms */
  duration?: number;
}

/** A single choice option */
export interface ChoiceOption {
  /** Display text */
  text: string;
  /** Jump label or next dialogue index */
  next?: string;
  /** Side effects to apply on selection */
  effects?: Record<string, number>;
  /** Condition for this option to be visible */
  condition?: () => boolean;
}

/** Character display configuration */
export interface ChapterCharacterConfig {
  /** Character unique ID */
  id: string;
  /** Default texture key */
  textureKey: string;
  /** Display name shown in dialogue box */
  displayName: string;
  /** Available expression texture keys */
  expressions?: Record<string, string>;
  /** Default screen position */
  defaultPosition?: 'left' | 'center' | 'right';
}

// ============================================================================
// BASE CLASS
// ============================================================================

export abstract class BaseChapterScene extends Phaser.Scene {
  // -- Dialogue state (managed by base class state machine) --
  protected dialogues: DialogueEntry[] = [];
  protected currentDialogueIndex: number = 0;
  protected isDialoguePlaying: boolean = false;
  protected isWaitingForInput: boolean = false;
  protected isChoiceActive: boolean = false;
  /** Guard: true while a delayed auto-advance is pending (character/wait entries). */
  private isAutoAdvancing: boolean = false;

  // -- Character state --
  protected characters: Map<string, ChapterCharacterConfig> = new Map();
  protected activeCharacters: Map<string, CharacterPortrait> = new Map();

  // -- Default UI components (created by default hooks, subclass may replace) --
  protected dialogueBox?: DialogueBox;
  protected choicePanel?: ChoicePanel;

  // -- Audio --
  protected backgroundMusic?: Phaser.Sound.BaseSound;

  // ============================================================================
  // LIFECYCLE (Template Method Pattern)
  // ============================================================================

  create(): void {
    // Reset mutable state (Phaser reuses scene instances on scene.start,
    // so constructor field initializers do NOT run again)
    this.dialogues = [];
    this.currentDialogueIndex = 0;
    this.isDialoguePlaying = false;
    this.isWaitingForInput = false;
    this.isChoiceActive = false;
    this.isAutoAdvancing = false;
    this.activeCharacters.clear();
    this.characters.clear();
    this.dialogueBox = undefined;
    this.choicePanel = undefined;
    // Stop music before clearing the reference to prevent orphaned playback
    if (this.backgroundMusic?.isPlaying) {
      this.backgroundMusic.stop();
    }
    this.backgroundMusic = undefined;

    this.createBackground();
    this.createCharacters();
    this.createDialogueUI();
    this.createUI();
    this.createHelpPanel();
    this.setupDefaultInputs();
    this.setupInputs();
    this.playBackgroundMusic();
    this.initializeScene();

    // Get dialogue content from subclass
    this.dialogues = this.initializeDialogues();
    this.startDialogue();
  }

  update(time: number, delta: number): void {
    this.onUpdate(time, delta);
  }

  // ============================================================================
  // HOOKS - REQUIRED (must override)
  // ============================================================================

  /**
   * HOOK (REQUIRED): Define the dialogue content for this chapter.
   * Return an array of DialogueEntry objects that define the scene flow.
   */
  protected abstract initializeDialogues(): DialogueEntry[];

  // ============================================================================
  // HOOKS WITH DEFAULT IMPLEMENTATION (override to customize or replace)
  // ============================================================================

  /**
   * HOOK (has default): Create the dialogue UI components.
   *
   * DEFAULT: Creates a DialogueBox at the bottom of the screen and a
   * ChoicePanel at the center. Override this entirely to use different
   * UI components (e.g., speech bubbles, custom panels) or skip dialogue UI.
   *
   * If you override this, also override showDialogueText() and showChoiceUI()
   * to use your custom components.
   */
  protected createDialogueUI(): void {
    const cam = this.cameras.main;
    const boxConfig = this.getDialogueBoxConfig();

    // Create dialogue box
    this.dialogueBox = new DialogueBox(this, boxConfig);
    this.dialogueBox.setBoxVisible(false);

    // Listen for advance events from dialogue box
    this.dialogueBox.on('advance', () => {
      this.advanceDialogue();
    });

    // Create choice panel (centered above dialogue box)
    this.choicePanel = new ChoicePanel(
      this,
      cam.width / 2,
      cam.height / 2 - 30,
    );
    this.choicePanel.setVisible(false);

    // Listen for choice selection
    this.choicePanel.on('selected', (index: number) => {
      this.resolveChoice(index);
    });
  }

  /**
   * HOOK (has default): Set up default input bindings for dialogue advancement.
   *
   * DEFAULT: Click, Enter, and Space advance dialogue / complete typewriter.
   * Override to change the input scheme (e.g., swipe, custom keys).
   */
  protected setupDefaultInputs(): void {
    // Click to advance / complete typewriter
    this.input.on('pointerdown', () => {
      if (this.isChoiceActive) return;
      if (this.isWaitingForInput) {
        this.handleDialogueInput();
      }
    });

    // Enter / Space to advance
    const enterKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    );
    const spaceKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    enterKey?.on('down', () => {
      if (this.isChoiceActive) return;
      if (this.isWaitingForInput) {
        this.handleDialogueInput();
      }
    });

    spaceKey?.on('down', () => {
      if (this.isChoiceActive) return;
      if (this.isWaitingForInput) {
        this.handleDialogueInput();
      }
    });
  }

  /**
   * HOOK (has default): Display a dialogue text entry.
   *
   * DEFAULT: Uses this.dialogueBox to show text with typewriter effect,
   * highlights the speaking character, dims others.
   * Override to display text differently (speech bubbles, subtitle bar, etc.)
   *
   * @param speaker - Speaker name or 'narrator'
   * @param text - Text content to display
   * @param expression - Optional expression key for the speaker
   */
  protected showDialogueText(
    speaker: string,
    text: string,
    expression?: string,
  ): void {
    // Update character expression if provided
    if (speaker && expression) {
      this.setCharacterExpression(speaker, expression);
    }

    // Highlight the speaking character, dim others
    this.activeCharacters.forEach((portrait, id) => {
      portrait.setSpeakerActive(id === speaker);
    });

    // Resolve speaker display name
    let speakerName = speaker;
    const charConfig = this.characters.get(speaker);
    if (charConfig) {
      speakerName = charConfig.displayName;
    }

    // Show text in dialogue box
    if (this.dialogueBox) {
      this.dialogueBox.showText(speakerName, text);
    }
  }

  /**
   * HOOK (has default): Display choice buttons for the player.
   *
   * DEFAULT: Uses this.choicePanel to show clickable buttons with prompt.
   * Override to display choices differently (radial menu, cards, etc.)
   *
   * When overriding, call this.resolveChoice(index) when the player selects.
   *
   * @param prompt - Choice prompt text
   * @param options - Available options (already filtered for visibility)
   */
  protected showChoiceUI(prompt: string, options: ChoiceDisplayOption[]): void {
    if (this.dialogueBox) {
      this.dialogueBox.setBoxVisible(false);
    }
    if (this.choicePanel) {
      this.choicePanel.showChoices(prompt, options);
    }
  }

  /**
   * HOOK (has default): Handle a character entering the scene visually.
   *
   * DEFAULT: Creates a CharacterPortrait from the registered config,
   * animates it sliding in, and stores it in activeCharacters.
   * Override to display characters differently (sprites, 3D models, etc.)
   *
   * @param characterId - The character's registered ID
   * @param config - The character's registered config
   * @param position - Screen position for the character
   */
  protected handleCharacterEnter(
    characterId: string,
    config: ChapterCharacterConfig,
    position: 'left' | 'center' | 'right',
  ): void {
    // Create portrait if not already active
    if (!this.activeCharacters.has(characterId)) {
      const portrait = new CharacterPortrait(this, {
        id: config.id,
        textureKey: config.textureKey,
        displayName: config.displayName,
        expressions: config.expressions,
        position: position,
      });
      this.activeCharacters.set(characterId, portrait);
    }

    // Animate entry
    const portrait = this.activeCharacters.get(characterId)!;
    portrait.enter();
  }

  /**
   * HOOK (has default): Handle a character exiting the scene visually.
   *
   * DEFAULT: Animates the CharacterPortrait sliding out and removes it.
   * Override for custom exit animations.
   *
   * @param characterId - The character's registered ID
   */
  protected handleCharacterExit(characterId: string): void {
    const portrait = this.activeCharacters.get(characterId);
    if (portrait) {
      portrait.exit(() => {
        this.activeCharacters.delete(characterId);
      });
    }
  }

  /**
   * HOOK (has default): Handle player input during dialogue (advance or complete).
   *
   * DEFAULT: Delegates to DialogueBox.handleInput() which either completes
   * the typewriter or emits 'advance'.
   * Override if you use a custom dialogue display component.
   */
  protected handleDialogueInput(): void {
    if (this.dialogueBox) {
      this.dialogueBox.handleInput();
    }
  }

  /**
   * HOOK (has default): Returns configuration for the default DialogueBox.
   * Override to change the dialogue box appearance without replacing the component.
   */
  protected getDialogueBoxConfig(): DialogueBoxConfig {
    const cam = this.cameras.main;
    return {
      x: cam.width / 2,
      y: cam.height - 100,
      width: Math.min(900, cam.width - 40),
      height: 160,
      backgroundColor: 0x0a0a1e,
      backgroundAlpha: 0.9,
      typeSpeed: 30,
      padding: 20,
    };
  }

  // ============================================================================
  // PURE HOOKS (no default, override as needed)
  // ============================================================================

  /** HOOK: Create the scene background. */
  protected createBackground(): void {}

  /** HOOK: Register characters via registerCharacter(). */
  protected createCharacters(): void {}

  /** HOOK: Create scene-specific UI elements beyond the dialogue system. */
  protected createUI(): void {}

  /** HOOK: Add custom key bindings beyond the default ones. */
  protected setupInputs(): void {}

  /** HOOK: Called after all setup, before dialogue starts. */
  protected initializeScene(): void {}

  /** HOOK: Return the audio key for background music. */
  protected getBackgroundMusicKey(): string | undefined {
    return undefined;
  }

  /**
   * HOOK: Return gameplay hint lines to display in the top-right corner.
   * Override to provide scene-specific hints. Return empty array to hide panel.
   */
  protected getGameplayHints(): string[] {
    return ['Click or Enter: advance', 'Choose wisely!'];
  }

  /** HOOK: Called when a special event is encountered in the dialogue. */
  protected onDialogueEvent(action: string, data?: Record<string, any>): void {}

  /** HOOK: Called when the player selects a choice option. */
  protected onChoiceMade(choiceId: string, option: ChoiceOption): void {}

  /**
   * HOOK: Called AFTER a character enters the scene (after visual setup).
   * Use for additional logic (sound effects, state changes, etc.)
   */
  protected onCharacterEnter(characterId: string, position?: string): void {}

  /** HOOK: Called AFTER a character exits the scene. */
  protected onCharacterExit(characterId: string): void {}

  /** HOOK: Called when all dialogues in this chapter are complete. */
  protected onChapterComplete(): void {}

  /** HOOK: Called every frame. */
  protected onUpdate(time: number, delta: number): void {}

  // ============================================================================
  // PROTECTED UTILITIES (available to subclasses)
  // ============================================================================

  /** Register a character for use in dialogues. */
  protected registerCharacter(config: ChapterCharacterConfig): void {
    this.characters.set(config.id, config);
  }

  /** Start playing the dialogue sequence from the beginning or a specific index. */
  protected startDialogue(fromIndex: number = 0): void {
    if (this.dialogues.length === 0) {
      this.isDialoguePlaying = false;
      this.onChapterComplete();
      return;
    }
    this.currentDialogueIndex = fromIndex;
    this.isDialoguePlaying = true;
    this.processCurrentEntry();
  }

  /** Advance to the next dialogue entry. */
  protected advanceDialogue(): void {
    if (!this.isDialoguePlaying || this.isChoiceActive || this.isAutoAdvancing)
      return;

    this.isWaitingForInput = false;
    this.currentDialogueIndex++;
    if (this.currentDialogueIndex >= this.dialogues.length) {
      this.isDialoguePlaying = false;
      if (this.dialogueBox) {
        this.dialogueBox.setBoxVisible(false);
      }
      this.onChapterComplete();
      return;
    }
    this.processCurrentEntry();
  }

  /** Change a character's expression. */
  protected setCharacterExpression(
    characterId: string,
    expression: string,
  ): void {
    const portrait = this.activeCharacters.get(characterId);
    if (portrait) {
      portrait.setExpression(expression);
    }
  }

  /**
   * Resolve a player's choice selection. Call this from your custom choice UI.
   * Handles effects, notifies subclass via onChoiceMade, and advances dialogue.
   */
  protected resolveChoice(optionIndex: number): void {
    if (!this.isChoiceActive) return;
    const entry = this.dialogues[this.currentDialogueIndex];
    if (!entry || entry.type !== 'choice' || !entry.options) return;

    // Map filtered index back to original options
    const visibleOptions = (entry.options ?? []).filter(
      (opt) => !opt.condition || opt.condition(),
    );
    const option = visibleOptions[optionIndex];
    if (!option) return;

    // Hide choice UI
    if (this.choicePanel) {
      this.choicePanel.hide();
    }
    this.isChoiceActive = false;

    // Apply effects
    if (option.effects) {
      for (const [key, value] of Object.entries(option.effects)) {
        const current = this.registry.get(key) ?? 0;
        this.registry.set(key, current + value);
      }
    }

    // Notify subclass
    this.onChoiceMade(entry.id ?? '', option);

    // Re-show dialogue box for continuing
    if (this.dialogueBox) {
      this.dialogueBox.setBoxVisible(true);
    }

    // Advance dialogue
    this.advanceDialogue();
  }

  /** Show floating text (e.g., "+10 Points"). */
  protected showFloatingText(
    text: string,
    x: number,
    y: number,
    style?: any,
  ): void {
    const defaultStyle = {
      fontSize: '24px',
      color: '#FFD700',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 3,
      ...style,
    };
    const floatText = this.add.text(x, y, text, defaultStyle).setOrigin(0.5);
    floatText.setDepth(999);
    this.tweens.add({
      targets: floatText,
      y: y - 60,
      alpha: 0,
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => floatText.destroy(),
    });
  }

  // ============================================================================
  // HELP PANEL
  // ============================================================================

  /**
   * Create a semi-transparent gameplay hints panel in the top-right corner.
   * Uses getGameplayHints() hook for content.
   */
  private createHelpPanel(): void {
    const hints = this.getGameplayHints();
    if (!hints || hints.length === 0) return;

    const cam = this.cameras.main;
    const padding = 10;
    const lineHeight = 18;
    const panelWidth = 180;
    const panelHeight = padding * 2 + hints.length * lineHeight + 4;

    const panelX = cam.width - panelWidth - 12;
    const panelY = 12;
    const bg = this.add.rectangle(
      panelX + panelWidth / 2,
      panelY + panelHeight / 2,
      panelWidth,
      panelHeight,
      0x000000,
      0.5,
    );
    bg.setDepth(500);
    bg.setScrollFactor(0);

    const border = this.add.rectangle(
      panelX + panelWidth / 2,
      panelY + panelHeight / 2,
      panelWidth,
      panelHeight,
    );
    border.setStrokeStyle(1, 0x666666, 0.6);
    border.setFillStyle(0x000000, 0);
    border.setDepth(500);
    border.setScrollFactor(0);

    hints.forEach((line, i) => {
      const text = this.add.text(
        panelX + padding,
        panelY + padding + i * lineHeight,
        line,
        {
          fontSize: '12px',
          color: '#cccccc',
          fontFamily: 'Arial',
        },
      );
      text.setDepth(501);
      text.setScrollFactor(0);
    });
  }

  // ============================================================================
  // STATE MACHINE (internal, drives the dialogue flow)
  // ============================================================================

  /** Process the current dialogue entry based on its type. */
  private processCurrentEntry(): void {
    if (this.currentDialogueIndex >= this.dialogues.length) return;

    const entry = this.dialogues[this.currentDialogueIndex];
    switch (entry.type) {
      case 'text':
        this.isWaitingForInput = true;
        this.showDialogueText(
          entry.speaker ?? '',
          entry.text ?? '',
          entry.expression,
        );
        break;

      case 'choice': {
        const options: ChoiceDisplayOption[] = (entry.options ?? [])
          .filter((opt) => !opt.condition || opt.condition())
          .map((opt) => ({ text: opt.text, enabled: true }));
        // Guard: if all choices are filtered out, skip to prevent softlock
        if (options.length === 0) {
          this.advanceDialogue();
          break;
        }
        this.isChoiceActive = true;
        this.showChoiceUI(entry.prompt ?? '', options);
        break;
      }

      case 'character': {
        const charId = entry.characterId ?? '';
        const charConfig = this.characters.get(charId);
        if (entry.action === 'enter' && charConfig) {
          const position =
            entry.position ?? charConfig.defaultPosition ?? 'center';
          this.handleCharacterEnter(charId, charConfig, position);
          this.onCharacterEnter(charId, position);
        } else if (entry.action === 'exit') {
          this.handleCharacterExit(charId);
          this.onCharacterExit(charId);
        } else if (entry.action === 'expression' && entry.expression) {
          this.setCharacterExpression(charId, entry.expression);
        }
        // Auto-advance past character actions.
        // Set guard flag to prevent manual advanceDialogue() from racing.
        this.isAutoAdvancing = true;
        this.time.delayedCall(entry.action === 'enter' ? 300 : 50, () => {
          this.isAutoAdvancing = false;
          this.advanceDialogue();
        });
        break;
      }

      case 'event':
        this.onDialogueEvent(entry.action ?? '', entry.data);
        this.advanceDialogue();
        break;

      case 'wait':
        // Set guard flag to prevent manual advanceDialogue() from racing.
        this.isAutoAdvancing = true;
        this.time.delayedCall(entry.duration ?? 1000, () => {
          this.isAutoAdvancing = false;
          this.advanceDialogue();
        });
        break;

      case 'branch': {
        const result = entry.condition?.() ?? true;
        const branch = result ? entry.trueBranch : entry.falseBranch;
        if (branch && branch.length > 0) {
          this.dialogues.splice(this.currentDialogueIndex + 1, 0, ...branch);
        }
        this.advanceDialogue();
        break;
      }

      default:
        this.advanceDialogue();
        break;
    }
  }

  /** Play background music with fade-in. */
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
        volume: 0.5,
        duration: 1000,
      });
    } catch (e) {
      console.warn(`[BaseChapterScene] Could not play music: ${key}`, e);
    }
  }
}
