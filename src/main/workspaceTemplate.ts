import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ProjectRecord } from '../shared/contracts.js';
import { isTargetFrameRate } from '../shared/contracts.js';

export type WorkspaceProject = Pick<
  ProjectRecord,
  'id' | 'name' | 'idea' | 'createdAt' | 'model' | 'targetFrameRate'
>;

export const NOOBI_HOST_RUNTIME_POLICY_START = '<!-- NOOBI:HOST-RUNTIME-POLICY:START -->';
export const NOOBI_HOST_RUNTIME_POLICY_END = '<!-- NOOBI:HOST-RUNTIME-POLICY:END -->';
export const NOOBI_HOST_RUNTIME_POLICY_VERSION = 2;

const HOST_POLICY_FILES = {
  metadata: '.noobi/project.json',
  agents: 'AGENTS.md',
  skill: '.codex/skills/noobi-game-builder/SKILL.md',
} as const;
const MAX_HOST_POLICY_FILE_BYTES = 2 * 1024 * 1024;
const READ_ONLY_NOFOLLOW = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
const WRITE_EXCLUSIVE_NOFOLLOW = constants.O_CREAT
  | constants.O_EXCL
  | constants.O_WRONLY
  | (constants.O_NOFOLLOW ?? 0);

interface SafeWorkspaceFile {
  path: string;
  relativePath: string;
  content: string;
  mode: number;
}

/**
 * Creates the checked-in, project-local instructions and a playable browser
 * game starter. The caller owns creation/removal of the workspace root.
 * Existing files are never overwritten.
 */
