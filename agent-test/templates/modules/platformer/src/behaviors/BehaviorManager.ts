import type { IBehavior } from './IBehavior';

/**
 * BehaviorManager - Manages behavior components for an entity
 *
 * The BehaviorManager is responsible for:
 * - Adding/removing behaviors
 * - Updating all enabled behaviors each frame
 * - Providing access to behaviors by name
 *
 * Usage:
 *   // In entity constructor:
 *   this.behaviors = new BehaviorManager(this);
 *   this.movement = this.behaviors.add('movement', new PlatformerMovement(config));
 *   this.combat = this.behaviors.add('combat', new MeleeAttack(config));
 *
 *   // In entity update:
 *   this.behaviors.update();
 *
 *   // Access behaviors:
 *   const movement = this.behaviors.get<PlatformerMovement>('movement');
 *   movement.jump();
 */
export class BehaviorManager {
  private owner: any;
  private behaviors: Map<string, IBehavior> = new Map();

  /**
   * Create a new BehaviorManager
   * @param owner - The entity that owns this manager
   */
  constructor(owner: any) {
    this.owner = owner;
  }

  /**
   * Add a behavior to this entity
   * @param name - Unique name for this behavior
   * @param behavior - The behavior instance to add
   * @returns The added behavior (for chaining)
   */
  add<T extends IBehavior>(name: string, behavior: T): T {
    // Remove existing behavior with same name
    if (this.behaviors.has(name)) {
      this.remove(name);
    }

    // Attach and store behavior
    behavior.attach(this.owner);
    this.behaviors.set(name, behavior);

    return behavior;
  }

  /**
   * Get a behavior by name
   * @param name - Name of the behavior to get
   * @returns The behavior, or undefined if not found
   */
  get<T extends IBehavior>(name: string): T | undefined {
    return this.behaviors.get(name) as T | undefined;
  }

  /**
   * Check if a behavior exists
   * @param name - Name of the behavior to check
   */
  has(name: string): boolean {
    return this.behaviors.has(name);
  }

  /**
   * Remove a behavior by name
   * @param name - Name of the behavior to remove
   * @returns true if behavior was removed
   */
  remove(name: string): boolean {
    const behavior = this.behaviors.get(name);
    if (behavior) {
      behavior.detach();
      this.behaviors.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Enable a behavior
   * @param name - Name of the behavior to enable
   */
  enable(name: string): void {
    const behavior = this.behaviors.get(name);
    if (behavior) {
      behavior.enabled = true;
    }
  }

  /**
   * Disable a behavior
   * @param name - Name of the behavior to disable
   */
  disable(name: string): void {
    const behavior = this.behaviors.get(name);
    if (behavior) {
      behavior.enabled = false;
    }
  }

  /**
   * Toggle a behavior's enabled state
   * @param name - Name of the behavior to toggle
   * @returns The new enabled state, or undefined if behavior not found
   */
  toggle(name: string): boolean | undefined {
    const behavior = this.behaviors.get(name);
    if (behavior) {
      behavior.enabled = !behavior.enabled;
      return behavior.enabled;
    }
    return undefined;
  }

  /**
   * Update all enabled behaviors
   * Call this in the entity's update method
   */
  update(): void {
    for (const behavior of this.behaviors.values()) {
      if (behavior.enabled) {
        behavior.update();
      }
    }
  }

  /**
   * Remove all behaviors
   */
  clear(): void {
    for (const [name] of this.behaviors) {
      this.remove(name);
    }
  }

  /**
   * Get all behavior names
   */
  getNames(): string[] {
    return Array.from(this.behaviors.keys());
  }

  /**
   * Get all behaviors
   */
  getAll(): IBehavior[] {
    return Array.from(this.behaviors.values());
  }
}
