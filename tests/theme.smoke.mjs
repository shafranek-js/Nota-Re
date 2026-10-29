import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});

try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      const theme = page.getByTestId('theme-toggle');
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      assert.equal(await theme.getAttribute('aria-pressed'), 'false');
      assert.equal(await theme.getAttribute('title'), 'Включить светлую тему');

      const background = () => page.locator('main').evaluate(el =>
        getComputedStyle(document.querySelector('header')).backgroundColor);
      const darkHeader = await background();

      // The header is shared by all workspaces, not hidden in Settings.
      await theme.click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      assert.equal(await theme.getAttribute('aria-pressed'), 'true');
      assert.equal(await theme.getAttribute('title'), 'Включить тёмную тему');
      assert.notEqual(await background(), darkHeader, 'light theme changes the header surface');
      assert.equal(await page.evaluate(() => localStorage.getItem('notare-theme-v1')), 'light');

      await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: 'Студия' }).click();
      const score = page.getByTestId('osmd-score');
      await score.waitFor({ state: 'visible', timeout: 45000 });
      const lightScoreBackground = await score.evaluate(el => getComputedStyle(el).backgroundColor);
      assert.equal(await score.getAttribute('data-theme-lock'), 'dark',
        'OSMD notes retain their proven high-contrast score palette');
      assert.equal(await page.getByRole('button', { name: 'Клавиша C3' }).isVisible(), true);
      // Screenshots should contain the engraved notes, not a loading placeholder.
      await page.locator('[aria-label="Нотная партитура OpenSheetMusicDisplay"] svg')
        .first().waitFor({ state: 'visible', timeout: 30000 });
      // Capture the real rendered light UI for human visual acceptance.
      await mkdir('artifacts', { recursive: true });
      await page.screenshot({ path: `artifacts/theme-light-studio-${width}.png`, fullPage: true });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByTestId('theme-toggle').waitFor({ state: 'visible' });
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light',
        'theme must be restored before React renders');
      assert.equal(await page.getByTestId('theme-toggle').getAttribute('aria-pressed'), 'true');
      await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: 'Студия' }).click();
      await score.waitFor({ state: 'visible' });
      assert.equal(await score.evaluate(el => getComputedStyle(el).backgroundColor),
        lightScoreBackground, 'theme must not recolor the engraved score');

      await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: 'База знаний' }).click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      await page.getByTestId('theme-toggle').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      assert.equal(await background(), darkHeader);
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      assert.deepEqual(errors, [], 'no exceptions while toggling and restoring theme');
    } finally {
      await page.close();
    }
  }
  console.log('Theme smoke passed: prominent header control, persistence, workspaces and score contrast at 375/1440px.');
} finally {
  await browser.close();
}
