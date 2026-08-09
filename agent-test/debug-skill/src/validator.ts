import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  DebugProtocol,
  DebugEntry,
  ProtocolRule,
  ValidationResult,
} from './types.js';
import { getProactiveEntries } from './protocol-manager.js';

// =============================================================================
// Validator — pre-execution consistency checks guided by protocol P
// =============================================================================
//
// Corresponds to the paper's description:
//   "P includes lightweight pre-execution validations that focus on
//    high-frequency inconsistency classes discovered in prior tasks"
//
// Runs BEFORE build/test/dev to catch known issues early.
// =============================================================================

/**
 * Run all proactive validations from the protocol against a project.
 *
 * @param projectDir - Absolute path to the game project
 * @param protocol - The current debug protocol P
 * @returns Array of validation results (one per proactive entry / rule)
 */
export async function validateProject(
  projectDir: string,
  protocol: DebugProtocol,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // Run proactive entry-based checks
  const proactiveEntries = getProactiveEntries(protocol);
  for (const entry of proactiveEntries) {
    const result = await runEntryCheck(projectDir, entry);
    results.push(result);
  }

  // Run generalized rule checks
  for (const rule of protocol.rules) {
    const result = await runRuleCheck(projectDir, rule);
    results.push(result);
  }

  return results;
}

/**
 * Run a single proactive entry check against a project.
 */
