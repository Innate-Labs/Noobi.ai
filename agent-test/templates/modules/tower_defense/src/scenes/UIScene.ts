import Phaser from 'phaser';
import * as utils from '../utils';
import type { TowerTypeConfig } from '../towers/BaseTower';

/**
 * UI Scene -- In-game HUD overlay (Tower Defense)
 *
 * This is the tower defense module's UIScene with TD-specific HUD elements:
 * - Gold counter, Lives counter, Wave progress
 * - Tower selection panel (bottom)
 * - Pause button + ESC key
 * - Controls hint
 *
 * This file OVERWRITES the core UIScene.ts during scaffold.
 *
 * Communication with game scene via Phaser events:
 * - Game -> UI: 'goldChanged', 'livesChanged', 'waveChanged', 'towerTypesReady'
 * - UI -> Game: 'towerTypeSelected', 'towerTypeDeselected'
 */
export default class UIScene extends Phaser.Scene {
  public currentGameSceneKey: string | null;
  public uiContainer: Phaser.GameObjects.DOMElement | null;

  private gold: number = 0;
  private lives: number = 0;
  private currentWave: number = 0;
  private totalWaves: number = 0;
  private towerTypes: TowerTypeConfig[] = [];
  private selectedTowerTypeId: string | null = null;
  private waveTimerActive: boolean = false;
  private waveTimerEndTime: number = 0;

  constructor() {
    super({ key: 'UIScene' });
    this.currentGameSceneKey = null;
    this.uiContainer = null;
  }

  init(data: {
    callingScene?: string;
    gold?: number;
    lives?: number;
    towerTypes?: TowerTypeConfig[];
  }): void {
    this.currentGameSceneKey = data.callingScene || null;
    this.gold = data.gold ?? 0;
    this.lives = data.lives ?? 0;
    this.towerTypes = data.towerTypes ?? [];
  }

  create(): void {
    this.createDOMUI();
    this.setupPauseControls();
    this.setupGameEventListeners();
    this.setupTowerButtons();
    this.injectTowerIcons();
    this.updateGoldDisplay();
    this.updateLivesDisplay();
    this.updateWaveDisplay();
  }

  // ===================== DOM UI =====================

