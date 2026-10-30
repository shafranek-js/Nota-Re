/**
 * Lesson 3: a visible count-in, then an immutable rhythmic grid with live
 * missed/late counters. Wrong timing cannot earn a correct course event.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.addInitScript(() => localStorage.setItem('notare-trainer-preferences-v1',
    JSON.stringify({ version: 2, preferences: { zenModeEnabled: false } })));
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.getByText(/Урок 3:/).first().click();
  await page.getByRole('button', { name: /Запустить этот урок в тренажёре/ }).click();
  const countIn = page.getByTestId('trainer-count-in');
  await countIn.waitFor({ state: 'visible' });
  await page.getByTestId('osmd-score').locator('svg').first().waitFor({ state: 'visible' });
  assert.match(await countIn.innerText(), /После «4» играйте первую ноту на следующую сильную долю/);
  await countIn.waitFor({ state: 'hidden', timeout: 20000 });

  const feedback = page.getByTestId('lesson-three-rhythm-feedback');
  await feedback.waitFor({ state: 'visible' });
  assert.match(await feedback.innerText(), /Верно: 0/);
  assert.match(await feedback.innerText(), /Поздно: 0/);
  assert.match(await feedback.innerText(), /Пропуски: 0/);
  assert.match(await page.getByTestId('lesson-three-onset-window').innerText(), /200 мс/,
    'lesson 3 quarter-note at 60 BPM should offer 200ms onset allowance');

  // No MIDI input: the score MUST advance itself and count missed notes.
  await page.waitForFunction(() =>
    /Пропуски: [1-9]/.test(document.querySelector(
      '[data-testid="lesson-three-rhythm-feedback"]')?.textContent || ''),
    null, { timeout: 6000 });
  assert.match(await page.getByTitle('Точность попаданий в текущей сессии').innerText(), /0%/);

  // Allow the next quarter-note's onset window to expire, but still play
  // within its one-second slot. Old implementation gave 100% correctness.
  await page.waitForFunction(() =>
    Number(document.querySelector('[data-testid="osmd-score"]')
      ?.getAttribute('data-active-note-index')) >= 1);
  await page.waitForTimeout(330);
  const expected = (await page.getByTestId('active-target-note').innerText()).trim();
  await page.getByRole('button', { name: `Клавиша ${expected}`, exact: true }).click();
  await page.getByText(/Поздно: 1/).waitFor({ state: 'visible', timeout: 1500 });
  assert.match(await feedback.innerText(), /Верно: 0/);
  assert.match(await page.getByTitle('Точность попаданий в текущей сессии').innerText(), /0%/);
  assert.ok(await page.getByTestId('osmd-score').locator('svg').first().isVisible(),
    'wrong/late strikes must not replace the notation');

  await page.getByRole('button', { name: 'Поток: ИДЁТ' }).click();
  await page.getByRole('button', { name: 'Поток: Пауза' }).waitFor();
  const paused = await feedback.innerText();
  await page.waitForTimeout(1300);
  assert.equal(await feedback.innerText(), paused,
    'pause cannot create new missed notes or silently affect graded results');

  assert.deepEqual(errors, []);
  console.log('Lesson 3 rhythm: visible downbeat, misses, late correct pitch and frozen pause passed');
} finally {
  await browser.close();
}
