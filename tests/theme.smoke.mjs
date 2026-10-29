import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});

const css = (locator, prop) => locator.evaluate((el, property) =>
  getComputedStyle(el).getPropertyValue(property).trim(), prop);
const WHITE = 'rgb(255, 255, 255)';
const DARK_INK = 'rgb(15, 23, 42)';
const DARK_NOTE_BG = 'rgb(11, 17, 32)';

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
      const darkHeader = await css(page.locator('header'), 'background-color');

      await theme.click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      assert.equal(await theme.getAttribute('aria-pressed'), 'true');
      assert.equal(await theme.getAttribute('title'), 'Включить тёмную тему');
      assert.notEqual(await css(page.locator('header'), 'background-color'), darkHeader);
      assert.equal(await page.evaluate(() => localStorage.getItem('notare-theme-v1')), 'light');

      await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: 'Студия' }).click();

      // Regression from the first light-theme release: the lesson banner was
      // still navy, with dark text applied by the generic light palette.
      const banner = page.getByTestId('trainer-banner');
      assert.ok(await banner.isVisible());
      assert.match(await css(banner, 'background-image'), /linear-gradient/);
      assert.equal(await css(banner.locator('strong').first(), 'color'), DARK_INK,
        'lesson title must be dark ink on a light background');

      const score = page.getByTestId('osmd-score');
      await score.waitFor({ state: 'visible', timeout: 45000 });
      const paper = page.locator('.osmd-light-theme svg').first();
      await paper.waitFor({ state: 'visible', timeout: 30000 });
      assert.equal(await paper.evaluate(el => getComputedStyle(el).backgroundColor), WHITE,
        'OSMD must have actual white paper in light mode');
      assert.equal(await score.getAttribute('data-theme-lock'), null,
        'the previously hard-locked dark score must be removed');
      // OSMD note SVGs have inline teaching-color styles. Ensure upcoming ink
      // is dark and the contrast does not depend on a CSS invert filter.
      await page.waitForFunction(() => [...document.querySelectorAll(
        '[data-notare-note-state="upcoming"] path'
      )].some(path => path.style.fill === 'rgb(15, 23, 42)' || path.style.fill === '#0f172a'));
      const blackLegend = page.locator('.piano-black-key span[aria-hidden="true"]').first();
      if (await blackLegend.count()) {
        assert.equal(await css(blackLegend, 'color'), 'rgb(241, 245, 249)',
          'sharp/flat key labels must remain legible against black keys');
      }
      await mkdir('artifacts', { recursive: true });
      await page.screenshot({ path: `artifacts/theme-light-studio-${width}.png`, fullPage: true });

      // The Classic renderer must use the same theme: light staff bands, dark
      // notes and dark line strokes, not an inverted dark score.
      await page.getByTestId('toolbar-trigger-view').click();
      await page.getByTestId('toolbar-panel-view')
        .getByRole('button', { name: 'Классический', exact: true }).click();
      const classic = page.locator('svg[viewBox="0 0 1720 305"]');
      await classic.waitFor({ state: 'visible' });
      assert.equal(await classic.locator('#staff-notes-layer ellipse').last().getAttribute('fill'), '#0f172a',
        'upcoming Classic notes must use dark ink in light mode');
      const classicLines = classic.locator('g[stroke]').first();
      assert.equal(await classicLines.getAttribute('stroke'), '#64748b',
        'Classic staff lines must be darker on light paper');
      await page.screenshot({ path: `artifacts/theme-light-classic-${width}.png`, fullPage: true });

      // Switching back to dark must restore the proven dark OSMD palette
      // without requiring a page reload or changing the exercise.
      await theme.click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      await page.getByTestId('toolbar-trigger-view').click();
      await page.getByTestId('toolbar-panel-view')
        .getByRole('button', { name: 'OSMD', exact: true }).click();
      const darkPaper = page.locator('.osmd-dark-theme svg').first();
      await darkPaper.waitFor({ state: 'visible', timeout: 30000 });
      assert.equal(await css(darkPaper, 'background-color'), DARK_NOTE_BG);
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');

      await page.getByTestId('theme-toggle').click();
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      assert.equal(await page.getByTestId('theme-toggle').getAttribute('aria-pressed'), 'true');
      await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: 'База знаний' }).click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      assert.deepEqual(errors, [], 'no browser exceptions after theme/renderer transitions');
    } finally {
      await page.close();
    }
  }
  console.log('Theme smoke passed: full light score, banners, key legends, Classic, persistence at 375/1440px.');
} finally {
  await browser.close();
}
