<p align="center">
  <img src="docs/images/noobi-app-icon.png" width="112" alt="Noobi.ai app icon">
</p>

<h1 align="center">Noobi.ai</h1>

<p align="center">
  <strong>Turn one game idea into a reviewed, playable Web or Godot game.</strong><br>
  A local-first desktop production agent powered by Codex App Server and Godot 4.
</p>

<p align="center">
  <a href="https://github.com/Innate-Labs/Noobi.ai/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Innate-Labs/Noobi.ai/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/Innate-Labs/Noobi.ai/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/Innate-Labs/Noobi.ai?style=flat"></a>
  <a href="https://github.com/Innate-Labs/Noobi.ai/forks"><img alt="GitHub forks" src="https://img.shields.io/github/forks/Innate-Labs/Noobi.ai?style=flat"></a>
  <img alt="Platform: macOS" src="https://img.shields.io/badge/platform-macOS-11120f">
  <img alt="Developer preview" src="https://img.shields.io/badge/status-developer%20preview-E9A93A">
</p>

<p align="center">
  <a href="#quick-start"><strong>Run from source</strong></a> ·
  <a href="#fork-and-customize"><strong>Fork &amp; customize</strong></a> ·
  <a href="docs/ARCHITECTURE.md"><strong>Architecture</strong></a> ·
  <a href="README.zh-CN.md"><strong>简体中文</strong></a>
</p>

![Noobi.ai production workbench showing the agent pipeline, playable preview, assets and project files](docs/images/noobi-workbench.png)

Noobi.ai gives Codex a bounded game-production loop instead of asking one agent to improvise everything in a single pass. A read-only Planner scopes the work, an Implementer builds inside an isolated project directory, an independent Reviewer checks the result, and the host builds and plays the production output before completion. Failed review, build or playtest checks return to the same Implementer for up to three repair rounds.

> **Current status:** developer preview for macOS. No signed or notarized binary is published yet; run it from source. The output is a standalone Web or Godot 4 project in your own workspace.

### Choose a production plan first

Submitting a new idea or a change request now generates comparable plans before production starts. New games offer 2–3 routes; a small existing-project adjustment may offer one. Review the gameplay loop, scope, assumptions and delivery platform, then choose **Start with this plan**. Planning calls the configured model and consumes analysis quota; it does not implement the game or generate assets. Time and price remain unknown without measured evidence.

Plans are saved locally and can be reopened from the saved-plans menu. Retry/cancel planning without starting a game. The host binds a start to one immutable plan version and prevents duplicate production runs. Visual references are stored independently and remain available after restart; ordinary production attachments still need to be reattached. Use **Edit this plan** to change gameplay, camera, regions, characters, style, platform and scope constraints. Saved edits create a new version and automatically lock changed fields. Validate the edited plan before starting; contradictions block execution. Unlock a field before changing it again. You can also revise in natural language, combine routes, paste/import UTF-8 `.md` or `.txt` plans (up to 12,000 characters / 48 KB), and inspect version history. Existing-project plans retain prior requirements, explain affected systems/save assumptions/regression checks, and bind to the source revision. Use **Add game reference images** to import 1–5 PNG/JPEG/WebP images (12 MiB each, 32 MiB total, up to 16 million pixels). Assign style, character, layout or UI purposes. The planner receives actual images and separates visible facts, design inferences and unknowns. Correct the interpretation, then validate a new plan version before starting. Godot review images are copied and bound to the current build; a screenshot is not proof of working controls or hidden rules. Video understanding is not yet available.

For a stopped or failed project with a started plan, leave the input empty and choose **Continue production** to resume that plan. Entering a new request still opens planning. The **Production progress** panel saves pipeline steps, interruptions, failure reasons and earlier attempts locally. Restarting preserves these records and waits for you to continue. Completed planning and implementation turns can be reused only when the workspace and production settings match; reviews and delivery checks run again. Older projects acquire records on their next start or continuation. This is recovery at completed pipeline steps, not arbitrary tool-level resume, a game-completion percentage.

