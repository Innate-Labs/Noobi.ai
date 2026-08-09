import Phaser from 'phaser';
import { BoardManager, type BoardConfig } from '../systems/BoardManager';
import { TurnManager, type TurnManagerConfig } from '../systems/TurnManager';
import { AnimationQueue } from '../systems/AnimationQueue';
import { BaseGridEntity } from '../entities/BaseGridEntity';
import {
  worldToGrid,
  highlightCells,
  highlightSelectedCell,
  getDirectionDelta,
  type GridPoint,
  type Direction,
} from '../utils';
// ============================================================================
// BASE GRID SCENE - Main engine for grid logic games
// ============================================================================
// Provides: board management, input handling, turn/step cycle, animation queue,
// entity management, grid rendering, win/lose checking.
//
// Subclass this via _TemplateGridLevel.ts (COPY pattern) and implement
// the abstract methods for your specific game.
// ============================================================================

export class BaseGridScene extends Phaser.Scene {
  // --------------------------------------------------------------------------
  // Systems
  // --------------------------------------------------------------------------

  protected boardManager!: BoardManager;
  protected turnManager!: TurnManager;
  protected animationQueue!: AnimationQueue;

  // --------------------------------------------------------------------------
  // Entity Management
  // --------------------------------------------------------------------------

  protected entities: BaseGridEntity[] = [];
  protected entitiesGroup!: Phaser.GameObjects.Group;

  // --------------------------------------------------------------------------
  // Selection & Highlighting
  // --------------------------------------------------------------------------

  protected selectedEntity: BaseGridEntity | null = null;
  protected selectedCell: GridPoint | null = null;
  protected highlightGraphics: Phaser.GameObjects.Graphics | null = null;
  protected selectionGraphics: Phaser.GameObjects.Graphics | null = null;

  // --------------------------------------------------------------------------
  // Grid Visual
  // --------------------------------------------------------------------------

  protected gridLinesGraphics: Phaser.GameObjects.Graphics | null = null;

  // --------------------------------------------------------------------------
  // Cached Config
  // --------------------------------------------------------------------------

  protected cellSize: number = 64;
  protected gridCols: number = 10;
  protected gridRows: number = 10;
  protected gridOffsetX: number = 0;
  protected gridOffsetY: number = 0;
  protected cells!: number[][];

  // --------------------------------------------------------------------------
  // Input State
  // --------------------------------------------------------------------------

  private _inputLocked: boolean = false;
  protected cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  protected wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  protected undoKey!: Phaser.Input.Keyboard.Key;
  protected escKey!: Phaser.Input.Keyboard.Key;
  protected actionKey!: Phaser.Input.Keyboard.Key;
  private _keyDebounce: Map<string, number> = new Map();
  private _keyDebounceMs: number = 150;

  // --------------------------------------------------------------------------
  // Phaser Lifecycle
  // --------------------------------------------------------------------------

  public create(): void {
    this.onPreCreate();

    const boardConfig = this.getBoardConfig();
    this.cellSize = boardConfig.cellSize;
    this.gridCols = boardConfig.cols;
    this.gridRows = boardConfig.rows;
    this.gridOffsetX = boardConfig.offsetX ?? 0;
    this.gridOffsetY = boardConfig.offsetY ?? 0;
    this.cells = boardConfig.cells;

    this.boardManager = new BoardManager(boardConfig);

    const turnConfig = this.getTurnConfig();
    this.turnManager = new TurnManager(turnConfig);

    this.animationQueue = new AnimationQueue(this);

    this.entitiesGroup = this.add.group();

    this.setupInput();
    this.setupEventListeners();

    this.createEnvironment();
    this.createEntities();

    this.scene.launch('UIScene', {
      gameSceneKey: this.scene.key,
      turnMode: turnConfig.mode,
      maxMoves: turnConfig.maxMoves ?? -1,
    });

    this.turnManager.start();
    this.onPostCreate();
  }

  public update(time: number, delta: number): void {
    this.onPreUpdate(time, delta);

    this.turnManager.update(delta);

    if (this.turnManager.isWaitingForInput && !this._inputLocked) {
      this.processInput(time);
    }

    this.onPostUpdate(time, delta);
  }

  public shutdown(): void {
    this.scene.stop('UIScene');
    this.boardManager?.destroy();
    this.turnManager?.destroy();
    this.animationQueue?.destroy();
    this.highlightGraphics?.destroy();
    this.selectionGraphics?.destroy();
    this.gridLinesGraphics?.destroy();
    this.entities.forEach((e) => e.destroy());
    this.entities.length = 0;
  }

