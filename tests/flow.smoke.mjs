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

  // Resuming starts one new deadline, and leaving the trainer stops it.
  await page.getByRole('button', { name: 'Поток: Пауза' }).click();
  await running.waitFor();
  await page.getByRole('button', { name: /Курс \(12 уроков\)/ }).click();
  const stoppedAt = await attempts();
  await page.waitForTimeout(1800);
  assert.equal(await attempts(), stoppedAt, 'navigation away cancels background flow');

  // The second course preset with flow must start in the running state too.
  await page.getByText(/Урок 12:/).first().click();
  await page.getByRole('button', { name: /Запустить этот урок в тренажёре/ }).click();
  await running.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await attempts(), 0, 'new lesson has fresh attempts');
  assert.deepEqual(errors, [], 'no uncaught errors');

  console.log('Flow Chrome smoke passed: lesson presets, silent misses, pause/resume and navigation stop.');
} finally {
  await browser.close();
}
