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
      // Record the WebAudio scheduled strong-beat frequency. Reading
      // AudioParam.value at oscillator.start is not reliable for future events.
      window.__strongClicks = [];
      const nativeSetValueAtTime = AudioParam.prototype.setValueAtTime;
      AudioParam.prototype.setValueAtTime = function(value, when) {
        if (Math.abs(value - 1046.5) < 0.2) window.__strongClicks.push(when);
        return nativeSetValueAtTime.call(this, value, when);
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
      // The notes must appear BEFORE beat 1. OSMD readiness, not a stale
      // click timestamp, starts the four-beat audible countdown.
      const osmd = page.getByTestId('osmd-score');
      await osmd.waitFor({ state: 'visible', timeout: 30000 });
      await osmd.locator('svg').first().waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForFunction(() => Number(document.querySelector(
        '[data-testid="osmd-score"]')?.dataset.osmdRenderEpoch) > 0);
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="count-in-beat"]')?.textContent?.trim() === '1',
        null, { timeout: 10000 });
      assert.ok(await osmd.locator('svg').first().isVisible(),
        'the notated first note must remain readable throughout preparation');
      const geometry = await page.evaluate(() => {
        const hud = document.querySelector('[data-testid="trainer-count-in"]');
        const beat = document.querySelector('[data-testid="count-in-beat"]');
        const score = document.querySelector('[data-testid="studio-score-area"]');
        const hudRect = hud.getBoundingClientRect();
        const beatRect = beat.getBoundingClientRect();
        const scoreRect = score.getBoundingClientRect();
        const notation = [...document.querySelectorAll('[data-testid="osmd-score"] .vf-notehead, [data-testid="osmd-score"] .vf-clef')]
          .map(element => element.getBoundingClientRect())
          .filter(rect => rect.height > 0);
        return {
          centerOffset: Math.abs((beatRect.left + beatRect.right - scoreRect.left - scoreRect.right) / 2),
          aboveStaff: notation.length > 0 && hudRect.bottom <= Math.min(...notation.map(rect => rect.top)) - 4,
          hudBottom: hudRect.bottom,
          notationTop: Math.min(...notation.map(rect => rect.top)),
          viewportHeight: innerHeight,
          beatHeight: beatRect.height,
          scoreTop: scoreRect.top,
          staffTop: Math.min(...notation.map(rect => rect.top))
        };
      });
      assert.ok(geometry.centerOffset < 3,
        'the large countdown must be horizontally centred above the score');
      assert.ok(geometry.aboveStaff, 'count-in must stay above engraved notes and clefs: ' + JSON.stringify({width, ...geometry}));
      assert.ok(geometry.beatHeight >= 70, 'count-in numeral must be clearly legible');
      assert.equal(await countIn.getByText('Приготовьтесь').count(), 1);
      assert.equal(await countIn.getByText(/Ноты уже видны|игра начнётся|после 4-й доли/).count(), 0,
        'the count-in must not show redundant instructions');
      const downbeats = await page.evaluate(() => window.__strongClicks);
      assert.ok(downbeats.some(start => downbeats.some(end =>
        Math.abs(end - start - 4) < 0.001)),
        '60 BPM: the first playing downbeat must be prequeued four quarter-beats after the VISIBLE score');
      assert.equal(await osmd.getAttribute('data-active-note-index'), '0',
        'preparation cannot advance the first note');
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
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('osmd-score').locator('svg').first()
        .waitFor({ state: 'visible', timeout: 30000 });
      // No giant replacement screen: the notation exists while the HUD is up.
      assert.ok(await countIn.isVisible());
      await page.getByTestId('trainer-count-in').waitFor({ state: 'hidden', timeout: 13000 });
      const afterCountdown = await page.evaluate(() => {
        const score = document.querySelector('[data-testid="studio-score-area"]');
        const notation = [...document.querySelectorAll('[data-testid="osmd-score"] .vf-notehead, [data-testid="osmd-score"] .vf-clef')]
          .map(element => element.getBoundingClientRect()).filter(rect => rect.height > 0);
        return { scoreTop: score.getBoundingClientRect().top,
          staffTop: Math.min(...notation.map(rect => rect.top)) };
      });
      assert.ok(Math.abs(afterCountdown.scoreTop - geometry.scoreTop) < 2,
        'count-in disappearing must not move the score area');
      assert.ok(Math.abs(afterCountdown.staffTop - geometry.staffTop) < 2,
        'count-in disappearing must not jump the engraved notes');
      await page.getByTestId('zen-control-strip').waitFor({ state: 'visible' });
      assert.equal(await page.getByTestId('trainer-count-in').count(), 0,
        'Zen starts without unloading/reloading the score after beat four');
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
