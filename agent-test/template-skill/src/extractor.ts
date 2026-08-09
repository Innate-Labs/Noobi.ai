import * as fs from 'fs/promises';
import * as path from 'path';
import { M0_GAME_CONFIG_PATH } from './config.js';
import type {
  ProjectSnapshot,
  ClassificationResult,
  ExtractedPatterns,
  ClassDef,
  MethodDef,
  HookDef,
  ImportEdge,
  DirectoryPattern,
  ConfigField,
} from './types.js';

// =============================================================================
// Extractor — Rule-based code pattern extraction
// =============================================================================

// -----------------------------------------------------------------------------
// 1. File structure analysis
// -----------------------------------------------------------------------------

function extractDirectoryPattern(snapshot: ProjectSnapshot): DirectoryPattern {
  const srcFiles = snapshot.files.filter(
    (f) => f.relativePath.startsWith('src/') && f.extension === '.ts',
  );

  const dirMap: Record<string, string[]> = {};

  for (const file of srcFiles) {
    const parts = file.relativePath.split('/');
    // We care about src/{subdir}/filename
    if (parts.length >= 3) {
      const subdir = parts[1]!;
      const filename = parts[parts.length - 1]!;
      if (!dirMap[subdir]) dirMap[subdir] = [];
      dirMap[subdir].push(filename);
    }
  }

  return {
    directories: Object.keys(dirMap).sort(),
    filesByDirectory: dirMap,
  };
}

// -----------------------------------------------------------------------------
// 2. Class hierarchy extraction (regex-based TS parsing)
// -----------------------------------------------------------------------------

const CLASS_REGEX =
  /^(?:export\s+)?(?:(abstract)\s+)?class\s+(\w+)(?:\s+extends\s+([\w.]+))?/gm;

