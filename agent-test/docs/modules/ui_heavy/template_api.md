# UI Heavy — Template Capability Reference

> What the template provides: project structure, available systems, UI components, hooks, and operation patterns.
> This document ensures GDD designs stay within template capabilities — no custom code needed.

---

## 1. Project Structure

```
src/
  main.ts              # UPDATE: register scenes via game.scene.add()
  LevelManager.ts      # UPDATE: set LEVEL_ORDER[0] to first game scene
  gameConfig.json      # UPDATE: set battleConfig, dialogueConfig values
  utils.ts             # KEEP (core utilities, never modify)
  scenes/
    Preloader.ts       # KEEP (asset loading)
    TitleScreen.ts     # KEEP (uses LevelManager to navigate to first scene)
    BaseChapterScene.ts    # KEEP (base class for dialogue scenes)
    BaseBattleScene.ts     # KEEP (base class for battle/quiz scenes)
    BaseEndingScene.ts     # KEEP (base class for ending scenes)
    BaseCharacterSelectScene.ts # KEEP (base class for character selection)
    _TemplateCharacterSelect.ts # COPY -> rename for character selection
    _TemplateChapter.ts    # COPY -> rename to your Chapter scene
    _TemplateBattle.ts     # COPY -> rename to your Battle scene
    _TemplateDualBattle.ts # COPY -> rename for PVP battle
    _TemplateEnding.ts     # COPY -> rename to Victory/Defeat scene
  systems/             # KEEP (logic-only managers, no rendering)
  ui/                  # KEEP (UI component library)
```

**TitleScreen** navigates to `LevelManager.LEVEL_ORDER[0]`. Default value is `"Level1Scene"` — this MUST be updated to match the actual first game scene, or the game will crash on start.

---

## 2. Available Systems

| System            | Purpose             | Key Capability                                                                                     |
| ----------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| `TurnManager`     | Phase state machine | Drives turn-based battle flow (INTRO → PLAYER_TURN → QUIZ → FEEDBACK → ACTION → ENEMY → CHECK_END) |
| `DialogueManager` | Dialogue playback   | Sequential dialogue with typewriter, events, branching                                             |
| `GameDataManager` | Persistent state    | Cross-scene data store (singleton), tracks choices                                                 |
| `CardManager`     | Deck lifecycle      | Draw hand, discard, shuffle, track remaining cards                                                 |
| `QuizManager`     | Question handling   | Random selection without repeats, answer checking                                                  |
| `ComboManager`    | Streak tracking     | Multiplier calculation, tier labels (GOOD/GREAT/PERFECT)                                           |
| `ChoiceManager`   | Branch tracking     | Records dialogue choices for conditional branching                                                 |

These systems are **pre-built and managed by base classes**. GDD should reference their capabilities, not design replacements.

---

## 3. Available UI Components

| Component           | Purpose           | Key Behavior                                                         |
| ------------------- | ----------------- | -------------------------------------------------------------------- |
| `DialogueBox`       | Text display      | Typewriter effect, click to advance, speaker name                    |
| `Card`              | Interactive card  | Hover scale, click select, drag support                              |
| `QuizModal`         | Quiz display      | Show question + 4 options, timer bar, emit 'answered' event          |
| `ChoicePanel`       | Dialogue choices  | Button list, emit selection event                                    |
| `CharacterPortrait` | Character image   | Enter/exit animations, expression swap, positioning                  |
| `StatusBar`         | HP/MP bar         | Filled bar with color thresholds, animated value changes             |
| `FloatingText`      | Popup text        | Animated damage/score numbers (static utility method)                |
| `ModalOverlay`      | Overlay base      | Semi-transparent backdrop for modals                                 |
| `TweenPresets`      | Animation helpers | fadeIn, fadeOut, shake, popIn, pulse, slideIn (individual functions) |

These components are **ready to use**. GDD should describe what to display, and the Implementation Roadmap specifies which components to use.

### 3.1 Key Constructor Signatures

```
CharacterPortrait(scene, config: PortraitConfig)
  PortraitConfig = { id, textureKey, displayName, position: 'left'|'center'|'right', expressions?, scale?, bottomOffset? }
  IMPORTANT: Starts INVISIBLE. You MUST call portrait.enter() to show it with slide-in animation.
  CharacterPortrait IS a Phaser.GameObjects.Container — pass it directly to tweens/shake:
    shake(this, portrait, 5, 300);   // CORRECT: portrait IS the display object
    portrait.displayObject            // WRONG: this property does NOT exist!

StatusBar(scene, x, y, config: StatusBarConfig)
  StatusBarConfig = { width, height, maxValue, fillColor, label?, showValue? }
  Call setValue(n) to update. Constructor takes 4 separate arguments (scene, x, y, config).

QuizModal(scene, config: QuizModalConfig)
  QuizModalConfig = { width?, height?, showExplanation?, timerDuration? }
  Create in initializeBattle(). Listen: quizModal.on('answered', (correct, index) => { ... })
  Show: quizModal.showQuestion(question). Internally prevents double-click on answer buttons.
  ALWAYS use QuizModal for quiz/answer display — NEVER build raw answer buttons manually.

FloatingText — STATIC method: FloatingText.show(scene, x, y, text, style?)
```

