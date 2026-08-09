# UI Heavy Module — Implementation Cheat Sheet

> Systems, hooks, and component tables are in `template_api.md` (already read in step 14).
> This file focuses on: **correct integration patterns, exact type shapes, and mistakes to avoid.**
> Read this LAST — it stays freshest in your context during coding.

---

## 1. Template Guide

### Creating a Character Selection Scene

1. **Copy**: `_TemplateCharacterSelect.ts` → `HeroSelectScene.ts`
2. **Modify**:
   - Rename class, update constructor key
   - Implement `getSelectableCharacters()` with character roster
   - Set `getNextSceneKey()` to your first game scene
   - Override `createBackground()`, `createTitle()`
   - Override `onCharacterSelected()` for post-selection logic
   - For PVP: Override `shouldAutoTransition()` to return false,
     store P1/P2 choices in `onCharacterSelected()`,
     call `this.resetForNextPick(index)` after P1,
     update `this.titleText` for P2, then `this.triggerTransition()` after P2

### Creating a Chapter Scene (Dialogue)

1. **Copy**: `_TemplateChapter.ts` → `IntroScene.ts`
2. **Modify**:
   - Rename class, update constructor key
   - Implement `initializeDialogues()` with dialogue entries
   - Call `registerCharacter()` in `createCharacters()`
   - Set background in `createBackground()`
   - Set music in `getBackgroundMusicKey()`
   - Override `onChapterComplete()` for scene transition

### Creating a Battle Scene (Combat/Quiz)

1. **Copy**: `_TemplateBattle.ts` → `DuelScene.ts`
2. **Modify**:
   - Rename class, update constructor key
   - Implement `initializeBattle()` — set HP values, create QuizModal if using quiz
   - Implement `getCardDeck()`, `getQuestionBank()`
   - Override `createCombatants()` — character portraits
   - Override `createHUD()` — HP bars + shutdown cleanup
   - Override `onQuizPhaseStart()` — show question via `quizModal.showQuestion()`
   - Override `onEnemyAction()`, `onBattleEnd()`
   - **IMPORTANT**: Use `QuizModal` component for question/answer display — it handles
     layout, feedback animations, and double-click prevention internally

### Creating an Ending Scene

1. **Copy**: `_TemplateEnding.ts` → `VictoryScene.ts`
2. **Modify**:
   - Rename class, update constructor key
   - Implement `getEndingData()` (title, text, type)
   - Override `createEndingContent()`, `showResults()`, `onContinue()`

### Creating Multiple Endings

Create SEPARATE scene files for each ending type:

| Ending  | Scene File          | Type        |
| ------- | ------------------- | ----------- |
| Victory | `VictoryScene.ts`   | `'victory'` |
| Defeat  | `DefeatScene.ts`    | `'defeat'`  |
| Secret  | `SecretEndScene.ts` | `'secret'`  |

---

## 2. Config Interfaces

### DialogueEntry

| Field         | Type            | For Type        | Description                                                               |
| ------------- | --------------- | --------------- | ------------------------------------------------------------------------- |
| `type`        | string          | ALL             | `'text'` / `'choice'` / `'event'` / `'character'` / `'branch'` / `'wait'` |
| `speaker`     | string          | text            | Speaker name or `'narrator'`                                              |
| `text`        | string          | text            | Dialogue content                                                          |
| `expression`  | string          | text            | Speaker expression key                                                    |
| `id`          | string          | choice          | Unique choice identifier                                                  |
| `prompt`      | string          | choice          | Choice prompt                                                             |
| `options`     | ChoiceOption[]  | choice          | Available selections                                                      |
| `action`      | string          | event/character | Event name or `'enter'`/`'exit'`                                          |
| `data`        | object          | event           | Event payload                                                             |
| `characterId` | string          | character       | Character to enter/exit                                                   |
| `position`    | string          | character       | `'left'` / `'center'` / `'right'`                                         |
| `condition`   | function        | branch          | Boolean test                                                              |
| `trueBranch`  | DialogueEntry[] | branch          | Path if true                                                              |
| `falseBranch` | DialogueEntry[] | branch          | Path if false                                                             |
| `duration`    | number          | wait            | Delay in ms                                                               |