  createDOMUI(): void {
    const towerButtonsHTML = this.towerTypes
      .map(
        (t) => `
      <button data-tower-id="${t.id}" data-texture-key="${t.textureKey}"
        class="tower-btn flex flex-col items-center gap-1 px-2 py-2 rounded-xl border-2 border-amber-700 hover:border-yellow-400 transition-all duration-200 pointer-events-auto cursor-pointer min-w-[80px]"
        style="background: linear-gradient(180deg, rgba(139,90,43,0.95) 0%, rgba(101,67,33,0.95) 100%); text-shadow: 1px 1px 0 #000; box-shadow: 0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15);">
        <img data-tower-icon="${t.id}" src="" alt="${t.name}" class="w-10 h-10 object-contain" style="image-rendering: pixelated;" />
        <span class="font-bold text-amber-100 text-xs leading-tight">${t.name}</span>
        <span class="text-yellow-300 text-xs font-bold">${t.cost}g</span>
      </button>
    `,
      )
      .join('');

    const uiHTML = `
      <div id="ui-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000] font-retro">
        <!-- Top-left: Gold + Lives + Wave -->
        <div class="absolute top-4 left-4 flex flex-col gap-2">
          <!-- Gold -->
          <div class="flex items-center gap-2 rounded-lg px-3 py-1.5 border border-yellow-700" style="background: linear-gradient(135deg, rgba(60,40,10,0.9) 0%, rgba(40,30,10,0.9) 100%);">
            <span class="text-yellow-400 text-sm" style="text-shadow: 1px 1px 0 #000;">GOLD</span>
            <span id="gold-text" class="text-yellow-300 text-sm font-bold" style="text-shadow: 1px 1px 0 #000;">${this.gold}</span>
          </div>

          <!-- Lives -->
          <div class="flex items-center gap-2 rounded-lg px-3 py-1.5 border border-red-800" style="background: linear-gradient(135deg, rgba(60,15,15,0.9) 0%, rgba(40,10,10,0.9) 100%);">
            <span class="text-red-400 text-sm" style="text-shadow: 1px 1px 0 #000;">LIVES</span>
            <span id="lives-text" class="text-red-300 text-sm font-bold" style="text-shadow: 1px 1px 0 #000;">${this.lives}</span>
          </div>

          <!-- Wave -->
          <div class="flex items-center gap-2 rounded-lg px-3 py-1.5 border border-blue-700" style="background: linear-gradient(135deg, rgba(15,25,60,0.9) 0%, rgba(10,15,40,0.9) 100%);">
            <span class="text-blue-400 text-sm" style="text-shadow: 1px 1px 0 #000;">WAVE</span>
            <span id="wave-text" class="text-blue-300 text-sm font-bold" style="text-shadow: 1px 1px 0 #000;">--</span>
          </div>
        </div>

        <!-- Top-right: Pause Button -->
        <button id="pause-btn" class="absolute top-4 right-4 px-4 py-2 hover:brightness-125 text-white text-sm rounded-xl border-2 border-amber-700 hover:border-yellow-400 transition-all duration-200 pointer-events-auto cursor-pointer" style="background: linear-gradient(180deg, rgba(139,90,43,0.9) 0%, rgba(101,67,33,0.9) 100%); text-shadow: 2px 2px 0 #000; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">
          PAUSE
        </button>

        <!-- Bottom: Tower Selection Panel -->
        <div class="absolute bottom-0 left-0 w-full">
          <div id="tower-panel" class="flex items-center justify-center gap-3 p-3 border-t-2 border-amber-800" style="background: linear-gradient(0deg, rgba(50,30,10,0.95) 0%, rgba(70,45,20,0.9) 100%);">
            <span class="text-amber-300 text-xs mr-2 font-bold" style="text-shadow: 1px 1px 0 #000;">TOWERS:</span>
            ${towerButtonsHTML}
          </div>
        </div>

        <!-- Wave countdown timer (between waves) -->
        <div id="wave-timer" class="absolute bottom-16 left-1/2 transform -translate-x-1/2 hidden">
          <div class="rounded-lg px-4 py-1.5 border border-green-700" style="background: linear-gradient(135deg, rgba(10,40,10,0.9) 0%, rgba(10,30,10,0.9) 100%);">
            <span class="text-gray-300 text-xs" style="text-shadow: 1px 1px 0 #000;">Next wave: </span>
            <span id="wave-timer-text" class="text-green-400 text-sm font-bold" style="text-shadow: 1px 1px 0 #000;">--</span>
          </div>
        </div>

        <!-- Combo kill display (top-center) -->
        <div id="combo-display" class="absolute top-4 left-1/2 transform -translate-x-1/2 hidden" style="z-index: 1100;">
          <div class="rounded-lg px-6 py-2 border-2 border-orange-500" style="background: linear-gradient(135deg, rgba(80,40,0,0.95) 0%, rgba(50,20,0,0.95) 100%); box-shadow: 0 0 12px rgba(255,140,0,0.6);">
            <span id="combo-text" class="text-orange-300 text-xl font-bold" style="text-shadow: 2px 2px 0 #000;">COMBO x2!</span>
          </div>
        </div>

        <!-- Wave bonus display (top-center, stacked below combo) -->
        <div id="wave-bonus-display" class="absolute top-16 left-1/2 transform -translate-x-1/2 hidden" style="z-index: 1100;">
          <div class="rounded-lg px-6 py-2 border-2 border-green-500" style="background: linear-gradient(135deg, rgba(10,60,10,0.95) 0%, rgba(10,40,10,0.95) 100%); box-shadow: 0 0 12px rgba(0,200,0,0.5);">
            <span id="wave-bonus-text" class="text-green-300 text-xl font-bold" style="text-shadow: 2px 2px 0 #000;">WAVE BONUS!</span>
          </div>
        </div>

        <!-- Top-right: Controls Hint (below pause button) -->
        <div class="absolute top-16 right-4 text-amber-200 text-xs opacity-50 text-right max-w-[200px] leading-relaxed" style="text-shadow: 1px 1px 0 #000;">
          Click tower -> Click map<br/>
          Click placed: Upgrade/Sell<br/>
          Space: Next wave | ESC: Pause
        </div>
      </div>
    `;

    this.uiContainer = utils.initUIDom(this, uiHTML);
  }

