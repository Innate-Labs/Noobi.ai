import Phaser from 'phaser';

// ============================================================================
// GRID LOGIC UTILS - Complete utilities for grid-based logic games
// ============================================================================
// This file contains ALL utilities needed for grid logic games:
// - Core utilities (scaling, collision fixes, audio, UI)
// - Grid-specific utilities (coordinate conversion, neighbors, algorithms)
//
// When this module is copied to a game project, this file replaces core/utils.ts
// ============================================================================

// ============================================================================
// CELL TYPE ENUM
// ============================================================================

export enum CellType {
  EMPTY = 0,
  WALL = 1,
  FLOOR = 2,
  GOAL = 3,
  HAZARD = 4,
  SPAWN = 5,
  SPECIAL = 6,
  ICE = 7,
  PORTAL = 8,
}

// ============================================================================
// GRID POINT TYPE
// ============================================================================

export interface GridPoint {
  gridX: number;
  gridY: number;
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
// GRID LOGIC: COORDINATE CONVERSION
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
): GridPoint {
  return {
    gridX: Math.floor((worldX - offsetX) / cellSize),
    gridY: Math.floor((worldY - offsetY) / cellSize),
  };
}

/**
 * Check if grid coordinates are within board bounds.
 */
export function isInBounds(
  gridX: number,
  gridY: number,
  width: number,
  height: number,
): boolean {
  return gridX >= 0 && gridX < width && gridY >= 0 && gridY < height;
}

// ============================================================================
// GRID LOGIC: NEIGHBOR QUERIES
// ============================================================================

const DIRS_4: readonly GridPoint[] = [
  { gridX: 0, gridY: -1 },
  { gridX: 1, gridY: 0 },
  { gridX: 0, gridY: 1 },
  { gridX: -1, gridY: 0 },
];

const DIRS_8: readonly GridPoint[] = [
  { gridX: 0, gridY: -1 },
  { gridX: 1, gridY: -1 },
  { gridX: 1, gridY: 0 },
  { gridX: 1, gridY: 1 },
  { gridX: 0, gridY: 1 },
  { gridX: -1, gridY: 1 },
  { gridX: -1, gridY: 0 },
  { gridX: -1, gridY: -1 },
];

/**
 * Get adjacent cell coordinates in 4-directional or 8-directional mode.
 * Only returns cells that are within bounds.
 */
export function getNeighbors(
  gridX: number,
  gridY: number,
  width: number,
  height: number,
  mode: '4-dir' | '8-dir' = '4-dir',
): GridPoint[] {
  const dirs = mode === '4-dir' ? DIRS_4 : DIRS_8;
  const result: GridPoint[] = [];
  for (const d of dirs) {
    const nx = gridX + d.gridX;
    const ny = gridY + d.gridY;
    if (isInBounds(nx, ny, width, height)) {
      result.push({ gridX: nx, gridY: ny });
    }
  }
  return result;
}

/**
 * Get the 4-directional movement direction from one cell to an adjacent cell.
 */
export function getDirection(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): 'up' | 'down' | 'left' | 'right' | null {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (dx === 0 && dy === -1) return 'up';
  if (dx === 0 && dy === 1) return 'down';
  if (dx === -1 && dy === 0) return 'left';
  if (dx === 1 && dy === 0) return 'right';
  return null;
}

// ============================================================================
// GRID LOGIC: DIRECTION HELPERS
// ============================================================================

export type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTION_DELTAS: Record<Direction, GridPoint> = {
  up: { gridX: 0, gridY: -1 },
  down: { gridX: 0, gridY: 1 },
  left: { gridX: -1, gridY: 0 },
  right: { gridX: 1, gridY: 0 },
};

/**
 * Get the delta (dx, dy) for a cardinal direction.
 */
export function getDirectionDelta(direction: Direction): GridPoint {
  return DIRECTION_DELTAS[direction];
}

/**
 * Get all cells in a straight line from (startX, startY) in the given direction,
 * up to `range` cells. Only returns cells that are within bounds.
 * Useful for ranged attacks (Thunderbolt: 2 tiles in front).
 */
export function getCellsInDirection(
  startX: number,
  startY: number,
  direction: Direction,
  range: number,
  width: number,
  height: number,
): GridPoint[] {
  const delta = DIRECTION_DELTAS[direction];
  const result: GridPoint[] = [];
  for (let i = 1; i <= range; i++) {
    const nx = startX + delta.gridX * i;
    const ny = startY + delta.gridY * i;
    if (!isInBounds(nx, ny, width, height)) break;
    result.push({ gridX: nx, gridY: ny });
  }
  return result;
}