### CardConfig

| Field         | Type     | Required | Description                                                         |
| ------------- | -------- | -------- | ------------------------------------------------------------------- |
| `id`          | string   | Yes      | Unique card ID                                                      |
| `name`        | string   | Yes      | Display name                                                        |
| `type`        | CardType | Yes      | `'attack'` / `'heavy_attack'` / `'defend'` / `'heal'` / `'special'` |
| `value`       | number   | Yes      | Effect amount                                                       |
| `description` | string   | No       | Card description                                                    |
| `textureKey`  | string   | No       | Card art texture key                                                |
| `quizSubject` | string   | No       | Links to question category                                          |
| `cost`        | number   | No       | Play cost (resource systems)                                        |

### QuizQuestion

| Field          | Type     | Required | Description              |
| -------------- | -------- | -------- | ------------------------ |
| `question`     | string   | Yes      | Question text            |
| `options`      | string[] | Yes      | Answer options (4 items) |
| `correctIndex` | number   | Yes      | Correct answer (0-based) |
| `explanation`  | string   | Yes      | Educational feedback     |
| `difficulty`   | number   | No       | 1-5 difficulty rating    |
| `subject`      | string   | No       | Subject category         |

### EnemyBattleConfig

| Field         | Type             | Required | Description          |
| ------------- | ---------------- | -------- | -------------------- |
| `name`        | string           | Yes      | Enemy display name   |
| `maxHP`       | number           | Yes      | Enemy max health     |
| `textureKey`  | string           | Yes      | Portrait texture key |
| `damageRange` | [number, number] | Yes      | Min/max damage       |
| `actions`     | string[]         | No       | Available AI actions |

### EndingData

| Field           | Type       | Required | Description                                                      |
| --------------- | ---------- | -------- | ---------------------------------------------------------------- |
| `title`         | string     | Yes      | Ending title text                                                |
| `text`          | string     | No       | Ending body text                                                 |
| `type`          | EndingType | Yes      | `'victory'` / `'defeat'` / `'neutral'` / `'secret'` / `'custom'` |
| `backgroundKey` | string     | No       | Background image key                                             |
| `musicKey`      | string     | No       | Music audio key                                                  |
| `stats`         | Record     | No       | Stats to display                                                 |

### SelectableCharacter

| Field         | Type                   | Required | Description                                            |
| ------------- | ---------------------- | -------- | ------------------------------------------------------ |
| `id`          | string                 | Yes      | Character unique ID                                    |
| `name`        | string                 | Yes      | Display name                                           |
| `description` | string                 | No       | Character description                                  |
| `imageKey`    | string                 | No       | Preview image texture key (must match asset-pack.json) |
| `stats`       | Record<string, number> | No       | Display stats (e.g., `{ hp: 100, atk: 20 }`)           |
| `metadata`    | Record<string, any>    | No       | Extra data (expressions map, defaultPosition, etc.)    |

### ChapterInfo

| Field             | Type    | Required | Description                 |
| ----------------- | ------- | -------- | --------------------------- |
| `id`              | string  | Yes      | Chapter unique ID           |
| `title`           | string  | Yes      | Display title               |
| `sceneKey`        | string  | Yes      | Scene key to launch         |
| `description`     | string  | No       | Short description           |
| `thumbnailKey`    | string  | No       | Thumbnail image key         |
| `lockedByDefault` | boolean | No       | Lock state (default: false) |

---

## 3. Base Class Lifecycle (EXECUTION ORDER)

**READ THIS before overriding any hooks.** The order matters.

### BaseChapterScene.create()

```
create()
  -> createBackground()
  -> createCharacters()
  -> initializeDialogues()       // REQUIRED
  -> createUI()
  -> setupInputs()
  -> initializeScene()
  -> play music (getBackgroundMusicKey())
  -> start dialogue playback
```

### BaseBattleScene.create()

