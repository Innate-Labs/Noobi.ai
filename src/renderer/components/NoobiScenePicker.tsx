import { Check, MonitorPlay } from 'lucide-react';
import React from 'react';
import type { KeyboardEvent } from 'react';

import {
  NOOBI_SCENE_IDS,
  type NoobiSceneId,
} from '../../shared/contracts';
import collaborationScene from '../assets/noobi-packs/collaboration/scene.png';
import fishingScene from '../assets/noobi-packs/fishing/four-ip-fishing.gif';
import { noobiPackGridColumnCount } from './NoobiPackPicker';

export interface NoobiSceneOption {
  id: NoobiSceneId;
  eyebrow: string;
  name: string;
  description: string;
  image: string;
  badges: readonly string[];
  animated: boolean;
}

export const NOOBI_SCENE_OPTIONS: readonly NoobiSceneOption[] = [
  {
    id: 'collaboration',
    eyebrow: 'COLLABORATION WORKSHOP',
    name: '协作工坊',
    description: '伙伴会按照岗位在策划、美术、工程与测试工位之间协作。',
    image: collaborationScene,
    badges: ['标准场景', '按编队渲染'],
    animated: false,
  },
  {
    id: 'fishing',
    eyebrow: 'POND RETREAT',
    name: '荷塘钓鱼',
    description: '流水、游鱼与随风花草组成的四人钓鱼休憩场景。',
    image: fishingScene,
    badges: ['动态循环', '固定四人'],
    animated: true,
  },
] as const satisfies readonly NoobiSceneOption[];

interface NoobiScenePickerProps {
  value: NoobiSceneId;
  disabled?: boolean;
  busy?: boolean;
  onChange: (sceneId: NoobiSceneId) => void;
}

export function NoobiScenePicker({
  value,
  disabled = false,
  busy = false,
  onChange,
}: NoobiScenePickerProps) {
  function selectAt(index: number) {
    const option = NOOBI_SCENE_OPTIONS[index];
    if (option) onChange(option.id);
  }

  function handleArrowKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    const columnCount = noobiPackGridColumnCount(container);
    let nextIndex = index;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = NOOBI_SCENE_OPTIONS.length - 1;
    if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + NOOBI_SCENE_OPTIONS.length) % NOOBI_SCENE_OPTIONS.length;
    }
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % NOOBI_SCENE_OPTIONS.length;
    if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - columnCount);
    if (event.key === 'ArrowDown') {
      nextIndex = Math.min(NOOBI_SCENE_OPTIONS.length - 1, index + columnCount);
    }
    const nextButton = container?.querySelector<HTMLButtonElement>(
      `button[data-scene-index="${nextIndex}"]`,
    );
    nextButton?.focus();
    selectAt(nextIndex);
  }

  return (
    <section className="noobi-scene-picker" aria-label="Noobi 运行背景" aria-busy={busy}>
      <header className="noobi-scene-heading">
        <span className="noobi-scene-heading-icon" aria-hidden="true"><MonitorPlay size={18} /></span>
        <div>
          <small>RUNNING BACKGROUND</small>
          <strong>选择 Agent 工作时的舞台</strong>
          <p>运行背景只改变制作过程的视觉演出，不会调整伙伴岗位或 Agent 行为。</p>
        </div>
      </header>

      <div className="noobi-scene-grid" role="radiogroup" aria-label="选择运行背景">
        {NOOBI_SCENE_OPTIONS.map((option, index) => {
          const selected = option.id === value;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${option.name}：${option.description}；${option.badges.join('，')}`}
              className={`noobi-pack-card noobi-scene-card${selected ? ' is-selected' : ''}`}
              data-scene-id={option.id}
              data-scene-index={index}
              data-motion={option.animated ? 'animated' : 'static'}
              disabled={disabled || busy}
              tabIndex={selected || (!NOOBI_SCENE_IDS.includes(value) && index === 0) ? 0 : -1}
              key={option.id}
              onKeyDown={(event) => handleArrowKey(event, index)}
              onClick={() => onChange(option.id)}
            >
              <span className="noobi-pack-preview noobi-scene-preview" aria-hidden="true">
                <img
                  className="noobi-pack-scene-image"
                  src={option.image}
                  alt=""
                  draggable={false}
                />
                <span className="noobi-scene-live-badge">
                  <i /> {option.animated ? 'LIVE LOOP' : 'STUDIO MAP'}
                </span>
              </span>
              <span className="noobi-pack-card-copy noobi-scene-card-copy">
                <small>{option.eyebrow}</small>
                <strong>{option.name}</strong>
                <span>{option.description}</span>
                <span className="noobi-scene-card-meta" aria-hidden="true">
                  {option.badges.map((badge) => <em key={badge}>{badge}</em>)}
                </span>
              </span>
              <span className="noobi-pack-check" aria-hidden="true"><Check size={13} /></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
