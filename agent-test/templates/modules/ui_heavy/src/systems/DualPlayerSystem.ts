/**
 * ============================================================================
 * DUAL PLAYER SYSTEM - Two-player real-time interaction manager
 * ============================================================================
 *
 * Manages two-player local gameplay: input splitting, per-player state,
 * buzzer/race mechanics, and score tracking.
 *
 * NOT a base class. This is a COMPOSABLE SYSTEM that a battle scene can
 * instantiate and use. It does NOT modify BaseBattleScene's turn flow.
 * Instead, the subclass uses BaseBattleScene's existing hooks (especially
 * executeEnemyTurn) to integrate Player 2's turn.
 *
 * SUPPORTED MODES:
 *   1. TURN_BASED: Players alternate turns. P1 plays, then P2, repeat.
 *      Integration: Override executeEnemyTurn() to run P2's card/quiz turn.
 *   2. BUZZER_RACE: Both see the same question. First to buzz gets to answer.
 *      Integration: In onQuizPhaseStart(), call dualSystem.startBuzzerRound().
 *   3. SIMULTANEOUS: Both answer independently. Score by correctness + speed.
 *      Integration: In onQuizPhaseStart(), call dualSystem.startSimultaneousRound().
 *
 * EVENTS (via Phaser.Events.EventEmitter):
 *   - 'playerBuzzed': (playerId: string) => void
 *   - 'playerAnswered': (playerId: string, answerIndex: number, timeMs: number) => void
 *   - 'roundResult': (result: RoundResult) => void
 *   - 'scoreChanged': (playerId: string, newScore: number) => void
 *   - 'gameOver': (winnerId: string) => void
 *
 * USAGE (in a BaseBattleScene subclass):
 *   // In initializeBattle():
 *   this.dualSystem = new DualPlayerSystem(this, {
 *     mode: 'BUZZER_RACE',
 *     scoreToWin: 10,
 *     player1: { id: 'P1', name: 'Player 1', color: 0x4488ff,
 *       keys: { buzz: Phaser.Input.Keyboard.KeyCodes.Q,
 *               answers: [ONE, TWO, THREE, FOUR] } },
 *     player2: { id: 'P2', name: 'Player 2', color: 0xff4444,
 *       keys: { buzz: Phaser.Input.Keyboard.KeyCodes.P,
 *               answers: [SEVEN, EIGHT, NINE, ZERO] } },
 *   });
 *
 *   // Listen for events (IMPORTANT: store buzzed player for later use):
 *   this.dualSystem.on('playerBuzzed', (playerId) => {
 *     this.lastBuzzedPlayerId = playerId;  // MUST store for damage attribution
 *   });
 *   this.dualSystem.on('roundResult', (result) => { updateScoreUI(result); });
 *
 *   // In onQuizPhaseStart() (BUZZER_RACE mode):
 *   this.dualSystem.startBuzzerRound(this.currentQuestion!);
 *
 *   // In executeEnemyTurn() (TURN_BASED mode):
 *   this.dualSystem.startPlayer2Turn();
 */

import Phaser from 'phaser';
import { type QuizQuestion } from '../scenes/BaseBattleScene';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** Dual-player game mode */
export type DualPlayerMode = 'TURN_BASED' | 'BUZZER_RACE' | 'SIMULTANEOUS';

/** Key binding configuration for one player */
export interface PlayerKeyConfig {
  /** Buzzer key (used in BUZZER_RACE mode) */
  buzz: number;
  /** Answer keys [option0, option1, option2, option3] (used in SIMULTANEOUS mode) */
  answers: number[];
}

/** Player configuration */
export interface DualPlayerConfig {
  /** Player identifier ('P1' or 'P2', or custom) */
  id: string;
  /** Display name */
  name: string;
  /** Player color (hex) for UI elements */
  color: number;
  /** Key bindings */
  keys: PlayerKeyConfig;
}