```
create()
  -> reset mutable state (HP, deck, etc.)
  -> initializeBattle()          // REQUIRED — set HP here (runs FIRST!)
  -> createBackground()
  -> createCombatants()
  -> createHUD()                 // HP values already set by initializeBattle()
  -> createHelpPanel()
  -> createHandArea()
  -> setupInputs()
  -> play music (getBackgroundMusicKey())
  -> startBattle()               // AUTO-CALLED! NEVER call from initializeBattle()!
       -> if useTurnCycle: beginNewTurn()
       -> if !useTurnCycle: your custom flow takes over
```

**CRITICAL**: `initializeBattle()` runs BEFORE `createHUD()`. Set HP/config values there so `createHUD()` can use them for StatusBar maxValue.

**CRITICAL**: `startBattle()` is called AUTOMATICALLY. Calling it inside `initializeBattle()` causes DOUBLE execution (duplicate timers, state corruption).

### BaseEndingScene.create()

```
create()
  -> createBackground()
  -> getEndingData()             // REQUIRED
  -> createEndingContent()
  -> showResults()
  -> play music (getEndingMusicKey())  // NOT getBackgroundMusicKey()!
  -> setup continue -> onContinue()
```

### BaseCharacterSelectScene.create()

```
create()
  -> createBackground()
  -> createTitle()               // stored in this.titleText
  -> build grid from getSelectableCharacters()
  -> createControlHints()
  -> createCustomUI()
  -> setupInputs()
  -> playBackgroundMusic()
  -> updateHighlight()
  -> on confirm:
       playConfirmSound()
       registry.set('selectedCharacter', char)
       onCharacterSelected(char)
       if shouldAutoTransition() -> animate -> triggerTransition()
       else -> return (PVP: call resetForNextPick() in your hook)
```

---

## 4. Type Export Reference (EXACT Names — NEVER Invent)

### Exported Types

| Source File                   | Exported Types            | Exported Interfaces                                       |
| ----------------------------- | ------------------------- | --------------------------------------------------------- |
| `BaseBattleScene.ts`          | `BattlePhase`, `CardType` | `CardConfig`, `QuizQuestion`, `EnemyBattleConfig`         |
| `BaseChapterScene.ts`         | —                         | `DialogueEntry`, `ChoiceOption`, `ChapterCharacterConfig` |
| `BaseEndingScene.ts`          | `EndingType`              | `EndingData`                                              |
| `BaseCharacterSelectScene.ts` | —                         | `SelectableCharacter`, `GridConfig`                       |
| `ChapterSelectScene.ts`       | —                         | `ChapterInfo`                                             |

### Common Invented Names (WRONG -> CORRECT)

| WRONG (does not exist)                   | CORRECT (actual export)  |
| ---------------------------------------- | ------------------------ |
| `EndingConfig`                           | `EndingData`             |
| `CharacterDefinition`                    | `ChapterCharacterConfig` |
| `BattleConfig`                           | `EnemyBattleConfig`      |
| `QuestionData`                           | `QuizQuestion`           |
| `CardData`                               | `CardConfig`             |
| `getBackgroundMusicKey()` on EndingScene | `getEndingMusicKey()`    |

---

## 5. Scene Registration & LevelManager

### LevelManager (CRITICAL)

TitleScreen calls `LevelManager.getFirstLevelScene()` to navigate after Enter. Default: `["Level1Scene"]`.

**You MUST update `LevelManager.ts`**:

| Pattern        | LEVEL_ORDER[0] should be |
| -------------- | ------------------------ |
| Single Duel    | `"BattleScene"`          |
| Story + Battle | `"IntroScene"`           |
| Visual Novel   | `"Chapter1Scene"`        |
| Full Campaign  | `"ChapterSelectScene"`   |
| PVP Duel       | `"CharacterSelectScene"` |

**If you leave `LEVEL_ORDER` as `["Level1Scene"]` and no `Level1Scene` is registered, the game will CRASH.**

### main.ts Scene Registration

```typescript
// Register ALL custom scenes BEFORE UI scenes
game.scene.add('CharacterSelectScene', CharSelectScene);
game.scene.add('BattleScene', BattleScene);
game.scene.add('VictoryScene', VictoryScene);
game.scene.add('DefeatScene', DefeatScene);
```

