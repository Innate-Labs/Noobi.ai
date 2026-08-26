import type { ImageGenerationGate } from '../shared/contracts.js';
import type { ImageGenerationVerification } from './imageGenerationAttestation.js';

/** Maps only host-private verification output into the Renderer-facing gate. */
export function imageGenerationGateFromVerification(
  verification: ImageGenerationVerification,
): ImageGenerationGate {
  if (verification.ok) {
    return {
      state: 'trusted-referenced',
      relativePaths: [verification.asset.relativePath],
    };
  }
  if (verification.reason === 'missing-production-reference') {
    return {
      state: 'trusted-unreferenced',
      relativePaths: [...verification.candidatePaths],
    };
  }
  return { state: 'missing', relativePaths: [] };
}