/** System configuration */
export interface DualPlayerSystemConfig {
  /** Game mode */
  mode: DualPlayerMode;
  /** Score needed to win (0 = no win condition, scene handles it) */
  scoreToWin?: number;
  /** Player 1 config */
  player1: DualPlayerConfig;
  /** Player 2 config */
  player2: DualPlayerConfig;
  /** Time limit per buzzer round in ms (0 = no limit) */
  buzzerTimeLimit?: number;
  /** Points for correct answer */
  correctPoints?: number;
  /** Points deducted for wrong answer */
  wrongPenalty?: number;
  /** Bonus points for faster answer in SIMULTANEOUS mode */
  speedBonus?: number;
}

/** Result of a single round */
export interface RoundResult {
  /** Round number */
  round: number;
  /** Who won the round (null = tie or no winner) */
  winnerId: string | null;
  /** Per-player details */
  details: {
    playerId: string;
    answered: boolean;
    correct: boolean;
    timeMs: number;
    pointsEarned: number;
  }[];
}

/** Per-player state */
interface PlayerState {
  config: DualPlayerConfig;
  score: number;
  correctCount: number;
  wrongCount: number;
  streak: number;
  bestStreak: number;
  buzzKey?: Phaser.Input.Keyboard.Key;
  answerKeys: Phaser.Input.Keyboard.Key[];
}

// ============================================================================
// SYSTEM CLASS
// ============================================================================

export class DualPlayerSystem extends Phaser.Events.EventEmitter {
  private scene: Phaser.Scene;
  private config: DualPlayerSystemConfig;
  private players: Map<string, PlayerState> = new Map();
  private roundNumber: number = 0;
  private isRoundActive: boolean = false;
  private currentQuestion?: QuizQuestion;

  // Buzzer state
  private buzzedPlayerId?: string;
  private roundStartTime: number = 0;
  private buzzerTimer?: Phaser.Time.TimerEvent;
  private answerTimer?: Phaser.Time.TimerEvent;

  // Simultaneous state
  private playerAnswers: Map<string, { index: number; timeMs: number }> =
    new Map();

  constructor(scene: Phaser.Scene, config: DualPlayerSystemConfig) {
    super();
    this.scene = scene;
    this.config = {
      scoreToWin: 0,
      buzzerTimeLimit: 0,
      correctPoints: 1,
      wrongPenalty: 0,
      speedBonus: 0,
      ...config,
    };
    this.setupPlayers();
  }

  // ============================================================================
  // SETUP
  // ============================================================================

  private setupPlayers(): void {
    [this.config.player1, this.config.player2].forEach((pc) => {
      const state: PlayerState = {
        config: pc,
        score: 0,
        correctCount: 0,
        wrongCount: 0,
        streak: 0,
        bestStreak: 0,
        answerKeys: [],
      };

      // Register buzz key
      if (this.scene.input.keyboard) {
        state.buzzKey = this.scene.input.keyboard.addKey(pc.keys.buzz);
        state.answerKeys = pc.keys.answers.map((k) =>
          this.scene.input.keyboard!.addKey(k),
        );
      }

      this.players.set(pc.id, state);
    });
  }

  // ============================================================================
  // BUZZER RACE MODE
  // ============================================================================

  /**
   * Start a buzzer race round. Both players see the question.
   * First to press their buzz key gets to answer.
   * Call this from onQuizPhaseStart() or similar hook.
   */
  startBuzzerRound(question: QuizQuestion): void {
    this.roundNumber++;
    this.isRoundActive = true;
    this.buzzedPlayerId = undefined;
    this.currentQuestion = question;
    this.roundStartTime = Date.now();

    // Listen for buzz keys
    this.players.forEach((state, id) => {
      state.buzzKey?.once('down', () => {
        if (this.isRoundActive && !this.buzzedPlayerId) {
          this.buzzedPlayerId = id;
          this.emit('playerBuzzed', id);
          this.waitForBuzzerAnswer(id);
        }
      });
    });

    // Optional time limit
    if (this.config.buzzerTimeLimit && this.config.buzzerTimeLimit > 0) {
      this.buzzerTimer = this.scene.time.delayedCall(
        this.config.buzzerTimeLimit,
        () => {
          if (this.isRoundActive && !this.buzzedPlayerId) {
            // Nobody buzzed - round expires
            this.isRoundActive = false;
            this.emit('roundResult', this.buildRoundResult(null, []));
          }
        },
      );
    }
  }