**Every `scene.start('X')` call MUST have a matching `game.scene.add('X', ...)` in main.ts.**

### Full Registration Checklist

- [ ] `LevelManager.ts` — `LEVEL_ORDER[0]` = your first game scene key
- [ ] `main.ts` — Import and register ALL scenes
- [ ] `asset-pack.json` — Add ALL portrait/background/UI assets
- [ ] `gameConfig.json` — Set battleConfig, dialogueConfig values
- [ ] Scene transitions match scene keys exactly

---

## 6. Config Access Pattern

```typescript
// CORRECT — default import + safe destructuring + .value accessor
import gameConfig from '../gameConfig.json';
const battleConfig = gameConfig.battleConfig ?? {};
const gameplayConfig = gameConfig.gameplayConfig ?? {};
const hp = battleConfig.playerMaxHP.value; // number
const textSpeed = gameplayConfig.textSpeed.value; // number

// WRONG — named imports do not work reliably with JSON
// import { battleConfig } from '../gameConfig.json';

// WRONG — no such API exists
// const hp = this.gameConfig.getValue('battleConfig.playerMaxHP');

// WRONG — this returns the wrapper object { value: 100, type: "number", ... }, NOT the number
// const hp = battleConfig.playerMaxHP;
```

---

## 7. Utility References

### TweenPresets (EXACT Signatures)

Import as **individual functions**:

```typescript
// CORRECT
import { fadeIn, shake, popIn } from '../ui/TweenPresets';
// WRONG — TweenPresets is NOT a class/namespace
// import { TweenPresets } from '../ui/TweenPresets';
```

**Signatures** (ALL use positional args, NOT objects):

```
fadeIn(scene, target, duration?, onComplete?)
fadeOut(scene, target, duration?, onComplete?)
slideTo(scene, target, toX, toY, duration?, ease?)
popIn(scene, target, duration?, onComplete?)
shake(scene, target, intensity?: number, duration?: number)
pulse(scene, target, minScale?, maxScale?, duration?)
getScreenCenter(scene): { x: number, y: number }
distributeHorizontally(count, width, padding?): number[]
```

```typescript
// CORRECT — positional numbers
shake(this, sprite, 5, 300);
// WRONG — will silently fail
// shake(this, sprite, { intensity: 5, duration: 300 });
```

### GameDataManager

Singleton for persistent state across scenes:

```typescript
import { GameDataManager } from '../systems';
GameDataManager.set('playerName', 'Alaric');
GameDataManager.get('playerName'); // 'Alaric'
GameDataManager.increment('score', 100);
GameDataManager.checkFlag('hasSword'); // boolean
```

---

## 8. PVP Battle Implementation Guide

For 2-Player PVP, choose one of two approaches:

### OPTION A: Keyboard PVP (use DualPlayerSystem)

- Use `DualPlayerSystem` for **keyboard-based** buzz + answer (see `template_api.md` Section 4.5)
- Create in `initializeBattle()`, listen for events (`playerBuzzed`, `roundResult`, `gameOver`)
- Route quiz phase via `onQuizPhaseStart()` → `dualSystem.startBuzzerRound(question)`
- Destroy in `this.events.once('shutdown', () => dualSystem.destroy())`

### OPTION B: Mouse-Click PVP (custom buttons)

- Set `protected override get useTurnCycle(): boolean { return false; }` — disables the turn cycle
- Build **mouse-clickable** buzzer buttons directly (full control over UI/flow)
- Implement your own round loop: showQuestion → enableBuzzers → handleBuzz → showAnswers → applyDamage → nextRound

### Common PVP Rules (both options)

- Use `playerHP` / `enemyHP` as P1 / P2 health
- Track which player buzzed first (store `lastBuzzedPlayerId`)
- **Clean up UI** before each new round — destroy old buttons/text/panels
- **Reset per-round state** at round start
- Use `popRandomQuestion()` or `splice` to avoid question repetition
- Do NOT use `QuizModal` for PVP — build custom answer buttons

