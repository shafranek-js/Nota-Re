/**
 * End-to-end feedback proof: the same graded rhythm attempt can contain a
 * played wrong pitch and an unplayed slot. They must not look alike or grant
 * course credit. A true late strike is separately tested by noteJudgment
 * and attemptFeedback unit tests (browser timers cannot guarantee it).
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('navigation', { name: 'Рабочие пространства' })
      .getByRole('button', { name: 'Студия' }).click();
    const material = page.getByTestId('toolbar-trigger-material');
    await material.click();
    await page.getByRole('button', { name: '16 нот' }).click();
    const tempo = page.getByRole('slider', { name: 'Темп BPM' });
    await tempo.focus();
    await tempo.press('End'); // 130 BPM, quick bounded eight-note flow
    await page.getByRole('button', { name: 'Поток: Пауза' }).click();
    const target = (await page.getByTestId('active-target-note').innerText()).trim();
    const wrongNote = target === 'C3' ? 'D3' : 'C3';
    await page.getByRole('button', { name: `Клавиша ${wrongNote}`, exact: true }).click();

    const results = page.getByTestId('attempt-results');
    await results.waitFor({ state: 'visible', timeout: 30000 });
    assert.ok(await results.getByTestId('attempt-error-wrong-pitch').count() >= 1,
      'first wrong input is labeled as a wrong note');
    assert.ok(await results.getByTestId('attempt-error-missed').count() >= 1,
      'silent slots are distinctly labeled as omissions');
    assert.match(await results.getByTestId('attempt-error-wrong-pitch').first().innerText(), /Неверная нота/);
    assert.match(await results.getByTestId('attempt-error-missed').first().innerText(), /Пропуск/);
    assert.match(await results.getByTestId('attempt-verdict').innerText(), /свободной практики/i);
    assert.equal(await results.getByRole('button', { name: /Следующий урок/ }).count(), 0);
    assert.equal(await results.getByRole('heading', { name: 'Что проверить' }).count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
  console.log('Attempt feedback: wrong pitch, missed slot, separate appearance and ungraded outcome passed.');
} finally {
  await browser.close();
}
