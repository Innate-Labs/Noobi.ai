export interface ProductionMapPoint {
  x: number;
  y: number;
}

export type ProductionNavigationNodeId = string;

export interface ProductionNavigationNode extends ProductionMapPoint {
  id: ProductionNavigationNodeId;
  neighbors: readonly ProductionNavigationNodeId[];
}

export type ProductionMapObstacle =
  | {
    id: string;
    kind: 'rect';
    box: readonly [number, number, number, number];
  }
  | {
    id: string;
    kind: 'polygon';
    points: readonly ProductionMapPoint[];
  };

export interface ProductionDepthObject {
  id: string;
  depthY: number;
  clipPath: string;
}

export interface ProductionAssistantFootprint {
  radiusX: number;
  radiusY: number;
}

// The rendered character is wider than its foot anchor. Navigation therefore
// reserves a small ellipse around the feet so a valid point cannot still leave
// half of the sprite inside a cabinet or foreground cutout.
export const PRODUCTION_ASSISTANT_FOOTPRINT: ProductionAssistantFootprint = {
  radiusX: 1.2,
  radiusY: 1,
};

const node = (
  id: string,
  x: number,
  y: number,
  neighbors: readonly string[],
): ProductionNavigationNode => ({ id, x, y, neighbors });

export const WORKSHOP_NAVIGATION_NODES: readonly ProductionNavigationNode[] = [
  node('brief-main', 14, 39, ['brief-east', 'brief-west']),
  node('brief-east', 18.5, 38.5, ['brief-main', 'north-west']),
  node('brief-west', 10, 38, ['brief-main']),

  node('design-main', 31, 38, ['design-left', 'design-right']),
  node('design-left', 27, 40, ['design-main', 'north-west']),
  node('design-right', 36, 39, ['design-main', 'north-mid']),

  node('assembly-main', 52, 38, ['assembly-left', 'assembly-right']),
  node('assembly-left', 47, 39, ['assembly-main', 'north-mid']),
  node('assembly-right', 57, 40, ['assembly-main', 'north-east']),

  node('asset-main', 71, 35, ['asset-left', 'asset-right']),
  node('asset-left', 67, 38, ['asset-main', 'asset-gate']),
  node('asset-right', 75, 33, ['asset-main']),

  node('code-main', 26, 61, ['code-east', 'code-south']),
  node('code-east', 27, 59, ['code-main', 'center-west']),
  node('code-south', 24, 64, ['code-main']),

  node('world-main', 68, 61, ['world-left', 'world-right']),
  node('world-left', 66.5, 61.5, ['world-main', 'world-gate']),
  node('world-right', 68, 63, ['world-main']),

  node('arcade-main', 59.7, 90, ['arcade-left', 'arcade-upper']),
  node('arcade-left', 57, 87, ['arcade-main', 'arcade-gate']),
  node('arcade-upper', 61, 85, ['arcade-main', 'arcade-gate']),

  node('delivery-main', 35, 86, ['delivery-left', 'delivery-right']),
  node('delivery-left', 30, 84, ['delivery-main', 'delivery-gate']),
  node('delivery-right', 39, 88, ['delivery-main', 'delivery-gate']),

  node('north-west', 24.5, 41, ['brief-east', 'design-left', 'north-mid', 'center-west']),
  node('north-mid', 39, 44, ['design-right', 'assembly-left', 'north-west', 'north-east', 'center']),
  node('north-east', 58, 44, ['assembly-right', 'asset-gate', 'north-mid', 'center-east']),
  node('asset-gate', 65, 42, ['asset-left', 'north-east', 'center-east']),

  node('center-west', 31, 57, ['north-west', 'code-east', 'center']),
  node('center', 45, 58, ['north-mid', 'center-west', 'center-east', 'south-center']),
  node('center-east', 61, 57, ['north-east', 'asset-gate', 'center', 'world-gate', 'south-east']),

  node('world-gate', 65, 62, ['center-east', 'world-left']),

  node('south-center', 45, 75, ['center', 'south-east', 'delivery-turn']),
  node('south-east', 59, 76, ['center-east', 'south-center', 'arcade-gate']),
  node('arcade-gate', 59, 82, ['south-east', 'arcade-left', 'arcade-upper']),
  node('delivery-turn', 43, 80, ['south-center', 'delivery-gate']),
  node('delivery-gate', 40, 82, ['delivery-turn', 'delivery-left', 'delivery-right']),
] as const;

