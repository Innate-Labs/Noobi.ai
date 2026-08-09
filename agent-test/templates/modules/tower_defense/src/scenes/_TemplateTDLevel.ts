import Phaser from 'phaser';
import { BaseTDScene } from './BaseTDScene';
import type { GridConfig, PathPoint } from './BaseTDScene';
import type { TowerTypeConfig } from '../towers/BaseTower';
import type { WaveDefinition } from '../systems/WaveManager';
import {
  CellType,
  textureExists,
  drawPathLine,
  drawTowerSlots,
  showFloatingText,
  worldToGrid,
} from '../utils';
import { BaseTDEnemy } from '../enemies/BaseTDEnemy';
import type { BaseTower } from '../towers/BaseTower';
import type { BaseObstacle } from '../entities/BaseObstacle';
import * as CONFIG from '../gameConfig.json';
// TODO-IMPORT: Import your custom tower/enemy/obstacle classes here
// import { ArrowTower, ARROW_TOWER_CONFIG } from '../towers/ArrowTower';
// import { Goblin } from '../enemies/Goblin';
// import { TreeObstacle } from '../entities/TreeObstacle';

// ============================================================================
// _TEMPLATE TD LEVEL — Copy this file to create a new tower defense level
// ============================================================================
// Operation: COPY
//
// Steps:
// 1. Copy this file → rename to your level (e.g., Level1.ts)
// 2. Rename the class and update the constructor scene key
// 3. Implement all abstract methods with level-specific content:
//    - getGridConfig()       — grid layout
//    - getPathWaypoints()    — enemy path
//    - createEnvironment()   — visuals
//    - getWaveDefinitions()  — wave configs
//    - getTowerTypes()       — available towers
//    - createEnemy()         — enemy factory
// 4. Override hooks as needed
// 5. Register scene in main.ts and LevelManager.ts
// ============================================================================

export class _TemplateTDLevel extends BaseTDScene {
  constructor() {
    super({ key: '_TemplateTDLevel' }); // TODO-SCENE: Change to your scene key
  }

  // ===================== PRELOAD =====================

  preload(): void {
    // TODO-ASSET: Assets should be loaded in Preloader.ts
    // This method is only for level-specific dynamic loading if needed
  }

  // ===================== ABSTRACT METHOD IMPLEMENTATIONS =====================

