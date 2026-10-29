import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const errors = [];
try {
  for (const midiConnected of [true, false]) {
    const width = midiConnected ? 320 : 1440;
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    page.on('pageerror', error => errors.push(error.message));
    if (midiConnected) {
      await page.addInitScript(() => {
        const input = { id: 'compact-toolbar-midi', state: 'connected', onmidimessage: null };
        Object.defineProperty(navigator, 'requestMIDIAccess', {
          configurable: true,
          value: async () => ({
            inputs: new Map([[input.id, input]]), onstatechange: null
          })
        });
      });
    }
    try {
      // Verify the explicit normal-view option while inspecting the toolbar.
      await page.addInitScript(() => localStorage.setItem('notare-trainer-preferences-v1',
        JSON.stringify({ version: 2, preferences: { zenModeEnabled: false } })));
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^Студия$/ }).click();
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 35000 });
      const toolbar = page.getByTestId('trainer-toolbar');
      assert.ok(await toolbar.isVisible());
      const groups = ['mode', 'material', 'rhythm', 'view'];
      for (const group of groups) {
        await page.getByTestId('toolbar-trigger-' + group).click();
        assert.ok(await page.getByTestId('toolbar-panel-' + group).isVisible());
        for (const other of groups.filter(key => key !== group)) {
          assert.equal(await page.getByTestId('toolbar-panel-' + other).count(), 0);
        }
      }

      // Escape closes the disclosure and returns focus to its trigger.
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-testid^="toolbar-panel-"]').count(), 0);
      assert.equal(await page.getByTestId('toolbar-trigger-view').evaluate(node =>
        document.activeElement === node), true);

      await page.getByTestId('toolbar-trigger-mode').click();
      assert.equal(await toolbar.getByRole('button', { name: /8\. Ганон/ }).count(), 1);
      await toolbar.getByRole('button', { name: /8\. Ганон/ }).click();
      await page.getByTestId('toolbar-trigger-material').click();
      const material = page.getByTestId('toolbar-panel-material');
      await material.getByRole('button', { name: /Черни · блоки по 4 ноты/ }).click();
      assert.ok((await material.getByRole('button', { name: /Черни · блоки по 4 ноты/ })
        .getAttribute('aria-pressed')) === 'true');
      const picker = material.getByRole('combobox', { name: 'Тональность' });
      await picker.selectOption('F');
      assert.equal(await picker.inputValue(), 'F');
      await material.getByRole('button', { name: /16 нот/ }).click();
      assert.equal(await material.getByRole('button', { name: /8 нот/ }).count(), 1);

      await page.getByTestId('toolbar-trigger-mode').click();
      await page.getByRole('button', { name: /4\. Фото-память/ }).click();
      await page.getByTestId('toolbar-trigger-view').click();
      const view = page.getByTestId('toolbar-panel-view');
      assert.ok(await view.getByRole('combobox', { name: 'Экспозиция фото-памяти' }).isVisible());
      await view.getByRole('combobox', { name: 'Экспозиция фото-памяти' }).selectOption('1100');
      await view.getByRole('combobox', { name: 'Подписи виртуальных клавиш' }).selectOption('auto');

      // Auto labels: actual note names with MIDI, PC legends otherwise.
      const firstKey = page.getByRole('button', { name: 'Клавиша C3' });
      const expected = midiConnected ? 'C3' : 'z';
      assert.equal((await firstKey.locator('span[aria-hidden="true"]').first().innerText()).trim().toLowerCase(),
        expected.toLowerCase());
      await view.getByRole('combobox', { name: 'Подписи виртуальных клавиш' }).selectOption('off');
      assert.equal(await firstKey.locator('span[aria-hidden="true"]').count(), 0);
      await view.getByRole('combobox', { name: 'Подписи виртуальных клавиш' }).selectOption('notes');
      assert.equal((await firstKey.locator('span[aria-hidden="true"]').first().innerText()).trim(), 'C3');

      await view.getByRole('button', { name: 'Скрыть клавиатуру' }).click();
      assert.equal(await page.getByRole('region', { name: 'Прокручиваемая клавиатура фортепиано' }).count(), 0);
      // Hidden virtual keys must not unmount keyboard shortcut subscriptions.
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      await page.keyboard.press('z');
      assert.equal((await page.getByTestId('last-played-note').innerText()).trim(), 'C3');
      await view.getByRole('button', { name: 'Показать клавиатуру' }).click();
      assert.ok(await firstKey.isVisible());

      await page.getByTestId('toolbar-trigger-actions').click();
      const actions = page.getByTestId('toolbar-panel-actions');
      assert.ok(await actions.getByRole('button', { name: /Петь/ }).count() > 0);
      const downloadPromise = page.waitForEvent('download');
      await actions.getByRole('button', { name: 'MusicXML' }).click();
      const download = await downloadPromise;
      assert.match(download.suggestedFilename(), /\.musicxml$/);

      // Stop returns to ungraded setup; explicit start returns to playing.
      await page.getByTestId('trainer-start-stop').click();
      assert.ok(await page.getByTestId('trainer-setup').isVisible());
      await page.getByTestId('trainer-start-stop').click();
      await page.getByTestId('osmd-score').waitFor({ state: 'visible' });
      await page.getByTestId('toolbar-trigger-view').click();
      assert.equal(await page.getByRole('combobox', { name: 'Подписи виртуальных клавиш' }).inputValue(),
        'notes');

      const dimensions = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth
      }));
      assert.ok(dimensions.scroll <= dimensions.client + 1,
        `toolbar must not overflow at ${width}px: ${JSON.stringify(dimensions)}`);
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no uncaught Chrome exceptions');
  console.log('Compact toolbar smoke passed: 4 groups, keyboard labels, MusicXML, 320/1440px.');
} finally {
  await browser.close();
}