  // --------------------------------------------------------------------------
  // Abstract Methods (MUST implement in every level)
  // --------------------------------------------------------------------------

  /**
   * Return the board configuration: grid dimensions, cell size, initial cell states.
   */
  protected getBoardConfig(): BoardConfig {
    throw new Error('getBoardConfig() must be implemented');
  }

  /**
   * Return the turn/step timing configuration.
   */
  protected getTurnConfig(): TurnManagerConfig {
    return { mode: 'step' };
  }

  /**
   * Set up the visual environment: background image, grid overlay, decorations.
   */
  protected createEnvironment(): void {
    throw new Error('createEnvironment() must be implemented');
  }

  /**
   * Create and place all game entities on the board.
   */
  protected createEntities(): void {
    throw new Error('createEntities() must be implemented');
  }

  /**
   * Check if the win condition is met. Called after each move is processed.
   * Return true to trigger victory.
   */
  protected checkWinCondition(): boolean {
    return false;
  }

  /**
   * Check if the lose condition is met. Called after each move is processed.
   * Return true to trigger game over.
   */
  protected checkLoseCondition(): boolean {
    return false;
  }

  // --------------------------------------------------------------------------
  // Hook Methods (CAN override -- default does nothing)
  // --------------------------------------------------------------------------

  protected onPreCreate(): void {}
  protected onPostCreate(): void {}
  protected onPreUpdate(time: number, delta: number): void {}
  protected onPostUpdate(time: number, delta: number): void {}

  /**
   * Called when a grid cell is clicked/tapped.
   * This is the PRIMARY input handler for click-based grid games.
   */
  protected onCellClicked(gridX: number, gridY: number): void {}

  /**
   * Called when the mouse hovers over a grid cell.
   */
  protected onCellHovered(gridX: number, gridY: number): void {}

  /**
   * Called when an arrow key or WASD key is pressed.
   * Override for movement-based games (Sokoban, roguelike, etc).
   */
  protected onDirectionInput(
    direction: 'up' | 'down' | 'left' | 'right',
  ): void {}

  /**
   * Called when the action key (Spacebar) is pressed.
   * Override for special abilities (attack, interact, confirm).
   */
  protected onActionInput(): void {}

  /**
   * Called when an entity on the board is clicked.
   */
  protected onEntityClicked(entity: BaseGridEntity): void {}

  /**
   * Called after an entity finishes moving to a new cell.
   * Both data (BoardManager) and visual (sprite) are updated.
   */
  protected onEntityMoved(
    entity: BaseGridEntity,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): void {}

  /**
   * Called when an entity enters a cell. Fires after moveEntity completes.
   * Use for tile interactions: traps deal damage, grass grants stealth,
   * keys get collected, holes get filled, etc.
   */
  protected onEntityEnteredCell(
    entity: BaseGridEntity,
    gridX: number,
    gridY: number,
    cellType: number,
  ): void {}

  /**
   * Called when an entity's health reaches 0.
   * Use to handle death: remove entity, play animation, check lose condition.
   */
  protected onEntityDeath(entity: BaseGridEntity): void {}

  /**
   * Called at the start of a new turn.
   */
  protected onTurnStart(turnNumber: number): void {}

  /**
   * Called at the end of a turn.
   */
  protected onTurnEnd(turnNumber: number): void {}

  /**
   * Called after player game logic is processed (before animation).
   * Use this to enqueue animations for the player's action.
   */
  protected onProcessComplete(): void {}

  /**
   * Called after player animations finish.
   * The WORLD PHASE: resolve tile interactions (traps activate, doors open).
   * Enqueue any world animations here; they play before the enemy phase.
   */
  protected onWorldPhase(): void {}

  /**
   * Called after world phase animations finish.
   * The ENEMY PHASE: all non-player entities take their step (AI, patrol, emit).
   * Enqueue enemy movement/attack animations here.
   */
  protected onEnemyPhase(): void {}

  /**
   * Called after all queued animations finish playing.
   */
  protected onAnimationComplete(): void {}

  /**
   * Called after each full cycle (player + world + enemy) is processed and animated.
   * Use for chain reactions (Match-3 cascades, gravity refill).
   * Return true if another processing cycle is needed.
   */
  protected onMoveProcessed(): boolean {
    return false;
  }

