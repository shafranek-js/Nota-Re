import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});
const errors = [];
try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 880 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      // Opt in before startup; no default metronome sound is implied.
      localStorage.setItem('notare-trainer-preferences-v1', JSON.stringify({
        version: 1, preferences: { metronomeEnabled: true }
      }));
      // Record acoustic scheduling calls, not JavaScript setTimeout timings.
      window.__strongClicks = [];
      const nativeStart = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function(when = 0) {
        if (this.type === 'sine' && Math.abs(this.frequency.value - 1046.5) < 0.2) {
          window.__strongClicks.push(when);
        }
        return nativeStart.call(this, when);
      };
      const input = { id: 'preplay-test-midi', state: 'connected', onmidimessage: null };
      const access = { inputs: new Map([[input.id, input]]), onstatechange: null };
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        configurable: true, value: async () => access
      });
      window.__preplayMidi = { send(data) {
        if (!input.onmidimessage) throw new Error('MIDI hook missing');
        input.onmidimessage({ data: Uint8Array.from(data) });
      } };
    });
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.getByText(/Урок 3:/).first().click();
      await page.getByRole('button', { name: 'Сначала анализ нот' }).click();
      const preplay = page.getByTestId('trainer-precheck');
      await preplay.waitFor({ state: 'visible', timeout: 30000 });
      assert.equal(await preplay.locator('ol > li').count(), 5);
      assert.match(await preplay.innerText(), /Размер и тактовый метр не заданы/);
      assert.match(await preplay.innerText(), /Темп: 60 BPM/);
      assert.equal(await page.getByTestId('osmd-score').count(), 0,
        'no piano exercise in preplay analysis');

      await preplay.locator('input[type="checkbox"]').first().check();
      assert.match(await preplay.innerText(), /1 из 5 отмечены/);
      const sessionAccuracy = page.getByTitle('Точность попаданий в текущей сессии');
      const before = await sessionAccuracy.innerText();

      await preplay.getByTestId('precheck-continue').click();
      const countIn = page.getByTestId('trainer-count-in');
      await countIn.waitFor({ state: 'visible', timeout: 2500 });
      const downbeats = await page.evaluate(() => window.__strongClicks);
      assert.equal(downbeats.length, 2,
        'count-in and first playing downbeat must both be scheduled before JS clock transition');
      assert.ok(Math.abs(downbeats[1] - downbeats[0] - 4) < 0.001,
        '60 BPM: first flow beat belongs exactly four quarter-beats after count-in starts');
      assert.equal(await page.getByTestId('osmd-score').count(), 0,
        'no score nor piano shortcut controls while preparing four beats');
      await page.evaluate(() => window.__preplayMidi.send([0x90, 60, 99]));
      await page.keyboard.press('Space');
      assert.equal(await sessionAccuracy.innerText(), before,
        'physical MIDI and Space during count-in cannot add a graded attempt');

      // Stop the precise audio-clock schedule; it must never transition into
      // playing or mark a silent note while in setup.
      await countIn.getByRole('button', { name: 'Отменить отсчёт' }).click();
      await page.getByTestId('trainer-setup').waitFor({ state: 'visible' });
      await page.waitForTimeout(700);
      assert.equal(await sessionAccuracy.innerText(), before,
        'cancelled timer cannot produce background misses');
      assert.equal(await page.getByTestId('trainer-count-in').count(), 0);

      // Explicit restart performs a new audible four-beat preparation.
      await page.getByRole('button', { name: 'Начать упражнение' }).click();
      await countIn.waitFor({ state: 'visible', timeout: 2500 });
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 9500 });
      await page.getByRole('button', { name: 'Поток: ИДЁТ' }).waitFor();
      assert.equal(await countIn.count(), 0);
      assert.ok(await page.getByTestId('status-bar').isVisible());
      const sizes = await page.evaluate(() => ({
        pageWidth: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth
      }));
      assert.ok(sizes.pageWidth <= sizes.viewport + 1, 'no page-wide overflow at ' + width);
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no browser errors');
  console.log('Optional precheck + four-beat cancel/restart Chrome acceptance passed.');
} finally {
  await browser.close();
}
