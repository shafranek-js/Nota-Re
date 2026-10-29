import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readScoreRendererPreference, saveScoreRendererPreference,
  SCORE_RENDERER_STORAGE_KEY
} from '../src/core/notation/scoreRendererPreference.ts';

function withStorage(storage, fn) {
  const original = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    return fn();
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
}

test('notation renderer defaults to OSMD for missing or invalid preference', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  withStorage(storage, () => {
    assert.equal(readScoreRendererPreference(), 'osmd');
    values.set(SCORE_RENDERER_STORAGE_KEY, 'unexpected');
    assert.equal(readScoreRendererPreference(), 'osmd');
  });
});

test('notation renderer selection survives re-reading the established preference key', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  withStorage(storage, () => {
    saveScoreRendererPreference('legacy');
    assert.equal(values.get(SCORE_RENDERER_STORAGE_KEY), 'legacy');
    assert.equal(readScoreRendererPreference(), 'legacy');
    saveScoreRendererPreference('osmd');
    assert.equal(readScoreRendererPreference(), 'osmd');
  });
});

test('blocked localStorage does not prevent rendering or switching the notation engine', () => {
  const blocked = {
    getItem() { throw Error('blocked'); },
    setItem() { throw Error('blocked'); }
  };
  withStorage(blocked, () => {
    assert.equal(readScoreRendererPreference(), 'osmd');
    assert.doesNotThrow(() => saveScoreRendererPreference('legacy'));
  });
});