  /**
   * Called when the win condition is met.
   * Default: launch VictoryUIScene.
   */
  protected onWinConditionMet(): void {
    this.scene.launch('VictoryUIScene', { gameSceneKey: this.scene.key });
    this.scene.pause();
  }

  /**
   * Called when the lose condition is met.
   * Default: launch GameOverUIScene.
   */
  protected onLoseConditionMet(): void {
    this.scene.launch('GameOverUIScene', { gameSceneKey: this.scene.key });
    this.scene.pause();
  }

  /**
   * Called when the board state changes (cells or entities).
   */
  protected onBoardStateChanged(): void {}

  /**
   * Called when an undo operation completes.
   */
  protected onUndoPerformed(): void {}

  /**
   * Called for realtime mode on each tick interval.
   * Override to implement timer-driven game steps (Snake, Tetris).
   */
  protected onRealtimeTick(): void {}

  // --------------------------------------------------------------------------
  // Entity Management (public API for level scenes)
  // --------------------------------------------------------------------------

  /**
   * Add an entity to the board. Sets up grid params, scaling, and tracking.
   */
  protected addEntity(entity: BaseGridEntity): void {
    entity.initGridParams(this.cellSize, this.gridOffsetX, this.gridOffsetY);
    entity.scaleToGrid(this.cellSize);

    this.entities.push(entity);
    this.entitiesGroup.add(entity);

    this.boardManager.placeEntity({
      id: entity.entityId,
      entityType: entity.entityType,
      gridX: entity.gridX,
      gridY: entity.gridY,
    });

    entity.onPlaced();
  }

  /**
   * Remove an entity from the board and destroy its sprite.
   */
  protected removeEntity(entity: BaseGridEntity): void {
    this.boardManager.removeEntity(entity.entityId);
    const idx = this.entities.indexOf(entity);
    if (idx !== -1) this.entities.splice(idx, 1);
    entity.destroy();
  }

  /**
   * Deal damage to an entity. Triggers onEntityDeath if health reaches 0.
   */
  protected damageEntity(entity: BaseGridEntity, amount: number): void {
    entity.takeDamage(amount);
    if (!entity.isAlive) {
      this.onEntityDeath(entity);
    }
  }

  /**
   * Call onStep() on all active entities.
   * Typically called during the enemy phase for AI, cooldowns, periodic effects.
   */
  protected stepAllEntities(turnNumber?: number): void {
    const turn = turnNumber ?? this.turnManager.turnNumber;
    for (const entity of this.entities) {
      if (entity.active) {
        entity.onStep(turn);
      }
    }
  }

  /**
   * Call onStep() on all entities of a specific type.
   */
  protected stepEntitiesOfType(entityType: string, turnNumber?: number): void {
    const turn = turnNumber ?? this.turnManager.turnNumber;
    for (const entity of this.entities) {
      if (entity.active && entity.entityType === entityType) {
        entity.onStep(turn);
      }
    }
  }

  /**
   * Move an entity to a new grid position.
   * Updates both data (BoardManager) and visual (sprite position).
   * Automatically triggers onEntityMoved and onEntityEnteredCell hooks.
   * @param animate If true, smoothly tweens the sprite (default: true)
   */
  protected async moveEntity(
    entity: BaseGridEntity,
    toGridX: number,
    toGridY: number,
    animate: boolean = true,
    duration: number = 200,
  ): Promise<void> {
    const fromX = entity.gridX;
    const fromY = entity.gridY;

    this.boardManager.moveEntity(entity.entityId, toGridX, toGridY);

    if (animate) {
      await entity.animateToGridPosition(toGridX, toGridY, duration);
    } else {
      entity.setGridPosition(toGridX, toGridY);
    }

    this.onEntityMoved(entity, fromX, fromY, toGridX, toGridY);

    const cellType = this.boardManager.getCell(toGridX, toGridY);
    entity.onCellEntered(cellType);
    this.onEntityEnteredCell(entity, toGridX, toGridY, cellType);
  }

