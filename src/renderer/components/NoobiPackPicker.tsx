import { Check, ChevronDown, Sparkles } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import type { NoobiPackId } from '../../shared/contracts';
import classicAvatar from '../assets/noobi-packs/classic/frames/sprite-idle-a.png';
import classicScene from '../assets/noobi-packs/classic/scene.png';
import helloKittyAvatar from '../assets/noobi-packs/hellokitty/frames/sprite-idle-a.png';
import helloKittyScene from '../assets/noobi-packs/hellokitty/scene.png';
import mosslightAvatar from '../assets/noobi-packs/mosslight/frames/sprite-idle-a.png';
import mosslightScene from '../assets/noobi-packs/mosslight/scene.png';
import starforgeAvatar from '../assets/noobi-packs/starforge/frames/sprite-idle-a.png';
import starforgeScene from '../assets/noobi-packs/starforge/scene.png';
import twilightAvatar from '../assets/noobi-packs/twilight/frames/sprite-idle-a.png';
import twilightScene from '../assets/noobi-packs/twilight/scene.png';

export interface NoobiPackOption {
  id: NoobiPackId;
  name: string;
  eyebrow: string;
  description: string;
  avatarLabel: string;
  sceneImage: string;
  avatarImage: string;
}

export const NOOBI_PACK_OPTIONS: readonly NoobiPackOption[] = [
  {
    id: 'classic',
    name: '经典工坊',
    eyebrow: 'CLASSIC STUDIO',
    description: '暖木工作室与原版 Noobi，适合大多数游戏制作任务。',
    avatarLabel: '经典制作人',
    sceneImage: classicScene,
    avatarImage: classicAvatar,
  },
  {
    id: 'mosslight',
    name: '苔光工坊',
    eyebrow: 'MOSSLIGHT ATELIER',
    description: '植物、琥珀灯与游侠 Noobi，适合自然和冒险题材。',
    avatarLabel: '苔光游侠',
    sceneImage: mosslightScene,
    avatarImage: mosslightAvatar,
  },
  {
    id: 'starforge',
    name: '星铸工坊',
    eyebrow: 'STARFORGE LAB',
    description: '星舰机械间与工程师 Noobi，适合科幻和 3D 项目。',
    avatarLabel: '星铸工程师',
    sceneImage: starforgeScene,
    avatarImage: starforgeAvatar,
  },
  {
    id: 'twilight',
    name: '暮光魔法工坊',
    eyebrow: 'TWILIGHT MAGIC LAB',
    description: '小马宝莉·暮光闪闪与魔法研究室，适合解谜、叙事和奇幻冒险。',
    avatarLabel: '小马宝莉·暮光闪闪',
    sceneImage: twilightScene,
    avatarImage: twilightAvatar,
  },
  {
    id: 'hellokitty',
    name: 'Hello Kitty 工坊',
    eyebrow: 'HELLO KITTY STUDIO',
    description: 'Hello Kitty 与草莓创意室，适合休闲、装扮和温馨题材。',
    avatarLabel: 'Hello Kitty',
    sceneImage: helloKittyScene,
    avatarImage: helloKittyAvatar,
  },
] as const;

export function noobiPackGridColumnCount(container: HTMLElement | null): number {
  if (!container) return 1;
  const tracks = getComputedStyle(container).gridTemplateColumns
    .split(/\s+/)
    .filter((track) => track && track !== 'none');
  return Math.max(1, tracks.length);
}

export function noobiPackLabel(id: NoobiPackId): string {
  return NOOBI_PACK_OPTIONS.find((option) => option.id === id)?.name ?? '经典工坊';
}

interface NoobiPackPickerProps {
  value: NoobiPackId | null;
  globalValue?: NoobiPackId;
  mode: 'global' | 'project';
  variant?: 'cards' | 'compact';
  disabled?: boolean;
  busy?: boolean;
  onChange: (value: NoobiPackId | null) => void;
}