---

## 9. Recipe: Battle Scene Setup Integration

> **DO NOT COPY literally** — adapt class name, HP values, texture keys, and layout to your GDD.

This shows the correct integration flow across the three critical hooks.
Base class calls them in order: `initializeBattle()` → `createCombatants()` → `createHUD()`.

```typescript
// Step 1: initializeBattle() — runs BEFORE createHUD()
// Set HP values here so createHUD() can use them for StatusBar maxValue.
protected override initializeBattle(): void {
  this.playerMaxHP = 100;  // adapt to your GDD
  this.playerHP = this.playerMaxHP;
  this.enemyMaxHP = 80;
  this.enemyHP = this.enemyMaxHP;
}

// Step 2: createCombatants() — CharacterPortrait correct usage
// CharacterPortrait(scene, config) — only 2 args! Starts INVISIBLE.
protected override createCombatants(): void {
  this.heroPortrait = new CharacterPortrait(this, {
    id: 'hero',
    textureKey: 'hero_neutral',
    displayName: 'Hero',
    position: 'left',
    scale: 0.5,
    expressions: { neutral: 'hero_neutral', angry: 'hero_angry' },
  });
  this.heroPortrait.enter();      // REQUIRED — without this, portrait is invisible
  this.heroPortrait.setDepth(5);  // optional — push behind UI elements
}

// Step 3: createHUD() — StatusBar correct usage + shutdown cleanup
// StatusBar(scene, x, y, config) — 4 separate args! Auto-adds to scene.
protected override createHUD(): void {
  this.playerHPBar = new StatusBar(this, 150, 40, {
    width: 200, height: 24,
    maxValue: this.playerMaxHP,    // already set by initializeBattle()
    fillColor: 0x00aa00,
    label: 'HP', showValue: true,
  });
  this.playerHPBar.setValue(this.playerHP);

  // ALWAYS register shutdown cleanup for timers/listeners
  this.events.once('shutdown', () => {
    // cancel active timers, remove listeners here
  });
}

// Responding to damage — update bar + show floating text
protected override onPlayerDamaged(damage: number, remainingHP: number): void {
  this.playerHPBar?.setValue(remainingHP);
  // Use inherited helper — never use "new FloatingText(...)"
  this.showFloatingText(`-${damage}`, 150, 100, {
    color: '#ff4444', fontSize: '24px',
  });
}
```

---

## 10. Recipe: Component Correct Usage

> Quick reference for the 4 most commonly misused components.

### CharacterPortrait

```typescript
// Constructor: CharacterPortrait(scene, config) — 2 args only
// WRONG: new CharacterPortrait(scene, x, y, config) ← 4 args will break
const portrait = new CharacterPortrait(this, {
  id: 'hero',
  textureKey: 'hero_neutral', // must exist in asset-pack.json
  displayName: 'Hero',
  position: 'left', // 'left' | 'center' | 'right'
  scale: 0.5, // optional, default 1.0
  expressions: { angry: 'hero_angry' }, // optional
});
portrait.enter(); // MUST call — invisible by default
portrait.setDepth(5); // optional — push behind UI
// Later:
portrait.setExpression('angry');
```

### StatusBar

```typescript
// Constructor: StatusBar(scene, x, y, config) — 4 separate args
// WRONG: new StatusBar(scene, { x, y, width, ... }) ← config does NOT contain x,y
const bar = new StatusBar(this, 100, 50, {
  width: 200,
  height: 24,
  maxValue: 100,
  fillColor: 0x00ff00,
  label: 'HP', // optional
  showValue: true, // optional
});
// Auto-adds to scene. Do NOT call this.add.existing(bar) again.
bar.setValue(75);
```

### FloatingText

```typescript
// STATIC method — never use "new FloatingText(...)"
FloatingText.show(this, 200, 150, '-25', {
  color: '#ff0000',
  fontSize: '28px',
});
```

### TweenPresets

```typescript
// Individual functions — NOT a class/namespace
import { fadeIn, shake, popIn, pulse } from '../ui/TweenPresets';
shake(this, sprite, 5, 300); // (scene, target, intensity, duration)
fadeIn(this, panel, 400); // (scene, target, duration)
popIn(this, button); // (scene, target)
```

