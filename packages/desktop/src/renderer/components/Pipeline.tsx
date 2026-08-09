import {
  Blocks,
  Braces,
  Check,
  FileText,
  Images,
  Map,
  ScanSearch,
  TestTube2,
} from 'lucide-react';
import type { PipelineStageId, ProjectStatus } from '../../shared/types';

interface PipelineProps {
  current: PipelineStageId;
  status: ProjectStatus;
}

const STAGES: Array<{
  id: PipelineStageId;
  label: string;
  detail: string;
  icon: typeof ScanSearch;
}> = [
  { id: 'brief', label: '需求拆解', detail: '形成制作任务', icon: ScanSearch },
  { id: 'classify', label: '类型识别', detail: '物理与视角分类', icon: Blocks },
  { id: 'scaffold', label: '工程骨架', detail: '选择稳定模板', icon: Braces },
  { id: 'gdd', label: '游戏设计', detail: '生成六段 GDD', icon: FileText },
  { id: 'assets', label: '素材生成', detail: '图像、动画与音频', icon: Images },
  { id: 'tilemap', label: '地图内容', detail: 'Tilemap 或关卡数据', icon: Map },
  { id: 'code', label: '代码实现', detail: '实体、场景与配置', icon: Braces },
  {
    id: 'verify',
    label: '构建验证',
    detail: '编译、测试与运行',
    icon: TestTube2,
  },
];

export function Pipeline({ current, status }: PipelineProps) {
  const currentIndex =
    current === 'complete'
      ? STAGES.length
      : STAGES.findIndex((item) => item.id === current);

  return (
    <section className="pipeline" aria-label="游戏制作流程">
      <div className="section-kicker">
        <span>制作流程</span>
        <span>{status === 'running' ? 'LIVE' : status.toUpperCase()}</span>
      </div>
      <ol>
        {STAGES.map((stage, index) => {
          const Icon = stage.icon;
          const done = index < currentIndex || current === 'complete';
          const active = index === currentIndex && current !== 'complete';
          return (
            <li
              key={stage.id}
              className={`${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}
            >
              <span className="pipeline-index">
                {done ? (
                  <Check size={13} />
                ) : (
                  String(index + 1).padStart(2, '0')
                )}
              </span>
              <span className="pipeline-icon">
                <Icon size={15} />
              </span>
              <span>
                <strong>{stage.label}</strong>
                <small>{stage.detail}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
