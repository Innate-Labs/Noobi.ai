import Phaser from 'phaser';
import { scaleToCell, textureExists } from '../utils';

// ============================================================================
// BASE GRID ENTITY - Grid-bound sprite for grid logic games
// ============================================================================
// All entities that live on the grid (players, boxes, enemies, items) extend
// this class. It manages grid position, visual representation, and provides
// hooks for game-specific behavior.
// ============================================================================

export interface GridEntityConfig {
  id: string;
  entityType: string;
  textureKey: string;
  gridX: number;
  gridY: number;
  displaySize?: number;
  isWalkable?: boolean;
  isPushable?: boolean;
  isDestructible?: boolean;
  maxHealth?: number;
}

export class BaseGridEntity extends Phaser.GameObjects.Sprite {
  private _gridX: number;
  private _gridY: number;
  private _entityType: string;
  private _entityId: string;
  private _isWalkable: boolean;
  private _isPushable: boolean;
  private _isDestructible: boolean;
  private _cellSize: number = 64;
  private _gridOffsetX: number = 0;
  private _gridOffsetY: number = 0;
  private _facingDirection: 'up' | 'down' | 'left' | 'right' = 'down';
  private _health: number;
  private _maxHealth: number;

  constructor(scene: Phaser.Scene, config: GridEntityConfig) {
    const key = textureExists(scene, config.textureKey)
      ? config.textureKey
      : '__DEFAULT';
    super(scene, 0, 0, key);

    this._entityId = config.id;
    this._entityType = config.entityType;
    this._gridX = config.gridX;
    this._gridY = config.gridY;
    this._isWalkable = config.isWalkable ?? false;
    this._isPushable = config.isPushable ?? false;
    this._isDestructible = config.isDestructible ?? false;
    this._maxHealth = config.maxHealth ?? 0;
    this._health = this._maxHealth;

    if (key === '__DEFAULT') {
      this.setVisible(false);
    }

    scene.add.existing(this);
    this.setDepth(10);
  }

  // --------------------------------------------------------------------------
  // Properties
  // --------------------------------------------------------------------------

  get gridX(): number {
    return this._gridX;
  }
  get gridY(): number {
    return this._gridY;
  }
  get entityType(): string {
    return this._entityType;
  }
  get entityId(): string {
    return this._entityId;
  }
  get isWalkable(): boolean {
    return this._isWalkable;
  }
  get isPushable(): boolean {
    return this._isPushable;
  }
  get isDestructible(): boolean {
    return this._isDestructible;
  }
  get facingDirection(): 'up' | 'down' | 'left' | 'right' {
    return this._facingDirection;
  }
  get health(): number {
    return this._health;
  }
  set health(value: number) {
    this._health = Math.max(0, Math.min(this._maxHealth, value));
  }
  get maxHealth(): number {
    return this._maxHealth;
  }
  get isAlive(): boolean {
    return this._maxHealth <= 0 || this._health > 0;
  }

  set facingDirection(dir: 'up' | 'down' | 'left' | 'right') {
    this._facingDirection = dir;
  }

  // --------------------------------------------------------------------------
  // Health / Combat
  // --------------------------------------------------------------------------

  /**
   * Deal damage to this entity. Clamps health to [0, maxHealth].
   * Calls onDamage() hook, then onDeath() if health reaches 0.
   * No-op if maxHealth is 0 (entity has no HP system).
   */
  takeDamage(amount: number): void {
    if (this._maxHealth <= 0) return;
    const oldHP = this._health;
    this._health = Math.max(0, this._health - amount);
    this.onDamage(amount, oldHP, this._health);
    if (this._health <= 0 && oldHP > 0) {
      this.onDeath();
    }
  }

  /**
   * Restore health. Clamps to maxHealth.
   */
  heal(amount: number): void {
    if (this._maxHealth <= 0) return;
    this._health = Math.min(this._maxHealth, this._health + amount);
  }

