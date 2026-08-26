import { AlertTriangle, CheckCircle2, ImagePlus } from 'lucide-react';

interface AssetRequirementProps {
  imageGenerationAvailable: boolean;
  variant?: 'full' | 'compact';
}

export function AssetRequirement({
  imageGenerationAvailable,
  variant = 'full',
}: AssetRequirementProps) {
  const StatusIcon = imageGenerationAvailable ? CheckCircle2 : AlertTriangle;

  return (
    <section
      className={`asset-requirement is-${variant}${imageGenerationAvailable ? ' is-ready' : ' is-blocked'}`}
      aria-label="AI 图片生成强制素材要求"
    >
      <span className="asset-requirement-icon" aria-hidden="true">
        <ImagePlus size={variant === 'compact' ? 14 : 18} />
      </span>
      <span className="asset-requirement-copy">
        <small>IMAGE ROUTER / REQUIRED</small>
        <strong>必须生成并使用 AI 图片素材</strong>
        {variant === 'full' ? (
          <span>已配置图像 API 时优先调用，否则回退 Codex ImageGen；生成、注册并在游戏中实际使用后才能完成。</span>
        ) : null}
      </span>
      <span className="asset-requirement-status" title={imageGenerationAvailable ? '图像生成路由可用' : '图像 API 与 Codex ImageGen 均不可用'}>
        <StatusIcon size={12} aria-hidden="true" />
        {imageGenerationAvailable ? 'READY' : 'BLOCKED'}
      </span>
    </section>
  );
}
