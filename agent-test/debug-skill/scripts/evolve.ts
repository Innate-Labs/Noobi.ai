import 'dotenv/config';
import * as path from 'path';
import { evolveFromTrace, evolveBatch } from '../src/evolve.js';

// =============================================================================
// Evolve the debug protocol from completed debug traces
// =============================================================================
//
// Usage:
//   npx tsx scripts/evolve.ts                        # batch: process all traces
//   npx tsx scripts/evolve.ts <trace-path>           # single trace
//   npx tsx scripts/evolve.ts <trace1> <trace2> ...  # multiple traces
//
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`Usage: npx tsx scripts/evolve.ts [trace-paths...]

If no paths given, processes all traces in output/history/.
Each trace-path should point to a trace.json file.

Options:
  --help    Show this help message`);
    process.exit(0);
  }

  if (args.length === 0) {
    // Batch mode: process all history
    const results = await evolveBatch();
    const allSuccess = results.every((r) => r.success);
    process.exit(allSuccess ? 0 : 1);
  }

  // Process specific traces
  let allSuccess = true;
  for (const tracePath of args) {
    const resolved = path.resolve(tracePath);
    console.log(`\nProcessing trace: ${resolved}`);
    const result = await evolveFromTrace(resolved);
    if (!result.success) allSuccess = false;
  }

  process.exit(allSuccess ? 0 : 1);
}

main().catch((err) => {
  console.error('Evolution failed:', err);
  process.exit(1);
});
