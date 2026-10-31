import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMusicXml } from '../src/core/notation/musicXml.ts';
import { getVerticalChordGuides } from '../src/core/notation/intervalGuides.ts';
import {
  createModuleVInversionFixture, evaluateModuleVInversion, MODULE_V_INVERSION_COUNT
} from '../src/core/training/moduleVInversions.ts';
import {
  loadModuleVInversions, recordModuleVInversion, validateModuleVInversions
} from '../src/core/storage/moduleVInversionStorage.ts';
import { MODULE_V_STAGES, MODULE_V_TRIADS_ID, MODULE_V_INVERSIONS_ID, MODULE_V_LEFT_TEXTURES_ID, MODULE_V_TWO_HANDS_ID } from '../src/data/moduleVCurriculum.ts';

test('24 score-derived written examples: all 4 keys, both qualities and three inversions', () => {
  const combinations = new Set();
  assert.equal(MODULE_V_INVERSION_COUNT, 24);
  for (let index = 0; index < MODULE_V_INVERSION_COUNT; index++) {
    const fixture = createModuleVInversionFixture(index);
    assert.equal(fixture.id, 'v2-' + String(index + 1).padStart(2, '0'));
    assert.equal(fixture.score.title, 'Nota-Re — чтение нот');
    assert.equal(fixture.score.notes.length, 3);
    assert.ok(fixture.score.notes.every(event => event.onsetTicks === 0 &&
      event.staff === 1 && event.durationTicks === 4));
    const guides = getVerticalChordGuides(fixture.score.notes, fixture.score.fifths, 'reading');
    assert.deepEqual(guides, [fixture.guide]);
    const { inversion, figure, quality, tonic, bass } = fixture.guide;
    combinations.add(fixture.score.fifths + ':' + quality + ':' + inversion);
    assert.equal(figure, ['5/3', '6', '6/4'][inversion]);
    assert.ok(tonic && bass && fixture.guide.explanation.includes('В басу'));
    assert.equal(evaluateModuleVInversion(fixture, figure).correct, true);
    for (const choice of ['5/3', '6', '6/4'].filter(v => v !== figure))
      assert.equal(evaluateModuleVInversion(fixture, choice).correct, false);

    const xml = toMusicXml(fixture.score, {
      hideInactiveStaffRests: true, hideGeneratedRests: true
    });
    assert.equal((xml.match(/<chord\/>/g) ?? []).length, 2);
    assert.equal((xml.match(/<measure number=/g) ?? []).length, 1);
    assert.doesNotMatch(xml, /Основной вид|Первое обращение|Второе обращение|5\/3|6\/4|triad/i,
      'MusicXML metadata must never carry an inversion hint');
  }
  assert.equal(combinations.size, 24, 'all quality/key/inversion pairs covered exactly once');
  assert.throws(() => createModuleVInversionFixture(-1), /Unknown/);
  assert.throws(() => createModuleVInversionFixture(24), /Unknown/);
  assert.throws(() => evaluateModuleVInversion(createModuleVInversionFixture(0), '7'), /Invalid/);
});

test('explicit enharmonic spelling decides inversion, not piano-key equivalence', () => {
  const fixture = createModuleVInversionFixture(0);
  const notes = [
    { ...fixture.score.notes[0], midi: 65, spelling: { step: 'F', alter: 0, octave: 4 } },
    { ...fixture.score.notes[1], midi: 68, spelling: { step: 'A', alter: -1, octave: 4 } },
    { ...fixture.score.notes[2], midi: 73, spelling: { step: 'D', alter: -1, octave: 5 } }
  ];
  const guides = getVerticalChordGuides(notes, 0, 'reading');
  assert.equal(guides.length, 1);
  assert.equal(guides[0].figure, '6');
  assert.equal(guides[0].tonic, 'D♭');
  assert.equal(guides[0].bass, 'F');
  assert.equal(guides[0].quality, 'major');
  assert.equal(getVerticalChordGuides([
    { ...notes[0], spelling: { step: 'E', alter: 1, octave: 4 } }, ...notes.slice(1)
  ], 0, 'reading').length, 0, 'E-sharp cannot be silently treated as written F');
});

test('V2 is independently available; no numeric course lesson or V1 ID is replaced', () => {
  assert.equal(MODULE_V_TRIADS_ID, 'module-v/v1/triads-5-3');
  assert.equal(MODULE_V_INVERSIONS_ID, 'module-v/v1/inversions');
  assert.deepEqual(MODULE_V_STAGES.filter(stage => stage.available).map(stage => stage.id),
    [MODULE_V_TRIADS_ID, MODULE_V_INVERSIONS_ID, MODULE_V_LEFT_TEXTURES_ID, MODULE_V_TWO_HANDS_ID]);
});

test('V2 journal tolerates corrupted data, preserves V1 records and never writes grades', () => {
  const storage = new Map([
    ['notare_module_v_practice_v1', JSON.stringify({
      schemaVersion: 1, completedFixtures: ['C-major-5-3']
    })],
    ['notare_course_completed_v3', '[1,2]'],
    ['notare_course_series_v3', '{"1":{"completedExercises":3}}']
  ]);
  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  };
  try {
    assert.deepEqual(validateModuleVInversions({ schemaVersion: 1, attempts: [] }),
      { schemaVersion: 2, attempts: [] });
    assert.deepEqual(validateModuleVInversions({
      schemaVersion: 2, attempts: [null, {}, {fixtureId: 'v2-99', mode: 'independent',
        response: '6', correct: true, usedHint: false}]
    }).attempts, []);
    const first = { fixtureId: 'v2-01', mode: 'independent', response: '6',
      correct: false, usedHint: false };
    recordModuleVInversion(first);
    assert.deepEqual(loadModuleVInversions().attempts, [first]);
    assert.deepEqual(recordModuleVInversion({ ...first, usedHint: true }).attempts, [first],
      'independent mode cannot falsely record a hint');
    for (let n = 0; n < 120; n++) recordModuleVInversion(first);
    assert.equal(loadModuleVInversions().attempts.length, 100, 'bound ungraded records');
    assert.equal(storage.get('notare_module_v_practice_v1'),
      JSON.stringify({ schemaVersion: 1, completedFixtures: ['C-major-5-3'] }));
    assert.equal(storage.get('notare_course_completed_v3'), '[1,2]');
    assert.equal(storage.get('notare_course_series_v3'), '{"1":{"completedExercises":3}}');
    storage.set('notare_module_v_inversions_v2', '{invalid');
    assert.equal(loadModuleVInversions().attempts.length, 0);
  } finally {
    if (oldStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = oldStorage;
  }
});