Each selected plan now retains an execution allowance across restarts: 40 model-turn reservations, 6 corrective passes (including core-loop and visual-sample work), and 6 host reconnections by default. Reservations are saved before dispatch and failed attempts still count. A single turn also stops after 6 host reconnections even if responses briefly resume. Repeating the same findings against unchanged source after a completed repair stops further repair. The progress panel shows the failure category, original error, suggested action, and cumulative counters. On a stopped or failed run you may explicitly add 20 turns, 3 corrective passes and 3 reconnections; this does not start production or clear no-progress evidence. These are execution limits, not a monetary or token spending cap; external calls within a turn and usage before tracking began are not fully measured.

### Playable versions and recovery copies

The inspector's version history preserves delivery-checked game snapshots alongside failure records and manual backups, with file-change counts. Preview the last accepted artifact after a later attempt fails. Restoring first backs up the current workspace, then creates a separate stopped project with the saved source, selected plan, in-project assets and provenance records. The original workspace and newer uploads remain untouched. Old playtest reports become historical evidence; continuing runs validation again.

Legacy Godot builds are preview-only because they lack complete plan and asset bindings. Automatic failure entries store the reason; use manual backup to preserve failed source. Snapshots exclude Git history, dependencies and import caches, external files and browser play-session saves. Each snapshot is limited to 20,000 files / 2 GiB; automatic history cleanup is not implemented. See the [recovery acceptance report](docs/development-plan/reports/09-platform-version-recovery.md).

### 3D scene coverage and sample checks

Godot 3D production now validates a representative scene before expanding content and checks the delivered build again. The host independently inventories models, procedural terrain and MultiMesh objects, comparing actual resources, materials and collision structure with scene intent. Unregistered geometry, unvisited declared scenes and incomplete sampling require repair. Real-input evidence must include changed camera views, player contact with terrain and solid interactables, interaction state changes and screenshots.

The experience report separates automatic scene checks from visual-review priorities. Complete registration does not certify appearance: the independent reviewer still inspects screenshots for placeholder art, style, proportions, lighting, occlusion and collision alignment. This probe currently covers Godot 3D, not Web Three.js scenes; unobserved, undeclared levels are not certified. See the [scene-quality acceptance report](docs/development-plan/reports/10-platform-scene-quality.md).

### Free game audio by default

Noobi bundles 2 music tracks and 16 sound effects under CC0. Music and SFX requests select and import these local files without audio API calls; they retain author, source and license metadata. This is a small existing library, not custom composition. Voice recordings are not included. To use a configured audio service, explicitly choose it in Settings → Media API and save. See [audio sources and licenses](resources/free-audio/LICENSES.md).

## Why Noobi.ai

| | What you get |
| --- | --- |
| **From prompt to playable** | Start with a natural-language brief, let the Agent choose Web or Godot 4, and preview a real standalone game workspace locally. |
| **Review-gated production loop** | Planner → Implementer → Reviewer → formal build → automated playtest. Failed checks trigger up to three bounded repair rounds. |
| **Automatic experience evaluation** | A sandboxed hidden browser exercises core controls, captures evidence, and checks visible gameplay, animation continuity and runtime errors. |
| **Real media pipeline** | Route images, music, speech, sound effects and 3D through configured providers, Codex ImageGen, imported assets or procedural fallbacks. Failed assets remain visible as retryable placeholders. |
| **A workspace you own** | Every game is a normal local project. Inspect the files, continue with Codex, commit it to Git, or take it outside Noobi.ai. |
| **Built to extend** | Add media providers, Codex Skills, MCP servers, agent prompts, project templates, Godot export targets, or an entirely different workbench UI. |

## Quick start

### Requirements

- macOS (the current tested and packaged target)
- Node.js 22.20.0 (see `.nvmrc`) and npm 10.9.3
- a ChatGPT/Codex account
- an available image route: a configured image provider or Codex ImageGen
- Godot 4 with exactly matching Web export templates, only when the Agent selects Godot

