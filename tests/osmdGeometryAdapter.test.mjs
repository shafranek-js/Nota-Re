import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validEngravedRect, positionCursorAtTicks,
  getEngravedNotePoint, getBassStaveGeometries
} from '../src/core/notation/osmdGeometryAdapter.ts';

test('adapter rejects missing, nonfinite and zero-size notehead geometry', () => {
  assert.equal(validEngravedRect({ left: 10, top: -50, width: 14, height: 9 }), true);
  for (const rect of [
    { left: NaN, top: 10, width: 10, height: 10 },
    { left: 10, top: Infinity, width: 10, height: 10 },
    { left: 10, top: 10, width: 0, height: 10 },
    { left: 10, top: 10, width: 10, height: 0 },
    { left: 10, top: 10, width: 10, height: NaN }
  ]) assert.equal(validEngravedRect(rect), false);
});

test('OSMD cursor adapter uses score timestamp quarters, not pixels', () => {
  let index = 0;
  const cursor = {
    Iterator: { EndReached: false, currentTimeStamp: { get RealValue() { return index / 4; } } },
    reset: () => { index = 0; },
    next: () => { index++; },
    show: () => {}
  };
  positionCursorAtTicks({ cursor }, 8);
  assert.equal(index, 2);
  positionCursorAtTicks({ cursor }, 16);
  assert.equal(index, 4);
});

test('rests and missing VexFlow SVG elements never create invented notehead anchors', () => {
  const cursor = {
    Iterator: { EndReached: false, currentTimeStamp: { RealValue: 0 } },
    reset() {}, next() {}, show() {},
    GNotesUnderCursor: () => [
      { sourceNote: { isRest: () => true } },
      { sourceNote: { isRest: () => false }, getSVGGElement: () => undefined }
    ]
  };
  assert.equal(getEngravedNotePoint({ cursor }, { contains: () => true }, 0), null);
});

test('five-line bass spans use guarded real VexFlow staves, not fixed SVG y values', () => {
  const oldSvg = globalThis.SVGSVGElement;
  class SvgRoot {}
  globalThis.SVGSVGElement = SvgRoot;
  try {
    const firstStave = {
      getX: () => 100, getWidth: () => 200,
      getYForLine: index => 50 + index * 13
    };
    const lastStave = {
      getX: () => 300, getWidth: () => 150,
      getYForLine: index => 50 + index * 13
    };
    const staff = {
      ParentStaff: { StafflineCount: 5 },
      Measures: [{ getVFStave: () => firstStave }, { getVFStave: () => lastStave }]
    };
    const renderer = {
      GraphicSheet: { MusicPages: [{
        MusicSystems: [{ StaffLines: [{}, staff] }]
      }] }
    };
    const root = new SvgRoot();
    const mount = { querySelectorAll: () => ({ item: () => root }) };
    const geometries = getBassStaveGeometries(renderer, mount);
    assert.equal(geometries.length, 1);
    assert.equal(geometries[0].root, root);
    assert.equal(geometries[0].x, 100);
    assert.equal(geometries[0].width, 350);
    assert.equal(geometries[0].lineY(1), 63);
    assert.equal(geometries[0].lineY(4), 102);
    assert.deepEqual(getBassStaveGeometries({
      GraphicSheet: { MusicPages: [{ MusicSystems: [{ StaffLines: [{}, {
        ...staff, Measures: [{ getVFStave: () => undefined }]
      }] }] }] }
    }, mount), []);
    assert.deepEqual(getBassStaveGeometries(renderer, {
      querySelectorAll: () => ({ item: () => null })
    }), []);
  } finally {
    globalThis.SVGSVGElement = oldSvg;
  }
});
