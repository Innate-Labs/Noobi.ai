import Phaser from 'phaser';

// ============================================================================
// TOWER DEFENSE UTILS - Complete utilities for tower defense games
// ============================================================================
// This file contains ALL utilities needed for tower defense games:
// - Core utilities (scaling, collision fixes, audio, UI)
// - TD-specific utilities (grid, path, range, projectiles)
//
// When this module is copied to a game project, this file replaces core/utils.ts
// ============================================================================

// ============================================================================
// CELL TYPE ENUM
// ============================================================================

export enum CellType {
  BUILDABLE = 0,
  PATH = 1,
  BLOCKED = 2,
  SPAWN = 3,
  EXIT = 4,
}

// ============================================================================
// ANIMATION ORIGIN SYSTEM
// ============================================================================

export const resetOriginAndOffset = (
  sprite: any,
  facingDirection: 'left' | 'right' | 'up' | 'down',
): void => {
  if (
    facingDirection !== 'up' &&
    facingDirection !== 'down' &&
    facingDirection !== 'left' &&
    facingDirection !== 'right'
  ) {
    throw new Error(
      'resetOriginAndOffset: facingDirection must be up, down, left, or right',
    );
  }

  const targetDisplayHeight = (sprite as any)._targetDisplayHeight;
  if (targetDisplayHeight && sprite.height > 0) {
    const newScale = targetDisplayHeight / sprite.height;
    sprite.setScale(newScale);
  }

  let baseOriginX = 0.5;
  let baseOriginY = 1.0;
  const animationsData = sprite.scene?.cache?.json?.get('animations');
  if (animationsData?.anims) {
    const currentAnim = sprite.anims?.currentAnim;
    if (currentAnim) {
      const animConfig = animationsData.anims.find(
        (anim: any) => anim.key === currentAnim.key,
      );
      if (animConfig) {
        baseOriginX = animConfig.originX ?? 0.5;
        baseOriginY = animConfig.originY ?? 1.0;
      }
    }
  }

  const animOriginX =
    facingDirection === 'left' ? 1 - baseOriginX : baseOriginX;
  const animOriginY = baseOriginY;

  sprite.setOrigin(animOriginX, animOriginY);

  const body = sprite.body as Phaser.Physics.Arcade.Body;
  if (!body) return;

  const unscaledBodyWidth = body.sourceWidth;
  const unscaledBodyHeight = body.sourceHeight;

  const offsetX = sprite.width * animOriginX - unscaledBodyWidth / 2;
  const offsetY = sprite.height * animOriginY - unscaledBodyHeight;

  body.setOffset(offsetX, offsetY);
};

// ============================================================================
// SAFE AUDIO LOADING
// ============================================================================

export const safeAddSound = (
  scene: Phaser.Scene,
  key: string,
  config?: Phaser.Types.Sound.SoundConfig,
): Phaser.Sound.BaseSound | undefined => {
  if (!scene.cache.audio.exists(key)) {
    return undefined;
  }
  try {
    return scene.sound.add(key, config);
  } catch (e) {
    console.warn(`Failed to add sound: ${key}`, e);
    return undefined;
  }
};

export const audioExists = (scene: Phaser.Scene, key: string): boolean => {
  return scene.cache.audio.exists(key);
};

export const textureExists = (scene: Phaser.Scene, key: string): boolean => {
  return scene.textures.exists(key);
};

// ============================================================================
// SPRITE SCALING SYSTEM
// ============================================================================

