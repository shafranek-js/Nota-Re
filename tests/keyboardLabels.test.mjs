import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveKeyboardLabels } from '../src/core/training/keyboardLabels.ts';
import { DEFAULT_TRAINER_PREFERENCES } from '../src/core/storage/trainerPreferences.ts';

test('virtual piano shows note names by default without requiring MIDI hardware', () => {
  assert.equal(DEFAULT_TRAINER_PREFERENCES.keyboardLabelMode, 'notes');
  assert.equal(resolveKeyboardLabels(DEFAULT_TRAINER_PREFERENCES.keyboardLabelMode), 'notes');
});

test('explicit note names, no labels and PC shortcuts remain available', () => {
  for (const mode of ['notes', 'off', 'pc']) {
    assert.equal(resolveKeyboardLabels(mode), mode);
  }
});
