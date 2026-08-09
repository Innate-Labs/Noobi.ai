/**
 * ============================================================================
 * TEMPLATE: Dual-Player Battle Scene (2P Quiz / Card Battle)
 * ============================================================================
 *
 * INSTRUCTIONS FOR AGENT:
 * 1. Copy this file and rename (e.g., QuizDuelScene.ts)
 * 2. Rename the class and constructor scene key
 * 3. Choose a DualPlayerMode:
 *    - 'TURN_BASED': P1 and P2 alternate turns (like a board game)
 *    - 'BUZZER_RACE': Both see the question, first to buzz gets to answer
 *    - 'SIMULTANEOUS': Both answer independently, score by speed + correctness
 * 4. Configure player key bindings
 * 5. Implement quiz/card presentation per mode
 *
 * CRITICAL RULES:
 * - This extends BaseBattleScene. All single-player hooks still work.
 * - DualPlayerSystem is a COMPOSABLE SYSTEM, not a base class.
 * - In TURN_BASED mode, "ENEMY_TURN" becomes "Player 2's turn" via
 *   executeEnemyTurn() override.
 * - In BUZZER_RACE / SIMULTANEOUS mode, the quiz phase is replaced
 *   with the dual-player round.
 * - Always clean up dualSystem in scene shutdown (see cleanup section below).
 *
 * BUZZER TRACKING (BUZZER_RACE mode):
 *   When using BUZZER_RACE mode, you MUST track who buzzed in a class property:
 *     private lastBuzzedPlayerId?: string;
 *   Set it in the 'playerBuzzed' event handler:
 *     this.dualSystem.on('playerBuzzed', (id) => { this.lastBuzzedPlayerId = id; });
 *   Then use it to attribute damage/score correctly.
 *
 * CONFIG ACCESS:
 *   There is NO "this.gameConfig" property. Import values directly:
 *     import gameConfig from '../gameConfig.json';
 *     const battleConfig = gameConfig.battleConfig ?? {};
 *   Then: battleConfig.playerMaxHP.value
 *
 * SCENE CLEANUP:
 *   Phaser.Scene does NOT have an overridable shutdown() method.
 *   Register cleanup in create() (after super.create()):
 *     this.events.once('shutdown', () => {
 *       this.dualSystem.destroy();
 *       // remove timers, etc.
 *     });
 *
 * TYPE IMPORTS:
 *   All interfaces/types MUST use the "type" keyword:
 *     import { type DualPlayerSystemConfig } from '../systems/DualPlayerSystem';
 *
 * FILE CHECKLIST (complete AFTER implementing this scene):
 *   [ ] main.ts — import { YourScene } from './scenes/YourScene';
 *   [ ] main.ts — game.scene.add("YourSceneKey", YourScene);
 *   [ ] LevelManager.ts — add "YourSceneKey" to LEVEL_ORDER
 *   [ ] asset-pack.json — all texture/audio keys used here must be registered
 *   [ ] gameConfig.json — merge battleConfig + dualPlayerConfig values
 *   [ ] TitleScreen.ts — update game title text
 * ============================================================================
 */

import Phaser from 'phaser';
import {
  BaseBattleScene,
  type CardConfig,
  type QuizQuestion,
} from './BaseBattleScene';
// To access gameConfig values, uncomment:
// import gameConfig from '../gameConfig.json';
// const battleConfig = gameConfig.battleConfig ?? {};
// const dualPlayerConfig = gameConfig.dualPlayerConfig ?? {};
//
// Dual-player system (uncomment when using):
// import { DualPlayerSystem, type DualPlayerSystemConfig } from '../systems/DualPlayerSystem';
// import { StatusBar } from '../ui/StatusBar';
// import { QuizModal } from '../ui/QuizModal';

export class _TemplateDualBattle extends BaseBattleScene {
  // private dualSystem!: DualPlayerSystem;
  // private p1ScoreBar?: StatusBar;
  // private p2ScoreBar?: StatusBar;
  //
  // BUZZER_RACE mode: Track who buzzed for damage attribution.
  // Without this, you cannot determine which player answered.
  // private lastBuzzedPlayerId?: string;

