/**
 * Scenes - Level scene classes for platformer games
 *
 * This module provides:
 * - BaseLevelScene: Foundation for level scenes with Template Method + Hooks
 * - CharacterSelectScene: Character selection screen with registry storage
 * - Template files for Agent to copy
 *
 * Usage:
 *   // Copy _TemplateLevel.ts and rename to create your level scene
 */

export { BaseLevelScene } from './BaseLevelScene';
export type { PlayerClassMap } from './BaseLevelScene';
export { CharacterSelectScene } from './CharacterSelectScene';
export type { CharacterData } from './CharacterSelectScene';

// Templates are not exported - they are meant to be copied and renamed
