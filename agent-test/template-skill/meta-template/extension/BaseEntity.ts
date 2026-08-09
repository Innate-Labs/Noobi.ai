import Phaser from 'phaser';

/**
 * BaseEntity — Meta Template M0 Extension
 *
 * Minimal, game-agnostic entity base class.
 * Provides the common interface shared by ALL entity types across every
 * template family (characters, grid entities, towers, enemies, UI actors).
 *
 * Specialized families extend this with physics bodies, behavior managers,
 * health systems, and domain-specific hooks.
 */
export abstract class BaseEntity extends Phaser.GameObjects.Sprite {
  /** Whether this entity is still active/alive */
  protected isAlive: boolean = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    frame?: string | number,
  ) {
    super(scene, x, y, texture, frame);
    scene.add.existing(this);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle hooks — subclasses CAN override
  // ---------------------------------------------------------------------------

  /** Called every frame by the owning scene */
  protected onUpdate(_time: number, _delta: number): void {}

  /** Called when this entity takes damage */
  protected onDamageTaken(_damage: number): void {}

  /** Called when this entity dies */
  protected onDeath(): void {
    this.isAlive = false;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  public getIsAlive(): boolean {
    return this.isAlive;
  }

  /** Convenience: destroy with cleanup */
  public destroyEntity(): void {
    this.isAlive = false;
    this.destroy();
  }
}
