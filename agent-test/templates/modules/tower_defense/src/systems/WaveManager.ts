import Phaser from 'phaser';

// ============================================================================
// WAVE MANAGER — Manages enemy wave spawning for tower defense
// ============================================================================
// Owned by BaseTDScene. Reads WaveDefinitions and spawns enemies over time.
// Communicates via Phaser.Events.EventEmitter (the scene's event bus).
// ============================================================================

export interface WaveGroup {
  enemyType: string;
  count: number;
  /** ms between spawns within this group */
  interval: number;
}

export interface WaveDefinition {
  groups: WaveGroup[];
  /** bonus gold for clearing wave */
  reward?: number;
  /** ms before this wave starts (after previous completes or game start) */
  preDelay?: number;
}

export class WaveManager {
  private scene: Phaser.Scene;
  private waves: WaveDefinition[];
  private currentWaveIndex: number = -1;
  private spawnQueue: Array<{ enemyType: string; delay: number }> = [];
  private spawnTimer: number = 0;
  private activeEnemyCount: number = 0;
  private waveActive: boolean = false;
  private allWavesStarted: boolean = false;
  private betweenWaveTimer: number = 0;
  private waitingForNextWave: boolean = false;
  private timeBetweenWaves: number;
  private minSpawnInterval: number;

  /**
   * @param minSpawnInterval - Minimum ms between spawns to prevent visual overlap.
   *   Formula: (enemyDisplayHeight / enemySpeed) * 1000 * safetyFactor
   *   Default 700ms works for most enemy sizes ~60-100px at speed 80-120px/s.
   */
  constructor(
    scene: Phaser.Scene,
    waves: WaveDefinition[],
    timeBetweenWaves: number = 5000,
    minSpawnInterval: number = 700,
  ) {
    this.scene = scene;
    this.waves = waves;
    this.timeBetweenWaves = timeBetweenWaves;
    this.minSpawnInterval = minSpawnInterval;
  }

  get currentWave(): number {
    return this.currentWaveIndex + 1;
  }

  get totalWaves(): number {
    return this.waves.length;
  }

  get isWaveActive(): boolean {
    return this.waveActive;
  }

  get isAllWavesComplete(): boolean {
    return (
      this.allWavesStarted && !this.waveActive && this.activeEnemyCount <= 0
    );
  }

  get isWaitingForNextWave(): boolean {
    return this.waitingForNextWave;
  }

  get timeBetweenWavesMs(): number {
    return this.timeBetweenWaves;
  }

  /** Call when an enemy dies or reaches the exit */
  notifyEnemyRemoved(): void {
    this.activeEnemyCount = Math.max(0, this.activeEnemyCount - 1);
  }

  startFirstWave(): void {
    this.startNextWave();
  }

  private startNextWave(): void {
    this.currentWaveIndex++;
    if (this.currentWaveIndex >= this.waves.length) {
      this.allWavesStarted = true;
      return;
    }

    const wave = this.waves[this.currentWaveIndex];
    this.buildSpawnQueue(wave);

    this.spawnTimer = 0;
    this.waveActive = true;
    this.waitingForNextWave = false;

    this.scene.events.emit(
      'waveStart',
      this.currentWaveIndex + 1,
      this.waves.length,
    );
  }

  private buildSpawnQueue(wave: WaveDefinition): void {
    this.spawnQueue = [];
    const preDelay = wave.preDelay ?? 0;
    let accumulatedDelay = preDelay;

    for (const group of wave.groups) {
      const safeInterval = Math.max(group.interval, this.minSpawnInterval);
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({
          enemyType: group.enemyType,
          delay: accumulatedDelay,
        });
        accumulatedDelay += safeInterval;
      }
    }
  }

  /** Skip the between-wave timer and start the next wave immediately */
  skipToNextWave(): void {
    if (this.waitingForNextWave) {
      this.betweenWaveTimer = 0;
    }
  }

  update(delta: number): void {
    if (this.waitingForNextWave) {
      this.betweenWaveTimer -= delta;
      if (this.betweenWaveTimer <= 0) {
        this.startNextWave();
      }
      return;
    }

    if (!this.waveActive) return;

    if (this.spawnQueue.length > 0) {
      this.spawnTimer += delta;
      while (
        this.spawnQueue.length > 0 &&
        this.spawnTimer >= this.spawnQueue[0].delay
      ) {
        const spawn = this.spawnQueue.shift()!;
        this.activeEnemyCount++;
        this.scene.events.emit('spawnEnemy', spawn.enemyType);
      }
    }

    if (this.spawnQueue.length === 0 && this.activeEnemyCount <= 0) {
      this.onWaveCleared();
    }
  }

  private onWaveCleared(): void {
    this.waveActive = false;
    const clearedWave = this.waves[this.currentWaveIndex];

    if (clearedWave?.reward) {
      this.scene.events.emit('waveReward', clearedWave.reward);
    }
    this.scene.events.emit(
      'waveComplete',
      this.currentWaveIndex + 1,
      this.waves.length,
    );

    if (this.currentWaveIndex + 1 >= this.waves.length) {
      this.allWavesStarted = true;
      this.scene.events.emit('allWavesComplete');
    } else {
      this.waitingForNextWave = true;
      this.betweenWaveTimer = this.timeBetweenWaves;
    }
  }

  destroy(): void {
    this.spawnQueue = [];
    this.waveActive = false;
  }
}
