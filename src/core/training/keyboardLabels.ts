import type { KeyboardLabelMode } from '../storage/trainerPreferences';

export type VisibleKeyboardLabels = 'off' | 'notes' | 'pc';

/** PC shortcuts are not needed on the keycaps when a physical MIDI keyboard is connected. */
export function resolveKeyboardLabels(mode: KeyboardLabelMode, midiInputsCount: number): VisibleKeyboardLabels {
  if (mode === 'auto') return midiInputsCount > 0 ? 'notes' : 'pc';
  return mode;
}
