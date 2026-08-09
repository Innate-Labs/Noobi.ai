/**
 * ============================================================================
 * QUIZ MODAL - Quiz question popup dialog
 * ============================================================================
 *
 * Extends ModalOverlay to display quiz questions with:
 * - Question text
 * - Multiple choice answer buttons
 * - Correct/wrong visual feedback
 * - Explanation panel (for educational games)
 *
 * EVENTS:
 *   - 'answered': (correct: boolean, selectedIndex: number) => void
 *   - 'feedbackDismissed': () => void
 *
 * USAGE:
 *   const quiz = new QuizModal(scene);
 *   quiz.showQuestion({
 *     question: 'What is 2+2?',
 *     options: ['3', '4', '5', '6'],
 *     correctIndex: 1,
 *     explanation: '2+2=4',
 *   });
 *   quiz.on('answered', (correct, index) => { ... });
 */

import Phaser from 'phaser';
import { ModalOverlay, type ModalConfig } from './ModalOverlay';
import { type QuizQuestion } from '../scenes/BaseBattleScene';

export interface QuizModalConfig extends ModalConfig {
  /** Time limit in seconds (0 = no limit, default: 0) */
  timeLimit?: number;
  /** Show explanation after answering (default: true) */
  showExplanation?: boolean;
  /** Question text style */
  questionStyle?: Phaser.Types.GameObjects.Text.TextStyle;
  /** Answer button style */
  answerStyle?: Phaser.Types.GameObjects.Text.TextStyle;
}

export class QuizModal extends ModalOverlay {
  private quizConfig: QuizModalConfig;
  private currentQuestion?: QuizQuestion;
  private questionText?: Phaser.GameObjects.Text;
  private answerButtons: Phaser.GameObjects.Container[] = [];
  private explanationText?: Phaser.GameObjects.Text;
  private feedbackText?: Phaser.GameObjects.Text;
  private continueText?: Phaser.GameObjects.Text;
  private answered: boolean = false;