export const WORKSHOP_OBSTACLES: readonly ProductionMapObstacle[] = [
  { id: 'brief-desk', kind: 'rect', box: [5.7, 19.5, 18.2, 34.6] },
  { id: 'design-table', kind: 'rect', box: [20.7, 12.3, 40, 31.7] },
  { id: 'assembly-bench', kind: 'rect', box: [43, 9.2, 61.5, 31.7] },
  { id: 'asset-easel', kind: 'rect', box: [68, 4.2, 78.8, 29.6] },
  { id: 'asset-paint-rack', kind: 'rect', box: [79.5, 4.8, 96.4, 36] },
  {
    id: 'code-console',
    kind: 'polygon',
    points: [
      { x: 2.8, y: 44 }, { x: 15.4, y: 40.5 }, { x: 22.9, y: 42 },
      { x: 22.9, y: 60.5 }, { x: 18.2, y: 64.8 }, { x: 5.2, y: 67.2 },
      { x: 2.5, y: 62 },
    ],
  },
  {
    id: 'world-map-table',
    kind: 'polygon',
    points: [
      { x: 69.4, y: 38 }, { x: 89, y: 36.5 }, { x: 96, y: 42 },
      { x: 95.8, y: 59 }, { x: 87.6, y: 67.2 }, { x: 71, y: 59.5 },
    ],
  },
  {
    id: 'bed',
    kind: 'polygon',
    points: [
      { x: 86, y: 62.5 }, { x: 100, y: 65 }, { x: 100, y: 81.8 },
      { x: 84.6, y: 82.3 }, { x: 82.8, y: 76 },
    ],
  },
  {
    id: 'playtest-arcade',
    kind: 'polygon',
    points: [
      { x: 64.6, y: 64.5 }, { x: 72.5, y: 65.2 }, { x: 74.8, y: 71.8 },
      { x: 74.4, y: 91.7 }, { x: 67.3, y: 93.4 }, { x: 62.9, y: 88 },
      { x: 63.1, y: 71 },
    ],
  },
  {
    id: 'arcade-bookcases',
    kind: 'polygon',
    points: [
      { x: 73, y: 75.5 }, { x: 90.3, y: 76.5 },
      { x: 91.5, y: 98.5 }, { x: 73.5, y: 98 },
    ],
  },
  {
    id: 'delivery-lounge',
    kind: 'polygon',
    points: [
      { x: 4.5, y: 72 }, { x: 9.5, y: 68.8 }, { x: 22.5, y: 69.5 },
      { x: 24.5, y: 78.8 }, { x: 22.3, y: 86.8 }, { x: 12, y: 89.5 },
      { x: 4, y: 85 },
    ],
  },
  {
    id: 'delivery-rear-rail',
    kind: 'polygon',
    points: [
      { x: 21.5, y: 65 }, { x: 37.8, y: 67 }, { x: 41.5, y: 73.5 },
      { x: 39.8, y: 79 }, { x: 27, y: 78 }, { x: 21.5, y: 73.5 },
    ],
  },
  { id: 'delivery-front-crate', kind: 'rect', box: [24.5, 89, 32.3, 99] },
] as const;

