# Template Skill

The Template Skill evolution module for [OpenGame](../../README.md).

Template Skill enables the agent to evolve a minimal, game-agnostic project skeleton (the **meta template**) into a set of **specialized template families** through post-task experience accumulation. Each time the agent completes a game project, this module analyzes the result and extracts reusable structural patterns, gradually building a template library that improves scaffolding quality for future tasks.

## Overview

The agent starts from a single **meta template M0** — a minimal Phaser project skeleton that defines only the universal structure required for any playable game (build toolchain, initialization, asset loading, scene loop, and configuration interface). M0 intentionally makes no assumptions about genre, physics, or gameplay mechanics.

As the agent completes tasks, Template Skill maintains an evolving **template library** through a five-stage pipeline:

```
Completed Game Project
       |
       v
  [Collector]       Read the project file tree and source code
       |
       v
  [Classifier]      Determine the physics regime (LLM + heuristic fallback)
       |
       v
  [Extractor]       Extract class hierarchies, hooks, config schemas, and imports
       |
       v
  [Abstractor]      Generalize game-specific code into reusable templates
       |
       v
  [Merger]          Merge into the template library (create or update a family)
       |
       v
  Template Library  library.json + families/{archetype}/src/
```

Over time, the library grows from M0 into a small set of specialized template families that reflect recurring physics and interaction regimes. In practice, this process consistently yields families corresponding to gravity-based side view, top-down continuous motion, discrete grid logic, path-and-wave dynamics, and UI-driven gameplay. These families are not predefined — they emerge organically from the data.

## Meta Template M0

M0 is the minimal, game-agnostic project skeleton stored in `meta-template/`.

**Core (`meta-template/core/`)** — copied from `templates/core/`:

- Build toolchain: Vite + TypeScript + Tailwind CSS
- Phaser initialization: `main.ts` + `gameConfig.json`
- Scene flow: Preloader → TitleScreen → Level scenes → UI overlays
- Level management: `LevelManager.ts`
- General-purpose FSM: `StateMachine.ts`
- Utility functions: `utils.ts` (initScale, safeAddSound, addCollider, etc.)
- Core UI scenes: Preloader, TitleScreen, UIScene, PauseUIScene, VictoryUIScene, GameOverUIScene, GameCompleteUIScene

**Extension (`meta-template/extension/`)** — abstracted from commonalities across all five module types:

- `BaseGameScene.ts` — minimal scene base class using the Template Method pattern
  - Abstract methods: `setupWorld()`, `createEntities()`
  - Lifecycle hooks: `onPreCreate()`, `onPostCreate()`, `onPreUpdate()`, `onPostUpdate()`
  - Utility methods: `onLevelComplete()`, `onGameOver()`
- `BaseEntity.ts` — minimal entity base class
  - Hooks: `onUpdate()`, `onDamageTaken()`, `onDeath()`
- `_TemplateScene.ts` — copy-and-customize scene template
- `_TemplateEntity.ts` — copy-and-customize entity template
- `manifest.json` — structural description and extension point definitions for M0

M0 deliberately excludes all domain-specific concerns: physics configuration (gravity, grids, paths), character archetypes (Player, Enemy, Tower), behavior systems (Patrol, Chase), and domain managers (BoardManager, WaveManager, DialogueManager).

## Pipeline Components

### Collector (`src/collector.ts`)

Reads a completed game project and produces a `ProjectSnapshot` containing the file tree, file contents, parsed `gameConfig.json`, and a human-readable code summary.

- Recursively collects all `.ts`, `.json`, `.js`, and `.md` files
- Filters out `node_modules`, `dist`, `.git`, and other non-source directories

### Classifier (`src/classifier.ts`)

Determines which physics regime (archetype) a project belongs to. The classifier is **library-aware**: it uses existing family descriptions as context when deciding whether a project matches a known family or represents an entirely new regime.

- **Hybrid engine**: attempts LLM classification first, then falls back to physics-signal heuristics (gravity, grid, path, UI indicators)
- **Open vocabulary**: `GameArchetype` is a plain `string`, not a fixed enum. Category labels are produced dynamically by the classification process
- **Initial state** (empty library): the LLM freely analyzes the code's physics characteristics and assigns a new label
- **After families exist**: the LLM receives a summary of existing families and decides whether to match or create
- Output: `ClassificationResult` (archetype, physicsProfile, confidence)

### Extractor (`src/extractor.ts`)

Performs **rule-based** (no LLM) analysis of the project source code across six dimensions:

1. **File structure** — identifies directory patterns such as `behaviors/`, `characters/`, `entities/`, `systems/`, `towers/`, `ui/`
2. **Class hierarchy** — extracts `class X extends Y` relationships and method signatures via regex
3. **Hook identification** — detects `protected abstract`, `protected override`, and conventionally named protected methods (`on*`, `setup*`, `create*`, `get*`, `check*`)
4. **Config diff** — parses `gameConfig.json` fields that are new relative to the M0 baseline
5. **Import graph** — traces local import dependencies
6. **Key code snippets** — collects full contents of `Base*`/`_Template*`/`utils.ts`/`gameConfig.json`

Output: `ExtractedPatterns`

### Abstractor (`src/abstractor.ts`)

**LLM-driven** generalization that transforms game-specific code into reusable templates:

- Concrete character names → generic placeholders
- Hard-coded values → config references
- Game-specific logic → `TODO`/`override` annotations

Includes a rule-based fallback that directly promotes `Base*`/`_Template*` files as templates when LLM abstraction is unavailable. Output: `AbstractedTemplates` (template file list, hooks, config schema, summary).