export const initScale = (
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  origin: { x: number; y: number },
  maxDisplayWidth?: number,
  maxDisplayHeight?: number,
  bodyWidthFactorToDisplayWidth?: number,
  bodyHeightFactorToDisplayHeight?: number,
): void => {
  sprite.setOrigin(origin.x, origin.y);

  (sprite as any)._initWidth = sprite.width;
  (sprite as any)._initHeight = sprite.height;

  let displayScale: number;
  let displayHeight: number;
  let displayWidth: number;

  if (maxDisplayHeight && maxDisplayWidth) {
    if (sprite.height / sprite.width > maxDisplayHeight / maxDisplayWidth) {
      displayHeight = maxDisplayHeight;
      displayScale = maxDisplayHeight / sprite.height;
      displayWidth = sprite.width * displayScale;
    } else {
      displayWidth = maxDisplayWidth;
      displayScale = maxDisplayWidth / sprite.width;
      displayHeight = sprite.height * displayScale;
    }
  } else if (maxDisplayHeight) {
    displayHeight = maxDisplayHeight;
    displayScale = maxDisplayHeight / sprite.height;
    displayWidth = sprite.width * displayScale;
  } else if (maxDisplayWidth) {
    displayWidth = maxDisplayWidth;
    displayScale = maxDisplayWidth / sprite.width;
    displayHeight = sprite.height * displayScale;
  } else {
    throw new Error(
      'initScale: maxDisplayHeight and maxDisplayWidth cannot both be undefined',
    );
  }

  (sprite as any)._targetDisplayHeight = displayHeight;
  sprite.setScale(displayScale);

  const widthFactor = bodyWidthFactorToDisplayWidth ?? 1.0;
  const heightFactor = bodyHeightFactorToDisplayHeight ?? 1.0;

  const displayBodyWidth = displayWidth * widthFactor;
  const displayBodyHeight = displayHeight * heightFactor;

  if (sprite.body instanceof Phaser.Physics.Arcade.Body) {
    const unscaledBodyWidth = displayBodyWidth / displayScale;
    const unscaledBodyHeight = displayBodyHeight / displayScale;
    sprite.body.setSize(unscaledBodyWidth, unscaledBodyHeight);
    const unscaledOffsetX =
      sprite.width * origin.x - unscaledBodyWidth * origin.x;
    const unscaledOffsetY =
      sprite.height * origin.y - unscaledBodyHeight * origin.y;
    sprite.body.setOffset(unscaledOffsetX, unscaledOffsetY);
  } else if (sprite.body instanceof Phaser.Physics.Arcade.StaticBody) {
    sprite.body.setSize(displayBodyWidth, displayBodyHeight);
    const displayTopLeft = sprite.getTopLeft();
    const bodyPositionX =
      displayTopLeft.x +
      (sprite.displayWidth * origin.x - displayBodyWidth * origin.x);
    const bodyPositionY =
      displayTopLeft.y +
      (sprite.displayHeight * origin.y - displayBodyHeight * origin.y);
    sprite.body.position.set(bodyPositionX, bodyPositionY);
  }
};

// ============================================================================
// COLLISION SYSTEM (Fixes Phaser parameter order bug)
// ============================================================================

export const addCollider = (
  scene: Phaser.Scene,
  object1: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  object2: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  collideCallback?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  processCallback?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  callbackContext?: any,
): Phaser.Physics.Arcade.Collider => {
  if (shouldSwap(object1, object2)) {
    return scene.physics.add.collider(
      object1,
      object2,
      (obj1: any, obj2: any) => {
        collideCallback?.call(callbackContext, obj2, obj1);
      },
      (obj1: any, obj2: any) => {
        return processCallback?.call(callbackContext, obj2, obj1);
      },
      callbackContext,
    );
  } else {
    return scene.physics.add.collider(
      object1,
      object2,
      collideCallback,
      processCallback,
      callbackContext,
    );
  }
};

export const addOverlap = (
  scene: Phaser.Scene,
  object1: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  object2: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  collideCallback?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  processCallback?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  callbackContext?: any,
): Phaser.Physics.Arcade.Collider => {
  if (shouldSwap(object1, object2)) {
    return scene.physics.add.overlap(
      object1,
      object2,
      (obj1: any, obj2: any) => {
        collideCallback?.call(callbackContext, obj2, obj1);
      },
      (obj1: any, obj2: any) => {
        return processCallback?.call(callbackContext, obj2, obj1);
      },
      callbackContext,
    );
  } else {
    return scene.physics.add.overlap(
      object1,
      object2,
      collideCallback,
      processCallback,
      callbackContext,
    );
  }
};

