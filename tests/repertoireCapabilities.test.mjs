import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRepertoireCapabilities } from '../src/core/notation/repertoireCapabilities.ts';

const score = (notes = 2) => ({
  events: Array.from({ length: notes }, (_, i) => ({ kind: 'note', id: String(i) })),
  measures: [{ id: 'measure-1' }]
});
const status = (features, key) => {
  const feature = features.find(x => x.key === key);
  assert.ok(feature, key);
  return feature;
};
const input = (overrides = {}) => ({
  rendered: true, score: score(), parsingReason: null,
  measureGeometryReady: true, measureGeometryReason: null,
  noteMapping: { matched: 2, total: 2, reason: null }, ...overrides
});

test('verified monophonic MusicXML enables visual inspection/audio but NEVER course grading', () => {
  const list = inspectRepertoireCapabilities(input());
  assert.deepEqual(list.map(x => x.key), [
    'view', 'timeline', 'measure-selection', 'notehead-overlay', 'audio-loop', 'assessment'
  ]);
  assert.deepEqual(list.map(x => x.available), [true, true, true, true, true, false]);
  assert.match(status(list, 'assessment').explanation, /не участвуют в зачёте/);
});

test('OSMD can display unsupported MusicXML without inventing timeline, loop or note identities', () => {
  const list = inspectRepertoireCapabilities(input({
    score: null, parsingReason: 'Повторы требуют отдельного адаптера.',
    measureGeometryReady: false, noteMapping: null
  }));
  assert.equal(status(list, 'view').available, true);
  assert.deepEqual(list.slice(1).map(x => x.available), [false, false, false, false, false]);
  assert.match(status(list, 'timeline').explanation, /Повторы/);
  assert.match(status(list, 'audio-loop').explanation, /Повторы/);
});

test('one-to-one OSMD note anchors are a separate gate from measure geometry and audio', () => {
  const partial = inspectRepertoireCapabilities(input({
    noteMapping: { matched: 1, total: 2, reason: null }
  }));
  assert.equal(status(partial, 'measure-selection').available, true);
  assert.equal(status(partial, 'notehead-overlay').available, false);
  assert.equal(status(partial, 'audio-loop').available, true);
  const unverified = inspectRepertoireCapabilities(input({
    noteMapping: { matched: 0, total: 2, reason: 'Два голоса совпадают.' }
  }));
  assert.match(status(unverified, 'notehead-overlay').explanation, /Два голоса/);
  assert.equal(status(unverified, 'assessment').available, false);
});

test('mismatched OSMD measure geometry blocks A–B and sound without blocking view', () => {
  const list = inspectRepertoireCapabilities(input({
    measureGeometryReady: false, measureGeometryReason: 'Разное число тактов.'
  }));
  assert.equal(status(list, 'view').available, true);
  assert.equal(status(list, 'timeline').available, true);
  for (const key of ['measure-selection', 'notehead-overlay', 'audio-loop']) {
    assert.equal(status(list, key).available, false);
    assert.match(status(list, key).explanation, /Разное число тактов/);
  }
});

test('all-rest score cannot claim audible loop or highlightable noteheads', () => {
  const list = inspectRepertoireCapabilities(input({
    score: score(0), noteMapping: { matched: 0, total: 0, reason: null }
  }));
  assert.equal(status(list, 'timeline').available, true);
  assert.equal(status(list, 'audio-loop').available, false);
  assert.equal(status(list, 'notehead-overlay').available, false);
  assert.match(status(list, 'audio-loop').explanation, /нет звучащих нот/);
});
