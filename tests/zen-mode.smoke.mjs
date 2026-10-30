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
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 45000 });
      assert.equal(await page.getByTestId('toolbar-zen-toggle').getAttribute('aria-pressed'), 'false',
        'Zen must be opt-in so existing workflows are not disrupted');
      const normalScoreHeight = (await score.boundingBox())?.height ?? 0;
      assert.ok(normalScoreHeight > 0);

      await page.getByTestId('toolbar-zen-toggle').click();
      const strip = page.getByTestId('zen-control-strip');
      await strip.waitFor({ state: 'visible' });
      assert.equal(await page.locator('header').count(), 0, 'global header should be absent while focused');
      assert.equal(await fullBar.count(), 0, 'regular toolbar should be absent while focused');
      assert.equal(await page.getByTestId('studio-workspace').getAttribute('data-zen-active'), 'true');
      assert.equal(await page.getByTestId('zen-exit').evaluate(node => node === document.activeElement),
        true, 'Zen focus starts at an obvious exit action');
      assert.match(await strip.getByTestId('zen-progress').innerText(), /1 \/ 16/);
      assert.match(await strip.getByTestId('zen-tempo').innerText(), /60 BPM/);
      const metronome = strip.getByTestId('metronome-toggle');
      assert.equal(await metronome.getAttribute('aria-pressed'), 'false');
      await metronome.click();
      assert.equal(await metronome.getAttribute('aria-pressed'), 'true');
      assert.ok(await strip.isVisible());
      await metronome.click();
      assert.equal(await metronome.getAttribute('aria-pressed'), 'false');
      assert.ok(await build.isVisible(), 'build identity is still visible while focused');
      assert.ok((await build.innerText()).includes('v3.0.0'));
      const dims = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        footer: document.querySelector('[data-testid="status-bar"]').getBoundingClientRect().bottom,
        viewportHeight: innerHeight,
        buildRight: document.querySelector('[data-testid="build-version"]').getBoundingClientRect().right
      }));
      assert.ok(dims.scroll <= dims.client + 1, `no horizontal page overflow at ${width}px`);
      assert.ok(Math.abs(dims.footer - dims.viewportHeight) <= 2, 'status remains at viewport bottom');
      assert.ok(dims.buildRight <= dims.client + 1, 'build ID must fit at all viewport sizes');
      const zenScoreHeight = (await score.boundingBox())?.height ?? 0;
      assert.ok(zenScoreHeight >= 250, 'Zen must preserve a usable score area');
      if (width >= 768) {
        assert.ok(zenScoreHeight > normalScoreHeight + 35,
          `Zen should allocate more score space (${width}px: ${normalScoreHeight} -> ${zenScoreHeight})`);
      }

      const accuracy = status.getByTitle('Точность попаданий в текущей сессии');
      const attempts = async () => Number(/\((\d+)\)/.exec(await accuracy.innerText())?.[1] ?? '-1');
      const before = await attempts();
      await page.evaluate(() => window.__zenMidi.send([0x90, 60, 110]));
      await page.waitForFunction(previous => {
        const el = document.querySelector('[title="Точность попаданий в текущей сессии"]');
        return Number(/\((\d+)\)/.exec(el?.textContent ?? '')?.[1] ?? '-1') === previous + 1;
      }, before, { timeout: 3000 });
      assert.ok(await strip.isVisible(), 'MIDI must not exit Zen or stop the practice');
      await page.evaluate(() => window.__zenMidi.send([0x80, 60, 0]));

      // The Settings drawer is above Zen; Escape must dismiss it before
      // Escape can leave Zen. No timing or grading state changes by itself.
      await strip.getByRole('button', { name: 'Открыть настройки' }).click();
      await page.getByRole('dialog').waitFor({ state: 'visible' });
      assert.equal(await status.evaluate(node => node.inert), true);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.ok(await strip.isVisible(), 'the first Escape only closes Settings');
      assert.equal(await status.evaluate(node => node.inert), false);
      await page.keyboard.press('Escape');
      await fullBar.waitFor({ state: 'visible' });
      assert.equal(await page.getByTestId('toolbar-zen-toggle').getAttribute('aria-pressed'), 'false');
      // Exiting Zen focuses the re-mounted toolbar button on the next
      // requestAnimationFrame. Assert the final focus state, not a race with
      // the synchronous React visibility update.
      await page.waitForFunction(() =>
        document.activeElement === document.querySelector('[data-testid="toolbar-zen-toggle"]'),
      null, { timeout: 3000 });

      // Focus remains a persisted presentation preference; it is not a
      // grading or timer setting, and Setup should always show the toolbar.
      await page.getByTestId('toolbar-zen-toggle').click();
      await strip.waitFor();
      await strip.getByTestId('zen-stop').click();
      await page.getByTestId('trainer-setup').waitFor({ state: 'visible' });
      assert.ok(await fullBar.isVisible());
      assert.equal(await page.getByTestId('toolbar-zen-toggle').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByTestId('zen-control-strip').count(), 0,
        'setup should not be in Zen even when preference stays enabled');
      await page.getByTestId('trainer-start-stop').click();
      await strip.waitFor({ state: 'visible' });

      // With Photo active, never expose masked pitch text; retain flash.
      await strip.getByTestId('zen-exit').click();
      await page.getByTestId('toolbar-trigger-mode').click();
      await page.getByRole('button', { name: /4\. Фото-память/ }).click();
      await page.getByTestId('toolbar-zen-toggle').click();
      await page.getByTestId('photo-masked-notice').waitFor({ state: 'visible', timeout: 11000 });
      assert.match(await page.getByTestId('zen-coaching').innerText(), /по памяти/i);
      assert.ok(await page.getByRole('button', { name: 'Вспышка такта' }).isVisible());
      assert.equal(await page.getByTestId('active-target-note').count(), 0,
        'focus mode must not leak photo target pitch in an auxiliary info bar');
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('Zen responsive Chrome acceptance passed: 320/375/768/1440/1920, MIDI, Escape, Settings, photo safety.');
} finally {
  await browser.close();
}
