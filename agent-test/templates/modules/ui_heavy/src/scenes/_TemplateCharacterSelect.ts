/**
 * ============================================================================
 * TEMPLATE: Character Selection Scene
 * ============================================================================
 *
 * INSTRUCTIONS FOR AGENT:
 * 1. Copy this file and rename (e.g., HeroSelectScene.ts)
 * 2. Rename the class and constructor scene key
 * 3. Implement getSelectableCharacters() with your game's characters
 * 4. Set getNextSceneKey() to your first game scene
 * 5. Override hooks as needed for custom UI
 *
 * CRITICAL RULES:
 * - This extends BaseCharacterSelectScene. All hooks are available.
 * - Override getSelectableCharacters() (REQUIRED).
 * - Override getNextSceneKey() to navigate to your battle/chapter scene.
 * - For PVP (2 players pick sequentially):
 *     Override shouldAutoTransition() to return false.
 *     Track P1/P2 picks manually, then call triggerTransition().
 *
 * REGISTRY:
 * - On confirm, base class stores: registry.set('selectedCharacter', character)
 * - Retrieve in battle scene: this.registry.get('selectedCharacter')
 * - For PVP, store per-player:
 *     this.registry.set('p1Character', character)
 *     this.registry.set('p2Character', character)
 *
 * TYPE IMPORTS:
 *   All interfaces/types MUST use the "type" keyword:
 *     import { BaseCharacterSelectScene, type SelectableCharacter } from './BaseCharacterSelectScene';
 *
 * FILE CHECKLIST (complete AFTER implementing this scene):
 *   [ ] main.ts — import and register this scene with game.scene.add()
 *   [ ] LevelManager.ts — add scene key to LEVEL_ORDER
 *   [ ] asset-pack.json — register ALL character portrait/expression texture keys
 *   [ ] gameConfig.json — merge characterSelectConfig values if customizing grid
 * ============================================================================
 */

import {
  BaseCharacterSelectScene,
  type SelectableCharacter,
} from './BaseCharacterSelectScene';

export class _TemplateCharacterSelect extends BaseCharacterSelectScene {
  constructor() {
    super({ key: '_TemplateCharacterSelect' }); // TODO: Replace with your scene key
  }

  // ============================================================================
  // REQUIRED: Define selectable characters
  // ============================================================================

  protected override getSelectableCharacters(): SelectableCharacter[] {
    return [
      // TODO: Define your characters
      // {
      //   id: 'warrior',
      //   name: 'Warrior',
      //   description: 'A brave warrior with strong defense',
      //   imageKey: 'warrior_portrait',  // Must match asset-pack.json key
      //   stats: { hp: 120, atk: 15, def: 25 },
      //   metadata: {
      //     expressions: {
      //       neutral: 'warrior_neutral',
      //       angry: 'warrior_angry',
      //       victory: 'warrior_victory',
      //     },
      //   },
      // },
      // {
      //   id: 'mage',
      //   name: 'Mage',
      //   description: 'Master of arcane spells',
      //   imageKey: 'mage_portrait',
      //   stats: { hp: 80, atk: 25, def: 10 },
      //   metadata: {
      //     expressions: {
      //       neutral: 'mage_neutral',
      //       angry: 'mage_angry',
      //       victory: 'mage_victory',
      //     },
      //   },
      // },
    ];
  }

  // ============================================================================
  // REQUIRED: Navigation
  // ============================================================================

  protected override getNextSceneKey(): string {
    return 'ChapterSelectScene'; // TODO: Replace with your first game scene
  }

  // ============================================================================
  // OPTIONAL: Scene setup hooks
  // ============================================================================

  protected override createBackground(): void {
    const cam = this.cameras.main;
    // TODO: Use your background image
    // if (this.textures.exists('select_bg')) {
    //   const bg = this.add.image(cam.width / 2, cam.height / 2, 'select_bg');
    //   bg.setDisplaySize(cam.width, cam.height);
    // } else {
    this.add.rectangle(
      cam.width / 2,
      cam.height / 2,
      cam.width,
      cam.height,
      0x1a1a2e,
    );
    // }
  }

  protected override createTitle(): void {
    const cam = this.cameras.main;
    // IMPORTANT: Assign to this.titleText so PVP mode can update it.
    this.titleText = this.add
      .text(cam.width / 2, 50, 'SELECT YOUR CHARACTER', {
        fontSize: '36px',
        fontFamily: 'Arial',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
  }

  protected override getBackgroundMusicKey(): string | undefined {
    // TODO: Return audio key for background music
    // return this.cache.audio.exists('select_bgm') ? 'select_bgm' : undefined;
    return undefined;
  }

  protected override createCustomUI(): void {
    // TODO: Add custom UI elements (decorations, instructions, etc.)
  }

  protected override onCharacterSelected(character: SelectableCharacter): void {
    // Base class already stores: registry.set('selectedCharacter', character)
    // Use 'selectedCharacter' to retrieve in battle scene:
    //   const char = this.registry.get('selectedCharacter');
    // TODO: Play selection SFX
    // if (this.cache.audio.exists('confirm_sfx')) {
    //   this.sound.play('confirm_sfx');
    // }
  }

  // ============================================================================
  // OPTIONAL: Grid customization
  // ============================================================================

  // protected override getGridConfig(): GridConfig {
  //   return {
  //     maxColumns: 5,      // 5 columns instead of default 4
  //     cardWidth: 160,     // Slightly narrower cards
  //     cardHeight: 220,
  //     gapX: 15,
  //     gapY: 15,
  //   };
  // }

  // ============================================================================
  // OPTIONAL: Audio hooks
  // ============================================================================

  // protected override playSelectSound(): void {
  //   if (this.cache.audio.exists('ui_select')) {
  //     this.sound.play('ui_select', { volume: 0.3 });
  //   }
  // }

  // protected override playConfirmSound(): void {
  //   if (this.cache.audio.exists('ui_confirm')) {
  //     this.sound.play('ui_confirm', { volume: 0.5 });
  //   }
  // }

  // ============================================================================
  // PVP SEQUENTIAL PICK PATTERN (optional)
  // ============================================================================
  // Uncomment for games where P1 and P2 each pick a character:
  //
  // private pickingPlayer: 'P1' | 'P2' = 'P1';
  //
  // protected override shouldAutoTransition(): boolean {
  //   return false; // We handle transition manually
  // }
  //
  // protected override onCharacterSelected(character: SelectableCharacter): void {
  //   const pickedIndex = this.selectedIndex; // Save before reset
  //   if (this.pickingPlayer === 'P1') {
  //     this.registry.set('p1Character', character);
  //     this.pickingPlayer = 'P2';
  //     // Gray out P1's card, reset highlight to first available card
  //     this.resetForNextPick(pickedIndex);
  //     // Update title for P2
  //     if (this.titleText) {
  //       this.titleText.setText('PLAYER 2: SELECT CHARACTER');
  //     }
  //   } else {
  //     this.registry.set('p2Character', character);
  //     this.triggerTransition(); // Both players picked, go to battle
  //   }
  // }
}
