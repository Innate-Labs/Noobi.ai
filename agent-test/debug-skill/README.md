# Debug Skill

The Debug Skill evolution module for [OpenGame](../../README.md).

Debug Skill maintains a **living debugging protocol** — a structured, persistent knowledge base that accumulates diagnostic experience across tasks. Each time a failure is observed during build, test, or runtime verification, the protocol records a structured entry containing an error signature, a root cause, and a verified fix. When the same failure pattern repeats across multiple projects, the protocol automatically generalizes it into a reusable validation rule. This makes debugging knowledge cumulative and persistent, improving project reliability over time.

## Overview

The core abstraction is the **debug protocol**: a versioned collection of diagnostic entries and generalized rules that grows as the agent encounters and resolves failures.

The protocol starts from a **seed** — a set of hand-curated entries derived from commonly observed failure patterns in Phaser + TypeScript game projects (e.g., mismatched asset keys, missing scene registrations, incorrect import paths). As the agent runs the debug loop on more projects, novel patterns are recorded and recurring patterns are promoted to automated validation rules.

```
Game Project (with potential errors)
       |
       v
  [Validator]       Pre-execution consistency checks guided by the protocol
       |
       v
  [Runner]          Execute build / test / dev and parse structured errors
       |
       v
  [Diagnoser]       Match errors against known entries; LLM fallback for novel errors
       |
       v
  [Repairer]        Apply known fixes or generate new fixes via LLM
       |
       v
  [Recorder]        Write (signature, cause, fix) back to the protocol
       |
       v
  [Debug Loop]      Orchestrate the above in a REPEAT...UNTIL cycle
       |
       v
  [Generalizer]     Detect repeated patterns and promote them to reusable rules
       |
       v
  Protocol          protocol.json + protocol.md (auto-rendered)
```

## How It Works

### The Debug Loop

The debug loop is the central execution flow. Given a game project, it runs a verify–diagnose–repair cycle until the project builds and runs successfully (or a maximum iteration count is reached):

```
1. Load the current protocol
2. Run pre-execution validations (proactive entries)
3. REPEAT
     3.1  Run `npm run build` → parse errors
     3.2  IF failure:
            Match error signature against the protocol
            Apply the corresponding fix (or generate one via LLM)
            Re-verify to confirm the fix
            Record the (signature, cause, fix) entry if the pattern is new
     3.3  Run `npm run test` → parse errors
     3.4  (same as 3.2)
   UNTIL build + test both pass OR maxIterations reached
4. Optional: run `npm run dev` (server startup probe)
5. Save the debug trace and run the generalizer
6. Persist the updated protocol
```

### Two Types of Protocol Entries

The protocol contains two kinds of entries:

- **Reactive entries** are used during diagnosis. When a failure occurs, the diagnoser matches the error against known reactive entries to find a root cause and verified fix.
- **Proactive entries** are used before execution. The validator runs lightweight consistency checks (e.g., "every texture key used in code exists in `asset-pack.json`") to catch known failure classes before they manifest as build or runtime errors.

### Protocol Evolution

After each debug session, the generalizer scans the protocol for entry groups that share the same error code and exceed a configurable occurrence threshold. When such a group is found, the entries are merged into a **protocol rule** — a reusable validation check that the validator can execute automatically on future projects.

This means the protocol self-improves: the more projects the agent debugs, the more proactive checks it acquires, and the fewer iterations the debug loop needs in the future.

## Seed Protocol

The seed protocol (`seed-protocol/protocol.json`) provides the initial set of entries the protocol starts from. It is derived from commonly observed failure patterns in generated Phaser + TypeScript game projects.

**Reactive entries (7)** — known error patterns for diagnosis:

| Error Code | Stage | Description |
|------------|-------|-------------|
| `TS2307` | build | Incorrect import path (wrong `../` depth or moved file) |
| `TS2339` | build | Property does not exist on type (typo or missing declaration) |
| `TypeError` | runtime | Object accessed before initialization |
| `TextureNotFound` | runtime | Texture key in code does not match `asset-pack.json` |
| `AnimationNotFound` | runtime | Animation key not defined in `animations.json` |
| `SceneNotFound` | runtime | Scene not registered in `main.ts` |
| `RangeError` | runtime | Maximum call stack exceeded (infinite recursion) |

**Proactive entries (7)** — pre-execution consistency checks:

