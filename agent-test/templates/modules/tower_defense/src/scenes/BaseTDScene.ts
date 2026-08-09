import Phaser from 'phaser';
import {
  CellType,
  gridToWorld as gridToWorldUtil,
  worldToGrid,
  isValidPlacement,
  createRangeIndicator,
  addOverlap,
  drawGridOverlay,
  type WorldPoint,
} from '../utils';
import { BaseTower } from '../towers/BaseTower';
import type { TowerTypeConfig } from '../towers/BaseTower';
import { BaseTDEnemy } from '../enemies/BaseTDEnemy';
import type { BaseObstacle } from '../entities/BaseObstacle';
import { WaveManager } from '../systems/WaveManager';
import type { WaveDefinition } from '../systems/WaveManager';
import { EconomyManager } from '../systems/EconomyManager';
import { LevelManager } from '../LevelManager';
import * as CONFIG from '../gameConfig.json';

// ============================================================================
// BASE TD SCENE -- Main tower defense game scene engine
// ============================================================================
// Template Method pattern -- provides complete create/update lifecycle.
// Subclasses implement abstract methods to define level-specific content.
//
// CREATE FLOW:
//   onPreCreate() -> initializeGrid() -> initializeGroups() ->
//   extractPath() -> createEnvironment() -> setupCamera() ->
//   setupInputs() -> setupCollisions() -> initializeSystems() ->
//   launchUI() -> onPostCreate() -> startFirstWave()
//
// UPDATE FLOW:
//   onPreUpdate() -> updateTowers() -> updateEnemies() ->
//   updateProjectiles() -> waveManager.update() ->
//   checkEndConditions() -> onPostUpdate()
//
// ABSTRACT METHODS (MUST implement):
//   getGridConfig()       -> GridConfig
//   getPathWaypoints()    -> PathPoint[]
//   createEnvironment()   -> void
//   getWaveDefinitions()  -> WaveDefinition[]
//   getTowerTypes()       -> TowerTypeConfig[]
// ============================================================================

export interface GridConfig {
  cols: number;
  rows: number;
  cellSize: number;
  cells: CellType[][];
  offsetX?: number;
  offsetY?: number;
}

export interface PathPoint {
  gridX: number;
  gridY: number;
}

export abstract class BaseTDScene extends Phaser.Scene {
  // --- Grid ---
  protected gridConfig!: GridConfig;
  protected cells!: CellType[][];
  protected gridOffsetX: number = 0;
  protected gridOffsetY: number = 0;
  protected cellSize: number = 64;

  // --- Groups ---
  protected towersGroup!: Phaser.GameObjects.Group;
  protected enemiesGroup!: Phaser.Physics.Arcade.Group;
  protected projectilesGroup!: Phaser.Physics.Arcade.Group;
  protected obstaclesGroup!: Phaser.GameObjects.Group;
  protected towerSlotGroup?: Phaser.GameObjects.Group;

  // --- Path ---
  protected pathWaypoints: WorldPoint[] = [];

  // --- Systems ---
  protected waveManager!: WaveManager;
  protected economyManager!: EconomyManager;

  // --- Tower types ---
  protected towerTypes: TowerTypeConfig[] = [];
  protected selectedTowerTypeId: string | null = null;

  // --- Game state ---
  protected lives: number = 20;
  protected maxLives: number = 20;
  protected isGameOver: boolean = false;
  protected isVictory: boolean = false;

  // --- Placement preview ---
  private placementPreview: Phaser.GameObjects.Image | null = null;
  private rangePreview: Phaser.GameObjects.Graphics | null = null;
  private gridOverlay: Phaser.GameObjects.Graphics | null = null;

  // --- Towers placed on grid (for occupancy tracking) ---
  protected towerGrid: Map<string, BaseTower> = new Map();

  // --- Combo kill tracking ---
  private comboCount: number = 0;
  private comboTimer: number = 0;
  private comboWindowMs: number = 2000;

  // ===================== PHASER LIFECYCLE =====================

  create(): void {
    this.createBaseElements();
  }

  update(time: number, delta: number): void {
    if (this.isGameOver || this.isVictory) return;
    this.baseUpdate(time, delta);
  }

  // ===================== CREATE FLOW =====================

