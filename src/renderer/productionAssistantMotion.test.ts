import { describe, expect, it } from 'vitest';

import { WALK_ACTION, productionAssistantScene } from './productionAssistantState';
import {
  advanceProductionAssistantRoute,
  createProductionAssistantMotion,
  routeProductionAssistant,
  settleProductionAssistantAt,
} from './productionAssistantMotion';

describe('production assistant motion', () => {
  it('routes between distant stations through authored waypoints instead of teleporting', () => {
    const brief = productionAssistantScene('brief', 'running');
    const world = productionAssistantScene('world', 'running');
    const initial = createProductionAssistantMotion(brief.nodeId, brief.actions[0]!);
    const moving = routeProductionAssistant(initial, world.nodeId, world.actions[0]!);

    expect(moving.phase).toBe('walking');
    expect(moving.nodeId).toBe(brief.nodeId);
    expect(moving.targetNodeId).not.toBe(world.nodeId);
    expect(moving.remainingRoute.length).toBeGreaterThan(1);
    expect(moving.action.pose).toBe(WALK_ACTION.pose);
  });

  it('advances every segment without flashing back to an acting pose at waypoints', () => {
    const brief = productionAssistantScene('brief', 'running');
    const assets = productionAssistantScene('assets', 'running');
    let state = routeProductionAssistant(
      createProductionAssistantMotion(brief.nodeId, brief.actions[0]!),
      assets.nodeId,
      assets.actions[0]!,
    );

    let segments = 0;
    while (state.phase === 'walking' && segments < 30) {
      const previousTarget = state.targetNodeId;
      state = advanceProductionAssistantRoute(state);
      segments += 1;
      if (state.phase === 'walking') {
        expect(state.nodeId).toBe(previousTarget);
        expect(state.action.pose).toBe('walk');
      }
    }

    expect(segments).toBeGreaterThan(2);
    expect(state.phase).toBe('acting');
    expect(state.nodeId).toBe(assets.nodeId);
    expect(state.action).toBe(assets.actions[0]);
  });

  it('finishes the active segment before replacing a route after a stage change', () => {
    const brief = productionAssistantScene('brief', 'running');
    const world = productionAssistantScene('world', 'running');
    const code = productionAssistantScene('code', 'running');
    const moving = routeProductionAssistant(
      createProductionAssistantMotion(brief.nodeId, brief.actions[0]!),
      world.nodeId,
      world.actions[0]!,
    );
    const redirected = routeProductionAssistant(moving, code.nodeId, code.actions[0]!);

    expect(redirected.targetNodeId).toBe(moving.targetNodeId);
    expect(redirected.x).toBe(moving.x);
    expect(redirected.y).toBe(moving.y);
    expect(redirected.pendingAction).toBe(code.actions[0]);

    let finished = redirected;
    for (let index = 0; index < 30 && finished.phase === 'walking'; index += 1) {
      finished = advanceProductionAssistantRoute(finished);
    }
    expect(finished.nodeId).toBe(code.nodeId);
  });

  it('updates depth only at reached waypoints and settles immediately for reduced motion', () => {
    const brief = productionAssistantScene('brief', 'running');
    const code = productionAssistantScene('code', 'running');
    const initial = createProductionAssistantMotion(brief.nodeId, brief.actions[0]!);
    const moving = routeProductionAssistant(initial, code.nodeId, code.actions[0]!);

    expect(moving.depthY).toBe(initial.depthY);
    const advanced = advanceProductionAssistantRoute(moving);
    expect(advanced.depthY).toBe(moving.y);

    const settled = settleProductionAssistantAt(initial, code.nodeId, code.actions[0]!);
    expect(settled.phase).toBe('acting');
    expect(settled.nodeId).toBe(code.nodeId);
    expect(settled.depthY).toBe(code.y);
  });
});