```bash
git clone https://github.com/Innate-Labs/Noobi.ai.git
cd Noobi.ai
npm ci
npm run dev
```

On first launch, open **Settings → Codex account** and sign in. Noobi.ai uses an app-private `userData/codex-home`; it does not overwrite your global `~/.codex` configuration.

If Codex cannot be located automatically, point Noobi.ai at a binary explicitly:

```bash
NOOBI_CODEX_BIN=/absolute/path/to/codex npm run dev
```

## From idea to playable project

```mermaid
flowchart LR
    Idea["Idea + reference files"] --> Preflight["Capability and engine preflight"]
    Preflight --> Plan["Planner<br/>read-only"]
    Plan --> Build["Implementer<br/>workspace-write"]
    Build --> Review["Reviewer<br/>read-only"]
    Review --> Pass{"Pass?"}
    Pass -- "No" --> Repair["Repair<br/>up to 3 rounds"]
    Repair --> Review
    Pass -- "Yes" --> EngineBuild["Web build or<br/>Godot import + export"]
    EngineBuild --> Playtest["Hidden-browser playtest<br/>inputs + screenshots + errors"]
    Playtest --> Gate["Host proof gate"]
    Gate -. "Repairable finding" .-> Repair
    Gate --> Done["Playable local project"]
    Gate -. "External blocker" .-> Blocked["Blocked"]
```

The workbench visualizes `Brief → Scaffold → GDD → Assets → World → Code → Verify → Complete`. Those stages explain progress; the Reviewer and host proof gate decide whether a run is actually complete.

![Noobi.ai mascot orchestrating code, animation, 3D, audio and playable worlds](docs/images/noobi-game-agent-poster.png)

## Fork and customize

Noobi.ai is intentionally organized around replaceable boundaries. A useful fork can start small:

| Goal | Start here |
| --- | --- |
| Add or change a media provider | [`mediaProviderStore.ts`](src/main/mediaProviderStore.ts) and [`mediaGenerationService.ts`](src/main/mediaGenerationService.ts) |
| Connect a tool or internal service through MCP | [`mcpConfigManager.ts`](src/main/mcpConfigManager.ts) |
| Change Planner, Implementer, Reviewer or Repair behavior | [`promptTemplateStore.ts`](src/main/promptTemplateStore.ts) and the prompt contracts in [`gameHarness.ts`](src/main/gameHarness.ts) |
| Change the generated game scaffold and project rules | [`workspaceTemplate.ts`](src/main/workspaceTemplate.ts) |
| Build a new production experience | [`src/renderer/components`](src/renderer/components) |
| Add a new host-side dynamic tool | [`mediaToolBroker.ts`](src/main/mediaToolBroker.ts) |

Good first directions include a new provider adapter, Windows/Linux packaging, sample-game galleries, accessibility improvements, and additional deterministic game templates. See the [roadmap](ROADMAP.md) and [contribution guide](CONTRIBUTING.md).

## What is inside

### Production workbench

- eight visible production stages and a live Agent event stream
- command and file-change approvals
- playable loopback preview, project files, and a unified asset library
- Agent-selected Web or Godot 4 workspace with environment and export-template checks
- host-managed timing and animation contracts without a user-facing FPS strategy selector
- Noobi crew characters, role-based motion, selectable studio scenes and an animated fishing background
- persistent projects and resumable Codex Implementer threads

### Media and extension layer

- configurable image, audio and 3D REST providers
- Codex ImageGen fallback for required image generation
- music, speech, vocal effects, procedural WAV and Web Audio paths
- Image reference → AI-authored Three.js source → self-contained GLB, with independent front/side/back captures
- image and file attachments that influence planning, visual direction and asset reuse
- retryable asset work orders that preserve placeholders after generation failures
- native Codex Skills, stdio/HTTP MCP servers, and role-specific prompt customization

### Trust boundaries

