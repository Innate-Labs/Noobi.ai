import {
  WALK_ACTION,
  type ProductionAssistantAction,
  type ProductionAssistantEasterEgg,
} from './productionAssistantState';
import {
  findProductionAssistantPath,
  productionAssistantSegmentDuration,
  productionNavigationNode,
  type ProductionNavigationNodeId,
} from './productionMapNavigation';

export interface ProductionAssistantMotionState {
  x: number;
  y: number;
  facing: 1 | -1;
  phase: 'walking' | 'acting';
  action: ProductionAssistantAction;
  pendingAction: ProductionAssistantAction;
  easterEgg: ProductionAssistantEasterEgg | null;
  pendingEasterEgg: ProductionAssistantEasterEgg | null;
  nodeId: ProductionNavigationNodeId;
  targetNodeId: ProductionNavigationNodeId | null;
  remainingRoute: readonly ProductionNavigationNodeId[];
  depthY: number;
  segmentMs: number;
}

export interface ProductionAssistantRouteOptions {
  easterEgg?: ProductionAssistantEasterEgg | null;
  hideEasterEggOnArrival?: boolean;
}

export function createProductionAssistantMotion(
  nodeId: ProductionNavigationNodeId,
  action: ProductionAssistantAction,
): ProductionAssistantMotionState {
  const start = productionNavigationNode(nodeId);
  return {
    x: start.x,
    y: start.y,
    facing: 1,
    phase: 'acting',
    action,
    pendingAction: action,
    easterEgg: null,
    pendingEasterEgg: null,
    nodeId,
    targetNodeId: null,
    remainingRoute: [],
    depthY: start.y,
    segmentMs: 0,
  };
}

export function settleProductionAssistantAt(
  current: ProductionAssistantMotionState,
  destinationNodeId: ProductionNavigationNodeId,
  action: ProductionAssistantAction,
): ProductionAssistantMotionState {
  const destination = productionNavigationNode(destinationNodeId);
  return {
    ...current,
    x: destination.x,
    y: destination.y,
    facing: facingForSegment(current.x, destination.x, current.facing, false),
    phase: 'acting',
    action,
    pendingAction: action,
    easterEgg: null,
    pendingEasterEgg: null,
    nodeId: destinationNodeId,
    targetNodeId: null,
    remainingRoute: [],
    depthY: destination.y,
    segmentMs: 0,
  };
}

export function routeProductionAssistant(
  current: ProductionAssistantMotionState,
  destinationNodeId: ProductionNavigationNodeId,
  pendingAction: ProductionAssistantAction,
  options: ProductionAssistantRouteOptions = {},
): ProductionAssistantMotionState {
  const easterEgg = options.easterEgg ?? null;
  const moonwalking = easterEgg?.id === 'moonwalk';
  const pendingEasterEgg = options.hideEasterEggOnArrival ? null : easterEgg;

  // A stage may advance while a segment is already animating. The actor cannot
  // turn in the middle of that CSS transition, so finish the current segment
  // and replace only the route that follows it.
  if (current.phase === 'walking' && current.targetNodeId) {
    const routeFromTarget = findProductionAssistantPath(current.targetNodeId, destinationNodeId);
    if (!routeFromTarget) {
      return {
        ...current,
        pendingAction,
        pendingEasterEgg,
      };
    }
    return {
      ...current,
      pendingAction,
      pendingEasterEgg,
      easterEgg,
      remainingRoute: routeFromTarget.slice(1),
    };
  }

  const route = findProductionAssistantPath(current.nodeId, destinationNodeId);
  if (!route) {
    // Collision safety fails closed: remain at the last authored walkable node
    // instead of falling back to a straight line through furniture.
    return {
      ...current,
      phase: 'acting',
      action: pendingAction,
      pendingAction,
      easterEgg: pendingEasterEgg,
      pendingEasterEgg,
      targetNodeId: null,
      remainingRoute: [],
      segmentMs: 0,
    };
  }

  if (route.length === 1) {
    return {
      ...current,
      phase: 'acting',
      action: pendingAction,
      pendingAction,
      easterEgg: pendingEasterEgg,
      pendingEasterEgg,
      targetNodeId: null,
      remainingRoute: [],
      segmentMs: 0,
    };
  }

  const nextNodeId = route[1]!;
  const next = productionNavigationNode(nextNodeId);
  const origin = productionNavigationNode(current.nodeId);
  return {
    ...current,
    x: next.x,
    y: next.y,
    facing: facingForSegment(origin.x, next.x, current.facing, moonwalking),
    phase: 'walking',
    action: WALK_ACTION,
    pendingAction,
    easterEgg,
    pendingEasterEgg,
    targetNodeId: nextNodeId,
    remainingRoute: route.slice(2),
    segmentMs: productionAssistantSegmentDuration(origin, next),
  };
}

export function advanceProductionAssistantRoute(
  current: ProductionAssistantMotionState,
): ProductionAssistantMotionState {
  if (current.phase !== 'walking' || !current.targetNodeId) return current;

  const reachedNodeId = current.targetNodeId;
  const reached = productionNavigationNode(reachedNodeId);
  const nextNodeId = current.remainingRoute[0] ?? null;
  if (!nextNodeId) {
    return {
      ...current,
      x: reached.x,
      y: reached.y,
      phase: 'acting',
      action: current.pendingAction,
      easterEgg: current.pendingEasterEgg,
      nodeId: reachedNodeId,
      targetNodeId: null,
      remainingRoute: [],
      depthY: reached.y,
      segmentMs: 0,
    };
  }

  const next = productionNavigationNode(nextNodeId);
  const moonwalking = current.easterEgg?.id === 'moonwalk';
  return {
    ...current,
    x: next.x,
    y: next.y,
    facing: facingForSegment(reached.x, next.x, current.facing, moonwalking),
    nodeId: reachedNodeId,
    targetNodeId: nextNodeId,
    remainingRoute: current.remainingRoute.slice(1),
    depthY: reached.y,
    segmentMs: productionAssistantSegmentDuration(reached, next),
  };
}

function facingForSegment(
  fromX: number,
  toX: number,
  fallback: 1 | -1,
  moonwalking: boolean,
): 1 | -1 {
  if (fromX === toX) return fallback;
  const direction: 1 | -1 = toX > fromX ? 1 : -1;
  return moonwalking ? (direction === 1 ? -1 : 1) : direction;
}
