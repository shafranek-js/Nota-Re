import test from 'node:test';
import assert from 'node:assert/strict';
import { osmdZoomForWidth } from '../src/core/notation/osmdZoom.ts';

test('the normal engraving scale stays stable when focus mode is off', () => {
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    assert.equal(osmdZoomForWidth(width, false), 1);
  }
});
test('Zen allocates desktop width to real musical glyphs', () => {
  assert.equal(osmdZoomForWidth(320, true), 1);
  assert.equal(osmdZoomForWidth(375, true), 1);
  assert.equal(osmdZoomForWidth(768, true), 1.2);
  assert.equal(osmdZoomForWidth(1024, true), 1.5);
  assert.equal(osmdZoomForWidth(1440, true), 1.5);
  assert.equal(osmdZoomForWidth(1920, true), 1.5);
  assert.equal(osmdZoomForWidth(Number.NaN, true), 1);
  assert.equal(osmdZoomForWidth(Infinity, true), 1);
});
test('increasing available width never reduces Zen notation scale', () => {
  let previous = 0;
  for (let width = 150; width <= 2200; width += 25) {
    const zoom = osmdZoomForWidth(width, true);
    assert.ok(zoom >= previous && zoom >= 1 && zoom <= 1.5);
    previous = zoom;
  }
});
