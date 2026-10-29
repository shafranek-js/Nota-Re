import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveKeyboardLabels } from '../src/core/training/keyboardLabels.ts';

test('MIDI-aware defaults hide PC key legends while retaining note names', () => {
  assert.equal(resolveKeyboardLabels('auto', 0), 'pc');
  assert.equal(resolveKeyboardLabels('auto', 2), 'notes');
});
test('explicit overrides remain independent of hardware', () => {
  for (const mode of ['off', 'notes', 'pc']) {
    assert.equal(resolveKeyboardLabels(mode, 0), mode);
    assert.equal(resolveKeyboardLabels(mode, 1), mode);
  }
});
