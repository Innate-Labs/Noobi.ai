import 'dotenv/config';
import { initFromSeed } from '../src/protocol-manager.js';

// =============================================================================
// Initialize the debug protocol from seed (P0)
// =============================================================================
//
// Usage: npx tsx scripts/init.ts
//
// Creates output/protocol.json from seed-protocol/protocol.json.
// Safe to re-run: overwrites the output with a fresh copy of the seed.
// =============================================================================

async function main(): Promise<void> {
  console.log('Initializing Debug Protocol from seed (P0)...\n');

  const protocol = await initFromSeed();

  console.log(`Protocol initialized:`);
  console.log(`  Version: ${protocol.version}`);
  console.log(`  Entries: ${protocol.entries.length}`);
  console.log(`    Reactive: ${protocol.entries.filter((e) => e.kind === 'reactive').length}`);
  console.log(`    Proactive: ${protocol.entries.filter((e) => e.kind === 'proactive').length}`);
  console.log(`  Rules: ${protocol.rules.length}`);
  console.log(`  Seed: ${protocol.seedProtocolPath}`);
  console.log(`\nOutput written to output/protocol.json and output/protocol.md`);
}

main().catch((err) => {
  console.error('Init failed:', err);
  process.exit(1);
});
