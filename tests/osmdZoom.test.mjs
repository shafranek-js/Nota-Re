import test from 'node:test';
import assert from 'node:assert/strict';
import { osmdZoomForWidth } from '../src/core/notation/osmdZoom.ts';

test('the normal engraving scale stays stable when focus mode is off', () => {
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    assert.equal(osmdZoomForWidth(width, false), 0.8);
  }
});
test('Zen allocates desktop width to real musical glyphs', () => {
  assert.equal(osmdZoomForWidth(320, true), 0.8);
  assert.equal(osmdZoomForWidth(375, true), 0.8);
  assert.equal(osmdZoomForWidth(768, true), 0.96);
  assert.equal(osmdZoomForWidth(1024, true), 1.28);
  assert.equal(osmdZoomForWidth(1440, true), 1.5);
  assert.equal(osmdZoomForWidth(1920, true), 1.5);
  assert.equal(osmdZoomForWidth(Number.NaN, true), 0.8);
  assert.equal(osmdZoomForWidth(Infinity, true), 0.8);
});
test('increasing available width never reduces Zen notation scale', () => {
  let previous = 0;
  for (let width = 150; width <= 2200; width += 25) {
    const zoom = osmdZoomForWidth(width, true);
    assert.ok(zoom >= previous && zoom >= 0.8 && zoom <= 1.5);
    previous = zoom;
  }
});
