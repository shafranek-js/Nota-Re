import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_V_STAGES, MODULE_V_TRIADS_ID, MODULE_V_INVERSIONS_ID } from '../src/data/moduleVCurriculum.ts';
import {
  loadModuleVPractice, recordModuleVTriadPractice, validateModuleVPractice
} from '../src/core/storage/moduleVPracticeStorage.ts';

test('Module V stable IDs remain isolated from the 12 numeric certified lessons', () => {
  assert.equal(MODULE_V_TRIADS_ID, 'module-v/v1/triads-5-3');
  assert.equal(MODULE_V_STAGES.length, 5);
  assert.equal(new Set(MODULE_V_STAGES.map(stage => stage.id)).size, 5);
  assert.deepEqual(MODULE_V_STAGES.filter(stage => stage.available).map(stage => stage.id),
    [MODULE_V_TRIADS_ID, MODULE_V_INVERSIONS_ID], 'only implemented stages are available');
});

test('Module V stored evidence is versioned, small and fail-closed on corruption', () => {
  assert.deepEqual(validateModuleVPractice(null), {schemaVersion:1,completedFixtures:[]});
  assert.deepEqual(validateModuleVPractice({schemaVersion:2,completedFixtures:['C-major-5-3']}),
    {schemaVersion:1,completedFixtures:[]});
  assert.deepEqual(validateModuleVPractice({
    schemaVersion:1, completedFixtures:['garbage','C-major-5-3','C-major-5-3']
  }), {schemaVersion:1,completedFixtures:['C-major-5-3']});
});

test('record once only after approved V1, and never mutate old course or shadow keys', () => {
  const storage = new Map([
    ['notare_course_completed_v3','[1,2]'],
    ['notare_course_series_v3','{"1":{"completedExercises":3}}'],
    ['notare_two_hand_shadow_11','untouched']
  ]);
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key,value) => storage.set(key,value)
  };
  try {
    assert.deepEqual(loadModuleVPractice().completedFixtures, []);
    recordModuleVTriadPractice('module-v/v1/future');
    assert.equal(storage.has('notare_module_v_practice_v1'), false);
    const first = recordModuleVTriadPractice(MODULE_V_TRIADS_ID);
    assert.deepEqual(first.completedFixtures, ['C-major-5-3']);
    const saved = storage.get('notare_module_v_practice_v1');
    recordModuleVTriadPractice(MODULE_V_TRIADS_ID);
    assert.equal(storage.get('notare_module_v_practice_v1'), saved, 'no duplicate evidence');
    assert.equal(storage.get('notare_course_completed_v3'), '[1,2]');
    assert.equal(storage.get('notare_course_series_v3'), '{"1":{"completedExercises":3}}');
    assert.equal(storage.get('notare_two_hand_shadow_11'), 'untouched');
    storage.set('notare_module_v_practice_v1', 'broken json');
    assert.deepEqual(loadModuleVPractice().completedFixtures, []);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test('storage permission failures never create fake grades or crash practice', () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => { throw Error('blocked'); },
    setItem: () => { throw Error('blocked'); }
  };
  try {
    assert.deepEqual(loadModuleVPractice().completedFixtures, []);
    assert.deepEqual(recordModuleVTriadPractice(MODULE_V_TRIADS_ID).completedFixtures,['C-major-5-3']);
    assert.deepEqual(loadModuleVPractice().completedFixtures, []);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