export const WORKSHOP_DEPTH_OBJECTS: readonly ProductionDepthObject[] = [
  {
    id: 'brief-desk',
    depthY: 34.8,
    clipPath: 'polygon(4.7% 11%,18.3% 11%,18.5% 29%,15.9% 29.8%,15.9% 34.8%,12.7% 34.8%,12.7% 30%,6% 29.2%,4.7% 25%)',
  },
  {
    id: 'design-table',
    depthY: 31.8,
    clipPath: 'polygon(20.2% 0%,40.7% 0%,40.3% 29.5%,32.5% 29.5%,32.4% 31.8%,28.4% 31.8%,28.3% 29.8%,20.2% 29.8%)',
  },
  {
    id: 'assembly-bench',
    depthY: 31.8,
    clipPath: 'polygon(42.2% 0%,63.8% 0%,63.8% 29.6%,54.2% 29.6%,54.2% 31.8%,50.6% 31.8%,50.6% 29.8%,42.2% 29.8%)',
  },
  {
    id: 'asset-easel',
    depthY: 30.2,
    clipPath: 'polygon(67.2% 0%,79.4% 0%,79% 30.2%,73.8% 30.2%,73.8% 27%,69% 27%,69% 30%,67.2% 30%)',
  },
  {
    id: 'asset-paint-rack',
    depthY: 36.5,
    clipPath: 'polygon(79% 0%,100% 0%,100% 37%,82% 37%,79.2% 34%)',
  },
  {
    id: 'code-console',
    depthY: 67.2,
    clipPath: 'polygon(2.5% 58.5%,18.2% 59.4%,18.2% 64.8%,5.2% 67.2%,2.5% 62%)',
  },
  {
    id: 'world-map-table',
    depthY: 67.2,
    clipPath: 'polygon(70.8% 53.5%,95.8% 52%,95.8% 59%,87.6% 67.2%,71% 59.5%)',
  },
  {
    id: 'bed',
    depthY: 82.3,
    clipPath: 'polygon(84% 73.5%,100% 75%,100% 82%,84.6% 82.3%,82.8% 76%)',
  },
  {
    id: 'playtest-arcade',
    depthY: 93.4,
    clipPath: 'polygon(63.1% 80.5%,72.8% 82%,74.4% 91.7%,67.3% 93.4%,62.9% 88%)',
  },
  {
    id: 'arcade-bookcases',
    depthY: 98.5,
    clipPath: 'polygon(72.8% 74.8%,90.5% 75.5%,92% 98.8%,73% 98.8%)',
  },
  {
    id: 'delivery-lounge',
    depthY: 89.5,
    clipPath: 'polygon(4% 80%,24.5% 78.8%,22.3% 86.8%,12% 89.5%,4% 85%)',
  },
  {
    id: 'delivery-rear-rail',
    depthY: 79,
    clipPath: 'polygon(21.5% 71.5%,41.5% 73.5%,39.8% 79%,27% 78%,21.5% 73.5%)',
  },
  {
    id: 'delivery-front-rail',
    depthY: 99,
    clipPath: 'polygon(0% 90.5%,19.5% 92.5%,22% 96%,31% 89%,42% 91%,42% 100%,0% 100%)',
  },
] as const;

