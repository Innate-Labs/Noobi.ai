import { appendFile, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createWorkspaceTemplate,
  NOOBI_HOST_RUNTIME_POLICY_END,
  NOOBI_HOST_RUNTIME_POLICY_START,
  NOOBI_HOST_RUNTIME_POLICY_VERSION,
  synchronizeGodotPresentationPolicy,
  synchronizeWorkspaceHostPolicy,
} from './workspaceTemplate.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('createWorkspaceTemplate', () => {
  it('creates a neutral project scaffold with local Agent instructions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-template-'));
    temporaryRoots.push(root);
    await createWorkspaceTemplate(root, {
      id: 'project-template',
      name: 'Signal Garden',
      idea: '收集信号并避开巡逻单位。',
      createdAt: new Date().toISOString(),
      model: null,
      targetFrameRate: 120,
    });

    await expect(readFile(join(root, 'index.html'), 'utf8')).resolves.toContain('<canvas');
    await expect(readFile(join(root, 'AGENTS.md'), 'utf8')).resolves.toContain(
      'small playable vertical slice',
    );
    await expect(
      readFile(join(root, '.codex/skills/noobi-game-builder/SKILL.md'), 'utf8'),
    ).resolves.toContain('Noobi Game Builder');

    const manifest = JSON.parse(
      await readFile(join(root, 'public/assets/asset-pack.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(manifest).toEqual({
      version: 1,
      projectId: 'project-template',
      updatedAt: expect.any(String),
      assets: [],
    });

    const playtest = JSON.parse(
      await readFile(join(root, '.noobi/playtest.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(playtest).toMatchObject({
      schemaVersion: 1,
      engine: 'web',
      entrypoint: { path: 'dist/index.html', readyTimeoutMs: 15_000 },
      actions: {
        start: { inputs: [{ type: 'key', code: 'Enter' }] },
        move: { inputs: [{ type: 'key', code: 'KeyD' }] },
        primary: { inputs: [{ type: 'key', code: 'Space' }] },
        pause: { inputs: [{ type: 'key', code: 'Escape' }] },
        restart: { inputs: [{ type: 'key', code: 'KeyR' }] },
      },
      limits: { maxRunMs: 60_000, stepTimeoutMs: 8_000 },
    });
    expect((playtest as { journey: unknown[] }).journey).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'launch-ready', capture: '00-launch-ready.png' }),
      expect.objectContaining({ id: 'move-player', action: 'move' }),
      expect.objectContaining({ id: 'primary-action', action: 'primary' }),
      expect.objectContaining({
        id: 'pause-game',
        action: 'pause',
        observe: [expect.objectContaining({
          kind: 'screen-change',
          baselineStepId: 'primary-action',
        })],
      }),
      expect.objectContaining({ id: 'restart-game', action: 'restart' }),
    ]));

    const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('noobi_image_generate');
    expect(agents).toContain('host-trusted generated image is required for every Noobi.ai game');
    expect(agents).toContain('Codex ImageGen fallback');
    expect(agents).toContain('visibly loaded by the running game');
    expect(agents).toContain('core visual asset coverage table');
    expect(agents).toContain('`role=card-art-atlas`');
    expect(agents).toContain('plain default Button does not count');
    expect(agents).toContain('does not waive the generated-image requirement');
    expect(agents).toContain('Every Planner pass must include an explicit animation needs assessment');
    expect(agents).toContain('choose `generate`, `reuse`, or `not-needed`');
    expect(agents).toContain('Do not regenerate an already suitable animation asset');
    expect(agents).toContain('self-contained Three.js-authored GLB');
    expect(agents).toContain('real rigged GLB clip');
    expect(agents).toContain('noobi_audio_synthesize');
    expect(agents).toContain('noobi_audio_generate');
    expect(agents).toContain('must set an explicit `purpose`');
    expect(agents).toContain('`music`, `speech`, `vocal-sfx`, `sfx`, or `ambience`');
    expect(agents).toContain('Do not claim MiniMax generates generic game SFX or ambience');
    expect(agents).toContain('gunshots, explosions');
    expect(agents).toContain('`procedural-audio`');
    expect(agents).toContain('noobi_model3d_generate');
    expect(agents).toContain('self-contained GLB 2.0');
    expect(agents).toContain('host automatically prioritizes an active 3D API');
    expect(agents).toContain('built-in Three.js exporter');
    expect(agents).toContain('playable vertical slices');
    expect(agents).toContain('`.noobi/playtest.json`');
    expect(agents).toContain('all five common action mappings');
    expect(agents).toContain('key, pointer, look, drag, and wait');
    expect(agents).toContain('artifacts/playtest/latest/report.json');
    expect(agents).toContain('Never write to `artifacts/playtest/`');
    expect(agents).toContain('host-selected production target is **120 FPS**');
    expect(agents).toContain('targetFps=120');
    expect(agents).toContain('does not require 120 unique bitmap poses');
    expect(agents).toContain('Replace, resample, retag, or reselect');
    expect(agents.startsWith(NOOBI_HOST_RUNTIME_POLICY_START)).toBe(true);
    expect(occurrences(agents, NOOBI_HOST_RUNTIME_POLICY_START)).toBe(1);
    expect(agents).toContain('`.noobi/project.json` field `targetFrameRate=120` is authoritative');
    expectManagedMediaPolicy(agents);

    const skill = await readFile(
      join(root, '.codex/skills/noobi-game-builder/SKILL.md'),
      'utf8',
    );
    expect(skill).toContain('public/assets/asset-pack.json');
    expect(skill).toContain('noobi_asset_register');
    expect(skill).toContain('MiniMax `music` to its Music model');
    expect(skill).toContain('`speech`/`vocal-sfx` to its Speech model');
    expect(skill).toContain('A `purpose` of `sfx` or `ambience` intentionally returns `procedural-audio`');
    expect(skill).toContain('Never describe MiniMax as a generic gunshot, explosion');
    expect(skill).toContain('performance');
    expect(skill).toContain('shortest complete player-experience journey');
    expect(skill).toContain('schemaVersion 1');
    expect(skill).toContain('start, move, primary, pause, restart');
    expect(skill).toContain('host playtest as pending');
    expect(skill).toContain('Image generation is mandatory');
    expect(skill).toContain('A generated file that is unused does not satisfy the requirement');
    expect(skill).toContain('Use unique `subjectId` values for separate card faces');
    expect(skill).toContain('deal/draw, hover/focus, play/move, attack/target');
    expect(skill).toContain('entirely in one rendered frame');
    expect(skill).toContain('never treat them as satisfying the host-generated image gate');
    expect(skill).toContain('Perform an animation needs assessment on every request');
    expect(skill).toContain('Set presentation to `2d`, `2.5d`, or `3d`');
    expect(skill).toContain('For generation=`reuse`, inspect the real files before claiming reuse');
    expect(skill).toContain('hold subject design, art style, palette, lighting, scale, frame size, anchor, and view/camera angle constant');
    expect(skill).toContain('Merely moving one static image');
    expect(skill).toContain('Rotating or translating the entire mesh does not prove clip playback');
    expect(skill).toContain('routes to a configured 3D API first');
    expect(skill).toContain('Three.js fallback output is an asset');
    expect(skill).toContain('set `animation=true`');
    expect(skill).toContain('same-frame automated actions');
    expect(skill).toContain('Treat **120 FPS** as the host-selected production target');
    expect(skill).toContain('sourceAnimationFps');
    expect(skill).toContain('Never duplicate frames merely to claim 120 FPS');
    expect(skill).toContain('bounded fixed-step accumulator at 120 Hz');
    expect(skill.startsWith('---\nname: noobi-game-builder')).toBe(true);
    expect(occurrences(skill, NOOBI_HOST_RUNTIME_POLICY_START)).toBe(1);
    expect(skill.indexOf(NOOBI_HOST_RUNTIME_POLICY_START)).toBeLessThan(
      skill.indexOf('# Noobi Game Builder'),
    );
    expectManagedMediaPolicy(skill);

    const design = await readFile(join(root, 'GAME_DESIGN.md'), 'utf8');
    expect(design).toContain("Define the player's starting state from the brief");
    expect(design).not.toContain('Collect objectives while avoiding hazards');
    expect(design).not.toContain('target score');
    expect(design).toContain('private path/SHA attestation');
    expect(design).toContain('running game visibly renders it');
    expect(design).toContain('## Animation needs assessment');
    expect(design).toContain('Generation: `generate`, `reuse`, or `not-needed`');
    expect(design).toContain('actual rigged `3d`');
    expect(design).toContain('cited asset contains at least two distinct frames/pose regions');
    expect(design).toContain('running rigged mesh plays a real GLB clip');
    expect(design).toContain('Selected target: **120 FPS**');
    expect(design).toContain('target-specific animation asset is tagged for 120 FPS');
    expect(design).toContain('## Player experience journey');
    expect(design).toContain('`.noobi/playtest.json` matches the production controls');
    expect(design).toContain('`artifacts/playtest/latest/report.json` passes every declared step');

    const readme = await readFile(join(root, 'README.md'), 'utf8');
    expect(readme).toContain('Every Noobi.ai run includes an animation needs assessment');
    expect(readme).toContain('verify and reuse the existing frame set/sprite sheet');
    expect(readme).toContain('Actual rigged 3D characters use real GLB animation clips');
    expect(readme).toContain('This project targets **120 FPS**');
    expect(readme).toContain('executable experience route in `.noobi/playtest.json`');
    expect(readme).toContain('Noobi.ai owns the resulting `artifacts/playtest/latest/report.json`');

    const metadata = JSON.parse(
      await readFile(join(root, '.noobi/project.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(metadata.targetFrameRate).toBe(120);
    expect(metadata.starter).toBe('noobi-browser-neutral');

    const starter = await readFile(join(root, 'src/main.js'), 'utf8');
    expect(starter).toContain('NOOBI_HOST_GENERATED_NEUTRAL_STARTER');
    expect(starter).toContain('neutral scaffolding created for a brand-new project');
    expect(starter).toContain('等待 Agent 根据项目需求构建实际玩法');
    expect(starter).not.toContain('收集绿色光点');
    expect(starter).not.toContain('state.hazards');
    expect(starter).not.toContain('state.targetScore');
    expect(starter).toContain('const TARGET_FRAME_RATE = 120');
    expect(starter).toContain('const FIXED_STEP_SECONDS = 1 / TARGET_FRAME_RATE');
    expect(starter).toContain('const MAX_CATCH_UP_STEPS = 8');
    expect(starter).toContain('state.accumulatorSeconds %= FIXED_STEP_SECONDS');
    expect(agents).toContain('They are not prior user code, implemented gameplay, or product requirements');
  });

  it('keeps Three.js as an offline GLB authoring fallback for Godot workspaces', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-godot-model-route-'));
    temporaryRoots.push(root);
    await createWorkspaceTemplate(root, {
      id: 'project-godot-model-route',
      name: 'Godot Model Route',
      idea: 'A small 3D game.',
      createdAt: new Date().toISOString(),
      model: null,
      targetFrameRate: 60,
      engine: 'godot',
    });

    const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
    const skill = await readFile(join(root, '.codex/skills/noobi-game-builder/SKILL.md'), 'utf8');
    const metadata = JSON.parse(
      await readFile(join(root, '.noobi/project.json'), 'utf8'),
    ) as Record<string, unknown>;
    const starter = await readFile(join(root, 'scripts/main.gd'), 'utf8');
    expect(metadata.starter).toBe('noobi-godot-4-neutral');
    expect(starter).toContain('NOOBI_HOST_GENERATED_NEUTRAL_STARTER');
    expect(starter).toContain('NEUTRAL GODOT STARTER');
    expect(starter).not.toContain('TARGET_SCORE');
    expect(starter).not.toContain('hazard_positions');
    expect(starter).not.toContain('goal_position');
    expect(agents).toContain('res://public/assets/models/...');
    expect(agents).toContain('Three.js is build-time asset authoring only');
    expect(skill).toContain('Godot must import/instantiate that GLB');
    expect(skill).toContain('do not install Three.js in the game workspace');
    expect(skill).not.toContain('deliberate Godot ArrayMesh/SurfaceTool/CSG geometry');
  });

  it('migrates Godot boot branding settings safely and idempotently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-godot-branding-policy-'));
    temporaryRoots.push(root);
    await writeFile(join(root, 'project.godot'), [
      'config_version=5',
      '',
      '[application]',
      '',
      'config/name="Legacy"',
      'boot_splash/show_image=true',
      'custom/user_setting="preserved"',
      '',
      '[rendering]',
      'renderer/rendering_method="gl_compatibility"',
      '',
    ].join('\r\n'), 'utf8');
    await writeFile(join(root, 'export_presets.cfg'), [
      '[preset.0.options]',
      '',
      'html/export_icon=true',
      'html/canvas_resize_policy=2',
      '',
    ].join('\r\n'), 'utf8');

    await expect(synchronizeGodotPresentationPolicy(root)).resolves.toBe(true);
    const project = await readFile(join(root, 'project.godot'), 'utf8');
    const preset = await readFile(join(root, 'export_presets.cfg'), 'utf8');
    expect(project).toContain('boot_splash/show_image=false');
    expect(project).toContain('custom/user_setting="preserved"');
    expect(project).toContain('\r\n');
    expect(preset).toContain('html/export_icon=false');
    expect(preset).toContain('html/canvas_resize_policy=2');
    await expect(synchronizeGodotPresentationPolicy(root)).resolves.toBe(false);
    await expect(readFile(join(root, 'project.godot'), 'utf8')).resolves.toBe(project);
    await expect(readFile(join(root, 'export_presets.cfg'), 'utf8')).resolves.toBe(preset);
  });

  it('atomically synchronizes authoritative FPS metadata and managed policy blocks without replacing user content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-policy-sync-'));
    temporaryRoots.push(root);
    const project = {
      id: 'project-policy-sync',
      name: 'Policy Sync',
      idea: 'Preserve the rest of the workspace instructions.',
      createdAt: new Date().toISOString(),
      model: null,
      targetFrameRate: 30 as const,
    };
    await createWorkspaceTemplate(root, project);

    const agentsPath = join(root, 'AGENTS.md');
    const skillPath = join(root, '.codex/skills/noobi-game-builder/SKILL.md');
    await appendFile(agentsPath, '\nUSER_AGENTS_SENTINEL\n', 'utf8');
    await appendFile(skillPath, '\nUSER_SKILL_SENTINEL\n', 'utf8');
    const agentsBefore = await readFile(agentsPath, 'utf8');
    const skillBefore = await readFile(skillPath, 'utf8');

    await synchronizeWorkspaceHostPolicy(root, {
      id: project.id,
      targetFrameRate: 120,
    });

    const metadata = JSON.parse(
      await readFile(join(root, '.noobi/project.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      id: project.id,
      name: project.name,
      idea: project.idea,
      targetFrameRate: 120,
    });

    const agentsAfter = await readFile(agentsPath, 'utf8');
    const skillAfter = await readFile(skillPath, 'utf8');
    for (const content of [agentsAfter, skillAfter]) {
      expect(occurrences(content, NOOBI_HOST_RUNTIME_POLICY_START)).toBe(1);
      expect(occurrences(content, NOOBI_HOST_RUNTIME_POLICY_END)).toBe(1);
      expect(content).toContain('Current host-selected target: **120 FPS**');
      expect(content).toContain('`targetFrameRate=120` is authoritative');
      expect(content).toContain('overrides any lower, potentially stale text');
      expectManagedMediaPolicy(content);
    }
    expect(agentsAfter.startsWith(NOOBI_HOST_RUNTIME_POLICY_START)).toBe(true);
    expect(skillAfter.startsWith('---\nname: noobi-game-builder')).toBe(true);
    expect(skillAfter.indexOf(NOOBI_HOST_RUNTIME_POLICY_START)).toBeLessThan(
      skillAfter.indexOf('# Noobi Game Builder'),
    );
    expect(withoutManagedPolicy(agentsAfter)).toBe(withoutManagedPolicy(agentsBefore));
    expect(withoutManagedPolicy(skillAfter)).toBe(withoutManagedPolicy(skillBefore));
    expect(agentsAfter).toContain('USER_AGENTS_SENTINEL');
    expect(skillAfter).toContain('USER_SKILL_SENTINEL');

    await synchronizeWorkspaceHostPolicy(root, {
      id: project.id,
      targetFrameRate: 120,
    });
    await expect(readFile(agentsPath, 'utf8')).resolves.toBe(agentsAfter);
    await expect(readFile(skillPath, 'utf8')).resolves.toBe(skillAfter);
  });

  it('migrates the versioned media contract into legacy instructions without replacing user content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-policy-legacy-'));
    temporaryRoots.push(root);
    const project = {
      id: 'project-policy-legacy',
      name: 'Legacy Policy',
      idea: 'Keep legacy workspace instructions while adding host policy.',
      createdAt: new Date().toISOString(),
      model: null,
      targetFrameRate: 60 as const,
    };
    await createWorkspaceTemplate(root, project);

    const agentsPath = join(root, 'AGENTS.md');
    const skillPath = join(root, '.codex/skills/noobi-game-builder/SKILL.md');
    const legacyAgents = '# User-owned legacy agents\n\nUSER_AGENTS_LEGACY_SENTINEL\n';
    const skillFrontMatter = [
      '---',
      'name: noobi-game-builder',
      'description: User-maintained legacy skill.',
      '---',
    ].join('\n');
    const legacySkillBody = '# User-owned legacy skill\n\nUSER_SKILL_LEGACY_SENTINEL\n';
    await writeFile(agentsPath, legacyAgents, 'utf8');
    await writeFile(skillPath, `${skillFrontMatter}\n\n${legacySkillBody}`, 'utf8');

    await synchronizeWorkspaceHostPolicy(root, {
      id: project.id,
      targetFrameRate: 60,
    });

    const agentsAfter = await readFile(agentsPath, 'utf8');
    const skillAfter = await readFile(skillPath, 'utf8');
    for (const content of [agentsAfter, skillAfter]) {
      expect(occurrences(content, NOOBI_HOST_RUNTIME_POLICY_START)).toBe(1);
      expect(occurrences(content, NOOBI_HOST_RUNTIME_POLICY_END)).toBe(1);
      expectManagedMediaPolicy(content);
    }
    expect(agentsAfter.startsWith(NOOBI_HOST_RUNTIME_POLICY_START)).toBe(true);
    expect(agentsAfter.endsWith(legacyAgents)).toBe(true);
    expect(skillAfter.startsWith(`${skillFrontMatter}\n\n${NOOBI_HOST_RUNTIME_POLICY_START}`)).toBe(true);
    expect(skillAfter.endsWith(legacySkillBody)).toBe(true);
    expect(occurrences(agentsAfter, 'USER_AGENTS_LEGACY_SENTINEL')).toBe(1);
    expect(occurrences(skillAfter, 'USER_SKILL_LEGACY_SENTINEL')).toBe(1);
    const metadata = JSON.parse(
      await readFile(join(root, '.noobi/project.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(metadata.targetFrameRate).toBe(60);
  });

  it('fails closed on a workspace symlink before changing authoritative metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-policy-symlink-'));
    const externalRoot = await mkdtemp(join(tmpdir(), 'noobi-policy-external-'));
    temporaryRoots.push(root, externalRoot);
    const project = {
      id: 'project-policy-symlink',
      name: 'Policy Symlink',
      idea: 'Reject policy paths that escape through symlinks.',
      createdAt: new Date().toISOString(),
      model: null,
      targetFrameRate: 30 as const,
    };
    await createWorkspaceTemplate(root, project);
    const externalAgents = join(externalRoot, 'AGENTS.md');
    await writeFile(externalAgents, 'EXTERNAL_SENTINEL\n', 'utf8');
    await rm(join(root, 'AGENTS.md'));
    await symlink(externalAgents, join(root, 'AGENTS.md'));

    await expect(synchronizeWorkspaceHostPolicy(root, {
      id: project.id,
      targetFrameRate: 120,
    })).rejects.toThrow('symbolic link');

    expect(await readFile(externalAgents, 'utf8')).toBe('EXTERNAL_SENTINEL\n');
    const metadata = JSON.parse(
      await readFile(join(root, '.noobi/project.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(metadata.targetFrameRate).toBe(30);
  });

  it('refuses to overwrite an existing workspace template', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-template-'));
    temporaryRoots.push(root);
    const project = {
      id: 'project-existing',
      name: 'Existing',
      idea: 'Keep user files.',
      createdAt: new Date().toISOString(),
      model: null,
      targetFrameRate: 30 as const,
    };
    await createWorkspaceTemplate(root, project);
    await expect(createWorkspaceTemplate(root, project)).rejects.toMatchObject({ code: 'EEXIST' });
  });
});

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

