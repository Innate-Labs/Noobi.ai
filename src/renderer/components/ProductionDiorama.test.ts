import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  configuredProductionCrewMembers,
  noobiGroundShadowProfile,
  ProductionDiorama,
} from './ProductionDiorama';

describe('Noobi ground shadow profiles', () => {
  it('uses a slightly wider shadow while the actor is walking', () => {
    expect(noobiGroundShadowProfile('walk', 'walking')).toBe('walking');
    expect(noobiGroundShadowProfile('carry', 'walking')).toBe('walking');
  });

  it('uses a wide, flat contact shadow for the horizontal sleep pose', () => {
    expect(noobiGroundShadowProfile('sleep', 'acting')).toBe('sleeping');
  });

  it('keeps every other action on a stable standing shadow', () => {
    expect(noobiGroundShadowProfile('idle', 'acting')).toBe('standing');
    expect(noobiGroundShadowProfile('paint', 'acting')).toBe('standing');
    expect(noobiGroundShadowProfile('celebrate', 'acting')).toBe('standing');
  });

  it('renders four independently identified crew members in crew mode with one primary shadow', () => {
    const markup = renderToStaticMarkup(createElement(ProductionDiorama, {
      stage: 'code',
      status: 'running',
      stageMode: 'crew',
      packId: 'classic',
    }));

    expect(markup.match(/data-crew-role=/gu)).toHaveLength(4);
    expect(markup).toContain('data-scene-mode="collaboration"');
    expect(markup.match(/data-crew-active="true"/gu)).toHaveLength(1);
    expect(markup).toContain('data-active-crew-role="engineer"');
    for (const role of ['planner', 'artist', 'engineer', 'tester']) {
      expect(markup).toContain(`data-crew-role="${role}"`);
    }
    expect(markup.match(/data-noobi-ground-shadow="main"/gu)).toHaveLength(1);
    expect(markup).toContain('data-noobi-ground-shadow="planner"');
    expect(markup).toContain('data-noobi-ground-shadow="artist"');
    expect(markup).toContain('data-noobi-ground-shadow="tester"');
  });

  it('can render a compact two-person crew while retaining the active specialist', () => {
    const markup = renderToStaticMarkup(createElement(ProductionDiorama, {
      stage: 'assets',
      status: 'running',
      stageMode: 'crew',
      packId: 'classic',
      crewSize: 2,
    }));

    expect(markup.match(/data-crew-role=/gu)).toHaveLength(2);
    expect(markup).toContain('data-active-crew-role="artist"');
    expect(markup).toContain('data-crew-role="artist"');
  });

  it('uses one selected character in an independently selected solo scene by default', () => {
    const crew = [
      { packId: 'classic', role: 'planner' },
      { packId: 'twilight', role: 'artist' },
      { packId: 'hellokitty', role: 'engineer' },
      { packId: 'starforge', role: 'tester' },
    ] as const;
    const markup = renderToStaticMarkup(createElement(ProductionDiorama, {
      stage: 'brief',
      status: 'running',
      packId: 'hellokitty',
      soloSceneId: 'starforge',
      crew,
    }));

    expect(markup.match(/data-crew-role=/gu)).toHaveLength(1);
    expect(markup).toContain('data-stage-mode="solo"');
    expect(markup).toContain('data-runtime-scene="starforge"');
    expect(markup).toContain('data-scene-mode="solo"');
    expect(markup).toContain('data-noobi-member-pack="hellokitty"');
    expect(markup).not.toContain('data-noobi-member-pack="twilight"');
    expect(markup).not.toContain('collaboration/scene.png');
  });

  it('renders each configured role with its selected character pack', () => {
    const crew = [
      { packId: 'twilight', role: 'planner' },
      { packId: 'hellokitty', role: 'artist' },
      { packId: 'starforge', role: 'engineer' },
    ] as const;
    const markup = renderToStaticMarkup(createElement(ProductionDiorama, {
      stage: 'code',
      status: 'running',
      stageMode: 'crew',
      crew,
    }));

    expect(markup).toContain('data-crew-size="3"');
    expect(markup).toContain('data-noobi-member-pack="twilight"');
    expect(markup).toContain('data-noobi-member-pack="hellokitty"');
    expect(markup).toContain('data-noobi-member-pack="starforge"');
    expect(markup).not.toContain('data-noobi-member-pack="classic"');
  });

  it('renders the baked fishing runtime scene without duplicate crew or workshop occluders', () => {
    const markup = renderToStaticMarkup(createElement(ProductionDiorama, {
      stage: 'world',
      status: 'running',
      stageMode: 'crew',
      sceneId: 'fishing',
    }));

    expect(markup).toContain('data-runtime-scene="fishing"');
    expect(markup).toContain('data-scene-mode="fishing"');
    expect(markup).toContain('four-ip-fishing.gif');
    expect(markup).toContain('NOOBI WORKING');
    expect(markup).not.toContain('class="workshop-occluder"');
    expect(markup).not.toContain('data-noobi-member-pack=');
    expect(markup).not.toContain('data-crew-role=');
  });

  it('promotes the configured lead when the stage specialist is absent', () => {
    const crew = configuredProductionCrewMembers('code', 'running', [
      { packId: 'twilight', role: 'planner' },
      { packId: 'hellokitty', role: 'artist' },
    ]);

    expect(crew).toHaveLength(2);
    expect(crew.find((member) => member.active)?.role).toBe('planner');
  });
});