export function productionNavigationNode(
  id: ProductionNavigationNodeId,
  graph: readonly ProductionNavigationNode[] = WORKSHOP_NAVIGATION_NODES,
): ProductionNavigationNode {
  const found = graph.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown production navigation node: ${id}`);
  return found;
}

export function findProductionAssistantPath(
  fromId: ProductionNavigationNodeId,
  toId: ProductionNavigationNodeId,
  graph: readonly ProductionNavigationNode[] = WORKSHOP_NAVIGATION_NODES,
): readonly ProductionNavigationNodeId[] | null {
  const nodes = new Map(graph.map((candidate) => [candidate.id, candidate]));
  const start = nodes.get(fromId);
  const goal = nodes.get(toId);
  if (!start || !goal) return null;
  if (fromId === toId) return [fromId];

  const open = new Set<ProductionNavigationNodeId>([fromId]);
  const previous = new Map<ProductionNavigationNodeId, ProductionNavigationNodeId>();
  const cost = new Map<ProductionNavigationNodeId, number>([[fromId, 0]]);
  const score = new Map<ProductionNavigationNodeId, number>([[fromId, distance(start, goal)]]);

  while (open.size > 0) {
    const currentId = [...open].sort((left, right) => (
      (score.get(left) ?? Number.POSITIVE_INFINITY) - (score.get(right) ?? Number.POSITIVE_INFINITY)
      || left.localeCompare(right)
    ))[0]!;
    if (currentId === toId) return rebuildPath(previous, currentId);
    open.delete(currentId);
    const current = nodes.get(currentId)!;
    for (const neighborId of [...current.neighbors].sort()) {
      const neighbor = nodes.get(neighborId);
      if (!neighbor) continue;
      const nextCost = (cost.get(currentId) ?? Number.POSITIVE_INFINITY) + distance(current, neighbor);
      if (nextCost >= (cost.get(neighborId) ?? Number.POSITIVE_INFINITY)) continue;
      previous.set(neighborId, currentId);
      cost.set(neighborId, nextCost);
      score.set(neighborId, nextCost + distance(neighbor, goal));
      open.add(neighborId);
    }
  }
  return null;
}

export function productionAssistantSegmentDuration(
  from: ProductionMapPoint,
  to: ProductionMapPoint,
): number {
  const segmentDistance = distance(from, to);
  return Math.round(Math.min(1_500, Math.max(360, 260 + (segmentDistance * 32))));
}

export function productionDepthZ(y: number): number {
  return 1_000 + Math.round(y * 10);
}

export function isProductionPointBlocked(
  point: ProductionMapPoint,
  obstacles: readonly ProductionMapObstacle[] = WORKSHOP_OBSTACLES,
): boolean {
  return obstacles.some((obstacle) => obstacle.kind === 'rect'
    ? point.x >= obstacle.box[0]
      && point.x <= obstacle.box[2]
      && point.y >= obstacle.box[1]
      && point.y <= obstacle.box[3]
    : pointInPolygon(point, obstacle.points));
}

export function isProductionSegmentWalkable(
  from: ProductionMapPoint,
  to: ProductionMapPoint,
  obstacles: readonly ProductionMapObstacle[] = WORKSHOP_OBSTACLES,
): boolean {
  const steps = Math.max(2, Math.ceil(distance(from, to) * 2));
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    if (isProductionPointBlocked({
      x: from.x + ((to.x - from.x) * progress),
      y: from.y + ((to.y - from.y) * progress),
    }, obstacles)) return false;
  }
  return true;
}

export function isProductionAssistantFootprintBlocked(
  point: ProductionMapPoint,
  obstacles: readonly ProductionMapObstacle[] = WORKSHOP_OBSTACLES,
  footprint: ProductionAssistantFootprint = PRODUCTION_ASSISTANT_FOOTPRINT,
): boolean {
  return footprintOffsets(footprint).some(({ x, y }) => isProductionPointBlocked({
    x: point.x + x,
    y: point.y + y,
  }, obstacles));
}

export function isProductionAssistantSegmentWalkable(
  from: ProductionMapPoint,
  to: ProductionMapPoint,
  obstacles: readonly ProductionMapObstacle[] = WORKSHOP_OBSTACLES,
  footprint: ProductionAssistantFootprint = PRODUCTION_ASSISTANT_FOOTPRINT,
): boolean {
  const steps = Math.max(2, Math.ceil(distance(from, to) * 2));
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    if (isProductionAssistantFootprintBlocked({
      x: from.x + ((to.x - from.x) * progress),
      y: from.y + ((to.y - from.y) * progress),
    }, obstacles, footprint)) return false;
  }
  return true;
}

export function validateProductionNavigationGraph(
  graph: readonly ProductionNavigationNode[] = WORKSHOP_NAVIGATION_NODES,
): readonly string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const nodes = new Map(graph.map((candidate) => [candidate.id, candidate]));
  for (const candidate of graph) {
    if (ids.has(candidate.id)) issues.push(`duplicate:${candidate.id}`);
    ids.add(candidate.id);
    if (candidate.x < 0 || candidate.x > 100 || candidate.y < 0 || candidate.y > 100) {
      issues.push(`bounds:${candidate.id}`);
    }
    if (isProductionAssistantFootprintBlocked(candidate)) issues.push(`blocked:${candidate.id}`);
    for (const neighborId of candidate.neighbors) {
      const neighbor = nodes.get(neighborId);
      if (!neighbor) {
        issues.push(`missing:${candidate.id}->${neighborId}`);
        continue;
      }
      if (!neighbor.neighbors.includes(candidate.id)) issues.push(`one-way:${candidate.id}->${neighborId}`);
      if (!isProductionAssistantSegmentWalkable(candidate, neighbor)) issues.push(`collision:${candidate.id}->${neighborId}`);
    }
  }
  return issues;
}

function footprintOffsets(
  footprint: ProductionAssistantFootprint,
): readonly ProductionMapPoint[] {
  const diagonalX = footprint.radiusX * Math.SQRT1_2;
  const diagonalY = footprint.radiusY * Math.SQRT1_2;
  return [
    { x: 0, y: 0 },
    { x: footprint.radiusX, y: 0 },
    { x: -footprint.radiusX, y: 0 },
    { x: 0, y: footprint.radiusY },
    { x: 0, y: -footprint.radiusY },
    { x: diagonalX, y: diagonalY },
    { x: -diagonalX, y: diagonalY },
    { x: diagonalX, y: -diagonalY },
    { x: -diagonalX, y: -diagonalY },
  ];
}

function rebuildPath(
  previous: ReadonlyMap<ProductionNavigationNodeId, ProductionNavigationNodeId>,
  target: ProductionNavigationNodeId,
): readonly ProductionNavigationNodeId[] {
  const path = [target];
  let current = target;
  while (previous.has(current)) {
    current = previous.get(current)!;
    path.unshift(current);
  }
  return path;
}

function distance(left: ProductionMapPoint, right: ProductionMapPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function pointInPolygon(point: ProductionMapPoint, polygon: readonly ProductionMapPoint[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const left = polygon[current]!;
    const right = polygon[previous]!;
    const crosses = (left.y > point.y) !== (right.y > point.y)
      && point.x < ((right.x - left.x) * (point.y - left.y)) / (right.y - left.y) + left.x;
    if (crosses) inside = !inside;
  }
  return inside;
}
