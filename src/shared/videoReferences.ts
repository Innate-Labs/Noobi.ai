export const VIDEO_PURPOSES = ['gameplay', 'style', 'layout', 'ui'] as const;
export type VideoPurpose = typeof VIDEO_PURPOSES[number];
export interface VideoSource { id: string; name: string; sha256: string; size: number; duration: number; width: number; height: number; codec: string; previewUrl: string }
export interface VideoFrame { id: string; referenceId: string; time: number; sha256: string; thumbnail: string; reason: 'overview' | 'change' | 'motion' }
export interface VideoClip { id: string; source: VideoSource; start: number; end: number; frames: VideoFrame[]; boundaries: number[]; processorVersion: string; limitations: string[] }
export interface VideoSelection { clipId: string; purpose: VideoPurpose }
export interface VideoSpec {
  events: Array<{ start: number; end: number; frameIds: string[]; observation: string; kind: 'play' | 'cut' | 'replay' | 'cutscene' | 'uncertain' }>;
  rules: Array<{ text: string; basis: 'visible' | 'hypothesis'; frameIds: string[] }>;
  unknowns: string[];
  adaptation: string;
}
export interface PrepareVideoInput { sourceId: string; start: number; end: number; requestId: string }
export interface SaveVideoSpecInput { draftId: string; versionId: string; spec: VideoSpec }