| Check | Description |
|-------|-------------|
| `ASSET_KEY_CONSISTENCY` | All texture/audio keys used in code exist in `asset-pack.json` |
| `CONFIG_FIELD_CONSISTENCY` | All `gameConfig` fields accessed in code are defined in `gameConfig.json` |
| `SCENE_REGISTRATION_CONSISTENCY` | All `scene.start()`/`scene.launch()` targets are registered in `main.ts` |
| `ANIMATION_KEY_CONSISTENCY` | Animation keys form a valid chain: `asset-pack.json` → `animations.json` → code |
| `IMPORT_TYPE_KEYWORD` | TypeScript interface/type imports use the `type` keyword |
| `OVERRIDE_VISIBILITY` | Override methods do not narrow base class visibility |
| `LEVEL_ORDER_MISMATCH` | `LEVEL_ORDER[0]` matches the actual first game scene |

The seed contains no generalized rules — rules emerge through the evolution process.

## Pipeline Components

### Runner (`src/runner.ts`)

Executes `npm run build`, `npm run test`, and `npm run dev` in a target project directory and returns structured results:

- Parses TypeScript compiler errors (error code, file, line, column, message)
- Parses runtime errors (TypeError, ReferenceError, and Phaser-specific errors such as TextureNotFound, AnimationNotFound, SceneNotFound)
- Deduplicates errors automatically
- Output: `RunResult` containing a `ParsedError[]` array

### Validator (`src/validator.ts`)

Runs pre-execution consistency checks derived from the proactive entries and generalized rules in the protocol:

- Asset key consistency: scans source files for texture/audio key references and cross-checks against `asset-pack.json`
- Config field consistency: matches `gameConfig` field accesses in code against `gameConfig.json` definitions
- Scene registration: verifies all `scene.start()`/`scene.launch()` targets are registered in `main.ts`
- Animation key chain: checks the three-layer chain from asset frames to animation definitions to code references
- Import type keyword: flags interface/type imports missing the `type` keyword
- Level order: warns if `LEVEL_ORDER[0]` still contains a template default

Output: `ValidationResult[]`

### Diagnoser (`src/diagnoser.ts`)

Two-phase error diagnosis:

1. **Signature matching** — computes a weighted similarity score between the observed error and known entries in the protocol using error code, message pattern (regex), and file context (glob). Returns the best match above a configurable confidence threshold.
2. **LLM fallback** — for unmatched errors, calls an LLM to analyze the error and produce a candidate `(signature, rootCause, fix)` entry.

Output: `DiagnosisResult` (matched entry or LLM-generated candidate)

### Repairer (`src/repairer.ts`)

Applies fixes in three modes:

1. **Known fix** — retrieves the verified fix from a matched protocol entry and applies it
2. **LLM-generated fix** — applies the fix from an LLM diagnosis candidate
3. **Direct repair** — when no diagnosis is available, sends the error and surrounding file content to an LLM to generate a search-and-replace patch

Supports five fix types: `edit` (search/replace in source), `config` (JSON patch), `shell` (command execution — logged, not auto-executed for safety), `delete`, and `create`.

Output: `RepairResult`

### Recorder (`src/recorder.ts`)

Records the outcome of each diagnosis + repair cycle back to the protocol:

- **Existing entry matched** — increments the occurrence count, updates `lastMatchedAt` and `contributingProjects` (experience reinforcement)
- **Novel pattern** — creates a new `DebugEntry` and appends it to the protocol (only if the fix was verified by a subsequent successful build/test)

Output: updated `DebugProtocol` + `EvolutionEntry`

### Generalizer (`src/generalizer.ts`)

Detects repeated failure patterns and promotes them to reusable rules:

- Groups reactive entries by `errorCode`
- Groups exceeding the generalization threshold (default: 3 occurrences) trigger rule generation
- **Rule generation**: LLM-driven (merges multiple similar entries into a single `ProtocolRule` with executable `ValidationCheck` definitions) with a rule-based fallback
- Generated rules are automatically picked up by the validator for future projects

Output: `GeneralizationResult`

### Evolve (`src/evolve.ts`)

Manages protocol evolution at different granularities:

- `evolveFromTrace(tracePath)` — process a single debug session's trace
- `evolveBatch()` — process all traces in `output/history/`
- `evolveInline(trace, protocol)` — called automatically at the end of a debug loop session

### Protocol Manager (`src/protocol-manager.ts`)

Handles all read/write operations for the protocol:

- Load from disk or initialize from seed
- Save both JSON (`protocol.json`) and auto-rendered Markdown (`protocol.md`)
- Query helpers: find by error code, by tag, by entry kind, by ID
- Record match (increment occurrence count)
- Version management (bump on save)

## Directory Structure

