import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

const STORE_VERSION = 1;
const MAX_STORE_BYTES = 128 * 1024;
const MAX_CONTENT_LENGTH = 20_000;

export const PROMPT_TEMPLATE_IDS = [
  'planner',
  'implementer',
  'reviewer',
  'repair',
] as const;

export type PromptTemplateId = (typeof PROMPT_TEMPLATE_IDS)[number];

export interface PromptTemplate {
  id: PromptTemplateId;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  customized: boolean;
}

export interface PromptTemplatePatch {
  id: PromptTemplateId;
  content: string;
  enabled: boolean;
}

interface PersistedPromptTemplate {
  id: PromptTemplateId;
  content: string;
  enabled: boolean;
}

interface PromptTemplateDocument {
  version: typeof STORE_VERSION;
  templates: PersistedPromptTemplate[];
}

const DEFINITIONS: Readonly<Record<PromptTemplateId, Omit<PromptTemplate, 'id' | 'content' | 'enabled' | 'customized'>>> = {
  planner: {
    name: '规划 Agent',
    description: '追加到需求拆解与生产规划阶段，不会替换 Noobi 的安全和素材契约。',
  },
  implementer: {
    name: '实现 Agent',
    description: '追加到工作区实现阶段，用于约束代码风格、技术栈和交付偏好。',
  },
  reviewer: {
    name: '审查 Agent',
    description: '追加到构建、玩法和素材验收阶段，用于提高项目质量门槛。',
  },
  repair: {
    name: '修复 Agent',
    description: '追加到失败修复阶段，用于指定排障顺序与回归测试要求。',
  },
};

/**
 * App-owned prompt additions. These are deliberately stored outside game
 * workspaces so an Agent cannot rewrite the instructions that review it.
 */
export class PromptTemplateStore {
  readonly #storageFile: string;
  #templates = defaultPersistedTemplates();
  #loaded = false;
  #tail: Promise<void> = Promise.resolve();

  constructor(storageFile: string) {
    if (!isAbsolute(storageFile)) throw new Error('Prompt template storage path must be absolute');
    this.#storageFile = resolve(storageFile);
  }

  async init(): Promise<void> {
    await this.#exclusive(async () => {
      if (this.#loaded) return;
      await mkdir(dirname(this.#storageFile), { recursive: true, mode: 0o700 });
      try {
        const info = await stat(this.#storageFile);
        if (!info.isFile() || info.size > MAX_STORE_BYTES) {
          throw new Error('Prompt template store is invalid');
        }
        this.#templates = parseDocument(await readFile(this.#storageFile, 'utf8'));
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) throw error;
        this.#templates = defaultPersistedTemplates();
        await this.#persist();
      }
      this.#loaded = true;
    });
  }

  async list(): Promise<PromptTemplate[]> {
    await this.init();
    return this.#exclusive(async () => {
      return PROMPT_TEMPLATE_IDS.map((id) => materialize(
        this.#templates.find((template) => template.id === id) ?? defaultPersistedTemplate(id),
      ));
    });
  }

  async save(patch: PromptTemplatePatch): Promise<PromptTemplate> {
    await this.init();
    return this.#exclusive(async () => {
      const next = validatePersistedTemplate(patch);
      const index = this.#templates.findIndex((template) => template.id === next.id);
      if (index >= 0) this.#templates[index] = next;
      else this.#templates.push(next);
      await this.#persist();
      return materialize(next);
    });
  }

  async reset(id: PromptTemplateId): Promise<PromptTemplate> {
    await this.init();
    return this.#exclusive(async () => {
      const validatedId = validateId(id);
      const next = defaultPersistedTemplate(validatedId);
      const index = this.#templates.findIndex((template) => template.id === validatedId);
      if (index >= 0) this.#templates[index] = next;
      else this.#templates.push(next);
      await this.#persist();
      return materialize(next);
    });
  }

  async enabledAdditions(): Promise<Partial<Record<PromptTemplateId, string>>> {
    const templates = await this.list();
    return Object.fromEntries(
      templates
        .filter((template) => template.enabled && template.content.length > 0)
        .map((template) => [template.id, template.content]),
    );
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    let resolveResult!: (value: T | PromiseLike<T>) => void;
    let rejectResult!: (reason?: unknown) => void;
    const result = new Promise<T>((resolvePromise, rejectPromise) => {
      resolveResult = resolvePromise;
      rejectResult = rejectPromise;
    });
    const run = async (): Promise<void> => {
      try {
        resolveResult(await operation());
      } catch (error) {
        rejectResult(error);
      }
    };
    this.#tail = this.#tail.then(run, run);
    return result;
  }

  async #persist(): Promise<void> {
    const document: PromptTemplateDocument = {
      version: STORE_VERSION,
      templates: PROMPT_TEMPLATE_IDS.map((id) =>
        this.#templates.find((template) => template.id === id) ?? defaultPersistedTemplate(id)),
    };
    const encoded = `${JSON.stringify(document, null, 2)}\n`;
    if (Buffer.byteLength(encoded, 'utf8') > MAX_STORE_BYTES) {
      throw new Error('Prompt template store exceeds its size limit');
    }
    const temporary = `${this.#storageFile}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(encoded, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, this.#storageFile);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}

function parseDocument(source: string): PersistedPromptTemplate[] {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error('Prompt template store contains invalid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Prompt template store must be an object');
  }
  const record = value as Record<string, unknown>;
  if (record.version !== STORE_VERSION || !Array.isArray(record.templates)) {
    throw new Error('Unsupported prompt template store version');
  }
  const templates = record.templates.map(validatePersistedTemplate);
  const ids = new Set(templates.map((template) => template.id));
  if (ids.size !== templates.length) throw new Error('Prompt template IDs must be unique');
  return PROMPT_TEMPLATE_IDS.map((id) =>
    templates.find((template) => template.id === id) ?? defaultPersistedTemplate(id));
}

function validatePersistedTemplate(value: unknown): PersistedPromptTemplate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid prompt template');
  }
  const record = value as Record<string, unknown>;
  const id = validateId(record.id);
  if (typeof record.content !== 'string' || record.content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`Prompt template ${id} must contain at most ${MAX_CONTENT_LENGTH} characters`);
  }
  if (typeof record.enabled !== 'boolean') throw new Error(`Prompt template ${id} has an invalid enabled flag`);
  return { id, content: record.content.trim(), enabled: record.enabled };
}

function validateId(value: unknown): PromptTemplateId {
  if (typeof value !== 'string' || !PROMPT_TEMPLATE_IDS.includes(value as PromptTemplateId)) {
    throw new Error('Unknown prompt template ID');
  }
  return value as PromptTemplateId;
}

function materialize(template: PersistedPromptTemplate): PromptTemplate {
  return {
    id: template.id,
    ...DEFINITIONS[template.id],
    content: template.content,
    enabled: template.enabled,
    customized: template.content.length > 0,
  };
}

function defaultPersistedTemplates(): PersistedPromptTemplate[] {
  return PROMPT_TEMPLATE_IDS.map(defaultPersistedTemplate);
}

function defaultPersistedTemplate(id: PromptTemplateId): PersistedPromptTemplate {
  return { id, content: '', enabled: true };
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}