  /**
   * Slide an entity continuously in a direction until `shouldStop` returns true.
   * Each step calls moveEntity(), so onEntityEnteredCell fires at every cell.
   * Generic: works for ice, conveyor belts, wind, or any "slide until condition" mechanic.
   *
   * @param entity The entity to slide
   * @param direction The direction to slide in
   * @param shouldStop Callback returning true when the entity should stop.
   *   Receives the NEXT candidate cell coordinates. Return true to prevent
   *   entering that cell (e.g., wall, non-slippery surface, blocking entity).
   * @param stepDuration Animation duration per cell in ms (default: 80)
   * @returns The final grid position after sliding stops
   */
  protected async slideEntity(
    entity: BaseGridEntity,
    direction: Direction,
    shouldStop: (nextGridX: number, nextGridY: number) => boolean,
    stepDuration: number = 80,
  ): Promise<GridPoint> {
    const delta = getDirectionDelta(direction);
    let currentX = entity.gridX;
    let currentY = entity.gridY;

    while (true) {
      const nextX = currentX + delta.gridX;
      const nextY = currentY + delta.gridY;

      if (
        !this.boardManager.isInBounds(nextX, nextY) ||
        shouldStop(nextX, nextY)
      ) {
        break;
      }

      await this.moveEntity(entity, nextX, nextY, true, stepDuration);
      currentX = nextX;
      currentY = nextY;
    }

    return { gridX: currentX, gridY: currentY };
  }

  /**
   * Get the entity at a grid position (first match).
   */
  protected getEntityAt(gridX: number, gridY: number): BaseGridEntity | null {
    return (
      this.entities.find(
        (e) => e.gridX === gridX && e.gridY === gridY && e.active,
      ) ?? null
    );
  }

  /**
   * Get all entities at a grid position.
   */
  protected getAllEntitiesAt(gridX: number, gridY: number): BaseGridEntity[] {
    return this.entities.filter(
      (e) => e.gridX === gridX && e.gridY === gridY && e.active,
    );
  }

  /**
   * Get all active entities of a specific type.
   */
  protected getEntitiesOfType(entityType: string): BaseGridEntity[] {
    return this.entities.filter((e) => e.entityType === entityType && e.active);
  }

  // --------------------------------------------------------------------------
  // Selection (public API for level scenes)
  // --------------------------------------------------------------------------

  protected selectEntity(entity: BaseGridEntity): void {
    if (this.selectedEntity) {
      this.selectedEntity.onDeselected();
    }
    this.selectedEntity = entity;
    entity.onSelected();

    this.clearSelectionHighlight();
    this.selectionGraphics = highlightSelectedCell(
      this,
      entity.gridX,
      entity.gridY,
      this.cellSize,
      this.gridOffsetX,
      this.gridOffsetY,
    );
  }

  protected deselectEntity(): void {
    if (this.selectedEntity) {
      this.selectedEntity.onDeselected();
      this.selectedEntity = null;
    }
    this.clearSelectionHighlight();
  }

  // --------------------------------------------------------------------------
  // Highlighting (public API for level scenes)
  // --------------------------------------------------------------------------

  protected setHighlightedCells(
    cells: GridPoint[],
    fillColor: number = 0x00aaff,
    fillAlpha: number = 0.3,
    borderColor?: number,
    borderAlpha?: number,
  ): void {
    this.clearHighlights();
    this.highlightGraphics = highlightCells(
      this,
      cells,
      this.cellSize,
      this.gridOffsetX,
      this.gridOffsetY,
      fillColor,
      fillAlpha,
      borderColor ?? fillColor,
      borderAlpha ?? fillAlpha * 2,
    );
  }

  protected clearHighlights(): void {
    this.highlightGraphics?.destroy();
    this.highlightGraphics = null;
  }

  private clearSelectionHighlight(): void {
    this.selectionGraphics?.destroy();
    this.selectionGraphics = null;
  }

  // --------------------------------------------------------------------------
  // Input Locking
  // --------------------------------------------------------------------------

  protected lockInput(): void {
    this._inputLocked = true;
  }

  protected unlockInput(): void {
    this._inputLocked = false;
  }

  get isInputLocked(): boolean {
    return this._inputLocked;
  }

  // --------------------------------------------------------------------------
  // Undo
  // --------------------------------------------------------------------------

  private _customUndoStack: Record<string, unknown>[] = [];

  /**
   * Save the current board state for undo.
   * Call BEFORE making changes (typically at the start of each move).
   *
   * BoardManager saves cell types and entity grid positions automatically.
   * For custom entity state (HP, cooldowns, inventory, patrol direction, etc.),
   * override `getCustomUndoData()` to return a snapshot of that state.
   * It will be passed back to `restoreCustomUndoData()` on undo.
   */
  protected saveUndoState(): void {
    this.boardManager.pushState();
    this._customUndoStack.push(this.getCustomUndoData());
    if (this._customUndoStack.length > 100) {
      this._customUndoStack.shift();
    }
  }