  private createBaseElements(): void {
    this.onPreCreate();
    this.initializeGrid();
    this.initializeGroups();
    this.extractPath();
    this.createEnvironment();
    this.setupCamera();
    this.setupInputs();
    this.setupCollisions();
    this.initializeSystems();
    this.launchUI();
    this.onPostCreate();
    this.waveManager.startFirstWave();
  }

  private initializeGrid(): void {
    this.gridConfig = this.getGridConfig();
    this.cells = this.gridConfig.cells;
    this.cellSize = this.gridConfig.cellSize;
    this.gridOffsetX = this.gridConfig.offsetX ?? 0;
    this.gridOffsetY = this.gridConfig.offsetY ?? 0;

    const debugEnabled = CONFIG.debugConfig.debug.value;
    if (debugEnabled) {
      this.gridOverlay = drawGridOverlay(
        this,
        this.cells,
        this.cellSize,
        this.gridOffsetX,
        this.gridOffsetY,
      );
    }
  }

  private initializeGroups(): void {
    this.towersGroup = this.add.group();
    this.enemiesGroup = this.physics.add.group({ runChildUpdate: true });
    this.projectilesGroup = this.physics.add.group();
    this.obstaclesGroup = this.add.group();
  }

  private extractPath(): void {
    const pathPoints = this.getPathWaypoints();
    this.pathWaypoints = pathPoints.map((p) =>
      this.gridToWorld(p.gridX, p.gridY),
    );
  }

  /**
   * Convert grid coordinates to world (pixel) coordinates.
   * Convenience for subclasses -- uses current grid config.
   */
  protected gridToWorld(
    gridX: number,
    gridY: number,
  ): { x: number; y: number } {
    return gridToWorldUtil(
      gridX,
      gridY,
      this.cellSize,
      this.gridOffsetX,
      this.gridOffsetY,
    );
  }

  private setupCamera(): void {
    const width = CONFIG.screenSize.width.value;
    const height = CONFIG.screenSize.height.value;
    this.cameras.main.setBounds(0, 0, width, height);
  }

