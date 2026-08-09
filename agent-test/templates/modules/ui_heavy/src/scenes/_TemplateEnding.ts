/**
 * ============================================================================
 * TEMPLATE: Ending Scene (Victory / Defeat / Custom)
 * ============================================================================
 *
 * INSTRUCTIONS FOR AGENT:
 * 1. Copy this file and rename (e.g., VictoryScene.ts, DefeatScene.ts)
 * 2. Rename the class
 * 3. Define ending data in getEndingData()
 * 4. Override hooks for custom content and results display
 *
 * CRITICAL RULES:
 * - Do NOT override create() - base class handles the full lifecycle
 * - getEndingData() is REQUIRED
 * - Base class provides: setupContinue (Enter/Space/Click to return)
 * - Always check this.textures.exists() before using texture keys
 * - All interface/type imports MUST use "type" keyword
 * - Scene key in scene.start('KEY') MUST match key registered in main.ts
 *   (e.g., 'TitleScreen' not 'TitleScene')
 *
 * FILE CHECKLIST (complete AFTER implementing this scene):
 *   [ ] main.ts — import and register this scene with game.scene.add()
 *   [ ] asset-pack.json — register background/music keys used here
 *   [ ] onContinue() — ensure scene.start('X') target is registered in main.ts
 * ============================================================================
 */

import Phaser from 'phaser';
import { BaseEndingScene, type EndingData } from './BaseEndingScene';

export class _TemplateEnding extends BaseEndingScene {
  constructor() {
    super({ key: '_TemplateEnding' }); // TODO: Replace with your scene key
  }

  // ============================================================================
  // REQUIRED: Define ending data
  // ============================================================================

  protected override getEndingData(): EndingData {
    return {
      title: 'The End', // TODO: Replace with your ending title
      text: 'Thanks for playing!',
      type: 'victory', // 'victory' | 'defeat' | 'neutral' | 'secret' | 'custom'
      // backgroundKey: 'ending_bg',
      // musicKey: 'victory_music',
    };
  }

  // ============================================================================
  // OPTIONAL: Custom content
  // ============================================================================

  protected override createBackground(): void {
    // const cam = this.cameras.main;
    // const bgKey = this.endingData?.backgroundKey ?? 'ending_bg';
    // if (this.textures.exists(bgKey)) {
    //   const bg = this.add.image(cam.width / 2, cam.height / 2, bgKey);
    //   bg.setDisplaySize(cam.width, cam.height);
    // }
  }

  protected override createEndingContent(): void {
    // const cam = this.cameras.main;
    // this.add.text(cam.width / 2, cam.height * 0.3, this.endingData?.title ?? 'The End', {
    //   fontSize: '48px', color: '#ffffff', fontStyle: 'bold',
    //   stroke: '#000000', strokeThickness: 5,
    // }).setOrigin(0.5);
    //
    // this.add.text(cam.width / 2, cam.height * 0.45, this.endingData?.text ?? '', {
    //   fontSize: '20px', color: '#ffffcc',
    //   wordWrap: { width: cam.width * 0.7 }, align: 'center',
    // }).setOrigin(0.5);
    //
    // // Continue prompt with blink
    // const prompt = this.add.text(cam.width / 2, cam.height * 0.75,
    //   'Press Enter or Click to continue', { fontSize: '16px', color: '#aaaaaa' }
    // ).setOrigin(0.5);
    // this.tweens.add({
    //   targets: prompt, alpha: { from: 1, to: 0.3 },
    //   duration: 600, yoyo: true, repeat: -1,
    // });
  }

  protected override showResults(): void {
    // Display scores, stats, achievements
    // const stats = this.endingData?.stats;
    // if (stats) { ... }
  }

  protected override onContinue(): void {
    // Where to go after ending
    this.scene.start('TitleScreen');
  }
}
