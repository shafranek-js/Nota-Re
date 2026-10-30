import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});
const errors = [];
try {
  for (const width of [320, 375, 768, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: width <= 375 ? 720 : 920 } });
    page.on('pageerror', error => errors.push(`${width}: ${error.message}`));
    await page.addInitScript(() => {
      const input = { id: 'zen-midi-test', state: 'connected', onmidimessage: null };
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        configurable: true, value: async () => ({
          inputs: new Map([[input.id, input]]), onstatechange: null
        })
      });
      window.__zenMidi = {
        send(bytes) {
          if (!input.onmidimessage) throw Error('No MIDI listener');
          input.onmidimessage({ data: Uint8Array.from(bytes) });
        }
      };
    });
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: /^Студия$/ }).click();

      const score = page.getByTestId('studio-score-area');
      const status = page.getByTestId('status-bar');
      const build = status.getByTestId('build-version');
      const fullBar = page.getByTestId('trainer-toolbar');
      const strip = page.getByTestId('zen-control-strip');
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 45000 });

      // Legacy Studio initial playing preview must NEVER enter Zen merely by
      // navigation; first require explicit user Start.
      assert.equal(await strip.count(), 0);
      assert.ok(await fullBar.isVisible());
      assert.equal(await page.getByTestId('toolbar-zen-toggle').count(), 0);
      await page.getByTestId('toolbar-trigger-view').click();
      const auto = page.getByTestId('auto-zen-setting');
      assert.equal(await auto.isChecked(), true, 'auto-focus is enabled by default');
      await page.getByTestId('toolbar-trigger-view').click();
      const normalScoreHeight = (await score.boundingBox())?.height ?? 0;

      await page.getByTestId('trainer-start-stop').click();
      await page.getByTestId('trainer-setup').waitFor({ state: 'visible' });
      assert.equal(await strip.count(), 0, 'Setup always remains unfocused');
      await page.getByTestId('trainer-start-stop').click();
      await strip.waitFor({ state: 'visible' });
      assert.equal(await page.locator('header').count(), 0);
      assert.equal(await fullBar.count(), 0);
      assert.equal(await page.getByTestId('studio-workspace').getAttribute('data-zen-active'), 'true');
      assert.equal(await strip.getByTestId('zen-exit').evaluate(node => node === document.activeElement), true);
      assert.match(await strip.getByTestId('zen-tempo').innerText(), /60 BPM/);
      const metronome = strip.getByTestId('metronome-toggle');
      assert.equal(await metronome.getAttribute('aria-pressed'), 'false');
      await metronome.click();
      assert.equal(await metronome.getAttribute('aria-pressed'), 'true');
      assert.ok(await strip.isVisible());
      await metronome.click();
      assert.equal(await metronome.getAttribute('aria-pressed'), 'false');
      assert.ok(await build.isVisible());
      const dimensions = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        footer: document.querySelector('[data-testid="status-bar"]').getBoundingClientRect().bottom,
        height: innerHeight
      }));
      assert.ok(dimensions.scroll <= dimensions.client + 1, `no overflow at ${width}`);
      assert.ok(Math.abs(dimensions.footer - dimensions.height) <= 2);
      const zenScoreHeight = (await score.boundingBox())?.height ?? 0;
      if (width >= 768) {
        assert.ok(zenScoreHeight > normalScoreHeight + 35,
          `Zen should reclaim actual score space at ${width}px`);
      }

      // Physical MIDI events remain live in auto-Zen.
      const accuracy = status.getByTitle('Точность попаданий в текущей сессии');
      const attempts = async () => Number(/\((\d+)\)/.exec(await accuracy.innerText())?.[1] ?? '-1');
      const before = await attempts();
      await page.evaluate(() => window.__zenMidi.send([0x90, 60, 110]));
      await page.waitForFunction(previous => {
        const el = document.querySelector('[title="Точность попаданий в текущей сессии"]');
        return Number(/\((\d+)\)/.exec(el?.textContent ?? '')?.[1] ?? '-1') === previous + 1;
      }, before, { timeout: 3000 });
      await page.evaluate(() => window.__zenMidi.send([0x80, 60, 0]));

      // Settings first, Zen second; Escape does not stop or score anything.
      await strip.getByRole('button', { name: 'Открыть настройки' }).click();
      await page.getByRole('dialog').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.ok(await strip.isVisible(), 'first Escape closes Settings');
      const during = await attempts();
      await page.keyboard.press('Escape');
      await fullBar.waitFor({ state: 'visible' });
      assert.equal(await attempts(), during, 'visual dismissal does not change score');
      await page.waitForFunction(() =>
        document.activeElement === document.querySelector('[data-testid="toolbar-trigger-view"]'),
      null, { timeout: 3000 });
      await page.getByTestId('toolbar-trigger-view').click();
      assert.equal(await page.getByTestId('auto-zen-setting').isChecked(), true,
        'Esc must not disable the persisted automatic preference');
      await page.getByTestId('toolbar-trigger-view').click();

      // Next Start enters Zen again; Stop returns to full setup.
      await page.getByTestId('trainer-start-stop').click();
      await page.getByTestId('trainer-start-stop').click();
      await strip.waitFor({ state: 'visible' });
      await strip.getByTestId('zen-stop').click();
      await page.getByTestId('trainer-setup').waitFor({ state: 'visible' });
      assert.ok(await fullBar.isVisible());
      assert.equal(await strip.count(), 0);

      // Opting out is saved and leaves normal Studio on every future Start.
      await page.getByTestId('toolbar-trigger-view').click();
      await page.getByTestId('auto-zen-setting').uncheck();
      await page.getByTestId('toolbar-trigger-view').click();
      await page.getByTestId('trainer-start-stop').click();
      assert.ok(await fullBar.isVisible());
      assert.equal(await strip.count(), 0);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: /^Студия$/ }).click();
      await page.getByTestId('toolbar-trigger-view').click();
      assert.equal(await page.getByTestId('auto-zen-setting').isChecked(), false,
        'user opt-out must persist across reloads');

      // Photo-masking remains intact with a later explicitly started Zen.
      await page.getByTestId('auto-zen-setting').check();
      await page.getByTestId('toolbar-trigger-view').click();
      await page.getByTestId('trainer-start-stop').click();
      await page.getByTestId('toolbar-trigger-mode').click();
      await page.getByRole('button', { name: /4\. Фото-память/ }).click();
      await page.getByTestId('trainer-start-stop').click();
      await strip.waitFor({ state: 'visible' });
      await page.getByTestId('photo-masked-notice').waitFor({ state: 'visible', timeout: 11000 });
      assert.match(await page.getByTestId('zen-coaching').innerText(), /по памяти/i);
      assert.ok(await page.getByRole('button', { name: 'Вспышка такта' }).isVisible());
      assert.equal(await page.getByTestId('active-target-note').count(), 0);
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no unexpected browser errors');
  console.log('Auto-Zen passed: 5 widths, explicit start, opt-out, persistence, Escape, Settings, MIDI and Photo.');
} finally {
  await browser.close();
}