  /**
   * After a player buzzes, listen for their answer key press.
   * Starts an answer timeout (uses buzzerTimeLimit) — if the buzzed player
   * doesn't answer in time, the round ends with a wrong-answer penalty.
   */
  private waitForBuzzerAnswer(playerId: string): void {
    const state = this.players.get(playerId);
    if (!state || !this.currentQuestion) return;

    // Disable the other player's buzz key
    this.players.forEach((s, id) => {
      if (id !== playerId) {
        s.buzzKey?.removeAllListeners('down');
      }
    });

    // Cancel buzzer timer
    if (this.buzzerTimer) {
      this.buzzerTimer.remove();
      this.buzzerTimer = undefined;
    }

    // Listen for answer keys
    state.answerKeys.forEach((key, answerIndex) => {
      key.once('down', () => {
        if (!this.isRoundActive) return;
        // Cancel answer timeout
        if (this.answerTimer) {
          this.answerTimer.remove();
          this.answerTimer = undefined;
        }
        this.isRoundActive = false;
        const timeMs = Date.now() - this.roundStartTime;
        this.handleBuzzerAnswer(playerId, answerIndex, timeMs);
      });
    });

    // Answer timeout: if the buzzed player doesn't answer in time, treat as wrong
    if (this.config.buzzerTimeLimit && this.config.buzzerTimeLimit > 0) {
      this.answerTimer = this.scene.time.delayedCall(
        this.config.buzzerTimeLimit,
        () => {
          if (!this.isRoundActive) return;
          this.isRoundActive = false;
          this.cleanupRoundListeners();
          // Penalize the buzzed player for not answering
          state.wrongCount++;
          state.streak = 0;
          const penalty = -(this.config.wrongPenalty ?? 0);
          state.score = Math.max(0, state.score + penalty);
          this.emit('scoreChanged', playerId, state.score);
          this.emit(
            'roundResult',
            this.buildRoundResult(null, [
              {
                playerId,
                answered: false,
                correct: false,
                timeMs: this.config.buzzerTimeLimit!,
                pointsEarned: penalty,
              },
            ]),
          );
          this.checkWinCondition();
        },
      );
    }
  }

  private handleBuzzerAnswer(
    playerId: string,
    answerIndex: number,
    timeMs: number,
  ): void {
    if (!this.currentQuestion) return;
    const correct = answerIndex === this.currentQuestion.correctIndex;
    const state = this.players.get(playerId)!;

    // Clean up all listeners
    this.cleanupRoundListeners();

    // Update stats
    let pointsEarned = 0;
    if (correct) {
      pointsEarned = this.config.correctPoints ?? 1;
      state.correctCount++;
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
    } else {
      pointsEarned = -(this.config.wrongPenalty ?? 0);
      state.wrongCount++;
      state.streak = 0;
    }
    state.score = Math.max(0, state.score + pointsEarned);

    this.emit('playerAnswered', playerId, answerIndex, timeMs);
    this.emit('scoreChanged', playerId, state.score);

    // Build result
    const result = this.buildRoundResult(correct ? playerId : null, [
      {
        playerId,
        answered: true,
        correct,
        timeMs,
        pointsEarned,
      },
    ]);
    this.emit('roundResult', result);

    // Check win condition
    this.checkWinCondition();
  }

  // ============================================================================
  // SIMULTANEOUS MODE
  // ============================================================================

