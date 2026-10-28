import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSoundFontHeader, BUILTIN_SOUNDFONT_SIZE, BUILTIN_SOUNDFONT_SHA256 } from '../src/core/audio/soundfontBank.ts';
import { SoundFontPiano } from '../src/core/audio/SoundFontPiano.ts';

function fakeBank(size = 12) {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  for (const [offset, text] of [[0, 'RIFF'], [8, 'sfbk']]) {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  }
  view.setUint32(4, size - 8, true);
  return buffer;
}

test('RIFF validation requires bank marker and exact container size', () => {
  assert.doesNotThrow(() => assertSoundFontHeader(fakeBank()));
  const invalid = fakeBank();
  new DataView(invalid).setUint32(4, 14, true);
  assert.throws(() => assertSoundFontHeader(invalid), /RIFF/);
  const wrong = fakeBank();
  new DataView(wrong).setUint8(8, 'W'.charCodeAt(0));
  assert.throws(() => assertSoundFontHeader(wrong), /RIFF/);
});

test('default bank identity matches PianoMotion Studio fixed release', () => {
  assert.equal(BUILTIN_SOUNDFONT_SIZE, 39_900_972);
  assert.equal(BUILTIN_SOUNDFONT_SHA256,
    '5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3');
});

test('new users get SoundFont by default and can opt into old synth', () => {
  const piano = new SoundFontPiano();
  assert.equal(piano.getStatus().output, 'soundfont');
  assert.equal(piano.getStatus().source, 'builtin');
  const outputStates = [];
  const unsubscribe = piano.subscribe(status => outputStates.push(status.output));
  piano.setOutput('oscillator');
  assert.equal(piano.getStatus().output, 'oscillator');
  assert.deepEqual(outputStates, ['soundfont', 'oscillator']);
  unsubscribe();
  piano.setOutput('soundfont');
  assert.deepEqual(outputStates, ['soundfont', 'oscillator']);
});
