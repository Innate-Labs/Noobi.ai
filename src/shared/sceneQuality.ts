export interface SceneQualitySummary {
  version: 1;
  buildId: string;
  sourceHash: string;
  artifactHash: string;
  status: 'pass' | 'repair';
  checkedAt: string;
  scope: string;
  observedGeometry: number;
  coveredGeometry: number;
  proceduralGeometry: number;
  findings: string[];
  reviewRequired: string[];
  reportPath: string;
}