/**
 * Get all cells within Manhattan distance `radius` of the center.
 * Useful for area effects (Koffing's Smog: adjacent tiles).
 * Excludes the center cell itself.
 */
export function getCellsInRadius(
  centerX: number,
  centerY: number,
  radius: number,
  width: number,
  height: number,
): GridPoint[] {
  const result: GridPoint[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) + Math.abs(dy) > radius) continue;
      const nx = centerX + dx;
      const ny = centerY + dy;
      if (isInBounds(nx, ny, width, height)) {
        result.push({ gridX: nx, gridY: ny });
      }
    }
  }
  return result;
}

// ============================================================================
// GRID LOGIC: DISTANCE FUNCTIONS
// ============================================================================

export function manhattanDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

export function chebyshevDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

// ============================================================================
// GRID LOGIC: PATHFINDING (BFS)
// ============================================================================

/**
 * BFS to find all reachable cells from a start position within a maximum range.
 * Uses Manhattan distance as the range metric.
 * @param isWalkable Predicate: return true if the cell at (x, y) can be traversed
 */
export function getReachableCells(
  startX: number,
  startY: number,
  maxRange: number,
  width: number,
  height: number,
  isWalkable: (x: number, y: number) => boolean,
  mode: '4-dir' | '8-dir' = '4-dir',
): GridPoint[] {
  const visited = new Set<string>();
  const result: GridPoint[] = [];
  const queue: { x: number; y: number; dist: number }[] = [
    { x: startX, y: startY, dist: 0 },
  ];
  const key = (x: number, y: number) => `${x},${y}`;
  visited.add(key(startX, startY));

  while (queue.length > 0) {
    const { x, y, dist } = queue.shift()!;
    result.push({ gridX: x, gridY: y });

    if (dist >= maxRange) continue;

    for (const n of getNeighbors(x, y, width, height, mode)) {
      const nk = key(n.gridX, n.gridY);
      if (!visited.has(nk) && isWalkable(n.gridX, n.gridY)) {
        visited.add(nk);
        queue.push({ x: n.gridX, y: n.gridY, dist: dist + 1 });
      }
    }
  }

  return result;
}

// ============================================================================
// GRID LOGIC: PATHFINDING (A*)
// ============================================================================

/**
 * A* pathfinding from start to end.
 * Returns the path as an array of GridPoints (including start and end), or empty array if no path.
 */
export function findPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  width: number,
  height: number,
  isWalkable: (x: number, y: number) => boolean,
  mode: '4-dir' | '8-dir' = '4-dir',
): GridPoint[] {
  if (
    !isInBounds(startX, startY, width, height) ||
    !isInBounds(endX, endY, width, height)
  ) {
    return [];
  }

  const key = (x: number, y: number) => `${x},${y}`;
  const openSet = new Map<
    string,
    { x: number; y: number; g: number; f: number }
  >();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();

  const heuristic = mode === '4-dir' ? manhattanDistance : chebyshevDistance;

  const startKey = key(startX, startY);
  const endKey = key(endX, endY);
  const h = heuristic(startX, startY, endX, endY);
  openSet.set(startKey, { x: startX, y: startY, g: 0, f: h });
  gScore.set(startKey, 0);

  while (openSet.size > 0) {
    let currentKey = '';
    let currentNode: { x: number; y: number; g: number; f: number } | null =
      null;
    for (const [k, node] of openSet) {
      if (!currentNode || node.f < currentNode.f) {
        currentKey = k;
        currentNode = node;
      }
    }

    if (!currentNode) break;

    if (currentKey === endKey) {
      const path: GridPoint[] = [];
      let traceKey: string | undefined = endKey;
      while (traceKey) {
        const [px, py] = traceKey.split(',').map(Number);
        path.unshift({ gridX: px, gridY: py });
        traceKey = cameFrom.get(traceKey);
      }
      return path;
    }

    openSet.delete(currentKey);

    for (const n of getNeighbors(
      currentNode.x,
      currentNode.y,
      width,
      height,
      mode,
    )) {
      if (
        !isWalkable(n.gridX, n.gridY) &&
        !(n.gridX === endX && n.gridY === endY)
      ) {
        continue;
      }

      const nk = key(n.gridX, n.gridY);
      const tentativeG = currentNode.g + 1;
      const existingG = gScore.get(nk);

      if (existingG === undefined || tentativeG < existingG) {
        cameFrom.set(nk, currentKey);
        gScore.set(nk, tentativeG);
        const f = tentativeG + heuristic(n.gridX, n.gridY, endX, endY);
        openSet.set(nk, { x: n.gridX, y: n.gridY, g: tentativeG, f });
      }
    }
  }

  return [];
}

