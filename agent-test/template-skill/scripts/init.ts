import 'dotenv/config';
import { initializeLibrary } from '../src/library-manager.js';
import { getLibrarySummary } from '../src/library-manager.js';

/**
 * Initialize the template library from Meta Template M0.
 *
 * Usage: npx tsx scripts/init.ts
 */
async function main() {
  console.log('Initializing Template Library from Meta Template M0...\n');

  const library = await initializeLibrary();
  console.log('\n' + getLibrarySummary(library));
  console.log('\nDone. Library is ready for evolution.');
  console.log(
    'Next: generate a game, then run `npx tsx scripts/evolve.ts <project-dir>`',
  );
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