const shouldSwap = (object1: any, object2: any): boolean => {
  const object1IsPhysicsGroup =
    object1 &&
    (object1 as any).isParent &&
    !((object1 as any).physicsType === undefined);
  const object1IsTilemap = object1 && (object1 as any).isTilemap;
  const object2IsPhysicsGroup =
    object2 &&
    (object2 as any).isParent &&
    !((object2 as any).physicsType === undefined);
  const object2IsTilemap = object2 && (object2 as any).isTilemap;

  return (
    (object1IsPhysicsGroup && !object2IsPhysicsGroup && !object2IsTilemap) ||
    (object1IsTilemap && !object2IsPhysicsGroup && !object2IsTilemap) ||
    (object1IsTilemap && object2IsPhysicsGroup)
  );
};

// ============================================================================
// UI HELPERS
// ============================================================================

export const initUIDom = (
  scene: Phaser.Scene,
  html: string,
): Phaser.GameObjects.DOMElement => {
  const dom = scene.add
    .dom(0, 0, 'div', 'width: 100%; height: 100%;')
    .setHTML(html);
  dom.pointerEvents = 'none';
  dom.setOrigin(0, 0);
  dom.setScrollFactor(0);
  return dom;
};

export const createDecoration = (
  scene: Phaser.Scene,
  group: Phaser.GameObjects.Group,
  key: string,
  x: number,
  y: number,
  maxDisplayHeight: number,
): Phaser.GameObjects.Image => {
  const decoration = scene.add.image(x, y, key);
  initScale(decoration, { x: 0.5, y: 1.0 }, undefined, maxDisplayHeight);
  group.add(decoration);
  return decoration;
};

// ============================================================================
// TOWER DEFENSE: GRID HELPERS
// ============================================================================

/**
 * Convert grid coordinates to world (pixel) coordinates.
 * Returns the CENTER of the cell.
 */
export function gridToWorld(
  gridX: number,
  gridY: number,
  cellSize: number,
  offsetX: number = 0,
  offsetY: number = 0,
): { x: number; y: number } {
  return {
    x: offsetX + gridX * cellSize + cellSize / 2,
    y: offsetY + gridY * cellSize + cellSize / 2,
  };
}

/**
 * Convert world (pixel) coordinates to grid coordinates.
 * Returns the grid cell that contains the point.
 */
export function worldToGrid(
  worldX: number,
  worldY: number,
  cellSize: number,
  offsetX: number = 0,
  offsetY: number = 0,
): { gridX: number; gridY: number } {
  return {
    gridX: Math.floor((worldX - offsetX) / cellSize),
    gridY: Math.floor((worldY - offsetY) / cellSize),
  };
}

/**
 * Check if a grid cell is valid for tower placement.
 */
export function isValidPlacement(
  cells: CellType[][],
  gridX: number,
  gridY: number,
): boolean {
  if (gridY < 0 || gridY >= cells.length) return false;
  if (gridX < 0 || gridX >= cells[0].length) return false;
  return cells[gridY][gridX] === CellType.BUILDABLE;
}

// ============================================================================
// TOWER DEFENSE: PATH HELPERS
// ============================================================================

export interface WorldPoint {
  x: number;
  y: number;
}

/**
 * Calculate total pixel length of a waypoint path.
 */
export function getPathLength(waypoints: WorldPoint[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += Phaser.Math.Distance.Between(
      waypoints[i - 1].x,
      waypoints[i - 1].y,
      waypoints[i].x,
      waypoints[i].y,
    );
  }
  return total;
}

/**
 * Get an interpolated position along a waypoint path.
 * @param progress - 0 = start, 1 = end
 */