### 3.2 Config Import Pattern

**CRITICAL**: gameConfig.json must be imported with **default import**, then destructured:

```
import gameConfig from '../gameConfig.json';
const battleConfig = gameConfig.battleConfig ?? {};
const hp = battleConfig.playerMaxHP.value;  // use .value accessor
```

NEVER use named imports like `import { battleConfig } from '../gameConfig.json'` — this causes runtime errors.

---

## 4. Available Hooks

GDD's Implementation Roadmap should reference these hook names to specify game behavior.

### 4.1 Chapter Scene Hooks

| Hook                    | Signature                                            | Purpose                                   |
| ----------------------- | ---------------------------------------------------- | ----------------------------------------- |
| `initializeDialogues`   | `(): DialogueEntry[]`                                | Define dialogue content (REQUIRED)        |
| `createBackground`      | `(): void`                                           | Set scene background image                |
| `createCharacters`      | `(): void`                                           | Register characters with portraits        |
| `createUI`              | `(): void`                                           | Add custom UI elements                    |
| `getBackgroundMusicKey` | `(): string \| undefined`                            | Return scene music key                    |
| `onDialogueEvent`       | `(action: string, data?: Record<string, any>): void` | React to dialogue events (play_sfx, etc.) |
| `onChoiceMade`          | `(choiceId: string, option: ChoiceOption): void`     | React to player choices                   |
| `onChapterComplete`     | `(): void`                                           | Transition to next scene                  |

### 4.2 Battle Scene Hooks

**Setup Hooks:**

| Hook                    | Signature                            | Purpose                                                          |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `initializeBattle`      | `(): void`                           | Set HP values, hand size, configure systems (REQUIRED, abstract) |
| `createBackground`      | `(): void`                           | Battle background                                                |
| `createCombatants`      | `(): void`                           | Player/enemy portrait displays                                   |
| `createHUD`             | `(): void`                           | HP bars, combo counter, round display                            |
| `getCardDeck`           | `(): CardConfig[]`                   | Define available cards                                           |
| `getQuestionBank`       | `(): QuizQuestion[]`                 | Define quiz questions                                            |
| `getEnemyConfig`        | `(): EnemyBattleConfig \| undefined` | Define enemy stats                                               |
| `getBackgroundMusicKey` | `(): string \| undefined`            | Return music audio key                                           |
| `getGameplayHints`      | `(): string[]`                       | Hints shown in top-right panel                                   |

**Turn Flow Hooks:**

| Hook                | Signature                                                                 | Purpose                                                |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `onBattleStart`     | `(): void`                                                                | Intro effects, dialogue                                |
| `onPlayerTurnStart` | `(): void`                                                                | Draw cards, enable input                               |
| `onQuizPhaseStart`  | `(): void`                                                                | Show quiz modal                                        |
| `onQuizAnswered`    | `(correct: boolean, question: QuizQuestion, selectedIndex: number): void` | Update combo, show feedback                            |
| `onEnemyAction`     | `(): void`                                                                | Enemy AI logic per turn                                |
| `executeEnemyTurn`  | `(): void`                                                                | Full enemy turn (call `completeEnemyTurn()` when done) |
| `onBattleEnd`       | `(victory: boolean): void`                                                | Transition to ending scene                             |

**Combat Event Hooks:**

| Hook              | Signature                                      | Purpose                  |
| ----------------- | ---------------------------------------------- | ------------------------ |
| `onPlayerDamaged` | `(damage: number, remainingHP: number): void`  | Shake, flash, update bar |
| `onEnemyDamaged`  | `(damage: number, remainingHP: number): void`  | Shake, damage number     |
| `onComboChanged`  | `(newCombo: number, multiplier: number): void` | Update combo display     |

**PVP Getter:**

| Hook               | Signature     | Purpose                                                          |
| ------------------ | ------------- | ---------------------------------------------------------------- |
| `get useTurnCycle` | `(): boolean` | Override to return `false` for PVP (disables turn state machine) |

### 4.3 Ending Scene Hooks

