import * as fs from 'fs/promises';
import * as path from 'path';
import {
  LIBRARY_JSON_PATH,
  FAMILIES_PATH,
  META_TEMPLATE_PATH,
  OUTPUT_PATH,
} from './config.js';
import type { TemplateLibrary, TemplateFamily } from './types.js';

// =============================================================================
// Library Manager -- Read, write, initialize, and query the template library
// =============================================================================

/**
 * Create a fresh, empty template library initialized from M0.
 */
export function createEmptyLibrary(): TemplateLibrary {
  return {
    version: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metaTemplatePath: META_TEMPLATE_PATH,
    families: [],
    evolutionLog: [],
  };
}

/**
 * Initialize the library on disk.
 * Creates output/ directory and writes an empty library.json.
 */
export async function initializeLibrary(): Promise<TemplateLibrary> {
  await fs.mkdir(OUTPUT_PATH, { recursive: true });
  await fs.mkdir(FAMILIES_PATH, { recursive: true });

  const library = createEmptyLibrary();
  await saveLibrary(library);

  console.log(
    `[LibraryManager] Initialized empty library at ${LIBRARY_JSON_PATH}`,
  );
  return library;
}

/**
 * Load the template library from disk.
 * Returns null if library.json does not exist.
 */
export async function loadLibrary(): Promise<TemplateLibrary | null> {
  try {
    const raw = await fs.readFile(LIBRARY_JSON_PATH, 'utf-8');
    return JSON.parse(raw) as TemplateLibrary;
  } catch {
    return null;
  }
}

/**
 * Load the library, or initialize a new one if it doesn't exist.
 */
export async function loadOrInitLibrary(): Promise<TemplateLibrary> {
  const existing = await loadLibrary();
  if (existing) return existing;
  return initializeLibrary();
}

/**
 * Save the template library to disk.
 * Also persists each family's template files into families/{archetype}/.
 */
export async function saveLibrary(library: TemplateLibrary): Promise<void> {
  await fs.mkdir(OUTPUT_PATH, { recursive: true });

  // Save library manifest (without large template file contents to keep it readable)
  const manifest = {
    ...library,
    families: library.families.map((f) => ({
      ...f,
      templateFiles: f.templateFiles.map((tf) => ({
        relativePath: tf.relativePath,
        role: tf.role,
        contentLength: tf.content.length,
      })),
    })),
  };
  await fs.writeFile(
    LIBRARY_JSON_PATH,
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );

  // Persist each family's template files to disk
  for (const family of library.families) {
    await saveFamilyFiles(family);
  }
}

/**
 * Write a family's template files to disk under families/{archetype}/
 */
async function saveFamilyFiles(family: TemplateFamily): Promise<void> {
  const familyDir = path.join(FAMILIES_PATH, family.archetype);
  await fs.mkdir(familyDir, { recursive: true });

  // Save family metadata
  const metadata = {
    id: family.id,
    archetype: family.archetype,
    physicsProfile: family.physicsProfile,
    discoveredAtTask: family.discoveredAtTask,
    contributingProjects: family.contributingProjects,
    stability: family.stability,
    fileStructure: family.fileStructure,
    hooks: family.hooks,
    configExtensions: family.configExtensions,
    summary: family.summary,
    templateFileCount: family.templateFiles.length,
  };
  await fs.writeFile(
    path.join(familyDir, 'family.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8',
  );

  // Save each template file
  for (const tf of family.templateFiles) {
    const filePath = path.join(familyDir, tf.relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, tf.content, 'utf-8');
  }
}

// -----------------------------------------------------------------------------
// Query helpers
// -----------------------------------------------------------------------------

/**
 * Get a summary string describing the current library state.
 */
export function getLibrarySummary(library: TemplateLibrary): string {
  const lines: string[] = [];
  lines.push(`Template Library v${library.version}`);
  lines.push(`Created: ${library.createdAt}`);
  lines.push(`Updated: ${library.updatedAt}`);
  lines.push(`Meta Template: ${library.metaTemplatePath}`);
  lines.push(`Families: ${library.families.length}`);
  lines.push(`Total Evolution Steps: ${library.evolutionLog.length}`);
  lines.push('');

  if (library.families.length === 0) {
    lines.push(
      '  (no families yet -- run evolve to start accumulating experience)',
    );
  }

  for (const family of library.families) {
    lines.push(`  [${family.archetype}] ${family.id}`);
    lines.push(`    Stability: ${(family.stability * 100).toFixed(0)}%`);
    lines.push(
      `    Contributing projects: ${family.contributingProjects.length}`,
    );
    lines.push(`    Template files: ${family.templateFiles.length}`);
    lines.push(`    Hooks: ${family.hooks.length}`);
    lines.push(`    Config extensions: ${family.configExtensions.length}`);
    lines.push(`    Discovered at task: #${family.discoveredAtTask}`);
    lines.push(`    Summary: ${family.summary}`);
    lines.push('');
  }

  if (library.evolutionLog.length > 0) {
    lines.push('Recent Evolution Log:');
    const recent = library.evolutionLog.slice(-5);
    for (const entry of recent) {
      lines.push(
        `  [${entry.timestamp}] ${entry.action} -> ${entry.familyId} ` +
          `(${entry.archetype}, extracted: ${entry.patternsExtracted}, ` +
          `merged: ${entry.patternsMerged})`,
      );
    }
  }

  return lines.join('\n');
}

/**
 * Find a family by archetype name.
 */
export function findFamily(
  library: TemplateLibrary,
  archetype: string,
): TemplateFamily | undefined {
  return library.families.find((f) => f.archetype === archetype);
}
