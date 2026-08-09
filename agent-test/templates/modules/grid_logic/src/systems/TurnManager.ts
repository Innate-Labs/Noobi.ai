import Phaser from 'phaser';

// ============================================================================
// TURN MANAGER - Configurable turn/step/realtime cycle for grid logic games
// ============================================================================

/**
 * Grid game timing modes:
 * - 'step':     Each player input = one game step (Sokoban, sliding puzzle)
 * - 'turn':     Player takes multiple actions, then ends turn (tactics, chess)
 * - 'realtime': Timer-driven steps at fixed intervals (Snake, Tetris)
 * - 'freeform': No turn structure, process input immediately (Match-3)
 */
export type GridTimingMode = 'step' | 'turn' | 'realtime' | 'freeform';

/**
 * Phases within a single turn/step cycle.
 * WAITING    -> Ready for player input
 * PROCESSING -> Resolving game logic (push, match, gravity, AI)
 * ANIMATING  -> Playing visual animations
 * CHECKING   -> Evaluating win/lose conditions
 */
export type GridPhase = 'WAITING' | 'PROCESSING' | 'ANIMATING' | 'CHECKING';

export interface TurnManagerConfig {
  mode: GridTimingMode;
  maxMoves?: number;
  realtimeIntervalMs?: number;
  actionsPerTurn?: number;
}

export class TurnManager extends Phaser.Events.EventEmitter {
  private _mode: GridTimingMode;
  private _phase: GridPhase = 'WAITING';
  private _turnNumber: number = 0;
  private _moveCount: number = 0;
  private _maxMoves: number;
  private _actionsThisTurn: number = 0;
  private _actionsPerTurn: number;

  private _realtimeInterval: number;
  private _realtimeTimer: number = 0;
  private _realtimePaused: boolean = false;

  private _started: boolean = false;

  constructor(config: TurnManagerConfig) {
    super();
    this._mode = config.mode;
    this._maxMoves = config.maxMoves ?? -1;
    this._realtimeInterval = config.realtimeIntervalMs ?? 500;
    this._actionsPerTurn = config.actionsPerTurn ?? 1;
  }

  // --------------------------------------------------------------------------
  // Properties
  // --------------------------------------------------------------------------

  get mode(): GridTimingMode {
    return this._mode;
  }
  get phase(): GridPhase {
    return this._phase;
  }
  get turnNumber(): number {
    return this._turnNumber;
  }
  get moveCount(): number {
    return this._moveCount;
  }
  get maxMoves(): number {
    return this._maxMoves;
  }
  get actionsThisTurn(): number {
    return this._actionsThisTurn;
  }
  get actionsPerTurn(): number {
    return this._actionsPerTurn;
  }
  get isStarted(): boolean {
    return this._started;
  }

  get isWaitingForInput(): boolean {
    return this._phase === 'WAITING' && this._started;
  }

