// ============================================================================
// _TemplateGridLevel.ts -- COPY this file for each grid logic level
// ============================================================================
// STANDARD TEMPLATE -- Do NOT modify the original. COPY and RENAME.
//
// Steps:
// 1. Copy this file:  cp _TemplateGridLevel.ts  Level1.ts
// 2. Rename the class: TemplateGridLevel -> Level1
// 3. Update scene key: super({ key: 'Level1' })
// 4. Implement abstract methods with GDD Section 4 data
// 5. Override hooks with GDD Section 3 behavior
// 6. Register in main.ts and LevelManager.ts
//
// FILE CHECKLIST (verify after implementation):
// [ ] Scene key matches main.ts registration and LevelManager.LEVEL_ORDER
// [ ] getBoardConfig() returns correct grid from GDD Section 4
// [ ] getTurnConfig() mode matches game type (step/turn/realtime/freeform)
// [ ] createEntities() places all entities from GDD Section 3
// [ ] checkWinCondition() matches GDD win condition
// [ ] checkLoseCondition() matches GDD lose condition
// [ ] All entity textureKeys exist in asset-pack.json
// [ ] Background textureKey exists in asset-pack.json
// ============================================================================

import { BaseGridScene } from './BaseGridScene';
import { type BoardConfig } from '../systems/BoardManager';
import { type TurnManagerConfig } from '../systems/TurnManager';
import { BaseGridEntity } from '../entities/BaseGridEntity';
import { AnimationQueue } from '../systems/AnimationQueue';
import {
  CellType,
  drawGridLines,
  textureExists,
  showFloatingText,
  getDirectionDelta,
  getCellsInDirection,
  getCellsInRadius,
  findPath,
  manhattanDistance,
  floodFill,
} from '../utils';
import type { GridPoint, Direction } from '../utils';
import * as CONFIG from '../gameConfig.json';

export default class TemplateGridLevel extends BaseGridScene {
  // -------------------------------------------------------------------------
  // TODO: Add level-specific properties
  // -------------------------------------------------------------------------
  // private player!: BaseGridEntity;

  constructor() {
    super({ key: 'TemplateGridLevel' });
  }

  // =========================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS (required)
  // =========================================================================

  /**
   * Define the board layout. Use CellType enum values.
   * Translate GDD Section 4 ASCII map to a 2D number array.
   */
  protected override getBoardConfig(): BoardConfig {
    const cellSize = CONFIG.gridConfig?.cellSize?.value ?? 64;
    const cols = CONFIG.gridConfig?.gridWidth?.value ?? 10;
    const rows = CONFIG.gridConfig?.gridHeight?.value ?? 10;
    const screenW = CONFIG.screenSize.width.value;
    const screenH = CONFIG.screenSize.height.value;

    const mapW = cols * cellSize;
    const mapH = rows * cellSize;
    const offsetX = Math.floor((screenW - mapW) / 2);
    const offsetY = Math.floor((screenH - mapH) / 2);

    // TODO: Replace with your level's grid from GDD Section 4
    // Use CellType values: EMPTY=0, WALL=1, FLOOR=2, GOAL=3, HAZARD=4, SPAWN=5, SPECIAL=6, ICE=7, PORTAL=8
    const cells: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 0, 0, 2, 2, 0, 0, 2, 1],
      [1, 2, 0, 0, 2, 2, 0, 0, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 0, 0, 2, 2, 0, 0, 2, 1],
      [1, 2, 0, 0, 2, 2, 0, 0, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ];