  /**
   * Define the grid layout for this level.
   * CellType values: BUILDABLE(0), PATH(1), BLOCKED(2), SPAWN(3), EXIT(4)
   */
  protected getGridConfig(): GridConfig {
    // TODO-GDD: Replace with level grid from GDD Section 4
    const cellSize = CONFIG.towerDefenseConfig.cellSize.value;
    const screenW = CONFIG.screenSize.width.value;
    const screenH = CONFIG.screenSize.height.value;
    const cols = 12;
    const rows = 10;
    const mapW = cols * cellSize;
    const mapH = rows * cellSize;
    const offsetX = Math.floor((screenW - mapW) / 2);
    const offsetY = Math.floor((screenH - mapH) / 2);

    // S = SPAWN(3), P = PATH(1), E = EXIT(4), B = BUILDABLE(0), X = BLOCKED(2)
    // Pre-mark obstacle cells as BLOCKED(2) directly in this array.
    const cells: CellType[][] = [
      [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      [3, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 2],
      [2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2],
      [2, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 2],
      [2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2],
      [2, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 2],
      [2, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2],
      [2, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 4],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
      [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    ];

    return { cols, rows, cellSize, cells, offsetX, offsetY };
  }

  /**
   * Define the enemy path waypoints in grid coordinates.
   * Enemies follow these in order from spawn to exit.
   */
  protected getPathWaypoints(): PathPoint[] {
    // TODO-GDD: Replace with path from GDD Section 4
    return [
      { gridX: 0, gridY: 1 }, // spawn
      { gridX: 3, gridY: 1 },
      { gridX: 3, gridY: 3 },
      { gridX: 6, gridY: 3 },
      { gridX: 6, gridY: 5 },
      { gridX: 8, gridY: 5 },
      { gridX: 8, gridY: 7 },
      { gridX: 11, gridY: 7 }, // exit
    ];
  }

  /**
   * Create the visual environment for this level.
   * Called after grid is initialized.
   */
  protected createEnvironment(): void {
    const screenW = CONFIG.screenSize.width.value;
    const screenH = CONFIG.screenSize.height.value;

    // TODO-ASSET: Add background image (stretch to full screen)
    // if (textureExists(this, 'level1_bg')) {
    //   const bg = this.add.image(0, 0, 'level1_bg').setOrigin(0, 0);
    //   bg.setDisplaySize(screenW, screenH);
    //   bg.setDepth(-10);
    // }

    // Tower slot visuals: hidden by default, shown when player selects a tower type.
    // Requires 'tower_slot' asset (type: "image"). Falls back to subtle graphic.
    this.towerSlotGroup = drawTowerSlots(
      this,
      this.cells,
      this.cellSize,
      this.gridOffsetX,
      this.gridOffsetY,
    );

    // Path visualization: semi-transparent line showing enemy route
    drawPathLine(this, this.pathWaypoints);

    // TODO-GDD: Add decorations, spawn/exit markers, defense target, etc.
  }

  /**
   * Define all wave configurations for this level.
   */
  protected getWaveDefinitions(): WaveDefinition[] {
    // TODO-GDD: Replace with waves from GDD Section 4
    return [
      {
        preDelay: 2000,
        groups: [{ enemyType: 'basic', count: 5, interval: 1000 }],
        reward: 20,
      },
      {
        groups: [{ enemyType: 'basic', count: 8, interval: 800 }],
        reward: 30,
      },
      {
        groups: [
          { enemyType: 'basic', count: 6, interval: 600 },
          { enemyType: 'fast', count: 4, interval: 500 },
        ],
        reward: 50,
      },
    ];
  }

  /**
   * Define all tower types available in this level.
   */
  protected getTowerTypes(): TowerTypeConfig[] {
    // TODO-GDD: Replace with tower types from GDD
    // TODO-IMPORT: Import configs from tower files
    // return [ARROW_TOWER_CONFIG, CANNON_TOWER_CONFIG];
    return [
      {
        id: 'basic_tower',
        name: 'Arrow Tower',
        textureKey: 'tower_basic',
        cost: 50,
        damage: 10,
        range: 150,
        fireRate: 1.0,
        projectileKey: 'tower_bullet',
        projectileSpeed: 300,
        targetingMode: 'first',
        upgrades: [
          { level: 2, cost: 40, damage: 18, range: 160, fireRate: 1.2 },
          { level: 3, cost: 80, damage: 30, range: 180, fireRate: 1.5 },
        ],
      },
    ];
  }

  /**
   * Create an enemy instance by type string.
   * Called by WaveManager via spawnEnemy event.
   */
  protected createEnemy(enemyType: string): BaseTDEnemy | null {
    // TODO-IMPORT: Map type strings to actual enemy subclasses
    switch (enemyType) {
      case 'basic':
        return new BaseTDEnemy(this, 0, 0, {
          textureKey: 'enemy_basic',
          displayHeight: 48,
          stats: { maxHealth: 100, speed: 80, reward: 10, damage: 1 },
        });
      // case 'fast':
      //   return new FastEnemy(this, 0, 0);
      default:
        console.warn(`Unknown enemy type: ${enemyType}`);
        return null;
    }
  }

  // ===================== OPTIONAL: TOWER FACTORY OVERRIDE =====================

  // Override to use custom tower subclasses instead of BaseTower
  // protected createTower(
  //   worldX: number, worldY: number,
  //   gridX: number, gridY: number,
  //   config: TowerTypeConfig
  // ): BaseTower {
  //   switch (config.id) {
  //     case 'arrow_tower':
  //       return new ArrowTower(this, worldX, worldY, gridX, gridY, config,
  //         this.projectilesGroup, this.enemiesGroup);
  //     default:
  //       return super.createTower(worldX, worldY, gridX, gridY, config);
  //   }
  // }

  // ===================== HOOK OVERRIDES =====================

  // --- onPreCreate / onPostCreate ---
  // protected onPreCreate(): void { }
  // protected onPostCreate(): void {
  //   // Example: place destructible obstacles on the map
  //   // const obs = new TreeObstacle(this, 300, 200);
  //   // this.obstaclesGroup.add(obs);
  // }

  // --- onWaveStart: Trigger events when a wave begins ---
  // protected onWaveStart(waveNumber: number): void {
  //   // Example: play wave start sound
  //   // safeAddSound(this, 'wave_start_sfx')?.play();
  // }

  // --- onWaveComplete: React to wave completion ---
  // protected onWaveComplete(waveNumber: number): void {
  //   // Example: wave clear bonus text
  //   // showFloatingText(this, this.scale.width / 2, this.scale.height / 2,
  //   //   'WAVE CLEAR!', '#44FF44', 24, 1500, 60);
  // }

  // --- onEnemyKilled: Additional effects when an enemy dies ---
  // protected onEnemyKilled(enemy: BaseTDEnemy): void {
  //   // Example: floating reward text at enemy position
  //   // showFloatingText(this, enemy.x, enemy.y, `+${enemy.killReward}`, '#FFD700');
  // }

  // --- onEnemyReachedEnd: Effects when enemy reaches exit ---
  // protected onEnemyReachedEnd(enemy: BaseTDEnemy): void {
  //   // Example: screen shake
  //   // this.cameras.main.shake(200, 0.005);
  // }

  // --- onTowerPlaced: Effects when tower is built ---
  // protected onTowerPlaced(tower: BaseTower, gridX: number, gridY: number): void {
  //   // Example: placement sound
  //   // safeAddSound(this, 'tower_place_sfx')?.play();
  // }

  // --- onTowerClicked: Player clicks an existing tower (upgrade/sell) ---
  // protected onTowerClicked(tower: BaseTower): void {
  //   // Example: try upgrade, fall back to sell
  //   // if (tower.canUpgrade()) {
  //   //   this.upgradeTower(tower);
  //   // } else {
  //   //   this.sellTower(tower);
  //   // }
  // }

  // --- onComboKill: Rapid successive kills ---
  // protected onComboKill(comboCount: number): void {
  //   // Example: bonus gold and floating combo text
  //   // const bonus = comboCount * 2;
  //   // this.economyManager.earn(bonus);
  //   // showFloatingText(this, this.scale.width / 2, 100,
  //   //   `COMBO x${comboCount}! +${bonus}g`, '#FF8800', 20, 1200, 50);
  // }

  // --- onObstacleDestroyed: A destructible obstacle was destroyed ---
  // protected onObstacleDestroyed(obstacle: BaseObstacle): void {
  //   // Example: convert the obstacle's cell to BUILDABLE
  //   // const grid = worldToGrid(obstacle.x, obstacle.y,
  //   //   this.cellSize, this.gridOffsetX, this.gridOffsetY);
  //   // if (grid.gridY >= 0 && grid.gridY < this.cells.length &&
  //   //     grid.gridX >= 0 && grid.gridX < this.cells[0].length) {
  //   //   this.cells[grid.gridY][grid.gridX] = CellType.BUILDABLE;
  //   // }
  //   // showFloatingText(this, obstacle.x, obstacle.y, '+15g', '#FFD700');
  // }

  // --- onGameOver: Custom game over behavior ---
  // protected onGameOver(): void {
  //   // Example: custom game over with delay
  //   // this.cameras.main.fade(1000, 0, 0, 0, false, (_cam: any, progress: number) => {
  //   //   if (progress === 1) {
  //   //     super.onGameOver();
  //   //   }
  //   // });
  //   super.onGameOver();
  // }
}