export function getPositionAlongPath(
  waypoints: WorldPoint[],
  progress: number,
): WorldPoint {
  if (waypoints.length === 0) return { x: 0, y: 0 };
  if (waypoints.length === 1 || progress <= 0) return { ...waypoints[0] };
  if (progress >= 1) return { ...waypoints[waypoints.length - 1] };

  const totalLength = getPathLength(waypoints);
  const targetDist = totalLength * progress;

  let accumulated = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const segLen = Phaser.Math.Distance.Between(
      waypoints[i - 1].x,
      waypoints[i - 1].y,
      waypoints[i].x,
      waypoints[i].y,
    );
    if (accumulated + segLen >= targetDist) {
      const t = (targetDist - accumulated) / segLen;
      return {
        x: Phaser.Math.Linear(waypoints[i - 1].x, waypoints[i].x, t),
        y: Phaser.Math.Linear(waypoints[i - 1].y, waypoints[i].y, t),
      };
    }
    accumulated += segLen;
  }
  return { ...waypoints[waypoints.length - 1] };
}

/**
 * Get a facing direction between two world points.
 */
export function getDirectionBetween(
  from: WorldPoint,
  to: WorldPoint,
): 'left' | 'right' | 'up' | 'down' {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'down' : 'up';
}

// ============================================================================
// TOWER DEFENSE: RANGE INDICATOR
// ============================================================================

/**
 * Create a semi-transparent range circle for tower placement preview / selection.
 */
export function createRangeIndicator(
  scene: Phaser.Scene,
  x: number,
  y: number,
  range: number,
  color: number = 0xffffff,
  alpha: number = 0.15,
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  gfx.fillStyle(color, alpha);
  gfx.fillCircle(x, y, range);
  gfx.lineStyle(1, color, alpha * 2);
  gfx.strokeCircle(x, y, range);
  gfx.setDepth(50);
  return gfx;
}

// ============================================================================
// TOWER DEFENSE: PROJECTILE SYSTEM
// ============================================================================

export const PROJECTILE_SIZES = {
  BULLET_SMALL: 28,
  BULLET_MEDIUM: 36,
  ARROW: 52,
  CANNONBALL: 60,
  LARGE: 76,
} as const;

export function createBulletTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('tower_bullet')) {
    const graphics = scene.add.graphics();
    graphics.fillStyle(0xffff00);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('tower_bullet', 8, 8);
    graphics.destroy();
  }
}

