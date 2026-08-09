# UI Heavy — Game Design Guide

> From a game designer's perspective: what makes a great UI-heavy game.
> This document focuses on gameplay, flow, and feel — not code.

---

## 1. Scene Types & When to Use

| Scene Type              | Purpose                              | Use When                                    |
| ----------------------- | ------------------------------------ | ------------------------------------------- |
| **Chapter** (narrative) | Dialogue, visual novel, cutscene     | Story segments, tutorials, introductions    |
| **Battle** (turn-based) | Card combat, quiz, turn-based duel   | Combat, educational questions, card battles |
| **Ending** (result)     | Victory/defeat screen, score summary | After final battle or story conclusion      |
| **Character Select**    | Player picks a character/avatar      | Multi-character games, PVP with team choice |

**Rule**: Every ui_heavy game MUST have at least ONE of these scene types.

---

## 2. Game Flow Patterns

**IMPORTANT**: Select a pattern and adapt it. Do NOT invent complex scene graphs from scratch.

### Pattern A: "Single Duel" (Simplest)

```
TitleScreen -> BattleScene -> EndingScene
```

- Best for: Simple card battlers, quiz games
- Scenes: 3 total
- Example: One-round quiz duel

### Pattern B: "Story + Battle" (Recommended for educational)

```
TitleScreen -> IntroChapter -> BattleScene -> EndingScene
```

- Best for: Educational games with narrative framing
- Scenes: 4 total
- Example: Teacher introduces topic, then quiz battle

### Pattern C: "Multi-Chapter Visual Novel"

```
TitleScreen -> Chapter1 -> Chapter2 -> ... -> EndingScene
```

- Best for: Visual novels, interactive fiction
- Scenes: 4-8 total
- No battle scene needed

### Pattern D: "Full Campaign" (Most Complex)

```
TitleScreen -> ChapterSelect -> Chapter{N} -> [BattleScene{N}] -> EndingScene
```

- Best for: Multi-stage educational games, RPG-style card games
- Scenes: 6-10 total
- Chapters can be unlocked progressively

### Pattern E: "PVP Duel" (2-Player Local)

```
TitleScreen -> [CharacterSelect] -> BattleScene -> EndingScene
```

- Best for: Two-player quiz battles, knowledge duels
- Scenes: 3-4 total
- Both players answer simultaneously via mouse-click buzzer buttons
- First to click gets to answer; correct → attack opponent, wrong → self-damage

### Pattern Selection Guide

| Game Scope               | Pattern | Scenes to Create                                |
| ------------------------ | ------- | ----------------------------------------------- |
| 1 battle only            | A       | 1 Battle + 1 Ending                             |
| 1 story + 1 battle       | B       | 1 Chapter + 1 Battle + 1 Ending                 |
| 3-5 story chapters       | C       | 3-5 Chapters + 1 Ending                         |
| 3+ chapters with battles | D       | ChapterSelect + N Chapters + N Battles + Ending |
| 2-player PVP duel        | E       | [CharacterSelect] + 1 Battle + 1 Ending         |

---

## 3. Dialogue Design

### 3.1 Dialogue Entry Types

| Type        | Purpose                | Auto-Advances?       | Key Fields                               |
| ----------- | ---------------------- | -------------------- | ---------------------------------------- |
| `text`      | Show dialogue text     | No (wait for click)  | `speaker`, `text`, `expression?`         |
| `choice`    | Player picks an option | No (wait for choice) | `id`, `prompt`, `options[]`              |
| `event`     | Trigger side effect    | Yes                  | `action`, `data?`                        |
| `character` | Enter/exit character   | Yes                  | `characterId`, `action`, `position?`     |
| `branch`    | Conditional path       | Yes                  | `condition`, `trueBranch`, `falseBranch` |
| `wait`      | Timed pause            | Yes (after delay)    | `duration`                               |

### 3.2 Dialogue Structure Example

```typescript
[
  { type: 'text', speaker: 'narrator', text: 'The duel begins...' },
  {
    type: 'character',
    action: 'enter',
    characterId: 'rival',
    position: 'right',
  },
  {
    type: 'text',
    speaker: 'rival',
    text: 'You dare challenge me?',
    expression: 'angry',
  },
  {
    type: 'choice',
    id: 'response',
    prompt: 'Your response:',
    options: [
      { text: 'I accept your challenge!', effects: { courage: +1 } },
      { text: 'Maybe another time...', effects: { courage: -1 } },
    ],
  },
  { type: 'event', action: 'play_sfx', data: { key: 'dramatic_sting' } },
];
```

### 3.3 Character Definitions

