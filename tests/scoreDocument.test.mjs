import assert from 'node:assert/strict';
import test from 'node:test';
import {
  quarter, addQuarter, compareQuarter, quarterDuration, normalizeScoreDocument,
  selectScoreMeasures, getScoreCapabilities, isUsablePitchEvidence, ScoreDocumentError
} from '../src/core/notation/scoreDocument.ts';
import { createScoreFromTimedHands } from '../src/core/notation/musicXml.ts';
import { fromLegacyExerciseScore } from '../src/core/notation/legacyScoreAdapter.ts';

const q = quarter;
const pitch = (step, octave, alter = 0) => {
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step];
  return { step, alter, octave, midi: (octave + 1) * 12 + semitone + alter };
};
const note = (id, measureId, onset, duration, p, props = {}) => ({
  id, partId: 'P1', measureId, staff: 1, voice: '1', kind: 'note',
  onset, duration, pitch: p, ...props
});

function fixture() {
  return {
    schemaVersion: 1, id: 'sample', title: 'Intervals and two hands', source: 'imported',
    parts: [{ id: 'P1', name: 'Piano', staves: 2 }],
    measures: [
      { id: 'm1', printedNumber: '1', start: q(0), duration: q(3), meter: { beats: 3, beatType: 4 }, fifths: 0 },
      { id: 'm2', printedNumber: '2', start: q(3), duration: q(3), meter: { beats: 6, beatType: 8 }, fifths: -1 },
      { id: 'm3', printedNumber: '3', start: q(6), duration: q(4), meter: { beats: 4, beatType: 4 }, fifths: -1 }
    ],
    events: [
      note('triad-c', 'm1', q(0), q(1), pitch('C', 4)),
      note('triad-e', 'm1', q(0), q(1), pitch('E', 4)),
      note('triad-g', 'm1', q(0), q(1), pitch('G', 4)),
      note('tie-left', 'm1', q(2), q(1), pitch('D', 4), { tieToId: 'tie-right' }),
      note('tie-right', 'm2', q(3), q(1), pitch('D', 4)),
      note('triplet-a', 'm2', q(4), q(1, 3), pitch('E', 4)),
      note('triplet-b', 'm2', q(13, 3), q(1, 3), pitch('F', 4)),
      note('last', 'm3', q(6), q(4), pitch('C', 5)),
      note('independent', 'm1', q(0), q(3), pitch('A', 3), { voice: '2' }),
      note('bass', 'm1', q(0), q(3), pitch('F', 2), { staff: 2 }),
      { id: 'bass-rest', partId: 'P1', measureId: 'm2', staff: 2, voice: '1',
        kind: 'rest', onset: q(3), duration: q(3) }
    ],
    tempos: [{ onset: q(0), quarterBpm: 60 }, { onset: q(3), quarterBpm: 96 }]
  };
}

test('quarter fractions are reduced and exact for tuplets and mixed meter', () => {
  assert.deepEqual(q(2, 6), q(1, 3));
  assert.deepEqual(addQuarter(q(13, 3), q(1, 3)), q(14, 3));
  assert.equal(compareQuarter(q(14, 3), q(4)), 1);
  assert.deepEqual(quarterDuration({ beats: 6, beatType: 8 }), q(3));
  assert.deepEqual(quarterDuration({ beats: 3, beatType: 4 }), q(3));
  assert.deepEqual(quarterDuration({ beats: 4, beatType: 4 }), q(4));
  assert.throws(() => q(1, 0), ScoreDocumentError);
  assert.throws(() => q(0.5), ScoreDocumentError);
  assert.throws(() => addQuarter(q(Number.MAX_SAFE_INTEGER), q(1)), ScoreDocumentError);
  assert.equal(compareQuarter(q(Number.MAX_SAFE_INTEGER, 3), q(Number.MAX_SAFE_INTEGER, 2)), -1);
});

test('validates and freezes chords, independent voices, bass rests, tuplet time and ties', () => {
  const input = fixture();
  const normalized = normalizeScoreDocument(input);
  assert.equal(normalized.events.length, 11);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.events[0].onset));
  assert.ok(Object.isFrozen(normalized.events[0].pitch));
  assert.ok(Object.isFrozen(normalized.measures[1].meter));
  input.events[0].pitch.midi = 1;
  assert.equal(normalized.events[0].pitch.midi, 60, 'caller cannot mutate normalized source');
  assert.equal(normalized.events.find(n => n.id === 'tie-right').onset.numerator, 3);
});

test('A–B selection is immutable, chronological and uses musical measure IDs', () => {
  const doc = normalizeScoreDocument(fixture());
  const range = selectScoreMeasures(doc, 'm2', 'm3');
  assert.deepEqual(range.measureIds, ['m2', 'm3']);
  assert.deepEqual(range.start, q(3));
  assert.deepEqual(range.end, q(10));
  assert.ok(range.eventIds.includes('bass-rest'));
  assert.ok(!range.eventIds.includes('triad-c'));
  assert.ok(Object.isFrozen(range.eventIds));
  assert.equal(doc.events.length, 11);
  assert.throws(() => selectScoreMeasures(doc, 'm3', 'm1'), ScoreDocumentError);
  assert.throws(() => selectScoreMeasures(doc, 'm4', 'm4'), ScoreDocumentError);
});

test('rejects invalid voice overlap, duplicate chord notes and unequal chord durations', () => {
  const overlap = fixture();
  overlap.events.push(note('overlap', 'm1', q(1, 2), q(1), pitch('B', 4)));
  assert.throws(() => normalizeScoreDocument(overlap), /Overlapping/);

  const repeated = fixture();
  repeated.events.push(note('double-c', 'm1', q(0), q(1), pitch('C', 4)));
  assert.throws(() => normalizeScoreDocument(repeated), /Duplicate pitches/);

  const mismatched = fixture();
  mismatched.events[1].duration = q(2);
  assert.throws(() => normalizeScoreDocument(mismatched), /unequal durations/);
});

