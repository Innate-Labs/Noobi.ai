/**
 * ============================================================================
 * CHOICE MANAGER - Branching choice logic with consequences
 * ============================================================================
 *
 * Manages player choices and their effects on game state.
 * Works with GameDataManager to apply effects and track history.
 * Works with DialogueManager to handle choice points in dialogue.
 *
 * EVENTS:
 *   - 'choicePresented': (choiceId, prompt, options[]) => void
 *   - 'choiceSelected': (choiceId, option, effects) => void
 *   - 'effectsApplied': (choiceId, effects) => void
 *
 * USAGE:
 *   const cm = new ChoiceManager(gameDataManager);
 *   cm.presentChoice('greeting', 'How do you respond?', [
 *     { text: 'Hello!', effects: { friendship: +1 } },
 *     { text: 'Go away.', effects: { friendship: -2, hostility: +1 } },
 *   ]);
 *   // When player selects:
 *   cm.selectOption('greeting', 0);  // applies effects to GameDataManager
 */

import Phaser from 'phaser';
import { type ChoiceOption } from '../scenes/BaseChapterScene';
import { type GameDataManager } from './GameDataManager';

export class ChoiceManager extends Phaser.Events.EventEmitter {
  private gameData: GameDataManager;
  private activeChoices: Map<string, ChoiceOption[]> = new Map();

  constructor(gameData: GameDataManager) {
    super();
    this.gameData = gameData;
  }

  /**
   * Present a choice to the player.
   * Filters options by their condition (if any).
   */
  presentChoice(
    choiceId: string,
    prompt: string,
    options: ChoiceOption[],
  ): ChoiceOption[] {
    // Filter by conditions, store active choice, emit event (includes prompt)
    const visible = options.filter((o) => !o.condition || o.condition());
    this.activeChoices.set(choiceId, visible);
    this.emit('choicePresented', choiceId, prompt, visible);
    return visible;
  }

  /**
   * Player selects an option.
   * Applies effects to GameDataManager and records in choice history.
   */
  selectOption(
    choiceId: string,
    optionIndex: number,
  ): ChoiceOption | undefined {
    const options = this.activeChoices.get(choiceId);
    if (!options || optionIndex < 0 || optionIndex >= options.length)
      return undefined;

    const selected = options[optionIndex];

    // Apply effects
    if (selected.effects) {
      for (const [key, value] of Object.entries(selected.effects)) {
        this.gameData.addTo(key, value);
      }
      this.emit('effectsApplied', choiceId, selected.effects);
    }

    // Record choice
    this.gameData.recordChoice(choiceId, selected.text);

    // Cleanup
    this.activeChoices.delete(choiceId);
    this.emit('choiceSelected', choiceId, selected, selected.effects);

    return selected;
  }

  /** Check if a choice is currently active (waiting for input). */
  isChoiceActive(choiceId: string): boolean {
    return this.activeChoices.has(choiceId);
  }

  /** Check if ANY choice is currently active. */
  hasActiveChoice(): boolean {
    return this.activeChoices.size > 0;
  }
}
