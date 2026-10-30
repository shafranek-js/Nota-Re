import assert from 'node:assert/strict';
import { chromium } from 'playwright';

/** End-to-end user acceptance for the dangerous reset path:
 * - cancel preserves the entire state;
 * - confirm clears ONLY the selected lesson's recent graded window;
 * - historic attempts, other lessons and earned certificates survive reload;
 * - the very next graded score starts from 1/N, never 31/N.
 */
const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const history = {
  completedExercises: 30, judgedNotes: 480, correctNotes: 433,
  reactionSamples: 433, reactionTotalMs: 433 * 1259
};
const score = { mode: 'reflex', judgedNotes: 16, correctNotes: 16,
  reactionSamples: 16, reactionTotalMs: 16 * 1400 };
const stage = { ...score, mode: 'lookahead' };
const initialWindows = { 2: Array.from({ length: 14 }, () => score),
  10: Array.from({ length: 7 }, () => stage) };
try {
  await page.addInitScript(({ lifetime, windows }) => {
    localStorage.setItem('notare_course_series_v1',
      JSON.stringify({ version: 1, lessons: { 2: lifetime } }));
    localStorage.setItem('notare_course_recent_v2',
      JSON.stringify({ version: 2, lessons: windows }));
    localStorage.setItem('notare_course_completed_v3', JSON.stringify([1, 2]));
    localStorage.setItem('notare-trainer-preferences-v1',
      JSON.stringify({ version: 2, preferences: { zenModeEnabled: false } }));
  }, { lifetime: history, windows: initialWindows });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('course-lesson-2').click();
  const detail = page.getByTestId('course-detail-panel');
  const count = detail.getByTestId('course-recent-count');
  const restart = detail.getByTestId('restart-course-window');
  assert.match(await count.innerText(), /14 \\/ 15/);
  assert.match(await detail.getByTestId('course-lifetime-count').innerText(), /30/);

  const before = await page.evaluate(() => ({
    window: localStorage.getItem('notare_course_recent_v2'),
    history: localStorage.getItem('notare_course_series_v1'),
    credits: localStorage.getItem('notare_course_completed_v3')
  }));

  page.once('dialog', dialog => dialog.dismiss());
  await restart.click();
  assert.match(await count.innerText(), /14 \\/ 15/);
  assert.deepEqual(await page.evaluate(() => ({
    window: localStorage.getItem('notare_course_recent_v2'),
    history: localStorage.getItem('notare_course_series_v1'),
    credits: localStorage.getItem('notare_course_completed_v3')
  })), before, 'cancel must be completely non-destructive');

  page.once('dialog', dialog => dialog.accept());
  await restart.click();
  assert.match(await count.innerText(), /0 \\/ 15/);
  assert.equal(await restart.count(), 0, 'no reset button when window is empty');
  const after = await page.evaluate(() => ({
    windows: JSON.parse(localStorage.getItem('notare_course_recent_v2')).lessons,
    history: localStorage.getItem('notare_course_series_v1'),
    credits: localStorage.getItem('notare_course_completed_v3')
  }));
  assert.equal(after.windows[2], undefined, 'only the chosen window is removed');
  assert.equal(after.windows[10].length, 7, 'lesson 10 stage records are untouched');
  assert.equal(after.history, before.history, 'lifetime history is immutable on reset');
  assert.equal(after.credits, before.credits, 'earned certificates survive reset');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('course-lesson-2').click();
  assert.match(await detail.getByTestId('course-recent-count').innerText(), /0 \\/ 15/);
  assert.match(await detail.getByTestId('course-lifetime-count').innerText(), /30/);
  assert.equal(await detail.getByTestId('restart-course-window').count(), 0);

  await detail.getByTestId('course-launch-selected').click();
  const target = page.getByTestId('active-target-note');
  await target.waitFor({ state: 'visible', timeout: 30000 });
  for (let i = 0; i < 16; i++) {
    const note = (await target.innerText()).trim();
    assert.match(note, /^[A-G][#b]?[0-9]$/);
    await page.getByRole('button', { name: `Клавиша ${note}`, exact: true }).click();
  }
  const result = page.getByTestId('attempt-results');
  await result.waitFor({ state: 'visible', timeout: 15000 });
  assert.match(await result.getByTestId('course-series-summary').innerText(), /1 \\/ 15 упражнений/);
  const final = await page.evaluate(() => ({
    windows: JSON.parse(localStorage.getItem('notare_course_recent_v2')).lessons,
    history: JSON.parse(localStorage.getItem('notare_course_series_v1')).lessons,
    credits: JSON.parse(localStorage.getItem('notare_course_completed_v3'))
  }));
  assert.equal(final.windows[2].length, 1, 'new window starts at one real attempt');
  assert.equal(final.windows[10].length, 7);
  assert.equal(final.history[2].completedExercises, 31, 'lifetime counter continues');
  assert.deepEqual(final.credits, [1, 2], 'previously awarded certificates remain');
  assert.deepEqual(errors, [], 'no uncaught JS errors');
  console.log('Course window UAT passed: cancel, confirm, reload, lifetime, certificates, and new attempt.');
} finally {
  await browser.close();
}
