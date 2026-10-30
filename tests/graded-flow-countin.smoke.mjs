/**
 * The certified lesson-3 Start route must not bypass the score-ready count-in.
 * Cover both Course launch and the Studio banner's "Начать зачёт" button.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const errors = [];
try {
  for (const { width, viaStudio } of [
    { width: 375, viaStudio: false },
    { width: 1440, viaStudio: true }
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', error => errors.push(width + ': ' + error.message));
    await page.addInitScript(() => {
      localStorage.setItem('notare-trainer-preferences-v1', JSON.stringify({
        version: 1, preferences: { metronomeEnabled: true }
      }));
      const input = { id: 'graded-countin-midi', state: 'connected', onmidimessage: null };
      const access = { inputs: new Map([[input.id, input]]), onstatechange: null };
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        configurable: true, value: async () => access
      });
      window.__gradedMidi = {
        send(bytes) {
          if (!input.onmidimessage) throw new Error('MIDI test input is not connected');
          input.onmidimessage({ data: Uint8Array.from(bytes) });
        }
      };
      window.__gradedStrongClicks = [];
      const original = AudioParam.prototype.setValueAtTime;
      AudioParam.prototype.setValueAtTime = function(value, time) {
        if (Math.abs(value - 1046.5) < 0.2) window.__gradedStrongClicks.push(time);
        return original.call(this, value, time);
      };
    });
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.getByText(/Урок 3:/).first().click();
      if (viaStudio) {
        await page.getByRole('button', { name: /^Студия$/ }).click();
        await page.getByTestId('studio-start-course').click();
      } else {
        await page.getByTestId('course-launch-selected').click();
      }

      const hud = page.getByTestId('trainer-count-in');
      await hud.waitFor({ state: 'visible', timeout: 10000 });
      const score = page.getByTestId('osmd-score');
      await score.waitFor({ state: 'visible', timeout: 30000 });
      await score.locator('svg').first().waitFor({ state: 'visible', timeout: 30000 });
      assert.ok(Number(await score.getAttribute('data-osmd-render-epoch')) > 0);
      assert.equal(await score.getAttribute('data-active-note-index'), '0');

      // Beat one must happen while actual OSMD notation remains visible.
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="count-in-beat"]')?.textContent?.trim() === '1',
        null, { timeout: 15000 });
      const starts = await page.evaluate(() => window.__gradedStrongClicks);
      assert.ok(starts.some(a => starts.some(b => Math.abs(b - a - 4) < 0.001)),
        '60 BPM: certified first downbeat is scheduled four full beats after count-in');
      assert.ok(await score.locator('svg').first().isVisible());

      const accuracy = page.getByTitle('Точность попаданий в текущей сессии');
      const before = await accuracy.innerText();
      await page.evaluate(() => window.__gradedMidi.send([0x90, 60, 100]));
      assert.equal(await accuracy.innerText(), before,
        'MIDI input in preparation must not enter course grading');
      await page.evaluate(() => window.__gradedMidi.send([0x80, 60, 0]));
      await hud.waitFor({ state: 'hidden', timeout: 20000 });
      assert.equal(await score.getAttribute('data-active-note-index'), '0');
      assert.ok(await score.locator('svg').first().isVisible());
      assert.equal((await page.getByTestId('status-course-window').innerText()).includes('0 / 20'), true,
        'starting graded flow must not invent completed exercises');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByTestId('course-focused-controls').getByTestId('course-credit-mode').innerText(),
        'Зачётная попытка');
      await page.getByTestId('course-focused-controls').getByRole('button', { name: 'Остановить' }).click();
      await page.getByTestId('trainer-setup').waitFor({ state: 'visible' });
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no uncaught exceptions');
  console.log('Graded flow score-first count-in passed: Course + Studio launch, 375px + 1440px');
} finally {
  await browser.close();
}
