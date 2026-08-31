import {
  Box,
  Check,
  Code2,
  FileText,
  Flag,
  Image,
  LayoutTemplate,
  Map,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

import {
  PIPELINE_STAGES,
  type PipelineStage,
  type ProjectStatus,
} from '../../shared/contracts';
import { stageProgress } from '../ui';

interface PipelineProps {
  stage: PipelineStage;
  status: ProjectStatus;
  compact?: boolean;
}

const ICONS = {
  brief: FileText,
  scaffold: LayoutTemplate,
  gdd: Box,
  assets: Image,
  world: Map,
  code: Code2,
  verify: Check,
  complete: Flag,
} as const;

export function Pipeline({ stage, status, compact = false }: PipelineProps) {
  const progress = stageProgress(stage);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(`[data-stage="${stage}"]`);
    active?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [stage]);

  return (
    <section className={`pipeline${compact ? ' is-compact' : ''}`} aria-label="游戏制作流程">
      <header className="section-heading pipeline-heading">
        <div>
          <span>PRODUCTION PIPELINE</span>
          <strong>制作进度</strong>
        </div>
        <span className={`pipeline-live status-${status}`}>
          {status === 'running' ? 'LIVE' : status.toUpperCase()}
        </span>
      </header>
      <ol ref={listRef}>
        {PIPELINE_STAGES.map((item, index) => {
          const Icon = ICONS[item.id];
          const done = index < progress || stage === 'complete';
          const active = index === progress && stage !== 'complete';
          return (
            <li
              key={item.id}
              data-stage={item.id}
              className={`${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}
              aria-current={active ? 'step' : undefined}
            >
              <span className="pipeline-number">
                {done ? <Check size={12} /> : String(index + 1).padStart(2, '0')}
              </span>
              <Icon size={15} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.short}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
