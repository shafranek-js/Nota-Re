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
    page.on('pageerror', error => errors.push(width + ': ' + error.message));
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.getByText(/Урок 3:/).first().click();
      await page.getByRole('button', { name: /Запустить этот урок в тренажёре/ }).click();

      const course = page.getByTestId('course-focused-controls');
      await course.waitFor({ state: 'visible' });
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 40000 });
      assert.equal(await page.getByTestId('trainer-toolbar').count(), 0,
        'free material/mode/BPM parameters cannot be edited during graded play');
      assert.match(await course.innerText(), /Урок 3/);
      assert.match(await course.innerText(), /60 BPM/);
      assert.equal((await course.getByTestId('course-credit-mode').innerText()).trim(), 'Зачётная попытка');
      assert.equal(await page.getByRole('button', { name: 'Поток: ИДЁТ' }).count(), 1);
      assert.equal(await course.getByRole('slider').count(), 0);

      // Export keeps the exact notated course exercise, without touching its
      // grading or ending the physical-MIDI training session.
      const downloadEvent = page.waitForEvent('download');
      await course.getByRole('button', { name: 'MusicXML' }).click();
      const download = await downloadEvent;
      assert.match(download.suggestedFilename(), /\.musicxml$/);
      assert.equal((await course.getByTestId('course-credit-mode').innerText()).trim(), 'Зачётная попытка');

      await course.getByTestId('toolbar-zen-toggle').click();
      await page.getByTestId('zen-control-strip').waitFor({ state: 'visible' });
      assert.equal(await course.count(), 0);
      await page.keyboard.press('Escape');
      await course.waitFor({ state: 'visible' });
      assert.equal(await course.getByTestId('toolbar-zen-toggle').evaluate(
        el => el === document.activeElement), true, 'Zen exit restores focus to course Zen control');

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
  assert.deepEqual(errors, [], 'no uncaught errors in focused course journey');
  console.log('Focused course controls Chrome acceptance passed at 375px / 1440px');
} finally {
  await browser.close();
}
