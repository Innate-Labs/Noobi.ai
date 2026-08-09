import { describe, expect, it } from 'vitest';
import { hasCapabilityIcon } from '../src/renderer/components/CapabilityIcon.js';
import { gameSkillCatalog } from '../src/renderer/gameSkillCatalog.js';

describe('curated game Skill catalog', () => {
  it('contains unique, pinned, HTTPS-installable Skill sources', () => {
    expect(gameSkillCatalog.length).toBeGreaterThanOrEqual(10);
    expect(new Set(gameSkillCatalog.map((item) => item.id)).size).toBe(
      gameSkillCatalog.length,
    );

    for (const item of gameSkillCatalog) {
      expect(item.repository).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(item.ref).toBeTruthy();
      expect(item.path).not.toMatch(/^\/|(^|\/)\.\.(\/|$)/);
      expect(item.description.length).toBeGreaterThanOrEqual(30);
      expect(item.license).toBeTruthy();
      expect(hasCapabilityIcon('skill', item.id)).toBe(true);
    }
  });

  it('keeps official trust labels limited to engine publishers', () => {
    const officialPublishers = new Set(['Unity Technologies', 'Epic Games']);
    for (const item of gameSkillCatalog) {
      if (item.trust === 'official') {
        expect(officialPublishers.has(item.publisher)).toBe(true);
      }
    }
  });
});
