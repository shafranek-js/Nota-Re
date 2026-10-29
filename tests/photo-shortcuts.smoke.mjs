/**
 * Chrome regression for two real bugs:
 * 1) hidden photo-memory notes were still disclosed in plain text; and
 * 2) piano's document-level shortcuts stole Space/letter keys from buttons.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Студия$/ }).click();
  await page.getByTestId('osmd-score').waitFor({ state: 'visible' });

  const target = page.getByTestId('active-target-note');
  const interval = page.getByTestId('active-target-interval');
  const syllable = page.getByTestId('active-target-syllable');
  const fingering = page.getByTestId('active-target-fingering');
  const played = page.getByTestId('last-played-note');
  assert.match((await target.innerText()).trim(), /^[A-G][#b]?[0-9]$/,
    'the active note is visible in ordinary exercises');

  await page.getByTestId('toolbar-trigger-mode').click();
  await page.getByRole('button', { name: /4\. Фото-память/ }).click();
  await page.getByTestId('photo-masked-notice').waitFor({ state: 'visible', timeout: 10000 });
  assert.equal((await target.innerText()).trim(), 'По памяти');
  for (const el of [interval, syllable, fingering]) {
    assert.equal((await el.innerText()).trim(), 'Скрыт',
      'photo mask must hide all pitch/rhythm/fingering hints, not just SVG');
  }

  // The flash temporarily reveals hints as it reveals the actual notes.
  await page.getByRole('button', { name: 'Вспышка такта' }).click();
  await page.getByTestId('photo-masked-notice').waitFor({ state: 'hidden' });
  assert.match((await target.innerText()).trim(), /^[A-G][#b]?[0-9]$/);
  await page.getByTestId('photo-masked-notice').waitFor({ state: 'visible', timeout: 10000 });
  assert.equal((await target.innerText()).trim(), 'По памяти');

  // The same text guard applies in the classic renderer; switching the
  // engraving engine must not reveal the memorized target.
  await page.getByTestId('toolbar-trigger-view').click();
  await page.getByTestId('toolbar-panel-view').getByRole('button', { name: 'Классический', exact: true }).click();
  assert.ok(await page.locator('svg[viewBox="0 0 1720 305"]').isVisible());
  assert.equal((await target.innerText()).trim(), 'По памяти');
  await page.getByTestId('toolbar-trigger-mode').click();
  await page.getByRole('button', { name: /1\. Рефлекс/ }).click();
  assert.match((await target.innerText()).trim(), /^[A-G][#b]?[0-9]$/);

  const scoreBefore = await page.getByTestId('active-target-note').innerText();
  assert.equal((await played.innerText()).trim(), '—');
  await page.getByTestId('toolbar-trigger-view').click();
  const tabletopToggle = page.getByRole('button', { name: /Режим «Стол»/ });
  await tabletopToggle.focus();
  await page.keyboard.press('z');
  assert.equal((await played.innerText()).trim(), '—',
    'typing a piano letter while toolbar button has focus must not score a note');
  assert.equal(await page.getByTestId('active-target-note').innerText(), scoreBefore);

  // A focused toolbar button owns Space; the global tabletop shortcut must
  // not swallow native Space activation or advance graded exercise progress.
  await tabletopToggle.click();
  const score = page.locator('main');
  const hint = page.getByRole('button', { name: /Представил клавишу — следующий шаг/ });
  await hint.waitFor({ state: 'visible' });
  await page.keyboard.press('Space'); // native click on focused "Режим Стол" button
  await hint.waitFor({ state: 'detached' });

  await tabletopToggle.click();
  await hint.waitFor({ state: 'visible' });
  const piano = page.getByRole('region', { name: 'Прокручиваемая клавиатура фортепиано' });
  await piano.focus();
  await page.keyboard.press('Space');
  await page.getByTestId('assisted-step-notice').waitFor({ state: 'visible' });
  assert.equal((await played.innerText()).trim(), '—',
    'tabletop Space is an ungraded step, not a fake played note');

  await tabletopToggle.click();
  await piano.focus();
  await page.keyboard.press('z');
  assert.equal((await played.innerText()).trim(), 'C3',
    'piano letter shortcuts still work when piano itself is focused');

  assert.deepEqual(errors, [], 'no page exceptions during photo memory or keyboard focus');
  console.log('Photo memory and keyboard focus Chrome regression passed.');
} finally {
  await browser.close();
}