  constructor() {
    super({ key: '_TemplateDualBattle' }); // TODO: Replace with your scene key
  }

  // ============================================================================
  // REQUIRED: Battle initialization
  // ============================================================================

  protected override initializeBattle(): void {
    // TODO: Set up battle state for 2-player game.
    // Use gameConfig values:
    //   this.playerMaxHP = battleConfig.playerMaxHP.value;
    //   this.playerHP = this.playerMaxHP;
    //   this.enemyMaxHP = battleConfig.enemyMaxHP.value;
    //   this.enemyHP = this.enemyMaxHP;
    // TODO: Initialize dual-player system
    // const buzzerTime = dualPlayerConfig.buzzerTimeLimit.value;  // from gameConfig.json
    // this.dualSystem = new DualPlayerSystem(this, {
    //   mode: 'BUZZER_RACE',  // or 'TURN_BASED' or 'SIMULTANEOUS'
    //   scoreToWin: 10,
    //   correctPoints: 1,
    //   wrongPenalty: 0,
    //   speedBonus: 1,          // bonus for fastest in SIMULTANEOUS
    //   buzzerTimeLimit: buzzerTime,
    //   player1: {
    //     id: 'P1',
    //     name: 'Player 1',
    //     color: 0x4488ff,
    //     keys: {
    //       buzz: Phaser.Input.Keyboard.KeyCodes.Q,
    //       answers: [
    //         Phaser.Input.Keyboard.KeyCodes.ONE,
    //         Phaser.Input.Keyboard.KeyCodes.TWO,
    //         Phaser.Input.Keyboard.KeyCodes.THREE,
    //         Phaser.Input.Keyboard.KeyCodes.FOUR,
    //       ],
    //     },
    //   },
    //   player2: {
    //     id: 'P2',
    //     name: 'Player 2',
    //     color: 0xff4444,
    //     keys: {
    //       buzz: Phaser.Input.Keyboard.KeyCodes.P,
    //       answers: [
    //         Phaser.Input.Keyboard.KeyCodes.SEVEN,
    //         Phaser.Input.Keyboard.KeyCodes.EIGHT,
    //         Phaser.Input.Keyboard.KeyCodes.NINE,
    //         Phaser.Input.Keyboard.KeyCodes.ZERO,
    //       ],
    //     },
    //   },
    // });
    //
    // // CRITICAL: Track who buzzed for BUZZER_RACE mode
    // this.lastBuzzedPlayerId = undefined;
    // this.dualSystem.on('playerBuzzed', (playerId: string) => {
    //   this.lastBuzzedPlayerId = playerId;  // Store for damage attribution
    //   // Show visual feedback (e.g., highlight portrait)
    // });
    //
    // this.dualSystem.on('roundResult', (result) => {
    //   // Update score UI
    //   // this.p1ScoreBar?.setValue(this.dualSystem.getScore('P1'));
    //   // this.p2ScoreBar?.setValue(this.dualSystem.getScore('P2'));
    // });
    //
    // this.dualSystem.on('gameOver', (winnerId: string) => {
    //   const winner = this.dualSystem.getPlayerConfig(winnerId);
    //   // Show winner screen
    // });
  }

  // ============================================================================
  // REQUIRED: Cards and questions
  // ============================================================================

  protected override getCardDeck(): CardConfig[] {
    return [
      // TODO: Define cards (may not be needed for pure quiz duel)
    ];
  }

  protected override getQuestionBank(): QuizQuestion[] {
    return [
      // TODO: Define questions
      // { question: 'What is 2 + 2?', options: ['3', '4', '5', '6'],
      //   correctIndex: 1, explanation: '2 + 2 = 4' },
    ];
  }

  // ============================================================================
  // MODE-SPECIFIC: BUZZER_RACE / SIMULTANEOUS (with DualPlayerSystem)
  // ============================================================================

