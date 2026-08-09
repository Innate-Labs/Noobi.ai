import 'dotenv/config';
import { loadLibrary, getLibrarySummary } from '../src/library-manager.js';

/**
 * Display the current state of the template library.
 *
 * Usage: npx tsx scripts/status.ts
 */
async function main() {
  const library = await loadLibrary();

  if (!library) {
    console.log('No template library found.');
    console.log('Run `npx tsx scripts/init.ts` to initialize from M0.');
    process.exit(0);
  }

  console.log(getLibrarySummary(library));
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
