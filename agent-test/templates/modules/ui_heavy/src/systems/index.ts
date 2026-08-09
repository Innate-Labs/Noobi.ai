/**
 * UI Heavy Systems - Export index
 */
export { TurnManager } from './TurnManager';
export { DialogueManager } from './DialogueManager';
export { GameDataManager } from './GameDataManager';
export { QuizManager } from './QuizManager';
export { ComboManager } from './ComboManager';
export { CardManager } from './CardManager';
export { ChoiceManager } from './ChoiceManager';
export { DualPlayerSystem } from './DualPlayerSystem';

// Types
export type { TurnManagerConfig, PhaseCallback } from './TurnManager';
export type { QuizFilter, QuizStats } from './QuizManager';
export type { ComboTier, ComboManagerConfig } from './ComboManager';
export type { EndingRule } from './GameDataManager';
export type {
  DualPlayerMode,
  DualPlayerConfig,
  DualPlayerSystemConfig,
  PlayerKeyConfig,
  RoundResult,
} from './DualPlayerSystem';
