/**
 * Real-Chrome smoke for bundled bank and user-local SF3 preferences.
 * The bank fixture is the build-verified MuseScore General source.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.getByTitle('Открыть настройки').click();
  const panel = page.getByTestId('piano-sound-settings');
  await panel.waitFor();
  assert.equal(await panel.getByRole('button', { name: 'SoundFont (по умолчанию)' }).getAttribute('aria-pressed'), 'true');
  await panel.getByRole('button', { name: 'SoundFont (по умолчанию)' }).click();
  await panel.getByText('Звуковой банк готов к воспроизведению.').waitFor({ timeout: 120000 });
  assert.match(await panel.innerText(), /MuseScore General v0.2/);

  await panel.getByRole('button', { name: 'Синтезатор' }).click();
  assert.equal(await panel.getByRole('button', { name: 'Синтезатор' }).getAttribute('aria-pressed'), 'true');
  await panel.getByRole('button', { name: 'SoundFont (по умолчанию)' }).click();

  // An already validated built-in SF3 can also be a user-provided bank.
  await panel.locator('input[type="file"]').setInputFiles('assets/soundfonts/MuseScore_General.sf3');
  await panel.getByText('Звуковой банк готов к воспроизведению.').waitFor({ timeout: 120000 });
  assert.match(await panel.innerText(), /MuseScore_General.sf3/);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTitle('Открыть настройки').click();
  const restored = page.getByTestId('piano-sound-settings');
  assert.equal(await restored.getByRole('button', { name: 'SoundFont (по умолчанию)' }).getAttribute('aria-pressed'), 'true');
  await restored.getByRole('button', { name: 'SoundFont (по умолчанию)' }).click();
  await restored.getByText('Звуковой банк готов к воспроизведению.').waitFor({ timeout: 120000 });
  assert.match(await restored.innerText(), /MuseScore_General.sf3/);

  await restored.getByRole('button', { name: 'Встроенный банк' }).click();
  await restored.getByText('Звуковой банк готов к воспроизведению.').waitFor({ timeout: 120000 });
  assert.match(await restored.innerText(), /MuseScore General v0.2/);

  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/soundfont-settings.png', fullPage: true });
  assert.deepEqual(errors, [], 'No uncaught JS errors');
  console.log('SoundFont browser smoke passed: default, oscillator switch, custom SF3, reload and default reset.');
} finally {
  await browser.close();
}
