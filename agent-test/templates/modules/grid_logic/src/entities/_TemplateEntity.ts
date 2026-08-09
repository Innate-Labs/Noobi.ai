// ============================================================================
// _TemplateEntity.ts -- COPY this file for each grid entity type
// ============================================================================
// STANDARD TEMPLATE -- Do NOT modify the original. COPY and RENAME.
//
// Steps:
// 1. Copy this file:  cp _TemplateEntity.ts  Player.ts  (or Box.ts, Enemy.ts, etc.)
// 2. Rename the class: TemplateEntity -> Player
// 3. Rename the config: TEMPLATE_ENTITY_CONFIG -> PLAYER_CONFIG
// 4. Update config values from your GDD Section 3
// 5. Override hooks as needed
// 6. Export from entities/index.ts
//
// FILE CHECKLIST (verify after implementation):
// [ ] Class name matches file name
// [ ] Config values match GDD Section 3
// [ ] textureKey matches an asset in asset-pack.json
// [ ] entityType is a unique identifier string
// [ ] Hooks override only what's needed (don't override unused hooks)
// ============================================================================

import { BaseGridEntity, type GridEntityConfig } from './BaseGridEntity';
import { getDirection, safeAddSound } from '../utils';

// ---------------------------------------------------------------------------
// CONFIG -- All values from GDD Section 3
// ---------------------------------------------------------------------------

const TEMPLATE_ENTITY_CONFIG: GridEntityConfig = {
  id: 'player_1', // Unique instance identifier
  entityType: 'player', // Type identifier (used in board queries)
  textureKey: 'player', // Asset key (must exist in asset-pack.json)
  gridX: 0, // Starting grid X (overridden by level)
  gridY: 0, // Starting grid Y (overridden by level)
  // displaySize: 56,          // Optional: sprite size within cell (cellSize - padding)
  isWalkable: false, // Can other entities walk through this?
  isPushable: false, // Can this be pushed by another entity?
  isDestructible: false, // Can this be destroyed?
  maxHealth: 0, // 0 = no HP system. Set > 0 for combat entities.
};

// ---------------------------------------------------------------------------
// ENTITY CLASS
// ---------------------------------------------------------------------------

export class TemplateEntity extends BaseGridEntity {
  constructor(scene: Phaser.Scene, gridX: number, gridY: number, id?: string) {
    super(scene, {
      ...TEMPLATE_ENTITY_CONFIG,
      gridX,
      gridY,
      id: id ?? TEMPLATE_ENTITY_CONFIG.id,
    });
  }

  // -------------------------------------------------------------------------
  // Hook Overrides -- only override what you need
  // -------------------------------------------------------------------------

  override onPlaced(): void {
    // TODO: Add spawn effect
  }

  override onMoved(fromX: number, fromY: number): void {
    // TODO: Update facing direction, play move sound
    // const dir = getDirection(fromX, fromY, this.gridX, this.gridY);
    // if (dir) this.facingDirection = dir;
  }

  override onSelected(): void {
    // TODO: Visual selection feedback
    // this.setTint(0x88ff88);
  }

  override onDeselected(): void {
    // TODO: Clear selection visual
    // this.clearTint();
  }

  override onInteraction(interactionType: string): void {
    // TODO: Handle interactions based on type
    // if (interactionType === 'push') { ... }
  }

  /**
   * Called every game step/turn. Use for AI, cooldowns, periodic effects.
   * @param turnNumber Current turn number, useful for cooldown math.
   */
  override onStep(turnNumber: number): void {
    // TODO: Per-step logic
    // Example (chaser AI):
    //   const path = findPath(this.gridX, this.gridY, targetX, targetY, ...);
    //   if (path.length > 1) { /* move toward target */ }
    //
    // Example (cooldown):
    //   if (turnNumber % 3 === 0) { /* emit area effect */ }
  }

  override onDamage(amount: number, oldHP: number, newHP: number): void {
    // TODO: Visual feedback for taking damage
    // this.setTint(0xff0000);
    // this.scene.time.delayedCall(150, () => this.clearTint());
  }

  override onDeath(): void {
    // TODO: Death behavior (handled by scene's onEntityDeath by default)
  }

  override onCellEntered(cellType: number): void {
    // TODO: React to cell types
    // if (cellType === CellType.HAZARD) { /* take damage */ }
  }
}

export { TEMPLATE_ENTITY_CONFIG };
