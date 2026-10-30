import type { TrainerPhase } from './trainerSession';

/**
 * Auto-focus is presentation only. It begins on explicit Start (not when
 * visiting Studio's historical initial 'playing' screen); Escape dismisses
 * it for the current attempt, without changing the saved preference or scoring.
 * Precheck, results and independent two-hand MIDI stay accessible. Count-in
 * remains the dedicated four-beat screen but its shell enters focus early,
 * preventing a header jump just as the first notated note appears.
 */
export function isZenActive(state: {
  currentWorkspace: string;
  studioSection: string;
  trainerPhase: TrainerPhase;
  isTwoHandPracticeOpen: boolean;
  zenModeEnabled: boolean;
  zenSessionStarted: boolean;
  zenDismissedForSession: boolean;
}): boolean {
  return state.zenModeEnabled &&
    state.zenSessionStarted &&
    !state.zenDismissedForSession &&
    state.currentWorkspace === 'trainer' &&
    state.studioSection === 'practice' &&
    (state.trainerPhase === 'playing' || state.trainerPhase === 'countIn') &&
    !state.isTwoHandPracticeOpen;
}
