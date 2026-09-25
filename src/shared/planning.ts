import type { GameEngine } from './contracts.js';

export interface PlanRequirement { id: string; text: string }
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
}
export interface PlanVersion {
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
}
export interface GeneratePlansInput {
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