  private setupInputs(): void {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.updatePlacementPreview(pointer);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.handleLeftClick(pointer);
      } else if (pointer.rightButtonDown()) {
        this.cancelTowerSelection();
      }
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.selectedTowerTypeId) {
        this.cancelTowerSelection();
      } else {
        this.scene.launch('PauseUIScene', { currentLevelKey: this.scene.key });
        this.scene.pause();
      }
    });

    this.input.keyboard?.on('keydown-SPACE', () => {
      this.waveManager?.skipToNextWave();
    });

    this.events.on('towerTypeSelected', (typeId: string) => {
      this.selectedTowerTypeId = typeId;
      this.setTowerSlotsVisible(true);
    });

    this.events.on('towerTypeDeselected', () => {
      this.clearTowerSelectionState();
      this.setTowerSlotsVisible(false);
    });
  }

  private setupCollisions(): void {
    addOverlap(
      this,
      this.projectilesGroup,
      this.enemiesGroup,
      (projectile: any, enemy: any) => {
        this.onProjectileHitEnemy(projectile, enemy);
      },
    );
  }

  private launchUI(): void {
    this.scene.launch('UIScene', {
      callingScene: this.scene.key,
      gold: this.economyManager.gold,
      lives: this.lives,
      towerTypes: this.towerTypes,
    });
  }

  private initializeSystems(): void {
    const startingGold = CONFIG.towerDefenseConfig.startingGold.value;
    const sellRefundRate = CONFIG.towerDefenseConfig.sellRefundRate.value;
    const timeBetweenWaves = CONFIG.towerDefenseConfig.timeBetweenWaves.value;

    this.lives = CONFIG.towerDefenseConfig.startingLives.value;
    this.maxLives = this.lives;

    this.towerTypes = this.getTowerTypes();
    this.economyManager = new EconomyManager(
      this,
      startingGold,
      sellRefundRate,
    );

    const waveDefs = this.getWaveDefinitions();
    const minSpawnInterval = this.getMinSpawnInterval();
    this.waveManager = new WaveManager(
      this,
      waveDefs,
      timeBetweenWaves,
      minSpawnInterval,
    );

    this.events.on('spawnEnemy', (enemyType: string) => {
      this.spawnEnemy(enemyType);
    });

    this.events.on('enemyKilled', (enemy: BaseTDEnemy, reward: number) => {
      this.economyManager.earn(reward);
      this.waveManager.notifyEnemyRemoved();
      this.trackComboKill(enemy);
      this.onEnemyKilled(enemy);
    });

    this.events.on('enemyReachedEnd', (enemy: BaseTDEnemy, damage: number) => {
      this.waveManager.notifyEnemyRemoved();
      this.loseLives(damage);
      this.onEnemyReachedEnd(enemy);
    });

    this.events.on('waveStart', (waveNum: number, totalWaves: number) => {
      this.events.emit('waveChanged', waveNum, totalWaves);
      this.onWaveStart(waveNum);
    });

    this.events.on('waveComplete', (waveNum: number, totalWaves: number) => {
      this.onWaveComplete(waveNum);
    });

    this.events.on('waveReward', (amount: number) => {
      this.economyManager.earn(amount);
    });

    this.events.on(
      'obstacleDestroyed',
      (obstacle: BaseObstacle, reward: number) => {
        if (reward > 0) {
          this.economyManager.earn(reward);
        }
        this.onObstacleDestroyed(obstacle);
      },
    );

    this.events.on('goldChanged', (oldGold: number, newGold: number) => {
      this.onGoldChanged(oldGold, newGold);
    });
  }

  // ===================== UPDATE FLOW =====================

  private baseUpdate(time: number, delta: number): void {
    this.onPreUpdate();
    this.updateTowers(time, delta);
    this.updateProjectiles();
    this.updateComboTimer(delta);
    this.waveManager.update(delta);
    this.checkEndConditions();
    this.onPostUpdate();
  }

  private updateTowers(time: number, delta: number): void {
    const towers = this.towersGroup.getChildren() as BaseTower[];
    for (const tower of towers) {
      if (tower.active) {
        tower.update(time, delta);
      }
    }
  }

  private updateProjectiles(): void {
    const projectiles =
      this.projectilesGroup.getChildren() as Phaser.Physics.Arcade.Sprite[];
    const bounds = this.cameras.main.getBounds();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const proj = projectiles[i];
      if (!proj.active) continue;

      const target = (proj as any).homingTarget as BaseTDEnemy | undefined;
      const speed = (proj as any).homingSpeed as number | undefined;

      if (target && speed !== undefined) {
        if (!target.active) {
          proj.destroy();
          continue;
        }
        const angle = Phaser.Math.Angle.Between(
          proj.x,
          proj.y,
          target.x,
          target.y,
        );
        proj.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        proj.setRotation(angle);
      }

      if (
        proj.x < bounds.x - 50 ||
        proj.x > bounds.x + bounds.width + 50 ||
        proj.y < bounds.y - 50 ||
        proj.y > bounds.y + bounds.height + 50
      ) {
        proj.destroy();
      }
    }
  }

  private checkEndConditions(): void {
    if (this.lives <= 0 && !this.isGameOver) {
      this.isGameOver = true;
      this.onGameOver();
    }

    if (
      this.waveManager.isAllWavesComplete &&
      !this.isVictory &&
      !this.isGameOver
    ) {
      this.isVictory = true;
      this.onAllWavesComplete();
    }
  }

  // ===================== TOWER PLACEMENT =====================

  private handleLeftClick(pointer: Phaser.Input.Pointer): void {
    const grid = worldToGrid(
      pointer.worldX,
      pointer.worldY,
      this.cellSize,
      this.gridOffsetX,
      this.gridOffsetY,
    );
    const gridKey = `${grid.gridX},${grid.gridY}`;

    const existingTower = this.towerGrid.get(gridKey);
    if (existingTower) {
      this.onTowerClicked(existingTower);
      return;
    }

    if (!this.selectedTowerTypeId) return;
    if (!isValidPlacement(this.cells, grid.gridX, grid.gridY)) return;

    const towerConfig = this.towerTypes.find(
      (t) => t.id === this.selectedTowerTypeId,
    );
    if (!towerConfig) return;

    if (!this.economyManager.canAfford(towerConfig.cost)) return;

    this.economyManager.spend(towerConfig.cost);

    const world = this.gridToWorld(grid.gridX, grid.gridY);
    const tower = this.createTower(
      world.x,
      world.y,
      grid.gridX,
      grid.gridY,
      towerConfig,
    );

    this.towersGroup.add(tower);
    this.towerGrid.set(gridKey, tower);

    this.onTowerPlaced(tower, grid.gridX, grid.gridY);
  }

  /**
   * Instantiate a tower. Override to use custom tower subclasses.
   * Default creates a BaseTower with the given config.
   */
  protected createTower(
    worldX: number,
    worldY: number,
    gridX: number,
    gridY: number,
    config: TowerTypeConfig,
  ): BaseTower {
    return new BaseTower(
      this,
      worldX,
      worldY,
      gridX,
      gridY,
      config,
      this.projectilesGroup,
      this.enemiesGroup,
    );
  }

  /**
   * Sell an existing tower: refund gold, remove from grid.
   */
  protected sellTower(tower: BaseTower): void {
    const gridKey = `${tower.gridX},${tower.gridY}`;
    const refund = this.economyManager.sellTower(tower.invested);

    this.towerGrid.delete(gridKey);
    this.towersGroup.remove(tower, true, true);

    this.onTowerSold(tower);
  }

  /**
   * Upgrade a tower if it can be upgraded and player can afford it.
   */
  protected upgradeTower(tower: BaseTower): boolean {
    const cost = tower.getUpgradeCost();
    if (cost === null) return false;
    if (!this.economyManager.canAfford(cost)) return false;

    this.economyManager.spend(cost);
    tower.upgrade();
    this.onTowerUpgraded(tower, tower.level);
    return true;
  }

  /**
   * Only clear internal selection state -- no event emitted.
   * Safe to call from event listeners without causing recursion.
   */
  private clearTowerSelectionState(): void {
    this.selectedTowerTypeId = null;
    this.clearPlacementPreview();
  }

  /**
   * Cancel tower selection AND notify listeners.
   * Call from user-initiated actions (click, ESC). Never from event listeners.
   */
  private cancelTowerSelection(): void {
    this.clearTowerSelectionState();
    this.events.emit('towerTypeDeselected');
  }

  // ===================== TOWER SLOT VISIBILITY =====================

  /**
   * Show or hide tower slot indicators.
   * Called automatically when tower selection changes.
   * Tower slots are hidden by default and only shown during placement mode.
   */
  private setTowerSlotsVisible(visible: boolean): void {
    if (!this.towerSlotGroup) return;
    const children = this.towerSlotGroup.getChildren();
    for (const child of children) {
      (
        child as Phaser.GameObjects.GameObject & {
          setVisible: (v: boolean) => void;
        }
      ).setVisible(visible);
    }
  }

  // ===================== PLACEMENT PREVIEW =====================

  private updatePlacementPreview(pointer: Phaser.Input.Pointer): void {
    if (!this.selectedTowerTypeId) {
      this.clearPlacementPreview();
      return;
    }

    const grid = worldToGrid(
      pointer.worldX,
      pointer.worldY,
      this.cellSize,
      this.gridOffsetX,
      this.gridOffsetY,
    );
    const world = this.gridToWorld(grid.gridX, grid.gridY);

    const towerConfig = this.towerTypes.find(
      (t) => t.id === this.selectedTowerTypeId,
    );
    if (!towerConfig) return;

    const canPlace =
      isValidPlacement(this.cells, grid.gridX, grid.gridY) &&
      !this.towerGrid.has(`${grid.gridX},${grid.gridY}`);

    if (!this.placementPreview) {
      this.placementPreview = this.add.image(
        world.x,
        world.y,
        towerConfig.textureKey,
      );
      this.placementPreview.setOrigin(0.5, 0.5);
      const tex = this.textures.get(towerConfig.textureKey);
      if (tex?.getSourceImage()) {
        const srcH = (tex.getSourceImage() as HTMLImageElement).height;
        if (srcH > 0) this.placementPreview.setScale(this.cellSize / srcH);
      }
      this.placementPreview.setDepth(200);
    } else {
      this.placementPreview.setPosition(world.x, world.y);
      this.placementPreview.setTexture(towerConfig.textureKey);
    }

    this.placementPreview.setAlpha(canPlace ? 0.7 : 0.3);
    this.placementPreview.setTint(canPlace ? 0x00ff00 : 0xff0000);

    this.rangePreview?.destroy();
    this.rangePreview = createRangeIndicator(
      this,
      world.x,
      world.y,
      towerConfig.range,
      canPlace ? 0x00ff00 : 0xff0000,
    );
  }

  private clearPlacementPreview(): void {
    this.placementPreview?.destroy();
    this.placementPreview = null;
    this.rangePreview?.destroy();
    this.rangePreview = null;
  }

  // ===================== ENEMY SPAWNING =====================

  /**
   * Spawn an enemy of the given type at the start of the path.
   * Override to map enemyType strings to actual enemy subclasses.
   */
  protected spawnEnemy(enemyType: string): void {
    const enemy = this.createEnemy(enemyType);
    if (enemy) {
      this.enemiesGroup.add(enemy);
      enemy.setPath(this.pathWaypoints);
    }
  }

  /**
   * Instantiate an enemy by type string.
   * MUST be overridden by subclasses to create the correct enemy subclass.
   */
  protected abstract createEnemy(enemyType: string): BaseTDEnemy | null;

  // ===================== PROJECTILE HIT =====================

  /**
   * Called when a projectile overlaps an enemy.
   * Default: deal damage, handle splash with distance falloff if present,
   * play hit effect, then destroy projectile.
   * Override to add custom on-hit effects (slow, poison, etc.).
   */
  protected onProjectileHitEnemy(
    projectile: Phaser.Physics.Arcade.Sprite,
    enemy: BaseTDEnemy,
  ): void {
    if (!projectile.active) return;

    const damage = (projectile as any).damage ?? 10;
    const splashRadius = (projectile as any).splashRadius as number | undefined;

    if (splashRadius && splashRadius > 0) {
      const enemies = this.enemiesGroup.getChildren() as BaseTDEnemy[];
      for (const e of enemies) {
        if (!e.active) continue;
        const dist = Phaser.Math.Distance.Between(
          projectile.x,
          projectile.y,
          e.x,
          e.y,
        );
        if (dist <= splashRadius) {
          const falloff = 1 - (dist / splashRadius) * 0.5;
          e.takeDamage(Math.round(damage * falloff));
        }
      }
    } else {
      enemy.takeDamage(damage);
    }

    this.playProjectileHitEffect(projectile);
    projectile.destroy();
  }

  /**
   * Play a visual hit effect at the projectile impact point.
   * Default: brief scale-up and fade-out tween on a temporary sprite.
   * Override to customize per-projectile-type effects.
   */
  protected playProjectileHitEffect(
    projectile: Phaser.Physics.Arcade.Sprite,
  ): void {
    const hitSprite = this.add.sprite(
      projectile.x,
      projectile.y,
      projectile.texture.key,
    );
    hitSprite.setScale(projectile.scaleX);
    hitSprite.setDepth(150);
    hitSprite.setAlpha(0.8);

    this.tweens.add({
      targets: hitSprite,
      scaleX: hitSprite.scaleX * 2.5,
      scaleY: hitSprite.scaleY * 2.5,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => hitSprite.destroy(),
    });
  }

  // ===================== COMBO KILL SYSTEM =====================

  private trackComboKill(_enemy: BaseTDEnemy): void {
    this.comboCount++;
    this.comboTimer = this.comboWindowMs;

    if (this.comboCount >= 2) {
      this.onComboKill(this.comboCount);
    }
  }

  private updateComboTimer(delta: number): void {
    if (this.comboTimer <= 0) return;
    this.comboTimer -= delta;
    if (this.comboTimer <= 0) {
      this.comboCount = 0;
      this.comboTimer = 0;
    }
  }

  // ===================== LIVES SYSTEM =====================

  private loseLives(amount: number): void {
    const oldLives = this.lives;
    this.lives = Math.max(0, this.lives - amount);
    this.events.emit('livesChanged', oldLives, this.lives);
    this.onLivesChanged(oldLives, this.lives);
  }

  // ===================== ABSTRACT METHODS (MUST implement) =====================

  /**
   * Return the grid configuration for this level.
   * Defines grid dimensions, cell size, and the 2D cell type array.
   */
  protected abstract getGridConfig(): GridConfig;

  /**
   * Return the ordered path waypoints in grid coordinates.
   * Enemies follow these points from spawn to exit.
   */
  protected abstract getPathWaypoints(): PathPoint[];

  /**
   * Create the visual environment: background image, decorations, grid overlay.
   * Called after grid is initialized.
   */
  protected abstract createEnvironment(): void;

  /**
   * Return all wave definitions for this level.
   * Each wave contains groups of enemies with spawn intervals.
   */
  protected abstract getWaveDefinitions(): WaveDefinition[];

  /**
   * Return all tower types available in this level.
   * These are displayed in the UI tower selection panel.
   */
  protected abstract getTowerTypes(): TowerTypeConfig[];

  /**
   * Return the minimum spawn interval (ms) between enemies in a wave.
   * Prevents visual overlap when enemy display sizes are large.
   * Default: 700ms. Override to tune per-level based on enemy sizes and speeds.
   * Formula: (largestEnemyDisplayHeight / slowestEnemySpeed) * 1000 * 1.2
   */
  protected getMinSpawnInterval(): number {
    return 700;
  }

  // ===================== HOOKS (CAN override) =====================

  /** Called before scene creation begins */
  protected onPreCreate(): void {}

  /** Called after all scene creation is complete */
  protected onPostCreate(): void {}

  /** Called before each frame update */
  protected onPreUpdate(): void {}

  /** Called after each frame update */
  protected onPostUpdate(): void {}

  /** Called when a new wave starts */
  protected onWaveStart(_waveNumber: number): void {}

  /** Called when a wave is cleared */
  protected onWaveComplete(_waveNumber: number): void {}

  /**
   * Called when all waves are cleared.
   * Default: routes to VictoryUIScene (has next level) or GameCompleteUIScene (final level).
   * Override to customize the end-of-level flow.
   */
  protected onAllWavesComplete(): void {
    const currentKey = this.scene.key;
    if (LevelManager.isLastLevel(currentKey)) {
      this.scene.launch('GameCompleteUIScene', { currentLevelKey: currentKey });
    } else {
      this.scene.launch('VictoryUIScene', { currentLevelKey: currentKey });
    }
    this.scene.pause();
  }

  /** Called when an enemy is killed */
  protected onEnemyKilled(_enemy: BaseTDEnemy): void {}

  /** Called when an enemy reaches the exit */
  protected onEnemyReachedEnd(_enemy: BaseTDEnemy): void {}

  /** Called when a tower is successfully placed */
  protected onTowerPlaced(
    _tower: BaseTower,
    _gridX: number,
    _gridY: number,
  ): void {}

  /**
   * Called when player clicks on an existing tower.
   * Override to show upgrade/sell UI or cycle tower types.
   * Use this.upgradeTower(tower) and this.sellTower(tower) for actions.
   */
  protected onTowerClicked(_tower: BaseTower): void {}

  /** Called when a tower is sold */
  protected onTowerSold(_tower: BaseTower): void {}

  /** Called when a tower is upgraded */
  protected onTowerUpgraded(_tower: BaseTower, _level: number): void {}

  /** Called when lives change */
  protected onLivesChanged(_oldLives: number, _newLives: number): void {}

  /** Called when gold changes */
  protected onGoldChanged(_oldGold: number, _newGold: number): void {}

  /**
   * Called when multiple enemies are killed in quick succession.
   * Override to award bonus gold, show combo UI, play sounds, etc.
   * @param comboCount - number of kills in the current combo chain (>= 2)
   */
  protected onComboKill(_comboCount: number): void {}

  /**
   * Called when a destructible obstacle is destroyed.
   * Override to convert the cell to BUILDABLE, create a tower slot, etc.
   */
  protected onObstacleDestroyed(_obstacle: BaseObstacle): void {}

  /** Called when lives reach 0. Default: launch GameOverUIScene */
  protected onGameOver(): void {
    this.scene.launch('GameOverUIScene', { currentLevelKey: this.scene.key });
    this.scene.pause();
  }

  // ===================== CLEANUP =====================

  shutdown(): void {
    this.waveManager?.destroy();
    this.economyManager?.destroy();
    this.clearPlacementPreview();
    this.gridOverlay?.destroy();
    this.towerSlotGroup?.clear(true, true);
    this.towerGrid.clear();
  }
}
