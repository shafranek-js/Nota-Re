/** Graded course presets show focused controls; edits require an explicit ungraded transition. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const errors = [];
try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 375 ? 800 : 950 } });
    page.on('dialog', dialog => { void dialog.accept(); });
    page.on('pageerror', error => errors.push(width + ': ' + error.message));
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.getByText(/Урок 3:/).first().click();
      await page.getByRole('button', { name: /Запустить этот урок в тренажёре/ }).click();
      // Lesson 3 is timed and must prepare four beats with the score visible.
      await page.getByTestId('trainer-count-in').waitFor({ state: 'visible' });
      await page.getByTestId('trainer-count-in').waitFor({ state: 'hidden', timeout: 30000 });

      const course = page.getByTestId('course-focused-controls');
      const zen = page.getByTestId('zen-control-strip');
      await zen.waitFor({ state: 'visible' });
      assert.equal(await course.count(), 0, 'certified lesson starts in Zen automatically');
      await page.keyboard.press('Escape');
      await course.waitFor({ state: 'visible' });
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 40000 });
      assert.equal(await page.getByTestId('trainer-toolbar').count(), 0,
        'free material/mode/BPM parameters cannot be edited during graded play');
      assert.match(await course.innerText(), /Урок 3/);
      assert.match(await course.innerText(), /60 BPM/);
      assert.equal((await course.getByTestId('course-credit-mode').innerText()).trim(), 'Зачётная попытка');
      assert.equal(await page.getByRole('button', { name: 'Поток: ИДЁТ' }).count(), 1);
      const metronome = course.getByTestId('metronome-toggle');
      assert.equal(await metronome.getAttribute('aria-pressed'), 'false');
      await metronome.click();
      assert.equal(await metronome.getAttribute('aria-pressed'), 'true');
      assert.equal(await course.getByTestId('course-credit-mode').innerText(), 'Зачётная попытка');
      await metronome.click();
      assert.equal(await metronome.getAttribute('aria-pressed'), 'false');
      assert.equal(await course.getByRole('slider').count(), 0);

      // Export keeps the exact notated course exercise, without touching its
      // grading or ending the physical-MIDI training session.
      const downloadEvent = page.waitForEvent('download');
      await course.getByRole('button', { name: 'MusicXML' }).click();
      const download = await downloadEvent;
      assert.match(download.suggestedFilename(), /\.musicxml$/);
      assert.equal((await course.getByTestId('course-credit-mode').innerText()).trim(), 'Зачётная попытка');

      await page.waitForFunction(() =>
        document.querySelector('[data-testid="course-focused-controls"]')?.contains(document.activeElement),
      null, { timeout: 3000 }).catch(async () => {
        const diagnostic = await page.evaluate(() => ({
          active: document.activeElement?.outerHTML?.slice(0, 320) ?? null,
          target: document.querySelector('[data-testid="course-to-free-setup"]')?.outerHTML?.slice(0, 320) ?? null,
          zen: document.querySelector('[data-testid="studio-workspace"]')?.getAttribute('data-zen-active')
        }));
        throw new Error('Zen focus return failed: ' + JSON.stringify(diagnostic));
      });
      assert.equal((await course.getByTestId('course-credit-mode').innerText()).trim(), 'Зачётная попытка',
        'a view-only dismissal must not revoke certification');

      // The learner must intentionally leave the graded attempt before
      // editing free-practice settings. Stop cancels rhythmic deadlines.
      await course.getByTestId('course-to-free-setup').click();
      await page.getByTestId('trainer-setup').waitFor({ state: 'visible' });
      assert.equal(await course.count(), 0);
      assert.equal(await page.getByTestId('course-credit-mode').innerText(), 'Практика без зачёта');
      assert.ok(await page.getByTestId('trainer-toolbar').isVisible());
      const studioLaunch = page.getByTestId('studio-start-course');
      assert.match(await studioLaunch.innerText(), /Начать зачёт урока 3/);
      await studioLaunch.click();
      await page.getByTestId('trainer-count-in').waitFor({ state: 'visible' });
      await page.getByTestId('trainer-count-in').waitFor({ state: 'hidden', timeout: 30000 });
      await zen.waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await course.waitFor({ state: 'visible' });
      assert.equal(await page.getByTestId('studio-start-course').count(), 0);
      await course.getByTestId('course-to-free-setup').click();
      await page.getByTestId('trainer-setup').waitFor({ state: 'visible' });
      const metrics = page.getByTitle('Точность попаданий в текущей сессии');
      const before = await metrics.innerText();
      await page.waitForTimeout(1400);
      assert.equal(await metrics.innerText(), before, 'no background missed notes after leaving course');
      await page.getByTestId('toolbar-trigger-material').click();
      assert.ok(await page.getByRole('combobox', { name: 'Тональность' }).isVisible());

      await page.getByRole('button', { name: /^Курс$/ }).click();
      await page.getByRole('button', { name: /Запустить этот урок в тренажёре/ }).click();
      await page.getByTestId('trainer-count-in').waitFor({ state: 'visible' });
      await page.getByTestId('trainer-count-in').waitFor({ state: 'hidden', timeout: 30000 });
      await zen.waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await course.waitFor({ state: 'visible' });
      // Opening Settings uses the same well-tested course interruption path
      // as before and cannot silently maintain certification.
      await page.getByRole('button', { name: 'Открыть настройки' }).click();
      await page.getByRole('dialog', { name: /Настройки тренажёра/ }).waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      assert.equal(await page.getByTestId('course-credit-mode').innerText(), 'Практика без зачёта');
      assert.equal(await course.count(), 0);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, 'no document-width overflow at ' + width);
    } finally {
      await page.close();
    }
  }
  // Saved graded evidence resumes per lesson; leaving an active assessment
  // requires confirmation, while declining preserves the current course.
  const savedPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  savedPage.on('pageerror', error => errors.push('resume: ' + error.message));
  let approveExit = false;
  const dialogs = [];
  savedPage.on('dialog', dialog => {
    dialogs.push(dialog.message());
    void (approveExit ? dialog.accept() : dialog.dismiss());
  });
  try {
    await savedPage.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await savedPage.evaluate(() => {
      localStorage.setItem('notare_course_series_v1', JSON.stringify({ version: 1, lessons: {
        1: { completedExercises: 3, judgedNotes: 48, correctNotes: 46,
          reactionSamples: 46, reactionTotalMs: 46 * 450 }
      }}));
    });
    await savedPage.reload({ waitUntil: 'domcontentloaded' });
    assert.match(await savedPage.getByTestId('course-detail-panel').innerText(), /За всё время: 3/);
    await savedPage.getByTestId('course-launch-selected').click();
    await savedPage.getByTestId('zen-control-strip').waitFor({ state: 'visible' });
    await savedPage.keyboard.press('Escape');
    const focused = savedPage.getByTestId('course-focused-controls');
    await focused.waitFor({ state: 'visible' });
    assert.match(await focused.innerText(), /0 \/ 10 ном/);
    await focused.getByRole('button', { name: 'Остановить' }).click();
    assert.equal(await focused.count(), 1, 'cancelled interruption must keep graded controls');
    assert.equal(dialogs.length, 1);
    assert.match(dialogs[0], /Завершённые упражнения \(3\) сохранены/);
    approveExit = true;
    await focused.getByRole('button', { name: 'Остановить' }).click();
    await savedPage.getByTestId('trainer-setup').waitFor({ state: 'visible' });
    assert.match(await savedPage.getByTestId('trainer-banner').innerText(), /Сохранено:[\s\S]*0 \/ 10/);
    assert.equal(dialogs.length, 2);
    await savedPage.reload({ waitUntil: 'domcontentloaded' });
    assert.match(await savedPage.getByTestId('course-detail-panel').innerText(), /За всё время: 3/);
    await savedPage.getByTestId('course-lesson-2').click();
    await savedPage.getByTestId('course-launch-selected').click();
    await savedPage.getByTestId('zen-control-strip').waitFor({ state: 'visible' });
    await savedPage.keyboard.press('Escape');
    assert.match(await savedPage.getByTestId('course-focused-controls').innerText(), /0 \/ 15 ном/);
    // Seven verified v2 Lookahead scores, not old aggregate counts, must resume Photo.
    await savedPage.evaluate(() => {
      const key = 'notare_course_series_v1';
      const series = JSON.parse(localStorage.getItem(key));
      series.lessons[10] = {
        completedExercises: 7, judgedNotes: 112, correctNotes: 108,
        reactionSamples: 108, reactionTotalMs: 108 * 400
      };
      localStorage.setItem(key, JSON.stringify(series));
      const lookahead = { mode: 'lookahead', judgedNotes: 16, correctNotes: 16,
        reactionSamples: 16, reactionTotalMs: 16 * 400 };
      localStorage.setItem('notare_course_recent_v2', JSON.stringify({ version: 2, lessons: {
        10: Array.from({ length: 7 }, () => lookahead)
      } }));
    });
    await savedPage.reload({ waitUntil: 'domcontentloaded' });
    await savedPage.getByTestId('course-lesson-10').click();
    assert.match(await savedPage.getByTestId('course-detail-panel').getByTestId('course-recent-count').innerText(), /7 \/ 15/);
    await savedPage.getByTestId('course-launch-selected').click();
    await savedPage.getByTestId('zen-control-strip').waitFor({ state: 'visible' });
    await savedPage.keyboard.press('Escape');
    const stage = savedPage.getByTestId('lesson-ten-stage');
    await stage.waitFor({ state: 'visible' });
    assert.match(await stage.innerText(), /Этап 2: Фото-память \(8\)/);
    assert.match(await savedPage.getByTestId('course-focused-controls').innerText(), /7 \/ 15 ном/);
  } finally {
    await savedPage.close();
  }
  assert.deepEqual(errors, [], 'no uncaught errors in focused course journey');
  console.log('Focused course controls Chrome acceptance passed at 375px / 1440px');
} finally {
  await browser.close();
}