  // ===================== CONTROLS =====================

  private setupPauseControls(): void {
    this.time.delayedCall(100, () => {
      const pauseBtn = document.getElementById('pause-btn');
      if (pauseBtn) {
        pauseBtn.addEventListener('click', () => this.pauseGame());
      }
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.selectedTowerTypeId) {
        this.deselectTower();
      } else {
        this.pauseGame();
      }
    });
  }

  private pauseGame(): void {
    if (!this.currentGameSceneKey) return;
    const gameScene = this.scene.get(this.currentGameSceneKey);
    if (!gameScene || !this.scene.isActive(this.currentGameSceneKey)) return;

    this.scene.pause(this.currentGameSceneKey);
    this.scene.launch('PauseUIScene', {
      currentLevelKey: this.currentGameSceneKey,
    });
  }

  // ===================== TOWER SELECTION =====================

  private setupTowerButtons(): void {
    this.time.delayedCall(100, () => {
      const buttons = document.querySelectorAll('.tower-btn');
      buttons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const target = e.currentTarget as HTMLElement;
          const towerId = target.getAttribute('data-tower-id');
          if (towerId) {
            this.selectTower(towerId);
          }
        });
      });
    });
  }

  /**
   * Extract Phaser textures and inject them as data URLs into tower button icons.
   * Uses the game scene's texture manager to convert loaded textures to base64.
   */
  private injectTowerIcons(): void {
    const gameScene = this.currentGameSceneKey
      ? this.scene.get(this.currentGameSceneKey)
      : null;
    const texManager = gameScene?.textures ?? this.textures;

    this.time.delayedCall(150, () => {
      for (const t of this.towerTypes) {
        const imgEl = document.querySelector(
          `img[data-tower-icon="${t.id}"]`,
        ) as HTMLImageElement | null;
        if (!imgEl) continue;

        try {
          const frame = texManager.getFrame(t.textureKey);
          if (!frame) continue;

          const canvas = document.createElement('canvas');
          canvas.width = frame.width;
          canvas.height = frame.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          ctx.drawImage(
            frame.source.image as HTMLImageElement,
            frame.cutX,
            frame.cutY,
            frame.cutWidth,
            frame.cutHeight,
            0,
            0,
            frame.width,
            frame.height,
          );
          imgEl.src = canvas.toDataURL('image/png');
        } catch (_e) {
          imgEl.style.display = 'none';
        }
      }
    });
  }

  private selectTower(typeId: string): void {
    this.selectedTowerTypeId = typeId;
    this.updateTowerButtonStyles();

    if (this.currentGameSceneKey) {
      const gameScene = this.scene.get(this.currentGameSceneKey);
      gameScene?.events.emit('towerTypeSelected', typeId);
    }
  }

  private deselectTower(): void {
    this.selectedTowerTypeId = null;
    this.updateTowerButtonStyles();

    if (this.currentGameSceneKey) {
      const gameScene = this.scene.get(this.currentGameSceneKey);
      gameScene?.events.emit('towerTypeDeselected');
    }
  }

  private updateTowerButtonStyles(): void {
    const buttons = document.querySelectorAll('.tower-btn');
    buttons.forEach((btn) => {
      const el = btn as HTMLElement;
      const towerId = el.getAttribute('data-tower-id');
      if (towerId === this.selectedTowerTypeId) {
        el.style.background =
          'linear-gradient(180deg, rgba(40,100,180,0.95) 0%, rgba(30,70,140,0.95) 100%)';
        el.classList.add('border-yellow-400');
        el.classList.remove('border-amber-700');
      } else {
        el.style.background =
          'linear-gradient(180deg, rgba(139,90,43,0.95) 0%, rgba(101,67,33,0.95) 100%)';
        el.classList.remove('border-yellow-400');
        el.classList.add('border-amber-700');
      }
    });
  }

  // ===================== GAME EVENT LISTENERS =====================

  private setupGameEventListeners(): void {
    if (!this.currentGameSceneKey) return;
    const gameScene = this.scene.get(this.currentGameSceneKey);
    if (!gameScene) return;

    gameScene.events.on('goldChanged', (_oldGold: number, newGold: number) => {
      this.gold = newGold;
      this.updateGoldDisplay();
    });

    gameScene.events.on(
      'livesChanged',
      (_oldLives: number, newLives: number) => {
        this.lives = newLives;
        this.updateLivesDisplay();
      },
    );

    gameScene.events.on('waveChanged', (current: number, total: number) => {
      this.currentWave = current;
      this.totalWaves = total;
      this.updateWaveDisplay();
      this.hideWaveTimer();
    });

    gameScene.events.on(
      'waveComplete',
      (_waveNum: number, _totalWaves: number) => {
        this.showWaveTimer();
      },
    );

    gameScene.events.on('towerTypesReady', (types: TowerTypeConfig[]) => {
      this.towerTypes = types;
    });

    gameScene.events.on('showCombo', (comboCount: number) => {
      this.showCombo(comboCount);
    });

    gameScene.events.on('showWaveBonus', (amount: number) => {
      this.showWaveBonus(amount);
    });

    gameScene.events.on('towerTypeDeselected', () => {
      this.selectedTowerTypeId = null;
      this.updateTowerButtonStyles();
    });
  }

  // ===================== DISPLAY UPDATES =====================

  private updateGoldDisplay(): void {
    const el = document.getElementById('gold-text');
    if (el) el.textContent = `${this.gold}`;
  }

  private updateLivesDisplay(): void {
    const el = document.getElementById('lives-text');
    if (el) {
      el.textContent = `${this.lives}`;
      if (this.lives <= 5) {
        el.className = 'text-red-500 text-sm font-bold animate-pulse';
      } else {
        el.className = 'text-red-300 text-sm font-bold';
      }
    }
  }

  private updateWaveDisplay(): void {
    const el = document.getElementById('wave-text');
    if (el) {
      if (this.totalWaves > 0) {
        el.textContent = `${this.currentWave}/${this.totalWaves}`;
      } else {
        el.textContent = '--';
      }
    }
  }

  // ===================== WAVE COUNTDOWN TIMER =====================

  private showWaveTimer(): void {
    if (!this.currentGameSceneKey) return;
    const gameScene = this.scene.get(this.currentGameSceneKey) as any;
    const timeBetween = gameScene?.waveManager?.timeBetweenWavesMs;
    if (!timeBetween || timeBetween <= 0) return;

    this.waveTimerActive = true;
    this.waveTimerEndTime = this.time.now + timeBetween;

    const el = document.getElementById('wave-timer');
    el?.classList.remove('hidden');
  }

  private hideWaveTimer(): void {
    this.waveTimerActive = false;
    const el = document.getElementById('wave-timer');
    el?.classList.add('hidden');
  }

  private updateWaveTimer(): void {
    if (!this.waveTimerActive) return;

    const remaining = Math.max(0, this.waveTimerEndTime - this.time.now);
    if (remaining <= 0) {
      this.hideWaveTimer();
      return;
    }

    const seconds = Math.ceil(remaining / 1000);
    const el = document.getElementById('wave-timer-text');
    if (el) el.textContent = `${seconds}s`;
  }

  // ===================== COMBO DISPLAY =====================

  private showCombo(comboCount: number): void {
    const container = document.getElementById('combo-display');
    const text = document.getElementById('combo-text');
    if (!container || !text) return;

    text.textContent = `COMBO x${comboCount}!`;
    container.classList.remove('hidden');

    if ((this as any)._comboHideTimer) {
      clearTimeout((this as any)._comboHideTimer);
    }

    (this as any)._comboHideTimer = setTimeout(() => {
      container.classList.add('hidden');
    }, 2000);
  }

  // ===================== WAVE BONUS DISPLAY =====================

  private showWaveBonus(amount: number): void {
    const container = document.getElementById('wave-bonus-display');
    const text = document.getElementById('wave-bonus-text');
    if (!container || !text) return;

    text.textContent = amount > 0 ? `WAVE BONUS! +${amount}g` : 'WAVE CLEAR!';
    container.classList.remove('hidden');

    setTimeout(() => {
      container.classList.add('hidden');
    }, 2500);
  }

  update(): void {
    this.updateWaveTimer();
  }
}