export function NoobiPackPicker({
  value,
  globalValue = 'classic',
  mode,
  variant = 'cards',
  disabled = false,
  busy = false,
  onChange,
}: NoobiPackPickerProps) {
  const resolvedValue = value ?? globalValue;
  const resolvedOption = NOOBI_PACK_OPTIONS.find((option) => option.id === resolvedValue)
    ?? NOOBI_PACK_OPTIONS[0];

  if (variant === 'compact') {
    return (
      <label
        className={`noobi-pack-compact is-${resolvedValue}${value === null ? ' is-inherited' : ''}`}
        title={disabled ? 'Agent 运行期间不能切换制作场景' : '选择这个项目的 Noobi 形象与制作场景'}
      >
        <span
          className="noobi-pack-compact-swatch"
          aria-hidden="true"
          style={{ backgroundImage: `url(${resolvedOption.sceneImage})` }}
        >
          <img src={resolvedOption.avatarImage} alt="" draggable={false} />
        </span>
        <span className="noobi-pack-compact-copy" aria-hidden="true">
          <small>{mode === 'global' ? '默认场景' : value === null ? '跟随全局' : '项目场景'}</small>
          <strong>{busy ? '保存中…' : noobiPackLabel(resolvedValue)}</strong>
        </span>
        <select
          aria-label="项目 Noobi 形象与制作场景"
          value={value ?? 'inherit'}
          disabled={disabled || busy}
          onChange={(event) => {
            const nextValue = event.target.value;
            onChange(nextValue === 'inherit' ? null : nextValue as NoobiPackId);
          }}
        >
          {mode === 'project' ? (
            <option value="inherit">跟随全局（当前：{noobiPackLabel(globalValue)}）</option>
          ) : null}
          {NOOBI_PACK_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.name} · {option.avatarLabel}</option>
          ))}
        </select>
        <ChevronDown size={12} aria-hidden="true" />
      </label>
    );
  }

  const options: Array<NoobiPackOption & { inherited?: boolean }> = mode === 'project'
    ? [{
        ...NOOBI_PACK_OPTIONS.find((option) => option.id === globalValue)!,
        id: globalValue,
        name: `跟随全局 · ${noobiPackLabel(globalValue)}`,
        eyebrow: 'FOLLOW GLOBAL',
        description: '项目会自动使用设置中的全局默认主题包。',
        inherited: true,
      }, ...NOOBI_PACK_OPTIONS]
    : [...NOOBI_PACK_OPTIONS];

  function selectAt(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.inherited ? null : option.id);
  }

  function handleArrowKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    const columnCount = noobiPackGridColumnCount(container);
    let nextIndex = index;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = options.length - 1;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + options.length) % options.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % options.length;
    if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - columnCount);
    if (event.key === 'ArrowDown') nextIndex = Math.min(options.length - 1, index + columnCount);
    const nextButton = container?.querySelector<HTMLButtonElement>(`button[data-pack-index="${nextIndex}"]`);
    nextButton?.focus();
    selectAt(nextIndex);
  }

  return (
    <div
      className={`noobi-pack-picker mode-${mode}`}
      role="radiogroup"
      aria-label={mode === 'global' ? '默认 Noobi 形象与制作场景' : '项目 Noobi 形象与制作场景'}
      aria-busy={busy}
    >
      {options.map((option, index) => {
        const selected = option.inherited ? value === null : value === option.id;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${option.name}：${option.description}`}
            data-pack-index={index}
            className={`noobi-pack-card pack-${option.id}${selected ? ' is-selected' : ''}${option.inherited ? ' is-inherited' : ''}`}
            key={option.inherited ? 'inherit' : option.id}
            disabled={disabled || busy}
            tabIndex={selected || (!options.some((item) => item.inherited ? value === null : value === item.id) && index === 0) ? 0 : -1}
            onKeyDown={(event) => handleArrowKey(event, index)}
            onClick={() => selectAt(index)}
          >
            <span className="noobi-pack-preview" aria-hidden="true">
              <img
                className="noobi-pack-scene-image"
                src={option.sceneImage}
                alt=""
                draggable={false}
              />
              <img
                className="noobi-pack-avatar-image"
                src={option.avatarImage}
                alt=""
                draggable={false}
              />
              {option.inherited ? <Sparkles className="noobi-pack-follow-icon" size={17} /> : null}
            </span>
            <span className="noobi-pack-card-copy">
              <small>{option.eyebrow}</small>
              <strong>{option.name}</strong>
              <span>{option.description}</span>
            </span>
            <span className="noobi-pack-check" aria-hidden="true"><Check size={13} /></span>
          </button>
        );
      })}
    </div>
  );
}
