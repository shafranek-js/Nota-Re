import test from 'node:test';
import assert from 'node:assert/strict';
import { isZenActive } from '../src/core/training/zenMode.ts';

const base = {
  currentWorkspace: 'trainer',
  studioSection: 'practice',
  trainerPhase: 'playing',
  isTwoHandPracticeOpen: false,
  zenModeEnabled: true,
  zenSessionStarted: true,
  zenDismissedForSession: false
};

test('Zen only activates in a live single-staff training phase', () => {
  assert.equal(isZenActive(base), true);
  assert.equal(isZenActive({ ...base, trainerPhase: 'countIn' }), true,
    'count-in uses focus shell before first note is revealed');
  for (const phase of ['setup', 'precheck', 'results']) {
    assert.equal(isZenActive({ ...base, trainerPhase: phase }), false, phase);
  }
  assert.equal(isZenActive({ ...base, currentWorkspace: 'course' }), false);
  assert.equal(isZenActive({ ...base, studioSection: 'lab' }), false);
  assert.equal(isZenActive({ ...base, studioSection: 'precheck' }), false);
  assert.equal(isZenActive({ ...base, isTwoHandPracticeOpen: true }), false);
  assert.equal(isZenActive({ ...base, zenModeEnabled: false }), false);
  assert.equal(isZenActive({ ...base, zenSessionStarted: false }), false,
    'visiting Studio does not activate Zen despite legacy playing phase');
  assert.equal(isZenActive({ ...base, zenDismissedForSession: true }), false,
    'Escape dismisses only this attempt');
});
