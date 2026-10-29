import type { KeyboardLabelMode } from '../storage/trainerPreferences';

export type VisibleKeyboardLabels = KeyboardLabelMode;

/** The training overlay is explicitly selected, never inferred from MIDI availability. */
export function resolveKeyboardLabels(mode: KeyboardLabelMode): VisibleKeyboardLabels {
  return mode;
}
