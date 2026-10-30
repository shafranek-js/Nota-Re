import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});
const errors = [];
try {
  for (const width of [320, 375, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width < 400 ? 750 : 850 } });
    page.on('pageerror', error => errors.push(width + ': ' + error.message));
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: /^Студия$/ }).click();
      const toolbar = page.getByTestId('trainer-toolbar');
      await toolbar.waitFor({ state: 'visible' });
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 45000 });

      // Legacy preview may initially be 'playing'; enter editable Setup.
      if (!(await toolbar.getByTestId('trainer-setup').count())) {
        await toolbar.getByTestId('trainer-start-stop').click();
      }
      const setup = toolbar.getByTestId('trainer-setup');
      await setup.waitFor({ state: 'visible' });
      const analysis = toolbar.getByTestId('toolbar-precheck');
      const start = toolbar.getByTestId('trainer-start-stop');
      assert.equal(await page.getByRole('button', { name: 'Анализ перед игрой' }).count(), 0,
        'preplay must not take a dedicated row or duplicate its former label');
      assert.equal(await page.getByTestId('studio-workspace')
        .locator(':scope > [data-testid="trainer-setup"]').count(), 0,
        'setup must not add another full-width banner');
      assert.equal(await page.getByTestId('toolbar-zen-toggle').count(), 0,
        'Zen has become an automatic View preference, not a toolbar button');
      assert.equal(await toolbar.getByRole('button', { name: /Анализ/ }).count(), 1);
      const rect = await page.evaluate(() => {
        const a = document.querySelector('[data-testid="toolbar-precheck"]').getBoundingClientRect();
        const s = document.querySelector('[data-testid="trainer-start-stop"]').getBoundingClientRect();
        const t = document.querySelector('[data-testid="trainer-toolbar"]').getBoundingClientRect();
        return { ay: a.y + a.height / 2, sy: s.y + s.height / 2,
          aHeight: a.height, sHeight: s.height, toolbarHeight: t.height,
          scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
      });
      assert.ok(Math.abs(rect.ay - rect.sy) < 2, 'Analysis and Start belong on one row');
      assert.ok(rect.toolbarHeight < 75, 'collapsed toolbar must not grow a full setup row');
      assert.ok(rect.scrollWidth <= rect.clientWidth + 1, 'no body-level horizontal overflow');

      // Score renderer selection lives inside View; it must not consume a
      // permanent row above the notation.
      assert.equal(await page.getByRole('group', { name: 'Способ отображения нот' }).count(), 0);
      await toolbar.getByTestId('toolbar-trigger-view').click();
      const choices = toolbar.getByRole('group', { name: 'Способ отображения нот' });
      assert.ok(await choices.isVisible());
      await choices.getByRole('button', { name: 'Классический' }).click();
      await page.locator('#staff-notes-layer').waitFor({ state: 'visible' });
      await choices.getByRole('button', { name: 'OSMD', exact: true }).click();
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 45000 });
      await toolbar.getByTestId('toolbar-trigger-view').click();

      await analysis.click();
      const preplay = page.getByTestId('trainer-precheck');
      await preplay.waitFor({ state: 'visible' });
      assert.equal(await preplay.locator('ol > li').count(), 5);
      await preplay.getByRole('button', { name: 'К настройкам' }).click();
      await setup.waitFor({ state: 'visible' });

      await start.click();
      const strip = page.getByTestId('zen-control-strip');
      await strip.waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await toolbar.waitFor({ state: 'visible' });
      assert.equal(await page.getByTestId('trainer-setup').count(), 0,
        'Escape only restores controls, it does not stop the exercise');
      await toolbar.getByTestId('toolbar-precheck').click();
      await preplay.waitFor({ state: 'visible' });
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no runtime errors in compact Studio layout');
  console.log('Studio compact layout: one-row Analysis/Start, renderer in View, no setup banner, Precheck/Zen preserved at 320–1440px.');
} finally {
  await browser.close();
}
