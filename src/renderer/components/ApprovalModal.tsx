import {
  Check,
  CheckCheck,
  Clock3,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type {
  ApprovalAnswers,
  ApprovalDecision,
  ApprovalRequest,
} from '../../shared/contracts';
import { toMessage } from '../ui';
import { Modal } from './Modal';

interface ApprovalModalProps {
  approval: ApprovalRequest;
  pendingCount: number;
  onResolve: (
    token: string,
    decision: ApprovalDecision,
    answers?: ApprovalAnswers,
  ) => Promise<void>;
}

interface InputQuestion {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: Array<{ label: string; description: string }> | null;
}

const KIND_LABELS: Record<ApprovalRequest['kind'], string> = {
  command: 'COMMAND APPROVAL',
  file: 'FILE CHANGE APPROVAL',
  permissions: 'PERMISSION APPROVAL',
  input: 'USER INPUT',
};

export function ApprovalModal({
  approval,
  pendingCount,
  onResolve,
}: ApprovalModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const questions = useMemo(() => readQuestions(approval), [approval]);
  const availableDecisions = useMemo(
    () => Array.isArray(approval.details.availableDecisions)
      ? approval.details.availableDecisions.filter((value): value is ApprovalDecision =>
          typeof value === 'string' && ['accept', 'acceptForSession', 'decline', 'cancel'].includes(value),
        )
      : null,
    [approval.details],
  );
  const canDecide = (decision: ApprovalDecision) =>
    !availableDecisions || availableDecisions.includes(decision);
  const details = useMemo(
    () => JSON.stringify(approval.details, null, 2),
    [approval.details],
  );

  async function resolve(decision: ApprovalDecision, payload?: ApprovalAnswers) {
    setBusy(true);
    setError('');
    try {
      await onResolve(approval.token, decision, payload);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      eyebrow={KIND_LABELS[approval.kind]}
      title={approval.title}
      description="Codex 正在等待你的明确决定；未批准前不会继续这一步。"
      className="approval-modal"
      footer={
        <>
          <span className="approval-queue">
            <Clock3 size={13} /> {pendingCount} 个待处理请求
          </span>
          <div className="approval-actions">
            {approval.kind === 'input' && questions.length > 0 ? (
              <>
                <button className="danger-button" type="button" disabled={busy} onClick={() => void resolve('cancel')}>
                  <X size={14} /> 不提供回答
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={busy || questions.some((question) => !answers[question.id]?.trim())}
                  onClick={() => void resolve(
                    'accept',
                    Object.fromEntries(
                      questions.map((question) => [question.id, [answers[question.id] ?? '']]),
                    ),
                  )}
                >
                  <Check size={14} /> 提交回答
                </button>
              </>
            ) : approval.kind === 'input' ? (
              <>
                <button className="danger-button" type="button" disabled={busy} onClick={() => void resolve('decline')}>
                  <X size={14} /> 拒绝请求
                </button>
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void resolve('cancel')}>
                  取消
                </button>
              </>
            ) : (
              <>
                {canDecide('decline') ? (
                  <button className="danger-button" type="button" disabled={busy} onClick={() => void resolve('decline')}>
                    <X size={14} /> 拒绝
                  </button>
                ) : null}
                {canDecide('accept') ? (
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => void resolve('accept')}>
                    <Check size={14} /> 仅本次允许
                  </button>
                ) : null}
                {canDecide('acceptForSession') ? (
                  <button className="primary-button" type="button" disabled={busy} onClick={() => void resolve('acceptForSession')}>
                    <CheckCheck size={14} /> 本次会话允许
                  </button>
                ) : null}
              </>
            )}
          </div>
        </>
      }
    >
      <div className="approval-context">
        <ShieldAlert size={20} />
        <div>
          <span>RUNTIME REQUEST</span>
          <p>{approval.summary}</p>
        </div>
      </div>
      {questions.length > 0 ? (
        <div className="approval-questions">
          {questions.map((question) => (
            <fieldset key={question.id}>
              <legend><span>{question.header}</span>{question.question}</legend>
              {question.options?.map((option) => (
                <label className="approval-option" key={option.label}>
                  <input
                    type="radio"
                    name={question.id}
                    value={option.label}
                    checked={answers[question.id] === option.label}
                    onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.label }))}
                  />
                  <span><strong>{option.label}</strong><small>{option.description}</small></span>
                </label>
              ))}
              {!question.options || question.isOther ? (
                <label className="approval-other">
                  <span>{question.options ? '其他回答' : '你的回答'}</span>
                  <input
                    type={question.isSecret ? 'password' : 'text'}
                    autoComplete="off"
                    value={question.options?.some((option) => option.label === answers[question.id]) ? '' : answers[question.id] ?? ''}
                    onChange={(event) => setAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value,
                    }))}
                  />
                </label>
              ) : null}
            </fieldset>
          ))}
        </div>
      ) : null}
      <dl className="approval-meta">
        <div><dt>Method</dt><dd>{approval.method}</dd></div>
        <div><dt>Project</dt><dd>{approval.projectId ?? 'GLOBAL'}</dd></div>
        <div><dt>Created</dt><dd>{new Date(approval.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}</dd></div>
      </dl>
      {details && details !== '{}' ? (
        <div className="approval-details">
          <span>SAFE REQUEST DETAILS</span>
          <pre>{details}</pre>
        </div>
      ) : null}
      {error ? <div className="form-error" role="alert">{error}</div> : null}
    </Modal>
  );
}

function readQuestions(approval: ApprovalRequest): InputQuestion[] {
  if (approval.method !== 'item/tool/requestUserInput') return [];
  const questions = approval.details.questions;
  if (!Array.isArray(questions)) return [];
  return questions.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const question = value as Record<string, unknown>;
    if (
      typeof question.id !== 'string' ||
      typeof question.header !== 'string' ||
      typeof question.question !== 'string'
    ) return [];
    const options = Array.isArray(question.options)
      ? question.options.flatMap((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
          const option = entry as Record<string, unknown>;
          return typeof option.label === 'string' && typeof option.description === 'string'
            ? [{ label: option.label, description: option.description }]
            : [];
        })
      : null;
    return [{
      id: question.id,
      header: question.header,
      question: question.question,
      isOther: question.isOther === true,
      isSecret: question.isSecret === true,
      options,
    }];
  });
}
