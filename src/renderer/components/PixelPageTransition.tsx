import {
  useEffect,
  useRef,
  type AnimationEvent,
  type CSSProperties,
} from 'react';

import { noobiTransitionSceneForRun } from './noobiTransitionScenes';

export const PIXEL_TRANSITION_COLUMNS = 14;
export const PIXEL_TRANSITION_ROWS = 9;
export const PIXEL_TRANSITION_MAX_CELL_DELAY_MS = 480;
export const PIXEL_COVER_DURATION_MS = 600;
export const PIXEL_REVEAL_DURATION_MS = 600;

export type PixelTransitionDirection = 'forward' | 'backward';
export type PixelTransitionPhase = 'covering' | 'revealing';

interface PixelPageTransitionProps {
  direction: PixelTransitionDirection;
  phase: PixelTransitionPhase;
  runId: number;
  onComplete: (phase: PixelTransitionPhase, runId: number) => void;
}

type PixelCellStyle = CSSProperties & {
  '--pixel-cell-delay': `${number}ms`;
  '--pixel-cell-tone': number;
};

const CELLS = Array.from(
  { length: PIXEL_TRANSITION_COLUMNS * PIXEL_TRANSITION_ROWS },
  (_, index) => index,
);

export function pixelTransitionCellDelay(
  index: number,
  direction: PixelTransitionDirection,
): number {
  const column = index % PIXEL_TRANSITION_COLUMNS;
  const row = Math.floor(index / PIXEL_TRANSITION_COLUMNS);
  const horizontal = direction === 'forward'
    ? column
    : PIXEL_TRANSITION_COLUMNS - column - 1;
  const vertical = direction === 'forward'
    ? row
    : PIXEL_TRANSITION_ROWS - row - 1;
  const distance = horizontal + vertical * 0.72;
  const maxDistance = (PIXEL_TRANSITION_COLUMNS - 1) + (PIXEL_TRANSITION_ROWS - 1) * 0.72;
  return Math.round((distance / maxDistance) * PIXEL_TRANSITION_MAX_CELL_DELAY_MS);
}

export function PixelPageTransition({
  direction,
  phase,
  runId,
  onComplete,
}: PixelPageTransitionProps) {
  const completeRef = useRef(onComplete);
  const didCompleteRef = useRef(false);
  const sceneGif = noobiTransitionSceneForRun(runId);
  const duration = phase === 'covering'
    ? PIXEL_COVER_DURATION_MS
    : PIXEL_REVEAL_DURATION_MS;

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    didCompleteRef.current = false;
    const fallback = window.setTimeout(() => {
      if (didCompleteRef.current) return;
      didCompleteRef.current = true;
      completeRef.current(phase, runId);
    }, duration + 100);
    return () => window.clearTimeout(fallback);
  }, [duration, phase, runId]);

  function finish(event: AnimationEvent<HTMLDivElement>) {
    const expectedAnimation = phase === 'covering'
      ? 'pixel-transition-clock-cover'
      : 'pixel-transition-clock-reveal';
    if (
      event.currentTarget !== event.target ||
      event.animationName !== expectedAnimation ||
      didCompleteRef.current
    ) {
      return;
    }
    didCompleteRef.current = true;
    completeRef.current(phase, runId);
  }

  return (
    <div
      className={`pixel-page-transition phase-${phase} direction-${direction}`}
      data-phase={phase}
      data-run-id={runId}
      aria-hidden="true"
      style={{ '--pixel-phase-duration': `${duration}ms` } as CSSProperties}
      onAnimationEnd={finish}
    >
      <div className="pixel-transition-grid">
        {CELLS.map((index) => {
          const column = index % PIXEL_TRANSITION_COLUMNS;
          const row = Math.floor(index / PIXEL_TRANSITION_COLUMNS);
          const style: PixelCellStyle = {
            '--pixel-cell-delay': `${pixelTransitionCellDelay(index, direction)}ms`,
            '--pixel-cell-tone': (column + row) % 4,
          };
          return <i key={index} style={style} />;
        })}
      </div>

      <div className="pixel-transition-scene">
        <img src={sceneGif} alt="" draggable={false} />
      </div>
    </div>
  );
}
