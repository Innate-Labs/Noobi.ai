/**
 * ============================================================================
 * TEMPLATE: Chapter Scene (Narrative/Dialogue)
 * ============================================================================
 *
 * INSTRUCTIONS FOR AGENT:
 * 1. Copy this file and rename (e.g., Chapter1Scene.ts, IntroScene.ts)
 * 2. Rename the class
 * 3. Define dialogue content in initializeDialogues()
 * 4. Register characters in createCharacters()
 * 5. Override hooks as needed for custom behavior
 *
 * CRITICAL RULES:
 * - initializeDialogues() is REQUIRED - must return dialogue entries
 * - Use registerCharacter() in createCharacters() for each character
 * - Do NOT override create() - base class handles the full lifecycle
 * - Background/music keys must match asset-pack.json
 * - All interface/type imports MUST use "type" keyword
 * - Config access: import gameConfig from '../gameConfig.json';
 *   const gameplayConfig = gameConfig.gameplayConfig ?? {};
 *   then use gameplayConfig.textSpeed.value (use .value accessor)
 *
 * DEFAULT BEHAVIOR (provided by base class, can be overridden):
 * - createDialogueUI(): Creates DialogueBox + ChoicePanel
 * - setupDefaultInputs(): Click/Enter/Space to advance dialogue
 * - showDialogueText(): Shows text in DialogueBox with typewriter effect
 * - showChoiceUI(): Shows choice buttons via ChoicePanel
 * - handleCharacterEnter(): Creates CharacterPortrait with slide-in animation
 * - handleCharacterExit(): Slides CharacterPortrait out
 * - handleDialogueInput(): Delegates to DialogueBox for skip/advance
 * - getDialogueBoxConfig(): Returns style config for default DialogueBox
 *
 * CUSTOMIZATION:
 * - To change dialogue box appearance: override getDialogueBoxConfig()
 * - To use speech bubbles instead: override createDialogueUI() + showDialogueText()
 * - To use a custom choice UI: override showChoiceUI(), call resolveChoice(index)
 * - To change input scheme: override setupDefaultInputs()
 * - To change character display: override handleCharacterEnter/Exit()
 *
 * FILE CHECKLIST (complete AFTER implementing this scene):
 *   [ ] main.ts — import { YourScene } from './scenes/YourScene';
 *   [ ] main.ts — game.scene.add("YourSceneKey", YourScene);
 *   [ ] LevelManager.ts — add "YourSceneKey" to LEVEL_ORDER
 *   [ ] asset-pack.json — all texture/audio keys used here must be registered
 *   [ ] gameConfig.json — merge custom gameplay values (keep screenSize/debugConfig)
 *   [ ] TitleScreen.ts — update game title text
 * ============================================================================
 */

import Phaser from 'phaser';
import {
  BaseChapterScene,
  type DialogueEntry,
  type ChoiceOption,
} from './BaseChapterScene';

export class _TemplateChapter extends BaseChapterScene {
  constructor() {
    super({ key: '_TemplateChapter' }); // TODO: Replace with your scene key
  }

  // ============================================================================
  // REQUIRED: Define dialogue content
  // ============================================================================

  protected override initializeDialogues(): DialogueEntry[] {
    return [
      // -- Scene opening --
      // { type: 'text', speaker: 'narrator', text: 'The story begins...' },
      // -- Character enters --
      // { type: 'character', action: 'enter', characterId: 'hero', position: 'left' },
      // -- Character dialogue with expression --
      // { type: 'text', speaker: 'hero', text: 'Hello, world!', expression: 'happy' },
      // -- Player choice --
      // { type: 'choice', id: 'greeting', prompt: 'How do you respond?', options: [
      //   { text: 'Wave back', effects: { friendship: +1 } },
      //   { text: 'Ignore them', effects: { friendship: -1 } },
      // ]},
      // -- Special event (screen shake, sound, etc.) --
      // { type: 'event', action: 'screen_shake', data: { intensity: 0.02 } },
      // -- Wait (timed pause) --
      // { type: 'wait', duration: 1500 },
      // -- Character exits --
      // { type: 'character', action: 'exit', characterId: 'hero' },
    ];
  }

