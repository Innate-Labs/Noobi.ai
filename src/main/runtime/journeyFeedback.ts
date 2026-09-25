import type { GameplayExperienceReport } from '../gameplayExperienceEvaluator.js';

/** Compact factual feedback helps the writer distinguish a blocked route from
 * bad input timing without reading hundreds of kilobytes of scene telemetry. */
export function journeyFeedback(report: GameplayExperienceReport) {
  return report.journey.slice(0, 40).map(step => {
    const packet = report.runtimeEvidence?.filter(e => e.stepId === step.id && e.packet?.buildId === report.build?.buildId).at(-1)?.packet;
    return { id: step.id, action: step.action, screenshot: step.screenshotPath,
      failures: step.observations.filter(o => o.status === 'repair').map(o => `${o.description}: ${o.message}`),
      state: packet?.state ?? null, paused: packet?.paused ?? null,
      actors: packet?.nodes.filter(n => /^CharacterBody[23]D$/u.test(String(n.class))).slice(0, 4)
        .map(n => ({ path: n.path, position: n.position, velocity: n.velocity, onFloor: n.onFloor })) ?? [],
    };
  });
}
