import { describe, expect, it } from 'vitest';
import { journeyFeedback } from './journeyFeedback.js';
import type { GameplayExperienceReport } from '../gameplayExperienceEvaluator.js';
describe('compact Godot input feedback', () => {
  it('uses the same-build final sample and retains failed expectations', () => {
    const report = { build: { buildId: 'current' }, journey: [{ id: 'jump', action: 'primary', screenshotPath: 'jump.png',
      observations: [{ status: 'repair', description: 'Reach ledge', message: 'not reached' }] }],
      runtimeEvidence: [
        { stepId: 'jump', packet: { buildId: 'current', state: { state: 'playing' }, paused: false,
          nodes: [{ class: 'CharacterBody2D', path: 'Player', position: [100, 200], velocity: [0, 0], onFloor: true }] } },
        { stepId: 'jump', packet: { buildId: 'stale', state: { state: 'won' }, nodes: [] } },
      ],
    } as unknown as GameplayExperienceReport;
    expect(journeyFeedback(report)[0]).toMatchObject({ state: { state: 'playing' }, failures: ['Reach ledge: not reached'],
      actors: [{ path: 'Player', position: [100, 200], onFloor: true }] });
    report.runtimeEvidence = [];
    expect(journeyFeedback(report)[0]).toMatchObject({ state: null, actors: [] });
  });
});
