import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.addInitScript(() => {
        localStorage.setItem('notare-piano-output-v1', 'oscillator');
        const input = { id: 'module-v-midi', state: 'connected', onmidimessage: null };
        Object.defineProperty(navigator, 'requestMIDIAccess', {
          configurable: true, value: async () => ({
            inputs: new Map([['module-v-midi', input]]), onstatechange: null
          })
        });
        window.__moduleMidi = {
          input,
          send(bytes) {
            if (typeof input.onmidimessage !== 'function') throw new Error('Missing MIDI input');
            input.onmidimessage({ data: Uint8Array.from(bytes) });
          }
        };
        window.__generatedOscillators = 0;
        const create = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function (...args) {
          window.__generatedOscillators++;
          return create.apply(this, args);
        };
      });
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.__moduleMidi.input.onmidimessage === 'function');
      const grades = async () => page.evaluate(() => Object.fromEntries(
        Object.entries(localStorage).filter(([key]) =>
          /course|completion|lesson|certificate|shadow/i.test(key))));
      const before = await grades();
      await page.getByRole('button', { name: /^Студия$/ }).click();
      await page.getByTestId('toolbar-trigger-rhythm').click();
      await page.getByTestId('open-accompaniment-study').click();
      await page.getByTestId('two-hand-practice').waitFor({ state: 'visible' });
      await page.getByTestId('accompaniment-hands').selectOption('both');
      const section = page.getByTestId('module-v-companion');
      await section.waitFor({ state: 'visible', timeout: 35000 });
      const mode = page.getByTestId('module-v-companion-hand');
      const start = page.getByTestId('module-v-companion-toggle');
      const status = page.getByTestId('module-v-companion-status');
      assert.equal(await mode.inputValue(), 'left');
      assert.ok(await start.isEnabled(), 'two-staff Module V enables hand accompaniment');
      await start.click();
      await page.waitForFunction(() => document.querySelector('[data-testid="module-v-companion-status"]')
        ?.textContent?.includes('Шаг 1/16'));
      assert.ok(await page.getByTestId('two-hand-start-tempo').isDisabled(),
        'existing timed reducer cannot run alongside the companion');
      const oscillators = await page.evaluate(() => window.__generatedOscillators);
      await page.evaluate(() => window.__moduleMidi.send([0x90, 48, 100]));
      await page.waitForFunction(() => document.querySelector('[data-testid="module-v-companion-status"]')
        ?.textContent?.includes('Шаг 2/16'));
      await page.waitForFunction(min => window.__generatedOscillators > min + 1, oscillators);
      assert.equal(await page.getByTestId('two-hand-step-index').innerText(), '1',
        'original practice reducer must not double-consume MIDI');
      await start.click();
      await mode.selectOption('right');
      await start.click();
      await page.waitForFunction(() => document.querySelector('[data-testid="module-v-companion-status"]')
        ?.textContent?.includes('Шаг 1/2'));
      await page.evaluate(() => {
        window.__moduleMidi.send([0x80, 48, 0]);
        for (const pitch of [60, 64, 67]) window.__moduleMidi.send([0x90, pitch, 100]);
      });
      await page.waitForFunction(() => document.querySelector('[data-testid="module-v-companion-status"]')
        ?.textContent?.includes('Шаг 2/2'));
      await start.click();

      await page.getByTestId('accompaniment-texture').selectOption('waltz');
      await section.waitFor({ state: 'visible', timeout: 30000 });
      assert.match(await page.getByTestId('accompaniment-details').innerText(), /3\/4/);
      await mode.selectOption('left');
      await start.click();
      await page.waitForFunction(() => document.querySelector('[data-testid="module-v-companion-status"]')
        ?.textContent?.includes('Шаг 1/6'));
      await start.click();
      assert.deepEqual(await grades(), before, 'Module V companion cannot update grading or attempts');
      assert.deepEqual(errors, [], 'no runtime errors in Module V');
    } finally { await page.close(); }
  }
  console.log('Module V accompanying other hand passed (Alberti and 3/4 waltz, 375/1440, MIDI isolated).');
} finally { await browser.close(); }