  /**
   * Start a simultaneous answer round. Both players answer independently.
   * Points awarded based on correctness. Faster correct answer gets bonus.
   * Call this from onQuizPhaseStart() or similar hook.
   */
  startSimultaneousRound(question: QuizQuestion): void {
    this.roundNumber++;
    this.isRoundActive = true;
    this.currentQuestion = question;
    this.playerAnswers.clear();
    this.roundStartTime = Date.now();

    // Listen for both players' answer keys
    this.players.forEach((state, playerId) => {
      state.answerKeys.forEach((key, answerIndex) => {
        key.once('down', () => {
          if (!this.isRoundActive || this.playerAnswers.has(playerId)) return;
          const timeMs = Date.now() - this.roundStartTime;
          this.playerAnswers.set(playerId, { index: answerIndex, timeMs });
          this.emit('playerAnswered', playerId, answerIndex, timeMs);

          // Check if both answered
          if (this.playerAnswers.size >= 2) {
            this.resolveSimultaneousRound();
          }
        });
      });
    });

    // Time limit
    if (this.config.buzzerTimeLimit && this.config.buzzerTimeLimit > 0) {
      this.buzzerTimer = this.scene.time.delayedCall(
        this.config.buzzerTimeLimit,
        () => {
          if (this.isRoundActive) {
            this.resolveSimultaneousRound();
          }
        },
      );
    }
  }

  private resolveSimultaneousRound(): void {
    if (!this.isRoundActive || !this.currentQuestion) return;
    this.isRoundActive = false;

    if (this.buzzerTimer) {
      this.buzzerTimer.remove();
      this.buzzerTimer = undefined;
    }

    this.cleanupRoundListeners();

    const details: RoundResult['details'] = [];
    let winnerId: string | null = null;
    let bestTime = Infinity;

    this.players.forEach((state, playerId) => {
      const answer = this.playerAnswers.get(playerId);
      const answered = !!answer;
      const correct =
        answered && answer!.index === this.currentQuestion!.correctIndex;
      const timeMs = answer?.timeMs ?? 0;

      let pointsEarned = 0;
      if (answered) {
        if (correct) {
          pointsEarned = this.config.correctPoints ?? 1;
          state.correctCount++;
          state.streak++;
          state.bestStreak = Math.max(state.bestStreak, state.streak);
        } else {
          pointsEarned = -(this.config.wrongPenalty ?? 0);
          state.wrongCount++;
          state.streak = 0;
        }
      }

      // Track fastest correct answer for speed bonus
      if (correct && timeMs < bestTime) {
        bestTime = timeMs;
        winnerId = playerId;
      }

      state.score = Math.max(0, state.score + pointsEarned);
      this.emit('scoreChanged', playerId, state.score);

      details.push({ playerId, answered, correct, timeMs, pointsEarned });
    });

    // Speed bonus for fastest correct
    if (winnerId && (this.config.speedBonus ?? 0) > 0) {
      const winnerState = this.players.get(winnerId)!;
      winnerState.score += this.config.speedBonus!;
      this.emit('scoreChanged', winnerId, winnerState.score);
      // Update detail
      const winnerDetail = details.find((d) => d.playerId === winnerId);
      if (winnerDetail) winnerDetail.pointsEarned += this.config.speedBonus!;
    }

    const result = this.buildRoundResult(winnerId, details);
    this.emit('roundResult', result);

    this.checkWinCondition();
  }

  // ============================================================================
  // TURN-BASED MODE HELPERS
  // ============================================================================

  /**
   * Signal that Player 2's turn is starting (TURN_BASED mode).
   * The battle scene's executeEnemyTurn() override should call this,
   * then present a card/quiz UI to Player 2.
   * The scene handles the actual UI; this just tracks state.
   */
  startPlayer2Turn(): void {
    this.roundNumber++;
  }

