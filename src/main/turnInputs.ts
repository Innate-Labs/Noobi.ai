import { isAbsolute } from 'node:path';
// Mirrors the pinned App Server UserInput wire shapes without changing generated protocol files.
type TurnInput = { type: 'text'; text: string; text_elements: [] } | { type: 'localImage'; path: string } | { type: 'skill'; name: string; path: string };
export function turnInputs(prompt: string, imagePaths: readonly string[] = [], skills: Array<{ name: string; path: string }> = []): TurnInput[] {
  if (!Array.isArray(imagePaths) || imagePaths.length > 20 || imagePaths.some(path => typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))) throw new Error('模型图像输入路径无效或超过 20 张');
  return [{ type: 'text', text: prompt, text_elements: [] }, ...imagePaths.map(path => ({ type: 'localImage' as const, path })), ...skills.map(skill => ({ type: 'skill' as const, ...skill }))];
}
