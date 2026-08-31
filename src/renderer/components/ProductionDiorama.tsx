import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import type {
  NoobiCrewMember,
  NoobiPackId,
  NoobiSceneId,
  NoobiStageMode,
  PipelineStage,
  ProjectStatus,
} from '../../shared/contracts';
import collaborationScene from '../assets/noobi-packs/collaboration/scene.png';
import fishingScene from '../assets/noobi-packs/fishing/four-ip-fishing.gif';
import type { NoobiSpriteManifest } from '../noobiAnimation';
import { noobiProductionPack } from '../noobiProductionPacks';
import {
  WALK_ACTION,
  productionAssistantScene,
  productionCrewActionDelay,
  productionCrewMembers,
  selectProductionAssistantBeat,
  selectProductionCrewRoamPoint,
  shouldProductionAssistantRoam,
  type ProductionCrewMember,
  type ProductionCrewRole,
  type ProductionCrewSize,
} from '../productionAssistantState';
import {
  advanceProductionAssistantRoute,
  createProductionAssistantMotion,
  routeProductionAssistant,
  settleProductionAssistantAt,
  type ProductionAssistantMotionState,
} from '../productionAssistantMotion';
import {
  productionDepthZ,
  WORKSHOP_DEPTH_OBJECTS,
} from '../productionMapNavigation';
import { NoobiAnimatedSprite } from './NoobiAnimatedSprite';

interface ProductionDioramaProps {
  stage: PipelineStage;
  status: ProjectStatus;
  stageMode?: NoobiStageMode;
  sceneId?: NoobiSceneId;
  soloSceneId?: NoobiPackId;
  packId?: NoobiPackId;
  spriteManifest?: NoobiSpriteManifest;
  crewSize?: ProductionCrewSize;
  crew?: readonly NoobiCrewMember[];
}

export function ProductionDiorama({
  stage,
  status,
  stageMode = 'solo',
  sceneId = 'collaboration',
  soloSceneId = 'classic',
  packId = 'classic',
  spriteManifest,
  crewSize = 4,
  crew: configuredCrew,
}: ProductionDioramaProps) {
  const productionPack = noobiProductionPack(packId);
  const soloScenePack = noobiProductionPack(soloSceneId);
  const activeSpriteManifest = spriteManifest ?? productionPack.spriteManifest;
  const scene = useMemo(() => productionAssistantScene(stage, status), [stage, status]);
  const collaborativeRuntime = stageMode === 'crew';
  const runtimeConfiguredCrew = collaborativeRuntime ? configuredCrew : undefined;
  const runtimeCrewSize: ProductionCrewSize = collaborativeRuntime ? crewSize : 1;
  const crew = useMemo(
    () => configuredProductionCrewMembers(stage, status, runtimeConfiguredCrew, runtimeCrewSize),
    [runtimeConfiguredCrew, runtimeCrewSize, stage, status],
  );
  const activeMember = crew.find((member) => member.active) ?? crew[0]!;
  const bakedRuntimeScene = collaborativeRuntime && sceneId === 'fishing';
  const sceneImage = !collaborativeRuntime
    ? soloScenePack.sceneImage
    : bakedRuntimeScene ? fishingScene : collaborationScene;
  const orderedCrew = useMemo(() => [
    ...crew.filter((member) => member.active),
    ...crew.filter((member) => !member.active),
  ], [crew]);
  const reducedMotion = useReducedMotion();
  const documentVisible = useDocumentVisible();
  const [actorSnapshots, setActorSnapshots] = useState<Partial<
    Record<ProductionCrewRole, ProductionAssistantMotionState>
  >>({});
  const handleActorChange = useCallback((
    role: ProductionCrewRole,
    actor: ProductionAssistantMotionState,
  ) => {
    setActorSnapshots((current) => (
      current[role] === actor ? current : { ...current, [role]: actor }
    ));
  }, []);
  const activeActor = actorSnapshots[activeMember.role] ?? initialCrewActor(activeMember);
  const visibleEgg = activeActor.easterEgg;
  const statusLabel = status === 'running'
    ? 'NOOBI WORKING'
    : status === 'completed'
      ? 'READY TO PLAY'
      : status === 'waiting'
        ? 'WAITING FOR YOU'
        : status === 'draft'
          ? 'TAKING A BREAK'
          : status === 'stopped'
            ? 'PAUSED'
            : 'NEEDS A HAND';

  return (
    <section
      className={`production-diorama status-${status}`}
      data-stage={scene.stage}
      data-noobi-pack={packId}
      data-stage-mode={stageMode}
      data-runtime-scene={collaborativeRuntime ? sceneId : soloSceneId}
      data-station={activeMember.station}
      data-pipeline-station={scene.station}
      data-action={activeActor.action.id}
      data-easter-egg={visibleEgg?.id ?? 'none'}
      data-actor-node={activeActor.nodeId}
      data-actor-target={activeActor.targetNodeId ?? 'none'}
      data-route-remaining={activeActor.remainingRoute.length}
      data-active-crew-role={activeMember.role}
      data-crew-size={crew.length}
      data-crew-packs={runtimeConfiguredCrew?.map((member) => `${member.role}:${member.packId}`).join(',') ?? packId}
      data-scene-mode={bakedRuntimeScene ? 'fishing' : collaborativeRuntime ? 'collaboration' : 'solo'}
      aria-label={collaborativeRuntime ? 'Noobi 多人像素制作场景' : 'Noobi 单人像素制作场景'}
    >
      <div className="workshop-map" aria-hidden="true">
        <img src={sceneImage} alt="" draggable={false} />
      </div>
      <div className="workshop-pixel-lights" aria-hidden="true">
        <span /><span /><span /><span />
      </div>

      <div className="diorama-narration" role="status" aria-live="polite" aria-atomic="true">
        <span><i /> {statusLabel}</span>
        <strong>{scene.headline}</strong>
        <p>{activeMember.roleLabel} · {activeMember.stationLabel} · {scene.detail}</p>
      </div>

      {!bakedRuntimeScene ? WORKSHOP_DEPTH_OBJECTS.map((depthObject) => (
        <img
          key={depthObject.id}
          className="workshop-occluder"
          src={sceneImage}
          alt=""
          draggable={false}
          aria-hidden="true"
          data-depth-object={depthObject.id}
          style={{
            clipPath: depthObject.clipPath,
            zIndex: productionDepthZ(depthObject.depthY),
          }}
        />
      )) : null}

      {!bakedRuntimeScene ? orderedCrew.map((member) => {
        const configuredMember = runtimeConfiguredCrew?.find((item) => item.role === member.role);
        const memberPackId = configuredMember?.packId ?? packId;
        return (
          <ProductionCrewActor
            key={`${member.id}:${memberPackId}`}
            member={member}
            packId={memberPackId}
            status={status}
            manifest={configuredMember
              ? noobiProductionPack(configuredMember.packId).spriteManifest
              : activeSpriteManifest}
            documentVisible={documentVisible}
            reducedMotion={reducedMotion}
            onActorChange={handleActorChange}
          />
        );
      }) : null}

      <div className="diorama-action" aria-hidden="true">
        <span className={`diorama-action-led ${activeActor.phase === 'walking' ? 'is-moving' : ''}`} />
        <b>
          {activeMember.roleLabel} · {activeActor.phase === 'walking'
            ? WALK_ACTION.label
            : activeActor.action.label}
        </b>
        {visibleEgg ? <em>{visibleEgg.label}</em> : null}
      </div>

    </section>
  );
}