// ============================================================================
// GRID LOGIC: FLOOD FILL
// ============================================================================

/**
 * Flood fill from a starting cell. Returns all connected cells matching the predicate.
 */
export function floodFill(
  startX: number,
  startY: number,
  width: number,
  height: number,
  predicate: (x: number, y: number) => boolean,
  mode: '4-dir' | '8-dir' = '4-dir',
): GridPoint[] {
  if (
    !isInBounds(startX, startY, width, height) ||
    !predicate(startX, startY)
  ) {
    return [];
  }

  const visited = new Set<string>();
  const result: GridPoint[] = [];
  const queue: GridPoint[] = [{ gridX: startX, gridY: startY }];
  const key = (x: number, y: number) => `${x},${y}`;
  visited.add(key(startX, startY));

  while (queue.length > 0) {
    const { gridX: x, gridY: y } = queue.shift()!;
    result.push({ gridX: x, gridY: y });

    for (const n of getNeighbors(x, y, width, height, mode)) {
      const nk = key(n.gridX, n.gridY);
      if (!visited.has(nk) && predicate(n.gridX, n.gridY)) {
        visited.add(nk);
        queue.push(n);
      }
    }
  }

  return result;
}

// ============================================================================
// GRID LOGIC: LINE OF SIGHT (BRESENHAM)
// ============================================================================

/**
 * Bresenham's line algorithm. Returns all cells on the line from (x1,y1) to (x2,y2).
 */
