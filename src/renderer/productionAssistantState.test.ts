import { describe, expect, it } from 'vitest';

import type { PipelineStage } from '../shared/contracts';
import { productionNavigationNode } from './productionMapNavigation';
import {
  PRODUCTION_ASSISTANT_EASTER_EGG_CHANCE,
  productionAssistantActionDelay,
  productionAssistantScene,
  productionAssistantStages,
  productionCrewActionDelay,
  productionCrewMembers,
  productionCrewPrimaryRole,
  selectProductionCrewRoamPoint,
  selectProductionAssistantBeat,
  selectProductionAssistantRoamPoint,
  shouldProductionAssistantRoam,
} from './productionAssistantState';

const EXPECTED_STATIONS: Record<PipelineStage, string> = {
  brief: 'brief-desk',
  scaffold: 'assembly-bench',
  gdd: 'design-board',
  assets: 'asset-easel',
  world: 'world-lounge',
  code: 'code-console',
  verify: 'test-arcade',
  complete: 'delivery-stage',
};

const NEW_ACTION_POSES = ['coffee', 'stretch', 'type', 'inspect', 'sweep'] as const;

describe('production assistant state', () => {
  it('keeps four production roles at fixed, separated job zones', () => {
    const fixedStations = {
      planner: ['brief-desk', 'brief-main'],
      artist: ['asset-easel', 'asset-main'],
      engineer: ['code-console', 'code-main'],
      tester: ['test-arcade', 'arcade-main'],
    } as const;

    for (const stage of productionAssistantStages()) {
      const crew = productionCrewMembers(stage, 'running');
      expect(crew).toHaveLength(4);
      expect(crew.map((member) => member.role).sort())
        .toEqual(Object.keys(fixedStations).sort());
      expect(crew.filter((member) => member.active)).toHaveLength(1);
      expect(crew.find((member) => member.active)?.role)
        .toBe(productionCrewPrimaryRole(stage, 'running'));

      for (const member of crew) {
        expect([member.station, member.nodeId]).toEqual(fixedStations[member.role]);
        expect(member.roamPoints).toContainEqual(
          expect.objectContaining({ nodeId: member.nodeId }),
        );
        if (member.active) {
          expect(member.actions).toBe(productionAssistantScene(stage, 'running').actions);
        } else {
          expect(member.actions.every((item) => item.id.startsWith(`${member.role}-`)))
            .toBe(true);
        }
      }

      for (let first = 0; first < crew.length; first += 1) {
        for (let second = first + 1; second < crew.length; second += 1) {
          expect(Math.hypot(
            crew[first]!.x - crew[second]!.x,
            crew[first]!.y - crew[second]!.y,
          )).toBeGreaterThan(20);
        }
      }
    }
  });

  it('assigns the current pipeline to the matching specialist', () => {
    expect(productionCrewPrimaryRole('brief', 'running')).toBe('planner');
    expect(productionCrewPrimaryRole('gdd', 'running')).toBe('planner');
    expect(productionCrewPrimaryRole('assets', 'running')).toBe('artist');
    expect(productionCrewPrimaryRole('world', 'running')).toBe('artist');
    expect(productionCrewPrimaryRole('scaffold', 'running')).toBe('engineer');
    expect(productionCrewPrimaryRole('code', 'running')).toBe('engineer');
    expect(productionCrewPrimaryRole('verify', 'running')).toBe('tester');
    expect(productionCrewPrimaryRole('complete', 'running')).toBe('tester');
    expect(productionCrewPrimaryRole('brief', 'failed')).toBe('engineer');
    expect(productionCrewPrimaryRole('brief', 'completed')).toBe('tester');
  });

  it('supports two to four collaborators without ever dropping the active role', () => {
    for (const size of [2, 3, 4] as const) {
      const crew = productionCrewMembers('verify', 'running', size);
      expect(crew).toHaveLength(size);
      expect(new Set(crew.map((member) => member.role)).size).toBe(size);
      expect(crew.some((member) => member.role === 'tester' && member.active)).toBe(true);
    }
  });

  it('offsets support-member action clocks and keeps roaming inside each job zone', () => {
    const crew = productionCrewMembers('code', 'running');
    const delays = crew.map((member) => productionCrewActionDelay(member, () => 0));
    expect(new Set(delays).size).toBe(crew.length);

    for (const member of crew) {
      const destination = selectProductionCrewRoamPoint(
        member,
        member.x,
        member.y,
        () => 0,
      );
      expect(member.roamPoints).toContain(destination);
      if (member.roamPoints.length > 1) expect(destination.nodeId).not.toBe(member.nodeId);
    }
  });

  it('covers every pipeline stage with a station and multiple actions', () => {
    expect(productionAssistantStages()).toEqual(Object.keys(EXPECTED_STATIONS));
    for (const [stage, station] of Object.entries(EXPECTED_STATIONS)) {
      const scene = productionAssistantScene(stage as PipelineStage, 'running');
      expect(scene.station).toBe(station);
      expect(scene.actions.length).toBeGreaterThanOrEqual(3);
      expect(scene.roamPoints.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('makes every new authored pose reachable from a running-stage action', () => {
    const runningActions = productionAssistantStages().flatMap(
      (stage) => productionAssistantScene(stage, 'running').actions,
    );

    for (const pose of NEW_ACTION_POSES) {
      const matchingAction = runningActions.find((candidate) => candidate.pose === pose);
      expect(matchingAction, `missing a running action for ${pose}`).toBeDefined();

      const scene = productionAssistantStages()
        .map((stage) => productionAssistantScene(stage, 'running'))
        .find((candidate) => candidate.actions.includes(matchingAction!))!;
      const index = scene.actions.indexOf(matchingAction!);
      const rolls = [0.5, (index + 0.25) / scene.actions.length, 0.5];
      const selected = selectProductionAssistantBeat(
        scene.actions,
        null,
        () => rolls.shift() ?? 0.5,
      );

      expect(selected.action).toBe(matchingAction);
    }
  });

  it('gives every running production stage at least one of the expanded actions', () => {
    for (const stage of productionAssistantStages()) {
      const scene = productionAssistantScene(stage, 'running');
      expect(
        scene.actions.some((candidate) => NEW_ACTION_POSES.includes(
          candidate.pose as (typeof NEW_ACTION_POSES)[number],
        )),
        `${stage} should expose an expanded action`,
      ).toBe(true);
    }
  });

  it('keeps repeated running-stage random selection inside the authored action set', () => {
    let seed = 0x5eed;
    const random = () => {
      seed = (seed * 16_807) % 2_147_483_647;
      return seed / 2_147_483_647;
    };

    for (const stage of productionAssistantStages()) {
      const actions = productionAssistantScene(stage, 'running').actions;
      let currentActionId: string | null = null;

      for (let index = 0; index < 64; index += 1) {
        const beat = selectProductionAssistantBeat(actions, currentActionId, random);
        expect(actions).toContain(beat.action);
        if (actions.length > 1) expect(beat.action.id).not.toBe(currentActionId);
        currentActionId = beat.action.id;
      }
    }
  });

  it('binds every stage anchor and roam point to exact production-map navigation coordinates', () => {
    for (const stage of productionAssistantStages()) {
      const scene = productionAssistantScene(stage, 'running');
      const sceneNode = productionNavigationNode(scene.nodeId);

      expect({ x: scene.x, y: scene.y }).toEqual({ x: sceneNode.x, y: sceneNode.y });
      for (const point of scene.roamPoints) {
        const pointNode = productionNavigationNode(point.nodeId);
        expect({ x: point.x, y: point.y }).toEqual({ x: pointNode.x, y: pointNode.y });
      }
    }
  });

  it('uses the safe code and arcade nodes instead of the former blocked coordinates', () => {
    const code = productionAssistantScene('code', 'running');
    const verify = productionAssistantScene('verify', 'running');

    expect([code.nodeId, code.x, code.y]).toEqual(['code-main', 26, 61]);
    expect(code.roamPoints.map((point) => [point.nodeId, point.x, point.y])).toEqual([
      ['code-main', 26, 61],
      ['code-east', 27, 59],
      ['code-south', 24, 64],
    ]);
    expect([verify.nodeId, verify.x, verify.y]).toEqual(['arcade-main', 59.7, 90]);
    expect(verify.roamPoints.map((point) => [point.nodeId, point.x, point.y])).toEqual([
      ['arcade-main', 59.7, 90],
      ['arcade-left', 57, 87],
      ['arcade-upper', 61, 85],
    ]);
  });

  it('uses project status as an action override while preserving the current station', () => {
    const running = productionAssistantScene('world', 'running');
    const waiting = productionAssistantScene('world', 'waiting');
    const failed = productionAssistantScene('code', 'failed');
    const completed = productionAssistantScene('brief', 'completed');

    expect(waiting.station).toBe(running.station);
    expect(waiting.actions.some((item) => item.pose === 'sleep')).toBe(true);
    expect(failed.actions.some((item) => item.pose === 'repair')).toBe(true);
    expect(completed.stage).toBe('complete');
    expect(completed.station).toBe('delivery-stage');
  });

  it('includes both level-building work and sleep actions in the world stage', () => {
    const world = productionAssistantScene('world', 'running');

    expect(world.actions.some((item) => item.pose === 'carry')).toBe(true);
    expect(world.actions.filter((item) => item.pose === 'sleep')).toHaveLength(2);
  });

  it('selects a stage action without immediately repeating the current one', () => {
    const actions = productionAssistantScene('assets', 'running').actions;
    const beat = selectProductionAssistantBeat(actions, actions[0]!.id, () => 0);

    expect(actions).toContain(beat.action);
    expect(beat.action.id).not.toBe(actions[0]!.id);
  });

  it('uses an exact lower-than-two-percent Easter-egg threshold', () => {
    const actions = productionAssistantScene('brief', 'running').actions;
    const eggRolls = [PRODUCTION_ASSISTANT_EASTER_EGG_CHANCE - Number.EPSILON, 0.4, 0.9];
    const ordinaryRolls = [PRODUCTION_ASSISTANT_EASTER_EGG_CHANCE, 0.4, 0.9];
    const egg = selectProductionAssistantBeat(actions, null, () => eggRolls.shift() ?? 0.5);
    const ordinary = selectProductionAssistantBeat(actions, null, () => ordinaryRolls.shift() ?? 0.5);

    expect(egg.easterEgg).not.toBeNull();
    expect(ordinary.easterEgg).toBeNull();
  });

  it('keeps the Easter-egg roll independent from action selection', () => {
    const actions = productionAssistantScene('verify', 'running').actions;
    const eggRolls = [0.01, 0.72, 0.1];
    const ordinaryRolls = [0.5, 0.72, 0.9];
    const egg = selectProductionAssistantBeat(actions, null, () => eggRolls.shift() ?? 0.5);
    const ordinary = selectProductionAssistantBeat(actions, null, () => ordinaryRolls.shift() ?? 0.5);

    expect(egg.action.id).toBe(ordinary.action.id);
    expect(egg.easterEgg).not.toBeNull();
    expect(ordinary.easterEgg).toBeNull();
  });

  it('keeps random action pauses inside the intended calm interval', () => {
    expect(productionAssistantActionDelay(() => 0)).toBe(3_800);
    expect(productionAssistantActionDelay(() => 0.999_999)).toBeLessThan(7_000);
    expect(productionAssistantActionDelay(() => Number.NaN)).toBe(5_400);
  });

  it('always turns a moonwalk Easter egg into movement while sleep stays put', () => {
    const actions = productionAssistantScene('world', 'running').actions;
    const working = actions.find((item) => item.pose !== 'sleep')!;
    const sleeping = actions.find((item) => item.pose === 'sleep')!;
    const moonwalk = {
      id: 'moonwalk',
      label: '彩蛋：Noobi 突然开始月球漫步',
    } as const;

    expect(shouldProductionAssistantRoam('running', working, moonwalk, () => 0.99)).toBe(true);
    expect(shouldProductionAssistantRoam('running', sleeping, moonwalk, () => 0.99)).toBe(true);
    expect(shouldProductionAssistantRoam('running', sleeping, null, () => 0)).toBe(false);
    expect(shouldProductionAssistantRoam('waiting', working, moonwalk, () => 0)).toBe(false);
  });

  it('keeps free roaming on authored walkable points around the current landmark', () => {
    const world = productionAssistantScene('world', 'running');
    const destination = selectProductionAssistantRoamPoint(
      world,
      world.roamPoints[0]!.x,
      world.roamPoints[0]!.y,
      () => 0,
    );

    expect(world.roamPoints).toContain(destination);
    expect(destination).not.toBe(world.roamPoints[0]);
  });
});