Each character in dialogue needs:

| Field             | Required | Example                                        |
| ----------------- | -------- | ---------------------------------------------- |
| `id`              | Yes      | `'hero'`, `'rival'`, `'mentor'`                |
| `textureKey`      | Yes      | `'hero_neutral'` (from asset-pack.json)        |
| `displayName`     | Yes      | `'Alaric'`                                     |
| `expressions`     | Optional | `{ happy: 'hero_happy', angry: 'hero_angry' }` |
| `defaultPosition` | Optional | `'left'`, `'center'`, `'right'`                |

**GDD should list all characters with their expressions.**

### 3.4 Choice Effects

Choices can modify game state via `effects`:

```typescript
{ text: 'Study harder', effects: { knowledge: +2, stamina: -1 } }
```

Effects are tracked across scenes and can influence branches.

---

## 4. Battle System Design

### 4.1 Card Definitions

Each card in the GDD must specify:

| Field         | Required | Example                                                             |
| ------------- | -------- | ------------------------------------------------------------------- |
| `id`          | Yes      | `'fireball'`                                                        |
| `name`        | Yes      | `'Fireball'`                                                        |
| `type`        | Yes      | `'attack'` / `'heavy_attack'` / `'defend'` / `'heal'` / `'special'` |
| `value`       | Yes      | `25` (damage/heal/shield amount)                                    |
| `description` | Optional | `'A basic fire spell'`                                              |
| `quizSubject` | Optional | `'math'` (links card to question category)                          |

**Card Type Guide:**

| Type           | Effect            | Typical Value Range |
| -------------- | ----------------- | ------------------- |
| `attack`       | Deal damage       | 10-20               |
| `heavy_attack` | Deal heavy damage | 25-40               |
| `defend`       | Add shield points | 10-20               |
| `heal`         | Restore HP        | 15-25               |
| `special`      | Custom effect     | varies              |

### 4.2 Quiz Questions

For educational games, questions must include `explanation`:

```json
{
  "question": "What is 7 x 8?",
  "options": ["54", "56", "58", "64"],
  "correctIndex": 1,
  "explanation": "7 x 8 = 56. Think of it as (7 x 10) - (7 x 2) = 70 - 14.",
  "subject": "math",
  "difficulty": 2
}
```

**Rules:**

- Always 4 options per question
- `explanation` is REQUIRED (educational feedback)
- `correctIndex` is 0-based

### 4.3 Combo System

Rewards consecutive correct answers:

| Streak | Multiplier | Label   |
| ------ | ---------- | ------- |
| 0-1    | 1.0x       | (none)  |
| 2-3    | 1.2x       | GOOD    |
| 4-5    | 1.5x       | GREAT   |
| 6+     | 2.0x       | PERFECT |

### 4.4 Turn Flow (Single-Player)

```
INTRO -> PLAYER_TURN -> QUIZ_PHASE -> FEEDBACK_PHASE -> ACTION_PHASE -> ENEMY_TURN -> CHECK_END -> (loop)
```

Each phase triggers gameplay events. GDD should describe what happens at each phase.

### 4.5 PVP Round Flow (2-Player Buzzer)

```
ROUND_START -> SHOW_QUESTION -> ENABLE_BUZZERS -> [Player clicks] -> SHOW_ANSWERS -> [Player answers] -> APPLY_DAMAGE -> (loop)
```

- Both players see the question simultaneously (display question text BEFORE buzzers are enabled)
- Clickable buzzer buttons (mouse) below each character portrait
- First to click gets to answer; use `QuizModal` component to show answer options (prevents double-click bugs)
- If correct: attack opponent; if wrong: self-damage
- Use playerHP / enemyHP as P1 / P2 health
- Add tween feedback on buzzer press for visual polish

### 4.6 Enemy Configuration (Single-Player)

| Field         | Type       | Example         |
| ------------- | ---------- | --------------- |
| `name`        | string     | `'Rival Draco'` |
| `maxHP`       | number     | `80`            |
| `textureKey`  | string     | `'rival_idle'`  |
| `damageRange` | [min, max] | `[5, 15]`       |

---

## 5. Config Schema

All values use `{ "value": X, "type": "...", "description": "..." }` wrapper format. Access in code: `battleConfig.playerMaxHP.value`.

