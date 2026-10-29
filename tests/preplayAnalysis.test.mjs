import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePreplayScore } from '../src/core/training/preplayAnalysis.ts';

test('preplay analysis uses real pitch, clef, duration and key signature', () => {
  const steps = analyzePreplayScore({
    notes: [
      { noteName: 'F#4', clef: 'treble', durMultiplier: 1 },
      { noteName: 'C3', clef: 'bass', durMultiplier: 0.5 }
    ],
    tonality: 'G', bpm: 72, lessonTitle: 'Ритм без остановок'
  });
  assert.equal(steps.length, 5);
  assert.match(steps[0].detail, /Ритм без остановок/);
  assert.match(steps[1].detail, /Фа♯/);
  assert.match(steps[2].detail, /Размер и тактовый метр не заданы/);
  assert.match(steps[3].detail, /скрипичный и басовый/);
  assert.match(steps[3].detail, /F#4/);
  assert.match(steps[4].detail, /0.5 четвертной доли/);
});

test('precheck does not manufacture composer or 4/4 for empty exercise', () => {
  const steps = analyzePreplayScore({ notes: [], tonality: 'C', bpm: 60 });
  assert.match(steps[0].detail, /не указаны/);
  assert.match(steps[2].detail, /не заданы/);
  assert.match(steps[3].detail, /отсутствует/);
  assert.match(steps[4].detail, /нет известных длительностей/);
});
