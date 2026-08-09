import Phaser from 'phaser';
import type { GridPoint } from '../utils';

// ============================================================================
// BOARD MANAGER - 2D grid state management with entity tracking and undo
// ============================================================================

export interface BoardConfig {
  cols: number;
  rows: number;
  cellSize: number;
  cells: number[][];
  offsetX?: number;
  offsetY?: number;
}

export interface BoardEntity {
  id: string;
  entityType: string;
  gridX: number;
  gridY: number;
}

interface BoardSnapshot {
  cells: number[][];
  entities: { id: string; entityType: string; gridX: number; gridY: number }[];
}

export class BoardManager extends Phaser.Events.EventEmitter {
  private _cells: number[][];
  private _width: number;
  private _height: number;
  private _cellSize: number;
  private _offsetX: number;
  private _offsetY: number;
  private _entities: Map<string, BoardEntity> = new Map();
  private _entityGrid: Map<string, string[]> = new Map();
  private _undoStack: BoardSnapshot[] = [];
  private _maxUndoSteps: number;

  constructor(config: BoardConfig, maxUndoSteps: number = 100) {
    super();
    this._width = config.cols;
    this._height = config.rows;
    this._cellSize = config.cellSize;
    this._offsetX = config.offsetX ?? 0;
    this._offsetY = config.offsetY ?? 0;
    this._maxUndoSteps = maxUndoSteps;

    this._cells = [];
    for (let y = 0; y < this._height; y++) {
      this._cells[y] = [];
      for (let x = 0; x < this._width; x++) {
        this._cells[y][x] = config.cells[y]?.[x] ?? 0;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Properties
  // --------------------------------------------------------------------------

  get width(): number {
    return this._width;
  }
  get height(): number {
    return this._height;
  }
  get cellSize(): number {
    return this._cellSize;
  }
  get offsetX(): number {
    return this._offsetX;
  }
  get offsetY(): number {
    return this._offsetY;
  }

  get cells(): number[][] {
    return this._cells;
  }

  // --------------------------------------------------------------------------
  // Cell State
  // --------------------------------------------------------------------------

  getCell(x: number, y: number): number {
    if (!this.isInBounds(x, y)) return -1;
    return this._cells[y][x];
  }

  setCell(x: number, y: number, value: number): void {
    if (!this.isInBounds(x, y)) return;
    const oldValue = this._cells[y][x];
    if (oldValue === value) return;
    this._cells[y][x] = value;
    this.emit('cellChanged', x, y, oldValue, value);
  }

  isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this._width && y >= 0 && y < this._height;
  }

  /**
   * Fill the entire board with a single value.
   */
  fill(value: number): void {
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        this._cells[y][x] = value;
      }
    }
    this.emit('boardReset');
  }

  // --------------------------------------------------------------------------
  // Entity Tracking
  // --------------------------------------------------------------------------

  private entityGridKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  placeEntity(entity: BoardEntity): void {
    this._entities.set(entity.id, entity);
    const gk = this.entityGridKey(entity.gridX, entity.gridY);
    if (!this._entityGrid.has(gk)) {
      this._entityGrid.set(gk, []);
    }
    this._entityGrid.get(gk)!.push(entity.id);
    this.emit('entityPlaced', entity);
  }

  removeEntity(entityId: string): void {
    const entity = this._entities.get(entityId);
    if (!entity) return;

    const gk = this.entityGridKey(entity.gridX, entity.gridY);
    const list = this._entityGrid.get(gk);
    if (list) {
      const idx = list.indexOf(entityId);
      if (idx !== -1) list.splice(idx, 1);
      if (list.length === 0) this._entityGrid.delete(gk);
    }

    this._entities.delete(entityId);
    this.emit('entityRemoved', entity);
  }

  moveEntity(entityId: string, toX: number, toY: number): void {
    const entity = this._entities.get(entityId);
    if (!entity) return;

    const fromX = entity.gridX;
    const fromY = entity.gridY;

    const oldGk = this.entityGridKey(fromX, fromY);
    const oldList = this._entityGrid.get(oldGk);
    if (oldList) {
      const idx = oldList.indexOf(entityId);
      if (idx !== -1) oldList.splice(idx, 1);
      if (oldList.length === 0) this._entityGrid.delete(oldGk);
    }

    entity.gridX = toX;
    entity.gridY = toY;

    const newGk = this.entityGridKey(toX, toY);
    if (!this._entityGrid.has(newGk)) {
      this._entityGrid.set(newGk, []);
    }
    this._entityGrid.get(newGk)!.push(entityId);

    this.emit('entityMoved', entity, fromX, fromY, toX, toY);
  }