export function createProjectile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  textureKey: string,
  targetSize: number = PROJECTILE_SIZES.BULLET_SMALL,
  damage?: number,
): Phaser.Physics.Arcade.Sprite {
  createBulletTextures(scene);
  const key = scene.textures.exists(textureKey) ? textureKey : 'tower_bullet';
  const projectile = scene.physics.add.sprite(x, y, key);
  const maxDimension = Math.max(projectile.width, projectile.height);
  const scale = targetSize / maxDimension;
  projectile.setScale(scale);
  const bodySize = Math.min(targetSize * 0.6, 28);
  (projectile.body as Phaser.Physics.Arcade.Body).setSize(bodySize, bodySize);
  const offsetX = (projectile.width - bodySize / scale) / 2;
  const offsetY = (projectile.height - bodySize / scale) / 2;
  (projectile.body as Phaser.Physics.Arcade.Body).setOffset(offsetX, offsetY);
  (projectile.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  if (damage !== undefined) {
    (projectile as any).damage = damage;
  }
  return projectile;
}

/**
 * Create a homing projectile that moves toward a target.
 * Sets velocity directly toward the target position.
 */
export function launchProjectileAt(
  projectile: Phaser.Physics.Arcade.Sprite,
  targetX: number,
  targetY: number,
  speed: number,
): void {
  const angle = Phaser.Math.Angle.Between(
    projectile.x,
    projectile.y,
    targetX,
    targetY,
  );
  projectile.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  projectile.setRotation(angle);
}

// ============================================================================
// TOWER DEFENSE: GRID RENDERING
// ============================================================================

/**
 * Draw a debug/gameplay grid overlay showing cell types.
 * Returns the Graphics object for later destruction.
 */
export function drawGridOverlay(
  scene: Phaser.Scene,
  cells: CellType[][],
  cellSize: number,
  offsetX: number = 0,
  offsetY: number = 0,
  alpha: number = 0.3,
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  gfx.setDepth(-5);

  const colors: Record<CellType, number> = {
    [CellType.BUILDABLE]: 0x00aa00,
    [CellType.PATH]: 0xccaa44,
    [CellType.BLOCKED]: 0x444444,
    [CellType.SPAWN]: 0xff4444,
    [CellType.EXIT]: 0x4444ff,
  };

  for (let row = 0; row < cells.length; row++) {
    for (let col = 0; col < cells[row].length; col++) {
      const cellType = cells[row][col];
      const cx = offsetX + col * cellSize;
      const cy = offsetY + row * cellSize;

      gfx.fillStyle(colors[cellType] ?? 0x000000, alpha);
      gfx.fillRect(cx, cy, cellSize, cellSize);
      gfx.lineStyle(1, 0x000000, alpha * 0.5);
      gfx.strokeRect(cx, cy, cellSize, cellSize);
    }
  }

  return gfx;
}

// ============================================================================
// TOWER DEFENSE: PATH VISUALIZATION
// ============================================================================

/**
 * Draw a semi-transparent path line connecting waypoints.
 * Use in createEnvironment() to show the enemy route on top of the background.
 * Unlike drawGridOverlay (debug-only), this is intended for production gameplay.
 */
export function drawPathLine(
  scene: Phaser.Scene,
  waypoints: WorldPoint[],
  lineWidth: number = 4,
  color: number = 0x8b4513,
  alpha: number = 0.35,
  depth: number = -4,
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  gfx.setDepth(depth);

  if (waypoints.length < 2) return gfx;

  gfx.lineStyle(lineWidth, color, alpha);
  gfx.beginPath();
  gfx.moveTo(waypoints[0].x, waypoints[0].y);

  for (let i = 1; i < waypoints.length; i++) {
    gfx.lineTo(waypoints[i].x, waypoints[i].y);
  }

  gfx.strokePath();
  return gfx;
}

// ============================================================================
// TOWER DEFENSE: TOWER SLOTS (optional visual)
// ============================================================================

/**
 * Draw tower slot visuals on BUILDABLE cells.
 * When textureKey exists, renders the image in each cell.
 * Otherwise draws a subtle rounded-rect placeholder.
 * Slots start HIDDEN by default; BaseTDScene shows them during placement mode.
 * Call in createEnvironment() and assign to this.towerSlotGroup.
 */
export function drawTowerSlots(
  scene: Phaser.Scene,
  cells: CellType[][],
  cellSize: number,
  offsetX: number = 0,
  offsetY: number = 0,
  textureKey: string = 'tower_slot',
  depth: number = -4,
  startVisible: boolean = false,
): Phaser.GameObjects.Group {
  const group = scene.add.group();
  const padding = cellSize * 0.04;
  const alpha = 0.35;

  for (let row = 0; row < cells.length; row++) {
    for (let col = 0; col < cells[row].length; col++) {
      if (cells[row][col] !== CellType.BUILDABLE) continue;

      const cx = offsetX + col * cellSize + cellSize / 2;
      const cy = offsetY + row * cellSize + cellSize / 2;

      if (scene.textures.exists(textureKey)) {
        const img = scene.add.image(cx, cy, textureKey);
        img.setDisplaySize(cellSize - padding * 2, cellSize - padding * 2);
        img.setAlpha(alpha);
        img.setDepth(depth);
        img.setVisible(startVisible);
        group.add(img);
      } else {
        const gfx = scene.add.graphics();
        gfx.fillStyle(0x228822, alpha * 0.6);
        gfx.fillRoundedRect(
          offsetX + col * cellSize + padding,
          offsetY + row * cellSize + padding,
          cellSize - padding * 2,
          cellSize - padding * 2,
          10,
        );
        gfx.setDepth(depth);
        gfx.setVisible(startVisible);
        group.add(gfx);
      }
    }
  }
  return group;
}

// ============================================================================
// TOWER DEFENSE: BUILDABLE CELL MARKERS
// ============================================================================

/**
 * Draw subtle markers on all BUILDABLE cells so players know where towers can go.
 * Renders a dashed border and a small center dot on each buildable cell.
 */
export function drawBuildableMarkers(
  scene: Phaser.Scene,
  cells: CellType[][],
  cellSize: number,
  offsetX: number = 0,
  offsetY: number = 0,
  color: number = 0x00ff00,
  alpha: number = 0.2,
  depth: number = -3,
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  gfx.setDepth(depth);

  const dashLen = 4;
  const gapLen = 4;

  for (let row = 0; row < cells.length; row++) {
    for (let col = 0; col < cells[row].length; col++) {
      if (cells[row][col] !== CellType.BUILDABLE) continue;

      const cx = offsetX + col * cellSize;
      const cy = offsetY + row * cellSize;

      gfx.lineStyle(1, color, alpha);
      drawDashedRect(gfx, cx, cy, cellSize, cellSize, dashLen, gapLen);

      gfx.fillStyle(color, alpha * 0.8);
      const dotSize = Math.max(2, cellSize * 0.06);
      gfx.fillCircle(cx + cellSize / 2, cy + cellSize / 2, dotSize);
    }
  }

  return gfx;
}

function drawDashedRect(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  dashLen: number,
  gapLen: number,
): void {
  drawDashedLine(gfx, x, y, x + w, y, dashLen, gapLen);
  drawDashedLine(gfx, x + w, y, x + w, y + h, dashLen, gapLen);
  drawDashedLine(gfx, x + w, y + h, x, y + h, dashLen, gapLen);
  drawDashedLine(gfx, x, y + h, x, y, dashLen, gapLen);
}

function drawDashedLine(
  gfx: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dashLen: number,
  gapLen: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const totalLen = Math.sqrt(dx * dx + dy * dy);
  if (totalLen === 0) return;

  const nx = dx / totalLen;
  const ny = dy / totalLen;
  let drawn = 0;
  let drawing = true;

  gfx.beginPath();
  gfx.moveTo(x1, y1);

  while (drawn < totalLen) {
    const segLen = drawing ? dashLen : gapLen;
    const remaining = totalLen - drawn;
    const step = Math.min(segLen, remaining);
    drawn += step;

    const px = x1 + nx * drawn;
    const py = y1 + ny * drawn;

    if (drawing) {
      gfx.lineTo(px, py);
    } else {
      gfx.moveTo(px, py);
    }
    drawing = !drawing;
  }

  gfx.strokePath();
}

// ============================================================================
// TOWER DEFENSE: FLOATING TEXT EFFECT
// ============================================================================

/**
 * Show a floating text that rises and fades out.
 * Useful for kill rewards, damage numbers, or status messages.
 */
export function showFloatingText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string = '#FFD700',
  fontSize: number = 16,
  duration: number = 1000,
  riseDistance: number = 40,
): void {
  const textObj = scene.add.text(x, y, text, {
    fontSize: `${fontSize}px`,
    color: color,
    stroke: '#000000',
    strokeThickness: 2,
    fontStyle: 'bold',
  });
  textObj.setOrigin(0.5);
  textObj.setDepth(300);

  scene.tweens.add({
    targets: textObj,
    y: y - riseDistance,
    alpha: 0,
    duration: duration,
    ease: 'Cubic.easeOut',
    onComplete: () => textObj.destroy(),
  });
}
