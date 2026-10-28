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
    const input = { id: 'virtual-stress-keyboard', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([['virtual-stress-keyboard', input]]), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true, value: async () => access
    });
    window.__stress = {
      input, access, starts: 0, stops: 0,
      send(bytes) {
        if (typeof input.onmidimessage !== 'function') throw new Error('MIDI handler missing');
        input.onmidimessage({ data: Uint8Array.from(bytes) });
      },
      unplug() {
        input.state = 'disconnected';
        access.inputs.delete(input.id);
        access.onstatechange?.({});
      }
    };
    const originalCreate = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const node = originalCreate.call(this);
      const start = node.start.bind(node);
      const stop = node.stop.bind(node);
      node.start = (...args) => { window.__stress.starts++; return start(...args); };
      node.stop = (...args) => { window.__stress.stops++; return stop(...args); };
      return node;
    };
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__stress.input.onmidimessage === 'function');
  await page.getByTitle('Открыть настройки').click();
  await page.getByRole('button', { name: 'Синтезатор', exact: true }).click();
  await page.getByTestId('midi-audio-diagnostics').locator('summary').click();

  const samples = page.getByTestId('midi-diag-samples');
  const voices = page.getByTestId('midi-diag-voices');
  const routes = page.getByTestId('midi-diag-routes');
  assert.equal((await samples.innerText()).trim(), '0');

  // Twenty-four simultaneous held notes on three distinct MIDI channels,
  // enough to catch accidental monophonic voice replacement.
  await page.evaluate(() => {
    for (let i = 0; i < 24; i++) {
      const channel = Math.floor(i / 8);
      window.__stress.send([0x90 | channel, 48 + i, 35 + i * 3]);
    }
  });
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="midi-diag-voices"]')?.textContent?.trim() === '24 / 24'
  );
  assert.equal((await samples.innerText()).trim(), '24');
  assert.equal((await routes.innerText()).trim(), '0 / 24');
  assert.match(await page.getByTestId('midi-diag-median').innerText(), /\d+\.\d{2} мс/);
  assert.match(await page.getByTestId('midi-diag-p95').innerText(), /\d+\.\d{2} мс/);

  await page.evaluate(() => {
    for (let channel = 0; channel < 3; channel++) window.__stress.send([0xb0 | channel, 64, 127]);
    for (let i = 0; i < 24; i++) window.__stress.send([0x80 | Math.floor(i / 8), 48 + i, 0]);
  });
  assert.equal((await voices.innerText()).trim(), '24 / 24',
    'released fallback voices must remain sustained while the pedal is held');

  await page.evaluate(() => {
    for (let channel = 0; channel < 3; channel++) window.__stress.send([0xb0 | channel, 64, 0]);
  });
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="midi-diag-voices"]')?.textContent?.trim() === '0 / 24'
  );
  assert.equal(await page.evaluate(() => window.__stress.stops), 24);

  // 150 quick retriggers; the diagnostics must keep only a bounded history,
  // while every physical note-off releases its voice.
  await page.evaluate(() => {
    for (let i = 0; i < 150; i++) {
      window.__stress.send([0x91, 60 + (i % 12), 60 + (i % 60)]);
      window.__stress.send([0x81, 60 + (i % 12), 0]);
    }
  });
  assert.equal((await samples.innerText()).trim(), '128');
  assert.equal((await voices.innerText()).trim(), '0 / 24');
  assert.equal(await page.evaluate(() => window.__stress.stops), 174);
  await page.getByRole('button', { name: 'Сбросить измерения' }).click();
  assert.equal((await samples.innerText()).trim(), '0');

  // Repeat with a fully initialized SoundFont and panic/disconnect while
  // ten voices are active. We test dispatch and clean-up, not audible output.
  await page.getByRole('button', { name: 'SoundFont (по умолчанию)' }).click();
  await page.getByText('Звуковой банк готов к воспроизведению.').waitFor({ timeout: 120000 });
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) window.__stress.send([0x90, 50 + i, 80]);
  });
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="midi-diag-voices"]')?.textContent?.trim() === '10 / 10'
  );
  assert.equal((await routes.innerText()).trim(), '10 / 0');
  await page.evaluate(() => window.__stress.unplug());
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="midi-diag-voices"]')?.textContent?.trim() === '0 / 10'
  );
  assert.equal(await page.evaluate(() => window.__stress.input.onmidimessage), null);
  assert.deepEqual(errors, [], 'there must be no uncaught audio/MIDI exceptions');

  console.log('MIDI stress passed: 24-voice sustain, 150 retriggers, bounded metrics and 10 SoundFont voices disconnected safely.');
} finally {
  await browser.close();
}