  /**
   * Override to save custom game state that BoardManager doesn't track.
   * Return a plain object with entity HP, cooldowns, inventory flags, etc.
   * The object will be deep-cloned via JSON serialization.
   *
   * Example:
   *   return {
   *     playerHP: this.player.health,
   *     zapCooldown: this.zapCooldown,
   *     hasKey: this.hasKey,
   *     enemies: this.getEntitiesOfType('enemy').map(e => ({
   *       id: e.entityId, hp: e.health,
   *       patrolDir: (e as any).patrolDirection
   *     })),
   *   };
   */
  protected getCustomUndoData(): Record<string, unknown> {
    return {};
  }

  /**
   * Override to restore custom game state after an undo.
   * Receives the same object that getCustomUndoData() returned.
   *
   * Example:
   *   const d = customData as any;
   *   this.player.health = d.playerHP;  // BaseGridEntity.health has a setter
   *   this.zapCooldown = d.zapCooldown;
   */
  protected restoreCustomUndoData(customData: Record<string, unknown>): void {}

  /**
   * Undo the last move. Restores board state, entity positions,
   * and custom game state, then syncs entity visuals.
   */
  protected undo(): void {
    if (!this.boardManager.canUndo || this._customUndoStack.length === 0)
      return;

    this.boardManager.popState();
    const customData = this._customUndoStack.pop();
    this.syncEntitiesToBoard();
    if (customData && Object.keys(customData).length > 0) {
      this.restoreCustomUndoData(JSON.parse(JSON.stringify(customData)));
    }
    this.turnManager.undoAction();
    this.onUndoPerformed();
    this.events.emit('undoPerformed');
    this.events.emit(
      'moveCountChanged',
      this.turnManager.moveCount,
      this.turnManager.maxMoves,
    );
  }

  /**
   * After a board restore (undo), sync all entity sprites to match
   * the restored board state. Handles position restoration and
   * re-showing destroyed entities. Override for additional visual sync.
   */
  protected syncEntitiesToBoard(): void {
    for (const entity of this.entities) {
      const boardEntity = this.boardManager.getEntityById(entity.entityId);
      if (boardEntity) {
        entity.setGridPosition(boardEntity.gridX, boardEntity.gridY);
        if (!entity.active) {
          entity.setActive(true);
          entity.setVisible(true);
          entity.setAlpha(1);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Processing Pipeline
  // --------------------------------------------------------------------------

  /**
   * Complete processing pipeline after a player action:
   *
   * 1. Lock input, record action
   * 2. PLAYER PHASE:  onProcessComplete() -> play animations
   * 3. WORLD PHASE:   onWorldPhase()      -> play animations (traps, tiles)
   * 4. ENEMY PHASE:   onEnemyPhase()      -> play animations (AI, patrol)
   * 5. Check win/lose
   * 6. CHAIN:         onMoveProcessed()   -> if true, loop from step 2
   * 7. Unlock input
   */
  protected async runProcessingPipeline(): Promise<void> {
    this.lockInput();

    this.turnManager.recordAction();
    this.events.emit(
      'moveCountChanged',
      this.turnManager.moveCount,
      this.turnManager.maxMoves,
    );

    // --- Player Phase ---
    this.onProcessComplete();
    if (!this.animationQueue.isEmpty) {
      this.turnManager.beginAnimating();
      await this.animationQueue.play();
    }

    // --- World Phase (traps activate, tiles transform, items collected) ---
    this.onWorldPhase();
    if (!this.animationQueue.isEmpty) {
      if (this.turnManager.phase !== 'ANIMATING')
        this.turnManager.beginAnimating();
      await this.animationQueue.play();
    }

    // --- Enemy Phase (AI movement, attacks, periodic effects) ---
    this.onEnemyPhase();
    if (!this.animationQueue.isEmpty) {
      if (this.turnManager.phase !== 'ANIMATING')
        this.turnManager.beginAnimating();
      await this.animationQueue.play();
    }

    this.onAnimationComplete();
    if (this.turnManager.phase === 'ANIMATING') {
      this.turnManager.finishAnimating();
    }

    // --- Win/Lose Check ---
    if (this.checkWinCondition()) {
      this.onWinConditionMet();
      return;
    }
    if (this.checkLoseCondition()) {
      this.onLoseConditionMet();
      return;
    }

    // --- Chain Reaction Loop (Match-3 cascades, gravity refill) ---
    let needsMoreProcessing = this.onMoveProcessed();
    while (needsMoreProcessing) {
      this.onProcessComplete();
      if (!this.animationQueue.isEmpty) {
        this.turnManager.setPhase('ANIMATING');
        await this.animationQueue.play();
        this.onAnimationComplete();
      }

      if (this.checkWinCondition()) {
        this.onWinConditionMet();
        return;
      }
      if (this.checkLoseCondition()) {
        this.onLoseConditionMet();
        return;
      }

      needsMoreProcessing = this.onMoveProcessed();
    }

    this.turnManager.skipToWaiting();
    this.onBoardStateChanged();
    this.unlockInput();
  }

  // --------------------------------------------------------------------------
  // Input Setup
  // --------------------------------------------------------------------------

  private setupInput(): void {
    if (!this.input.keyboard) return;

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.undoKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.escKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.ESC,
      false,
    );
    this.actionKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this._inputLocked) return;
      if (!this.turnManager.isWaitingForInput) return;

      const gridPos = worldToGrid(
        pointer.worldX,
        pointer.worldY,
        this.cellSize,
        this.gridOffsetX,
        this.gridOffsetY,
      );

      if (!this.boardManager.isInBounds(gridPos.gridX, gridPos.gridY)) return;

      const entity = this.getEntityAt(gridPos.gridX, gridPos.gridY);
      if (entity) {
        this.onEntityClicked(entity);
      }
      this.onCellClicked(gridPos.gridX, gridPos.gridY);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const gridPos = worldToGrid(
        pointer.worldX,
        pointer.worldY,
        this.cellSize,
        this.gridOffsetX,
        this.gridOffsetY,
      );

      if (!this.boardManager.isInBounds(gridPos.gridX, gridPos.gridY)) return;
      this.onCellHovered(gridPos.gridX, gridPos.gridY);
    });
  }