test('rejects broken tie links, wrong spelling, changed voice and noncontiguous tie', () => {
  const missing = fixture();
  missing.events.find(n => n.id === 'tie-left').tieToId = 'does-not-exist';
  assert.throws(() => normalizeScoreDocument(missing), /tied-note/);

  const respelled = fixture();
  respelled.events.find(n => n.id === 'tie-right').pitch = pitch('C', 4, 2);
  assert.throws(() => normalizeScoreDocument(respelled), /tied-note/);

  const wrongVoice = fixture();
  wrongVoice.events.find(n => n.id === 'tie-right').voice = '2';
  assert.throws(() => normalizeScoreDocument(wrongVoice), /tied-note/);

  const gap = fixture();
  gap.events.find(n => n.id === 'tie-right').onset = q(7, 2);
  gap.events.find(n => n.id === 'tie-right').duration = q(1, 2);
  assert.throws(() => normalizeScoreDocument(gap), /tied-note/);
});

test('refuses spillover, gaps, malformed pitches, duplicate IDs and tempo collisions', () => {
  const spill = fixture();
  spill.events.find(n => n.id === 'triad-c').duration = q(4);
  assert.throws(() => normalizeScoreDocument(spill), /outside its measure/);
  const gap = fixture();
  gap.measures[1].start = q(4);
  assert.throws(() => normalizeScoreDocument(gap), /Non-contiguous/);
  const invalidPitch = fixture();
  invalidPitch.events.find(n => n.id === 'bass').pitch = { ...pitch('B', 2, -1), midi: 34 };
  assert.throws(() => normalizeScoreDocument(invalidPitch), /enharmonic/);
  const duplicate = fixture();
  duplicate.events[1].id = duplicate.events[0].id;
  assert.throws(() => normalizeScoreDocument(duplicate), /duplicate event/);
  const tempo = fixture();
  tempo.tempos.push({ onset: q(3), quarterBpm: 80 });
  assert.throws(() => normalizeScoreDocument(tempo), /Duplicate tempo/);
});

test('permits pickup measures but rejects undeclared short bars', () => {
  const pickup = fixture();
  pickup.measures[0].duration = q(1);
  pickup.measures[0].partial = true;
  pickup.measures[1].start = q(1);
  pickup.measures[2].start = q(4);
  pickup.events = [note('pickup-c', 'm1', q(0), q(1), pitch('C', 4))];
  pickup.tempos = [];
  assert.equal(normalizeScoreDocument(pickup).measures[0].partial, true);
  pickup.measures[0].partial = false;
  assert.throws(() => normalizeScoreDocument(pickup), /invalid measure duration/);
});

test('imported score capabilities never claim overlays or certification', () => {
  const cap = getScoreCapabilities(normalizeScoreDocument(fixture()));
  assert.equal(cap.display.eligible, true);
  assert.equal(cap.teachingOverlays.eligible, false);
  assert.equal(cap.performanceAssessment.eligible, false);
  assert.match(cap.performanceAssessment.reasons[0], /view-only/);
});

test('microphone/assisted evidence cannot become proven MIDI answers', () => {
  const midi = { source: 'midi', timestampMs: 250, midi: 60, channel: 0, calibratedLatencyMs: 12 };
  const pc = { source: 'pc', timestampMs: 260, midi: 61, calibratedLatencyMs: null };
  const mic = { source: 'microphone', timestampMs: 275, midi: 60, confidence: 0.5, calibratedLatencyMs: null };
  assert.equal(isUsablePitchEvidence(midi), true);
  assert.equal(isUsablePitchEvidence(pc), true);
  assert.equal(isUsablePitchEvidence(mic), false);
  assert.equal(isUsablePitchEvidence({ ...mic, confidence: 0.95 }), true);
  assert.equal(isUsablePitchEvidence({ ...midi, channel: 16 }), false);
  assert.equal(isUsablePitchEvidence({ source: 'assisted', timestampMs: 250, midi: null }), false);
});

test('legacy adapter retains independent hands and splits bar-crossing events with ties', () => {
  const score = createScoreFromTimedHands(
    [{ midi: 60, onsetTicks: 12, durationTicks: 8 }],
    [{ midi: 48, onsetTicks: 0, durationTicks: 16 }],
    'C', 'Independent hands'
  );
  const normalized = fromLegacyExerciseScore(score, 'generated-test');
  assert.equal(normalized.source, 'generated');
  assert.equal(normalized.measures.length, 2);
  assert.deepEqual(normalized.measures.map(m => m.duration), [q(4), q(1)]);
  assert.equal(normalized.measures[1].partial, true);
  const top = normalized.events.filter(e => e.staff === 1);
  assert.equal(top.length, 2);
  assert.deepEqual(top.map(e => e.onset), [q(3), q(4)]);
  assert.deepEqual(top.map(e => e.duration), [q(1), q(1)]);
  assert.equal(top[0].tieToId, top[1].id);
  assert.deepEqual(normalized.events.find(e => e.staff === 2).onset, q(0));
  assert.equal(normalized.events.find(e => e.staff === 2).pitch.midi, 48);
});

test('legacy F key prefers B-flat spelling over A-sharp', () => {
  const score = createScoreFromTimedHands(
    [{ midi: 70, onsetTicks: 0, durationTicks: 4 }], [], 'F'
  );
  const converted = fromLegacyExerciseScore(score);
  assert.deepEqual(converted.events[0].pitch, pitch('B', 4, -1));
});