```
debug-skill/
  package.json
  tsconfig.json
  README.md
  .gitignore

  seed-protocol/                  Seed protocol (initial entries)
    manifest.json                 Metadata and extension point definitions
    protocol.json                 Initial (signature, cause, fix) entries

  src/                            Core source
    types.ts                      All data structure definitions
    config.ts                     LLM API configuration, path constants, thresholds

    runner.ts                     Build/test/dev execution and error parsing
    validator.ts                  Pre-execution consistency checks
    diagnoser.ts                  Error diagnosis (signature matching + LLM)
    repairer.ts                   Fix application (known fixes + LLM)
    recorder.ts                   Entry recording to the protocol
    debug-loop.ts                 Main orchestrator (verify–diagnose–repair loop)

    generalizer.ts                Repeated patterns → protocol rules
    evolve.ts                     Evolution pipeline orchestration
    protocol-manager.ts           Protocol read/write and version management

  scripts/                        CLI entry points
    init.ts                       Initialize the protocol from seed
    debug.ts                      Run the debug loop on a project
    evolve.ts                     Evolve from historical debug traces
    status.ts                     Display protocol statistics

  output/                         Evolution output (gitignored)
    protocol.json                 Current protocol
    protocol.md                   Auto-rendered readable Markdown
    history/                      Per-project debug traces
      {project-id}/
        trace.json                Complete debug trace
```

## Usage

### Setup

```bash
cd OpenGame/agent-test/debug-skill
npm install
```

Set environment variables for LLM calls (the pipeline falls back to pure signature matching if no key is set):

```bash
export REASONING_MODEL_API_KEY="your-api-key"

# Optional: override default models
export DIAGNOSER_MODEL_NAME="qwen-plus"
export GENERALIZER_MODEL_NAME="qwen-plus"
export REPAIRER_MODEL_NAME="qwen-plus"
export REASONING_MODEL_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
```

### 1. Initialize the Protocol

```bash
npx tsx scripts/init.ts
```

Creates a live protocol from the seed (seed entries only, no rules).

### 2. Run the Debug Loop

```bash
# Single project
npx tsx scripts/debug.ts ../output/v-2026-03-06T12-00-00/

# With options
npx tsx scripts/debug.ts ../output/v-proj1/ --max-iterations 5 --dev
```

Options:
- `--max-iterations N` — maximum debug iterations (default: 10)
- `--dev` — also run a dev server probe after build + test pass
- `--no-evolve` — skip protocol evolution after the session

### 3. Evolve from Historical Traces

```bash
# Batch: process all traces in output/history/
npx tsx scripts/evolve.ts

# Specific traces
npx tsx scripts/evolve.ts output/history/my-game/trace.json
```

### 4. View Protocol Status

```bash
npx tsx scripts/status.ts
```

Example output:

```
Debug Protocol v8
Created: 2026-04-19T00:00:00.000Z
Updated: 2026-04-19T15:30:00.000Z
Seed: seed-protocol
Entries: 23 (16 reactive, 7 proactive)
Rules: 2
Evolution log: 15 events

── Reactive Entries (Diagnosis) ──
  [build] TS2307               | 5 hit(s)        | Import path incorrect — wrong ../ depth
  [build] TS2339               | 3 hit(s)        | Property not defined on class/interface
  [runtime] TypeError          | 4 hit(s)        | Object accessed before initialization
  ...

── Proactive Entries (Pre-validation) ──
  ASSET_KEY_CONSISTENCY              | Keys referenced in code missing from asset-pack.json
  SCENE_REGISTRATION_CONSISTENCY     | scene.start() targets not registered in main.ts
  ...

── Generalized Rules ──
  TS2307 prevention (import, path)           | action: flag | from 5 entries | prevented: 3
  ...
```

## Key Data Structures

All types are defined in `src/types.ts`:

| Type | Description |
| ------------------- | ----------------------------------------------------------------- |
| `FailureSignature` | Error fingerprint (errorCode, messagePattern, fileContext) |
| `DebugEntry` | Atomic protocol unit: (signature, rootCause, fix) triple |
| `ProtocolRule` | Generalized reusable rule with executable `ValidationCheck` list |
| `DebugProtocol` | Top-level persistent state (entries, rules, evolution log) |
| `DebugTrace` | Complete log of a single debug session |
| `DebugIteration` | Record of one iteration within the debug loop |
| `RunResult` | Structured output from the runner |
| `ParsedError` | Single error extracted from build/test/runtime output |
| `ValidationResult` | Result of a pre-execution validation check |
| `EvolveResult` | Output of the evolution pipeline |

## Relationship to Other Modules

This module is **fully self-contained**. It does not modify any files in `docs/`, `prompts/`, `packages/core/`, or any other existing directory.

- The seed protocol is a one-time structuring of patterns from `docs/debug_protocol.md`; the original file is not referenced at runtime.
- LLM calls are implemented independently and do not import internal types from the main agent tools (which depend on `@opengame/sdk`).
- The only external inputs are completed game projects in `output/v-xxx/`, which are read but never modified.
