import { randomUUID } from 'node:crypto';
import type { AgentEvent, AgentEventKind, PipelineStage } from '../shared/contracts.js';

export interface ThreadRoute {
  projectId: string;
  role: 'planner' | 'implementer' | 'reviewer';
}

export function routeThreadId(notification: { params?: unknown }): string | null {
  const params = asRecord(notification.params);
  const turn = asRecord(params?.turn);
  const item = asRecord(params?.item);
  return readString(params?.threadId) ?? readString(turn?.threadId) ?? readString(item?.threadId);
}

export function notificationToEvent(
  notification: { method: string; params?: unknown },
  route: ThreadRoute,
  currentStage: PipelineStage,
): AgentEvent | null {
  const params = asRecord(notification.params) ?? {};
  const item = asRecord(params.item);
  const turn = asRecord(params.turn);
  const turnId = readString(params.turnId) ?? readString(turn?.id) ?? 'turn';
  const itemId = readString(params.itemId) ?? readString(item?.id) ?? undefined;
  const method = notification.method;
  const roleName = roleLabel(route.role);
  let kind: AgentEventKind = 'lifecycle';
  let title = roleName;
  let message = '';
  let isDelta = false;

  switch (method) {
    case 'item/agentMessage/delta':
      kind = 'assistant';
      title = `${roleName} · 回复`;
      message = readString(params.delta) ?? '';
      isDelta = true;
      break;
    case 'item/reasoning/summaryTextDelta':
      kind = 'thought';
      title = `${roleName} · 思考摘要`;
      message = readString(params.delta) ?? '';
      isDelta = true;
      break;
    case 'item/commandExecution/outputDelta':
      kind = 'tool';
      title = `${roleName} · 命令输出`;
      message = readString(params.delta) ?? '';
      isDelta = true;
      break;
    case 'turn/plan/updated':
      kind = 'plan';
      title = `${roleName} · 计划更新`;
      message = describe(params.plan ?? params);
      break;
    case 'item/fileChange/patchUpdated':
      kind = 'file';
      title = `${roleName} · 文件变更`;
      message = readString(params.patch) ?? readString(params.diff) ?? '正在生成补丁';
      isDelta = true;
      break;
    case 'item/started':
    case 'item/completed': {
      const type = readString(item?.type) ?? 'item';
      const completed = method === 'item/completed';
      const presentation = describeItem(item, type);
      kind = presentation.kind;
      title = `${roleName} · ${presentation.title}`;
      message = presentation.message || (completed ? '已完成' : '已开始');
      break;
    }
    case 'turn/started':
      title = `${roleName} · 回合开始`;
      message = 'Codex 已开始处理当前任务';
      break;
    case 'turn/completed':
      title = `${roleName} · 回合结束`;
      message = `状态：${readString(turn?.status) ?? 'completed'}`;
      break;
    case 'error':
      kind = 'error';
      title = `${roleName} · 运行错误`;
      message = readString(params.message) ?? readString(asRecord(params.error)?.message) ?? describe(params);
      break;
    case 'warning':
    case 'configWarning':
      kind = 'error';
      title = `${roleName} · 警告`;
      message = readString(params.message) ?? describe(params);
      break;
    default:
      return null;
  }

  if (!message) return null;
  return {
    id: itemId ? `${route.projectId}:${turnId}:${itemId}:${kind}` : randomUUID(),
    projectId: route.projectId,
    kind,
    title,
    message: clip(message),
    stage: stageForNotification(notification, route, currentStage),
    timestamp: new Date().toISOString(),
    method,
    ...(itemId ? { itemId } : {}),
    ...(isDelta ? { isDelta: true } : {}),
  };
}

export function inferStage(value: string, fallback: PipelineStage): PipelineStage {
  const normalized = value.toLowerCase();
  if (/\b(?:test|verify|build|lint)\b/u.test(normalized) || /检查|测试|验证|构建/u.test(normalized)) return 'verify';
  if (/\b(?:asset|sprite|texture|audio)\b/u.test(normalized) || /素材|贴图|音频/u.test(normalized)) return 'assets';
  if (/\b(?:level|scene|map|world)\b/u.test(normalized) || /关卡|场景|地图/u.test(normalized)) return 'world';
  if (/\b(?:gdd|game design)\b/u.test(normalized) || /玩法|规则|核心循环/u.test(normalized)) return 'gdd';
  if (/\b(?:scaffold|package\.json)\b/u.test(normalized) || /脚手架|工程骨架/u.test(normalized)) return 'scaffold';
  if (/\b(?:code|implement|typescript|javascript|css)\b/u.test(normalized) || /代码|实现/u.test(normalized)) return 'code';
  if (/\b(?:complete|delivered)\b/u.test(normalized) || /完成|交付/u.test(normalized)) return 'complete';
  if (/\b(?:brief|requirement)\b/u.test(normalized) || /需求|创意/u.test(normalized)) return 'brief';
  return fallback;
}

