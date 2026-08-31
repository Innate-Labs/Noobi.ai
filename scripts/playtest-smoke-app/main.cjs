const { writeFileSync } = require('node:fs');

const resultPath = process.env.NOOBI_PLAYTEST_SMOKE_RESULT?.trim();
if (resultPath) writeFileSync(resultPath, '{"ok":false,"state":"starting"}\n');

require('../playtest-smoke.cjs');
