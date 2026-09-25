import React, { useEffect, useRef, useState } from 'react';
import { BUDGET_LABELS, FAILURE_LABELS, type ProductionBudgetKind } from '../../shared/productionPolicy';
import { PRODUCTION_TASK_TITLES, type ProductionProgress, type ProductionTaskStatus } from '../../shared/productionProgress';
import type { ProductionExecution } from '../../shared/productionGraph';
import './productionProgress.css';

const labels: Record<ProductionTaskStatus, string> = { pending: '待执行', running: '进行中', completed: '已完成',
  'needs-repair': '需修复', failed: '失败', interrupted: '已中断', 'not-needed': '本次无需' };
const runLabels = { running: '制作中', completed: '交付检查通过', failed: '需处理', interrupted: '待继续' };

function ExecutionHistory({ executions }: { executions?: ProductionExecution[] }) {
  return <details className="production-executions"><summary>查看执行与版本依据{executions ? `（${executions.length} 条）` : ''}</summary>
    {!executions?.length ? <p>此轮尚无步骤证据；旧版记录不会补造输入或输出版本。</p> : <ol>{executions.map((execution, index) => <li key={execution.id}>
      <details><summary>{index + 1}. {PRODUCTION_TASK_TITLES[execution.taskId]} · {execution.reused ? '已复用' : labels[execution.status]}</summary>
        <p>依赖：{execution.dependencies.map(id => { const at = executions.findIndex(item => item.id === id); return at < 0 ? '未知记录' : `第 ${at + 1} 步`; }).join('、') || '起点'}</p>
        <p>{execution.detail || (execution.status === 'running' ? '等待步骤完成' : '步骤结果已保存，整体品质仍需验收')}</p>
        <p>输入版本：<code>{execution.input?.sourceHash || (execution.reused ? '使用已匹配的完成回合' : '未记录')}</code></p>
        <p>输出版本：<code>{execution.output?.sourceHash || '未记录，不能据此确认产物'}</code></p>
        {execution.output?.build && <p>构建：<code>{execution.output.build.id}</code><br />报告摘要：<code>{execution.output.build.reportHash || '此步骤未绑定报告'}</code></p>}
        {execution.output?.buildUnavailable && <p>{execution.output.buildUnavailable}</p>}
        {execution.output?.assetsHash && <p>素材账本摘要：<code>{execution.output.assetsHash}</code></p>}
        <p>{new Date(execution.startedAt).toLocaleString('zh-CN')} → {execution.finishedAt ? new Date(execution.finishedAt).toLocaleString('zh-CN') : '进行中'}</p>
      </details>
    </li>)}</ol>}
    <p>版本依据用于核对执行过程，不代替玩法或美术验收。</p>
  </details>;
}