    return { cols, rows, cellSize, cells, offsetX, offsetY };
  }

  /**
   * Configure the turn/step timing mode.
   * - 'step':     Each input = one game step (Sokoban, sliding puzzle)
   * - 'turn':     Multiple actions per turn (tactics, chess)
   * - 'realtime': Timer-driven steps (Snake, Tetris)
   * - 'freeform': No turn structure (Match-3)
   */
  protected override getTurnConfig(): TurnManagerConfig {
    // TODO: Set mode from GDD Section 0
    return {
      mode: 'step',
      maxMoves: CONFIG.gridConfig?.maxMoves?.value ?? -1,
      // realtimeIntervalMs: 500,   // for 'realtime' mode
      // actionsPerTurn: 1,         // for 'turn' mode
    };
  }

  /**
   * Set up the visual environment.
   */
  protected override createEnvironment(): void {
    const screenW = CONFIG.screenSize.width.value;
    const screenH = CONFIG.screenSize.height.value;

    // TODO: Background image
    if (textureExists(this, 'level1_bg')) {
      const bg = this.add.image(0, 0, 'level1_bg').setOrigin(0, 0);
      bg.setDisplaySize(screenW, screenH);
      bg.setDepth(-10);
    }

    // Grid lines (optional visual aid)
    this.gridLinesGraphics = drawGridLines(
      this,
      this.gridCols,
      this.gridRows,
      this.cellSize,
      this.gridOffsetX,
      this.gridOffsetY,
      0xffffff,
      0.1,
    );

    // Cell type overlay (debug -- remove or reduce alpha for production)
    // drawCellTypeOverlay(
    //   this, this.cells, this.gridCols, this.gridRows, this.cellSize,
    //   this.gridOffsetX, this.gridOffsetY
    // );
  }

  /**
   * Create and place all game entities on the board.
   */
  protected override createEntities(): void {
    // TODO: Create entities from GDD Section 3
    // Example:
    //
    // this.player = new Player(this, 1, 1);
    // this.addEntity(this.player);
    //
    // const box = new Box(this, 3, 3);
    // this.addEntity(box);
    //
    // const goal = new GoalMarker(this, 5, 5);
    // this.addEntity(goal);
  }

  // =========================================================================
  // WIN/LOSE CONDITIONS
  // =========================================================================

  protected override checkWinCondition(): boolean {
    // TODO: Implement win condition from GDD
    // Example (Sokoban): All boxes are on goal cells
    // const boxes = this.getEntitiesOfType('box');
    // return boxes.every(b => this.boardManager.getCell(b.gridX, b.gridY) === CellType.GOAL);
    return false;
  }

  protected override checkLoseCondition(): boolean {
    // TODO: Implement lose condition from GDD
    // Example: No moves remaining
    // return !this.turnManager.hasMovesRemaining;
    return false;
  }

  // =========================================================================
  // HOOK OVERRIDES -- customize behavior by overriding these methods
  // =========================================================================

  // --- Input Hooks ---

  /**
   * Handle directional input (arrow keys / WASD).
   * Main input handler for step-based movement games.
   */
  protected override onDirectionInput(direction: Direction): void {
    // TODO: Implement movement logic
    // Example (Sokoban-style player movement with push):
    //
    // if (!this.player) return;
    // const delta = getDirectionDelta(direction);
    // this.player.facingDirection = direction;
    // const targetX = this.player.gridX + delta.gridX;
    // const targetY = this.player.gridY + delta.gridY;
    //
    // if (!this.boardManager.isInBounds(targetX, targetY)) return;
    // if (this.boardManager.getCell(targetX, targetY) === CellType.WALL) return;
    //
    // const target = this.getEntityAt(targetX, targetY);
    //
    // // Bump attack: move into enemy = attack
    // if (target && target.entityType === 'enemy') {
    //   this.saveUndoState();
    //   this.damageEntity(target, 1);
    //   this.runProcessingPipeline();
    //   return;
    // }
    //
    // // Push: move into pushable = push it
    // if (target?.isPushable) {
    //   const pushX = targetX + delta.gridX;
    //   const pushY = targetY + delta.gridY;
    //   if (!this.canMoveTo(pushX, pushY)) return;
    //   this.saveUndoState();
    //   this.moveEntity(target, pushX, pushY);
    //   this.moveEntity(this.player, targetX, targetY);
    //   this.runProcessingPipeline();
    //   return;
    // }
    //
    // // Normal move
    // if (!target || target.isWalkable) {
    //   this.saveUndoState();
    //   this.moveEntity(this.player, targetX, targetY);
    //   this.runProcessingPipeline();
    // }
    //
    // --- Sliding (ICE) example ---
    // After moving the player onto an ICE cell, slide them until stopped:
    //
    // const landedCell = this.boardManager.getCell(targetX, targetY);
    // if (landedCell === CellType.ICE) {
    //   await this.slideEntity(this.player, direction, (nx, ny) => {
    //     if (this.boardManager.getCell(nx, ny) === CellType.WALL) return true;
    //     if (this.getEntityAt(nx, ny)?.isPushable) return true;
    //     const cell = this.boardManager.getCell(nx, ny);
    //     return cell !== CellType.ICE && cell !== CellType.FLOOR;
    //   });
    // }
  }

  /**
   * Handle action key (Spacebar).
   * For special abilities, attacks, or interactions.
   */
  protected override onActionInput(): void {
    // TODO: Implement action logic
    // Example (ranged attack: 2 tiles in facing direction):
    //
    // if (!this.player || this.abilityCooldown > 0) return;
    // const targets = getCellsInDirection(
    //   this.player.gridX, this.player.gridY,
    //   this.player.facingDirection, 2,
    //   this.gridCols, this.gridRows
    // );
    // for (const t of targets) {
    //   const enemy = this.getEntityAt(t.gridX, t.gridY);
    //   if (enemy) this.damageEntity(enemy, 2);
    // }
    // this.abilityCooldown = 3;
    // this.runProcessingPipeline();
  }

  /**
   * Handle cell clicks.
   * For click-based games (Match-3, chess piece selection, etc).
   */
  protected override onCellClicked(gridX: number, gridY: number): void {
    // TODO: Implement click logic if needed
  }

  // --- Processing Pipeline Hooks ---

  /**
   * Player Phase: enqueue animations for the player's action.
   */
  protected override onProcessComplete(): void {
    // TODO: Enqueue player-action animations
    // Example:
    // this.animationQueue.enqueue(
    //   AnimationQueue.bounce(this, this.player, 1.2, 200)
    // );
  }

  /**
   * World Phase: resolve tile interactions after player moves.
   * Traps activate, doors open, items get collected, etc.
   */
  protected override onWorldPhase(): void {
    // TODO: Implement world phase logic
    // Example: activate traps, check item pickups
    //
    // // Check if player stepped on a hazard
    // if (this.player) {
    //   const cell = this.boardManager.getCell(this.player.gridX, this.player.gridY);
    //   if (cell === CellType.HAZARD) {
    //     this.damageEntity(this.player, 1);
    //     this.animationQueue.enqueue(
    //       AnimationQueue.shake(this, this.player, 4, 200)
    //     );
    //   }
    // }
  }

  /**
   * Enemy Phase: all enemies take their step (AI, patrol, emit effects).
   * This runs AFTER the world phase and its animations.
   */
  protected override onEnemyPhase(): void {
    // TODO: Implement enemy AI
    // Example: call stepAllEntities() or step specific types
    //
    // this.stepEntitiesOfType('enemy');
    //
    // Alternatively, write per-type AI here:
    // for (const enemy of this.getEntitiesOfType('chaser')) {
    //   const path = findPath(
    //     enemy.gridX, enemy.gridY,
    //     this.player.gridX, this.player.gridY,
    //     this.gridCols, this.gridRows,
    //     (x, y) => this.canMoveTo(x, y)
    //   );
    //   if (path.length > 1) {
    //     this.moveEntity(enemy, path[1].gridX, path[1].gridY);
    //   }
    // }
  }

  /**
   * Called when an entity enters a cell. Automatic tile interaction.
   */
  protected override onEntityEnteredCell(
    entity: BaseGridEntity,
    gridX: number,
    gridY: number,
    cellType: number,
  ): void {
    // TODO: Handle tile interactions
    // Example: collect key, fill hole with pushed box
    //
    // if (entity.entityType === 'player' && cellType === CellType.SPECIAL) {
    //   // Collect item at this cell
    // }
    // if (entity.entityType === 'box' && cellType === CellType.HAZARD) {
    //   // Box fills hole: change cell to FLOOR, remove box
    //   this.boardManager.setCell(gridX, gridY, CellType.FLOOR);
    //   this.removeEntity(entity);
    // }
    //
    // --- Portal (teleportation) example ---
    // Portals are entities with isWalkable=true and a custom portalPairId.
    // When an entity enters a portal cell, teleport to the paired portal:
    //
    // if (cellType === CellType.PORTAL && entity.entityType === 'player') {
    //   const portal = this.getEntityAt(gridX, gridY);
    //   if (portal && (portal as any).portalPairId != null) {
    //     const paired = this.entities.find(
    //       e => e !== portal
    //         && (e as any).portalPairId === (portal as any).portalPairId
    //         && e.active
    //     );
    //     if (paired) {
    //       this.moveEntity(entity, paired.gridX, paired.gridY, false);
    //     }
    //   }
    // }
  }

  /**
   * Called when an entity's health reaches 0.
   */
  protected override onEntityDeath(entity: BaseGridEntity): void {
    // TODO: Handle entity death
    // Example: remove enemy with animation
    //
    // this.animationQueue.enqueue(
    //   AnimationQueue.destroy(this, entity, 300)
    // );
    // this.removeEntity(entity);
    //
    // If player dies:
    // if (entity.entityType === 'player') {
    //   showFloatingText(this, entity.x, entity.y, 'Defeated!', '#ff4444');
    // }
  }

  /**
   * Chain reaction check. Return true to re-run the pipeline.
   */
  protected override onMoveProcessed(): boolean {
    // TODO: Check for chain reactions
    // Example (Match-3 gravity + re-match):
    // if (this.applyGravity()) {
    //   return this.checkAndClearMatches();
    // }
    return false;
  }

  // =========================================================================
  // UNDO: Custom State (override if entities have HP, cooldowns, etc.)
  // =========================================================================

  // BoardManager auto-saves cell types and entity positions.
  // Override these to save/restore additional game state on undo:
  //
  // protected override getCustomUndoData(): Record<string, unknown> {
  //   return {
  //     playerHP: this.player.health,
  //     zapCooldown: this.zapCooldown,
  //     hasKey: this.hasKey,
  //     enemies: this.getEntitiesOfType('enemy').map(e => ({
  //       id: e.entityId, hp: e.health, patrolDir: (e as any).patrolDirection
  //     })),
  //     turretCounters: this.getEntitiesOfType('turret').map(t => ({
  //       id: t.entityId, counter: (t as any).turnCounter
  //     })),
  //   };
  // }
  //
  // protected override restoreCustomUndoData(data: Record<string, unknown>): void {
  //   const d = data as any;
  //   this.player.health = d.playerHP;  // BaseGridEntity.health has a setter
  //   this.zapCooldown = d.zapCooldown;
  //   this.hasKey = d.hasKey;
  //   for (const es of d.enemies) {
  //     const enemy = this.entities.find(e => e.entityId === es.id);
  //     if (enemy) {
  //       enemy.health = es.hp;
  //       (enemy as any).patrolDirection = es.patrolDir;
  //     }
  //   }
  // }

  // =========================================================================
  // HELPER METHODS (level-specific)
  // =========================================================================

  // private canMoveTo(gridX: number, gridY: number): boolean {
  //   if (!this.boardManager.isInBounds(gridX, gridY)) return false;
  //   if (this.boardManager.getCell(gridX, gridY) === CellType.WALL) return false;
  //   const entity = this.getEntityAt(gridX, gridY);
  //   if (entity && !entity.isWalkable) return false;
  //   return true;
  // }
}
