import Phaser from 'phaser';

// ============================================================================
// ECONOMY MANAGER — Manages gold/currency for tower defense
// ============================================================================
// Owned by BaseTDScene. Tracks gold balance, validates purchases.
// Communicates via Phaser.Events.EventEmitter (the scene's event bus).
// ============================================================================

export class EconomyManager {
  private scene: Phaser.Scene;
  private _gold: number;
  private sellRefundRate: number;

  constructor(
    scene: Phaser.Scene,
    startingGold: number,
    sellRefundRate: number = 0.7,
  ) {
    this.scene = scene;
    this._gold = startingGold;
    this.sellRefundRate = sellRefundRate;
  }

  get gold(): number {
    return this._gold;
  }

  canAfford(cost: number): boolean {
    return this._gold >= cost;
  }

  /**
   * Spend gold. Returns true if successful, false if insufficient funds.
   */
  spend(amount: number): boolean {
    if (amount <= 0) return true;
    if (this._gold < amount) return false;
    const oldGold = this._gold;
    this._gold -= amount;
    this.scene.events.emit('goldChanged', oldGold, this._gold);
    return true;
  }

  /**
   * Add gold (enemy kill reward, wave bonus, etc.)
   */
  earn(amount: number): void {
    if (amount <= 0) return;
    const oldGold = this._gold;
    this._gold += amount;
    this.scene.events.emit('goldChanged', oldGold, this._gold);
  }

  /**
   * Calculate sell refund for a tower.
   * Accounts for base cost + upgrade costs invested.
   */
  getSellValue(totalInvested: number): number {
    return Math.floor(totalInvested * this.sellRefundRate);
  }

  /**
   * Process a tower sell: add refund gold.
   */
  sellTower(totalInvested: number): number {
    const refund = this.getSellValue(totalInvested);
    this.earn(refund);
    return refund;
  }

  destroy(): void {
    // no-op — cleanup hook
  }
}
