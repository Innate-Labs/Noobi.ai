/**
 * ============================================================================
 * BASE ENDING SCENE - Foundation for result/ending screens
 * ============================================================================
 *
 * Provides lifecycle for displaying game endings, victory/defeat screens,
 * score summaries, and narrative conclusions.
 *
 * LIFECYCLE:
 *   create() calls in order:
 *     1. createBackground()         -- HOOK: set background
 *     2. createEndingContent()      -- HOOK: title, text, images
 *     3. showResults()              -- HOOK: score, stats display
 *     4. playEndingMusic()          -- uses getEndingMusicKey() hook
 *     5. setupContinue()            -- sets up continue input
 *
 * HOOK METHODS:
 *   - getEndingData(): Return ending configuration (title, text, bg)
 *   - createBackground(): Custom background
 *   - createEndingContent(): Main ending display (text, images, animations)
 *   - showResults(): Display scores, stats, achievements
 *   - getEndingMusicKey(): Return audio key for ending music
 *   - onContinue(): Called when player presses continue
 *   - onUpdate(): Per-frame logic
 *
 * Usage:
 *   export class VictoryScene extends BaseEndingScene {
 *     constructor() { super({ key: 'VictoryScene' }); }
 *
 *     protected getEndingData(): EndingData {
 *       return { title: 'Victory!', text: 'You won the duel!', type: 'victory' };
 *     }
 *   }
 *
 * SAFETY NOTES:
 *   - onContinue() default goes to 'TitleScreen' -- ensure this matches main.ts
 *   - All type imports MUST use the "type" keyword:
 *       import { type EndingData } from './BaseEndingScene';
 *   - Use this.events.once('shutdown', cb) for cleanup, NOT override shutdown()
 */

import Phaser from 'phaser';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type EndingType = 'victory' | 'defeat' | 'neutral' | 'secret' | 'custom';

export interface EndingData {
  /** Ending title text */
  title: string;
  /** Ending body text or description */
  text?: string;
  /** Ending type for styling */
  type: EndingType;
  /** Background image key */
  backgroundKey?: string;
  /** Background music key */
  musicKey?: string;
  /** Stats to display */
  stats?: Record<string, string | number>;
}

// ============================================================================
// BASE CLASS
// ============================================================================

export abstract class BaseEndingScene extends Phaser.Scene {
  protected endingData?: EndingData;
  protected backgroundMusic?: Phaser.Sound.BaseSound;

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  create(): void {
    // Reset mutable state (Phaser reuses scene instances on scene.start,
    // so constructor field initializers do NOT run again)
    if (this.backgroundMusic) {
      this.backgroundMusic.stop();
    }
    this.endingData = undefined;
    this.backgroundMusic = undefined;

    this.endingData = this.getEndingData();
    this.createBackground();
    this.createEndingContent();
    this.showResults();
    this.playEndingMusic();
    this.setupContinue();
  }

  update(time: number, delta: number): void {
    this.onUpdate(time, delta);
  }

  // ============================================================================
  // HOOKS
  // ============================================================================

  /**
   * HOOK (REQUIRED): Return the ending configuration.
   * This determines the title, text, type, and styling of the ending.
   */
  protected abstract getEndingData(): EndingData;

  /** HOOK: Create the background. */
  protected createBackground(): void {}

  /**
   * HOOK: Create the main ending content (title, text, images, animations).
   * Called after getEndingData() so this.endingData is available.
   */
  protected createEndingContent(): void {}

  /**
   * HOOK: Display score summary, statistics, achievements.
   * Use GameDataManager to retrieve persistent data.
   */
  protected showResults(): void {}

  /** HOOK: Return audio key for ending music. */
  protected getEndingMusicKey(): string | undefined {
    return this.endingData?.musicKey;
  }

  /**
   * HOOK: Called when the player presses continue/restart.
   * Default: return to TitleScreen.
   */
  protected onContinue(): void {
    this.scene.start('TitleScreen');
  }

  /** HOOK: Per-frame logic. */
  protected onUpdate(time: number, delta: number): void {}

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /** Set up continue/restart input (Enter, Space, Click). */
  protected setupContinue(): void {
    const enterKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    );
    const spaceKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    const handleContinue = () => {
      // Remove listeners to prevent double-fire
      enterKey?.off('down', handleContinue);
      spaceKey?.off('down', handleContinue);
      this.input.off('pointerdown', handleContinue);
      if (this.backgroundMusic) {
        this.backgroundMusic.stop();
      }
      this.onContinue();
    };

    enterKey?.on('down', handleContinue);
    spaceKey?.on('down', handleContinue);
    this.input.on('pointerdown', handleContinue);
  }

  /** Play ending music with fade-in. */
  private playEndingMusic(): void {
    const key = this.getEndingMusicKey();
    if (!key) return;
    try {
      if (this.sound.get(key)) {
        this.backgroundMusic = this.sound.get(key);
      } else {
        this.backgroundMusic = this.sound.add(key, { loop: true, volume: 0 });
      }
      this.backgroundMusic?.play();
      this.tweens.add({
        targets: this.backgroundMusic,
        volume: 0.5,
        duration: 1000,
      });
    } catch (e) {
      console.warn(`[BaseEndingScene] Could not play music: ${key}`, e);
    }
  }
}
