/**
 * ============================================================================
 * DIALOGUE MANAGER - Event-driven dialogue sequence engine
 * ============================================================================
 *
 * Controls the flow of dialogue sequences via EVENTS. This is a LOGIC-ONLY
 * system that emits events for UI components to listen to.
 *
 * NOTE: BaseChapterScene has a built-in dialogue engine with template-method
 * hooks. Use DialogueManager only if you need a STANDALONE, event-driven
 * dialogue system (e.g., dialogue inside a battle scene, or a custom scene
 * that does not extend BaseChapterScene).
 *
 * EVENTS (via Phaser.Events.EventEmitter):
 *   - 'showText': (speaker: string, text: string, expression?: string) => void
 *   - 'showChoice': (choiceId: string, prompt: string, options: ChoiceOption[]) => void
 *   - 'characterAction': (characterId: string, action: string, position?: string) => void
 *   - 'triggerEvent': (action: string, data?: Record<string, any>) => void
 *   - 'dialogueComplete': () => void
 *   - 'waitingForInput': () => void
 *
 * USAGE:
 *   const dm = new DialogueManager(scene);
 *   dm.loadDialogues(dialogueEntries);
 *   dm.on('showText', (speaker, text, expr) => dialogueBox.showText(speaker, text));
 *   dm.on('showChoice', (id, prompt, opts) => choicePanel.showChoices(prompt, opts));
 *   dm.on('characterAction', (id, action, pos) => portrait.handleAction(id, action, pos));
 *   dm.on('waitingForInput', () => { // show continue indicator });
 *   dm.start();
 *   // On player click/enter: dm.advance();
 *   // On choice selected: dm.selectChoice(optionIndex);
 */

import Phaser from 'phaser';
import { type DialogueEntry } from '../scenes/BaseChapterScene';

export class DialogueManager extends Phaser.Events.EventEmitter {
  private scene: Phaser.Scene;
  private dialogues: DialogueEntry[] = [];
  private currentIndex: number = 0;
  private isPlaying: boolean = false;
  private isWaitingForInput: boolean = false;
  private isChoiceActive: boolean = false;
  /** Guard: true while a delayed auto-advance is pending (character/wait entries). */
  private isAutoAdvancing: boolean = false;

  constructor(scene: Phaser.Scene) {
    super();
    this.scene = scene;
  }

  // -- Control --

  /** Load a sequence of dialogue entries (makes a shallow copy to avoid mutation of caller's array). */
  loadDialogues(dialogues: DialogueEntry[]): void {
    this.dialogues = [...dialogues];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isWaitingForInput = false;
    this.isChoiceActive = false;
    this.isAutoAdvancing = false;
  }

  /** Start playing from the beginning or a specific index. */
  start(fromIndex?: number): void {
    if (this.dialogues.length === 0) {
      this.emit('dialogueComplete');
      return;
    }
    this.currentIndex = fromIndex ?? 0;
    this.isPlaying = true;
    this.processEntry(this.dialogues[this.currentIndex]);
  }

  /** Advance to the next entry (called on player click/enter). */
  advance(): void {
    // Block manual advance while a delayed auto-advance is pending
    // (character enter animation, wait timer) to prevent double-advance.
    if (!this.isPlaying || this.isChoiceActive || this.isAutoAdvancing) return;

    this.isWaitingForInput = false;
    this.currentIndex++;
    if (this.currentIndex >= this.dialogues.length) {
      this.isPlaying = false;
      this.emit('dialogueComplete');
      return;
    }
    this.processEntry(this.dialogues[this.currentIndex]);
  }

  /** Select a choice option (called when player clicks a choice). */
  selectChoice(optionIndex: number): void {
    if (!this.isChoiceActive) return;
    const entry = this.dialogues[this.currentIndex];
    if (!entry || entry.type !== 'choice' || !entry.options) return;

    // Filter to visible options
    const visible = (entry.options ?? []).filter(
      (opt) => !opt.condition || opt.condition(),
    );
    const selected = visible[optionIndex];
    if (!selected) return;

    this.isChoiceActive = false;
    this.emit('choiceSelected', entry.id ?? '', selected, optionIndex);

    // Auto-advance past choice
    this.advance();
  }

  /** Skip all remaining dialogue (for skip button). */
  skipAll(): void {
    this.isPlaying = false;
    this.isWaitingForInput = false;
    this.isChoiceActive = false;
    this.currentIndex = this.dialogues.length;
    this.emit('dialogueComplete');
  }

  // -- Query --

  isActive(): boolean {
    return this.isPlaying;
  }

  getCurrentEntry(): DialogueEntry | undefined {
    return this.dialogues[this.currentIndex];
  }

  getProgress(): number {
    return this.dialogues.length > 0
      ? this.currentIndex / this.dialogues.length
      : 0;
  }

  isWaiting(): boolean {
    return this.isWaitingForInput;
  }

  // -- Internal --

  private processEntry(entry: DialogueEntry): void {
    switch (entry.type) {
      case 'text':
        this.processTextEntry(entry);
        break;
      case 'choice':
        this.processChoiceEntry(entry);
        break;
      case 'event':
        this.processEventEntry(entry);
        break;
      case 'character':
        this.processCharacterEntry(entry);
        break;
      case 'branch':
        this.processBranchEntry(entry);
        break;
      case 'wait':
        this.processWaitEntry(entry);
        break;
      default:
        this.advance();
        break;
    }
  }

  private processTextEntry(entry: DialogueEntry): void {
    this.isWaitingForInput = true;
    this.emit(
      'showText',
      entry.speaker ?? '',
      entry.text ?? '',
      entry.expression,
    );
    this.emit('waitingForInput');
  }

  private processChoiceEntry(entry: DialogueEntry): void {
    const visible = (entry.options ?? []).filter(
      (opt) => !opt.condition || opt.condition(),
    );
    // Guard: if all choices are filtered out, skip past to prevent softlock
    if (visible.length === 0) {
      this.advance();
      return;
    }
    this.isChoiceActive = true;
    this.emit('showChoice', entry.id ?? '', entry.prompt ?? '', visible);
  }

  private processEventEntry(entry: DialogueEntry): void {
    this.emit('triggerEvent', entry.action ?? '', entry.data);
    // Auto-advance past events
    this.advance();
  }

  private processCharacterEntry(entry: DialogueEntry): void {
    this.emit(
      'characterAction',
      entry.characterId ?? '',
      entry.action ?? '',
      entry.position,
    );
    // Auto-advance past character actions (with small delay for animation).
    // Set guard flag to prevent manual advance() from racing with this timer.
    this.isAutoAdvancing = true;
    const delay = entry.action === 'enter' ? 300 : 50;
    this.scene.time.delayedCall(delay, () => {
      this.isAutoAdvancing = false;
      this.advance();
    });
  }

  private processBranchEntry(entry: DialogueEntry): void {
    const result = entry.condition?.() ?? true;
    const branch = result ? entry.trueBranch : entry.falseBranch;
    if (branch && branch.length > 0) {
      // Splice branch dialogues after current entry
      this.dialogues.splice(this.currentIndex + 1, 0, ...branch);
    }
    this.advance();
  }

  private processWaitEntry(entry: DialogueEntry): void {
    // Set guard flag to prevent manual advance() from racing with this timer.
    this.isAutoAdvancing = true;
    this.scene.time.delayedCall(entry.duration ?? 1000, () => {
      this.isAutoAdvancing = false;
      this.advance();
    });
  }
}
