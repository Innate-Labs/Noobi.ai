import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { CodexAppServer } from '../src/main/codexAppServer.js';
import { resolveRequiredImageGenerationSkill } from '../src/main/imageGenerationSkillPolicy.js';
import { generateCodexProjectIcon } from '../src/main/projectIconAgent.js';
import { PROJECT_ICON_RELATIVE_PATH } from '../src/main/projectIcon.js';
import type { ProjectRecord } from '../src/shared/contracts.js';

/**
 * Real end-to-end check that a short Codex turn with the $imagegen skill
 * produces a valid PNG game icon. Uses the app's own codex-home by default so
 * the system imagegen skill is available; set NOOBI_SMOKE_CODEX_HOME to
 * override.
 */
const workspace = await mkdtemp(join(tmpdir(), 'noobi-icon-smoke-'));
const codexHome =
  process.env.NOOBI_SMOKE_CODEX_HOME?.trim()
  || join(process.env.HOME ?? '', 'Library', 'Application Support', 'Noobi.ai', 'codex-home');
const runtime = new CodexAppServer({ codexHome });

try {
  const status = await runtime.start();
  if (!status.account) {
    throw new Error('Codex is not signed in. Run `codex login` before the icon smoke test.');
  }
  if (!status.capabilities.imageGeneration) {
    throw new Error('Codex runtime does not report ImageGen capability.');
  }
  const skill = await resolveRequiredImageGenerationSkill(runtime, status);
  if (!skill) throw new Error('The host imagegen skill is not available.');

  const timestamp = new Date().toISOString();
  const project: ProjectRecord = {
    id: 'icon-smoke',
    name: '像素钓鱼佬',
    idea: '在湖边钓鱼、升级鱼竿、收集鱼类图鉴的休闲像素游戏',
    root: workspace,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'draft',
    stage: 'brief',
    engine: 'web',
    targetFrameRate: 60,
    noobiPackOverrideId: null,
    noobiCrewOverride: null,
    model: null,
    threadId: null,
    toolsetVersion: 0,
    activeTurnId: null,
    lastError: null,
    icon: null,
  };

  const icon = await generateCodexProjectIcon(project, runtime, skill);
  if (!icon) throw new Error('Icon turn finished without a valid PNG.');
  const bytes = await readFile(join(workspace, PROJECT_ICON_RELATIVE_PATH));
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Icon file is not a PNG.');
  }
  console.log(`icon-smoke OK: ${PROJECT_ICON_RELATIVE_PATH} (${bytes.length} bytes, source=${icon.source})`);
  console.log(`preview: ${pathToFileURL(join(workspace, PROJECT_ICON_RELATIVE_PATH)).href}`);
} finally {
  await runtime.stop().catch(() => undefined);
  if (process.env.NOOBI_SMOKE_KEEP !== '1') await rm(workspace, { recursive: true, force: true });
}
