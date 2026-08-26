import { describe, expect, it } from 'vitest';

import { imageGenerationGateFromVerification } from './imageGenerationGate.js';

describe('imageGenerationGateFromVerification', () => {
  it('exposes a referenced path only after private verification succeeds', () => {
    expect(imageGenerationGateFromVerification({
      ok: true,
      asset: {
        relativePath: 'public/assets/images/hero.png',
        sha256: 'a'.repeat(64),
        provider: 'api:openai-image:provider-1',
      },
      referencedBy: 'src/game.ts',
    })).toEqual({
      state: 'trusted-referenced',
      relativePaths: ['public/assets/images/hero.png'],
    });
  });

  it('preserves only privately attested candidates when production use is missing', () => {
    expect(imageGenerationGateFromVerification({
      ok: false,
      reason: 'missing-production-reference',
      candidatePaths: [
        'public/assets/images/hero.png',
        'public/assets/images/world.webp',
      ],
    })).toEqual({
      state: 'trusted-unreferenced',
      relativePaths: [
        'public/assets/images/hero.png',
        'public/assets/images/world.webp',
      ],
    });
  });

  it.each(['missing-attestation', 'asset-mismatch'] as const)(
    'does not expose manifest claims for %s',
    (reason) => {
      expect(imageGenerationGateFromVerification({ ok: false, reason })).toEqual({
        state: 'missing',
        relativePaths: [],
      });
    },
  );
});