export function getLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): GridPoint[] {
  const points: GridPoint[] = [];
  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let cx = x1;
  let cy = y1;

  while (true) {
    points.push({ gridX: cx, gridY: cy });
    if (cx === x2 && cy === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }

  return points;
}

/**
 * Check line of sight between two cells. Returns true if no cell on the line
 * (excluding start and end) fails the predicate.
 */
export function hasLineOfSight(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  isTransparent: (x: number, y: number) => boolean,
): boolean {
  const line = getLine(x1, y1, x2, y2);
  for (let i = 1; i < line.length - 1; i++) {
    if (!isTransparent(line[i].gridX, line[i].gridY)) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// GRID LOGIC: MATCH DETECTION (for Match-3 style games)
// ============================================================================

/**
 * Find all horizontal and vertical matches of 3+ consecutive same-value cells.
 * Returns groups of matched cell coordinates.
 */
export function findMatches(
  cells: number[][],
  width: number,
  height: number,
  minMatchLength: number = 3,
): GridPoint[][] {
  const matches: GridPoint[][] = [];
  const inMatch = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;

  for (let y = 0; y < height; y++) {
    let runStart = 0;
    for (let x = 1; x <= width; x++) {
      if (
        x < width &&
        cells[y][x] === cells[y][runStart] &&
        cells[y][x] !== 0
      ) {
        continue;
      }
      const runLen = x - runStart;
      if (runLen >= minMatchLength) {
        const group: GridPoint[] = [];
        for (let i = runStart; i < x; i++) {
          group.push({ gridX: i, gridY: y });
          inMatch.add(key(i, y));
        }
        matches.push(group);
      }
      runStart = x;
    }
  }

  for (let x = 0; x < width; x++) {
    let runStart = 0;
    for (let y = 1; y <= height; y++) {
      if (
        y < height &&
        cells[y][x] === cells[runStart][x] &&
        cells[y][x] !== 0
      ) {
        continue;
      }
      const runLen = y - runStart;
      if (runLen >= minMatchLength) {
        const group: GridPoint[] = [];
        for (let i = runStart; i < y; i++) {
          group.push({ gridX: x, gridY: i });
          inMatch.add(key(x, i));
        }
        matches.push(group);
      }
      runStart = y;
    }
  }

  return matches;
}

// ============================================================================
// GRID LOGIC: GRID RENDERING
// ============================================================================

/**
 * Draw a visual grid overlay with cell borders.
 */
export function drawGridLines(
  scene: Phaser.Scene,
  cols: number,
  rows: number,
  cellSize: number,
  offsetX: number = 0,
  offsetY: number = 0,
  color: number = 0xffffff,
  alpha: number = 0.15,
  lineWidth: number = 1,
  depth: number = -5,
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  gfx.setDepth(depth);
  gfx.lineStyle(lineWidth, color, alpha);

  for (let x = 0; x <= cols; x++) {
    gfx.moveTo(offsetX + x * cellSize, offsetY);
    gfx.lineTo(offsetX + x * cellSize, offsetY + rows * cellSize);
  }
  for (let y = 0; y <= rows; y++) {
    gfx.moveTo(offsetX, offsetY + y * cellSize);
    gfx.lineTo(offsetX + cols * cellSize, offsetY + y * cellSize);
  }
  gfx.strokePath();

  return gfx;
}

/**
 * Draw a debug/gameplay grid overlay showing cell types with color coding.
 */
export function drawCellTypeOverlay(
  scene: Phaser.Scene,
  cells: number[][],
  cols: number,
  rows: number,
  cellSize: number,
  offsetX: number = 0,
  offsetY: number = 0,
  colorMap?: Record<number, number>,
  alpha: number = 0.25,
  depth: number = -5,
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  gfx.setDepth(depth);

  const defaultColors: Record<number, number> = {
    [CellType.EMPTY]: 0x222222,
    [CellType.WALL]: 0x444444,
    [CellType.FLOOR]: 0x228822,
    [CellType.GOAL]: 0xffaa00,
    [CellType.HAZARD]: 0xff2222,
    [CellType.SPAWN]: 0x4444ff,
    [CellType.SPECIAL]: 0xaa44aa,
    [CellType.ICE]: 0x88ccff,
    [CellType.PORTAL]: 0xff44ff,
  };

  const colors = colorMap ?? defaultColors;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellValue = cells[row]?.[col] ?? 0;
      const color = colors[cellValue] ?? 0x000000;
      gfx.fillStyle(color, alpha);
      gfx.fillRect(
        offsetX + col * cellSize,
        offsetY + row * cellSize,
        cellSize,
        cellSize,
      );
    }
  }

  return gfx;
}

// ============================================================================
// GRID LOGIC: CELL HIGHLIGHTING
// ============================================================================

/**
 * Draw highlighted cells (e.g. movement range, selection, attack range).
 * Returns a Graphics object that can be destroyed and recreated.
 */
export function highlightCells(
  scene: Phaser.Scene,
  cells: GridPoint[],
  cellSize: number,
  offsetX: number = 0,
  offsetY: number = 0,
  fillColor: number = 0x00aaff,
  fillAlpha: number = 0.3,
  borderColor: number = 0x00aaff,
  borderAlpha: number = 0.6,
  depth: number = 5,
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  gfx.setDepth(depth);

  for (const cell of cells) {
    const px = offsetX + cell.gridX * cellSize;
    const py = offsetY + cell.gridY * cellSize;

    gfx.fillStyle(fillColor, fillAlpha);
    gfx.fillRect(px, py, cellSize, cellSize);

    gfx.lineStyle(2, borderColor, borderAlpha);
    gfx.strokeRect(px, py, cellSize, cellSize);
  }

  return gfx;
}

/**
 * Highlight a single cell with a pulsing selection indicator.
 */
export function highlightSelectedCell(
  scene: Phaser.Scene,
  gridX: number,
  gridY: number,
  cellSize: number,
  offsetX: number = 0,
  offsetY: number = 0,
  color: number = 0xffff00,
  depth: number = 6,
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  gfx.setDepth(depth);

  const px = offsetX + gridX * cellSize;
  const py = offsetY + gridY * cellSize;
  const pad = 2;

  gfx.lineStyle(3, color, 0.8);
  gfx.strokeRect(px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2);

  scene.tweens.add({
    targets: gfx,
    alpha: { from: 1, to: 0.4 },
    duration: 600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  return gfx;
}

// ============================================================================
// GRID LOGIC: FLOATING TEXT EFFECT
// ============================================================================

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

// ============================================================================
// GRID LOGIC: ENTITY SPRITE HELPERS
// ============================================================================

/**
 * Scale a sprite to fit within a grid cell, maintaining aspect ratio.
 * Centers the sprite in the cell.
 */
export function scaleToCell(
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  cellSize: number,
  padding: number = 4,
): void {
  const targetSize = cellSize - padding * 2;
  const maxDim = Math.max(sprite.width, sprite.height);
  const scale = targetSize / maxDim;
  sprite.setScale(scale);
  sprite.setOrigin(0.5, 0.5);
}