  private processInput(time: number): void {
    if (this.isKeyPressed('up', time)) {
      this.onDirectionInput('up');
    } else if (this.isKeyPressed('down', time)) {
      this.onDirectionInput('down');
    } else if (this.isKeyPressed('left', time)) {
      this.onDirectionInput('left');
    } else if (this.isKeyPressed('right', time)) {
      this.onDirectionInput('right');
    }

    if (this.actionKey && Phaser.Input.Keyboard.JustDown(this.actionKey)) {
      this.onActionInput();
    }

    if (this.undoKey && Phaser.Input.Keyboard.JustDown(this.undoKey)) {
      this.undo();
    }

    if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.scene.launch('PauseUIScene', { gameSceneKey: this.scene.key });
      this.scene.pause();
    }
  }

  private isKeyPressed(
    direction: 'up' | 'down' | 'left' | 'right',
    time: number,
  ): boolean {
    let isDown = false;

    switch (direction) {
      case 'up':
        isDown = this.cursors.up.isDown || this.wasd.W.isDown;
        break;
      case 'down':
        isDown = this.cursors.down.isDown || this.wasd.S.isDown;
        break;
      case 'left':
        isDown = this.cursors.left.isDown || this.wasd.A.isDown;
        break;
      case 'right':
        isDown = this.cursors.right.isDown || this.wasd.D.isDown;
        break;
    }

    if (!isDown) return false;

    const lastTime = this._keyDebounce.get(direction) ?? 0;
    if (time - lastTime < this._keyDebounceMs) return false;

    this._keyDebounce.set(direction, time);
    return true;
  }

  // --------------------------------------------------------------------------
  // Event Listeners Setup
  // --------------------------------------------------------------------------

  private setupEventListeners(): void {
    this.turnManager.on('turnStart', (turnNumber: number) => {
      this.onTurnStart(turnNumber);
      this.events.emit('turnChanged', turnNumber);
    });

    this.turnManager.on('turnEnd', (turnNumber: number) => {
      this.onTurnEnd(turnNumber);
    });

    this.turnManager.on('realtimeTick', () => {
      this.onRealtimeTick();
    });

    this.animationQueue.on('completed', () => {
      this.events.emit('animationQueueComplete');
    });

    this.boardManager.on('undoStackChanged', (size: number) => {
      this.events.emit('undoAvailable', size > 0);
    });

    this.events.on('undoRequested', () => {
      if (!this._inputLocked) {
        this.undo();
      }
    });
  }
}
