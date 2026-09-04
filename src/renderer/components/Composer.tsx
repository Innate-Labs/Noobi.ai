import { ArrowUp, Play, Square, WandSparkles } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import type {
  AppSettings,
  ModelOption,
  ProjectRecord,
} from '../../shared/contracts';
import { AssetRequirement } from './AssetRequirement';

interface ComposerProps {
  project: ProjectRecord;
  models: readonly ModelOption[];
  settings: AppSettings;
  imageGenerationAvailable: boolean;
  disabled?: boolean;
  onRun: (
    prompt: string,
    model: string | null,
    effort: string | null,
  ) => Promise<void>;
  onStop: () => Promise<void>;
}

export type ComposerActionMode = 'send' | 'stop' | 'resume';

interface QueuedRun {
  projectId: string;
  prompt: string;
  model: string | null;
  effort: string | null;
}

export function composerActionMode(
  running: boolean,
  prompt: string,
  resumable: boolean,
): ComposerActionMode {
  if (prompt.trim()) return 'send';
  if (running) return 'stop';
  return resumable ? 'resume' : 'send';
}

export function Composer({
  project,
  models,
  settings,
  imageGenerationAvailable,
  disabled = false,
  onRun,
  onStop,
}: ComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(
    project.model ?? settings.defaultModel ?? models.find((item) => item.isDefault)?.model ?? '',
  );
  const activeModel = useMemo(
    () => models.find((item) => item.model === model) ?? models[0] ?? null,
    [model, models],
  );
  const [effort, setEffort] = useState(settings.defaultEffort);
  const [queuedRun, setQueuedRun] = useState<QueuedRun | null>(null);
  const queuedRunRef = useRef(false);
  const running = project.status === 'running';
  const resumable = Boolean(project.threadId) || project.status === 'stopped';
  const actionMode = composerActionMode(running, prompt, resumable);

  useEffect(() => {
    setPrompt('');
    setQueuedRun(null);
    queuedRunRef.current = false;
  }, [project.id]);

  useEffect(() => {
    setModel(
      project.model ??
        settings.defaultModel ??
        models.find((item) => item.isDefault)?.model ??
        models[0]?.model ??
        '',
    );
    setEffort(settings.defaultEffort);
  }, [
    project.model,
    settings.defaultEffort,
    settings.defaultModel,
    models,
  ]);

  useEffect(() => {
    if (!activeModel) return;
    if (!activeModel.efforts.includes(effort)) {
      setEffort(activeModel.defaultEffort);
    }
  }, [activeModel, effort]);

  useEffect(() => {
    if (running || disabled || !queuedRun || queuedRunRef.current) return;
    if (queuedRun.projectId !== project.id) {
      setQueuedRun(null);
      return;
    }
    const nextRun = queuedRun;
    queuedRunRef.current = true;
    void onRun(nextRun.prompt, nextRun.model, nextRun.effort)
      .then(() => {
        setQueuedRun((current) => (current === nextRun ? null : current));
      })
      .catch(() => {
        setPrompt((current) => current || nextRun.prompt);
        setQueuedRun((current) => (current === nextRun ? null : current));
      })
      .finally(() => {
        queuedRunRef.current = false;
      });
  }, [disabled, onRun, project.id, queuedRun, running]);

  async function submit() {
    if (disabled || models.length === 0) return;
    if (running) {
      const nextPrompt = prompt.trim();
      if (!nextPrompt) return;
      setQueuedRun((current) => ({
        projectId: project.id,
        prompt: current?.projectId === project.id
          ? `${current.prompt}\n\n${nextPrompt}`
          : nextPrompt,
        model: activeModel?.model ?? null,
        effort: effort || null,
      }));
      setPrompt('');
      return;
    }
    const nextPrompt = prompt.trim()
      || (project.status === 'draft' ? project.idea : '继续完成并验证当前游戏。');
    await onRun(nextPrompt, activeModel?.model ?? null, effort || null);
    setPrompt('');
  }

  return (
    <section
      className={`composer${running ? ' is-running' : ''}`}
      aria-label={resumable ? '继续制作' : '开始制作'}
    >
      <div className="composer-body">
        <div className="composer-context">
          <span>
            <WandSparkles size={13} />
            {resumable ? '继续制作' : '开始制作'}
          </span>
          <span title={project.threadId ?? undefined}>
            {running
              ? (queuedRun ? '下一条要求已排队' : '正在制作，可先输入下一条要求')
              : (project.threadId
                  ? `THREAD ${project.threadId.slice(0, 8).toUpperCase()}`
                  : 'NEW THREAD')}
          </span>
        </div>
        <textarea
          value={prompt}
          rows={2}
          disabled={disabled}
          aria-label="给 Agent 的制作指令"
          placeholder={
            resumable
              ? '例如：降低敌人速度，补充受击反馈，然后重新构建验证…'
              : '描述你希望制作的游戏，或直接使用项目创意启动…'
          }
          onChange={(event) => {
            setPrompt(event.target.value);
          }}
          onKeyDown={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              event.key === 'Enter' &&
              !disabled
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composer-toolbar">
          <AssetRequirement variant="chip" imageGenerationAvailable={imageGenerationAvailable} />
          <div className="composer-controls">
            <label title={activeModel?.description ?? '模型'}>
              <span className="sr-only">模型</span>
              <select
                aria-label="模型"
                value={activeModel?.model ?? ''}
                disabled={running || disabled || models.length === 0}
                onChange={(event) => setModel(event.target.value)}
              >
                {models.length === 0 ? <option value="">暂无可用模型</option> : null}
                {models.map((item) => (
                  <option value={item.model} key={item.id}>
                    {item.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">推理强度</span>
              <select
                aria-label="推理强度"
                value={effort}
                disabled={running || disabled || !activeModel}
                onChange={(event) => setEffort(event.target.value)}
              >
                {(activeModel?.efforts ?? [settings.defaultEffort]).map((item) => (
                  <option value={item} key={item}>
                    {item.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            {actionMode === 'stop' ? (
              <button
                className="composer-action is-stop"
                type="button"
                aria-label="暂停当前制作"
                title="暂停当前制作"
                onClick={() => {
                  if (queuedRun?.projectId === project.id) {
                    setPrompt((current) => current || queuedRun.prompt);
                  }
                  setQueuedRun(null);
                  void onStop();
                }}
              >
                <Square size={11} fill="currentColor" />
              </button>
            ) : actionMode === 'resume' ? (
              <button
                className="composer-action is-resume"
                type="button"
                aria-label="继续制作"
                title="继续制作"
                disabled={disabled || models.length === 0}
                onClick={() => void submit()}
              >
                <Play size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                className="composer-action is-send"
                type="button"
                aria-label="发送制作要求"
                title="发送制作要求（⌘/Ctrl + Enter）"
                disabled={disabled || models.length === 0}
                onClick={() => void submit()}
              >
                <ArrowUp size={17} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