- sandboxed Electron Renderer with typed IPC only
- API keys sealed by Electron `safeStorage` and never returned to the Renderer after saving
- localhost-only preview server bound to `127.0.0.1`
- path, symlink, MIME, size, SHA-256 and production-reference validation for generated assets

Read the full [product capability map](docs/PRODUCT_FUNCTIONS.md) and [architecture guide](docs/ARCHITECTURE.md).

## Architecture at a glance

```mermaid
flowchart LR
    User["Creator<br/>prompt + assets"] --> Renderer["React Renderer<br/>workbench · approvals · preview"]

    subgraph Desktop["Electron desktop"]
        Renderer <-->|"typed IPC"| Main["Electron Main<br/>trusted host"]
        Main --> Harness["Game Harness"]
        Main --> Preview["Loopback preview"]
        Main --> Playtest["Experience evaluator"]
        Main --> Environment["Godot environment manager"]
        Main --> Broker["Media tool broker"]
        Main --> Gate["Asset store + host attestation"]
    end

    Harness <-->|"JSONL · stdio"| Codex["Codex App Server"]
    Codex --> Agents["Planner · Implementer · Reviewer"]
    Agents --> Workspace["Web or Godot 4 workspace"]
    Broker --> Providers["Image · audio · 3D providers"]
    Providers --> Gate
    Gate --> Workspace
    Preview --> Workspace
    Playtest --> Preview
    Environment --> Godot["Godot 4<br/>headless import · validate · export"]
    Godot --> Workspace
```

## Development

```bash
npm run typecheck       # renderer + main process
npm test                # unit and integration tests
npm run build           # production renderer and main bundles
npm run verify          # typecheck + tests + production build
npm run smoke:ui        # isolated Electron UI screenshot
```

The following smoke tests use a signed-in Codex account and may consume a small amount of Codex or media-provider quota:

```bash
npm run smoke:codex
npm run smoke:harness
npm run smoke:media
npm run smoke:image
npm run smoke:model3d
npm run smoke:godot
npm run smoke:playtest
```

To produce an unsigned macOS DMG locally:

```bash
npm run package:mac
```

Public distribution still requires Developer ID signing, Apple notarization and stapling.

## Current boundaries

- Web and Godot 4/GDScript workspaces are supported. Godot delivery currently targets a Compatibility-renderer Web export; automatic native macOS, Windows and Linux exports are not connected yet.
- macOS is the current release target. Windows and Linux desktop workflows are on the roadmap.
- Meshy, Tripo and Rodin currently use a synchronous REST gateway contract rather than native asynchronous job orchestration for every vendor.
- 3D defaults to image-guided Three.js authoring. Generate/import a reference, retain an editable shape spec and `.mjs` factory, and review host-rendered GLB captures before delivery. A single image does not determine hidden geometry. The old six-preset generator is no longer the default production route. A 3D API is used only when explicitly selected in Settings.
- Quality and completion depend on the selected model, prompt, dependencies and available media routes. A run that cannot satisfy the proof gate remains `blocked` instead of being presented as complete.

## Contributing

Contributions that make the pipeline safer, more portable or easier to extend are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md), run `npm run verify`, and open a focused pull request. Security reports should follow [`SECURITY.md`](SECURITY.md).

## License

No project license has been published yet. Until the repository owners select and add one, the code remains under the default copyright rules. If you plan to distribute a derivative, watch [the repository issues](https://github.com/Innate-Labs/Noobi.ai/issues) or contact the maintainers first.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Product capabilities](docs/PRODUCT_FUNCTIONS.md)
- [Codex source-reading notes](docs/CODEX_SOURCE_NOTES.md)
- [Roadmap](ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

### Image-guided 3D authoring

See [the runnable reference example](examples/image-threejs/README.md) and [delivery report](docs/development-plan/reports/01-image-threejs.md). Run `npm run smoke:model3d` after installing the project dependencies and Godot with matching templates. Three.js runs only in an isolated authoring/export renderer; Godot remains the final game runtime. Image generation and AI coding still use their configured quotas. No external 3D API is called in the default mode.