---

## 11. Common Code Mistakes (Agent MUST Avoid)

| Mistake                                                     | Correct Approach                                                                                        | Why                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Call `this.startBattle()` in `initializeBattle()`           | Let `create()` call it automatically                                                                    | Double execution causes duplicate timers                                    |
| `protected override create()` on public base                | `override create()` (keep public)                                                                       | Cannot narrow visibility                                                    |
| Leave `LEVEL_ORDER = ["Level1Scene"]`                       | Set to your actual first scene                                                                          | Game crashes if scene not registered                                        |
| Create UI elements each round without cleanup               | Destroy previous before creating new                                                                    | Elements accumulate, memory leaks                                           |
| Select questions with `arr[idx]`                            | Use `arr.splice(idx, 1)[0]` or `popRandomQuestion()`                                                    | Prevents question repetition                                                |
| Don't reset per-round timers/counters                       | Reset at start of each round                                                                            | Timer carries over from previous round                                      |
| Build raw answer buttons manually                           | Use `QuizModal` for answer display (even in PVP)                                                        | QuizModal prevents double-click bugs and handles layout                     |
| Allow multiple clicks on answer buttons                     | Set `isWaitingForAnswer = false` immediately in handler                                                 | Rapid clicks apply damage multiple times                                    |
| Use `this.gameConfig.getValue(...)`                         | `import gameConfig from '../gameConfig.json'` then `const battleConfig = gameConfig.battleConfig ?? {}` | No getValue API; use default import + safe destructure                      |
| Access config without `.value`                              | `battleConfig.playerMaxHP.value`                                                                        | Config uses `{ "value": X }` wrapper — must use `.value`                    |
| Named import: `import { battleConfig } from '...'`          | Default import: `import gameConfig from '../gameConfig.json'`                                           | Named imports from JSON are unreliable                                      |
| `new CharacterPortrait(scene, x, y, config)`                | `new CharacterPortrait(scene, config)` then `.enter()`                                                  | 2 args; starts invisible                                                    |
| `new StatusBar(this, { x, y, width, ... })`                 | `new StatusBar(this, x, y, { width, ... })`                                                             | x, y are separate positional args                                           |
| Call `this.add.existing(statusBar)`                         | StatusBar auto-adds itself                                                                              | Double-add unnecessary                                                      |
| Override `executeEnemyTurn()` without `completeEnemyTurn()` | ALWAYS call `this.completeEnemyTurn()` at end                                                           | Game freezes — turn cycle stalls                                            |
| Override `resolveCardAction()` without hiding QuizModal     | Call `quizModal.hide()` first                                                                           | QuizModal (depth 300) covers StatusBar                                      |
| Forget to set HP in `initializeBattle()`                    | Set `playerMaxHP`, `playerHP`, `enemyMaxHP`, `enemyHP`                                                  | createHUD needs these for maxValue                                          |
| Override `shutdown()` for cleanup                           | Use `this.events.once('shutdown', cb)` in create                                                        | Phaser.Scene has no overridable shutdown()                                  |
| `container.setInteractive()` for click                      | Set interactive on inner shape: `rect.setInteractive(); rect.on('pointerdown', ...)`                    | Container has no hitArea — crashes with `hitAreaCallback is not a function` |
| `portrait.displayObject`                                    | Pass portrait directly: `shake(this, portrait, 5, 300)`                                                 | CharacterPortrait IS a Container — no `.displayObject` property             |
| `startRound()` in `initializeBattle()`                      | Use `onBattleStart()` hook                                                                              | HUD not created yet during `initializeBattle()`                             |

---

## 12. Control Scheme

UI Heavy games are primarily mouse/touch driven:

| Input       | Action                                      |
| ----------- | ------------------------------------------- |
| Click/Tap   | Advance dialogue, select card, press button |
| Enter/Space | Advance dialogue, confirm selection         |

No WASD, no jump, no attack keys. All interaction through UI elements.
