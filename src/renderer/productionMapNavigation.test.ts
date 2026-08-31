import { describe, expect, it } from 'vitest';

import {
  WORKSHOP_NAVIGATION_NODES,
  findProductionAssistantPath,
  isProductionAssistantFootprintBlocked,
  isProductionAssistantSegmentWalkable,
  isProductionPointBlocked,
  productionNavigationNode,
  validateProductionNavigationGraph,
} from './productionMapNavigation';

const MAIN_STATIONS = [
  'brief-main',
  'design-main',
  'assembly-main',
  'asset-main',
  'code-main',
  'world-main',
  'arcade-main',
  'delivery-main',
] as const;

describe('production workshop navigation', () => {
  it('keeps the authored graph internally consistent and collision free', () => {
    expect(validateProductionNavigationGraph()).toEqual([]);
  });

  it('places every navigation node on walkable map space', () => {
    const ids = WORKSHOP_NAVIGATION_NODES.map((candidate) => candidate.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const candidate of WORKSHOP_NAVIGATION_NODES) {
      expect(candidate.x).toBeGreaterThanOrEqual(0);
      expect(candidate.x).toBeLessThanOrEqual(100);
      expect(candidate.y).toBeGreaterThanOrEqual(0);
      expect(candidate.y).toBeLessThanOrEqual(100);
      expect(isProductionPointBlocked(candidate), candidate.id).toBe(false);
      expect(isProductionAssistantFootprintBlocked(candidate), candidate.id).toBe(false);
    }
  });

  it('uses only bidirectional, walkable graph edges', () => {
    for (const candidate of WORKSHOP_NAVIGATION_NODES) {
      expect(new Set(candidate.neighbors).size, candidate.id).toBe(candidate.neighbors.length);
      for (const neighborId of candidate.neighbors) {
        const neighbor = productionNavigationNode(neighborId);

        expect(neighbor.neighbors, `${candidate.id} -> ${neighborId}`).toContain(candidate.id);
        expect(
          isProductionAssistantSegmentWalkable(candidate, neighbor),
          `${candidate.id} -> ${neighborId}`,
        ).toBe(true);
      }
    }
  });

  it('can route between every pair of main workstations', () => {
    for (const fromId of MAIN_STATIONS) {
      for (const toId of MAIN_STATIONS) {
        const path = findProductionAssistantPath(fromId, toId);

        expect(path, `${fromId} -> ${toId}`).not.toBeNull();
        expect(path?.[0]).toBe(fromId);
        expect(path?.at(-1)).toBe(toId);
        for (let index = 1; index < (path?.length ?? 0); index += 1) {
          const from = productionNavigationNode(path![index - 1]!);
          const to = productionNavigationNode(path![index]!);
          expect(from.neighbors).toContain(to.id);
          expect(isProductionAssistantSegmentWalkable(from, to)).toBe(true);
        }
      }
    }
  });

  it('reserves the full foot envelope beside furniture instead of allowing edge slicing', () => {
    expect(isProductionPointBlocked({ x: 22.5, y: 61 })).toBe(false);
    expect(isProductionAssistantFootprintBlocked({ x: 22.5, y: 61 })).toBe(true);
    expect(isProductionAssistantFootprintBlocked(productionNavigationNode('code-main'))).toBe(false);
    expect(isProductionAssistantFootprintBlocked(productionNavigationNode('arcade-main'))).toBe(false);
  });

  it('returns a stable local path and rejects unknown endpoints', () => {
    expect(findProductionAssistantPath('world-main', 'world-main')).toEqual(['world-main']);
    expect(findProductionAssistantPath('missing', 'brief-main')).toBeNull();
    expect(findProductionAssistantPath('brief-main', 'missing')).toBeNull();
  });
});
