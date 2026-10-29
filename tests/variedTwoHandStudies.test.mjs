import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLessonTwoHandScore, lessonTwoHandStudyCount
} from '../src/core/training/lessonTwoHandScore.ts';
import { toMusicXml } from '../src/core/notation/musicXml.ts';

function scoreSignature(score) {
  return JSON.stringify(score.notes.map(n =>
    [n.staff, n.midi, n.onsetTicks, n.durationTicks, n.articulation]
  ));
}

test('15 lesson-11 and 20 lesson-12 studies are distinct original musical content', () => {
  for (const [lessonId, count] of [[11, 15], [12, 20]]) {
    assert.equal(lessonTwoHandStudyCount(lessonId), count);
    const scores = Array.from({ length: count }, (_, index) =>
      createLessonTwoHandScore(lessonId, 'C', index));
    assert.equal(new Set(scores.map(item => scoreSignature(item.score))).size, count,
      'pitch and rhythm must actually change, not just the displayed ID');
    for (let index = 0; index < count; index++) {
      const { score, steps } = scores[index];
      assert.match(score.title, new RegExp('study ' + (index + 1) + '/' + count));
      assert.deepEqual(createLessonTwoHandScore(lessonId, 'C', index), scores[index],
        'a chosen study must reproduce its score exactly after a retry');
      assert.ok(score.notes.some(n => n.staff === 1));
      assert.ok(score.notes.some(n => n.staff === 2));
      assert.ok(score.notes.every(n => Number.isSafeInteger(n.onsetTicks) &&
        n.onsetTicks >= 0 && n.onsetTicks + n.durationTicks <= 32));
      assert.equal(steps[0].onsetTicks, 0);
      const xml = toMusicXml(score);
      assert.equal((xml.match(/<measure number=/g) ?? []).length, 2,
        'every study must fit exactly two 4/4 measures');
      assert.match(xml, /<staves>2<\/staves>/);
    }
  }
});

test('lesson 11 maintains bass-first G-gaze entry and varied RH rhythms', () => {
  const rhRhs = new Set();
  for (let index = 0; index < 15; index++) {
    const { score } = createLessonTwoHandScore(11, 'C', index);
    const rh = score.notes.filter(n => n.staff === 1);
    const lh = score.notes.filter(n => n.staff === 2);
    assert.deepEqual(lh.map(n => n.onsetTicks), [0, 16]);
    assert.deepEqual(rh.filter(n => n.onsetTicks < 16).map(n => n.onsetTicks)[0], 4);
    assert.deepEqual(rh.filter(n => n.onsetTicks >= 16).map(n => n.onsetTicks)[0], 20);
    assert.equal(rh.length, 6);
    assert.equal(lh.length, 2);
    rhRhs.add(JSON.stringify(rh.map(n => [n.onsetTicks, n.durationTicks])));
  }
  assert.equal(rhRhs.size, 5, 'reading should include five note-length/rhythm profiles');
});

test('lesson 12 keeps independent legato eighths and detached LH quarters in every variant', () => {
  for (let index = 0; index < 20; index++) {
    const { score, steps } = createLessonTwoHandScore(12, 'C', index);
    const rh = score.notes.filter(n => n.staff === 1);
    const lh = score.notes.filter(n => n.staff === 2);
    assert.equal(rh.length, 16);
    assert.equal(lh.length, 8);
    assert.ok(rh.every(n => n.durationTicks === 2 && n.articulation === 'legato'));
    assert.ok(lh.every(n => n.durationTicks === 4 && n.articulation === 'staccato'));
    assert.equal(steps.length, 16);
  }
});

test('variants are valid under other keys but rejects unsupported indexes', () => {
  for (const tonality of ['C', 'G', 'F', 'D']) {
    for (const lessonId of [11, 12]) {
      const last = lessonTwoHandStudyCount(lessonId) - 1;
      const { score } = createLessonTwoHandScore(lessonId, tonality, last);
      assert.ok(score.notes.length > 0);
      assert.ok(toMusicXml(score).includes('<score-partwise'));
    }
  }
  for (const lessonId of [11, 12]) {
    for (const invalid of [-1, NaN, 1.5, 100, lessonTwoHandStudyCount(lessonId)]) {
      assert.throws(() => createLessonTwoHandScore(lessonId, 'C', invalid),
        /Invalid two-hand study index/);
    }
  }
  assert.throws(() => lessonTwoHandStudyCount(10), /Unsupported/);
});
