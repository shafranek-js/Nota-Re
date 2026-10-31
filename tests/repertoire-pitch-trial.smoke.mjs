import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { DEMO_XML, DEMO_TIMELINE_XML } from './repertoireFixtures.mjs';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const errors = [];
try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.addInitScript(() => {
        const input = { id: 'trial-midi', state: 'connected', onmidimessage: null };
        Object.defineProperty(navigator, 'requestMIDIAccess', {
          configurable: true, value: async () => ({
            inputs: new Map([['trial-midi', input]]), onstatechange: null
          })
        });
        window.__trialMidi = {
          input,
          send(bytes) {
            if (!input.onmidimessage) throw new Error('MIDI not initialized');
            input.onmidimessage({ data: Uint8Array.from(bytes) });
          }
        };
        // Only seed on initial navigation, not reload.
        if (!sessionStorage.getItem('__repertoire_trial_credit_seed')) {
          sessionStorage.setItem('__repertoire_trial_credit_seed', '1');
          localStorage.setItem('notare_course_completed_v3', JSON.stringify([1]));
        }
      });
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__trialMidi?.input.onmidimessage);
      await page.getByRole('button', { name: /^Студия$/ }).click();
      const targetBefore = await page.getByTestId('active-target-note').innerText();
      const before = await page.evaluate(() => ({
        completed: localStorage.getItem('notare_course_completed_v3'),
        recent: localStorage.getItem('notare_course_recent_v2'),
        lifetime: localStorage.getItem('notare_course_series_v1')
      }));
      const picker = page.getByTestId('repertoire-file-input');
      await picker.setInputFiles({ name: 'two-notes.musicxml', mimeType: 'text/xml',
        buffer: Buffer.from(DEMO_XML) });
      const preview = page.getByTestId('repertoire-preview');
      await preview.waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('[data-testid="repertoire-anchor-coverage"]')
        ?.textContent?.includes('Ноты: 2/2'), { timeout: 30000 });
      const ab = page.getByTestId('repertoire-ab-controls');
      await ab.getByLabel('Конечный такт B').fill('2');
      await ab.getByRole('button', { name: 'Выделить' }).click();
      const button = page.getByTestId('repertoire-trial-toggle');
      await button.waitFor({ state: 'visible' });
      assert.ok(await button.isEnabled(), 'single-staff monophonic score must allow MIDI practice');
      await button.click();
      const status = page.getByTestId('repertoire-trial-status');
      assert.match(await status.innerText(), /Нота 1\/2/);
      const firstTarget = await page.locator('[data-repertoire-trial-target]').getAttribute('data-repertoire-trial-target');
      assert.ok(firstTarget);
      assert.equal(await page.locator('[data-repertoire-trial-target]').count(), 1);

      await page.evaluate(() => window.__trialMidi.send([0x90, 62, 90]));
      await page.waitForFunction(() => document.querySelector('[data-testid="repertoire-trial-status"]')
        ?.textContent?.includes('ошибок: 1'));
      assert.match(await status.innerText(), /Нота 1\/2/);
      await page.evaluate(() => window.__trialMidi.send([0x80, 62, 0]));
      await page.evaluate(() => window.__trialMidi.send([0xb0, 64, 127]));
      assert.match(await status.innerText(), /Нота 1\/2/, 'note-off and pedal do not advance');

      await page.evaluate(() => window.__trialMidi.send([0x90, 60, 100]));
      await page.waitForFunction(() => document.querySelector('[data-testid="repertoire-trial-status"]')
        ?.textContent?.includes('Нота 2/2'));
      assert.notEqual(await page.locator('[data-repertoire-trial-target]')
        .getAttribute('data-repertoire-trial-target'), firstTarget);
      await page.evaluate(() => window.__trialMidi.send([0x90, 64, 100]));
      await page.waitForFunction(() => document.querySelector('[data-testid="repertoire-trial-status"]')
        ?.textContent?.includes('Все 2 нот сыграны'));
      assert.equal(await page.locator('[data-repertoire-trial-target]').count(), 0);
      assert.equal(await button.innerText(), '↻ Повторить по нотам');
      assert.equal(await page.getByTestId('attempt-results').count(), 0);

      // A fresh trial is a fresh ephemeral session; Stop and A-B changes clean up.
      await button.click();
      assert.match(await status.innerText(), /Нота 1\/2/);
      await button.click();
      assert.match(await status.innerText(), /Без метронома/);
      assert.equal(await page.locator('[data-repertoire-trial-target]').count(), 0);

      await preview.getByRole('button', { name: 'Вернуться к упражнению' }).click();
      await page.getByTestId('studio-score-area').waitFor({ state: 'visible' });
      assert.equal(await page.getByTestId('active-target-note').innerText(), targetBefore);
      const after = await page.evaluate(() => ({
        completed: localStorage.getItem('notare_course_completed_v3'),
        recent: localStorage.getItem('notare_course_recent_v2'),
        lifetime: localStorage.getItem('notare_course_series_v1')
      }));
      assert.deepEqual(after, before, 'MIDI pitch trial must not touch course certification or attempts');

      await picker.setInputFiles({ name: 'chords-two-staves.musicxml', mimeType: 'text/xml',
        buffer: Buffer.from(DEMO_TIMELINE_XML) });
      await preview.waitFor({ state: 'visible', timeout: 30000 });
      await page.getByTestId('repertoire-timeline').waitFor({ state: 'visible', timeout: 30000 });
      await ab.getByRole('button', { name: 'Выделить' }).click();
      assert.equal(await button.isEnabled(), false,
        'polyphonic score must never claim supported pitch trial');
      assert.match(await status.innerText(), /(одном нотном стане|несколько голосов|недоступ)/i);
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no uncaught JavaScript errors');
  console.log('Repertoire MIDI pitch trial passed: 375/1440, pitch/overlay, isolation and unsupported score.');
} finally {
  await browser.close();
}
