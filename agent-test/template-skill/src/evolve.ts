import { collectProject } from './collector.js';
import { classifyProject } from './classifier.js';
import { extractPatterns } from './extractor.js';
import { abstractPatterns } from './abstractor.js';
import { mergeIntoLibrary, type MergeResult } from './merger.js';
import { loadOrInitLibrary, saveLibrary } from './library-manager.js';
import type { TemplateLibrary, EvolutionEntry } from './types.js';

// =============================================================================
// Evolve -- Main orchestrator for the Template Skill evolution pipeline
// =============================================================================
//
// Pipeline:
//   Completed Project
//     -> Collector  (read files)
//     -> Classifier (LLM: determine archetype)
//     -> Extractor  (rules: extract code patterns)
//     -> Abstractor (LLM: generalize into templates)
//     -> Merger     (update library)
//
// =============================================================================

export interface EvolveResult {
  success: boolean;
  entry: EvolutionEntry | null;
  library: TemplateLibrary;
  error?: string;
  durationMs: number;
}

/**
 * Run the full evolution pipeline on a single completed game project.
 *
 * @param projectDir - Path to the completed game project directory
 * @returns EvolveResult with the updated library and evolution log entry
 */
export async function evolveFromProject(
  projectDir: string,
): Promise<EvolveResult> {
  const startTime = Date.now();
  let library = await loadOrInitLibrary();

  try {
    // Step 1: Collect project files
    console.log('\n=== Step 1/5: Collecting project files ===');
    const snapshot = await collectProject(projectDir);
    console.log(
      `  Files: ${snapshot.files.length} | Tree: ${snapshot.fileTree.length} entries`,
    );

    // Step 2: Classify archetype (library-aware -- uses existing families for context)
    console.log('\n=== Step 2/5: Classifying archetype ===');
    const classification = await classifyProject(snapshot, library);
    console.log(`  Archetype: ${classification.archetype}`);
    console.log(`  Confidence: ${classification.confidence}`);
    console.log(`  Reasoning: ${classification.reasoning}`);

    // Step 3: Extract code patterns
    console.log('\n=== Step 3/5: Extracting code patterns ===');
    const patterns = await extractPatterns(snapshot, classification);
    console.log(`  Classes: ${patterns.classes.length}`);
    console.log(`  Hooks: ${patterns.hooks.length}`);
    console.log(`  Config fields: ${patterns.configExtensions.length}`);
    console.log(`  Imports: ${patterns.imports.length}`);

    // Step 4: Abstract into reusable templates
    console.log('\n=== Step 4/5: Abstracting templates ===');
    const abstracted = await abstractPatterns(patterns);
    console.log(`  Template files: ${abstracted.templateFiles.length}`);
    console.log(`  Summary: ${abstracted.summary}`);

    // Step 5: Merge into library
    console.log('\n=== Step 5/5: Merging into library ===');
    const result: MergeResult = mergeIntoLibrary(library, abstracted, patterns);
    library = result.library;

    // Persist to disk
    await saveLibrary(library);
    console.log(
      `\n  Library saved (v${library.version}, ${library.families.length} families)`,
    );

    const durationMs = Date.now() - startTime;
    console.log(
      `\n=== Evolution complete in ${(durationMs / 1000).toFixed(1)}s ===\n`,
    );

    return {
      success: true,
      entry: result.entry,
      library,
      durationMs,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`\n[Evolve] Error: ${error}`);

    return {
      success: false,
      entry: null,
      library,
      error,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run evolution on multiple projects sequentially.
 * Simulates the experience-accumulation process described in the paper.
 */
export async function evolveBatch(
  projectDirs: string[],
): Promise<EvolveResult[]> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting batch evolution: ${projectDirs.length} projects`);
  console.log(`${'='.repeat(60)}\n`);

  const results: EvolveResult[] = [];

  for (let i = 0; i < projectDirs.length; i++) {
    const dir = projectDirs[i]!;
    console.log(`\n${'~'.repeat(60)}`);
    console.log(`Project ${i + 1}/${projectDirs.length}: ${dir}`);
    console.log(`${'~'.repeat(60)}`);

    const result = await evolveFromProject(dir);
    results.push(result);

    if (!result.success) {
      console.warn(`  Warning: Evolution failed for ${dir}: ${result.error}`);
    }
  }

  // Print final summary
  const successful = results.filter((r) => r.success).length;
  const lastLib = results[results.length - 1]?.library;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Batch complete: ${successful}/${projectDirs.length} succeeded`);
  if (lastLib) {
    console.log(
      `Library v${lastLib.version} | ${lastLib.families.length} families`,
    );
    for (const f of lastLib.families) {
      console.log(
        `  [${f.archetype}] stability: ${(f.stability * 100).toFixed(0)}% | ` +
          `projects: ${f.contributingProjects.length} | files: ${f.templateFiles.length}`,
      );
    }
  }
  console.log(`${'='.repeat(60)}\n`);

  return results;
}
