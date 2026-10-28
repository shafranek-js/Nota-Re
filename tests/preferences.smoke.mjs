import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1920, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const prefs = () => page.evaluate(() => JSON.parse(
  localStorage.getItem('notare-trainer-preferences-v1') ?? '{}'
));

try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });

  // Course selection and completion are separate from trainer preferences.
  await page.getByText(/Урок 8:/).first().click();
  await page.evaluate(() =>
    localStorage.setItem('notare_course_completed_v3', '[1,2]')
  );
  await page.getByRole('button', { name: /Тренажёр-Студия/ }).click();
  await page.getByRole('button', { name: /2\. Ритмослоги/ }).click();
  await page.locator('select').filter({ has: page.locator('option[value="F"]') }).selectOption('F');
  await page.locator('input[type="range"]').first().fill('88');
  await page.getByRole('button', { name: /16 нот/ }).click();
  await page.getByRole('button', { name: /Тактильная ширма/ }).click();
  await page.getByRole('button', { name: 'Поток: Пауза' }).click();
  await page.getByTitle('Выключить звук').click();
  await page.getByTitle('Открыть настройки').click();
  const settings = page.locator('aside');
  await settings.getByRole('button', { name: /М. Литовко/ }).click();
  await settings.locator('select').filter({ has: page.locator('option[value="solfege"]') }).selectOption('solfege');
  await settings.locator('select').filter({ has: page.locator('option[value="1100"]') }).selectOption('1100');
  await settings.locator('select').filter({ has: page.locator('option[value="coord"]') }).selectOption('coord');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  const saved = await prefs();
  assert.equal(saved.version, 1);
  assert.equal(saved.preferences.selectedLessonId, 8);
  assert.equal(saved.preferences.currentAppMode, 'rhythm');
  assert.equal(saved.preferences.currentTonality, 'F');
  assert.equal(saved.preferences.currentFilter, 'bass');
  assert.equal(saved.preferences.bpm, 88);
  assert.equal(saved.preferences.scoreNoteCount, 8);
  assert.equal(saved.preferences.currentHanonType, 'coord');
  assert.equal(saved.preferences.speechSuppressor, 'solfege');
  assert.equal(saved.preferences.photoExposureMs, 1100);
  assert.equal(saved.preferences.isBlindfolded, true);
  assert.equal(saved.preferences.audioEnabled, false);
  assert.equal('isContinuousFlow' in saved.preferences, false);
  assert.equal('totalAttempts' in saved.preferences, false);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Тренажёр-Студия/ }).click();
  assert.equal(await page.getByRole('button', { name: /2\. Ритмослоги/ }).getAttribute('class').then(x => x.includes('bg-emerald-500')), true);
  assert.equal(await page.locator('select').filter({ has: page.locator('option[value="F"]') }).inputValue(), 'F');
  assert.equal(await page.locator('input[type="range"]').first().inputValue(), '88');
  assert.match(await page.getByRole('button', { name: /8 нот/ }).innerText(), /8 нот/);
  assert.ok(await page.getByRole('button', { name: 'Поток: Пауза' }).isVisible(),
    'refresh never silently resumes graded flow');
  assert.ok(await page.getByTitle('Включить звук').isVisible());
  await page.getByTitle('Открыть настройки').click();
  await page.getByRole('button', { name: 'Сбросить настройки' }).click().catch(() => {});
  // The reset confirmation deliberately protects against accidental clicks.
} finally {
  await browser.close();
}
