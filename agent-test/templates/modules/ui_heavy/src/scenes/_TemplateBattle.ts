/**
 * ============================================================================
 * TEMPLATE: Battle Scene (Turn-Based Combat / Quiz)
 * ============================================================================
 *
 * INSTRUCTIONS FOR AGENT:
 * 1. Copy this file and rename (e.g., DuelScene.ts, BattleScene.ts)
 * 2. Rename the class and constructor scene key
 * 3. Define battle setup in initializeBattle()
 * 4. Define card deck in getCardDeck()
 * 5. Define quiz questions in getQuestionBank() (optional)
 * 6. Define enemy AI in onEnemyAction()
 * 7. Override hooks as needed for visual/audio effects
 *
 * CRITICAL RULES:
 * - initializeBattle() is REQUIRED and runs BEFORE createHUD(),
 *   so set HP values there (they are used when creating status bars)
 * - Do NOT override create() unless you call super.create() first.
 *   Base class handles the full lifecycle in create().
 *   If you do override, register cleanup:
 *     this.events.once('shutdown', () => { your cleanup });
 * - Card textureKeys must match asset-pack.json
 * - Questions should include explanation field for feedback
 * - Use handleCardPlayed(card) when a card UI is clicked
 * - Use handleQuizAnswered(correct, index) when quiz modal reports answer
 * - Base class auto-draws cards each turn via prepareHand() (overridable)
 * - Override prepareHand() to customize hand management (e.g., keep cards)
 * - Override resolveCardAction() to customize card effect resolution
 * - IMPORTANT: If overriding resolveCardAction(), hide the quiz modal first
 *   via quizModal.hide() so the player can see the HP bar effect.
 *   The quiz modal (depth 300) covers the HP bars (depth 150).
 *
 * CONFIG ACCESS:
 *   There is NO "this.gameConfig" property on BaseBattleScene.
 *   To read values from gameConfig.json, import it at the top of your file:
 *     import gameConfig from '../gameConfig.json';
 *     const battleConfig = gameConfig.battleConfig ?? {};
 *   Then access values via .value wrapper:
 *     const hp = battleConfig.playerMaxHP.value;       // number
 *
 * FLOATING TEXT:
 *   Use the inherited helper (static API, NOT a constructor):
 *     this.showFloatingText('-25', x, y, { color: '#ff0000', fontSize: '28px' });
 *   NEVER write: new FloatingText(...)
 *
 * TYPE IMPORTS:
 *   All interfaces/types MUST use the "type" keyword:
 *     import { type CardConfig } from './BaseBattleScene';   // CORRECT
 *     import { CardConfig } from './BaseBattleScene';        // WRONG - causes Vite error
 *
 * SCENE CLEANUP:
 *   Phaser.Scene does NOT have an overridable shutdown() method.
 *   Register cleanup via events in create():
 *     this.events.once('shutdown', () => { ... });
 *
 * FILE CHECKLIST (complete AFTER implementing this scene):
 *   [ ] main.ts — import { YourScene } from './scenes/YourScene';
 *   [ ] main.ts — game.scene.add("YourSceneKey", YourScene);
 *   [ ] LevelManager.ts — add "YourSceneKey" to LEVEL_ORDER
 *   [ ] asset-pack.json — all texture/audio keys used here must be registered
 *   [ ] gameConfig.json — merge battleConfig values (keep screenSize/debugConfig)
 *   [ ] TitleScreen.ts — update game title text
 * ============================================================================
 */

import Phaser from 'phaser';
import {
  BaseBattleScene,
  type CardConfig,
  type QuizQuestion,
  type EnemyBattleConfig,
} from './BaseBattleScene';
// To access gameConfig values, uncomment:
// import gameConfig from '../gameConfig.json';
// const battleConfig = gameConfig.battleConfig ?? {};
// Then use: battleConfig.playerMaxHP.value  (use .value accessor)
//
// UI components (uncomment as needed):
// import { StatusBar } from '../ui/StatusBar';
// import { Card } from '../ui/Card';
// import { QuizModal } from '../ui/QuizModal';
//
// Tween utilities (individual functions, NOT a class):
// import { fadeIn, shake, popIn } from '../ui/TweenPresets';