### Merger (`src/merger.ts`)

Integrates abstracted patterns into the template library:

- **New family**: created when no matching archetype exists in the library
- **Existing family merge**: hooks are deduplicated by name with occurrence counts accumulated; config fields are deduplicated by path; template files are deduplicated by path, keeping the more complete version; directory structures are unioned; base classes are replaced with the latest version
- **Stability score**: `min(1.0, contributingProjects / 5)` — a family reaches full stability after five contributing projects

Output: updated `TemplateLibrary` + `EvolutionEntry`

### Library Manager (`src/library-manager.ts`)

Handles initialization, persistence, and querying of the template library:

- `library.json` stores metadata only (no large template code blocks, just length information)
- Each family's template files are saved independently to `output/families/{archetype}/src/`
- `family.json` stores per-family metadata

## Directory Structure

```
template-skill/
  package.json
  tsconfig.json
  README.md

  meta-template/                  Meta Template M0
    manifest.json                 Structure description and extension points
    core/                         Minimal project skeleton
      package.json
      tsconfig.json
      vite.config.js
      index.html
      src/
        main.ts
        gameConfig.json
        LevelManager.ts
        StateMachine.ts
        utils.ts
        scenes/
          Preloader.ts
          TitleScreen.ts
          UIScene.ts
          PauseUIScene.ts
          VictoryUIScene.ts
          GameOverUIScene.ts
          GameCompleteUIScene.ts
    extension/                    Shared abstractions across module types
      BaseGameScene.ts
      BaseEntity.ts
      _TemplateScene.ts
      _TemplateEntity.ts

  src/                            Evolution pipeline source
    types.ts                      All data structure definitions
    config.ts                     LLM API configuration and path constants
    collector.ts                  Project file collection
    classifier.ts                 Hybrid LLM + heuristic classification
    extractor.ts                  Rule-based code pattern extraction
    abstractor.ts                 LLM-driven template generalization
    merger.ts                     Library merge logic
    library-manager.ts            Library read/write management
    evolve.ts                     Main orchestrator

  scripts/                        CLI entry points
    init.ts                       Initialize the library
    evolve.ts                     Evolve from completed projects
    status.ts                     Display library status

  output/                         Evolution output (gitignored)
    library.json                  Library manifest
    families/                     Evolved template families
      {archetype}/
        family.json               Family metadata
        src/                      Generalized template code
```

## Usage

### Setup

```bash
cd OpenGame/agent-test/template-skill
npm install
```

Set environment variables for LLM calls (the pipeline falls back to pure heuristics if no key is set):

```bash
export REASONING_MODEL_API_KEY="your-api-key"

# Optional: override default models
export CLASSIFIER_MODEL_NAME="qwen-plus"
export ABSTRACTOR_MODEL_NAME="qwen-plus"
export REASONING_MODEL_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
```

### 1. Initialize the Library

```bash
npx tsx scripts/init.ts
```

Creates an empty template library (M0 only, no families).

### 2. Generate a Game

Use the main OpenGame pipeline (unmodified) to produce a completed game project:

```bash
cd ../
npx tsx scripts/test.ts marvel
# Output lands in output/v-YYYY-MM-DDThh-mm-ss/
```

### 3. Evolve from Completed Projects

```bash
cd template-skill

# Single project
npx tsx scripts/evolve.ts ../output/v-2026-03-06T12-00-00/

# Batch (processed sequentially, simulating experience accumulation)
npx tsx scripts/evolve.ts ../output/v-proj1/ ../output/v-proj2/ ../output/v-proj3/
```

### 4. View Library Status

```bash
npx tsx scripts/status.ts
```

Example output (family names are fully emergent — the initial library is empty):

```
Template Library v5
Created: 2026-03-06T10:00:00.000Z
Updated: 2026-03-06T15:30:00.000Z
Meta Template: /path/to/template-skill/meta-template
Families: 3
Total Evolution Steps: 5

  [gravity] family-gravity-abc123
    Stability: 40%
    Contributing projects: 2
    Template files: 8
    Hooks: 15
    Config extensions: 12
    Discovered at task: #1
    Summary: Side-view with gravity, tilemap, jump/fall behaviors...

  [free_movement] family-free_movement-def456
    Stability: 20%
    Contributing projects: 1
    Template files: 6
    Hooks: 18
    ...

  [ui_state] family-ui_state-ghi789
    Stability: 40%
    Contributing projects: 2
    ...
```

## Key Data Structures

All types are defined in `src/types.ts`:

| Type | Description |
| -------------------- | ---------------------------------------------------------------------- |
| `ProjectSnapshot` | Collector output — file tree, file contents, gameConfig, code summary |
| `ClassificationResult` | Classifier output — archetype, physicsProfile, confidence |
| `ExtractedPatterns` | Extractor output — class hierarchy, hooks, config diff, import graph |
| `AbstractedTemplates` | Abstractor output — generalized template files, hooks, config schema |
| `TemplateFamily` | A single family in the library with all templates and metadata |
| `TemplateLibrary` | Top-level persistent state containing all families and evolution log |
| `EvolutionEntry` | Log entry for each evolution step |

## Relationship to Other Modules

This module is **fully self-contained**. It does not modify any files in `src/tools/`, `scripts/test.ts`, `templates/`, `prompts/`, `docs/`, or `test-cases/`.

- The `meta-template/core/` directory is a physical copy of `templates/core/`, not a symlink or reference.
- LLM calls are implemented independently and do not import internal types from the main agent tools (which depend on `@opengame/sdk`).
- The only external input is completed game projects in `output/v-xxx/`, which are read but never modified.
