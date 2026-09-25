import { PLAN_EDITABLE_FIELDS, type PlanDraft, type PlanFieldLock, type PlanOption, type PlanDesign } from '../shared/planning.js';

const text = (value: unknown, name: string, max = 2000): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name}不能为空且不能超过 ${max} 字`);
  return value.trim();
};
const list = (value: unknown, name: string, min: number, max: number): string[] => {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${name}需要 ${min}–${max} 项`);
  return value.map(v => text(v, name));
};
export function validatePlanDesign(value: unknown): PlanDesign {
  if (!value || typeof value !== 'object') throw new Error('制作细节无效');
  const result = {} as PlanDesign;
  for (const key of ['camera', 'regions', 'characters', 'style', 'budget'] as const) result[key] = text((value as any)[key], key);
  return result;
}
export function validatePlanLocks(value: unknown, draft: PlanDraft): PlanFieldLock[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error('锁定字段无效');
  const seen = new Set<string>();
  return value.map(lock => {
    if (!lock || !draft.version?.options.some(o => o.id === lock.optionId) || !PLAN_EDITABLE_FIELDS.includes(lock.field)) throw new Error('锁定字段无效');
    const key = `${lock.optionId}:${lock.field}`; if (seen.has(key)) throw new Error('锁定字段重复'); seen.add(key);
    return { optionId: lock.optionId, field: lock.field };
  });
}
export function validateEditedOption(value: unknown, draft: PlanDraft): PlanOption {
  if (!value || typeof value !== 'object') throw new Error('方案内容无效');
  const input = value as PlanOption;
  const previous = draft.version?.options.find(o => o.id === input.id);
  if (!previous) throw new Error('不能编辑不存在的方案');
  if (!['web', 'godot'].includes(input.engine) || !['2d', '3d'].includes(input.dimension) || !['desktop', 'web'].includes(input.platform)) throw new Error('引擎、维度或平台无效');
  if (draft.projectId && input.engine !== previous.engine) throw new Error('不能更换已有工程引擎');
  if (/\b3d\b|三维|第三人称|第一人称/iu.test(draft.request) && input.dimension !== '3d') throw new Error('冲突：原始需求明确要求 3D，不能改为 2D');
  if (/浏览器|网页|browser|web\s*game/iu.test(draft.request) && input.platform !== 'web') throw new Error('冲突：原始需求要求浏览器交付');
  const result: PlanOption = { id: previous.id, title: text(input.title, '标题'), approach: text(input.approach, '玩法方向'),
    engine: input.engine, dimension: input.dimension, platform: input.platform,
    coreLoop: list(input.coreLoop, '核心循环', 3, 6), features: list(input.features, '制作范围', 3, 10),
    assumptions: list(input.assumptions, '假设', 1, 6), exclusions: list(input.exclusions, '范围边界', 1, 6),
    requirementIds: [...previous.requirementIds], estimate: structuredClone(previous.estimate),
    ...(input.design ? { design: validatePlanDesign(input.design) } : {}) };
  if (JSON.stringify(result).length > 15000) throw new Error('方案过长，请精简');
  return result;
}
export function lockedPlanChanges(draft: PlanDraft, options: PlanOption[], locks = draft.locks ?? []): string[] {
  return locks.flatMap(lock => {
    const before = draft.version?.options.find(o => o.id === lock.optionId);
    const after = options.find(o => o.id === lock.optionId);
    return !before || !after || JSON.stringify(before[lock.field]) !== JSON.stringify(after[lock.field]) ? [`${lock.optionId}.${lock.field}`] : [];
  });
}
export function planDifferences(before: PlanOption[], after: PlanOption[]): string[] {
  return after.flatMap(option => {
    const prior = before.find(o => o.id === option.id);
    return !prior ? [`新增 ${option.title}`] : PLAN_EDITABLE_FIELDS.filter(field => JSON.stringify(prior[field]) !== JSON.stringify(option[field])).map(field => `${option.title} · ${field}`);
  });
}
