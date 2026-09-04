export type WorkspaceViewTarget =
  | { readonly kind: 'home' }
  | { readonly kind: 'project'; readonly projectId: string };

export type WorkspaceViewTransitionPhase = 'idle' | 'covering' | 'revealing';
export type WorkspaceViewAnimatedPhase = Exclude<WorkspaceViewTransitionPhase, 'idle'>;

export interface WorkspaceViewTransitionState {
  readonly visible: WorkspaceViewTarget;
  readonly desired: WorkspaceViewTarget;
  readonly phase: WorkspaceViewTransitionPhase;
  /**
   * Monotonically identifies the active transition. Timer callbacks must echo
   * this value so a callback from an interrupted run cannot mutate newer state.
   */
  readonly runId: number;
  readonly reducedMotion: boolean;
}

export type WorkspaceViewTransitionEvent =
  | { readonly type: 'NAVIGATE'; readonly target: WorkspaceViewTarget }
  | {
      readonly type: 'PHASE_COMPLETE';
      readonly runId: number;
      readonly phase: WorkspaceViewAnimatedPhase;
    }
  | { readonly type: 'SET_REDUCED_MOTION'; readonly enabled: boolean }
  | { readonly type: 'SYNC_PROJECTS'; readonly projectIds: readonly string[] };

export const WORKSPACE_HOME_TARGET: WorkspaceViewTarget = Object.freeze({ kind: 'home' });

export const workspaceProjectTarget = (projectId: string): WorkspaceViewTarget => ({
  kind: 'project',
  projectId,
});

export const workspaceViewTargetsEqual = (
  first: WorkspaceViewTarget,
  second: WorkspaceViewTarget,
): boolean => first.kind === second.kind
  && (first.kind === 'home' || (
    second.kind === 'project'
    && first.projectId === second.projectId
  ));

export const createWorkspaceViewTransitionState = (
  visible: WorkspaceViewTarget = WORKSPACE_HOME_TARGET,
  reducedMotion = false,
): WorkspaceViewTransitionState => ({
  visible,
  desired: visible,
  phase: 'idle',
  runId: 0,
  reducedMotion,
});

const settleImmediately = (
  state: WorkspaceViewTransitionState,
  target: WorkspaceViewTarget,
): WorkspaceViewTransitionState => ({
  ...state,
  visible: target,
  desired: target,
  phase: 'idle',
  runId: state.runId + 1,
});

const beginPendingNavigation = (
  state: WorkspaceViewTransitionState,
): WorkspaceViewTransitionState => {
  if (workspaceViewTargetsEqual(state.visible, state.desired)) {
    return { ...state, phase: 'idle' };
  }

  if (state.reducedMotion || state.visible.kind === state.desired.kind) {
    return settleImmediately(state, state.desired);
  }

  return {
    ...state,
    phase: 'covering',
    runId: state.runId + 1,
  };
};

const isMissingProject = (
  target: WorkspaceViewTarget,
  projectIds: ReadonlySet<string>,
): boolean => target.kind === 'project' && !projectIds.has(target.projectId);

export const workspaceViewTransitionReducer = (
  state: WorkspaceViewTransitionState,
  event: WorkspaceViewTransitionEvent,
): WorkspaceViewTransitionState => {
  switch (event.type) {
    case 'NAVIGATE': {
      if (workspaceViewTargetsEqual(state.desired, event.target)) return state;

      if (state.phase !== 'idle') {
        // The in-flight cover/reveal is not restarted. The newest destination
        // wins and is consumed at the next safe phase boundary.
        return { ...state, desired: event.target };
      }

      const pending = { ...state, desired: event.target };
      return beginPendingNavigation(pending);
    }

    case 'PHASE_COMPLETE': {
      if (event.runId !== state.runId || event.phase !== state.phase) return state;

      if (event.phase === 'covering') {
        return {
          ...state,
          visible: state.desired,
          phase: 'revealing',
        };
      }

      return beginPendingNavigation({ ...state, phase: 'idle' });
    }

    case 'SET_REDUCED_MOTION': {
      if (event.enabled === state.reducedMotion) return state;

      const next = { ...state, reducedMotion: event.enabled };
      if (!event.enabled || state.phase === 'idle') return next;
      return settleImmediately(next, state.desired);
    }

    case 'SYNC_PROJECTS': {
      const projectIds = new Set(event.projectIds);
      if (
        !isMissingProject(state.visible, projectIds)
        && !isMissingProject(state.desired, projectIds)
      ) {
        return state;
      }

      return {
        ...state,
        visible: WORKSPACE_HOME_TARGET,
        desired: WORKSPACE_HOME_TARGET,
        phase: 'idle',
        runId: state.runId + 1,
      };
    }
  }
};