async function runEntryCheck(
  projectDir: string,
  entry: DebugEntry,
): Promise<ValidationResult> {
  const violations: string[] = [];

  switch (entry.signature.errorCode) {
    case 'ASSET_KEY_CONSISTENCY':
      violations.push(...await checkAssetKeyConsistency(projectDir));
      break;
    case 'CONFIG_FIELD_CONSISTENCY':
      violations.push(...await checkConfigFieldConsistency(projectDir));
      break;
    case 'SCENE_REGISTRATION_CONSISTENCY':
      violations.push(...await checkSceneRegistration(projectDir));
      break;
    case 'ANIMATION_KEY_CONSISTENCY':
      violations.push(...await checkAnimationKeyConsistency(projectDir));
      break;
    case 'IMPORT_TYPE_KEYWORD':
      violations.push(...await checkImportTypeKeyword(projectDir));
      break;
    case 'LEVEL_ORDER_MISMATCH':
      violations.push(...await checkLevelOrder(projectDir));
      break;
    default:
      break;
  }

  return {
    ruleId: entry.id,
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Run a generalized rule's checks against a project.
 */
async function runRuleCheck(
  projectDir: string,
  rule: ProtocolRule,
): Promise<ValidationResult> {
  const violations: string[] = [];

  for (const check of rule.checks) {
    const pattern = check.filePattern
      ? path.join(projectDir, check.filePattern)
      : projectDir;

    try {
      const files = await collectFiles(pattern);
      for (const filePath of files) {
        const content = await fs.readFile(filePath, 'utf-8');
        const regex = new RegExp(check.query, 'g');
        const matches = content.match(regex);
        if (matches) {
          violations.push(
            `${check.violationMessage} (${path.relative(projectDir, filePath)}: ${matches.length} occurrence(s))`,
          );
        }
      }
    } catch {
      // File/dir not found — skip this check
    }
  }

  return {
    ruleId: rule.id,
    passed: violations.length === 0,
    violations,
  };
}

// -----------------------------------------------------------------------------
// Concrete validation checks (from P0 seed)
// -----------------------------------------------------------------------------

/**
 * Check that all texture/audio keys referenced in code exist in asset-pack.json.
 */
async function checkAssetKeyConsistency(projectDir: string): Promise<string[]> {
  const violations: string[] = [];
  const assetPackPath = path.join(projectDir, 'public', 'assets', 'asset-pack.json');

  try {
    const assetPack = JSON.parse(await fs.readFile(assetPackPath, 'utf-8'));
    const registeredKeys = extractAssetKeys(assetPack);
    const tsFiles = await collectFiles(path.join(projectDir, 'src', '**', '*.ts'));

    for (const filePath of tsFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      const usedKeys = extractUsedAssetKeys(content);
      for (const key of usedKeys) {
        if (!registeredKeys.has(key)) {
          violations.push(
            `Asset key '${key}' used in ${path.relative(projectDir, filePath)} but not found in asset-pack.json`,
          );
        }
      }
    }
  } catch {
    // asset-pack.json not found or unparseable — skip
  }

  return violations;
}

/**
 * Check that config fields accessed in code exist in gameConfig.json.
 */
async function checkConfigFieldConsistency(projectDir: string): Promise<string[]> {
  const violations: string[] = [];
  const configPath = path.join(projectDir, 'src', 'gameConfig.json');

  try {
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const configKeys = new Set(Object.keys(config));
    const tsFiles = await collectFiles(path.join(projectDir, 'src', '**', '*.ts'));

    for (const filePath of tsFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      // Match patterns like gameConfig.someField or config.someField.value
      const fieldAccesses = content.matchAll(/(?:gameConfig|config)\.(\w+)/g);
      for (const match of fieldAccesses) {
        const field = match[1]!;
        // Skip common non-config fields
        if (['json', 'value', 'type', 'description'].includes(field)) continue;
        if (!configKeys.has(field)) {
          violations.push(
            `Config field '${field}' accessed in ${path.relative(projectDir, filePath)} but not defined in gameConfig.json`,
          );
        }
      }
    }
  } catch {
    // config not found — skip
  }

  return violations;
}

/**
 * Check that all scene.start()/scene.launch() targets are registered in main.ts.
 */
async function checkSceneRegistration(projectDir: string): Promise<string[]> {
  const violations: string[] = [];
  const mainPath = path.join(projectDir, 'src', 'main.ts');

  try {
    const mainContent = await fs.readFile(mainPath, 'utf-8');
    const registeredScenes = new Set<string>();
    const sceneAddMatches = mainContent.matchAll(/scene\.add\(\s*['"](.+?)['"]/g);
    for (const m of sceneAddMatches) registeredScenes.add(m[1]!);
    // Also check scene config array
    const sceneConfigMatches = mainContent.matchAll(/key:\s*['"](.+?)['"]/g);
    for (const m of sceneConfigMatches) registeredScenes.add(m[1]!);

    const tsFiles = await collectFiles(path.join(projectDir, 'src', '**', '*.ts'));
    for (const filePath of tsFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      const sceneStarts = content.matchAll(/scene\.(?:start|launch)\(\s*['"](.+?)['"]/g);
      for (const match of sceneStarts) {
        const sceneKey = match[1]!;
        if (!registeredScenes.has(sceneKey)) {
          violations.push(
            `Scene key '${sceneKey}' used in ${path.relative(projectDir, filePath)} but not registered in main.ts`,
          );
        }
      }
    }
  } catch {
    // main.ts not found — skip
  }

  return violations;
}

/**
 * Check that animation keys referenced in code exist in animations.json.
 */
async function checkAnimationKeyConsistency(projectDir: string): Promise<string[]> {
  const violations: string[] = [];
  const animPath = path.join(projectDir, 'public', 'assets', 'animations.json');

  try {
    const animData = JSON.parse(await fs.readFile(animPath, 'utf-8'));
    const animKeys = new Set<string>();
    if (animData.anims && Array.isArray(animData.anims)) {
      for (const anim of animData.anims) {
        if (anim.key) animKeys.add(anim.key as string);
      }
    }

    const tsFiles = await collectFiles(path.join(projectDir, 'src', '**', '*.ts'));
    for (const filePath of tsFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      const animRefs = content.matchAll(/\.play\(\s*['"](.+?)['"]/g);
      for (const match of animRefs) {
        const key = match[1]!;
        if (!animKeys.has(key) && animKeys.size > 0) {
          violations.push(
            `Animation key '${key}' used in ${path.relative(projectDir, filePath)} but not defined in animations.json`,
          );
        }
      }
    }
  } catch {
    // animations.json not found — skip
  }

  return violations;
}

/**
 * Check that interface/type imports use the `type` keyword.
 */
async function checkImportTypeKeyword(projectDir: string): Promise<string[]> {
  const violations: string[] = [];
  const tsFiles = await collectFiles(path.join(projectDir, 'src', '**', '*.ts'));

  for (const filePath of tsFiles) {
    const content = await fs.readFile(filePath, 'utf-8');
    const importMatches = content.matchAll(
      /import\s*\{([^}]+)\}\s*from\s*['"](.+?)['"]/g,
    );

    for (const match of importMatches) {
      const names = match[1]!.split(',').map((n) => n.trim());
      for (const name of names) {
        if (name.startsWith('type ')) continue;
        // Heuristic: names starting with I + uppercase, or ending in Config/Props/Options
        if (/^I[A-Z]/.test(name) || /(?:Config|Props|Options|Params|State|Result)$/.test(name)) {
          violations.push(
            `Possible interface '${name}' imported without 'type' keyword in ${path.relative(projectDir, filePath)}`,
          );
        }
      }
    }
  }

  return violations;
}

/**
 * Check that LEVEL_ORDER[0] matches the first actual game scene.
 */
async function checkLevelOrder(projectDir: string): Promise<string[]> {
  const violations: string[] = [];
  const levelMgrPath = path.join(projectDir, 'src', 'LevelManager.ts');

  try {
    const content = await fs.readFile(levelMgrPath, 'utf-8');
    const orderMatch = content.match(/LEVEL_ORDER\s*=\s*\[([^\]]+)\]/);
    if (orderMatch) {
      const entries = orderMatch[1]!.match(/['"](.+?)['"]/g);
      if (entries && entries.length > 0) {
        const firstScene = entries[0]!.replace(/['"]/g, '');
        if (firstScene === 'Level1Scene' || firstScene === 'Level1') {
          // Likely still the template default
          violations.push(
            `LEVEL_ORDER[0] is '${firstScene}' — verify this is your actual first game scene and not a template default`,
          );
        }
      }
    }
  } catch {
    // LevelManager.ts not found — skip
  }

  return violations;
}

// -----------------------------------------------------------------------------
// File utilities
// -----------------------------------------------------------------------------

/** Recursively collect files matching a simple glob pattern. */
async function collectFiles(pattern: string): Promise<string[]> {
  // Simple implementation: resolve the directory and recurse
  const parts = pattern.split('**');
  if (parts.length < 2) {
    try {
      const stat = await fs.stat(pattern);
      if (stat.isFile()) return [pattern];
      return [];
    } catch {
      return [];
    }
  }

  const baseDir = parts[0]!.replace(/[/\\]$/, '');
  const ext = parts[parts.length - 1]!.replace(/^[/\\]\*/, '');

  return collectFilesRecursive(baseDir, ext);
}

async function collectFilesRecursive(
  dir: string,
  ext: string,
): Promise<string[]> {
  const result: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
          continue;
        }
        result.push(...await collectFilesRecursive(fullPath, ext));
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        result.push(fullPath);
      }
    }
  } catch {
    // Directory not accessible
  }
  return result;
}

/**
 * Extract all registered asset keys from an asset-pack.json structure.
 */
function extractAssetKeys(assetPack: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();

  function walk(obj: unknown): void {
    if (typeof obj !== 'object' || obj === null) return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }
    const record = obj as Record<string, unknown>;
    if (typeof record['key'] === 'string') {
      keys.add(record['key']);
    }
    for (const value of Object.values(record)) {
      walk(value);
    }
  }

  walk(assetPack);
  return keys;
}

/**
 * Extract asset key references from TypeScript source code.
 */
function extractUsedAssetKeys(content: string): Set<string> {
  const keys = new Set<string>();
  // Match this.add.image(..., 'key'), this.textures.exists('key'), etc.
  const patterns = [
    /\.(?:image|sprite|audio|sound)\(\s*(?:[^,]+,\s*)?['"](.+?)['"]/g,
    /\.setTexture\(\s*['"](.+?)['"]/g,
    /textures\.exists\(\s*['"](.+?)['"]/g,
    /\.load\.(?:image|audio|spritesheet)\(\s*['"](.+?)['"]/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) keys.add(match[1]);
    }
  }

  return keys;
}
