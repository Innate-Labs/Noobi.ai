/**
 * ============================================================================
 * CHOICE PANEL - Branching choice buttons display
 * ============================================================================
 *
 * Displays a set of choice buttons for player decision points.
 * Used by both dialogue choices (BaseChapterScene) and quiz answers.
 *
 * FEATURES:
 * - Vertical button layout
 * - Hover highlight effects
 * - Entrance animations (fade)
 * - Keyboard navigation (Up/Down/Enter)
 * - Dynamic button count
 *
 * EVENTS:
 *   - 'selected': (optionIndex: number, optionText: string) => void
 *
 * USAGE:
 *   const panel = new ChoicePanel(scene, 512, 400);
 *   panel.showChoices('What do you do?', [
 *     { text: 'Fight', enabled: true },
 *     { text: 'Run', enabled: true },
 *   ]);
 *   panel.on('selected', (index, text) => { ... });
 */

import Phaser from 'phaser';

export interface ChoiceDisplayOption {
  /** Button text */
  text: string;
  /** Whether this option is clickable (default: true) */
  enabled?: boolean;
  /** Optional icon key */
  iconKey?: string;
}

export interface ChoicePanelConfig {
  /** Layout direction */
  layout?: 'vertical' | 'horizontal';
  /** Space between buttons (px) */
  spacing?: number;
  /** Button width */
  buttonWidth?: number;
  /** Button height */
  buttonHeight?: number;
  /** Button background color */
  buttonColor?: number;
  /** Button hover color */
  buttonHoverColor?: number;
  /** Text style */
  textStyle?: Phaser.Types.GameObjects.Text.TextStyle;
  /** Enable keyboard navigation (default: true) */
  keyboardNav?: boolean;
}

export class ChoicePanel extends Phaser.GameObjects.Container {
  private panelConfig: ChoicePanelConfig;
  private buttons: Phaser.GameObjects.Container[] = [];
  private currentOptions: ChoiceDisplayOption[] = [];
  private selectedIndex: number = 0;
  private promptText?: Phaser.GameObjects.Text;
  private upKey?: Phaser.Input.Keyboard.Key;
  private downKey?: Phaser.Input.Keyboard.Key;
  private enterKey?: Phaser.Input.Keyboard.Key;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    config?: ChoicePanelConfig,
  ) {
    super(scene, x, y);
    this.panelConfig = config ?? {};
    scene.add.existing(this);
    this.setDepth(200);
  }

  // -- Public API --

  /** Show choice buttons with optional prompt text. */
  showChoices(prompt: string, options: ChoiceDisplayOption[]): void {
    this.clearButtons();
    this.currentOptions = options;
    this.setVisible(true);

    const btnWidth = this.panelConfig.buttonWidth ?? 400;
    const btnHeight = this.panelConfig.buttonHeight ?? 50;
    const spacing = this.panelConfig.spacing ?? 15;
    const btnColor = this.panelConfig.buttonColor ?? 0x333355;
    const hoverColor = this.panelConfig.buttonHoverColor ?? 0x5555aa;

    // Prompt text
    if (prompt) {
      this.promptText = this.scene.add
        .text(0, 0, prompt, {
          fontSize: '22px',
          fontFamily: 'Arial',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 3,
          ...(this.panelConfig.textStyle ?? {}),
        })
        .setOrigin(0.5, 0.5);
      this.add(this.promptText);
    }

    // Create buttons
    const startY = prompt ? 40 : 0;
    options.forEach((option, index) => {
      const yOffset = startY + index * (btnHeight + spacing);
      const btn = this.createButton(
        option,
        index,
        yOffset,
        btnWidth,
        btnHeight,
        btnColor,
        hoverColor,
      );
      this.buttons.push(btn);
      this.add(btn);
    });

    // Keyboard navigation
    if (this.panelConfig.keyboardNav !== false) {
      this.setupKeyboardNav();
    }

    // Highlight first option
    this.selectedIndex = 0;
    this.highlightButton(0);

    // Fade in
    this.setAlpha(0);
    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: 200,
    });
  }

  /** Hide and remove all buttons. */
  hide(): void {
    this.clearButtons();
    this.setVisible(false);
  }

  /** Programmatically select an option (for keyboard navigation). */
  selectByIndex(index: number): void {
    if (index >= 0 && index < this.buttons.length) {
      const text = this.currentOptions[index]?.text ?? '';
      this.emit('selected', index, text);
    }
  }

  // -- Internal --

  private clearButtons(): void {
    this.buttons.forEach((b) => b.destroy());
    this.buttons = [];
    this.currentOptions = [];
    if (this.promptText) {
      this.promptText.destroy();
      this.promptText = undefined;
    }
    // Clean up keyboard
    this.upKey?.destroy();
    this.downKey?.destroy();
    this.enterKey?.destroy();
    this.upKey = undefined;
    this.downKey = undefined;
    this.enterKey = undefined;
  }

  private createButton(
    option: ChoiceDisplayOption,
    index: number,
    yOffset: number,
    width: number,
    height: number,
    bgColor: number,
    hoverColor: number,
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, yOffset);
    const enabled = option.enabled !== false;

    // Background rectangle
    const bg = this.scene.add.rectangle(
      0,
      0,
      width,
      height,
      bgColor,
      enabled ? 0.9 : 0.4,
    );
    bg.setOrigin(0.5);
    bg.setStrokeStyle(2, 0x888888);
    container.add(bg);

    // Text
    const text = this.scene.add
      .text(0, 0, option.text, {
        fontSize: '18px',
        fontFamily: 'Arial',
        color: enabled ? '#ffffff' : '#888888',
        ...(this.panelConfig.textStyle ?? {}),
      })
      .setOrigin(0.5);
    container.add(text);

    if (enabled) {
      // Make interactive
      bg.setInteractive({ useHandCursor: true });

      bg.on('pointerover', () => {
        bg.setFillStyle(hoverColor, 1);
        this.selectedIndex = index;
        this.highlightButton(index);
      });

      bg.on('pointerout', () => {
        bg.setFillStyle(bgColor, 0.9);
      });

      bg.on('pointerdown', () => {
        this.emit('selected', index, option.text);
      });
    }

    // Store reference for highlighting
    (container as any)._bg = bg;
    (container as any)._defaultColor = bgColor;
    (container as any)._hoverColor = hoverColor;

    return container;
  }

  private highlightButton(index: number): void {
    this.buttons.forEach((btn, i) => {
      const bg = (btn as any)._bg as Phaser.GameObjects.Rectangle;
      const defaultColor = (btn as any)._defaultColor as number;
      const hoverColor = (btn as any)._hoverColor as number;
      if (bg) {
        bg.setFillStyle(i === index ? hoverColor : defaultColor, 0.9);
      }
    });
  }

  private setupKeyboardNav(): void {
    this.upKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.UP,
    );
    this.downKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.DOWN,
    );
    this.enterKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    );

    this.upKey?.on('down', () => {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.highlightButton(this.selectedIndex);
    });

    this.downKey?.on('down', () => {
      this.selectedIndex = Math.min(
        this.buttons.length - 1,
        this.selectedIndex + 1,
      );
      this.highlightButton(this.selectedIndex);
    });

    this.enterKey?.on('down', () => {
      const text = this.currentOptions[this.selectedIndex]?.text ?? '';
      this.emit('selected', this.selectedIndex, text);
    });
  }
}