  // OPTION A: Use DualPlayerSystem (KEYBOARD-based buzz + answer)
  // Override the quiz phase to route through DualPlayerSystem:
  //
  // protected override onQuizPhaseStart(): void {
  //   if (!this.currentQuestion) return;
  //   this.showSharedQuestion(this.currentQuestion);
  //   if (this.dualSystem.getMode() === 'BUZZER_RACE') {
  //     this.dualSystem.startBuzzerRound(this.currentQuestion);
  //   } else {
  //     this.dualSystem.startSimultaneousRound(this.currentQuestion);
  //   }
  // }

  // ============================================================================
  // MODE-SPECIFIC: MOUSE-CLICK PVP (no DualPlayerSystem needed)
  // ============================================================================

  // OPTION B: Build custom buzzers directly (RECOMMENDED for PVP games).
  // Supports BOTH mouse-click AND keyboard input (Q = P1, P = P2).
  // DualPlayerSystem (OPTION A) is keyboard-only. OPTION B gives full control.
  //
  // 1. Disable the turn cycle:
  //    protected override get useTurnCycle(): boolean { return false; }
  //
  // 2. Create clickable buzzer buttons in createHUD():
  //    const buzzerBg = this.add.rectangle(0, 0, 150, 80, 0x4488ff);
  //    buzzerBg.setInteractive({ useHandCursor: true });
  //    buzzerBg.on('pointerdown', () => this.onBuzzed('P1'));
  //    const container = this.add.container(200, 400, [buzzerBg, text]);
  //
  //    CRITICAL — Container.setInteractive() PITFALL:
  //    Containers have NO implicit hitArea. Calling container.setInteractive()
  //    WITHOUT a hitArea causes: "hitAreaCallback is not a function" runtime error.
  //    ALWAYS set interactive on the INNER shape (rectangle/image), NOT the container.
  //    Put the pointerdown listener on the inner shape too.
  //
  // 3. Add KEYBOARD buzzer support (Q = P1, P = P2):
  //    private keyQ?: Phaser.Input.Keyboard.Key;
  //    private keyP?: Phaser.Input.Keyboard.Key;
  //    // In initializeBattle():
  //    this.keyQ = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
  //    this.keyP = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.P);
  //    // In enableBuzzers() (after creating mouse buttons):
  //    this.keyQ?.once('down', () => this.onBuzzerClicked('P1'));
  //    this.keyP?.once('down', () => this.onBuzzerClicked('P2'));
  //    // In onBuzzerClicked() (after setting lastBuzzedPlayerId):
  //    this.keyQ?.removeAllListeners('down');
  //    this.keyP?.removeAllListeners('down');
  //    // In nextRound() cleanup:
  //    this.keyQ?.removeAllListeners('down');
  //    this.keyP?.removeAllListeners('down');
  //
  // 4. Implement your own round loop:
  //    startNextRound() -> showQuestion() -> enableBuzzers()
  //    -> handleBuzz(player) -> showAnswerOptions() -> applyDamage() -> nextRound
  //
  // 5. Use playerHP/enemyHP as P1/P2 HP.
  //
  // 6. CRITICAL — Use QuizModal for answer option display (prevents double-click bugs):
  //    this.quizModal = new QuizModal(this, { width: 700, height: 500, showExplanation: true });
  //    this.quizModal.on('answered', (correct: boolean, idx: number) => {
  //      // QuizModal internally prevents double-clicks (sets this.answered = true)
  //      // Apply damage based on correct/wrong here
  //    });
  //    // Show question: this.quizModal.showQuestion(question);
  //
  // 7. CRITICAL — Prevent double-click on custom buttons:
  //    If NOT using QuizModal, you MUST guard answer handlers:
  //      private handleAnswer(index: number): void {
  //        if (!this.isWaitingForAnswer) return;
  //        this.isWaitingForAnswer = false;  // <-- MUST set before processing
  //        // ... process answer ...
  //      }
  //    Without this guard, rapid clicking applies damage multiple times.
  //
  // 8. Add tween feedback on buzzer press (visual polish):
  //    this.tweens.add({ targets: buzzerBg, scaleX: 0.95, scaleY: 0.95,
  //      duration: 100, yoyo: true });
  //
  // 9. Register cleanup (MUST remove keyboard keys in shutdown):
  //    this.events.once('shutdown', () => { ... cleanup timers ... });
  //
  // This approach gives full control over the PVP flow without being
  // constrained by the turn-based state machine.

