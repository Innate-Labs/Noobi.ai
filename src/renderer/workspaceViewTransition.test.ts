import { describe, expect, it } from 'vitest';

import {
  WORKSPACE_HOME_TARGET,
  createWorkspaceViewTransitionState,
  workspaceProjectTarget,
  workspaceViewTransitionReducer,
  type WorkspaceViewTransitionState,
} from './workspaceViewTransition';

const navigate = (
  state: WorkspaceViewTransitionState,
  target: ReturnType<typeof workspaceProjectTarget> | typeof WORKSPACE_HOME_TARGET,
) => workspaceViewTransitionReducer(state, { type: 'NAVIGATE', target });

const complete = (
  state: WorkspaceViewTransitionState,
  phase: 'covering' | 'revealing',
  runId = state.runId,
) => workspaceViewTransitionReducer(state, {
  type: 'PHASE_COMPLETE',
  phase,
  runId,
});

describe('workspace view transition reducer', () => {
  it('covers and reveals only when navigating between home and a project', () => {
    const project = workspaceProjectTarget('project-a');
    const covering = navigate(createWorkspaceViewTransitionState(), project);

    expect(covering).toMatchObject({
      visible: WORKSPACE_HOME_TARGET,
      desired: project,
      phase: 'covering',
      runId: 1,
    });

    const revealing = complete(covering, 'covering');
    expect(revealing).toMatchObject({
      visible: project,
      desired: project,
      phase: 'revealing',
      runId: 1,
    });

    expect(complete(revealing, 'revealing')).toMatchObject({
      visible: project,
      desired: project,
      phase: 'idle',
      runId: 1,
    });
  });

  it('switches directly between two projects and ignores its current target', () => {
    const first = workspaceProjectTarget('project-a');
    const second = workspaceProjectTarget('project-b');
    const initial = createWorkspaceViewTransitionState(first);

    const switched = navigate(initial, second);
    expect(switched).toMatchObject({
      visible: second,
      desired: second,
      phase: 'idle',
      runId: 1,
    });
    expect(navigate(switched, second)).toBe(switched);
  });

  it('uses the latest destination without restarting an in-flight cover', () => {
    const firstCover = navigate(
      createWorkspaceViewTransitionState(),
      workspaceProjectTarget('project-a'),
    );
    const latest = navigate(firstCover, workspaceProjectTarget('project-b'));

    expect(latest).toMatchObject({
      visible: WORKSPACE_HOME_TARGET,
      desired: workspaceProjectTarget('project-b'),
      phase: 'covering',
      runId: firstCover.runId,
    });
    expect(complete(latest, 'covering')).toMatchObject({
      visible: workspaceProjectTarget('project-b'),
      phase: 'revealing',
    });
  });

  it('can latest-win back to the visible page while covering', () => {
    const covering = navigate(
      createWorkspaceViewTransitionState(),
      workspaceProjectTarget('project-a'),
    );
    const cancelledDestination = navigate(covering, WORKSPACE_HOME_TARGET);
    const revealing = complete(cancelledDestination, 'covering');

    expect(revealing).toMatchObject({
      visible: WORKSPACE_HOME_TARGET,
      desired: WORKSPACE_HOME_TARGET,
      phase: 'revealing',
    });
    expect(complete(revealing, 'revealing').phase).toBe('idle');
  });

  it('queues navigation during reveal and begins it after reveal completes', () => {
    const project = workspaceProjectTarget('project-a');
    const revealing = complete(
      navigate(createWorkspaceViewTransitionState(), project),
      'covering',
    );
    const queued = navigate(revealing, WORKSPACE_HOME_TARGET);

    expect(queued).toMatchObject({
      visible: project,
      desired: WORKSPACE_HOME_TARGET,
      phase: 'revealing',
      runId: revealing.runId,
    });

    const nextCover = complete(queued, 'revealing');
    expect(nextCover).toMatchObject({
      visible: project,
      desired: WORKSPACE_HOME_TARGET,
      phase: 'covering',
      runId: revealing.runId + 1,
    });
  });

  it('settles immediately in reduced motion and when reduced motion is enabled mid-run', () => {
    const project = workspaceProjectTarget('project-a');
    const reduced = createWorkspaceViewTransitionState(WORKSPACE_HOME_TARGET, true);

    expect(navigate(reduced, project)).toMatchObject({
      visible: project,
      desired: project,
      phase: 'idle',
      reducedMotion: true,
    });

    const covering = navigate(createWorkspaceViewTransitionState(), project);
    const settled = workspaceViewTransitionReducer(covering, {
      type: 'SET_REDUCED_MOTION',
      enabled: true,
    });
    expect(settled).toMatchObject({
      visible: project,
      desired: project,
      phase: 'idle',
      runId: covering.runId + 1,
      reducedMotion: true,
    });
  });

  it('ignores stale, duplicated, and out-of-order phase callbacks', () => {
    const covering = navigate(
      createWorkspaceViewTransitionState(),
      workspaceProjectTarget('project-a'),
    );

    expect(complete(covering, 'revealing')).toBe(covering);
    expect(complete(covering, 'covering', covering.runId - 1)).toBe(covering);

    const revealing = complete(covering, 'covering');
    expect(complete(revealing, 'covering')).toBe(revealing);

    const idle = complete(revealing, 'revealing');
    expect(complete(idle, 'revealing')).toBe(idle);
  });

  it('returns home immediately when sync removes the visible project', () => {
    const project = workspaceProjectTarget('project-a');
    const state = createWorkspaceViewTransitionState(project);
    const synced = workspaceViewTransitionReducer(state, {
      type: 'SYNC_PROJECTS',
      projectIds: ['project-b'],
    });

    expect(synced).toMatchObject({
      visible: WORKSPACE_HOME_TARGET,
      desired: WORKSPACE_HOME_TARGET,
      phase: 'idle',
      runId: state.runId + 1,
    });
  });

  it('returns home and invalidates the animation when sync removes its target', () => {
    const covering = navigate(
      createWorkspaceViewTransitionState(),
      workspaceProjectTarget('project-a'),
    );
    const synced = workspaceViewTransitionReducer(covering, {
      type: 'SYNC_PROJECTS',
      projectIds: [],
    });

    expect(synced).toMatchObject({
      visible: WORKSPACE_HOME_TARGET,
      desired: WORKSPACE_HOME_TARGET,
      phase: 'idle',
      runId: covering.runId + 1,
    });
    expect(complete(synced, 'covering', covering.runId)).toBe(synced);
  });

  it('preserves state when every referenced project still exists', () => {
    const state = navigate(
      createWorkspaceViewTransitionState(),
      workspaceProjectTarget('project-a'),
    );

    expect(workspaceViewTransitionReducer(state, {
      type: 'SYNC_PROJECTS',
      projectIds: ['project-a', 'project-b'],
    })).toBe(state);
  });
});