  getEntityAt(x: number, y: number): BoardEntity | null {
    const gk = this.entityGridKey(x, y);
    const list = this._entityGrid.get(gk);
    if (!list || list.length === 0) return null;
    return this._entities.get(list[0]) ?? null;
  }

  getAllEntitiesAt(x: number, y: number): BoardEntity[] {
    const gk = this.entityGridKey(x, y);
    const list = this._entityGrid.get(gk);
    if (!list) return [];
    return list.map((id) => this._entities.get(id)!).filter(Boolean);
  }

  getEntitiesOfType(entityType: string): BoardEntity[] {
    const result: BoardEntity[] = [];
    for (const entity of this._entities.values()) {
      if (entity.entityType === entityType) {
        result.push(entity);
      }
    }
    return result;
  }

  getEntityById(id: string): BoardEntity | null {
    return this._entities.get(id) ?? null;
  }

  getAllEntities(): BoardEntity[] {
    return Array.from(this._entities.values());
  }

  // --------------------------------------------------------------------------
  // Undo / State History
  // --------------------------------------------------------------------------

  /**
   * Save the current board state to the undo stack.
   * Call BEFORE making changes that should be undoable.
   */
  pushState(): void {
    const snapshot: BoardSnapshot = {
      cells: this._cells.map((row) => [...row]),
      entities: Array.from(this._entities.values()).map((e) => ({
        id: e.id,
        entityType: e.entityType,
        gridX: e.gridX,
        gridY: e.gridY,
      })),
    };
    this._undoStack.push(snapshot);
    if (this._undoStack.length > this._maxUndoSteps) {
      this._undoStack.shift();
    }
    this.emit('undoStackChanged', this._undoStack.length);
  }

  /**
   * Restore the previous board state from the undo stack.
   * Returns true if an undo was performed, false if the stack was empty.
   */
  popState(): boolean {
    const snapshot = this._undoStack.pop();
    if (!snapshot) return false;

    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        this._cells[y][x] = snapshot.cells[y]?.[x] ?? 0;
      }
    }

    this._entities.clear();
    this._entityGrid.clear();
    for (const e of snapshot.entities) {
      this.placeEntity({ ...e });
    }

    this.emit('boardRestored');
    this.emit('undoStackChanged', this._undoStack.length);
    return true;
  }

  get canUndo(): boolean {
    return this._undoStack.length > 0;
  }

  get undoStackSize(): number {
    return this._undoStack.length;
  }

  clearHistory(): void {
    this._undoStack.length = 0;
    this.emit('undoStackChanged', 0);
  }

  // --------------------------------------------------------------------------
  // Serialization
  // --------------------------------------------------------------------------

  serialize(): string {
    return JSON.stringify({
      cells: this._cells,
      entities: Array.from(this._entities.values()).map((e) => ({
        id: e.id,
        entityType: e.entityType,
        gridX: e.gridX,
        gridY: e.gridY,
      })),
    });
  }

  deserialize(data: string): void {
    const parsed = JSON.parse(data);

    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        this._cells[y][x] = parsed.cells[y]?.[x] ?? 0;
      }
    }

    this._entities.clear();
    this._entityGrid.clear();
    for (const e of parsed.entities) {
      this.placeEntity({ ...e });
    }

    this.emit('boardRestored');
  }

  // --------------------------------------------------------------------------
  // Coordinate Conversion
  // --------------------------------------------------------------------------

  gridToWorld(gridX: number, gridY: number): { x: number; y: number } {
    return {
      x: this._offsetX + gridX * this._cellSize + this._cellSize / 2,
      y: this._offsetY + gridY * this._cellSize + this._cellSize / 2,
    };
  }

  worldToGrid(worldX: number, worldY: number): GridPoint {
    return {
      gridX: Math.floor((worldX - this._offsetX) / this._cellSize),
      gridY: Math.floor((worldY - this._offsetY) / this._cellSize),
    };
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  destroy(): void {
    this._entities.clear();
    this._entityGrid.clear();
    this._undoStack.length = 0;
    this.removeAllListeners();
    super.destroy();
  }
}
