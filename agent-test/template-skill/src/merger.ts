import type {
  TemplateLibrary,
  TemplateFamily,
  AbstractedTemplates,
  ExtractedPatterns,
  HookDef,
  ConfigField,
  TemplateFileDef,
  EvolutionEntry,
} from './types.js';

// =============================================================================
// Merger — Integrates abstracted templates into the evolving library
// =============================================================================

/**
 * Generate a unique family ID based on archetype and timestamp.
 */
function generateFamilyId(archetype: string): string {
  const ts = Date.now().toString(36);
  return `family-${archetype}-${ts}`;
}

/**
 * Merge two hook lists, deduplicating by name and summing occurrence counts.
 */
function mergeHooks(existing: HookDef[], incoming: HookDef[]): HookDef[] {
  const map = new Map<string, HookDef>();

  for (const h of existing) {
    map.set(h.name, { ...h });
  }
  for (const h of incoming) {
    const key = h.name;
    const prev = map.get(key);
    if (prev) {
      prev.occurrenceCount += h.occurrenceCount;
    } else {
      map.set(key, { ...h });
    }
  }

  return Array.from(map.values());
}

/**
 * Merge config field lists, deduplicating by path.
 * Incoming values overwrite existing ones (latest project wins).
 */
function mergeConfigFields(
  existing: ConfigField[],
  incoming: ConfigField[],
): ConfigField[] {
  const map = new Map<string, ConfigField>();

  for (const cf of existing) map.set(cf.path, cf);
  for (const cf of incoming) map.set(cf.path, cf);

  return Array.from(map.values());
}

/**
 * Merge template file lists.
 * If a file with the same relativePath already exists, keep the longer version
 * (heuristic: more complete). New files are simply added.
 */
function mergeTemplateFiles(
  existing: TemplateFileDef[],
  incoming: TemplateFileDef[],
): TemplateFileDef[] {
  const map = new Map<string, TemplateFileDef>();

  for (const f of existing) map.set(f.relativePath, f);
  for (const f of incoming) {
    const prev = map.get(f.relativePath);
    if (!prev || f.content.length > prev.content.length) {
      map.set(f.relativePath, f);
    }
  }

  return Array.from(map.values());
}

/**
 * Compute stability score.
 * stability = min(1, contributingProjects.length / 5)
 * A family reaches full stability once 5 projects have contributed.
 */
function computeStability(contributingProjects: string[]): number {
  return Math.min(1.0, contributingProjects.length / 5);
}

// -----------------------------------------------------------------------------
// Create a new family from scratch
// -----------------------------------------------------------------------------

function createNewFamily(
  abstracted: AbstractedTemplates,
  patterns: ExtractedPatterns,
  taskNumber: number,
): TemplateFamily {
  const id = generateFamilyId(patterns.archetype);

  return {
    id,
    archetype: patterns.archetype,
    physicsProfile: patterns.physicsProfile,
    discoveredAtTask: taskNumber,
    contributingProjects: [patterns.projectPath],
    stability: computeStability([patterns.projectPath]),
    fileStructure: patterns.fileStructure,
    baseClasses: patterns.classes.filter(
      (c) => c.isAbstract || c.name.startsWith('Base'),
    ),
    hooks: abstracted.hooks,
    configExtensions: abstracted.configSchema,
    templateFiles: abstracted.templateFiles,
    summary: abstracted.summary,
  };
}

// -----------------------------------------------------------------------------
// Merge into an existing family
// -----------------------------------------------------------------------------

function mergeIntoFamily(
  family: TemplateFamily,
  abstracted: AbstractedTemplates,
  patterns: ExtractedPatterns,
): TemplateFamily {
  const contributingProjects = family.contributingProjects.includes(
    patterns.projectPath,
  )
    ? family.contributingProjects
    : [...family.contributingProjects, patterns.projectPath];

  // Merge directory patterns (union of directories)
  const mergedDirs = new Set([
    ...family.fileStructure.directories,
    ...patterns.fileStructure.directories,
  ]);
  const mergedFilesByDir = { ...family.fileStructure.filesByDirectory };
  for (const [dir, files] of Object.entries(
    patterns.fileStructure.filesByDirectory,
  )) {
    const existing = new Set(mergedFilesByDir[dir] ?? []);
    for (const f of files) existing.add(f);
    mergedFilesByDir[dir] = Array.from(existing);
  }

  // Merge base classes (deduplicate by name, keep the version from most recent project)
  const baseClassMap = new Map(family.baseClasses.map((c) => [c.name, c]));
  for (const cls of patterns.classes) {
    if (cls.isAbstract || cls.name.startsWith('Base')) {
      baseClassMap.set(cls.name, cls);
    }
  }

  return {
    ...family,
    contributingProjects,
    stability: computeStability(contributingProjects),
    fileStructure: {
      directories: Array.from(mergedDirs).sort(),
      filesByDirectory: mergedFilesByDir,
    },
    baseClasses: Array.from(baseClassMap.values()),
    hooks: mergeHooks(family.hooks, abstracted.hooks),
    configExtensions: mergeConfigFields(
      family.configExtensions,
      abstracted.configSchema,
    ),
    templateFiles: mergeTemplateFiles(
      family.templateFiles,
      abstracted.templateFiles,
    ),
    summary: abstracted.summary, // Use latest summary
  };
}

// -----------------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------------------

export interface MergeResult {
  library: TemplateLibrary;
  entry: EvolutionEntry;
}

/**
 * Merge abstracted templates into the template library.
 * Creates a new family or merges into an existing one.
 */
export function mergeIntoLibrary(
  library: TemplateLibrary,
  abstracted: AbstractedTemplates,
  patterns: ExtractedPatterns,
): MergeResult {
  const taskNumber = library.evolutionLog.length + 1;
  const existingFamily = library.families.find(
    (f) => f.archetype === patterns.archetype,
  );

  let action: EvolutionEntry['action'];
  let familyId: string;

  if (existingFamily) {
    // Merge into existing family
    console.log(
      `[Merger] Merging into existing family: ${existingFamily.id} (${existingFamily.archetype})`,
    );
    const merged = mergeIntoFamily(existingFamily, abstracted, patterns);
    const idx = library.families.indexOf(existingFamily);
    library.families[idx] = merged;
    action = 'merged_to_family';
    familyId = merged.id;
  } else {
    // Create new family
    console.log(
      `[Merger] Creating new family for archetype: ${patterns.archetype}`,
    );
    const newFamily = createNewFamily(abstracted, patterns, taskNumber);
    library.families.push(newFamily);
    action = 'created_family';
    familyId = newFamily.id;
  }

  // Update library metadata
  library.version += 1;
  library.updatedAt = new Date().toISOString();

  // Create evolution log entry
  const entry: EvolutionEntry = {
    taskId: `task-${taskNumber}`,
    timestamp: new Date().toISOString(),
    projectPath: patterns.projectPath,
    archetype: patterns.archetype,
    action,
    familyId,
    patternsExtracted: patterns.classes.length + patterns.hooks.length,
    patternsMerged: abstracted.templateFiles.length,
  };

  library.evolutionLog.push(entry);

  console.log(
    `[Merger] ${action}: ${familyId} | Library v${library.version} | ` +
      `${library.families.length} families`,
  );

  return { library, entry };
}
