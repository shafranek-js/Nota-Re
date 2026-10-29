import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Студия$/ }).click();
  const score = page.getByTestId('osmd-score');
  await score.waitFor({ state: 'visible', timeout: 30000 });

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const initialIndex = Number(await score.getAttribute('data-active-note-index'));
  await page.keyboard.press('Space');
  assert.equal(Number(await score.getAttribute('data-active-note-index')), initialIndex,
    'Space must never auto-answer when not in tabletop mode');

  await page.getByTestId('toolbar-trigger-view').click();
  await page.getByRole('button', { name: /Режим «Стол»/ }).click();
  const button = page.getByRole('button', { name: /Представил клавишу — следующий шаг/ });
  await button.waitFor();
  // Explicitly focus the virtual piano: Space on a focused toolbar button
  // now correctly triggers that button instead of a global training shortcut.
  await page.getByRole('region', { name: 'Прокручиваемая клавиатура фортепиано' }).focus();
  await page.keyboard.press('Space');
  assert.equal(Number(await score.getAttribute('data-active-note-index')), initialIndex + 1,
    'Space advances exactly one tabletop practice step');
  await page.getByTestId('assisted-step-notice').waitFor({ state: 'visible' });

  await button.click();
  assert.equal(Number(await score.getAttribute('data-active-note-index')), initialIndex + 2,
    'tabletop button performs exactly one ungraded step');

  const stats = await page.getByTitle('Точность попаданий в текущей сессии').innerText();
  assert.match(stats, /\(0\)/, 'assisted actions must not create scoring attempts');
  const numbers = await page.getByTitle('Сыграно однотипных номеров в серии').innerText();
  assert.match(numbers, /0\s*\//, 'assisted actions must not count completed repetitions');

  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log('Assisted practice smoke passed: Space restricted, ungraded step, no false course progress.');
} finally {
  await browser.close();
}
