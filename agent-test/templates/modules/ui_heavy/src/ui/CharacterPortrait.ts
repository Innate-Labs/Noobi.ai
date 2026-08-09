/**
 * ============================================================================
 * CHARACTER PORTRAIT - Character display with expression management
 * ============================================================================
 *
 * Manages a character's visual representation on screen:
 * - Display portrait image at a screen position (left, center, right)
 * - Switch expressions via texture changes
 * - Enter/exit animations (slide, fade)
 * - Highlight active speaker (dim others)
 *
 * USAGE:
 *   const portrait = new CharacterPortrait(scene, {
 *     id: 'hero',
 *     textureKey: 'hero_neutral',
 *     displayName: 'Alaric',
 *     expressions: { happy: 'hero_happy', angry: 'hero_angry' },
 *     position: 'left',
 *   });
 *   portrait.enter();               // slide in with animation
 *   portrait.setExpression('happy'); // change face
 *   portrait.setActive(true);       // highlight as speaker
 *   portrait.exit();                // slide out
 */

import Phaser from 'phaser';

export interface PortraitConfig {
  /** Character ID */
  id: string;
  /** Default texture key */
  textureKey: string;
  /** Display name */
  displayName: string;
  /** Expression texture map: { expressionName: textureKey } */
  expressions?: Record<string, string>;
  /** Screen position */
  position: 'left' | 'center' | 'right';
  /** Display scale (default: 1.0) */
  scale?: number;
  /** Y position from bottom (default: 0, aligned to bottom of screen) */
  bottomOffset?: number;
}

export class CharacterPortrait extends Phaser.GameObjects.Container {
  private portraitConfig: PortraitConfig;
  private portrait!: Phaser.GameObjects.Image;
  private namePlate?: Phaser.GameObjects.Text;
  private isOnScreen: boolean = false;
  private isActiveSpeaker: boolean = false;
  private screenWidth: number;
  private screenHeight: number;

  constructor(scene: Phaser.Scene, config: PortraitConfig) {
    super(scene, 0, 0);
    this.portraitConfig = config;
    this.screenWidth = scene.cameras.main.width;
    this.screenHeight = scene.cameras.main.height;
    scene.add.existing(this);
    this.setDepth(50);
    this.createPortrait();
    this.setVisible(false);
  }

  // -- Public API --

  /** Animate character entering the scene. */
  enter(onComplete?: () => void): void {
    if (this.isOnScreen) return;
    this.isOnScreen = true;
    this.setVisible(true);

    const targetX = this.getXForPosition(this.portraitConfig.position);
    // Start off-screen
    const startX =
      this.portraitConfig.position === 'left'
        ? -200
        : this.portraitConfig.position === 'right'
          ? this.screenWidth + 200
          : targetX;

    this.setPosition(startX, 0);
    this.setAlpha(0);

    this.scene.tweens.add({
      targets: this,
      x: targetX,
      alpha: 1,
      duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        onComplete?.();
      },
    });
  }

  /** Animate character exiting the scene. */
  exit(onComplete?: () => void): void {
    if (!this.isOnScreen) return;

    const exitX =
      this.portraitConfig.position === 'left'
        ? -200
        : this.portraitConfig.position === 'right'
          ? this.screenWidth + 200
          : this.x;

    this.scene.tweens.add({
      targets: this,
      x: exitX,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.isOnScreen = false;
        this.setVisible(false);
        onComplete?.();
      },
    });
  }

  /** Change character expression. */
  setExpression(expression: string): void {
    const textureKey = this.portraitConfig.expressions?.[expression];
    if (textureKey && this.scene.textures.exists(textureKey)) {
      this.portrait.setTexture(textureKey);
    }
  }

  /** Highlight as active speaker (full brightness) or dim (inactive). */
  setSpeakerActive(active: boolean): void {
    this.isActiveSpeaker = active;
    if (active) {
      this.scene.tweens.add({
        targets: this,
        alpha: 1,
        duration: 200,
      });
    } else {
      this.scene.tweens.add({
        targets: this,
        alpha: 0.5,
        duration: 200,
      });
    }
  }

  /** Move to a different screen position with animation. */
  moveToPosition(
    position: 'left' | 'center' | 'right',
    onComplete?: () => void,
  ): void {
    this.portraitConfig.position = position;
    const targetX = this.getXForPosition(position);
    this.scene.tweens.add({
      targets: this,
      x: targetX,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => onComplete?.(),
    });
  }

  /** Check if character is currently on screen. */
  getIsOnScreen(): boolean {
    return this.isOnScreen;
  }

  /** Get config ID */
  getId(): string {
    return this.portraitConfig.id;
  }

  // -- Internal --

  private createPortrait(): void {
    const textureKey = this.portraitConfig.textureKey;
    const targetX = this.getXForPosition(this.portraitConfig.position);

    // Create portrait image
    if (this.scene.textures.exists(textureKey)) {
      this.portrait = this.scene.add.image(0, 0, textureKey);
    } else {
      // Fallback: create a colored rectangle placeholder
      const placeholder = this.scene.add.rectangle(0, 0, 150, 300, 0x555555);
      this.add(placeholder);
      this.portrait = this.scene.add.image(0, 0, '__DEFAULT');
      this.portrait.setVisible(false);
    }

    // Scale portrait to reasonable size (max height ~400px)
    const maxHeight = this.screenHeight * 0.55;
    const scale =
      this.portraitConfig.scale ??
      Math.min(maxHeight / this.portrait.height, 1.0);
    this.portrait.setScale(scale);

    // Position: bottom-aligned
    const bottomOffset = this.portraitConfig.bottomOffset ?? 0;
    this.portrait.setOrigin(0.5, 1);
    this.portrait.setY(this.screenHeight - bottomOffset - 180); // above dialogue box

    this.add(this.portrait);

    // Set initial position
    this.setPosition(targetX, 0);
  }

  private getXForPosition(position: string): number {
    switch (position) {
      case 'left':
        return this.screenWidth * 0.2;
      case 'center':
        return this.screenWidth * 0.5;
      case 'right':
        return this.screenWidth * 0.8;
      default:
        return this.screenWidth * 0.5;
    }
  }
}