const METHOD_REGEX =
  /^\s*(public|protected|private)?\s*(abstract\s+)?(override\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[\w<>[\]| ,]+)?\s*[{;]/gm;

function extractClasses(snapshot: ProjectSnapshot): ClassDef[] {
  const classes: ClassDef[] = [];

  for (const file of snapshot.files) {
    if (file.extension !== '.ts') continue;

    const content = file.content;
    let classMatch: RegExpExecArray | null;
    CLASS_REGEX.lastIndex = 0;

    while ((classMatch = CLASS_REGEX.exec(content)) !== null) {
      const isAbstract = classMatch[1] === 'abstract';
      const className = classMatch[2]!;
      const parentClass = classMatch[3] ?? null;

      const methods = extractMethods(content, className);

      classes.push({
        name: className,
        parentClass,
        filePath: file.relativePath,
        isAbstract,
        methods,
      });
    }
  }

  return classes;
}

function extractMethods(fileContent: string, _className: string): MethodDef[] {
  const methods: MethodDef[] = [];
  let match: RegExpExecArray | null;
  METHOD_REGEX.lastIndex = 0;

  while ((match = METHOD_REGEX.exec(fileContent)) !== null) {
    const visibility = (match[1] as MethodDef['visibility']) ?? 'public';
    const isAbstract = !!match[2];
    const isOverride = !!match[3];
    const name = match[4]!;
    const params = match[5] ?? '';

    // Skip constructor and Phaser lifecycle (we track hooks instead)
    if (name === 'constructor') continue;

    methods.push({
      name,
      visibility,
      isAbstract,
      isOverride,
      signature: `${visibility} ${isAbstract ? 'abstract ' : ''}${isOverride ? 'override ' : ''}${name}(${params})`,
    });
  }

  return methods;
}

// -----------------------------------------------------------------------------
// 3. Hook extraction
// -----------------------------------------------------------------------------

function extractHooks(classes: ClassDef[]): HookDef[] {
  const hookMap = new Map<string, HookDef>();

  for (const cls of classes) {
    for (const method of cls.methods) {
      // Hooks are: abstract methods in base classes, or protected methods starting with "on"
      const isHook =
        method.isAbstract ||
        (method.visibility === 'protected' &&
          (method.name.startsWith('on') ||
            method.name.startsWith('setup') ||
            method.name.startsWith('create') ||
            method.name.startsWith('get') ||
            method.name.startsWith('check')));

      if (!isHook) continue;

      const key = `${cls.name}::${method.name}`;
      const existing = hookMap.get(key);
      if (existing) {
        existing.occurrenceCount += 1;
      } else {
        hookMap.set(key, {
          name: method.name,
          declaringClass: cls.name,
          signature: method.signature,
          isAbstract: method.isAbstract,
          occurrenceCount: 1,
        });
      }
    }
  }

  return Array.from(hookMap.values());
}

// -----------------------------------------------------------------------------
// 4. Import graph extraction
// -----------------------------------------------------------------------------

const IMPORT_REGEX =
  /import\s+(?:(?:type\s+)?{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;

function extractImports(snapshot: ProjectSnapshot): ImportEdge[] {
  const edges: ImportEdge[] = [];

  for (const file of snapshot.files) {
    if (file.extension !== '.ts') continue;

    let match: RegExpExecArray | null;
    IMPORT_REGEX.lastIndex = 0;

    while ((match = IMPORT_REGEX.exec(file.content)) !== null) {
      const namedImports = match[1]
        ? match[1].split(',').map((s) => s.trim().replace(/^type\s+/, ''))
        : [];
      const defaultImport = match[2];
      const fromPath = match[3]!;

      // Only track local imports (starting with ./ or ../)
      if (!fromPath.startsWith('.')) continue;

      const importedNames = defaultImport
        ? [defaultImport, ...namedImports]
        : namedImports;

      edges.push({
        fromFile: file.relativePath,
        toFile: fromPath,
        importedNames: importedNames.filter(Boolean),
      });
    }
  }

  return edges;
}

// -----------------------------------------------------------------------------
// 5. Config extension extraction (diff against M0)
// -----------------------------------------------------------------------------

async function extractConfigExtensions(
  gameConfig: Record<string, unknown> | null,
): Promise<ConfigField[]> {
  if (!gameConfig) return [];

  // Load M0's baseline config
  let m0Config: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(M0_GAME_CONFIG_PATH, 'utf-8');
    m0Config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // If M0 config not found, treat everything as an extension
  }

  const m0Keys = new Set(Object.keys(m0Config));
  const extensions: ConfigField[] = [];

  for (const [key, value] of Object.entries(gameConfig)) {
    if (m0Keys.has(key)) continue; // Skip M0 baseline fields

    if (value && typeof value === 'object') {
      // Recurse one level into config sections
      for (const [subKey, subVal] of Object.entries(
        value as Record<string, unknown>,
      )) {
        const wrapper = subVal as Record<string, unknown> | null;
        extensions.push({
          path: `${key}.${subKey}`,
          value: wrapper?.value ?? subVal,
          type: typeof (wrapper?.value ?? subVal),
          description: (wrapper?.description as string) ?? undefined,
        });
      }
    }
  }

  return extensions;
}

// -----------------------------------------------------------------------------
// 6. Code snippets for key files
// -----------------------------------------------------------------------------

function collectCodeSnippets(
  snapshot: ProjectSnapshot,
): Record<string, string> {
  const snippets: Record<string, string> = {};
  const keyPatterns = [
    /Base\w+Scene\.ts$/,
    /Base\w+\.ts$/,
    /_Template\w+\.ts$/,
    /gameConfig\.json$/,
    /utils\.ts$/,
  ];

  for (const file of snapshot.files) {
    if (keyPatterns.some((p) => p.test(file.relativePath))) {
      snippets[file.relativePath] = file.content;
    }
  }

  return snippets;
}

// -----------------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------------------

/**
 * Extract reusable code patterns from a completed game project.
 * Entirely rule-based — no LLM calls.
 */
export async function extractPatterns(
  snapshot: ProjectSnapshot,
  classification: ClassificationResult,
): Promise<ExtractedPatterns> {
  console.log('[Extractor] Analyzing file structure...');
  const fileStructure = extractDirectoryPattern(snapshot);

  console.log('[Extractor] Extracting class hierarchies...');
  const classes = extractClasses(snapshot);

  console.log('[Extractor] Extracting hooks...');
  const hooks = extractHooks(classes);

  console.log('[Extractor] Extracting import graph...');
  const imports = extractImports(snapshot);

  console.log('[Extractor] Extracting config extensions...');
  const configExtensions = await extractConfigExtensions(snapshot.gameConfig);

  console.log('[Extractor] Collecting code snippets...');
  const codeSnippets = collectCodeSnippets(snapshot);

  console.log(
    `[Extractor] Done: ${classes.length} classes, ${hooks.length} hooks, ` +
      `${configExtensions.length} config fields, ${imports.length} imports`,
  );

  return {
    archetype: classification.archetype,
    physicsProfile: classification.physicsProfile,
    projectPath: snapshot.projectPath,
    fileStructure,
    classes,
    hooks,
    configExtensions,
    imports,
    codeSnippets,
  };
}
