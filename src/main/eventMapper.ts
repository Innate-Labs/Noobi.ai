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
    stage: inferStage(`${title}\n${message}`, currentStage),
    timestamp: new Date().toISOString(),
    method,
    ...(itemId ? { itemId } : {}),
    ...(isDelta ? { isDelta: true } : {}),
  };
}

export function inferStage(value: string, fallback: PipelineStage): PipelineStage {
  const normalized = value.toLowerCase();
  if (/\b(test|verify|build|lint|检查|测试|验证|构建)\b/u.test(normalized)) return 'verify';
  if (/\b(asset|sprite|texture|audio|素材|贴图|音频)\b/u.test(normalized)) return 'assets';
  if (/\b(level|scene|map|world|关卡|场景|地图)\b/u.test(normalized)) return 'world';
  if (/\b(gdd|game design|玩法|规则|核心循环)\b/u.test(normalized)) return 'gdd';
  if (/\b(scaffold|package\.json|脚手架|工程骨架)\b/u.test(normalized)) return 'scaffold';
  if (/\b(code|implement|typescript|javascript|css|代码|实现)\b/u.test(normalized)) return 'code';
  if (/\b(complete|delivered|完成|交付)\b/u.test(normalized)) return 'complete';
  if (/\b(brief|requirement|需求|创意)\b/u.test(normalized)) return 'brief';
  return fallback;
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
