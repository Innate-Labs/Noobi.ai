export interface ProgressionRequirements { quests: string[]; abilities: string[]; items: Record<string, number> }
export interface ProgressionDefinition {
  version: 1; items: Record<string, { max: number }>; abilities: string[]; regions: string[]; start: string; goals: string[]; goalQuests: string[];
  initial: { items: Record<string, number>; abilities: string[] };
  quests: Array<{ id: string; region: string; requires: ProgressionRequirements; reward: { items: Record<string, number>; abilities: string[] } }>;
  links: Array<{ id: string; from: string; to: string; bidirectional: boolean; requires: ProgressionRequirements; consume: Record<string, number> }>;
}
export interface ProgressionState { region: string; inventory: Record<string, number>; abilities: string[]; completed: string[]; opened: string[] }
export type ProgressionAction = { kind: 'quest' | 'travel'; id: string };
