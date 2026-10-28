import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1920, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.addInitScript(() => {
    const input = { id: 'virtual-keys', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([['virtual-keys', input]]), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
    window.__midiTest = {
      input, access, starts: 0, stops: 0,
      send(bytes) {
        if (typeof input.onmidimessage !== 'function') throw new Error('MIDI handler not attached');
        input.onmidimessage({ data: Uint8Array.from(bytes) });
      },
      unplug() {
        input.state = 'disconnected';
        access.inputs.delete('virtual-keys');
        access.onstatechange?.({});
      }
    };
    const originalCreate = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = originalCreate.call(this);
      const start = oscillator.start.bind(oscillator);
      const stop = oscillator.stop.bind(oscillator);
      oscillator.start = (...args) => {
        window.__midiTest.starts++;
        return start(...args);
      };
      oscillator.stop = (...args) => {
        window.__midiTest.stops++;
        return stop(...args);
      };
      return oscillator;
    };
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__midiTest.input.onmidimessage === 'function');
  await page.getByTitle('Открыть настройки').click();
  await page.getByRole('button', { name: 'Синтезатор', exact: true }).click();
  await page.getByRole('button', { name: 'Готово', exact: true }).click();

  const attempts = async () => {
    const text = await page.getByTitle('Точность попаданий в текущей сессии').innerText();
    return Number(/\((\d+)\)/.exec(text)?.[1]);
  };
  assert.equal(await attempts(), 0);

  await page.evaluate(() => window.__midiTest.send([0x92, 60, 101]));
  await page.waitForFunction(() => window.__midiTest.starts === 1);
  assert.equal(await attempts(), 1, 'exactly one score attempt for Note On');
  await page.evaluate(() => window.__midiTest.send([0x82, 60, 40]));
  await page.waitForFunction(() => window.__midiTest.stops === 1);
  assert.equal(await attempts(), 1, 'Note Off must not be graded');

  await page.evaluate(() => {
    window.__midiTest.send([0xbf, 64, 127]);
    window.__midiTest.send([0x9f, 64, 90]);
  });
  await page.waitForFunction(() => window.__midiTest.starts === 2);
  assert.equal(await attempts(), 2);
  await page.evaluate(() => window.__midiTest.send([0x8f, 64, 0]));
  assert.equal(await page.evaluate(() => window.__midiTest.stops), 1,
    'sustain down must delay oscillator release');
  await page.evaluate(() => window.__midiTest.send([0xbf, 64, 0]));
  await page.waitForFunction(() => window.__midiTest.stops === 2);
  assert.equal(await attempts(), 2, 'pedal motion must not create grading attempts');

  await page.evaluate(() => {
    window.__midiTest.send([0x90, 60, 75]);
    window.__midiTest.send([0x90, 60, 0]);
  });
  await page.waitForFunction(() => window.__midiTest.stops === 3);
  assert.equal(await attempts(), 3);

  await page.evaluate(() => {
    window.__midiTest.send([0x91, 67, 102]);
    window.__midiTest.unplug();
  });
  await page.waitForFunction(() => window.__midiTest.stops === 4);
  assert.equal(await page.evaluate(() => window.__midiTest.input.onmidimessage), null);
  assert.equal(await attempts(), 4);
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log('MIDI Chrome smoke passed: channel-aware release, sustain, no duplicate scoring, disconnect panic.');
} finally {
  await browser.close();
}
