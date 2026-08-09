import 'dotenv/config';
import { loadOrInitProtocol, getReactiveEntries, getProactiveEntries } from '../src/protocol-manager.js';

// =============================================================================
// Display the current state of the debug protocol
// =============================================================================
//
// Usage: npx tsx scripts/status.ts
//
// =============================================================================

async function main(): Promise<void> {
  const protocol = await loadOrInitProtocol();

  const reactive = getReactiveEntries(protocol);
  const proactive = getProactiveEntries(protocol);

  console.log(`Debug Protocol v${protocol.version}`);
  console.log(`Created: ${protocol.createdAt}`);
  console.log(`Updated: ${protocol.updatedAt}`);
  console.log(`Seed: ${protocol.seedProtocolPath}`);
  console.log(`Entries: ${protocol.entries.length} (${reactive.length} reactive, ${proactive.length} proactive)`);
  console.log(`Rules: ${protocol.rules.length}`);
  console.log(`Evolution log: ${protocol.evolutionLog.length} events`);

  // Reactive entries summary
  if (reactive.length > 0) {
    console.log('\n── Reactive Entries (Diagnosis) ──');
    for (const entry of reactive) {
      const hitLabel = entry.occurrences > 0
        ? `${entry.occurrences} hit(s)`
        : 'never matched';
      console.log(
        `  [${entry.signature.stage}] ${entry.signature.errorCode.padEnd(20)} ` +
        `| ${hitLabel.padEnd(15)} | ${entry.rootCause.slice(0, 60)}`,
      );
    }
  }

  // Proactive entries summary
  if (proactive.length > 0) {
    console.log('\n── Proactive Entries (Pre-validation) ──');
    for (const entry of proactive) {
      console.log(
        `  ${entry.signature.errorCode.padEnd(30)} | ${entry.rootCause.slice(0, 60)}`,
      );
    }
  }

  // Rules summary
  if (protocol.rules.length > 0) {
    console.log('\n── Generalized Rules ──');
    for (const rule of protocol.rules) {
      console.log(
        `  ${rule.name.padEnd(40)} | action: ${rule.action} | ` +
        `from ${rule.derivedFrom.length} entries | prevented: ${rule.preventionCount}`,
      );
    }
  }

  // Recent evolution log
  const recentLog = protocol.evolutionLog.slice(-10);
  if (recentLog.length > 0) {
    console.log(`\n── Recent Evolution (last ${recentLog.length}) ──`);
    for (const log of recentLog) {
      console.log(`  [${log.timestamp.slice(0, 19)}] ${log.action}: ${log.details.slice(0, 70)}`);
    }
  }
}

main().catch((err) => {
  console.error('Status check failed:', err);
  process.exit(1);
});