  // ============================================================================
  // MODE-SPECIFIC: TURN_BASED
  // ============================================================================

  // In turn-based mode, override executeEnemyTurn() to handle Player 2.
  //
  // protected override executeEnemyTurn(): void {
  //   // Instead of AI attack, give Player 2 a turn
  //   this.dualSystem.startPlayer2Turn();
  //
  //   // Present quiz to Player 2
  //   const question = this.getRandomQuestion();
  //   if (!question) {
  //     this.completeEnemyTurn();
  //     return;
  //   }
  //
  //   // Show question with P2-specific UI
  //   // When P2 answers:
  //   // this.dualSystem.recordTurnAnswer('P2', correct);
  //   // if (!correct) this.dealDamageToPlayer(damage); // P2 fails = P1 takes damage
  //   // this.completeEnemyTurn();  // MUST call to continue turn cycle
  // }

  // ============================================================================
  // OPTIONAL: UI hooks
  // ============================================================================

  protected override createCombatants(): void {
    // TODO: Create character portraits for P1 and P2
    // IMPORTANT: CharacterPortrait(scene, config) — only 2 args!
    //   Portrait starts INVISIBLE. You MUST call .enter() to show it.
    //
    // this.p1Portrait = new CharacterPortrait(this, {
    //   id: 'p1',
    //   textureKey: 'p1_neutral',
    //   displayName: 'Player 1',
    //   position: 'left',
    //   scale: 0.35,
    //   expressions: { neutral: 'p1_neutral', angry: 'p1_angry' },
    // });
    // this.p1Portrait.enter();
    // this.p1Portrait.setDepth(5);  // behind UI elements
  }

  protected override createHUD(): void {
    // TODO: Create dual score/HP displays
    // IMPORTANT: StatusBar(scene, x, y, config) — 4 separate args!
    // const cam = this.cameras.main;
    // this.p1ScoreBar = new StatusBar(this, 150, 40, {
    //   width: 200, height: 24, maxValue: 10,
    //   label: 'P1', fillColor: 0x4488ff,
    // });
    // this.p2ScoreBar = new StatusBar(this, cam.width - 150, 40, {
    //   width: 200, height: 24, maxValue: 10,
    //   label: 'P2', fillColor: 0xff4444,
    // });
    //
    // TODO: Register scene shutdown cleanup
    // this.events.once('shutdown', () => {
    //   // if (this.dualSystem) this.dualSystem.destroy();
    //   // Remove active timers, event listeners, etc.
    // });
  }

  protected override getGameplayHints(): string[] {
    return [
      // TODO: Customize per mode
      'P1: Q to buzz, 1-4 to answer',
      'P2: P to buzz, 7-0 to answer',
      'First to buzz answers!',
    ];
  }

  protected override onBattleEnd(victory: boolean): void {
    // CRITICAL: always disable battle to prevent further actions after end
    this.isBattleActive = false;
    // TODO: Clean up UI, timers, dual system
    // if (this.dualSystem) this.dualSystem.destroy();
    // if (this.backgroundMusic) this.backgroundMusic.stop();

    // TODO: Transition to ending scene
    // this.time.delayedCall(1500, () => {
    //   if (victory) {
    //     this.scene.start('VictoryScene');
    //   } else {
    //     this.scene.start('DefeatScene');
    //   }
    // });
  }

  // ============================================================================
  // SCENE CLEANUP (if you override create)
  // ============================================================================
  //
  // If you override create(), call super.create() first, then register cleanup:
  //
  // override create(): void {
  //   super.create();
  //
  //   // Register cleanup (Phaser does NOT have overridable shutdown())
  //   this.events.once('shutdown', this.cleanupDualBattle, this);
  //   this.events.once('destroy', this.cleanupDualBattle, this);
  //
  //   // Your custom init code here...
  // }
  //
  // private cleanupDualBattle(): void {
  //   if (this.dualSystem) this.dualSystem.destroy();
  //   // Remove any timers, etc.
  // }
}
