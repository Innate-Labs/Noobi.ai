/**
 * ============================================================================
 * STATUS BAR - HP / MP / Score / Progress bar component
 * ============================================================================
 *
 * A reusable bar component for displaying any numeric value as a
 * filled rectangle with optional label and value text.
 *
 * FEATURES:
 * - Smooth animated fill transitions (tweened)
 * - Color change at thresholds (green -> yellow -> red)
 * - Optional label text (e.g., "HP", "Mana")
 * - Optional value text (e.g., "75/100")
 * - Customizable frame/border
 *
 * USAGE:
 *   const hpBar = new StatusBar(scene, 100, 50, {
 *     width: 200, height: 24,
 *     maxValue: 100,
 *     label: 'HP',
 *     showValue: true,
 *     colorThresholds: [
 *       { percent: 0.6, color: 0x00ff00 },
 *       { percent: 0.3, color: 0xffff00 },
 *       { percent: 0.0, color: 0xff0000 },
 *     ],
 *   });
 *   hpBar.setValue(75);  // animated fill to 75%
 */

import Phaser from 'phaser';

export interface ColorThreshold {
  /** Minimum percentage (0-1) for this color */
  percent: number;
  /** Fill color at this threshold */
  color: number;
}

export interface StatusBarConfig {
  /** Bar width */
  width: number;
  /** Bar height */
  height: number;
  /** Maximum value */
  maxValue: number;
  /** Initial value (default: maxValue) */
  initialValue?: number;
  /** Label text (e.g., "HP") */
  label?: string;
  /** Show "current/max" value text */
  showValue?: boolean;
  /** Fill color (default: 0x00ff00) */
  fillColor?: number;
  /** Background color (default: 0x333333) */
  backgroundColor?: number;
  /** Border color (default: 0xffffff) */
  borderColor?: number;
  /** Border width (default: 2) */
  borderWidth?: number;
  /** Color thresholds (sorted by percent descending) */
  colorThresholds?: ColorThreshold[];
  /** Animation duration for value changes (ms, default: 300) */
  animDuration?: number;
}

export class StatusBar extends Phaser.GameObjects.Container {
  private barConfig: StatusBarConfig;
  private background!: Phaser.GameObjects.Rectangle;
  private fill!: Phaser.GameObjects.Rectangle;
  private border?: Phaser.GameObjects.Rectangle;
  private labelText?: Phaser.GameObjects.Text;
  private valueText?: Phaser.GameObjects.Text;
  private currentValue: number;
  private maxValue: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    config: StatusBarConfig,
  ) {
    super(scene, x, y);
    this.barConfig = config;
    this.maxValue = config.maxValue;
    this.currentValue = config.initialValue ?? config.maxValue;
    scene.add.existing(this);
    this.setDepth(150);
    this.createBar();
  }

  // -- Public API --

  /** Set the current value (animated). */
  setValue(value: number, animate: boolean = true): void {
    const oldValue = this.currentValue;
    this.currentValue = Phaser.Math.Clamp(value, 0, this.maxValue);
    const percent = this.getPercent();
    const targetWidth = Math.max(1, this.barConfig.width * percent);
    const color = this.getColorForPercent(percent);

    if (animate && this.barConfig.animDuration !== 0) {
      this.scene.tweens.add({
        targets: this.fill,
        displayWidth: targetWidth,
        duration: this.barConfig.animDuration ?? 300,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          // Update color during animation
          const animPercent = this.fill.displayWidth / this.barConfig.width;
          this.fill.setFillStyle(this.getColorForPercent(animPercent));
        },
      });
    } else {
      this.fill.displayWidth = targetWidth;
      this.fill.setFillStyle(color);
    }

    // Update value text
    if (this.valueText) {
      this.valueText.setText(
        `${Math.ceil(this.currentValue)}/${this.maxValue}`,
      );
    }
  }

  /** Set the maximum value. */
  setMaxValue(maxValue: number): void {
    this.maxValue = maxValue;
    this.setValue(Math.min(this.currentValue, maxValue));
  }

  /** Get current value. */
  getValue(): number {
    return this.currentValue;
  }

  /** Get percentage (0-1). */
  getPercent(): number {
    return this.maxValue > 0 ? this.currentValue / this.maxValue : 0;
  }

  // -- Internal --

  private createBar(): void {
    const cfg = this.barConfig;
    const w = cfg.width;
    const h = cfg.height;

    // Label (left of bar)
    let labelOffset = 0;
    if (cfg.label) {
      this.labelText = this.scene.add
        .text(-w / 2, 0, cfg.label, {
          fontSize: '14px',
          fontFamily: 'Arial',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(1, 0.5);
      this.labelText.setX(-w / 2 - 8);
      this.add(this.labelText);
    }

    // Background
    this.background = this.scene.add.rectangle(
      0,
      0,
      w,
      h,
      cfg.backgroundColor ?? 0x333333,
    );
    this.background.setOrigin(0, 0.5);
    this.background.setX(-w / 2);
    this.add(this.background);

    // Fill
    const percent = this.getPercent();
    const fillWidth = Math.max(1, w * percent);
    const fillColor = this.getColorForPercent(percent);
    this.fill = this.scene.add.rectangle(0, 0, fillWidth, h - 4, fillColor);
    this.fill.setOrigin(0, 0.5);
    this.fill.setX(-w / 2 + 2);
    this.add(this.fill);

    // Border
    if (cfg.borderWidth !== 0) {
      this.border = this.scene.add.rectangle(0, 0, w, h);
      this.border.setStrokeStyle(
        cfg.borderWidth ?? 2,
        cfg.borderColor ?? 0xffffff,
      );
      this.border.setFillStyle(0x000000, 0);
      this.border.setOrigin(0, 0.5);
      this.border.setX(-w / 2);
      this.add(this.border);
    }

    // Value text (inside bar)
    if (cfg.showValue) {
      this.valueText = this.scene.add
        .text(0, 0, `${Math.ceil(this.currentValue)}/${this.maxValue}`, {
          fontSize: '12px',
          fontFamily: 'Arial',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      this.add(this.valueText);
    }
  }

  private getColorForPercent(percent: number): number {
    if (
      !this.barConfig.colorThresholds ||
      this.barConfig.colorThresholds.length === 0
    ) {
      return this.barConfig.fillColor ?? 0x00ff00;
    }
    // Sort descending by percent for correct lookup
    const sorted = [...this.barConfig.colorThresholds].sort(
      (a, b) => b.percent - a.percent,
    );
    for (const threshold of sorted) {
      if (percent >= threshold.percent) return threshold.color;
    }
    return sorted[sorted.length - 1].color;
  }
}
