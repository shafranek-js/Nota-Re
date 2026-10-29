import test from 'node:test';
import assert from 'node:assert/strict';
import { isZenActive } from '../src/core/training/zenMode.ts';

const base = {
  currentWorkspace: 'trainer',
  trainerPhase: 'playing',
  isTwoHandPracticeOpen: false,
  zenModeEnabled: true
};

test('Zen only activates in a live single-staff training phase', () => {
  assert.equal(isZenActive(base), true);
  for (const phase of ['setup', 'precheck', 'countIn', 'results']) {
    assert.equal(isZenActive({ ...base, trainerPhase: phase }), false, phase);
  }
  assert.equal(isZenActive({ ...base, currentWorkspace: 'course' }), false);
  assert.equal(isZenActive({ ...base, isTwoHandPracticeOpen: true }), false);
  assert.equal(isZenActive({ ...base, zenModeEnabled: false }), false);
});
