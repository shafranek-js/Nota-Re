/**
 * Real-browser regression: a finished exercise must not disappear
 * or silently count input while its result card is visible.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});
const errors = [];
try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 375 ? 700 : 900 } });
    page.on('pageerror', error => errors.push(error.message));
    try {
      // This result-card test reads the active pitch and manipulates in-play
      // controls. Validate the explicit normal-view opt-out, not Zen masking.
      await page.addInitScript(() => localStorage.setItem(
        'notare-trainer-preferences-v1',
        JSON.stringify({ version: 2, preferences: { zenModeEnabled: false } })
      ));
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: /^Студия$/ }).click();
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 30000 });
      // The default score contains 16 notes; the density button selects 8.
      await page.getByTestId('toolbar-trigger-material').click();
      await page.getByRole('button', { name: /16 нот/ }).click();
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 30000 });
      const firstNote = (await page.getByTestId('active-target-note').innerText()).trim();
      assert.match(firstNote, /^[A-G][#b]?[0-9]$/);
      const sessionAccuracy = page.getByTitle('Точность попаданий в текущей сессии');
      for (let step = 0; step < 8; step += 1) {
        const note = (await page.getByTestId('active-target-note').innerText()).trim();
        await page.getByRole('button', { name: `Клавиша ${note}`, exact: true }).click();
      }

      const results = page.getByTestId('attempt-results');
      await results.waitFor({ state: 'visible', timeout: 15000 });
      assert.equal((await results.getByTestId('attempt-correct').innerText()).trim(), '8 / 8');
      assert.equal((await results.getByTestId('attempt-accuracy').innerText()).trim(), '100%');
      assert.match(await results.getByTestId('attempt-verdict').innerText(), /свободной практики/i);
      assert.equal(await results.getByRole('button', { name: /Следующий урок/ }).count(), 0);
      assert.equal(await page.getByTestId('osmd-score').count(), 0);
      assert.equal(await results.locator('#attempt-result-heading').evaluate(el => document.activeElement === el), true,
        'keyboard focus moves to results heading');

      const before = await sessionAccuracy.innerText();
      await page.keyboard.press('Space');
      await page.waitForTimeout(450);
      assert.equal(await sessionAccuracy.innerText(), before,
        'no keyboard shortcut may score a fresh note before result dismissal');
      assert.ok(await results.isVisible(), 'results cannot disappear on their own');

      await results.getByTestId('retry-exercise').click();
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 30000 });
      const retried = (await page.getByTestId('active-target-note').innerText()).trim();
      assert.equal(retried, firstNote, 'retry keeps the same starting note');

      // A wrong pitch must be visibly different from a late answer or a missed
      // rhythmic slot, without changing the actual score or grading model.
      const wrongNote = retried === 'C4' ? 'D4' : 'C4';
      await page.getByRole('button', { name: `Клавиша ${wrongNote}`, exact: true }).click();
      for (let step = 0; step < 8; step += 1) {
        const note = (await page.getByTestId('active-target-note').innerText()).trim();
        await page.getByRole('button', { name: `Клавиша ${note}`, exact: true }).click();
      }
      await results.waitFor({ state: 'visible', timeout: 15000 });
      assert.equal((await results.getByTestId('attempt-correct').innerText()).trim(), '8 / 9');
      assert.equal((await results.getByTestId('attempt-errors-count').innerText()).trim(), '1');
      assert.match(await results.getByTestId('attempt-wrong-pitch-count').innerText(), /Неверная нота: 1/);
      assert.equal(await results.getByTestId('attempt-late-count').count(), 0);
      assert.equal(await results.getByTestId('attempt-missed-count').count(), 0);
      const wrongEvent = results.getByTestId('attempt-error-event');
      assert.equal(await wrongEvent.count(), 1);
      assert.equal(await wrongEvent.getAttribute('data-outcome'), 'wrong-pitch');
      assert.match(await wrongEvent.innerText(), /Неверная нота/);
      assert.match(await wrongEvent.innerText(), /ожидалась/);
      assert.equal(await results.getByRole('group', { name: 'Ошибки по типам' }).count(), 1);
      assert.equal(await wrongEvent.locator('svg[aria-hidden="true"]').count(), 1,
        'visual feedback has a distinct icon and a readable text label');
      await results.getByTestId('retry-exercise').click();
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 30000 });

      // Now complete an exercise entirely through tabletop assistance.
      await page.getByTestId('toolbar-trigger-view').click();
      await page.getByRole('button', { name: /Режим «Стол»/ }).click();
      const imagined = page.getByRole('button', { name: /Представил клавишу — следующий шаг/ });
      for (let step = 0; step < 8; step += 1) await imagined.click();
      await results.waitFor({ state: 'visible', timeout: 15000 });
      assert.equal((await results.getByTestId('attempt-accuracy').innerText()).trim(), '—');
      assert.equal((await results.getByTestId('attempt-reaction').innerText()).trim(), '—');
      assert.match(await results.getByTestId('attempt-assisted-count').innerText(), /8/);
      assert.match(await results.getByTestId('attempt-verdict').innerText(), /не засчитывается/);

      await results.getByRole('button', { name: /К настройкам упражнения/ }).click();
      await page.getByTestId('trainer-setup').waitFor({ state: 'visible' });
      const attemptsBeforeStart = await sessionAccuracy.innerText();
      await page.keyboard.press('Space');
      assert.equal(await sessionAccuracy.innerText(), attemptsBeforeStart);
      await page.getByRole('button', { name: 'Начать упражнение' }).click();
      await page.getByTestId('osmd-score').waitFor({ state: 'visible' });
      assert.equal(await page.getByTestId('trainer-setup').count(), 0);
      const metrics = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        docWidth: document.documentElement.scrollWidth
      }));
      assert.ok(metrics.docWidth <= metrics.viewport + 1,
        `no page-wide horizontal overflow at ${width}px`);
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no browser crashes during exercise lifecycle');
  console.log('Result card Chrome smoke passed at 375px and 1440px');
} finally {
  await browser.close();
}
