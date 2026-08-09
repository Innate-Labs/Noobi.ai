/**
 * UI Heavy Scenes - Export index
 */
export { BaseChapterScene } from './BaseChapterScene';
export { BaseBattleScene } from './BaseBattleScene';
export { BaseEndingScene } from './BaseEndingScene';
export { BaseCharacterSelectScene } from './BaseCharacterSelectScene';
export { ChapterSelectScene } from './ChapterSelectScene';

// Types
export type {
  DialogueEntry,
  ChoiceOption,
  ChapterCharacterConfig,
} from './BaseChapterScene';
export type {
  CardConfig,
  QuizQuestion,
  EnemyBattleConfig,
  BattlePhase,
  CardType,
} from './BaseBattleScene';
export type { EndingData, EndingType } from './BaseEndingScene';
export type {
  SelectableCharacter,
  GridConfig,
} from './BaseCharacterSelectScene';
export type { ChapterInfo } from './ChapterSelectScene';