  get hasMovesRemaining(): boolean {
    if (this._maxMoves < 0) return true;
    return this._moveCount < this._maxMoves;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  start(): void {
    this._started = true;
    this._turnNumber = 1;
    this._moveCount = 0;
    this._actionsThisTurn = 0;
    this._realtimeTimer = 0;
    this._phase = 'WAITING';
    this.emit('turnStart', this._turnNumber);
    this.emit('phaseChanged', this._phase);
  }

  stop(): void {
    this._started = false;
    this._realtimePaused = true;
  }

  /**
   * Call this from the scene's update() loop.
   * Only relevant for 'realtime' mode -- triggers automatic steps.
   */
  update(delta: number): void {
    if (!this._started || this._mode !== 'realtime') return;
    if (this._realtimePaused) return;
    if (this._phase !== 'WAITING') return;

    this._realtimeTimer += delta;
    if (this._realtimeTimer >= this._realtimeInterval) {
      this._realtimeTimer -= this._realtimeInterval;
      this.emit('realtimeTick');
    }
  }

  // --------------------------------------------------------------------------
  // Phase Transitions
  // --------------------------------------------------------------------------

  /**
   * Signal that the player has performed an action.
   * In 'step' mode: immediately transitions to PROCESSING.
   * In 'turn' mode: increments action counter, transitions when limit reached
   *                 or when endTurn() is called.
   * In 'freeform' mode: immediately transitions to PROCESSING.
   */
  recordAction(): void {
    if (!this._started || this._phase !== 'WAITING') return;

    this._moveCount++;
    this._actionsThisTurn++;
    this.emit('moveCountChanged', this._moveCount, this._maxMoves);

    if (
      this._mode === 'step' ||
      this._mode === 'freeform' ||
      this._mode === 'realtime'
    ) {
      this.setPhase('PROCESSING');
    } else if (this._mode === 'turn') {
      if (this._actionsThisTurn >= this._actionsPerTurn) {
        this.setPhase('PROCESSING');
      }
    }
  }

  /**
   * Explicitly end the current turn (for 'turn' mode).
   * Can be called before all actions are used (voluntary end turn).
   */
  endTurn(): void {
    if (!this._started) return;
    if (this._mode === 'turn' && this._phase === 'WAITING') {
      this.setPhase('PROCESSING');
    }
  }

  /**
   * Transition to the ANIMATING phase (call after game logic is resolved).
   */
  beginAnimating(): void {
    if (this._phase === 'PROCESSING') {
      this.setPhase('ANIMATING');
    }
  }

  /**
   * Transition to the CHECKING phase (call after animations complete).
   */
  finishAnimating(): void {
    if (this._phase === 'ANIMATING') {
      this.setPhase('CHECKING');
    }
  }

  /**
   * Transition back to WAITING (call after win/lose checks pass).
   * Automatically advances turn number if needed.
   */
  finishChecking(): void {
    if (this._phase !== 'CHECKING') return;

    if (this._mode === 'step' || this._mode === 'realtime') {
      this._turnNumber++;
      this._actionsThisTurn = 0;
      this.emit('turnEnd', this._turnNumber - 1);
      this.emit('turnStart', this._turnNumber);
    } else if (this._mode === 'turn') {
      this._turnNumber++;
      this._actionsThisTurn = 0;
      this.emit('turnEnd', this._turnNumber - 1);
      this.emit('turnStart', this._turnNumber);
    }

    this.setPhase('WAITING');
  }

  /**
   * Shortcut: skip straight from PROCESSING -> WAITING
   * (when no animation is needed and win/lose check passes).
   */
  skipToWaiting(): void {
    if (
      this._phase === 'PROCESSING' ||
      this._phase === 'ANIMATING' ||
      this._phase === 'CHECKING'
    ) {
      if (this._mode !== 'freeform') {
        this._turnNumber++;
        this._actionsThisTurn = 0;
        this.emit('turnEnd', this._turnNumber - 1);
        this.emit('turnStart', this._turnNumber);
      }
      this.setPhase('WAITING');
    }
  }

  // --------------------------------------------------------------------------
  // Undo Support
  // --------------------------------------------------------------------------

  /**
   * Reverse one recorded action. Decrements move count and turn number.
   * Called by BaseGridScene.undo() to keep turn state in sync with board state.
   */
  undoAction(): void {
    if (this._moveCount > 0) {
      this._moveCount--;
      this.emit('moveCountChanged', this._moveCount, this._maxMoves);
    }
    if (this._turnNumber > 1) {
      this._turnNumber--;
    }
    this._actionsThisTurn = 0;
    this._phase = 'WAITING';
  }

  // --------------------------------------------------------------------------
  // Realtime Controls
  // --------------------------------------------------------------------------

  setRealtimeInterval(ms: number): void {
    this._realtimeInterval = ms;
  }

  pauseRealtime(): void {
    this._realtimePaused = true;
  }

  resumeRealtime(): void {
    this._realtimePaused = false;
  }

  get isRealtimePaused(): boolean {
    return this._realtimePaused;
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  setPhase(phase: GridPhase): void {
    const old = this._phase;
    this._phase = phase;
    this.emit('phaseChanged', phase, old);
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  destroy(): void {
    this.removeAllListeners();
    super.destroy();
  }
}