interface ProductionCrewActorProps {
  member: ProductionCrewMember;
  packId: NoobiPackId;
  status: ProjectStatus;
  manifest: NoobiSpriteManifest;
  documentVisible: boolean;
  reducedMotion: boolean;
  onActorChange: (role: ProductionCrewRole, actor: ProductionAssistantMotionState) => void;
}

function ProductionCrewActor({
  member,
  packId,
  status,
  manifest,
  documentVisible,
  reducedMotion,
  onActorChange,
}: ProductionCrewActorProps) {
  const [actor, setActor] = useState<ProductionAssistantMotionState>(
    () => initialCrewActor(member),
  );
  const actionsKey = member.actions.map((item) => item.id).join(':');

  useEffect(() => {
    setActor((current) => {
      const firstAction = member.actions[0]!;
      return reducedMotion
        ? settleProductionAssistantAt(current, member.nodeId, firstAction)
        : routeProductionAssistant(current, member.nodeId, firstAction);
    });
  }, [actionsKey, member.actions, member.nodeId, member.station, reducedMotion]);

  useEffect(() => {
    onActorChange(member.role, actor);
  }, [actor, member.role, onActorChange]);

  useEffect(() => {
    if (reducedMotion || !documentVisible) return undefined;
    const delay = actor.phase === 'walking'
      ? actor.segmentMs
      : productionCrewActionDelay(member);
    const timer = window.setTimeout(() => {
      setActor((current) => {
        if (current.phase === 'walking') return advanceProductionAssistantRoute(current);

        const selectedBeat = selectProductionAssistantBeat(member.actions, current.action.id);
        const beat = status === 'running' && member.active
          ? selectedBeat
          : { ...selectedBeat, easterEgg: null };
        const canRoam = shouldProductionAssistantRoam(
          status,
          beat.action,
          beat.easterEgg,
        );
        if (!canRoam) {
          return {
            ...current,
            action: beat.action,
            pendingAction: beat.action,
            easterEgg: beat.easterEgg,
            pendingEasterEgg: beat.easterEgg,
          };
        }

        const destination = selectProductionCrewRoamPoint(
          member,
          current.x,
          current.y,
        );
        const moonwalking = beat.easterEgg?.id === 'moonwalk';
        return routeProductionAssistant(current, destination.nodeId, beat.action, {
          easterEgg: beat.easterEgg,
          hideEasterEggOnArrival: moonwalking,
        });
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    actor.action.id,
    actor.phase,
    actor.segmentMs,
    actionsKey,
    documentVisible,
    member,
    reducedMotion,
    status,
  ]);

  const visibleEgg = actor.easterEgg;
  const renderedPose = visibleEgg?.id === 'debug-dance'
    ? 'celebrate'
    : actor.action.pose;
  const shadowProfile = noobiGroundShadowProfile(renderedPose, actor.phase);

  return (
    <div
      className={`production-assistant production-crew-member phase-${actor.phase}${member.active ? ' is-primary' : ' is-support'}${visibleEgg ? ` egg-${visibleEgg.id}` : ''}`}
      data-crew-role={member.role}
      data-noobi-member-pack={packId}
      data-crew-active={member.active ? 'true' : 'false'}
      data-crew-station={member.station}
      data-action={actor.action.id}
      data-pose={actor.action.pose}
      data-shadow-profile={shadowProfile}
      style={{
        '--assistant-x': `${actor.x}%`,
        '--assistant-y': `${actor.y}%`,
        '--assistant-facing': actor.facing,
        '--assistant-travel': `${actor.segmentMs}ms`,
        zIndex: productionDepthZ(actor.depthY),
      } as CSSProperties}
      aria-hidden="true"
    >
      <span
        className="production-assistant-shadow"
        data-noobi-ground-shadow={member.active ? 'main' : member.role}
        data-shadow-profile={shadowProfile}
      />
      <div className="production-assistant-bob">
        <NoobiAnimatedSprite
          pose={renderedPose}
          manifest={manifest}
          playbackKey={`${member.role}:${actor.action.id}:${visibleEgg?.id ?? 'none'}`}
          paused={!documentVisible}
          reducedMotion={reducedMotion}
        />
      </div>
      <span className="production-crew-role-pin">{member.badgeLabel}</span>
      {visibleEgg?.id === 'golden-acorn' ? <span className="assistant-golden-acorn" /> : null}
      {visibleEgg?.id === 'mini-noobi' ? (
        <span className="assistant-mini-noobi">
          <span
            className="assistant-mini-noobi-shadow"
            data-noobi-ground-shadow="mini"
            data-shadow-profile="mini"
          />
          <NoobiAnimatedSprite
            pose="celebrate"
            manifest={manifest}
            playbackKey={`${member.role}:${visibleEgg.id}`}
            mini
            paused={!documentVisible}
            reducedMotion={reducedMotion}
          />
        </span>
      ) : null}
      {visibleEgg?.id === 'debug-dance' ? <span className="assistant-debug-note">♪</span> : null}
    </div>
  );
}

export function configuredProductionCrewMembers(
  stage: PipelineStage,
  status: ProjectStatus,
  configuredCrew: readonly NoobiCrewMember[] | undefined,
  legacyCrewSize: ProductionCrewSize = 4,
): readonly ProductionCrewMember[] {
  if (!configuredCrew?.length) return productionCrewMembers(stage, status, legacyCrewSize);
  const configuredRoles = new Set(configuredCrew.map((member) => member.role));
  const selected = productionCrewMembers(stage, status, 4)
    .filter((member) => configuredRoles.has(member.role));
  if (selected.some((member) => member.active)) return selected;

  const leadRole = configuredCrew[0]?.role;
  const primaryActions = productionAssistantScene(stage, status).actions;
  return selected.map((member) => member.role === leadRole
    ? { ...member, active: true, actions: primaryActions }
    : member);
}

export type NoobiGroundShadowProfile = 'standing' | 'walking' | 'sleeping';

/**
 * Keeps the contact shadow tied to locomotion instead of individual sprite crops.
 * This is exported so renderer smoke tests can verify every pose has a stable profile.
 */
export function noobiGroundShadowProfile(
  pose: ProductionAssistantMotionState['action']['pose'],
  phase: ProductionAssistantMotionState['phase'],
): NoobiGroundShadowProfile {
  if (pose === 'sleep') return 'sleeping';
  if (pose === 'walk' || phase === 'walking') return 'walking';
  return 'standing';
}

function initialCrewActor(member: ProductionCrewMember): ProductionAssistantMotionState {
  return createProductionAssistantMotion(member.nodeId, member.actions[0]!);
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => (
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  ));

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}
