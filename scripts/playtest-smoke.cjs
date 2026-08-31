const { app } = require('electron');
const { writeFileSync } = require('node:fs');

const keepAlive = setInterval(() => undefined, 1_000);

async function launch() {
  try {
    await import('./playtest-smoke.mjs');
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    const resultPath = process.env.NOOBI_PLAYTEST_SMOKE_RESULT?.trim();
    if (resultPath) {
      writeFileSync(resultPath, `${JSON.stringify({ ok: false, state: 'bootstrap-error', error: message }, null, 2)}\n`);
    }
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    app.quit();
  } finally {
    clearInterval(keepAlive);
  }
}

app.on('window-all-closed', () => undefined);
if (app.isReady()) void launch();
else app.once('ready', () => void launch());
