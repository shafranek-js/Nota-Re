import test from 'node:test';
import assert from 'node:assert/strict';
import { osmdZoomForWidth } from '../src/core/notation/osmdZoom.ts';

test('standard Studio retains phone glyph sizes and enlarges real desktop notation', () => {
  assert.equal(osmdZoomForWidth(320, false), 1);
  assert.equal(osmdZoomForWidth(375, false), 1);
  assert.equal(osmdZoomForWidth(768, false), 1);
  assert.equal(osmdZoomForWidth(960, false), 1);
  assert.equal(osmdZoomForWidth(1024, false), 1.07);
  assert.equal(osmdZoomForWidth(1440, false), 1.45);
  assert.equal(osmdZoomForWidth(1920, false), 1.45);
  assert.equal(osmdZoomForWidth(Number.NaN, false), 1);
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

test('standard and Zen zoom increase monotonically without crossing their caps', () => {
  for (const zen of [false, true]) {
    let previous = 0;
    for (let width = 150; width <= 2200; width += 25) {
      const current = osmdZoomForWidth(width, zen);
      assert.ok(current >= previous && current <= (zen ? 1.5 : 1.45));
      previous = current;
    }
  }
});
