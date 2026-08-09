/**
 * ============================================================================
 * CARD MANAGER - Deck & hand lifecycle management
 * ============================================================================
 *
 * Manages the card game lifecycle: deck construction, shuffling,
 * drawing, hand management, and discarding.
 *
 * This is a LOGIC-ONLY system. The Card UI component handles rendering.
 *
 * EVENTS (via Phaser.Events.EventEmitter):
 *   - 'cardDrawn': (card) => void
 *   - 'cardDiscarded': (card) => void
 *   - 'cardPlayed': (card) => void
 *   - 'handUpdated': (hand[]) => void
 *   - 'deckEmpty': () => void
 *   - 'deckShuffled': () => void
 *
 * USAGE:
 *   const cm = new CardManager(scene);
 *   cm.initDeck(cardConfigs);
 *   cm.shuffle();
 *   cm.drawToHand(3);
 *   const card = cm.getHand()[0];
 *   cm.playCard(card);
 */

import Phaser from 'phaser';
import { type CardConfig } from '../scenes/BaseBattleScene';

export class CardManager extends Phaser.Events.EventEmitter {
  private scene: Phaser.Scene;
  private deck: CardConfig[] = [];
  private hand: CardConfig[] = [];
  private discardPile: CardConfig[] = [];
  private playedThisTurn: CardConfig[] = [];
  private maxHandSize: number;

  constructor(scene: Phaser.Scene, maxHandSize: number = 5) {
    super();
    this.scene = scene;
    this.maxHandSize = maxHandSize;
  }

  // -- Deck Setup --

  /** Initialize the deck with card configurations. */
  initDeck(cards: CardConfig[]): void {
    this.deck = [...cards];
  }

  /** Shuffle the deck. */
  shuffle(): void {
    Phaser.Utils.Array.Shuffle(this.deck);
    this.emit('deckShuffled');
  }

  // -- Draw & Discard --

  /** Draw cards from deck into hand (up to maxHandSize). */
  drawToHand(count: number): CardConfig[] {
    const drawn: CardConfig[] = [];
    for (let i = 0; i < count && this.hand.length < this.maxHandSize; i++) {
      if (this.deck.length === 0) {
        this.reshuffleDiscard();
        if (this.deck.length === 0) {
          this.emit('deckEmpty');
          break;
        }
      }
      const card = this.deck.pop()!;
      this.hand.push(card);
      drawn.push(card);
      this.emit('cardDrawn', card);
    }
    this.emit('handUpdated', [...this.hand]);
    return drawn;
  }

  /** Play a card from hand (removes it). */
  playCard(card: CardConfig): boolean {
    const index = this.hand.findIndex((c) => c.id === card.id);
    if (index === -1) return false;
    this.hand.splice(index, 1);
    this.playedThisTurn.push(card);
    this.emit('cardPlayed', card);
    this.emit('handUpdated', [...this.hand]);
    return true;
  }

  /** Discard a card from hand. */
  discardFromHand(card: CardConfig): boolean {
    const index = this.hand.findIndex((c) => c.id === card.id);
    if (index === -1) return false;
    this.hand.splice(index, 1);
    this.discardPile.push(card);
    this.emit('cardDiscarded', card);
    this.emit('handUpdated', [...this.hand]);
    return true;
  }

  /** Discard entire hand. */
  discardHand(): void {
    this.discardPile.push(...this.hand);
    this.hand = [];
    this.emit('handUpdated', []);
  }

  /** End turn: move played cards to discard. */
  endTurn(): void {
    this.discardPile.push(...this.playedThisTurn);
    this.playedThisTurn = [];
  }

  // -- Query --

  getHand(): CardConfig[] {
    return [...this.hand];
  }
  getDeckSize(): number {
    return this.deck.length;
  }
  getDiscardSize(): number {
    return this.discardPile.length;
  }

  // -- Internal --

  /** Reshuffle discard pile back into deck. */
  private reshuffleDiscard(): void {
    this.deck = [...this.discardPile];
    this.discardPile = [];
    this.shuffle();
  }
}