| Hook                  | Signature                 | Purpose                                          |
| --------------------- | ------------------------- | ------------------------------------------------ |
| `getEndingData`       | `(): EndingData`          | Return ending configuration (REQUIRED, abstract) |
| `createBackground`    | `(): void`                | Background image                                 |
| `createEndingContent` | `(): void`                | Display title, description, images               |
| `showResults`         | `(): void`                | Display score, stats, achievements               |
| `getEndingMusicKey`   | `(): string \| undefined` | Return ending music key                          |
| `onContinue`          | `(): void`                | Navigate back (default: TitleScreen)             |

### 4.4 BaseCharacterSelectScene Hooks

| Hook                      | Signature                                    | Purpose                                               |
| ------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| `getSelectableCharacters` | `(): SelectableCharacter[]`                  | Define character pool (REQUIRED)                      |
| `getNextSceneKey`         | `(): string`                                 | Scene to transition to after selection                |
| `createBackground`        | `(): void`                                   | Custom background                                     |
| `createTitle`             | `(): void`                                   | Custom title display (assign this.titleText!)         |
| `createControlHints`      | `(): void`                                   | Control hints at bottom                               |
| `createCustomUI`          | `(): void`                                   | Extra UI elements for selection screen                |
| `createCharacterCard`     | `(container, character, cardW, cardH): void` | Custom card rendering per character                   |
| `getGridConfig`           | `(): GridConfig`                             | Customize grid layout (columns, sizes, spacing)       |
| `onSelectionChanged`      | `(character, index): void`                   | Highlight changed (description panel updates)         |
| `onCharacterSelected`     | `(character): void`                          | Character confirmed (store in registry)               |
| `shouldAutoTransition`    | `(): boolean`                                | Auto-transition when player confirms? (false for PVP) |
| `triggerTransition`       | `(): void`                                   | Navigate to next scene after selection                |
| `resetForNextPick`        | `(disableIndex?: number): void`              | PVP: gray out picked card, reset to next available    |
| `playSelectSound`         | `(): void`                                   | SFX when highlight moves                              |
| `playConfirmSound`        | `(): void`                                   | SFX when character confirmed                          |
| `getBackgroundMusicKey`   | `(): string \| undefined`                    | Audio key for background music                        |

**Protected properties** (available to subclasses):

- `this.titleText` — Title text object (update for PVP "Player 2, choose!")
- `this.cardContainers` — Per-card containers
- `this.cardBackgrounds` — Per-card background rectangles
- `this.disabledIndices` — Set of disabled card indices (PVP)

### 4.5 DualPlayerSystem API (keyboard-based PVP)

> Use DualPlayerSystem for **keyboard-based** 2-player games (buzzer keys + answer keys).
> For **mouse-click** PVP, build custom buttons directly instead (see `_TemplateDualBattle.ts` OPTION B).

**Constructor:**

```
new DualPlayerSystem(scene, config: DualPlayerSystemConfig)
```

**Config (DualPlayerSystemConfig):**

| Field                 | Type                                              | Purpose                                                 |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| `mode`                | `'TURN_BASED' \| 'BUZZER_RACE' \| 'SIMULTANEOUS'` | Game mode                                               |
| `scoreToWin`          | `number`                                          | Score to trigger gameOver (0 = no auto-win)             |
| `buzzerTimeLimit`     | `number`                                          | Ms before round expires / answer timeout (0 = no limit) |
| `correctPoints`       | `number`                                          | Points per correct answer (default: 1)                  |
| `wrongPenalty`        | `number`                                          | Points deducted for wrong answer (default: 0)           |
| `player1` / `player2` | `DualPlayerConfig`                                | Per-player id, name, color, key bindings                |

**Events (via `.on()`):**

| Event              | Callback Signature                                                | When                                   |
| ------------------ | ----------------------------------------------------------------- | -------------------------------------- |
| `'playerBuzzed'`   | `(playerId: string) => void`                                      | Player presses buzz key first          |
| `'playerAnswered'` | `(playerId: string, answerIndex: number, timeMs: number) => void` | Player submits answer                  |
| `'roundResult'`    | `(result: RoundResult) => void`                                   | Round resolved (has winnerId, details) |
| `'scoreChanged'`   | `(playerId: string, newScore: number) => void`                    | Score updated                          |
| `'gameOver'`       | `(winnerId: string) => void`                                      | A player reached scoreToWin            |

**Key Methods:**

| Method                             | Purpose                                                |
| ---------------------------------- | ------------------------------------------------------ |
| `startBuzzerRound(question)`       | Start BUZZER_RACE round                                |
| `startSimultaneousRound(question)` | Start SIMULTANEOUS round                               |
| `getScore(playerId)`               | Get player's current score                             |
| `getWinner()`                      | Get winning player config (or null if tied)            |
| `destroy()`                        | Clean up listeners and timers (call on scene shutdown) |