/**
 * Resolve the visible production station from structured App Server facts.
 * Free-form assistant/reasoning/output deltas deliberately preserve the
 * current station: a single token such as "test" must never teleport Noobi.
 */
export function stageForNotification(
  notification: { method: string; params?: unknown },
  route: ThreadRoute,
  currentStage: PipelineStage,
): PipelineStage {
  if (route.role === 'planner') return 'brief';
  if (route.role === 'reviewer') return 'verify';

  const params = asRecord(notification.params) ?? {};
  const item = asRecord(params.item);
  const itemType = readString(item?.type);

  if (itemType === 'imageGeneration') return 'assets';

  if (itemType === 'dynamicToolCall' || itemType === 'mcpToolCall') {
    const tool = cleanToolName(readString(item?.tool)).toLowerCase();
    return isMediaTool(tool) ? 'assets' : currentStage;
  }

  if (itemType === 'fileChange') {
    const paths = collectStructuredPaths(item?.changes ?? item);
    return inferFileStage(paths, currentStage);
  }

  if (notification.method === 'item/fileChange/patchUpdated') {
    const patch = readString(params.patch) ?? readString(params.diff) ?? '';
    return inferFileStage(
      [...collectStructuredPaths(params), ...extractPatchPaths(patch)],
      currentStage,
    );
  }

  if (itemType === 'commandExecution'
    && (notification.method === 'item/started' || notification.method === 'item/completed')) {
    return inferCommandStage(readString(item?.command) ?? '', currentStage);
  }

  return currentStage;
}

function inferFileStage(paths: readonly string[], fallback: PipelineStage): PipelineStage {
  if (paths.length === 0) return fallback;
  const normalized = paths.map((path) => path.toLowerCase());
  const includes = (pattern: RegExp) => normalized.some((path) => pattern.test(path));
  if (includes(/(?:^|[/_.-])(?:test|tests|spec|specs|playtest|verification)(?:[/_.-]|$)/u)) {
    return 'verify';
  }
  if (includes(/(?:^|[/_.-])(?:gdd|game[_ -]?design|design[_ -]?doc)(?:[/_.-]|$)|game_design\.md/u)) {
    return 'gdd';
  }
  if (includes(/(?:^|[/_.-])(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig(?:\.[^/]+)?\.json|vite\.config|webpack\.config|project\.godot|scaffold)(?:[/_.-]|$)/u)) {
    return 'scaffold';
  }
  if (includes(/(?:^|\/)(?:assets?|images?|sprites?|textures?|audio|music|sounds?|models?)(?:\/|$)|\.(?:png|jpe?g|webp|gif|svg|wav|mp3|ogg|flac|glb|gltf|fbx|obj)$/u)) {
    return 'assets';
  }
  if (includes(/(?:^|[/_.-])(?:world|worlds|level|levels|scene|scenes|map|maps)(?:[/_.-]|$)|\.tscn$/u)) {
    return 'world';
  }
  return 'code';
}

function inferCommandStage(command: string, fallback: PipelineStage): PipelineStage {
  const normalized = command.toLowerCase();
  if (!normalized.trim()) return fallback;
  if (/\b(?:test|vitest|jest|playwright|lint|typecheck|build|verify|check)\b/u.test(normalized)
    || /godot[^\n]*(?:--headless|--editor-pid)/u.test(normalized)) {
    return 'verify';
  }
  if (/\b(?:imagegen|image_generation|generate[_ -]?(?:image|audio|music|model)|noobi_(?:image|audio|music|model3d)|blender)\b/u.test(normalized)) {
    return 'assets';
  }
  if (/\b(?:npm|pnpm|yarn)\s+(?:install|init)\b/u.test(normalized)
    || /\bgodot\s+--editor\b/u.test(normalized)) {
    return 'scaffold';
  }
  return fallback;
}

