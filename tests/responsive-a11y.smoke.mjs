import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const sizes = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 768, height: 720 },
  { width: 1280, height: 800 },
  { width: 1920, height: 960 }
];
const errors = [];

try {
  for (const viewport of sizes) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', e => errors.push(viewport.width + ': ' + e.message));
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      const nav = page.getByRole('navigation', { name: 'Рабочие пространства' });
      await nav.waitFor({ state: 'visible' });
      if (viewport.width <= 375) {
        const brand = await page.getByTestId('header-brand').boundingBox();
        const midi = await page.getByTestId('header-midi-diagnostics').boundingBox();
        assert.ok(brand && midi && Math.abs(brand.y - midi.y) < 20,
          'compact mobile header keeps branding and MIDI access on a single control row');
      }

      const metrics = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        body: document.body.scrollWidth
      }));
      assert.ok(metrics.scroll <= metrics.viewport + 1,
        `width ${viewport.width}: document overflows viewport ${JSON.stringify(metrics)}`);
      assert.ok(metrics.body <= metrics.viewport + 1,
        `width ${viewport.width}: body overflows viewport ${JSON.stringify(metrics)}`);

      // Every workspace remains reachable even when navigation must scroll.
      await nav.getByRole('button', { name: /^База знаний$/ }).click();
      assert.equal(await nav.getByRole('button', { name: /^База знаний$/ }).getAttribute('aria-current'), 'page');
      await nav.getByRole('button', { name: /^Студия$/ }).click();
      const pianoRegion = page.getByRole('region', { name: 'Прокручиваемая клавиатура фортепиано' });
      await pianoRegion.waitFor({ state: 'visible' });
      assert.ok(await page.getByRole('button', { name: 'Клавиша C3' }).count() > 0);
      assert.ok(await page.getByRole('button', { name: 'Клавиша C#3' }).count() > 0);
      if (viewport.width <= 375) {
        const measure = await pianoRegion.evaluate(el => ({
          visible: el.clientWidth, content: el.scrollWidth
        }));
        assert.ok(measure.content > measure.visible,
          'phone piano needs its own horizontal scrollbar, not page overflow');
        const bottom = page.getByRole('button', { name: 'Клавиша C3' });
        await bottom.scrollIntoViewIfNeeded();
        assert.ok(await bottom.isVisible(), 'piano is reachable by scrolling the workspace');
      }

      // The opener must regain focus after closing the truly modal drawer.
      const opener = page.getByRole('button', { name: 'Открыть настройки' });
      await opener.focus();
      await opener.click();
      const dialog = page.getByRole('dialog', { name: /Настройки тренажёра/ });
      await dialog.waitFor({ state: 'visible' });
      assert.equal(await dialog.getAttribute('aria-modal'), 'true');
      assert.ok(await dialog.evaluate(el => el.getBoundingClientRect().width <= innerWidth + 1));
      assert.equal(await page.locator('header').evaluate(el => el.inert), true);
      assert.equal(await page.locator('main').evaluate(el => el.inert), true);
      assert.equal(await page.getByTestId('status-bar').evaluate(el => el.inert), true,
        'settings modal must make the technical footer inert');
      assert.equal(await page.locator('header').getAttribute('aria-hidden'), 'true');
      assert.equal(await dialog.getByRole('button', { name: 'Закрыть настройки' }).evaluate(el => el === document.activeElement), true);

      // Shift+Tab at the first control wraps to the last control, then Tab
      // wraps back to the first, never into an inert workspace.
      await page.keyboard.press('Shift+Tab');
      assert.equal(await dialog.getByRole('button', { name: 'Готово', exact: true })
        .evaluate(el => el === document.activeElement), true,
        'reverse tab must wrap to the bottom');
      await page.keyboard.press('Tab');
      assert.equal(await dialog.getByRole('button', { name: 'Закрыть настройки' })
        .evaluate(el => el === document.activeElement), true,
        'forward tab must wrap to the top');

      // Accessible labels on the selects are discoverable, including mobile.
      assert.equal(await dialog.getByLabel(/Глушитель называния нот/).count(), 1);
      assert.equal(await dialog.getByLabel(/Окно экспозиции/).count(), 1);
      assert.equal(await dialog.getByLabel(/Профиль упражнений Ганона/).count(), 1);

      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await opener.evaluate(el => el === document.activeElement), true,
        'focus must return to the settings opener on Escape');
      assert.equal(await page.locator('header').evaluate(el => el.inert), false);
      assert.equal(await page.locator('main').getAttribute('aria-hidden'), null);

      // A second opening/closing via the actual visible button must also
      // restore focus, and the modal must remain wholly inside narrow screens.
      await opener.click();
      await page.getByRole('button', { name: 'Готово', exact: true }).click();
      assert.equal(await opener.evaluate(el => el === document.activeElement), true);

      // The MIDI shortcut is an actual deep link, not a second settings page.
      // It must open the existing diagnostics, transfer focus and use the same
      // interruption / modal / Escape rules as ordinary Settings.
      const midiEntry = page.getByTestId('header-midi-diagnostics');
      await midiEntry.click();
      await dialog.waitFor({ state: 'visible' });
      const midiDetails = dialog.getByTestId('midi-audio-diagnostics');
      assert.equal(await midiDetails.getAttribute('open'), '',
        'MIDI shortcut automatically expands the original diagnostics');
      assert.equal(await midiDetails.locator('summary').evaluate(el => el === document.activeElement), true,
        'focus enters diagnostics rather than the general Settings header');
      assert.equal(await dialog.getByTestId('midi-hardware-check').count(), 1,
        'existing physical MIDI self-check stays present');
      assert.equal(await page.getByTestId('status-bar').evaluate(el => el.inert), true);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await midiEntry.evaluate(el => el === document.activeElement), true,
        'Escape returns focus to the MIDI shortcut');
      await opener.click();
      await dialog.waitFor({ state: 'visible' });
      assert.equal(await dialog.getByTestId('midi-audio-diagnostics').getAttribute('open'), null,
        'ordinary Settings does not reopen the previous MIDI deep link');
      await page.keyboard.press('Escape');
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no browser JS exceptions on responsive views');
  console.log('Responsive/a11y Chrome smoke passed: 320..1920 px, tab reachability, labelled keys, dialog trap/Escape/focus restore.');
} finally {
  await browser.close();
}
