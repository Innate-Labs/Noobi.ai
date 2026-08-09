/**
 * Preloader Scene - Load all game assets before starting
 * This file is a STANDARD TEMPLATE - do not modify the structure
 * Only modify the asset pack path if needed
 */
export class Preloader extends Phaser.Scene {
  constructor() {
    super('Preloader');
  }

  preload(): void {
    // Show loading progress bar
    this.setupLoadingProgressUI(this);
    // Load all assets from asset pack
    this.load.pack('assetPack', 'assets/asset-pack.json');
  }

  create(): void {
    this.scene.start('TitleScreen');
  }

  private setupLoadingProgressUI(scene: Phaser.Scene): void {
    const cam = scene.cameras.main;
    const width = cam.width;
    const height = cam.height;

    const barWidth = Math.floor(width * 0.6);
    const barHeight = 20;
    const x = Math.floor((width - barWidth) / 2);
    const y = Math.floor(height * 0.5);

    const progressBox = scene.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(x - 4, y - 4, barWidth + 8, barHeight + 8);

    const progressBar = scene.add.graphics();

    const loadingText = scene.add
      .text(width / 2, y - 20, 'Loading...', {
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5);

    const onProgress = (value: number): void => {
      progressBar.clear();
      progressBar.fillStyle(0xffffff, 1);
      progressBar.fillRect(x, y, barWidth * value, barHeight);
    };

    const onComplete = (): void => {
      cleanup();
    };

    scene.load.on('progress', onProgress);
    scene.load.once('complete', onComplete);

    const cleanup = (): void => {
      scene.load.off('progress', onProgress);
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
    };
  }
}