  // --------------------------------------------------------------------------
  // Grid Configuration (called by BaseGridScene after creation)
  // --------------------------------------------------------------------------

  /**
   * Set the grid parameters so the entity can convert grid <-> world coords.
   * Called automatically by BaseGridScene.addEntity().
   */
  initGridParams(cellSize: number, offsetX: number, offsetY: number): void {
    this._cellSize = cellSize;
    this._gridOffsetX = offsetX;
    this._gridOffsetY = offsetY;
    this.syncWorldPosition();
  }

  /**
   * Scale the sprite to fit within a grid cell.
   * Called automatically by BaseGridScene.addEntity() if config.displaySize is set.
   */
  scaleToGrid(cellSize: number, padding?: number): void {
    scaleToCell(this, cellSize, padding);
  }

  // --------------------------------------------------------------------------
  // Position Management
  // --------------------------------------------------------------------------

  /**
   * Set grid position and immediately sync the visual sprite to world coords.
   */
  setGridPosition(gridX: number, gridY: number): void {
    const fromX = this._gridX;
    const fromY = this._gridY;
    this._gridX = gridX;
    this._gridY = gridY;
    this.syncWorldPosition();
    this.onMoved(fromX, fromY);
  }

  /**
   * Animate the sprite to a new grid position over time.
   * Does NOT update gridX/gridY -- the caller (BaseGridScene) handles data updates.
   * Returns a Promise that resolves when the animation completes.
   */
  animateToGridPosition(
    gridX: number,
    gridY: number,
    duration: number = 200,
    ease: string = 'Power2',
  ): Promise<void> {
    const worldPos = this.gridToWorldCenter(gridX, gridY);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        x: worldPos.x,
        y: worldPos.y,
        duration,
        ease,
        onComplete: () => {
          const fromX = this._gridX;
          const fromY = this._gridY;
          this._gridX = gridX;
          this._gridY = gridY;
          resolve();
          this.onMoved(fromX, fromY);
        },
      });
    });
  }

  /**
   * Sync the sprite's world position to match its current grid position.
   */
  syncWorldPosition(): void {
    const worldPos = this.gridToWorldCenter(this._gridX, this._gridY);
    this.setPosition(worldPos.x, worldPos.y);
  }

  private gridToWorldCenter(gx: number, gy: number): { x: number; y: number } {
    return {
      x: this._gridOffsetX + gx * this._cellSize + this._cellSize / 2,
      y: this._gridOffsetY + gy * this._cellSize + this._cellSize / 2,
    };
  }

  // --------------------------------------------------------------------------
  // Hooks (override in subclasses)
  // --------------------------------------------------------------------------

  /**
   * Called when the entity is first added to the board.
   */
  onPlaced(): void {}

  /**
   * Called after the entity's grid position changes.
   */
  onMoved(fromX: number, fromY: number): void {}

  /**
   * Called when the entity is removed from the board.
   */
  onRemoved(): void {}

  /**
   * Called when the entity is selected by the player.
   */
  onSelected(): void {}

  /**
   * Called when the entity is deselected.
   */
  onDeselected(): void {}

  /**
   * Called when the entity is interacted with (clicked, pushed, etc).
   */
  onInteraction(interactionType: string): void {}

  /**
   * Called every game step/turn for entity-specific logic (AI, timers, cooldowns).
   * Receives the current turn number for cooldown tracking.
   */
  onStep(turnNumber: number): void {}

  /**
   * Called when this entity takes damage.
   */
  onDamage(amount: number, oldHP: number, newHP: number): void {}

  /**
   * Called when this entity's health reaches 0.
   */
  onDeath(): void {}

  /**
   * Called when this entity enters a new cell (after move completes).
   * Useful for triggering tile effects on this entity.
   */
  onCellEntered(cellType: number): void {}

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  override destroy(fromScene?: boolean): void {
    this.onRemoved();
    super.destroy(fromScene);
  }
}
