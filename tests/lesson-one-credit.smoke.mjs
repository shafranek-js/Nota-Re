/** Grade lesson 1 by genuine pitch evidence, not historic reading latency.
 * An optional speed drill reuses the notes but never changes course credit. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 375, height: 760 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.addInitScript(() => {
    localStorage.setItem('notare-trainer-preferences-v1',
      JSON.stringify({ version: 2, preferences: { zenModeEnabled: false } }));
    localStorage.setItem('notare_course_series_v1', JSON.stringify({ version: 1, lessons: {
      1: { completedExercises: 11, judgedNotes: 176, correctNotes: 174,
        reactionSamples: 174, reactionTotalMs: 174 * 1450 }
    } }));
  });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  assert.match(await page.getByTestId('course-detail-panel').innerText(),
    /Скорость \(отдельная тренировка\)/i);
  await page.getByTestId('course-launch-selected').click();
  const target = page.getByTestId('active-target-note');
  await target.waitFor({ state: 'visible', timeout: 30000 });
  const playFullScore = async () => {
    for (let i = 0; i < 16; i++) {
      const note = (await target.innerText()).trim();
      assert.match(note, /^[A-G][#b]?[0-9]$/);
      await page.getByRole('button', { name: `Клавиша ${note}`, exact: true }).click();
    }
    await page.getByTestId('attempt-results').waitFor({ state: 'visible', timeout: 15000 });
  };
  await playFullScore();
  const results = page.getByTestId('attempt-results');
  assert.equal((await results.getByTestId('attempt-correct').innerText()).trim(), '16 / 16');
  const heading = (await results.locator('#attempt-result-heading').innerText()).trim();
  assert.match(heading, /^Урок 1: Доигровой протокол/);
  assert.doesNotMatch(heading, /Урок 1: Урок 1:/);
  assert.match(await results.getByTestId('attempt-verdict').innerText(), /Норматив урока выполнен/);
  assert.match(await results.getByTestId('course-speed-status').innerText(),
    /Скорость не блокирует зачёт первого урока/);
  assert.match(await results.getByTestId('course-series-summary').innerText(), /12 \/ 10 упражнений/);
  assert.ok(await results.getByRole('button', { name: /Следующий урок/ }).isVisible());
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('notare_course_series_v1')).lessons[1]);
  assert.equal(before.completedExercises, 12);

  await results.getByTestId('start-speed-check').click();
  await target.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal((await page.getByTestId('course-credit-mode').innerText()).trim(),
    'Практика без зачёта');
  assert.match(await page.getByTestId('speed-check-active').innerText(), /без зачёта/);
  await playFullScore();
  assert.match(await results.locator('#attempt-result-heading').innerText(), /Проверка скорости · без зачёта/);
  const challenge = results.getByTestId('speed-check-verdict');
  assert.match(await challenge.innerText(), /все 16 нот без ошибок/i);
  assert.match(await challenge.innerText(), /не изменяет зачётную серию/);
  assert.equal(await results.getByRole('button', { name: /Следующий урок/ }).count(), 0);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('notare_course_series_v1')).lessons[1]);
  assert.deepEqual(after, before, 'ungraded speed drill does not change saved course evidence');
  await results.getByTestId('exit-speed-check').click();
  await page.getByTestId('course-detail-panel').waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);
  console.log('Lesson-1 accuracy-only grade and separate ungraded speed challenge passed');
} finally {
  await browser.close();
}