export class _TemplateBattle extends BaseBattleScene {
  constructor() {
    super({ key: '_TemplateBattle' }); // TODO: Replace with your scene key
  }

  // ============================================================================
  // REQUIRED: Battle initialization
  // ============================================================================

  protected override initializeBattle(): void {
    // STEP 1: Reset ALL scene-specific state (Phaser reuses scene instances!)
    // If you don't reset, returning to this scene after a match will have stale state.
    // this.myQuizModal = undefined;
    // this.myPlayerHPBar = undefined;
    // this.myEnemyHPBar = undefined;
    // this.myCardUIList = [];
    // STEP 2: Set up combatant HP
    // this.playerMaxHP = 100;
    // this.playerHP = this.playerMaxHP;
    // this.enemyMaxHP = 80;
    // this.enemyHP = this.enemyMaxHP;
    // this.handSize = 3;
    // STEP 3: Create QuizModal here if using quiz mechanics:
    // this.myQuizModal = new QuizModal(this, { width: 700, height: 500, showExplanation: true });
    // this.myQuizModal.on('answered', (correct: boolean, index: number) => {
    //   this.handleQuizAnswered(correct, index);
    // });
  }

  // ============================================================================
  // REQUIRED: Define cards
  // ============================================================================

  protected override getCardDeck(): CardConfig[] {
    return [
      // TODO: Define your cards
      // { id: 'fireball', name: 'Fireball', type: 'attack', value: 10,
      //   description: 'A basic fire spell', textureKey: 'spell_card_frame' },
      // { id: 'shield', name: 'Shield', type: 'defend', value: 15,
      //   description: 'Blocks incoming damage' },
      // { id: 'potion', name: 'Potion', type: 'heal', value: 20,
      //   description: 'Restores health' },
    ];
  }

  // ============================================================================
  // OPTIONAL: Quiz questions (for educational games)
  // ============================================================================

  protected override getQuestionBank(): QuizQuestion[] {
    return [
      // TODO: Define questions inline or load from JSON cache:
      // const data = this.cache.json.get('questions');
      // return data ?? [];
    ];
  }

  // ============================================================================
  // OPTIONAL: Enemy configuration
  // ============================================================================

  protected override getEnemyConfig(): EnemyBattleConfig | undefined {
    return undefined;
    // return {
    //   name: 'Rival',
    //   maxHP: 80,
    //   textureKey: 'rival_idle',
    //   damageRange: [5, 15],
    // };
  }

  // ============================================================================
  // OPTIONAL: Scene setup hooks
  // ============================================================================

  protected override createBackground(): void {
    // TODO: Set background image
    // const cam = this.cameras.main;
    // if (this.textures.exists('battle_bg')) {
    //   const bg = this.add.image(cam.width / 2, cam.height / 2, 'battle_bg');
    //   bg.setDisplaySize(cam.width, cam.height);
    // }
  }

  protected override createCombatants(): void {
    // TODO: Create character portraits using CharacterPortrait component
    // IMPORTANT: Constructor is CharacterPortrait(scene, config) — only 2 args!
    //   Portrait starts INVISIBLE. You MUST call .enter() to show it.
    //
    // const portrait = new CharacterPortrait(this, {
    //   id: 'hero',
    //   textureKey: 'hero_neutral',
    //   displayName: 'Hero',
    //   position: 'left',         // 'left' | 'center' | 'right'
    //   scale: 0.5,               // optional, default 1.0
    //   expressions: { neutral: 'hero_neutral', angry: 'hero_angry' },
    // });
    // portrait.enter();           // <-- REQUIRED to make it visible
    //
    // To push portraits behind UI: portrait.setDepth(5);
  }

  protected override getBackgroundMusicKey(): string | undefined {
    return undefined;
  }

