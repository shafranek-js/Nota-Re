/**
 * Persistent technical status bar: live MIDI, audio/renderer state and build.
 * Run after building and starting the production preview on port 4173.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});

try {
  for (const width of [320, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 780 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      const status = page.getByTestId('status-bar');
      const build = status.getByTestId('build-version');
      await status.waitFor({ state: 'visible' });
      assert.ok((await build.innerText()).includes('v3.0.0'));
      assert.match(await status.getByTestId('status-midi').innerText(), /MIDI:/);
      assert.match(await status.getByTestId('status-audio').innerText(), /Аудио:/);
      assert.match(await status.getByTestId('status-renderer').innerText(), /OSMD/);

      const bounds = await page.evaluate(() => {
        const bar = document.querySelector('[data-testid="status-bar"]').getBoundingClientRect();
        const build = document.querySelector('[data-testid="build-version"]').getBoundingClientRect();
        return { barBottom: bar.bottom, buildRight: build.right, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      assert.ok(Math.abs(bounds.barBottom - bounds.viewportHeight) <= 2, 'status bar must be anchored to bottom');
      assert.ok(bounds.buildRight <= bounds.viewportWidth + 1, 'build identity must remain visible on small screens');

      await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: /Тренажёр-Студия/ }).click();
      await page.getByRole('button', { name: 'Классический' }).click();
      assert.match(await status.getByTestId('status-renderer').innerText(), /SVG/);
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.match(await page.getByTestId('status-renderer').innerText(), /SVG/, 'renderer preference survives reload');

      const soundButton = page.getByRole('button', { name: 'Выключить звук' });
      await soundButton.click();
      assert.match(await page.getByTestId('status-audio').innerText(), /Выкл/);
      await page.getByRole('button', { name: 'Открыть настройки' }).click();
      assert.equal(await page.getByTestId('status-bar').evaluate(el => el.inert), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.getByTestId('status-bar').evaluate(el => el.inert), false);
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  }
  console.log('Bottom technical status bar smoke passed');
} finally {
  await browser.close();
}