export async function createWorkspaceTemplate(
  workspaceRoot: string,
  project: WorkspaceProject,
): Promise<void> {
  const root = resolveAbsoluteRoot(workspaceRoot);
  await mkdir(root, { recursive: true, mode: 0o755 });

  const files = workspaceFiles(project);
  for (const [relativePath, content] of Object.entries(files)) {
    const target = resolveTemplatePath(root, relativePath);
    await mkdir(dirname(target), { recursive: true, mode: 0o755 });
    await writeFile(target, content, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
  }
}

/** Compatibility name used by the desktop composition layer. */
export const scaffoldWorkspace = createWorkspaceTemplate;

/**
 * Refreshes host-owned runtime policy immediately before a Harness run.
 *
 * All three existing files are read and containment-checked before the first
 * mutation. Each replacement is a same-directory atomic rename, and metadata
 * is committed last because it is the authoritative selected-FPS source.
 */
export async function synchronizeWorkspaceHostPolicy(
  workspaceRoot: string,
  project: Pick<ProjectRecord, 'id' | 'targetFrameRate'>,
): Promise<void> {
  if (!project || typeof project.id !== 'string' || !project.id.trim()) {
    throw new Error('Workspace host policy requires a project id');
  }
  if (!isTargetFrameRate(project.targetFrameRate)) {
    throw new Error('Workspace host policy targetFrameRate must be 30, 60, or 120');
  }

  const root = await canonicalWorkspaceRoot(workspaceRoot);
  const [metadataFile, agentsFile, skillFile] = await Promise.all([
    readSafeWorkspaceFile(root, HOST_POLICY_FILES.metadata),
    readSafeWorkspaceFile(root, HOST_POLICY_FILES.agents),
    readSafeWorkspaceFile(root, HOST_POLICY_FILES.skill),
  ]);
  const metadata = parseHostProjectMetadata(metadataFile.content, project.id);
  metadata.targetFrameRate = project.targetFrameRate;

  const agentsContent = placeManagedRuntimePolicy(
    agentsFile.content,
    project.targetFrameRate,
    false,
  );
  const skillContent = placeManagedRuntimePolicy(
    skillFile.content,
    project.targetFrameRate,
    true,
  );
  const metadataContent = `${JSON.stringify(metadata, null, 2)}\n`;

  await atomicallyReplaceSafeWorkspaceFile(root, agentsFile, agentsContent);
  await atomicallyReplaceSafeWorkspaceFile(root, skillFile, skillContent);
  await atomicallyReplaceSafeWorkspaceFile(root, metadataFile, metadataContent);
}

function workspaceFiles(project: WorkspaceProject): Record<string, string> {
  const packageName = packageSlug(project.name);
  const safeTitle = escapeHtml(project.name);
  const metadata = {
    schemaVersion: 1,
    id: project.id,
    name: project.name,
    idea: project.idea,
    createdAt: project.createdAt,
    model: project.model,
    targetFrameRate: project.targetFrameRate,
    starter: 'noobi-browser-game',
  };

  return {
    '.gitignore': ['node_modules/', '.DS_Store', '*.log', '.env', '.env.*', '!.env.example', ''].join(
      '\n',
    ),
    '.noobi/project.json': `${JSON.stringify(metadata, null, 2)}\n`,
    '.codex/skills/noobi-game-builder/SKILL.md': gameBuilderSkill(project),
    'public/assets/asset-pack.json': `${JSON.stringify(
      {
        version: 1,
        projectId: project.id,
        updatedAt: project.createdAt,
        assets: [],
      },
      null,
      2,
    )}\n`,
    'AGENTS.md': projectAgents(project),
    'GAME_DESIGN.md': gameDesign(project),
    'README.md': projectReadme(project),
    'package.json': `${JSON.stringify(
      {
        name: packageName,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite --host 127.0.0.1',
          build: 'vite build',
          preview: 'vite preview --host 127.0.0.1',
        },
        devDependencies: {
          vite: '^6.0.7',
        },
      },
      null,
      2,
    )}\n`,
    'index.html': `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>${safeTitle}</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <main id="app" aria-label="${safeTitle}">
      <canvas id="game" width="960" height="540"></canvas>
      <p class="hint">WASD / 方向键移动 · 点击画面重新开始</p>
    </main>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
    'src/main.js': browserGameStarter(project),
    'src/style.css': starterStyles(),
  };
}

function projectAgents(project: WorkspaceProject): string {
  const content = `# Noobi.ai Game Project

## Product goal

Build and iteratively improve a playable game based on this brief:

> ${asMarkdownQuote(project.idea)}

## Required workflow

1. Inspect the existing project before editing it.
2. Keep \`GAME_DESIGN.md\` aligned with the current rules, controls, game loop, and acceptance checks.
3. Work through the earliest affected stage: Brief → Scaffold → GDD → Assets → World → Code → Verify.
4. Prefer a small playable vertical slice. Build complex games as ordered, playable vertical slices, finishing and verifying one end-to-end loop before adding another level, system, or content pack.
5. Every Planner pass must include an explicit animation needs assessment: classify the presentation as 2D, 2.5D, or actual 3D; choose \`generate\`, \`reuse\`, or \`not-needed\` after inspecting the workspace; cite evidence; and define the frame/clip playback or programmatic feedback path.
6. The host-selected production target is **${project.targetFrameRate} FPS**. Audit engine timing, animation timing, asset metadata, and runtime variant selection against that exact target on every pass.
7. At the Assets stage, inventory what already exists in \`public/assets/asset-pack.json\` before generating or importing anything.
8. Run the cheapest relevant checks after each focused change and run \`npm run build\` before declaring completion.
9. Report exactly what changed, what was verified, and any remaining limitation.

## Target frame-rate contract

- Target ${project.targetFrameRate} updates/frames per second where the engine and physical display permit. Keep gameplay deterministic with elapsed-time or bounded fixed-step simulation; never tie movement, collision, cooldown, particles, audio cues, or animation duration to a raw rendered-frame count.
- Treat simulation rate, presentation rate, display refresh, and source animation sample rate as separate values. A 120 FPS simulation may take two steps per callback on a 60 Hz display; do not claim 120 visibly distinct frames without measurement, and cap catch-up work after stalls.
- Generated or reused animation variants must record \`targetFps=${project.targetFrameRate}\`, \`sourceAnimationFps\`, \`frameCount\`, \`durationMs\`, \`timingMode\`, and a stable variant/group id in manifest or adjacent metadata. Production code must select the ${project.targetFrameRate} FPS variant, or a shared asset explicitly verified and tagged as compatible.
- ${project.targetFrameRate} FPS does not require ${project.targetFrameRate} unique bitmap poses each second. Choose keyframe density for the motion and style, then preserve duration with deterministic holds, interpolation, skeletal animation, morph targets, or engine sampling. Duplicating identical frames does not improve quality.
- When the target changes, old timing constants, caches, exports, and target-specific assets are stale until inspected. Replace, resample, retag, or reselect them and remove production references to incompatible variants. Record the decision in \`GAME_DESIGN.md\`.

## Asset pipeline

- A host-trusted generated image is required for every Noobi.ai game. Follow the current host prompt: call \`noobi_image_generate\` when a configured image API is active and follow its Codex ImageGen fallback instruction otherwise. The accepted result must exist under \`public/assets/images/\`, be registered in the manifest, and be visibly loaded by the running game before the task can complete. Manifest provider text alone is never generation proof.
- Treat animation generation as a separate three-state decision from the general host-trusted image-generation gate. Use \`generate\` only when the required animation asset is absent or this run changes its states, style, scale, frame geometry, anchor, or view; use \`reuse\` only after verifying existing multi-pose frames, a sprite sheet, or a real rigged-GLB animation clip and its playback code; use \`not-needed\` only when pose/form changes do not benefit the requested result.
- For 2D/2.5D \`generate\`, call \`noobi_image_generate\` and follow its Codex ImageGen fallback when needed; lock subject design, style, palette, scale, frame dimensions, anchor, and view/camera angle across keyframes or a sprite sheet. For actual 3D, use \`noobi_model3d_generate\` when configured or integrate a real animation clip from a self-contained rigged GLB; generated reference art cannot substitute for or prove a 3D clip.
- A \`reuse\` assessment must cite exact project-relative asset and playback-code paths and prove at least two different poses or the required GLB clip. Do not regenerate an already suitable animation asset merely because a new run started. A \`not-needed\` assessment must state the concrete reason and still provide visible programmatic motion or responsive feedback tied to input or game state.
- Animation generation and reuse must follow the ${project.targetFrameRate} FPS contract above. Asset sample rate may be lower than render rate, but its metadata, duration, and deterministic playback must prove motion quality at the selected target.
- A Canvas, SVG, CSS, or procedural-geometry renderer does not waive the generated-image requirement. Programmatic visuals may support the art direction or act as load-failure fallbacks, but they cannot replace the host-attested generated image.
- If both the configured image API and Codex ImageGen fallback are unavailable, or output cannot be ingested and used, report the task as blocked. Do not claim completion.
- Never use an image straight from a Codex home, temporary, or absolute path. Never embed raw base64 generation output in source, logs, or the manifest.
- Register workspace assets with \`noobi_asset_register\` when available. Otherwise update \`public/assets/asset-pack.json\` with the real relative path, MIME type, byte size, SHA-256, source, and creation time; do not invent metadata.
- Every \`noobi_audio_generate\` call must set an explicit \`purpose\`: \`music\`, \`speech\`, \`vocal-sfx\`, \`sfx\`, or \`ambience\`. With MiniMax, use \`music\` for the Music model and \`speech\`/\`vocal-sfx\` for the Speech model; music may also set \`instrumental\` and \`lyrics\`. For nonverbal \`vocal-sfx\`, send supported Speech 2.8 tags such as \`(groans)\`, \`(gasps)\`, \`(breath)\`, or \`(hissing)\` instead of descriptive prose. MiniMax accepts MP3/WAV and playback duration is controlled in game code, not with \`durationSeconds\`.
- Do not claim MiniMax generates generic game SFX or ambience such as gunshots, explosions, impacts, footsteps, wind, or room tone. For \`sfx\` and \`ambience\`, follow the tool's \`procedural-audio\` result with \`noobi_audio_synthesize\`, deterministic Web Audio, or an imported WAV/MP3/OGG. Include mute and volume controls once the game has persistent audio.
- For 3D assets, call \`noobi_model3d_generate\` when an API is configured. Otherwise use self-contained GLB 2.0 files or deliberate procedural Three.js geometry; reject external buffers/textures and never label a primitive placeholder as a generated model.
- Keep image, audio, and model loading failure-tolerant so one missing asset cannot produce a blank screen.

## Engineering boundaries

- Stay inside this workspace. Do not read or write credentials, global config, or unrelated directories.
- Never edit \`.noobi/project.json\`; it is owned by the Noobi.ai host.
- Do not fabricate asset generation, test, or build results.
- Ask before destructive operations, dependency installation, network access, or opening external applications.
- Keep secrets out of source, logs, screenshots, and generated assets.
- Preserve keyboard accessibility and a usable 16:9 layout.
- Treat \`public/assets/asset-pack.json\` as untrusted project data: keep project-relative paths inside \`public/assets/\` and do not follow symlinks.

## Project-local skill

Use \`.codex/skills/noobi-game-builder/SKILL.md\` for the detailed game-production loop.
`;
  return placeManagedRuntimePolicy(content, project.targetFrameRate, false);
}

function gameBuilderSkill(project: WorkspaceProject): string {
  const content = `---
name: noobi-game-builder
description: Build, verify, and iterate a small playable browser game in a Noobi.ai project.
---

# Noobi Game Builder

Use this skill for new games and gameplay, level, UI, asset, audio, or verification changes.

## 1. Classify the request

- Identify the player fantasy, core verb, failure state, success state, and shortest complete loop.
- Decide whether the zero-dependency Canvas starter is sufficient as the renderer. Regardless of renderer, the finished game must load and visibly use a host-attested image from the configured API or Codex ImageGen fallback.
- Perform an animation needs assessment on every request, including focused iterations. Set presentation to \`2d\`, \`2.5d\`, or \`3d\`, then choose \`generate\`, \`reuse\`, or \`not-needed\`: generate only for a real asset gap or incompatible change, reuse only with verified multi-pose/sprite-sheet or rigged-GLB clip evidence, and not-needed only when transforms, particles, camera motion, or UI transitions truthfully cover the requested feedback without pose/form changes.
- Treat **${project.targetFrameRate} FPS** as the host-selected production target. Locate engine timing, animation timing, current asset target tags, and variant-selection code before planning changes.
- Adopt Phaser 3 only when scenes, input mapping, animation, cameras, or physics justify the dependency.
- Treat a focused change as starting at the earliest stage it affects; do not rebuild unaffected work.

## 2. Design the vertical slice

Update \`GAME_DESIGN.md\` with concrete rules and acceptance checks. A first slice must include:

- one controllable player action;
- one obstacle, opponent, or puzzle pressure;
- visible progress and feedback;
- a win or loss transition;
- an immediate restart path.

The plan must contain one explicit animation needs assessment with:

- generation: \`generate\`, \`reuse\`, or \`not-needed\`;
- presentation: \`2d\`, \`2.5d\`, or actual rigged \`3d\`;
- rationale tied to the requested playable result;
- animated subjects and gameplay states, or \`none\`;
- evidence: exact existing asset/playback-code paths for reuse, the concrete gap for generate, or \`none\` for not-needed;
- production path: generated frame/sheet or GLB-clip plan, verified reuse path, or concrete programmatic motion/feedback.
- target-FPS path: deterministic update/presentation timing, source animation sample density and duration, asset metadata, runtime variant selection, and evidence for ${project.targetFrameRate} FPS.

For a complex game, add slices in this order unless the brief requires another dependency order:

1. one complete core loop with its production asset-loading path and at least one visibly used host-generated image;
2. coherent supporting presentation and explicit asset-load fallback behavior;
3. one representative level with audio, HUD, pause, and save/load where relevant;
4. additional enemies, levels, progression, and content as independently testable packs;
5. performance, accessibility, balancing, and final playtest passes.

Set explicit budgets for texture dimensions, concurrent sounds, model count, triangle count, draw calls, and initial download size before scaling content.

## 3. Produce and integrate assets

- Read \`public/assets/asset-pack.json\` before creating duplicates.
- Image generation is mandatory, even when the brief does not explicitly request bitmap art. Read the manifest and current host attestation first; call \`noobi_image_generate\` for the configured API route and follow its \`codex-imagegen\` fallback instruction when no API is active. Select a coherent art direction, keep prompts specific to in-game use, and ensure the accepted output is ingested into \`public/assets/images/\`.
- Register the accepted image, reference its project-relative path from production code, and verify that it is visibly rendered in the running game. A generated file that is unused does not satisfy the requirement.
- For 2D/2.5D generation=\`generate\`, call \`noobi_image_generate\` and use Codex ImageGen only when that tool returns its fallback, producing at least two distinct keyframes or one sprite sheet. Prefer one coherent sheet or a shared reference workflow; hold subject design, art style, palette, lighting, scale, frame size, anchor, and view/camera angle constant, and document frame order and timing.
- For generation=\`reuse\`, inspect the real files before claiming reuse. Verify at least two genuinely different frames or multiple pose regions in a sheet, or a required animation clip in a self-contained rigged GLB; cite exact paths and keep or complete the production playback. If evidence fails, switch to \`generate\` and explain the invalidation.
- For actual 3D animation, play a real GLB animation clip on the rigged mesh. ImageGen can provide a design reference or an explicitly chosen billboard alternative, but an image is never evidence that a 3D clip exists. If the required clip cannot be supplied, report a blocker.
- For generation=\`not-needed\`, do not fabricate frame assets. Persist the rationale in \`GAME_DESIGN.md\` and implement visible programmatic motion or state feedback instead.
- For every generated or reused animation, record \`targetFps=${project.targetFrameRate}\`, \`sourceAnimationFps\`, \`frameCount\`, \`durationMs\`, \`timingMode\`, and a stable variant/group id in manifest or adjacent metadata. Select the matching variant at runtime, or explicitly tag and verify a shared asset as compatible with ${project.targetFrameRate} FPS.
- Do not equate target FPS with unique bitmap count. Author only the keyframe density the motion/style needs and preserve duration through deterministic frame holds, interpolation, skeletal animation, morph targets, or engine sampling. Never duplicate frames merely to claim ${project.targetFrameRate} FPS.
- When the project target changes, treat old target-specific sheets, clips, exports, caches, and timing constants as stale. Replace, resample, retag, or reselect them; remove incompatible production references and document the choice in \`GAME_DESIGN.md\`.
- Never reference generated output outside the workspace and never paste raw image base64 into project files.
- Call \`noobi_audio_generate\` with an explicit \`purpose\` on every request. Route MiniMax \`music\` to its Music model and \`speech\`/\`vocal-sfx\` to its Speech model; pass \`instrumental\` and \`lyrics\` only when they truthfully describe the requested music. Nonverbal vocal effects use supported Speech 2.8 tags such as \`(groans)\`, \`(gasps)\`, \`(breath)\`, or \`(hissing)\`, not a sentence describing the sound. MiniMax output is MP3/WAV; loop and trim behavior belongs in production playback code.
- Never describe MiniMax as a generic gunshot, explosion, impact, footstep, ambience, or Foley generator. A \`purpose\` of \`sfx\` or \`ambience\` intentionally returns \`procedural-audio\`; then use \`noobi_audio_synthesize\`, deterministic Web Audio, or an imported WAV/MP3/OGG with a mute path.
- Prefer \`noobi_model3d_generate\` when configured and self-contained GLB 2.0 models otherwise. When no service/asset exists, create deliberate procedural Three.js geometry. An image-to-3D workflow must start from a real reference image and pass silhouette, multi-angle, material, and animation checks before use.
- Register real outputs through \`noobi_asset_register\` when available. Keep the manifest attributable and never invent hashes, sizes, providers, or test results.

## 4. Implement safely

- Reuse programmatic shapes, gradients, typography, and Web Audio when they fit the art direction or provide an explicit fallback, but never treat them as satisfying the host-generated image gate.
- For generated or reused 2D/2.5D animation, load the real keyframe assets and advance frames during gameplay with explicit timing and state transitions. Merely moving one static image, rendering a full sheet without cropping, or leaving poses unused is not animation integration.
- For generated or reused actual 3D animation, select and play the real GLB clip through the engine animation system. Rotating or translating the entire mesh does not prove clip playback.
- For a \`not-needed\` animation assessment, ensure the promised transform, particle, camera, or UI motion responds visibly to input or game state and remains usable with reduced-motion preferences where applicable.
- Drive simulation with elapsed time or a bounded fixed-step accumulator at ${project.targetFrameRate} Hz. Keep gameplay and animation duration stable across physical refresh rates, cap catch-up work after stalls, and distinguish measured display presentation from simulation steps—especially when a 120 Hz simulation runs on a 60 Hz display.
- Keep source files readable and separate simulation state from rendering when complexity grows.
- Do not claim that an image, audio, video, tilemap, or engine tool ran unless its output exists in the workspace.
- Make asset loading asynchronous and resilient. A missing or invalid asset must produce a visible fallback and diagnostic, not a blank game.
- Keep generated and imported content attributable in \`public/assets/asset-pack.json\`.

## 5. Verify

Run checks in this order when available:

1. syntax or type checks for changed files;
2. \`npm run build\`;
3. focused automated gameplay checks;
4. a browser smoke test covering load, input, progress, win/loss, restart, and console errors.

For media-heavy or 3D work, also verify asset load failures, mute/volume behavior, representative low-end performance, GLB materials from more than one camera angle, and that every manifest path resolves from a production build.

Before handing off any game, verify all three generated-image acceptance conditions: the host has a private path/SHA proof from the configured API or Codex ImageGen fallback, the project-relative path resolves in the production build, and the running game visibly uses it. Manifest provider fields alone do not count. If any condition fails, continue fixing or report a blocker instead of claiming completion.

Also verify the animation branch. \`generate\` must be justified by a real gap/change and produce consistent new 2D/2.5D frames or a real 3D clip with playback. \`reuse\` must cite and validate existing multi-pose frames/sheet or a rigged-GLB clip plus production playback, without needless regeneration. \`not-needed\` must have a defensible rationale plus visible programmatic motion or feedback. Missing or misclassified state, unproven reuse, inconsistent/unused frames, a non-playing clip, static-only rendering, or absent feedback requires repair.

Verify the ${project.targetFrameRate} FPS path from actual code and metadata. Reject frame-count-dependent gameplay speed, unbounded catch-up, stale timing constants, missing/mismatched target tags, the wrong runtime variant, a target change without an animation audit, duplicated frames presented as quality, or an unmeasured claim of ${project.targetFrameRate} distinct displayed frames.

If a check cannot run, state why and leave a reproducible command. Never convert a failed check into a claimed pass.

## 6. Hand off

Summarize the playable result, controls, files changed, checks run, and the next highest-value improvement.
`;
  return placeManagedRuntimePolicy(content, project.targetFrameRate, true);
}

function gameDesign(project: WorkspaceProject): string {
  return `# ${project.name} — Game Design

## Brief

${project.idea}

## Player fantasy

Turn the brief into one sentence describing what the player gets to feel and do.

## Core loop

1. Move through the arena.
2. Collect objectives while avoiding hazards.
3. Reach the target score to win; touching a hazard ends the run.
4. Restart immediately and improve the result.

## Controls

- Move: WASD or arrow keys
- Restart: click/tap the game after a win or loss

## Target frame rate

- Selected target: **${project.targetFrameRate} FPS**
- Simulation: deterministic ${project.targetFrameRate} Hz fixed-step or equivalent elapsed-time implementation with bounded catch-up
- Presentation: requestAnimationFrame with a ${project.targetFrameRate} FPS cap/target, limited truthfully by physical display refresh
- Animation variants: record target FPS, source animation FPS, frame count, duration, timing mode, and stable variant/group id; select a matching or explicitly compatible variant at runtime
- FPS changes: replace, resample, retag, or reselect stale target-specific assets and timing code rather than silently retaining an incompatible variant

## Animation needs assessment

- Generation: \`generate\`, \`reuse\`, or \`not-needed\`
- Presentation: \`2d\`, \`2.5d\`, or actual rigged \`3d\`
- Rationale: Explain why this generation state fits the playable result.
- Subjects and states: List animated subjects and states, or \`none\`.
- Evidence: Cite exact existing asset and playback-code paths for reuse, the concrete asset gap for generate, or \`none\` for not-needed.
- Production path: Define the generated keyframes/sprite-sheet or GLB-clip layout and playback timing, the verified reuse path, or the concrete programmatic motion/feedback.
- Target-FPS path: Define source sample/keyframe density, exact animation duration, target metadata, runtime variant selection, and ${project.targetFrameRate} FPS verification. Do not require ${project.targetFrameRate} unique bitmap frames per second when timed holds/interpolation or engine sampling preserves the intended motion.

## Acceptance checks

- The game loads without a blank screen or console error.
- Keyboard input produces immediate visible movement.
- The score increases when an objective is collected.
- Collision with a hazard produces a clear loss state.
- Reaching the target score produces a clear win state.
- The game can restart without reloading the page.
- The host has a private path/SHA attestation for an image produced by the configured API or Codex ImageGen fallback.
- The generated image path resolves from a production build and the running game visibly renders it.
- Canvas, SVG, CSS, or procedural geometry is used only as supporting presentation or a load-failure fallback, not as a substitute for the generated image.
- The animation needs assessment has a justified \`generate\`, \`reuse\`, or \`not-needed\` state and matches the actual presentation/gameplay requirement.
- For 2D/2.5D \`generate\`, new frames keep a consistent subject, style, scale, frame size, anchor, and view/camera angle, and production code visibly plays more than one frame.
- For \`reuse\`, the cited asset contains at least two distinct frames/pose regions or a real rigged-GLB animation clip, and production code actually plays it.
- For actual 3D animation, the running rigged mesh plays a real GLB clip; a static image or whole-mesh transform is not a substitute.
- For \`not-needed\`, the rationale is concrete and the game still provides visible programmatic motion or responsive feedback.
- Simulation/gameplay speed remains deterministic at ${project.targetFrameRate} Hz and does not depend on raw rendered-frame count; catch-up after stalls is bounded.
- Every target-specific animation asset is tagged for ${project.targetFrameRate} FPS and selected by production code, or is explicitly tagged and verified as a shared compatible asset.
- A changed FPS leaves no stale target-specific timing constant or production asset reference, and verification does not confuse simulation steps with physical display refresh.
`;
}

function projectReadme(project: WorkspaceProject): string {
  return `# ${project.name}

${project.idea}

## Run locally

The starter has no runtime dependency and can be served directly by Noobi.ai. For development tooling:

\`\`\`bash
npm install
npm run dev
\`\`\`

Create a production preview with:

\`\`\`bash
npm run build
\`\`\`

The production output is written to \`dist/\` and is preferred by the Noobi.ai preview server.

## Production requirements

Every Noobi.ai run includes an animation needs assessment with \`generate\`, \`reuse\`, or \`not-needed\`. Generate new 2D/2.5D keyframes through the configured image API with Codex ImageGen fallback only when existing animation assets are absent or incompatible; otherwise verify and reuse the existing frame set/sprite sheet. Actual rigged 3D characters use real GLB animation clips, with generated images limited to reference or billboard work. A justified not-needed assessment must still ship visible programmatic motion or gameplay feedback. The separate requirement to register and visibly use a qualifying host-generated image remains in force.

This project targets **${project.targetFrameRate} FPS**. Simulation and animation playback use deterministic elapsed-time/fixed-step timing, while actual presentation remains limited by the display. Animation assets carry target/source FPS and duration metadata and production code selects the matching variant. The target does not require ${project.targetFrameRate} unique bitmap images per second; intentional lower-rate keyframes may use timed holds or interpolation. Changing the target requires an audit and replacement/reselection of stale timing and animation variants.
`;
}

function browserGameStarter(project: WorkspaceProject): string {
  const title = JSON.stringify(project.name);
  const idea = JSON.stringify(project.idea);
  return `const canvas = document.querySelector('#game');
const context = canvas.getContext('2d');
const title = ${title};
const brief = ${idea};
const TARGET_FRAME_RATE = ${project.targetFrameRate};
const FIXED_STEP_SECONDS = 1 / TARGET_FRAME_RATE;
const PRESENTATION_INTERVAL_MS = 1000 / TARGET_FRAME_RATE;
const MAX_CATCH_UP_STEPS = 8;

const state = {
  player: { x: 120, y: 270, radius: 18, speed: 260 },
  goal: { x: 760, y: 270, radius: 13 },
  hazards: [
    { x: 410, y: 160, radius: 24, vx: 0, vy: 95 },
    { x: 565, y: 390, radius: 28, vx: 110, vy: 0 },
  ],
  keys: new Set(),
  score: 0,
  targetScore: 5,
  status: 'playing',
  lastTime: performance.now(),
  accumulatorSeconds: 0,
  lastPresentedAt: 0,
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const overlaps = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;

function reset() {
  state.player.x = 120;
  state.player.y = 270;
  state.goal.x = 720 + Math.random() * 130;
  state.goal.y = 90 + Math.random() * 360;
  state.score = 0;
  state.status = 'playing';
  state.lastTime = performance.now();
  state.accumulatorSeconds = 0;
  state.lastPresentedAt = 0;
}

function update(deltaSeconds) {
  if (state.status !== 'playing') return;
  const left = state.keys.has('ArrowLeft') || state.keys.has('KeyA');
  const right = state.keys.has('ArrowRight') || state.keys.has('KeyD');
  const up = state.keys.has('ArrowUp') || state.keys.has('KeyW');
  const down = state.keys.has('ArrowDown') || state.keys.has('KeyS');
  const horizontal = Number(right) - Number(left);
  const vertical = Number(down) - Number(up);
  const magnitude = Math.hypot(horizontal, vertical) || 1;
  state.player.x = clamp(
    state.player.x + (horizontal / magnitude) * state.player.speed * deltaSeconds,
    state.player.radius,
    canvas.width - state.player.radius,
  );
  state.player.y = clamp(
    state.player.y + (vertical / magnitude) * state.player.speed * deltaSeconds,
    state.player.radius,
    canvas.height - state.player.radius,
  );

  for (const hazard of state.hazards) {
    hazard.x += hazard.vx * deltaSeconds;
    hazard.y += hazard.vy * deltaSeconds;
    if (hazard.x < 80 || hazard.x > canvas.width - 80) hazard.vx *= -1;
    if (hazard.y < 80 || hazard.y > canvas.height - 80) hazard.vy *= -1;
    if (overlaps(state.player, hazard)) state.status = 'lost';
  }

  if (overlaps(state.player, state.goal)) {
    state.score += 1;
    if (state.score >= state.targetScore) {
      state.status = 'won';
    } else {
      state.goal.x = 120 + Math.random() * 720;
      state.goal.y = 90 + Math.random() * 360;
    }
  }
}

function draw() {
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#171b2d');
  gradient.addColorStop(1, '#0b0d14');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  context.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  context.shadowBlur = 24;
  context.shadowColor = '#75f0b2';
  context.fillStyle = '#75f0b2';
  context.beginPath();
  context.arc(state.goal.x, state.goal.y, state.goal.radius, 0, Math.PI * 2);
  context.fill();

  context.shadowColor = '#ff706d';
  context.fillStyle = '#ff706d';
  for (const hazard of state.hazards) {
    context.beginPath();
    context.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
    context.fill();
  }

  context.shadowColor = '#82aaff';
  context.fillStyle = '#82aaff';
  context.beginPath();
  context.arc(state.player.x, state.player.y, state.player.radius, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;

  context.fillStyle = '#f4f5f7';
  context.font = '600 22px system-ui, sans-serif';
  context.fillText(title, 28, 42);
  context.fillStyle = '#aeb5c5';
  context.font = '15px system-ui, sans-serif';
  context.fillText('收集绿色光点，避开红色障碍', 28, 67);
  context.textAlign = 'right';
  context.fillStyle = '#f4f5f7';
  context.font = '600 18px system-ui, sans-serif';
  context.fillText(\`SCORE  \${state.score} / \${state.targetScore}\`, canvas.width - 28, 42);
  context.textAlign = 'left';

  if (state.status !== 'playing') {
    context.fillStyle = 'rgba(5, 7, 12, 0.76)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.fillStyle = state.status === 'won' ? '#75f0b2' : '#ff817e';
    context.font = '700 56px system-ui, sans-serif';
    context.fillText(state.status === 'won' ? 'YOU WIN' : 'TRY AGAIN', canvas.width / 2, 245);
    context.fillStyle = '#f4f5f7';
    context.font = '18px system-ui, sans-serif';
    context.fillText('点击画面重新开始', canvas.width / 2, 292);
    context.textAlign = 'left';
  }
}

function frame(now) {
  const elapsedSeconds = Math.min(Math.max((now - state.lastTime) / 1000, 0), 0.1);
  state.lastTime = now;
  state.accumulatorSeconds += elapsedSeconds;

  let catchUpSteps = 0;
  while (state.accumulatorSeconds + Number.EPSILON >= FIXED_STEP_SECONDS && catchUpSteps < MAX_CATCH_UP_STEPS) {
    update(FIXED_STEP_SECONDS);
    state.accumulatorSeconds -= FIXED_STEP_SECONDS;
    catchUpSteps += 1;
  }
  if (catchUpSteps === MAX_CATCH_UP_STEPS && state.accumulatorSeconds >= FIXED_STEP_SECONDS) {
    state.accumulatorSeconds %= FIXED_STEP_SECONDS;
  }

  const sincePresentation = now - state.lastPresentedAt;
  if (sincePresentation + 0.25 >= PRESENTATION_INTERVAL_MS) {
    draw();
    state.lastPresentedAt = now - (sincePresentation % PRESENTATION_INTERVAL_MS);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (event) => {
  if (event.code.startsWith('Arrow')) event.preventDefault();
  state.keys.add(event.code);
});
window.addEventListener('keyup', (event) => state.keys.delete(event.code));
canvas.addEventListener('pointerdown', () => {
  if (state.status !== 'playing') reset();
});
canvas.title = brief;
requestAnimationFrame(frame);
`;
}

function starterStyles(): string {
  return `:root {
  color: #f4f5f7;
  background: #080a0f;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
}

* { box-sizing: border-box; }

html, body {
  width: 100%;
  min-width: 320px;
  min-height: 100%;
  margin: 0;
}

body {
  min-height: 100vh;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 15%, rgba(82, 102, 172, 0.25), transparent 42%),
    #080a0f;
}

#app {
  width: min(100vw, 1120px);
  padding: 24px;
  text-align: center;
}

#game {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
  touch-action: none;
}

.hint {
  margin: 14px 0 0;
  color: #8e96a8;
  font-size: 13px;
  letter-spacing: 0.03em;
}
`;
}

function managedRuntimePolicy(targetFrameRate: ProjectRecord['targetFrameRate']): string {
  if (!isTargetFrameRate(targetFrameRate)) {
    throw new Error('Workspace host policy targetFrameRate must be 30, 60, or 120');
  }
  return `${NOOBI_HOST_RUNTIME_POLICY_START}
## Noobi host runtime and media policy (managed, v${NOOBI_HOST_RUNTIME_POLICY_VERSION})

- Managed host policy version: \`${NOOBI_HOST_RUNTIME_POLICY_VERSION}\`.
- Current host-selected target: **${targetFrameRate} FPS**.
- The host-owned \`.noobi/project.json\` field \`targetFrameRate=${targetFrameRate}\` is authoritative for this run.
- This managed block overrides any lower, potentially stale text about a different concrete FPS, host media routing or availability, required music, or permitted audio fallbacks. Keep the lower project instructions, but apply their timing and asset-variant rules using ${targetFrameRate} FPS and apply this block's media acceptance gate.
- Agents must not edit \`.noobi/project.json\` or this managed block; Noobi.ai refreshes both before each Harness run.

### Required music contract

- The current run's host media-routing notice is authoritative. When it reports an enabled MiniMax Music service, a complete game must ship with at least one MiniMax-generated music track by default. Do not infer that the routed service is unavailable merely because a planning role cannot call its tool; the implementing role must attempt the required generation.
- Satisfy that requirement by actually calling \`noobi_audio_generate\` with \`purpose=music\`. The accepted audio file must exist under \`public/assets/audio/\`, be registered in \`public/assets/asset-pack.json\` through the asset tools when available or with verified metadata otherwise, and be loaded and played by production game code during normal gameplay (after a user gesture when the browser requires one). A tool call without accepted output, provider text, a manifest-only entry, or an unused file does not count.
- If required music generation, ingestion, loading, or playback fails, repair/retry it or report the game as blocked. Never silently substitute Web Audio, \`AudioContext\` oscillators, or other procedural audio and present that substitute as the required MiniMax music or as successful completion.
- Programmatic audio remains valid for generic non-vocal SFX such as impacts, footsteps, gunshots, and UI cues, including \`noobi_audio_synthesize\` or deterministic Web Audio. Those effects may accompany the generated track but never satisfy or replace the required-music contract.
${NOOBI_HOST_RUNTIME_POLICY_END}`;
}

function placeManagedRuntimePolicy(
  content: string,
  targetFrameRate: ProjectRecord['targetFrameRate'],
  preserveSkillFrontMatter: boolean,
): string {
  const remainder = stripManagedRuntimePolicies(content);
  const block = managedRuntimePolicy(targetFrameRate);
  if (preserveSkillFrontMatter) {
    const frontMatter = /^(---\r?\n[\s\S]*?\r?\n---)(?:\r?\n|$)/u.exec(remainder);
    if (frontMatter?.[1]) {
      const body = remainder.slice(frontMatter[0].length).replace(/^(?:\r?\n)+/u, '');
      return `${frontMatter[1]}\n\n${block}${body ? `\n\n${body}` : '\n'}`;
    }
  }
  const body = remainder.replace(/^(?:\r?\n)+/u, '');
  return `${block}${body ? `\n\n${body}` : '\n'}`;
}

function stripManagedRuntimePolicies(content: string): string {
  let cursor = 0;
  let result = '';
  while (true) {
    const start = content.indexOf(NOOBI_HOST_RUNTIME_POLICY_START, cursor);
    if (start < 0) break;
    const end = content.indexOf(NOOBI_HOST_RUNTIME_POLICY_END, start + NOOBI_HOST_RUNTIME_POLICY_START.length);
    const nestedStart = content.indexOf(NOOBI_HOST_RUNTIME_POLICY_START, start + NOOBI_HOST_RUNTIME_POLICY_START.length);
    if (end < 0 || (nestedStart >= 0 && nestedStart < end)) {
      throw new Error('Workspace contains a malformed Noobi host runtime policy block');
    }
    result += content.slice(cursor, start);
    cursor = end + NOOBI_HOST_RUNTIME_POLICY_END.length;
  }
  result += content.slice(cursor);
  if (
    result.includes(NOOBI_HOST_RUNTIME_POLICY_START)
    || result.includes(NOOBI_HOST_RUNTIME_POLICY_END)
  ) {
    throw new Error('Workspace contains a malformed Noobi host runtime policy block');
  }
  return result;
}

function parseHostProjectMetadata(source: string, projectId: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new Error('Workspace host metadata contains invalid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Workspace host metadata must be a JSON object');
  }
  const metadata = parsed as Record<string, unknown>;
  if (metadata.id !== projectId) {
    throw new Error('Workspace host metadata project id does not match the selected project');
  }
  return metadata;
}

async function canonicalWorkspaceRoot(workspaceRoot: string): Promise<string> {
  const lexical = resolveAbsoluteRoot(workspaceRoot);
  const lexicalInfo = await lstat(lexical);
  if (lexicalInfo.isSymbolicLink()) {
    throw new Error('Workspace root cannot be a symbolic link');
  }
  if (!lexicalInfo.isDirectory()) throw new Error('Workspace root must be a directory');
  return realpath(lexical);
}

async function readSafeWorkspaceFile(
  root: string,
  relativePath: string,
): Promise<SafeWorkspaceFile> {
  const target = resolveTemplatePath(root, relativePath);
  const lexicalInfo = await assertNoSymlinkComponents(root, relativePath);
  if (!lexicalInfo.isFile()) {
    throw new Error(`Workspace host policy target is not a regular file: ${relativePath}`);
  }
  const canonicalTarget = await realpath(target);
  assertWorkspaceContained(root, canonicalTarget, relativePath);

  const handle = await open(target, READ_ONLY_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      throw new Error(`Workspace host policy target is not a regular file: ${relativePath}`);
    }
    if (info.size > MAX_HOST_POLICY_FILE_BYTES) {
      throw new Error(`Workspace host policy target is too large: ${relativePath}`);
    }
    return {
      path: target,
      relativePath,
      content: await handle.readFile('utf8'),
      mode: info.mode & 0o777,
    };
  } finally {
    await handle.close();
  }
}