  /**
   * OPTIONAL: Gameplay hints displayed in top-right corner.
   * These help the player understand card effects and game flow.
   * Return [] to hide the panel entirely.
   */
  protected override getGameplayHints(): string[] {
    return [
      // TODO: Customize hints for your game
      'Attack: Damage enemy',
      'Defend: Add shield',
      'Heal: Restore HP',
      'Correct = full effect',
      'Wrong = 30% effect',
    ];
  }

  protected override createHUD(): void {
    // TODO: Create HP bars using StatusBar component
    // IMPORTANT: StatusBar(scene, x, y, config) — 4 separate args, NOT {x,y} in config!
    //
    // this.playerHPBar = new StatusBar(this, 150, 40, {
    //   width: 200, height: 24, maxValue: this.playerMaxHP,
    //   label: 'HP', showValue: true,
    //   colorThresholds: [
    //     { percent: 0.6, color: 0x00aa00 },
    //     { percent: 0.3, color: 0xffff00 },
    //     { percent: 0.0, color: 0xff0000 },
    //   ],
    // });
    //
    // TODO: Register scene shutdown cleanup for timers/listeners
    // this.events.once('shutdown', () => {
    //   // Remove any active timers, event listeners, etc.
    // });
  }

  // ============================================================================
  // OPTIONAL: Turn flow hooks
  // ============================================================================

  protected override onPlayerTurnStart(): void {
    // TODO: Create Card UI for the cards in this.hand
    // Use Card component and handle the 'selected' event:
    // cardUI.on('selected', (card) => this.handleCardPlayed(card));
  }

  protected override onQuizPhaseStart(): void {
    // TODO: Show quiz question in QuizModal
    // if (this.currentQuestion && this.myQuizModal) {
    //   this.myQuizModal.showQuestion(this.currentQuestion);
    // }
  }

  // -- IMPORTANT: If you override resolveCardAction, hide the QuizModal FIRST --
  // protected override resolveCardAction(card: CardConfig, successful: boolean): void {
  //   // Hide quiz overlay so player can see the HP bar change
  //   if (this.myQuizModal) this.myQuizModal.hide();
  //   // Let base class apply damage/shield/heal
  //   super.resolveCardAction(card, successful);
  //   // Show floating text feedback for non-attack effects
  // }

  protected override onPlayerDamaged(
    damage: number,
    remainingHP: number,
  ): void {
    // TODO: Update player HP bar and show damage effects
    // this.playerHPBar?.setValue(remainingHP);
    // this.showFloatingText(`-${damage}`, 150, 150, { color: '#ff4444' });
  }

  protected override onEnemyDamaged(damage: number, remainingHP: number): void {
    // TODO: Update enemy HP bar and show damage effects
    // this.enemyHPBar?.setValue(remainingHP);
    // this.showFloatingText(`-${damage}`, 850, 150, { color: '#ffaa00' });
  }

  protected override onEnemyAction(): void {
    // TODO: Define enemy AI (called by default executeEnemyTurn)
    // const damage = Phaser.Math.Between(5, 15);
    // this.dealDamageToPlayer(damage);
  }

  // -- To use a defense quiz instead of auto-attack: --
  // protected override executeEnemyTurn(): void {
  //   this.time.delayedCall(500, () => {
  //     const question = this.getRandomQuestion();
  //     if (!question) { this.completeEnemyTurn(); return; }
  //     // Show quiz, then in answer callback:
  //     // if (correct) -> blocked, else -> dealDamageToPlayer()
  //     // Always call this.completeEnemyTurn() when done
  //   });
  // }

  protected override onBattleEnd(victory: boolean): void {
    // CRITICAL: always disable battle to prevent further actions after end
    this.isBattleActive = false;
    // TODO: Clear card UI, stop music, etc.
    // this.clearCardUI();
    // if (this.backgroundMusic) this.backgroundMusic.stop();

    // TODO: Transition to ending scene after a delay
    // this.time.delayedCall(1500, () => {
    //   if (victory) {
    //     this.scene.start('VictoryScene');
    //   } else {
    //     this.scene.start('DefeatScene');
    //   }
    // });
  }
}
