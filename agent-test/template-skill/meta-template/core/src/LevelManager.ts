/**
 * Level Manager - Manages game level order and navigation
 *
 * USAGE:
 *   1. Add your level scene keys to LEVEL_ORDER array
 *   2. Use getNextLevelScene() to get the next level
 *   3. Use isLastLevel() to check if current is the final level
 *
 * The LEVEL_ORDER array defines the sequence of levels in your game.
 * VictoryUIScene and GameCompleteUIScene use this to determine navigation.
 */
export class LevelManager {
  // ============================================================================
  // LEVEL ORDER CONFIGURATION
  // ============================================================================

  /**
   * TODO-LEVELS: Replace with YOUR scene keys from GDD Section 0 (Architecture).
   * Order matters: first entry = first scene after TitleScreen, last = final scene.
   * Every key here MUST also be registered in main.ts via game.scene.add().
   *
   * @example
   *   // For a ui_heavy game with character select → battle → endings:
   *   static readonly LEVEL_ORDER: string[] = [
   *     "CharacterSelectScene",
   *     "BattleScene",
   *     "VictoryScene",
   *     "DefeatScene",
   *   ];
   */
  static readonly LEVEL_ORDER: string[] = [
    'Level1Scene', // TODO-LEVELS: Replace with your actual scene keys
  ];

  // ============================================================================
  // NAVIGATION METHODS
  // ============================================================================

  /**
   * Get the key of the next level scene
   *
   * @param currentSceneKey - The current level scene key
   * @returns Next level scene key, or null if at last level
   */
  static getNextLevelScene(currentSceneKey: string): string | null {
    const currentIndex = LevelManager.LEVEL_ORDER.indexOf(currentSceneKey);

    // If it's the last level or current level not found, return null
    if (
      currentIndex === -1 ||
      currentIndex >= LevelManager.LEVEL_ORDER.length - 1
    ) {
      return null;
    }

    return LevelManager.LEVEL_ORDER[currentIndex + 1];
  }

  /**
   * Check if the current level is the last level
   *
   * @param currentSceneKey - The current level scene key
   * @returns True if this is the final level
   */
  static isLastLevel(currentSceneKey: string): boolean {
    const currentIndex = LevelManager.LEVEL_ORDER.indexOf(currentSceneKey);
    return currentIndex === LevelManager.LEVEL_ORDER.length - 1;
  }

  /**
   * Get the key of the first level scene
   *
   * @returns First level scene key, or null if no levels defined
   */
  static getFirstLevelScene(): string | null {
    return LevelManager.LEVEL_ORDER.length > 0
      ? LevelManager.LEVEL_ORDER[0]
      : null;
  }

  /**
   * Get the current level index (1-based for display)
   *
   * @param currentSceneKey - The current level scene key
   * @returns Level number (1-based), or 0 if not found
   */
  static getLevelNumber(currentSceneKey: string): number {
    const index = LevelManager.LEVEL_ORDER.indexOf(currentSceneKey);
    return index >= 0 ? index + 1 : 0;
  }

  /**
   * Get total number of levels
   *
   * @returns Total level count
   */
  static getTotalLevels(): number {
    return LevelManager.LEVEL_ORDER.length;
  }

  /**
   * Check if a scene key is a valid level scene
   *
   * @param sceneKey - Scene key to check
   * @returns True if this is a registered level scene
   */
  static isLevelScene(sceneKey: string): boolean {
    return LevelManager.LEVEL_ORDER.includes(sceneKey);
  }
}
