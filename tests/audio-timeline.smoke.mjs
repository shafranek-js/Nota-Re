import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1840, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  // This is a genuine Web Audio oscillator start() probe, not a JavaScript
  // setTimeout-based approximation of when audio would start.
  await page.addInitScript(() => {
    window.__scheduledAudioStarts = [];
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const node = original.call(this);
      const start = node.start.bind(node);
      node.start = (when = 0) => {
        window.__scheduledAudioStarts.push({ type: node.type, when, current: this.currentTime });
        return start(when);
      };
      return node;
    };
  });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.getByTitle('Открыть настройки').click();
  await page.getByRole('button', { name: 'Синтезатор', exact: true }).click();
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: /Тренажёр-Студия/ }).click();
  await page.getByRole('button', { name: /2\. Ритмослоги/ }).click();
  await page.getByRole('button', { name: 'Петь' }).click();

  await page.waitForFunction(
    () => window.__scheduledAudioStarts.filter(entry => entry.type === 'triangle').length >= 4,
    null, { timeout: 9000 }
  );
  const initial = await page.evaluate(() =>
    window.__scheduledAudioStarts.filter(entry => entry.type === 'triangle').slice(0, 4)
  );
  const relative = initial.map(e => e.when - initial[0].when);
  for (const [i, target] of [0, 1, 1.5, 1.75].entries()) {
    assert.ok(Math.abs(relative[i] - target) < 0.003,
      'preview onset ' + i + ': expected ' + target + ', got ' + relative[i]);
  }
  assert.ok(initial[0].when >= initial[0].current,
    'first note must have a future AudioContext timestamp');
  // Every later event has its own fixed musical timestamp, even if the JS
  // timer that enqueued it woke at a different wall-clock time.
  await page.getByRole('button', { name: 'Новый' }).click();
  const countAtCancel = await page.evaluate(() =>
    window.__scheduledAudioStarts.filter(entry => entry.type === 'triangle').length
  );
  await page.waitForTimeout(1200);
  const countAfter = await page.evaluate(() =>
    window.__scheduledAudioStarts.filter(entry => entry.type === 'triangle').length
  );
  assert.equal(countAfter, countAtCancel, 'regenerating score must cancel future audio events');

  // The flow click itself must be timestamp-scheduled rather than using an
  // oscillator start() without a specified AudioContext time.
  await page.getByRole('button', { name: /Курс \(12 уроков\)/ }).click();
  await page.getByText(/Урок 3:/).first().click();
  await page.getByRole('button', { name: /Запустить этот урок в тренажёре/ }).click();
  await page.getByRole('button', { name: 'Поток: ИДЁТ' }).waitFor();
  await page.waitForFunction(() =>
    window.__scheduledAudioStarts.some(entry => entry.type === 'sine' && entry.when > entry.current),
    null, { timeout: 8000 }
  );
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('Audio timeline Chrome smoke passed: exact preview onsets, cancel and scheduled metronome.');
} finally {
  await browser.close();
}