  // ============================================================================
  // OPTIONAL: Scene setup
  // ============================================================================

  protected override createBackground(): void {
    // TODO: Set your background image (always check texture exists)
    // const cam = this.cameras.main;
    // if (this.textures.exists('chapter1_bg')) {
    //   const bg = this.add.image(cam.width / 2, cam.height / 2, 'chapter1_bg');
    //   bg.setDisplaySize(cam.width, cam.height);
    // }
  }

  protected override createCharacters(): void {
    // TODO: Register characters used in this chapter
    // this.registerCharacter({
    //   id: 'hero',
    //   textureKey: 'hero_neutral',
    //   displayName: 'Alaric',
    //   expressions: { happy: 'hero_happy', angry: 'hero_angry', sad: 'hero_sad' },
    //   defaultPosition: 'left',
    // });
  }

  protected override getBackgroundMusicKey(): string | undefined {
    // TODO: Return your music key or undefined for no music
    // return this.cache.audio.exists('chapter1_bgm') ? 'chapter1_bgm' : undefined;
    return undefined;
  }

  /**
   * OPTIONAL: Gameplay hints displayed in top-right corner.
   * Return [] to hide the panel entirely.
   */
  protected override getGameplayHints(): string[] {
    return [
      'Click or Enter: advance',
      // TODO: Add game-specific hints
    ];
  }

  // ============================================================================
  // OPTIONAL: Customize UI (override for non-standard UI)
  // ============================================================================

  // -- To change dialogue box style without replacing the component: --
  // protected override getDialogueBoxConfig(): DialogueBoxConfig {
  //   const cam = this.cameras.main;
  //   return {
  //     x: cam.width / 2,
  //     y: cam.height - 120,
  //     width: 800,
  //     height: 180,
  //     backgroundColor: 0x222244,
  //     backgroundAlpha: 0.85,
  //     typeSpeed: 25,
  //     padding: 24,
  //   };
  // }

  // -- To use entirely different UI (e.g., speech bubbles): --
  // protected override createDialogueUI(): void {
  //   // Create your own custom UI components here.
  //   // Do NOT call super.createDialogueUI() if you want to replace entirely.
  //   // Also override showDialogueText() and showChoiceUI() to use your UI.
  // }
  //
  // protected override showDialogueText(speaker: string, text: string, expression?: string): void {
  //   // Display text using your custom UI component
  // }
  //
  // protected override showChoiceUI(prompt: string, options: ChoiceDisplayOption[]): void {
  //   // Display choices using your custom UI.
  //   // Call this.resolveChoice(selectedIndex) when the player picks one.
  // }

  // ============================================================================
  // OPTIONAL: Event handlers
  // ============================================================================

  protected override onDialogueEvent(
    action: string,
    data?: Record<string, any>,
  ): void {
    // Handle custom events embedded in dialogues
    // switch (action) {
    //   case 'screen_shake':
    //     this.cameras.main.shake(500, data?.intensity ?? 0.02);
    //     break;
    //   case 'play_sfx':
    //     if (data?.key && this.cache.audio.exists(data.key)) {
    //       this.sound.play(data.key);
    //     }
    //     break;
    // }
  }

  protected override onChoiceMade(
    choiceId: string,
    option: ChoiceOption,
  ): void {
    // React to specific choices
    // if (choiceId === 'greeting' && option.text === 'Wave back') {
    //   this.showFloatingText('+1 Friendship', 512, 300);
    // }
  }

  protected override onChapterComplete(): void {
    // TODO: Transition to next chapter or scene
    // this.scene.start('Chapter2Scene');
  }
}
