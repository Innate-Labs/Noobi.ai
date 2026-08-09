import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CapabilityIcon } from '../src/renderer/components/CapabilityIcon.js';
import { gameMcpCatalog } from '../src/renderer/gameMcpCatalog.js';
import { gameSkillCatalog } from '../src/renderer/gameSkillCatalog.js';

describe('capability icons', () => {
  it('renders every catalog icon locally with an accessible decorative shell', () => {
    const entries = [
      ...gameSkillCatalog.map((item) => ({ kind: 'skill' as const, item })),
      ...gameMcpCatalog.map((item) => ({ kind: 'mcp' as const, item })),
    ];

    for (const { kind, item } of entries) {
      const markup = renderToStaticMarkup(
        <CapabilityIcon kind={kind} id={item.id} />,
      );
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).toContain('<svg');
      expect(markup).not.toContain('<img');
      expect(markup).not.toMatch(/(?:src|href)="https?:\/\//);
    }
  });

  it('keeps unknown installed capabilities on a visible fallback icon', () => {
    const skill = renderToStaticMarkup(
      <CapabilityIcon kind="skill" id="custom-skill" />,
    );
    const mcp = renderToStaticMarkup(
      <CapabilityIcon kind="mcp" id="custom-mcp" />,
    );
    expect(skill).toContain('icon-tone-neutral');
    expect(mcp).toContain('icon-tone-neutral');
    expect(skill).toContain('<svg');
    expect(mcp).toContain('<svg');
  });
});