  /**
   * Record Player 2's quiz answer in TURN_BASED mode.
   * Call from the scene's quiz answer handler when it's P2's turn.
   */
  recordTurnAnswer(playerId: string, correct: boolean): void {
    const state = this.players.get(playerId);
    if (!state) return;

    if (correct) {
      state.correctCount++;
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.score += this.config.correctPoints ?? 1;
    } else {
      state.wrongCount++;
      state.streak = 0;
      state.score = Math.max(0, state.score - (this.config.wrongPenalty ?? 0));
    }

    this.emit('scoreChanged', playerId, state.score);
  }

  // ============================================================================
  // QUERY
  // ============================================================================

  /** Get a player's current score. */
  getScore(playerId: string): number {
    return this.players.get(playerId)?.score ?? 0;
  }

  /** Get a player's config. */
  getPlayerConfig(playerId: string): DualPlayerConfig | undefined {
    return this.players.get(playerId)?.config;
  }

  /** Get all player IDs. */
  getPlayerIds(): string[] {
    return [...this.players.keys()];
  }

  /** Get current round number. */
  getRound(): number {
    return this.roundNumber;
  }

  /** Get player stats. */
  getPlayerStats(playerId: string):
    | {
        score: number;
        correct: number;
        wrong: number;
        streak: number;
        bestStreak: number;
      }
    | undefined {
    const s = this.players.get(playerId);
    if (!s) return undefined;
    return {
      score: s.score,
      correct: s.correctCount,
      wrong: s.wrongCount,
      streak: s.streak,
      bestStreak: s.bestStreak,
    };
  }

  /** Determine the winner (by score). Returns null if tied. */
  getWinner(): DualPlayerConfig | null {
    const ids = this.getPlayerIds();
    if (ids.length < 2) return null;
    const s1 = this.players.get(ids[0])!;
    const s2 = this.players.get(ids[1])!;
    if (s1.score > s2.score) return s1.config;
    if (s2.score > s1.score) return s2.config;
    return null;
  }

  /** Get the game mode. */
  getMode(): DualPlayerMode {
    return this.config.mode;
  }

  /** Check if a round is currently active. */
  isActive(): boolean {
    return this.isRoundActive;
  }

  // ============================================================================
  // RESET
  // ============================================================================

  /** Reset all scores and stats. */
  reset(): void {
    this.players.forEach((state) => {
      state.score = 0;
      state.correctCount = 0;
      state.wrongCount = 0;
      state.streak = 0;
      state.bestStreak = 0;
    });
    this.roundNumber = 0;
    this.isRoundActive = false;
    this.buzzedPlayerId = undefined;
    this.currentQuestion = undefined;
    this.playerAnswers.clear();
  }

  /** Clean up keyboard listeners and timers. Call when scene shuts down. */
  destroy(): void {
    this.cleanupRoundListeners();
    if (this.buzzerTimer) {
      this.buzzerTimer.remove();
      this.buzzerTimer = undefined;
    }
    if (this.answerTimer) {
      this.answerTimer.remove();
      this.answerTimer = undefined;
    }
    this.removeAllListeners();
    super.destroy();
  }

  // ============================================================================
  // INTERNAL
  // ============================================================================

  private cleanupRoundListeners(): void {
    this.players.forEach((state) => {
      state.buzzKey?.removeAllListeners('down');
      state.answerKeys.forEach((k) => k.removeAllListeners('down'));
    });
  }

  private buildRoundResult(
    winnerId: string | null,
    details: RoundResult['details'],
  ): RoundResult {
    return {
      round: this.roundNumber,
      winnerId,
      details,
    };
  }

  private checkWinCondition(): void {
    if (!this.config.scoreToWin || this.config.scoreToWin <= 0) return;
    // Find the first player who reached the win threshold.
    // Only emit one 'gameOver' event (the highest scorer wins if both qualify).
    let winnerId: string | null = null;
    let highestScore = -1;
    this.players.forEach((state, id) => {
      if (
        state.score >= this.config.scoreToWin! &&
        state.score > highestScore
      ) {
        highestScore = state.score;
        winnerId = id;
      }
    });
    if (winnerId) {
      this.emit('gameOver', winnerId);
    }
  }
}