async function assertNoSymlinkComponents(
  root: string,
  relativePath: string,
): Promise<Awaited<ReturnType<typeof lstat>>> {
  resolveTemplatePath(root, relativePath);
  let current = root;
  let currentInfo: Awaited<ReturnType<typeof lstat>> | null = null;
  const segments = relativePath.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    current = resolve(current, segments[index]!);
    currentInfo = await lstat(current);
    if (currentInfo.isSymbolicLink()) {
      throw new Error(`Workspace host policy path cannot contain a symbolic link: ${relativePath}`);
    }
    if (index < segments.length - 1 && !currentInfo.isDirectory()) {
      throw new Error(`Workspace host policy parent is not a directory: ${relativePath}`);
    }
  }
  if (!currentInfo) throw new Error(`Workspace host policy path is invalid: ${relativePath}`);
  return currentInfo;
}

async function atomicallyReplaceSafeWorkspaceFile(
  root: string,
  original: SafeWorkspaceFile,
  content: string,
): Promise<void> {
  if (content === original.content) return;
  const current = await readSafeWorkspaceFile(root, original.relativePath);
  if (current.content !== original.content) {
    throw new Error(`Workspace host policy target changed during synchronization: ${original.relativePath}`);
  }

  const directory = dirname(original.path);
  const canonicalDirectory = await realpath(directory);
  assertWorkspaceContained(root, canonicalDirectory, original.relativePath);
  const temporaryPath = resolve(
    directory,
    `.${original.relativePath.split('/').at(-1)}.${process.pid}.${randomUUID()}.tmp`,
  );
  assertWorkspaceContained(root, temporaryPath, original.relativePath);

  const handle = await open(temporaryPath, WRITE_EXCLUSIVE_NOFOLLOW, current.mode || 0o644);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  await handle.close();

  try {
    const latest = await readSafeWorkspaceFile(root, original.relativePath);
    if (latest.content !== original.content) {
      throw new Error(`Workspace host policy target changed during synchronization: ${original.relativePath}`);
    }
    await rename(temporaryPath, original.path);
    await syncDirectory(directory);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function assertWorkspaceContained(root: string, target: string, relativePath: string): void {
  const fromRoot = relative(root, target);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`Workspace host policy path escapes the root: ${relativePath}`);
  }
}

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === 'win32') return;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(directory, constants.O_RDONLY);
    await handle.sync();
  } catch {
    // File fsync + same-directory rename still provides atomic replacement on
    // filesystems that do not support directory fsync.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function resolveAbsoluteRoot(root: string): string {
  if (!root || !isAbsolute(root)) {
    throw new Error('Workspace root must be an absolute path');
  }
  return resolve(root);
}

function resolveTemplatePath(root: string, relativePath: string): string {
  if (!relativePath || relativePath.includes('\\') || relativePath.includes('\0')) {
    throw new Error(`Invalid workspace template path: ${relativePath}`);
  }
  const target = resolve(root, relativePath);
  const fromRoot = relative(root, target);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`Workspace template path escapes the root: ${relativePath}`);
  }
  return target;
}

function packageSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64);
  return slug || 'noobi-game';
}

function asMarkdownQuote(value: string): string {
  return value.replace(/\r?\n/gu, '\n> ');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