export function ProductionProgressView({ progress, error, onExtend, extending = false }: { progress: ProductionProgress | null; error?: string; onExtend?: () => void; extending?: boolean }) {
  if (!progress) return <details className="production-progress"><summary>制作进度</summary>
    <p role={error ? 'alert' : undefined}>{error || '尚无任务记录。开始或继续制作后，将保存任务状态；不会从旧对话推测已完成内容。'}</p></details>;
  const relevant = progress.tasks.filter(task => task.status !== 'not-needed');
  const finished = relevant.filter(task => task.status === 'completed').length;
  const current = relevant.find(task => task.status === 'running');
  const last = progress.attempts.at(-1);
  return <details className="production-progress" open>
    <summary><span>制作进度 · {runLabels[progress.status]}</span><small>{finished}/{relevant.length} 项任务</small></summary>
    <div className="production-progress-body">
      <p className="production-progress-plan" title={progress.planTitle}>{progress.planTitle}</p>
      <p role="status">{current ? `当前：${current.title}` : progress.status === 'completed' ? '本轮交付检查已通过' : '记录已保存，可继续处理剩余任务'} · 第 {progress.attempts.length} 次执行</p>
      {last?.error && <p className="production-progress-error" role="alert">{last.error}</p>}
      {progress.failure && <p role="status"><strong>{FAILURE_LABELS[progress.failure.category]}</strong> · {progress.failure.action}</p>}
      {progress.budget && <details className="production-budget">
        <summary>累计预算 · 回合 {progress.budget.used.turns}/{progress.budget.limits.turns} · 修复 {progress.budget.used.repairs}/{progress.budget.limits.repairs} · 重连 {progress.budget.used.reconnects}/{progress.budget.limits.reconnects}</summary>
        <ul>{(Object.keys(BUDGET_LABELS) as ProductionBudgetKind[]).map(kind => <li key={kind}>
          {BUDGET_LABELS[kind]}：{progress.budget!.used[kind]} / {progress.budget!.limits[kind]} 次
        </li>)}</ul>
        <p>按派发前预留次数计数，失败也计入；重启不清零。实际费用与 Token 用量暂未知。</p>
        {progress.budget.priorUsageUnknown && <p>旧版执行消耗未知，以上仅包含启用统计后的记录。</p>}
        {progress.budget.grants.length > 0 && <p>已手动增加预算 {progress.budget.grants.length} 次；已有消耗继续累计。</p>}
        {onExtend && ['interrupted', 'failed'].includes(progress.status) && <button type="button" disabled={extending} onClick={onExtend}>
          {extending ? '正在保存…' : '增加预算：20 回合 / 3 修复 / 3 重连'}
        </button>}
        {onExtend && ['interrupted', 'failed'].includes(progress.status) && <p>只增加额度，不会自动开始；继续制作后可能产生额外消耗。</p>}
      </details>}
      {error && <p role="alert" className="production-progress-error">{error}</p>}
      <ol className="production-task-list">{progress.tasks.map(task => <li key={task.id} data-status={task.status}>
        <span>{task.title}</span><strong>{task.reused ? '已复用' : labels[task.status]}</strong>
        {task.detail && <small>{task.detail}</small>}
        {task.contract && <details className="production-task-contract"><summary>任务要求{task.status === 'pending' && task.contract.dependencies.length ? ` · 等待${task.contract.dependencies.map(id => PRODUCTION_TASK_TITLES[id]).join('、')}` : ''}</summary>
          <p>{task.contract.scope}</p><p>完成标准：{task.contract.gate}</p>
          <p>对应需求：{task.contract.requirementIds.join('、') || '旧方案未记录需求编号'} · 方案版本：<code>{progress.planVersionId}</code></p>
          <p>本步骤使用上方累计执行预算；恢复不会清零。</p>
        </details>}
      </li>)}</ol>
      <ExecutionHistory executions={last?.executions} />
      <p>{progress.recoveryNote}</p>
      {progress.status !== 'completed' && <p>实现回合完成不代表游戏已通过验收。</p>}
      {progress.attempts.length > 1 && <details className="production-attempt-history"><summary>查看前 {progress.attempts.length - 1} 次执行记录</summary>
        {progress.attempts.slice(0, -1).slice().reverse().map((attempt, index) => <details key={attempt.id}>
          <summary>第 {progress.attempts.length - 1 - index} 次 · {runLabels[attempt.status]} · {new Date(attempt.startedAt).toLocaleString('zh-CN')}</summary>
          {attempt.error && <p>{attempt.error}</p>}
          {attempt.failure && <p>{FAILURE_LABELS[attempt.failure.category]} · {attempt.failure.action}</p>}
          {attempt.budgetUsed && <p>截至此轮累计：{attempt.budgetUsed.turns} 回合 / {attempt.budgetUsed.repairs} 修复 / {attempt.budgetUsed.reconnects} 重连</p>}
          <ul>{attempt.tasks.map(task => <li key={task.id}>{task.title}：{labels[task.status]}{task.detail ? ` · ${task.detail}` : ''}</li>)}</ul>
          <ExecutionHistory executions={attempt.executions} />
        </details>)}
      </details>}
    </div>
  </details>;
}

export function ProductionProgressPanel({ projectId, planRunId, projectStatus }: { projectId: string; planRunId?: string; projectStatus: string }) {
  const [progress, setProgress] = useState<ProductionProgress | null>(null);
  const [error, setError] = useState('');
  const [extending, setExtending] = useState(false);
  const extendPending = useRef(false);
  const selection = useRef({ projectId, planRunId });
  selection.current = { projectId, planRunId };
  useEffect(() => {
    let active = true;
    setProgress(null); setError('');
    const accept = (next: ProductionProgress) => {
      if (!active || next.projectId !== projectId || next.planRunId !== planRunId) return;
      setProgress(current => !current || next.revision >= current.revision ? next : current);
      setError('');
    };
    const unsubscribe = window.noobi.onProductionProgressChanged(accept);
    void window.noobi.getProductionProgress(projectId).then(next => { if (next) accept(next); })
      .catch(reason => { if (active) setError(`无法读取制作进度：${reason instanceof Error ? reason.message : String(reason)}`); });
    return () => { active = false; unsubscribe(); };
  }, [projectId, planRunId, projectStatus]);
  const extend = async () => {
    if (!progress || extendPending.current) return;
    extendPending.current = true; setExtending(true); setError('');
    const selected = selection.current;
    try {
      const next = await window.noobi.extendProductionBudget({ projectId, planRunId: progress.planRunId, revision: progress.revision });
      if (selection.current.projectId === selected.projectId && selection.current.planRunId === selected.planRunId)
        setProgress(current => !current || next.revision >= current.revision ? next : current);
    } catch (reason) {
      if (selection.current.projectId === selected.projectId && selection.current.planRunId === selected.planRunId) setError(String(reason));
    } finally { extendPending.current = false; setExtending(false); }
  };
  return <ProductionProgressView progress={progress} error={error} onExtend={projectStatus === 'running' ? undefined : () => void extend()} extending={extending} />;
}
