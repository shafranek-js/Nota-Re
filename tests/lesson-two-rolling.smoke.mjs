import assert from 'node:assert/strict';
import { chromium } from 'playwright';

/** Two cases: genuine v1-only 30-score history cannot be fabricated into a
 * last-15 window; an existing v2 window of 14 real scores is completed and
 * certified on the next unassisted performance even with old slow history. */
const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const lifetime = { completedExercises: 30, judgedNotes: 480, correctNotes: 433,
  reactionSamples: 433, reactionTotalMs: 433 * 1259 };
const record = { mode: 'reflex', judgedNotes: 16, correctNotes: 16,
  reactionSamples: 16, reactionTotalMs: 16 * 1300 };
try {
  for (const seeded of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.addInitScript(({ original, previous, populate }) => {
        localStorage.setItem('notare_course_series_v1',
          JSON.stringify({ version: 1, lessons: { 2: original } }));
        localStorage.setItem('notare-trainer-preferences-v1',
          JSON.stringify({ version: 2, preferences: { zenModeEnabled: false } }));
        if (populate) localStorage.setItem('notare_course_recent_v2',
          JSON.stringify({ version: 2, lessons: { 2: Array.from({ length: 14 }, () => previous) } }));
      }, { original: lifetime, previous: record, populate: seeded });
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.getByTestId('course-lesson-2').click();
      const detail = page.getByTestId('course-detail-panel');
      assert.match(await detail.getByTestId('course-lifetime-count').innerText(), /30/);
      assert.match(await detail.getByTestId('course-recent-count').innerText(),
        seeded ? /14 \/ 15/ : /0 \/ 15/);
      if (seeded) assert.ok(await detail.getByTestId('restart-course-window').isVisible());
      await detail.getByTestId('course-launch-selected').click();
      const target = page.getByTestId('active-target-note');
      await target.waitFor({ state: 'visible', timeout: 30000 });
      for (let i = 0; i < 16; i++) {
        const note = (await target.innerText()).trim();
        assert.match(note, /^[A-G][#b]?[0-9]$/);
        await page.getByRole('button', { name: `Клавиша ${note}`, exact: true }).click();
      }
      const results = page.getByTestId('attempt-results');
      await results.waitFor({ state: 'visible', timeout: 15000 });
      const summary = await results.getByTestId('course-series-summary').innerText();
      assert.match(summary, seeded ? /15 \/ 15 упражнений/ : /1 \/ 15 упражнений/);
      assert.match(await results.getByTestId('course-speed-status').innerText(),
        /Скорость не блокирует зачёт урока/);
      const raw = await page.evaluate(() => ({
        lifetime: JSON.parse(localStorage.getItem('notare_course_series_v1')).lessons[2],
        recent: JSON.parse(localStorage.getItem('notare_course_recent_v2')).lessons[2],
        completed: JSON.parse(localStorage.getItem('notare_course_completed_v3') ?? '[]')
      }));
      assert.equal(raw.lifetime.completedExercises, 31);
      assert.equal(raw.recent.length, seeded ? 15 : 1);
      if (seeded) {
        assert.match(await results.getByTestId('attempt-verdict').innerText(), /Норматив урока выполнен/);
        assert.ok(await results.getByRole('button', { name: /Следующий урок/ }).isVisible());
        assert.equal(await results.getByTestId('course-legacy-explanation').count(), 0);
        const before = JSON.stringify(raw.recent);
        await results.getByTestId('start-speed-check').click();
        await target.waitFor({ state: 'visible', timeout: 30000 });
        assert.match(await page.getByTestId('speed-check-active').innerText(), /без зачёта/);
        await page.getByTestId('exit-speed-check').count(); // exit is visible after a finished trial only
        const after = await page.evaluate(() =>
          JSON.stringify(JSON.parse(localStorage.getItem('notare_course_recent_v2')).lessons[2]));
        assert.equal(after, before, 'noncredit speed trial never changes course-window history');
      } else {
        assert.equal(await results.getByRole('button', { name: /Следующий урок/ }).count(), 0);
        assert.match(await results.getByTestId('course-legacy-explanation').innerText(),
          /Старые результаты сохранены/);
      }
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
