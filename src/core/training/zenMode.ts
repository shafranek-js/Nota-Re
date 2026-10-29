import type { TrainerPhase } from './trainerSession';

/**
 * Zen never steals the setup, precheck, count-in, results, or independent
 * two-hand UAT surface. It changes presentation only, not lesson credit.
 */
export function isZenActive(state: {
  currentWorkspace: string;
  trainerPhase: TrainerPhase;
  isTwoHandPracticeOpen: boolean;
  zenModeEnabled: boolean;
}): boolean {
  return state.zenModeEnabled &&
    state.currentWorkspace === 'trainer' &&
    state.trainerPhase === 'playing' &&
    !state.isTwoHandPracticeOpen;
}
