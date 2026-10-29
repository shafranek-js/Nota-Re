import test from 'node:test';
import assert from 'node:assert/strict';
import { describeAttemptError } from '../src/core/training/attemptFeedback.ts';

const base = { noteIndex: 2, expectedNote: 'Bb4', playedNote: 'A4', reactionMs: 670 };

test('wrong pitch identifies expected and played note, not a timing problem', () => {
  const x = describeAttemptError({ ...base, outcome: 'wrong-pitch' });
  assert.equal(x.kind, 'wrong-pitch');
  assert.match(x.detail, /ожидалась Bb4, сыграна A4/);
  assert.doesNotMatch(x.detail, /срок/);
});
test('late means pitch was right but rhythm slot deadline was missed', () => {
  const x = describeAttemptError({ ...base, outcome: 'late', playedNote: 'Bb4' });
  assert.equal(x.kind, 'late');
  assert.match(x.detail, /правильная высота Bb4/);
  assert.match(x.detail, /670 мс/);
});
test('missing input is not misclassified as an incorrect key', () => {
  const x = describeAttemptError({ ...base, outcome: 'missed', playedNote: null, reactionMs: null });
  assert.equal(x.kind, 'missed');
  assert.match(x.detail, /не была сыграна/);
  assert.doesNotMatch(x.detail, /сыграна неизвестная/);
});
test('clean and imagined results do not render error feedback', () => {
  assert.equal(describeAttemptError({ ...base, outcome: 'correct' }), null);
  assert.equal(describeAttemptError({ ...base, outcome: 'assisted' }), null);
});
