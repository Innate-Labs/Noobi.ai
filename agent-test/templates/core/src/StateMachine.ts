/**
 * StateMachine - A simple, reusable finite state machine
 *
 * This is a core utility that can be used by any game type.
 * For player-specific FSM with animation support, see PlayerFSM in modules.
 *
 * Usage:
 *   const fsm = new StateMachine(owner, 'idle');
 *   fsm.addState('idle', {
 *     onEnter: () => console.log('entering idle'),
 *     onUpdate: () => { ... },
 *     onExit: () => console.log('exiting idle'),
 *   });
 *   fsm.addState('moving', { ... });
 *   fsm.setState('moving');
 *   fsm.update(); // call every frame
 */

export interface IStateConfig {
  onEnter?: () => void;
  onUpdate?: () => void;
  onExit?: () => void;
}

export class StateMachine {
  private owner: any;
  private states: Map<string, IStateConfig> = new Map();
  private currentStateName: string | null = null;
  private currentState: IStateConfig | null = null;
  private isChangingState: boolean = false;

  /**
   * Create a new StateMachine
   * @param owner - The object that owns this state machine
   * @param initialState - Optional initial state name (will call onEnter if state exists)
   */
  constructor(owner: any, initialState?: string) {
    this.owner = owner;
    if (initialState) {
      this.currentStateName = initialState;
    }
  }

  /**
   * Add a state to the state machine
   * @param name - Unique state name
   * @param config - State configuration with onEnter, onUpdate, onExit callbacks
   */
  addState(name: string, config: IStateConfig): this {
    this.states.set(name, config);

    // If this is the initial state and we haven't entered yet, enter it now
    if (this.currentStateName === name && !this.currentState) {
      this.currentState = config;
      config.onEnter?.call(this.owner);
    }

    return this;
  }

  /**
   * Transition to a new state
   * @param name - Name of the state to transition to
   * @returns true if transition was successful
   */
  setState(name: string): boolean {
    // Prevent recursive state changes
    if (this.isChangingState) {
      console.warn(
        `StateMachine: Cannot change state while already changing state`,
      );
      return false;
    }

    // Check if state exists
    const newState = this.states.get(name);
    if (!newState) {
      console.warn(`StateMachine: State '${name}' does not exist`);
      return false;
    }

    // Skip if already in this state
    if (this.currentStateName === name) {
      return false;
    }

    this.isChangingState = true;

    // Exit current state
    if (this.currentState) {
      this.currentState.onExit?.call(this.owner);
    }

    // Update state references
    this.currentStateName = name;
    this.currentState = newState;

    // Enter new state
    this.currentState.onEnter?.call(this.owner);

    this.isChangingState = false;
    return true;
  }

  /**
   * Update the current state (call every frame)
   */
  update(): void {
    if (this.currentState && !this.isChangingState) {
      this.currentState.onUpdate?.call(this.owner);
    }
  }

  /**
   * Get the current state name
   */
  get state(): string | null {
    return this.currentStateName;
  }

  /**
   * Check if currently in a specific state
   */
  isState(name: string): boolean {
    return this.currentStateName === name;
  }

  /**
   * Check if a state exists
   */
  hasState(name: string): boolean {
    return this.states.has(name);
  }
}
