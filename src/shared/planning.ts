import type { GameEngine } from './contracts.js';
import type { ReferenceSelection, ReferenceSpec, VisualInputEvidence } from './visualReferences.js';

export interface PlanRequirement { id: string; text: string; source?: 'request' | 'revision' | 'import' }
export interface PlanDesign { camera: string; regions: string; characters: string; style: string; budget: string }
export const PLAN_EDITABLE_FIELDS = ['title', 'approach', 'engine', 'dimension', 'platform', 'coreLoop', 'features', 'assumptions', 'exclusions', 'design'] as const;
export type PlanEditableField = typeof PLAN_EDITABLE_FIELDS[number];
export interface PlanFieldLock { optionId: string; field: PlanEditableField }
export interface PlanChangeImpact { scope: string[]; systems: string[]; saveCompatibility: string; regression: string[] }
export interface PlanOption {
  id: string;
  title: string;
  approach: string;
  engine: GameEngine;
  dimension: '2d' | '3d';
  platform: 'desktop' | 'web';
  coreLoop: string[];
  features: string[];
  assumptions: string[];
  exclusions: string[];
  requirementIds: string[];
  estimate: { timeRange: null; costRange: null; basis: string };
  design?: PlanDesign;
}
export interface PlanVersion {
  referenceSpec?: ReferenceSpec;
  referenceSpecAuthor?: 'model' | 'user';
  visualInputs?: VisualInputEvidence[];
  id: string;
  number: number;
  createdAt: string;
  requirements: PlanRequirement[];
  options: PlanOption[];
  model: string | null;
  threadId: string;
  turnId: string;
  analysisDurationMs: number;
  analysisUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  authoredBy?: 'model' | 'user';
  requiresReview?: boolean;
  changes?: string[];
  sourceHash?: string;
  impact?: PlanChangeImpact;
}
export interface PlanRun {
  id: string;
  versionId: string;
  optionId: string;
  status: 'starting' | 'dispatched' | 'interrupted' | 'failed';
  projectId: string | null;
  prompt: string;
  createdAt: string;
  error: string | null;
  resumeAttempts?: PlanResumeAttempt[];
}
export interface PlanResumeAttempt {
  id: string;
  createdAt: string;
  status: 'starting' | 'dispatched' | 'failed' | 'interrupted';
  error: string | null;
  model: string | null;
  effort: string | null;
}
export interface ResumeProjectInput {
  projectId: string;
  runId: string;
  requestId: string;
  model?: string | null;
  effort?: string | null;
}

/** Use selection time, not draft creation/analysis time. Never fall back past a newer failed selection. */
export function latestProjectPlan(drafts: readonly PlanDraft[], projectId: string): PlanDraft | null {
  return drafts.filter(draft => draft.run?.projectId === projectId)
    .reduce<PlanDraft | null>((latest, draft) => !latest || draft.run!.createdAt >= latest.run!.createdAt ? draft : latest, null);
}
export interface PlanAnalysisAttempt {
  id: string;
  startedAt: string;
  durationMs: number | null;
  usage: PlanVersion['analysisUsage'];
  status: 'generating' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
}
export interface PlanDraft {
  references?: ReferenceSelection[];
  referenceSpecOverride?: ReferenceSpec;
  id: string;
  projectId: string | null;
  request: string;
  attachmentCount: number;
  model: string | null;
  effort: string | null;
  status: 'generating' | 'ready' | 'failed' | 'cancelled';
  attemptId: string;
  analysisAttempts: PlanAnalysisAttempt[];
  updatedAt: string;
  error: string | null;
  version: PlanVersion | null;
  run: PlanRun | null;
  history?: PlanVersion[];
  locks?: PlanFieldLock[];
  revisionRequest?: string;
  importedPlan?: string;
  mergeOptionId?: string;
}
export interface GeneratePlansInput {
  references?: ReferenceSelection[];
  referenceSpecOverride?: ReferenceSpec;
  request: string;
  attachmentCount?: number;
  projectId?: string | null;
  model?: string | null;
  effort?: string | null;
}
export interface StartPlanInput {
  draftId: string;
  versionId: string;
  optionId: string;
  projectDirectory?: string;
}
export interface SavePlanEditsInput {
  draftId: string;
  versionId: string;
  option: PlanOption;
  locks: PlanFieldLock[];
}
export interface RevisePlansInput {
  draftId: string;
  versionId: string;
  instruction: string;
  importedPlan?: string;
  mergeOptionId?: string;
}
export interface SaveReferenceSpecInput { draftId: string; versionId: string; spec: ReferenceSpec }
