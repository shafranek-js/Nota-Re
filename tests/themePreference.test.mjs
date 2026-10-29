import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_THEME_KEY, readAppTheme, saveAppTheme } from '../src/core/ui/themePreference.ts';

test('theme defaults to dark and persists a selected appearance', () => {
  const previous = globalThis.localStorage;
  const records = new Map();
  globalThis.localStorage = {
    getItem(key) { return records.get(key) ?? null; },
    setItem(key, value) { records.set(key, value); }
  };
  try {
    assert.equal(readAppTheme(), 'dark');
    saveAppTheme('light');
    assert.equal(records.get(APP_THEME_KEY), 'light');
    assert.equal(readAppTheme(), 'light');
    saveAppTheme('dark');
    assert.equal(readAppTheme(), 'dark');
    records.set(APP_THEME_KEY, 'invalid');
    assert.equal(readAppTheme(), 'dark');
  } finally {
    globalThis.localStorage = previous;
  }
});

test('theme remains usable when browser storage is blocked', () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };
  try {
    assert.equal(readAppTheme(), 'dark');
    assert.doesNotThrow(() => saveAppTheme('light'));
  } finally {
    globalThis.localStorage = previous;
  }
});
