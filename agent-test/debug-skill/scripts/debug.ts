import 'dotenv/config';
import * as path from 'path';
import { debugLoop } from '../src/debug-loop.js';

// =============================================================================
// Run the debug loop on a game project
// =============================================================================
//
// Usage:
//   npx tsx scripts/debug.ts <project-dir> [--max-iterations N] [--dev] [--no-evolve]
//
// Examples:
//   npx tsx scripts/debug.ts ../output/v-2026-03-06T12-00-00/
//   npx tsx scripts/debug.ts ../output/v-proj1/ --max-iterations 5 --dev
//
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`Usage: npx tsx scripts/debug.ts <project-dir> [options]

Options:
  --max-iterations N   Maximum debug iterations (default: 10)
  --dev                Also run dev server probe after build+test pass
  --no-evolve          Skip protocol evolution after the session
  --help               Show this help message`);
    process.exit(0);
  }

  const projectDir = path.resolve(args[0]!);
  const maxIterations = parseIntFlag(args, '--max-iterations') ?? undefined;
  const runDev = args.includes('--dev');
  const evolveAfter = !args.includes('--no-evolve');

  const result = await debugLoop({
    projectDir,
    maxIterations,
    runDev,
    evolveAfter,
  });

  process.exit(result.success ? 0 : 1);
}

function parseIntFlag(args: string[], flag: string): number | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  const val = parseInt(args[idx + 1]!, 10);
  return isNaN(val) ? null : val;
}

main().catch((err) => {
  console.error('Debug loop failed:', err);
  process.exit(1);
});