  // Track pending dismiss handlers to prevent leaks
  private pendingDismissHandler?: () => void;
  private pendingDismissEnterKey?: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene, config?: QuizModalConfig) {
    super(scene, { width: 700, height: 500, ...(config ?? {}) });
    this.quizConfig = config ?? {};
  }

  // -- Public API --

  /** Show a quiz question in the modal. */
  showQuestion(question: QuizQuestion): void {
    // Clean up any stale dismiss handlers from a previous explanation
    this.cleanupDismissHandlers();

    this.currentQuestion = question;
    this.answered = false;
    this.clearQuizContent();
    this.createQuestionUI(question);
    this.show();
  }

  /** Show the explanation panel (after answering). */
  showExplanation(question: QuizQuestion, wasCorrect: boolean): void {
    // Remove answer buttons
    this.answerButtons.forEach((b) => b.destroy());
    this.answerButtons = [];

    // Feedback result
    const resultStr = wasCorrect ? 'CORRECT!' : 'WRONG!';
    const resultColor = wasCorrect ? '#00ff00' : '#ff4444';
    this.feedbackText = this.scene.add
      .text(0, -80, resultStr, {
        fontSize: '32px',
        fontFamily: 'Arial',
        color: resultColor,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.content.add(this.feedbackText);

    // Explanation
    if (question.explanation) {
      this.explanationText = this.scene.add
        .text(0, -20, question.explanation, {
          fontSize: '16px',
          fontFamily: 'Arial',
          color: '#dddddd',
          wordWrap: { width: 550 },
          align: 'center',
          lineSpacing: 4,
        })
        .setOrigin(0.5, 0);
      this.content.add(this.explanationText);
    }

    // Continue prompt
    this.continueText = this.scene.add
      .text(0, 120, 'Click or press Enter to continue...', {
        fontSize: '14px',
        fontFamily: 'Arial',
        color: '#888888',
      })
      .setOrigin(0.5);
    this.content.add(this.continueText);

    // Blink
    this.scene.tweens.add({
      targets: this.continueText,
      alpha: { from: 1, to: 0.3 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    // Wait for dismiss
    const dismiss = () => {
      this.cleanupDismissHandlers();
      this.hide();
      this.emit('feedbackDismissed');
    };

    // Store references for cleanup
    this.pendingDismissHandler = dismiss;
    const enterKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    );
    this.pendingDismissEnterKey = enterKey;

    this.scene.time.delayedCall(500, () => {
      if (this.pendingDismissHandler === dismiss) {
        this.scene.input.on('pointerdown', dismiss);
        enterKey?.on('down', dismiss);
      }
    });
  }

  /** Remove any pending dismiss event handlers to prevent leaks. */
  private cleanupDismissHandlers(): void {
    if (this.pendingDismissHandler) {
      this.scene.input.off('pointerdown', this.pendingDismissHandler);
      this.pendingDismissHandler = undefined;
    }
    if (this.pendingDismissEnterKey) {
      this.pendingDismissEnterKey.off('down');
      this.pendingDismissEnterKey = undefined;
    }
  }

  // -- Internal --

  private createQuestionUI(question: QuizQuestion): void {
    const panelW = (this.modalConfig.width ?? 700) - 60;

    // Question text
    this.questionText = this.scene.add
      .text(0, -150, question.question, {
        fontSize: '22px',
        fontFamily: 'Arial',
        color: '#ffffff',
        fontStyle: 'bold',
        wordWrap: { width: panelW },
        align: 'center',
        lineSpacing: 6,
        ...(this.quizConfig.questionStyle ?? {}),
      })
      .setOrigin(0.5, 0);
    this.content.add(this.questionText);

    // Answer buttons
    const btnWidth = panelW - 40;
    const btnHeight = 45;
    const spacing = 12;
    const startY = -30;

    question.options.forEach((option, index) => {
      const y = startY + index * (btnHeight + spacing);
      const btn = this.createAnswerButton(
        option,
        index,
        y,
        btnWidth,
        btnHeight,
      );
      this.answerButtons.push(btn);
      this.content.add(btn);
    });
  }

  private createAnswerButton(
    text: string,
    index: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, y);
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const prefix = letters[index] ?? String(index + 1);

    // Background
    const bg = this.scene.add.rectangle(0, 0, width, height, 0x2a2a4a, 0.9);
    bg.setOrigin(0.5);
    bg.setStrokeStyle(1, 0x6666aa);
    container.add(bg);

    // Letter circle
    const circle = this.scene.add.circle(-width / 2 + 30, 0, 15, 0x4444aa);
    container.add(circle);
    const letterText = this.scene.add
      .text(-width / 2 + 30, 0, prefix, {
        fontSize: '14px',
        fontFamily: 'Arial',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add(letterText);

    // Answer text
    const answerText = this.scene.add
      .text(-width / 2 + 55, 0, text, {
        fontSize: '16px',
        fontFamily: 'Arial',
        color: '#ffffff',
        ...(this.quizConfig.answerStyle ?? {}),
      })
      .setOrigin(0, 0.5);
    container.add(answerText);

    // Interactivity
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      if (!this.answered) {
        bg.setFillStyle(0x4444aa, 1);
      }
    });
    bg.on('pointerout', () => {
      if (!this.answered) {
        bg.setFillStyle(0x2a2a4a, 0.9);
      }
    });
    bg.on('pointerdown', () => {
      if (!this.answered) {
        this.answered = true;
        this.onAnswerSelected(index, bg);
      }
    });

    return container;
  }

  private onAnswerSelected(
    index: number,
    clickedBg: Phaser.GameObjects.Rectangle,
  ): void {
    if (!this.currentQuestion) return;
    const correct = index === this.currentQuestion.correctIndex;

    // Visual feedback: highlight correct/wrong
    this.answerButtons.forEach((btn, i) => {
      const bg = btn.list[0] as Phaser.GameObjects.Rectangle;
      if (bg) {
        bg.disableInteractive();
        if (i === this.currentQuestion!.correctIndex) {
          bg.setFillStyle(0x006600, 1); // Green for correct
        } else if (i === index && !correct) {
          bg.setFillStyle(0x660000, 1); // Red for wrong selection
        }
      }
    });

    this.emit('answered', correct, index);

    // Show explanation after brief delay (only if modal is still visible)
    if (this.quizConfig.showExplanation !== false) {
      this.scene.time.delayedCall(800, () => {
        // Guard: don't show explanation if the modal was already hidden
        // (e.g., resolveCardAction hides it before the explanation fires)
        if (this.isShowing) {
          this.showExplanation(this.currentQuestion!, correct);
        }
      });
    }
  }

  private clearQuizContent(): void {
    this.answerButtons.forEach((b) => b.destroy());
    this.answerButtons = [];
    if (this.questionText) {
      this.questionText.destroy();
      this.questionText = undefined;
    }
    if (this.explanationText) {
      this.explanationText.destroy();
      this.explanationText = undefined;
    }
    if (this.feedbackText) {
      this.feedbackText.destroy();
      this.feedbackText = undefined;
    }
    if (this.continueText) {
      this.continueText.destroy();
      this.continueText = undefined;
    }
    // Clear all from content container
    this.content.removeAll(true);
  }
}
