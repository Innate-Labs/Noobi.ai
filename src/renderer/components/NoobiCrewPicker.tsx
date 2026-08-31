import {
  Brush,
  Check,
  Code2,
  ListChecks,
  Plus,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import {
  NOOBI_CREW_MAX_SIZE,
  NOOBI_CREW_MIN_SIZE,
  NOOBI_CREW_ROLES,
  type NoobiCrewMember,
  type NoobiCrewRole,
  type NoobiPackId,
} from '../../shared/contracts';
import {
  NOOBI_PACK_OPTIONS,
  noobiPackGridColumnCount,
} from './NoobiPackPicker';

interface CrewRoleOption {
  id: NoobiCrewRole;
  label: string;
  eyebrow: string;
  detail: string;
  icon: LucideIcon;
}

export const NOOBI_CREW_ROLE_OPTIONS: readonly CrewRoleOption[] = [
  { id: 'planner', label: '策划', eyebrow: 'PLANNER', detail: '需求与玩法', icon: ListChecks },
  { id: 'artist', label: '画师', eyebrow: 'ARTIST', detail: '美术与动效', icon: Brush },
  { id: 'engineer', label: '工程师', eyebrow: 'ENGINEER', detail: '代码与构建', icon: Code2 },
  { id: 'tester', label: '测试员', eyebrow: 'TESTER', detail: '试玩与验收', icon: ShieldCheck },
] as const;

export function toggleNoobiCrewMember(
  crew: readonly NoobiCrewMember[],
  packId: NoobiPackId,
): NoobiCrewMember[] {
  const selected = crew.some((member) => member.packId === packId);
  if (selected) {
    if (crew.length <= NOOBI_CREW_MIN_SIZE) return [...crew];
    return crew.filter((member) => member.packId !== packId);
  }
  if (crew.length >= NOOBI_CREW_MAX_SIZE) return [...crew];
  const role = NOOBI_CREW_ROLES.find(
    (candidate) => !crew.some((member) => member.role === candidate),
  );
  if (!role) return [...crew];
  return [...crew, { packId, role }];
}

export function assignNoobiCrewRole(
  crew: readonly NoobiCrewMember[],
  packId: NoobiPackId,
  role: NoobiCrewRole,
): NoobiCrewMember[] {
  const targetIndex = crew.findIndex((member) => member.packId === packId);
  if (targetIndex < 0 || crew[targetIndex]?.role === role) return [...crew];
  const previousRole = crew[targetIndex]!.role;
  const occupiedIndex = crew.findIndex((member) => member.role === role);
  return crew.map((member, index) => {
    if (index === targetIndex) return { ...member, role };
    if (index === occupiedIndex) return { ...member, role: previousRole };
    return member;
  });
}

interface NoobiCrewPickerProps {
  value: readonly NoobiCrewMember[];
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  onChange: (crew: NoobiCrewMember[]) => void;
}

export function NoobiCrewPicker({
  value,
  disabled = false,
  busy = false,
  label = 'Noobi 制作编队',
  onChange,
}: NoobiCrewPickerProps) {
  const [activePackId, setActivePackId] = useState<NoobiPackId>(
    value[0]?.packId ?? NOOBI_PACK_OPTIONS[0].id,
  );
  const atMinimum = value.length <= NOOBI_CREW_MIN_SIZE;
  const atMaximum = value.length >= NOOBI_CREW_MAX_SIZE;

  function moveCardFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const container = event.currentTarget.closest<HTMLElement>('.noobi-crew-grid');
    const columnCount = noobiPackGridColumnCount(container);
    let nextIndex = index;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = NOOBI_PACK_OPTIONS.length - 1;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + NOOBI_PACK_OPTIONS.length) % NOOBI_PACK_OPTIONS.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % NOOBI_PACK_OPTIONS.length;
    if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - columnCount);
    if (event.key === 'ArrowDown') nextIndex = Math.min(NOOBI_PACK_OPTIONS.length - 1, index + columnCount);
    const nextButton = container?.querySelector<HTMLButtonElement>(`button[data-crew-index="${nextIndex}"]`);
    const nextOption = NOOBI_PACK_OPTIONS[nextIndex];
    if (nextOption) setActivePackId(nextOption.id);
    nextButton?.focus();
  }

  return (
    <section className="noobi-crew-picker" aria-label={label} aria-busy={busy}>
      <header className="noobi-crew-heading">
        <span className="noobi-crew-heading-icon" aria-hidden="true"><Users size={18} /></span>
        <div>
          <small>CREW FORMATION · {value.length}/{NOOBI_CREW_MAX_SIZE}</small>
          <strong>{busy ? '正在保存制作编队…' : `${value.length} 位伙伴已经就位`}</strong>
          <p>选择 2–4 位伙伴；每个岗位只能由一位角色负责，调整岗位时会自动交换。</p>
        </div>
      </header>

      <div className="noobi-crew-role-rail" role="list" aria-label="制作岗位">
        {NOOBI_CREW_ROLE_OPTIONS.map((role) => {
          const member = value.find((item) => item.role === role.id);
          const pack = member
            ? NOOBI_PACK_OPTIONS.find((option) => option.id === member.packId)
            : undefined;
          const Icon = role.icon;
          return (
            <div
              className={`noobi-crew-role-slot${member ? ' is-filled' : ''}`}
              data-role={role.id}
              role="listitem"
              key={role.id}
            >
              <span className="noobi-crew-role-icon" aria-hidden="true"><Icon size={13} /></span>
              <span>
                <small>{role.eyebrow}</small>
                <strong>{role.label}</strong>
              </span>
              {pack ? <img src={pack.avatarImage} alt="" draggable={false} /> : <i>空缺</i>}
            </div>
          );
        })}
      </div>

      <div className="noobi-crew-grid" role="group" aria-label="选择编队角色">
        {NOOBI_PACK_OPTIONS.map((option, index) => {
          const member = value.find((item) => item.packId === option.id);
          const role = member
            ? NOOBI_CREW_ROLE_OPTIONS.find((item) => item.id === member.role)
            : undefined;
          const selectionLocked = Boolean(member ? atMinimum : atMaximum);
          const controlDisabled = disabled || busy;
          const selectionHint = member
            ? atMinimum ? `至少保留 ${NOOBI_CREW_MIN_SIZE} 位伙伴` : '移出编队'
            : atMaximum ? `编队最多 ${NOOBI_CREW_MAX_SIZE} 位伙伴` : '加入编队';

          return (
            <article
              className={`noobi-crew-card${member ? ' is-selected' : ''}`}
              data-role={member?.role}
              key={option.id}
            >
              <button
                type="button"
                className="noobi-crew-card-main"
                aria-pressed={Boolean(member)}
                aria-disabled={controlDisabled || selectionLocked}
                aria-label={`${option.name}，${member ? `${role?.label}，${selectionHint}` : selectionHint}`}
                title={selectionHint}
                data-crew-index={index}
                disabled={controlDisabled}
                tabIndex={activePackId === option.id ? 0 : -1}
                onFocus={() => setActivePackId(option.id)}
                onKeyDown={(event) => moveCardFocus(event, index)}
                onClick={() => {
                  if (selectionLocked) return;
                  onChange(toggleNoobiCrewMember(value, option.id));
                }}
              >
                <span className="noobi-pack-preview" aria-hidden="true">
                  <img className="noobi-pack-scene-image" src={option.sceneImage} alt="" draggable={false} />
                  <img className="noobi-pack-avatar-image" src={option.avatarImage} alt="" draggable={false} />
                  {member && role ? (
                    <span className="noobi-crew-role-chip" data-role={role.id}>
                      {role.eyebrow}
                    </span>
                  ) : null}
                </span>
                <span className="noobi-crew-card-copy">
                  <small>{option.eyebrow}</small>
                  <strong>{option.name}</strong>
                  <span>{option.avatarLabel}</span>
                </span>
                <span className="noobi-crew-card-mark" aria-hidden="true">
                  {member ? <Check size={13} /> : atMaximum ? <X size={12} /> : <Plus size={13} />}
                </span>
              </button>

              {member ? (
                <label className="noobi-crew-role-control" data-role={member.role}>
                  <span>负责岗位</span>
                  <select
                    aria-label={`${option.name}负责岗位`}
                    value={member.role}
                    disabled={controlDisabled}
                    onChange={(event) => onChange(assignNoobiCrewRole(
                      value,
                      option.id,
                      event.target.value as NoobiCrewRole,
                    ))}
                  >
                    {NOOBI_CREW_ROLE_OPTIONS.map((candidate) => {
                      const occupied = value.some(
                        (item) => item.packId !== option.id && item.role === candidate.id,
                      );
                      return (
                        <option value={candidate.id} key={candidate.id}>
                          {candidate.label}{occupied ? ' · 交换' : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : (
                <div className="noobi-crew-card-empty" aria-hidden="true">
                  {atMaximum ? '编队已满' : '选择加入'}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className="noobi-crew-status" aria-live="polite">
        {atMaximum
          ? '四个岗位已全部编入；可先移出一位伙伴再替换。'
          : atMinimum
            ? '已达到最小编队；继续加入伙伴可覆盖更多制作岗位。'
            : `还可以加入 ${NOOBI_CREW_MAX_SIZE - value.length} 位伙伴。`}
      </p>
    </section>
  );
}