function expectManagedMediaPolicy(source: string): void {
  const policy = managedPolicyOf(source);
  expect(policy).toContain(`managed, v${NOOBI_HOST_RUNTIME_POLICY_VERSION}`);
  expect(policy).toContain(
    `Managed host policy version: \`${NOOBI_HOST_RUNTIME_POLICY_VERSION}\``,
  );
  expect(policy).toContain('enabled MiniMax Music service');
  expect(policy).toContain('at least one MiniMax-generated music track');
  expect(policy).toContain('planning role cannot call its tool');
  expect(policy).toContain('`noobi_audio_generate` with `purpose=music`');
  expect(policy).toContain('exist under `public/assets/audio/`');
  expect(policy).toContain('loaded and played by production game code');
  expect(policy).toContain('Never silently substitute procedural or synthesized audio');
  expect(policy).toContain('Programmatic or synthesized audio remains valid for generic non-vocal SFX');
  expect(policy).toContain('never satisfy or replace the required-music contract');
  expect(policy).toContain('### Core visual coverage');
  expect(policy).toContain('`role=card-art-atlas`');
  expect(policy).toContain('deterministic card-art coverage gate');
  expect(policy).toContain('### Interaction-motion acceptance');
  expect(policy).toContain('must span rendered frames');
  expect(policy).toContain('### Experience playtest acceptance');
  expect(policy).toContain('`.noobi/playtest.json` at schemaVersion 1');
  expect(policy).toContain('start, move, primary, pause, and restart');
  expect(policy).toContain('`artifacts/playtest/` is host-owned immutable evidence');
  expect(policy).toContain('host playtest as pending');
}

function managedPolicyOf(source: string): string {
  const start = source.indexOf(NOOBI_HOST_RUNTIME_POLICY_START);
  const end = source.indexOf(NOOBI_HOST_RUNTIME_POLICY_END, start);
  if (start < 0 || end < 0) throw new Error('Managed policy is missing in test fixture');
  return source.slice(start, end + NOOBI_HOST_RUNTIME_POLICY_END.length);
}

function withoutManagedPolicy(source: string): string {
  let result = source;
  while (true) {
    const start = result.indexOf(NOOBI_HOST_RUNTIME_POLICY_START);
    if (start < 0) return result;
    const end = result.indexOf(NOOBI_HOST_RUNTIME_POLICY_END, start);
    if (end < 0) throw new Error('Malformed managed policy in test fixture');
    result = result.slice(0, start) + result.slice(end + NOOBI_HOST_RUNTIME_POLICY_END.length);
  }
}
