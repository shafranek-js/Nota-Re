import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 820 } });
  page.on('pageerror', err => errors.push(err.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__adaptive_test_seeded')) {
      sessionStorage.setItem('__adaptive_test_seeded', '1');
      localStorage.setItem('notare_course_completed_v3', '[1]');
    }
  });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Студия$/ }).click();
  await page.getByTestId('toolbar-trigger-material').click();
  await page.getByRole('button', { name: /^16 нот$/ }).click();
  const toggle = page.getByTestId('adaptive-reflex-toggle');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  const trace = page.getByTestId('adaptive-trace');
  assert.match(await trace.innerText(), /Seed: \d+/);
  await page.getByTestId('toolbar-trigger-material').click();
  const target = page.getByTestId('active-target-note');
  for (let i=0; i<8; i++) {
    const note = (await target.innerText()).trim();
    assert.match(note, /^[A-G][#b]?[0-9]$/);
    await page.getByRole('button', { name: `Клавиша ${note}`, exact: true }).click();
  }
  await page.getByTestId('attempt-results').waitFor({ state: 'visible' });
  const state = await page.evaluate(() => ({
    grades: localStorage.getItem('notare_course_completed_v3'),
    stats: JSON.parse(localStorage.getItem('notare_adaptive_practice_stats_v1'))
  }));
  assert.equal(state.grades, '[1]', 'opt-in adaptation must not change course credits');
  assert.equal(state.stats.version, 1);
  assert.equal(Object.values(state.stats.notes).reduce((s, item) => s + item.observations, 0), 8);
  assert.ok(Object.keys(state.stats.notes).every(key => key.startsWith('pc:reflex:')));
  assert.equal(await page.getByTestId('course-credit-mode').count(), 0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Студия$/ }).click();
  await page.getByTestId('toolbar-trigger-material').click();
  assert.equal(await page.getByTestId('adaptive-reflex-toggle').getAttribute('aria-pressed'), 'false',
    'adaptive mode requires explicit opt-in each session');
  assert.match(await page.getByTestId('adaptive-evidence-count').innerText(), /Записей: 8/);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Сбросить статистику' }).click();
  assert.match(await page.getByTestId('adaptive-evidence-count').innerText(), /Записей: 0/);
  assert.equal(await page.evaluate(() =>
    localStorage.getItem('notare_course_completed_v3')), '[1]');
  assert.equal(await page.evaluate(() =>
    localStorage.getItem('notare_adaptive_practice_stats_v1')), null);
  assert.deepEqual(errors, []);
  console.log('Adaptive Reflex Chrome: opt-in, seeded score, 8 sourced observations, reload/reset and no course credit.');
} finally {
  await browser.close();
}
