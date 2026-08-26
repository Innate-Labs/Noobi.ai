import { Gauge } from 'lucide-react';
import type { TargetFrameRate } from '../../shared/contracts';
import { TARGET_FRAME_RATES } from '../../shared/contracts';

interface FrameRateControlProps {
  value: TargetFrameRate;
  onChange: (value: TargetFrameRate) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function FrameRateControl({
  value,
  onChange,
  disabled = false,
  compact = false,
}: FrameRateControlProps) {
  return (
    <fieldset
      className={`frame-rate-control${compact ? ' is-compact' : ''}`}
      disabled={disabled}
      aria-describedby={compact ? undefined : 'frame-rate-help'}
    >
      <legend><Gauge size={13} /> 目标帧率</legend>
      <div className="frame-rate-options">
        {TARGET_FRAME_RATES.map((frameRate) => (
          <label
            key={frameRate}
            className={value === frameRate ? 'is-selected' : ''}
          >
            <input
              type="radio"
              name={compact ? 'composer-target-fps' : 'new-project-target-fps'}
              value={frameRate}
              checked={value === frameRate}
              onChange={() => onChange(frameRate)}
            />
            <strong>{frameRate}</strong>
            <span>FPS</span>
            {!compact ? (
              <small>{frameRate === 30 ? '性能优先' : frameRate === 60 ? '平衡流畅' : '高刷响应'}</small>
            ) : null}
          </label>
        ))}
      </div>
      {!compact ? (
        <p id="frame-rate-help">
          Agent 会同步审计时间步、动画时长和素材变体；切换帧率不会机械复制相同图片。
        </p>
      ) : null}
    </fieldset>
  );
}
