import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1920, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

async function attempts() {
  const contents = await page.getByTitle('Точность попаданий в текущей сессии').innerText();
  const count = /\((\d+)\)/.exec(contents)?.[1];
  assert.ok(count !== undefined, 'total attempts should be visible');
  return Number(count);
}

try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });

  // Lesson 3 explicitly enables continuous flow in its course preset.
  await page.getByText(/Урок 3:/).first().click();
  await page.getByRole('button', { name: /Запустить этот урок в тренажёре/ }).click();
  const running = page.getByRole('button', { name: 'Поток: ИДЁТ' });
  await running.waitFor({ state: 'visible', timeout: 30000 });
  const score = page.getByTestId('osmd-score');
  await score.waitFor({ state: 'visible', timeout: 30000 });

  // Pure silence must produce a real missed answer, not a completed repetition.
  await page.waitForFunction(() => {
    const el = document.querySelector('[title="Точность попаданий в текущей сессии"]');
    return /\([1-9]\d*\)/.test(el?.textContent || '');
  }, null, { timeout: 9000 });
  assert.ok(await attempts() >= 1, 'missed note must add an attempt');
  const accuracy = await page.getByTitle('Точность попаданий в текущей сессии').innerText();
  assert.match(accuracy, /0%/, 'timeout is a wrong answer, not 100%');
  const repetitions = await page.getByTitle('Сыграно однотипных номеров в серии').innerText();
  assert.match(repetitions, /0\s*\//, 'silence cannot earn a clean repetition');

  // Pause must cancel the current deadline; not just change the label.
  await running.click();
  await page.getByRole('button', { name: 'Поток: Пауза' }).waitFor();
  const pausedAttempts = await attempts();
  const pausedIndex = await score.getAttribute('data-active-note-index');
  await page.waitForTimeout(2200);
  assert.equal(await attempts(), pausedAttempts, 'no missed notes while paused');
  assert.equal(await score.getAttribute('data-active-note-index'), pausedIndex, 'cursor frozen on pause');

  // A correct note early in its slot must not move the cursor early.
  // Slow tempo makes the deadline observable despite CI render overhead.
  const tempo = page.locator('input[type="range"]').first();
  await tempo.focus();
  await tempo.press('Home'); // native range keyboard input selects the minimum BPM
  const expectedNote = (await page.getByTestId('active-target-note').innerText()).trim();
  assert.match(expectedNote, /^[A-G][#b]?[0-9]$/);
  const beforeCorrect = Number(await score.getAttribute('data-active-note-index'));
  const attemptsBeforeCorrect = await attempts();
  await page.getByRole('button', { name: 'Поток: Пауза' }).click();
  await running.waitFor();
  await page.locator('button.piano-white-key').filter({ hasText: expectedNote }).click();
  assert.equal(Number(await score.getAttribute('data-active-note-index')), beforeCorrect,
    'correct strike must not accelerate the musical clock');
  assert.equal(await attempts(), attemptsBeforeCorrect + 1);
  await page.waitForFunction(({ previousIndex }) => {
    const element = document.querySelector('[data-testid="osmd-score"]');
    return Number(element?.getAttribute('data-active-note-index')) > previousIndex;
  }, { previousIndex: beforeCorrect }, { timeout: 6000 });
  assert.equal(await attempts(), attemptsBeforeCorrect + 1,
    'correctly played slot must not be counted again as missed at its deadline');

  // Leaving the trainer stops the clock and prevents background misses.
  await page.getByRole('button', { name: /Курс \(12 уроков\)/ }).click();
  const stoppedAt = await attempts();
  await page.waitForTimeout(1800);
  assert.equal(await attempts(), stoppedAt, 'navigation away cancels background flow');

  // The second course preset with flow must start in the running state too.
  await page.getByText(/Урок 12:/).first().click();
  await page.getByRole('button', { name: /Запустить этот урок в тренажёре/ }).click();
  await running.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await attempts(), 0, 'new lesson has fresh attempts');
  assert.equal(await page.getByTestId('course-credit-mode').innerText(), 'Зачётная попытка');

  // A tab hidden during an active timed lesson must not resume as an
  // untimed certified lesson after the user returns.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: 'Поток: Пауза' }).waitFor();
  assert.equal(await page.getByTestId('course-credit-mode').innerText(),
    'Практика без зачёта', 'a hidden tab must revoke lesson eligibility');
  const hiddenAttempts = await attempts();
  await page.waitForTimeout(1300);
  assert.equal(await attempts(), hiddenAttempts,
    'a hidden tab must not produce unseen missed notes');
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.getByTestId('course-credit-mode').innerText(),
    'Практика без зачёта', 'returning to the tab cannot silently re-enable a graded lesson');

  // Entering imagined/tabletop practice while flow runs must cancel the
  // audio clock; otherwise missed notes continue behind the practice overlay.
  await page.getByRole('button', { name: /Курс \(12 уроков\)/ }).click();
  await page.getByRole('button', { name: /Запустить этот урок в тренажёре/ }).click();
  await running.waitFor();
  assert.equal(await page.getByTestId('course-credit-mode').innerText(), 'Зачётная попытка');
  await page.getByTestId('toolbar-trigger-view').click();
  await page.getByRole('button', { name: /Режим «Стол»/ }).click();
  await page.getByRole('button', { name: 'Поток: Пауза' }).waitFor();
  assert.equal(await page.getByTestId('course-credit-mode').innerText(), 'Практика без зачёта');
  const tabletopAttempts = await attempts();
  await page.waitForTimeout(1400);
  assert.equal(await attempts(), tabletopAttempts,
    'tabletop mode must not keep grading rhythmic misses on the hidden score');

  assert.deepEqual(errors, [], 'no uncaught errors');

  console.log('Flow Chrome smoke passed: lesson presets, silent misses, pause/resume and navigation stop.');
} finally {
  await browser.close();
}