function isMediaTool(tool: string): boolean {
  return /(?:^|[_.-])(?:image|imagegen|audio|music|sound|sfx|model3d|model_3d|mesh)(?:[_.-]|$)/u.test(tool);
}

function collectStructuredPaths(value: unknown): string[] {
  const paths: string[] = [];
  const visit = (candidate: unknown, depth: number): void => {
    if (depth > 5 || paths.length >= 64) return;
    if (Array.isArray(candidate)) {
      for (const entry of candidate) visit(entry, depth + 1);
      return;
    }
    const record = asRecord(candidate);
    if (!record) return;
    for (const [key, entry] of Object.entries(record)) {
      if (typeof entry === 'string'
        && /^(?:path|file|filePath|relativePath|filename|name)$/iu.test(key)) {
        paths.push(entry);
      } else if (entry && typeof entry === 'object') {
        visit(entry, depth + 1);
      }
    }
  };
  visit(value, 0);
  return paths;
}

function extractPatchPaths(patch: string): string[] {
  const paths: string[] = [];
  for (const line of patch.split(/\r?\n/u)) {
    const match = line.match(/^(?:\+\+\+|---)\s+(?:[ab]\/)?([^\t\n]+?)(?:\t.*)?$/u);
    if (match?.[1] && match[1] !== '/dev/null') paths.push(match[1]);
  }
  return paths;
}

function describeItem(
  item: Record<string, unknown> | null,
  type: string,
): { kind: AgentEventKind; title: string; message: string } {
  if (!item) return { kind: 'lifecycle', title: type, message: '' };
  switch (type) {
    case 'agentMessage':
      return { kind: 'assistant', title: '回复', message: readString(item.text) ?? '' };
    case 'reasoning':
      return {
        kind: 'thought',
        title: '推理摘要',
        message: readTextArray(item.summary) || readTextArray(item.content),
      };
    case 'commandExecution':
      return {
        kind: 'tool',
        title: '执行命令',
        message: readString(item.command) ?? describe(item.commandActions ?? item),
      };
    case 'fileChange':
      return {
        kind: 'file',
        title: '修改文件',
        message: describe(item.changes ?? item),
      };
    case 'mcpToolCall':
      return {
        kind: 'tool',
        title: `工具 ${readString(item.tool) ?? ''}`.trim(),
        message: describe(item.arguments ?? item.result ?? item),
      };
    case 'imageGeneration': {
      const status = readString(item.status) ?? 'unknown';
      const prompt = readString(item.revisedPrompt);
      const failure = asRecord(item.failure);
      const details = [
        `状态：${status}`,
        prompt ? `图像说明：${clip(prompt, 1_000)}` : null,
        failure ? `失败原因：${readString(failure.type) ?? 'unknown'}` : null,
        typeof item.savedPath === 'string' ? '已保存到项目素材库' : null,
      ].filter((value): value is string => Boolean(value));
      return {
        kind: status === 'failed' ? 'error' : 'tool',
        title: '生成图片',
        message: details.join('\n'),
      };
    }
    case 'dynamicToolCall':
      return {
        kind: item.status === 'failed' || item.success === false ? 'error' : 'tool',
        title: `素材工具 ${cleanToolName(readString(item.tool))}`.trim(),
        message: `状态：${readString(item.status) ?? 'unknown'}${typeof item.success === 'boolean' ? `\n结果：${item.success ? '成功' : '失败'}` : ''}`,
      };
    case 'plan':
      return { kind: 'plan', title: '计划', message: describe(item) };
    default:
      return { kind: 'lifecycle', title: type, message: describe(item) };
  }
}

function roleLabel(role: ThreadRoute['role']): string {
  return role === 'planner' ? '规划 Agent' : role === 'reviewer' ? '审查 Agent' : '实现 Agent';
}

function readTextArray(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) => (typeof entry === 'string' ? entry : readString(asRecord(entry)?.text) ?? ''))
    .filter(Boolean)
    .join('\n');
}

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function clip(value: string, maxLength = 24_000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n…（已截断）` : value;
}

function cleanToolName(value: string | null): string {
  return value?.replace(/[^A-Za-z0-9_.-]/gu, '').slice(0, 128) ?? '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
