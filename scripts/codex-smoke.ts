import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodexAppServer } from '../src/main/codexAppServer.js';
import { prepareSmokeHome } from './smokeHome.js';

const workspace = await mkdtemp(join(tmpdir(), 'noobi-app-server-smoke-'));
const smokeHome = await prepareSmokeHome();
const runtime = new CodexAppServer({ codexHome: smokeHome.path });

try {
  const status = await runtime.start();
  if (!status.account) {
    throw new Error('Codex is not signed in. Run `codex login` before the real smoke test.');
  }
  if (status.models.length === 0) {
    throw new Error('Codex App Server returned no usable models.');
  }

  const model = status.models.find((candidate) => candidate.isDefault) ?? status.models[0]!;
  const threadId = await runtime.startThread({
    cwd: workspace,
    model: model.model,
    sandbox: 'workspace-write',
    approvalPolicy: 'never',
    ephemeral: true,
    developerInstructions:
      'This is an automated App Server smoke test. Modify only the current temporary workspace.',
  });
  const result = await runtime.runTurn({
    threadId,
    cwd: workspace,
    model: model.model,
    effort: model.efforts.includes('low') ? 'low' : model.defaultEffort,
    approvalPolicy: 'never',
    prompt:
      'Create a UTF-8 text file named codex-smoke.txt in the current workspace. Its exact contents must be NOOBI_APP_SERVER_OK with no trailing newline. Then reply only DONE.',
  });

  const content = await readFile(join(workspace, 'codex-smoke.txt'), 'utf8');
  if (content !== 'NOOBI_APP_SERVER_OK') {
    throw new Error(`Smoke artifact did not match. Received ${JSON.stringify(content)}.`);
  }
  if (result.status !== 'completed') {
    throw new Error(`Codex turn ended with status ${result.status}.`);
  }

  process.stdout.write(
    `Noobi Codex smoke passed: ${status.version ?? 'unknown version'}, ${model.displayName}, ${threadId}\n`,
  );
} finally {
  await runtime.stop().catch(() => undefined);
  await rm(workspace, { recursive: true, force: true });
  await smokeHome.cleanup();
}
