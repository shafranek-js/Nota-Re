/**
 * Browser smoke test for the OSMD migration.
 * Run via the GitHub Actions workflow, which supplies Chrome + Playwright.
 * This tests real Vite/React/OSMD integration rather than only TypeScript.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Тренажёр-Студия/ }).click();

  const svg = page.locator('[aria-label="Нотная партитура OpenSheetMusicDisplay"] svg').first();
  await svg.waitFor({ state: 'visible', timeout: 45000 });
  assert.ok(await svg.locator('path, line, text').count() > 0, 'OSMD should engrave staff symbols');

  const renderError = page.getByText('Ошибка нотного движка:', { exact: false });
  assert.equal(await renderError.count(), 0, 'OSMD must not show an error on first load');
  const indexBefore = Number(await page.getByTestId('osmd-score').getAttribute('data-active-note-index'));

  // Explicitly enter ungraded tabletop mode to advance cursor in smoke
  // tests; regular Space no longer auto-enters a correct pitch.
  await page.getByRole('button', { name: /Режим «Стол»/ }).click();
  await page.getByRole('region', { name: 'Прокручиваемая клавиатура фортепиано' }).focus();
  await page.keyboard.press('Space');
  assert.ok(await svg.isVisible(), 'Notation must remain after note input');
  const indexAfter = Number(await page.getByTestId('osmd-score').getAttribute('data-active-note-index'));
  assert.equal(indexAfter, indexBefore + 1, 'exercise should advance exactly one step');

  await page.getByRole('button', { name: /2\. Ритмослоги/ }).click();
  await svg.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await renderError.count(), 0, 'OSMD rhythm mode must load');

  // Lookahead should mask only notes already played, on OSMD's own SVG.
  await page.getByRole('button', { name: /3\. Бегунок/ }).click();
  await svg.waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('region', { name: 'Прокручиваемая клавиатура фортепиано' }).focus();
  await page.keyboard.press('Space');
  await page.locator('[data-notare-masked="true"]').first().waitFor({ state: 'attached', timeout: 10000 });
  assert.ok(await page.getByTestId('osmd-score').isVisible(), 'lookahead must use OSMD');
  assert.equal(await page.locator('[data-notare-masked="true"]').first().evaluate(el => getComputedStyle(el).visibility),
    'hidden', 'the graphical note group must really be invisible');

  // Photo exercise must first reveal the score, then hide actual note SVGs
  // after the existing exposure timer. "Flash" must reveal them again.
  await page.getByRole('button', { name: /4\. Фото-память/ }).click();
  await svg.waitFor({ state: 'visible', timeout: 30000 });
  await page.getByTestId('photo-masked-notice').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-notare-masked="true"]').first().waitFor({ state: 'attached', timeout: 10000 });
  await page.getByRole('button', { name: 'Вспышка такта' }).click();
  await page.getByTestId('photo-masked-notice').waitFor({ state: 'hidden', timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-notare-masked="true"]').length === 0);

  // Interval guides are anchored to OSMD's own engraved note positions.
  await page.getByRole('button', { name: /5\. Интервалы/ }).click();
  await page.getByTestId('osmd-score').waitFor({ state: 'visible' });
  const arc = page.locator('[data-notare-interval-overlay="true"]');
  await arc.first().waitFor({ state: 'attached', timeout: 15000 });
  assert.ok(await arc.count() > 0, 'interval guides must attach to OSMD SVG notes');
  assert.equal(await renderError.count(), 0, 'OSMD interval guides should not fail');
  await page.setViewportSize({ width: 768, height: 900 });
  await arc.first().waitFor({ state: 'attached', timeout: 15000 });
  assert.ok(await arc.count() > 0, 'interval guides remain after responsive resize');

  // G-pattern uses the real OSMD staff with bass-to-treble gaze paths.
  await page.getByRole('button', { name: /6\. Буква «Г»/ }).click();
  await page.getByTestId('osmd-score').waitFor({ state: 'visible' });
  const gaze = page.locator('[data-notare-gaze-overlay="true"]');
  await gaze.first().waitFor({ state: 'attached', timeout: 15000 });
  assert.ok(await gaze.count() > 0, 'G-pattern must draw gaze paths on OSMD notes');
  const firstPath = gaze.first().locator('path');
  assert.match(await firstPath.getAttribute('d'), /^M [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+$/);
  assert.equal(await renderError.count(), 0, 'G-pattern should not show OSMD renderer errors');
  await page.setViewportSize({ width: 375, height: 900 });
  await gaze.first().waitFor({ state: 'attached', timeout: 15000 });
  assert.ok(await gaze.count() > 0, 'G-pattern must reanchor after narrow viewport rerender');
  await page.getByRole('button', { name: 'Новый', exact: true }).click();
  await gaze.first().waitFor({ state: 'attached', timeout: 15000 });
  assert.ok(await gaze.count() > 0, 'G-pattern must survive regenerating notes');

  // Hanon still has instructional block overlays only in Classic.
  await page.getByRole('button', { name: /8\. Ганон/ }).click();
  await page.getByText(/временно использует классический стан/).waitFor();
  assert.ok(await page.locator('svg[viewBox="0 0 1720 305"]').isVisible());

  await page.getByRole('button', { name: /1\. Рефлекс/ }).click();
  await svg.waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('button', { name: 'Классический', exact: true }).click();
  assert.ok(await page.locator('svg[viewBox="0 0 1720 305"]').isVisible());

  await page.getByRole('button', { name: 'OSMD', exact: true }).click();
  await svg.waitFor({ state: 'visible', timeout: 30000 });

  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/osmd-trainer.png', fullPage: true });
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('Browser smoke passed: OSMD loaded, cursor advanced, rhythm rendered, legacy fallback worked.');
} finally {
  if (page) {
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/osmd-last-state.png', fullPage: true }).catch(() => {});
  }
  await browser.close();
}
