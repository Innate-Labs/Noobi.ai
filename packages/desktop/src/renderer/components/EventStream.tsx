import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  TerminalSquare,
  Wrench,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AgentEvent, ProjectRecord } from '../../shared/types';

interface EventStreamProps {
  project: ProjectRecord;
  events: AgentEvent[];
  liveText: string;
  history: EventHistoryState;
}

export interface EventHistoryState {
  loading: boolean;
  hasMore: boolean;
  source: 'persisted' | 'recording' | 'empty';
  error?: string;
}

export function EventStream({
  project,
  events,
  liveText,
  history,
}: EventStreamProps) {
  const streamRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const frame = requestAnimationFrame(() => {
      stream.scrollTop = stream.scrollHeight;
    });

    return () => cancelAnimationFrame(frame);
  }, [events.length, liveText, project.id]);

  return (
    <div className="event-stream" ref={streamRef}>
      <article className="brief-card">
        <div className="brief-number">01 / BRIEF</div>
        <h2>{project.name}</h2>
        <p>{project.prompt}</p>
        <div className="brief-meta">
          <span>{project.path}</span>
          <time>{new Date(project.createdAt).toLocaleString('zh-CN')}</time>
        </div>
      </article>

      {history.loading ? (
        <div className="history-note is-loading">
          <span className="pulse-dot" /> 正在载入 Agent 历史记录…
        </div>
      ) : null}

      {!history.loading && events.length > 0 ? (
        <div className="history-note">
          {history.source === 'recording'
            ? `已从 Agent 会话恢复 ${events.length} 条历史记录`
            : `已载入 ${events.length} 条本地历史记录`}
          {history.hasMore ? ' · 当前显示最近 500 条' : ''}
        </div>
      ) : null}

      {!history.loading && events.length === 0 && !liveText ? (
        <div className="stream-idle">
          <CircleDot size={22} />
          <strong>
            {history.error
              ? '历史记录载入失败'
              : project.status === 'draft' && !project.sessionId
                ? 'Agent 等待启动'
                : '暂无可显示的历史记录'}
          </strong>
          <p>
            {history.error
              ? history.error
              : project.status === 'draft' && !project.sessionId
                ? '启动后，这里会逐步展示思考、工具调用、文件写入和构建结果。'
                : '这个项目已有会话，但尚未找到可恢复的本地事件。继续执行后，新记录会自动保存。'}
          </p>
        </div>
      ) : null}

      {events.map((event) => {
        const presentation = eventPresentation(event);
        const Icon = presentation.icon;
        const isLong = event.message.length > 460;
        const isExpanded = expanded[event.id];
        return (
          <article
            className={`event-row event-${event.type} ${event.isError ? 'is-error' : ''}`}
            key={event.id}
          >
            <div className="event-rail">
              <span>
                <Icon size={14} />
              </span>
            </div>
            <div className="event-body">
              <header>
                <div>
                  <span className="event-kind">{presentation.label}</span>
                  <strong>{event.title}</strong>
                </div>
                <time>
                  {new Date(event.timestamp).toLocaleTimeString('zh-CN', {
                    hour12: false,
                  })}
                </time>
              </header>
              {event.toolName ? (
                <code className="tool-name">{event.toolName}</code>
              ) : null}
              <pre className={isLong && !isExpanded ? 'is-collapsed' : ''}>
                {event.message}
              </pre>
              {isLong ? (
                <button
                  className="expand-event"
                  onClick={() =>
                    setExpanded((value) => ({
                      ...value,
                      [event.id]: !isExpanded,
                    }))
                  }
                >
                  <ChevronDown
                    size={13}
                    className={isExpanded ? 'is-rotated' : ''}
                  />
                  {isExpanded ? '收起' : '展开完整内容'}
                </button>
              ) : null}
            </div>
          </article>
        );
      })}

      {liveText ? (
        <article className="live-response">
          <div className="live-header">
            <span className="pulse-dot" /> Agent 正在输出
          </div>
          <pre>{liveText}</pre>
        </article>
      ) : null}
    </div>
  );
}

function eventPresentation(event: AgentEvent) {
  if (event.isError || event.type === 'error')
    return { icon: AlertTriangle, label: '异常' };
  if (event.type === 'tool_call') return { icon: Wrench, label: '工具调用' };
  if (event.type === 'tool_result')
    return { icon: TerminalSquare, label: '工具结果' };
  if (event.type === 'thought') return { icon: BrainCircuit, label: '思考' };
  if (event.type === 'user') return { icon: UserRound, label: '用户' };
  if (event.type === 'complete') return { icon: CheckCircle2, label: '完成' };
  return { icon: CircleDot, label: 'Agent' };
}
