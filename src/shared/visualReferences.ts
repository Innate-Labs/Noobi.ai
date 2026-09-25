export const REFERENCE_PURPOSES = ['style', 'character', 'layout', 'ui'] as const;
export type ReferencePurpose = typeof REFERENCE_PURPOSES[number];
export interface VisualReference {
  id: string; name: string; sha256: string; normalizedHash: string;
  width: number; height: number; size: number; thumbnail: string;
}
export interface ReferenceSelection { id: string; purpose: ReferencePurpose }
export interface ReferenceSpec {
  style: string; camera: string; scene: string; ui: string;
  facts: Array<{ referenceId: string; observation: string }>;
  inferences: string[]; unknowns: string[];
}
export interface VisualInputEvidence {
  referenceId: string; sha256: string; normalizedHash: string; purpose: ReferencePurpose;
}
