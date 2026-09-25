import React from 'react';

import walkFrameA from '../assets/noobi-packs/classic/frames/sprite-walk-a-a.png';
import walkFrameB from '../assets/noobi-packs/classic/frames/sprite-walk-a-b.png';

export type LaunchTransitionPhase = 'running' | 'leaving';

interface LaunchTransitionProps {
  phase: LaunchTransitionPhase;
}

export function LaunchTransition({ phase }: LaunchTransitionProps) {
  return (
    <div
      className={`launch-transition is-${phase}`}
      role="status"
      aria-live="polite"
      aria-label="正在进入游戏制作工作台"
    >
      <div className="launch-transition-copy">
        <strong>正在建立 New Game</strong>
        <span>鸭嘴兽正把创意送进制作工作台</span>
      </div>
      <div className="launch-transition-track" aria-hidden="true">
        <span className="launch-transition-runner">
          <img src={walkFrameA} alt="" />
          <img src={walkFrameB} alt="" />
        </span>
      </div>
    </div>
  );
}