**Integration pattern** (in a BaseBattleScene subclass):

1. Create in `initializeBattle()`, listen for events
2. Route quiz phase via `onQuizPhaseStart()` override
3. Destroy in `this.events.once('shutdown', () => dualSystem.destroy())`

---

## 5. Template Operation Pattern

| Operation  | Files                                           | Rule                                           |
| ---------- | ----------------------------------------------- | ---------------------------------------------- |
| **KEEP**   | `Base*.ts`, `systems/*`, `ui/*`, `utils.ts`     | Never modify — these are the engine            |
| **COPY**   | `_Template*.ts`                                 | Copy to new file, rename class, override hooks |
| **UPDATE** | `main.ts`, `LevelManager.ts`, `gameConfig.json` | Modify values only                             |

GDD's Implementation Roadmap should follow this pattern:

1. UPDATE config files first (LevelManager, main.ts, gameConfig)
2. COPY templates and specify which hooks to override

---

## 6. Implementation Roadmap Template

```
1. UPDATE LevelManager.ts: set LEVEL_ORDER[0] to first game scene key
2. UPDATE main.ts: register ALL custom scenes
3. UPDATE gameConfig.json: set battleConfig, dialogueConfig, gameplayConfig values
4. COPY _TemplateCharacterSelect.ts -> HeroSelectScene.ts: define getSelectableCharacters(), getNextSceneKey()
   (Skip if game has no character selection)
5. COPY _TemplateChapter.ts -> IntroScene.ts: define initializeDialogues(), createCharacters()
   (Skip if game has no dialogue/story scenes)
6. COPY _TemplateBattle.ts -> DuelScene.ts: implement initializeBattle(), getCardDeck(), getQuestionBank()
   (For PVP: COPY _TemplateDualBattle.ts instead, set useTurnCycle = false)
7. COPY _TemplateEnding.ts -> VictoryScene.ts: implement getEndingData() returning EndingData
8. COPY _TemplateEnding.ts -> DefeatScene.ts: implement getEndingData() with type: 'defeat'
9. Override hooks as needed (createHUD, onEnemyAction, onBattleEnd, etc.)
```

**Roadmap MUST include** steps 1-3 (LevelManager, main.ts, gameConfig). These are the #1 source of runtime errors when omitted.

---

## 7. Common Design Mistakes

These are mistakes where the GDD asks for something that already exists in the template:

| Wrong (GDD asks for custom work)        | Correct (use existing template capability)                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Implement card drag system"            | Use `Card` component, override `onCardSelected` hook                                                                                                    |
| "Write custom dialogue parser"          | Return `DialogueEntry[]` from `initializeDialogues()`                                                                                                   |
| "Create turn system from scratch"       | Use `BaseBattleScene` phase cycle + hooks                                                                                                               |
| "Build quiz modal UI manually"          | Use `QuizModal` component from `ui/` (prevents double-click bugs)                                                                                       |
| Named import: `import { battleConfig }` | Default import: `import gameConfig from '../gameConfig.json'` then destructure                                                                          |
| Character as `type: "animation"`        | Character as `type: "image"` (portraits are STATIC)                                                                                                     |
| "SIDE VIEW facing RIGHT"                | "FRONT VIEW, bust shot" (UI Heavy uses portraits)                                                                                                       |
| Missing `explanation` in quiz           | ALWAYS include explanation field                                                                                                                        |
| Custom HP bar rendering                 | Use `StatusBar` component                                                                                                                               |
| Hardcoded combo multipliers             | Use `gameConfig.json` comboTiers                                                                                                                        |
| Design custom scene transitions         | Use `onChapterComplete`, `onBattleEnd`, `onContinue` hooks                                                                                              |
| Build custom state persistence          | Use `GameDataManager` singleton (cross-scene data)                                                                                                      |
| Build raw answer buttons for quiz       | Use `QuizModal.showQuestion()` — handles layout, feedback, double-click guard                                                                           |
| `container.setInteractive()` for click  | Set interactive on the INNER shape (rectangle/image), not the Container. Container has no implicit hitArea → causes `hitAreaCallback is not a function` |
| `portrait.displayObject`                | CharacterPortrait IS a Container — pass it directly: `shake(this, portrait, 5, 300)`. No `.displayObject` property exists                               |
| `startRound()` in `initializeBattle()`  | Use `onBattleStart()` hook — HUD is not created yet during `initializeBattle()`                                                                         |
| Creating UI each round without cleanup  | Store references (questionText, buzzerButtons) and `.destroy()` them in `nextRound()` before recreating                                                 |