```json
{
  "gameplayConfig": {
    "textSpeed": { "value": 30, "type": "number", "description": "Typewriter speed (ms per character)" },
    "autoAdvanceDelay": { "value": 0, "type": "number", "description": "Auto-advance delay (0 = manual)" },
    "defaultMusicVolume": { "value": 0.3, "type": "number", "description": "Music volume (0-1)" },
    "defaultSFXVolume": { "value": 0.5, "type": "number", "description": "SFX volume (0-1)" }
  },
  "battleConfig": {
    "playerMaxHP": { "value": 100, "type": "number", "description": "Player starting max HP" },
    "enemyMaxHP": { "value": 80, "type": "number", "description": "Enemy starting max HP" },
    "handSize": { "value": 3, "type": "number", "description": "Cards drawn per turn" },
    "quizTimeLimit": { "value": 0, "type": "number", "description": "Quiz time limit in seconds (0 = none)" },
    "comboTiers": { "value": [...], "type": "array", "description": "Combo multiplier tiers" }
  },
  "dialogueConfig": {
    "boxWidth": { "value": 900, "type": "number", "description": "Dialogue box width" },
    "boxHeight": { "value": 150, "type": "number", "description": "Dialogue box height" },
    "boxY": { "value": 650, "type": "number", "description": "Dialogue box Y position" },
    "backgroundAlpha": { "value": 0.85, "type": "number", "description": "Dialogue box background opacity" }
  }
}
```

---

## 6. Asset Guidelines

### 6.1 Character Assets

**CRITICAL**: UI Heavy characters are PORTRAITS, not animated sprites.

| Rule            | Requirement                                                                             |
| --------------- | --------------------------------------------------------------------------------------- |
| **View Angle**  | FRONT VIEW or 3/4 VIEW (NOT side view)                                                  |
| **Framing**     | Bust shot (chest and above), NOT full body                                              |
| **Type**        | Use `type: "image"` (NOT `type: "animation"`)                                           |
| **Params**      | NO `size` or `resolution` — output is always 386\*560 PNG, game scales via `setScale()` |
| **Expressions** | One image PER expression (neutral, happy, angry, sad)                                   |

**Naming Convention**: `{character}_{expression}.png`

- `hero_neutral.png`, `hero_happy.png`, `hero_angry.png`
- `rival_neutral.png`, `rival_smirk.png`

### 6.2 Background Assets

One background per scene. Use `type: "background"` in asset generation.

| Scene Type       | Background Style                                 |
| ---------------- | ------------------------------------------------ |
| Dialogue/Chapter | Full scene illustration (indoor/outdoor setting) |
| Battle           | Arena or confrontation scene                     |
| Ending           | Dramatic or calm scene matching ending type      |

### 6.3 UI Element Assets

| Element      | Type    | Description Example                      |
| ------------ | ------- | ---------------------------------------- |
| Card frame   | `image` | `"ornate card frame with golden border"` |
| Panel/box    | `image` | `"parchment scroll panel for dialogue"`  |
| Button       | `image` | `"stone button with rune markings"`      |
| HP bar frame | `image` | `"potion tube frame for health display"` |
| Effect       | `image` | `"magical sparkle burst effect"`         |

### 6.4 Audio Assets

| Audio                 | audioType | Duration | Purpose                       |
| --------------------- | --------- | -------- | ----------------------------- |
| BGM per scene         | `bgm`     | 15-30s   | Chapter/battle/ending music   |
| Click/select SFX      | `sfx`     | 0.3-0.5s | Button clicks, card selection |
| Correct answer SFX    | `sfx`     | 0.5-1s   | Positive feedback             |
| Wrong answer SFX      | `sfx`     | 0.5-1s   | Negative feedback             |
| Damage SFX            | `sfx`     | 0.3-0.5s | Attack impact                 |
| Victory/defeat jingle | `sfx`     | 2-3s     | End of battle                 |

### 6.5 Required Asset Count by Pattern

| Pattern            | Backgrounds               | Character Images  | UI Elements | Audio |
| ------------------ | ------------------------- | ----------------- | ----------- | ----- |
| A (Single Duel)    | 2 (battle, ending)        | 2-4 per character | 3-5         | 4-6   |
| B (Story + Battle) | 3 (story, battle, ending) | 2-4 per character | 3-5         | 5-8   |
| C (Visual Novel)   | 4-8 (per chapter)         | 3-5 per character | 2-3         | 5-8   |
| D (Full Campaign)  | 5-10                      | 3-5 per character | 5-8         | 8-12  |

**IMPORTANT**: If total assets > 8, split asset generation into 2 calls.

---

## 7. No Tilemap Required

**UI Heavy games do NOT use tilemaps.**

- Do NOT call `generate-tilemap`
- Do NOT include tileset assets
- Scenes are composed of backgrounds + UI components + character portraits
- Layout is done via Phaser coordinates (x, y positioning)
