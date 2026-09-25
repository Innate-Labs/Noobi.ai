import type { ProjectRecord } from './contracts.js';
export type GameVersionKind = 'passed' | 'failed' | 'backup' | 'legacy';
export interface GameVersion {
  id: string; projectId: string; createdAt: string; kind: GameVersionKind; title: string;
  planTitle: string | null; summary: string; error: string | null; fileCount: number;
  changes: { added: number; modified: number; removed: number } | null;
  canPreview: boolean; canRestore: boolean;
}
export interface RestoreGameVersionInput { projectId: string; versionId: string; requestId: string }
export interface RestoreGameVersionResult { project: ProjectRecord; backupVersionId: string; sourceVersionId: string }
export interface GameVersionPreview { url: string; version: GameVersion }
