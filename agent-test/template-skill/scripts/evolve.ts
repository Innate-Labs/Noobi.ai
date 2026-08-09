import 'dotenv/config';
import * as path from 'path';
import { evolveFromProject, evolveBatch } from '../src/evolve.js';
import { getLibrarySummary } from '../src/library-manager.js';

/**
 * Evolve the template library from one or more completed game projects.
 *
 * Usage:
 *   npx tsx scripts/evolve.ts <project-dir>             # Single project
 *   npx tsx scripts/evolve.ts <dir1> <dir2> <dir3> ...   # Batch evolution
 *
 * Examples:
 *   npx tsx scripts/evolve.ts ../output/v-2026-03-06T12-00-00/
 *   npx tsx scripts/evolve.ts ../output/v-*                          # Glob all outputs
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(
      'Usage: npx tsx scripts/evolve.ts <project-dir> [<project-dir2> ...]',
    );
    console.error('\nExamples:');
    console.error(
      '  npx tsx scripts/evolve.ts ../output/v-2026-03-06T12-00-00/',
    );
    console.error(
      '  npx tsx scripts/evolve.ts ../output/v-proj1/ ../output/v-proj2/',
    );
    process.exit(1);
  }

  const projectDirs = args.map((a) => path.resolve(a));

  if (projectDirs.length === 1) {
    // Single project evolution
    const result = await evolveFromProject(projectDirs[0]!);
    console.log('\n' + getLibrarySummary(result.library));
    process.exit(result.success ? 0 : 1);
  } else {
    // Batch evolution
    const results = await evolveBatch(projectDirs);
    const lastResult = results[results.length - 1];
    if (lastResult) {
      console.log('\n' + getLibrarySummary(lastResult.library));
    }
    const allSuccess = results.every((r) => r.success);
    process.exit(allSuccess ? 0 : 1);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
