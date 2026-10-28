/**
 * Cross-workspace responsive and keyboard-only UAT in real Chromium.
 * Complements the existing Settings/virtual-piano responsive smoke by
 * checking course navigation, tonality selection and practice cards.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});
const sizes = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 768, height: 720 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 }
];
const errors = [];

try {
  for (const viewport of sizes) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', e => errors.push(viewport.width + ': ' + e.message));
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      const nav = page.getByRole('navigation', { name: 'Рабочие пространства' });
      const assertPageWidth = async workspace => {
        const dimensions = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          windowWidth: document.documentElement.clientWidth
        }));
        assert.ok(dimensions.documentWidth <= dimensions.windowWidth + 1,
          `${viewport.width}px ${workspace}: document overflows ${JSON.stringify(dimensions)}`);
        assert.ok(dimensions.bodyWidth <= dimensions.windowWidth + 1,
          `${viewport.width}px ${workspace}: body overflows ${JSON.stringify(dimensions)}`);
      };

      // Course initially loads. All lessons and the full selected-lesson
      // panel must be reachable in normal scrolling order on phones.
      await assertPageWidth('course');
      const lessonEight = page.getByTestId('course-lesson-8');
      assert.equal(await page.locator('[data-testid^="course-lesson-"]').count(), 12);
      await lessonEight.focus();
      await page.keyboard.press('Enter');
      assert.equal(await lessonEight.getAttribute('aria-current'), 'true');
      assert.match(await page.locator('h2').first().innerText(), /Урок 8/);
      await lessonEight.focus();
      await page.keyboard.press('Space');
      assert.equal(await lessonEight.getAttribute('aria-current'), 'true');
      const start = page.getByRole('button', { name: /Запустить этот урок в тренажёре/ });
      assert.ok(await start.count() > 0);
      if (viewport.width < 1024) {
        assert.ok(await page.locator('main').evaluate(el => el.scrollHeight > el.clientHeight),
          'mobile course must have a reachable main scroll for all lessons and details');
        await start.scrollIntoViewIfNeeded();
        assert.ok(await start.isVisible());
      }

      // Tonality cards should be keyboard focusable and launch the selected
      // pitch in the trainer, not silently ignore Enter/Space.
      await nav.getByRole('button', { name: /Доигровой анализ/ }).click();
      await assertPageWidth('precheck');
      const tone = page.getByTestId('precheck-tonality-F');
      await tone.focus();
      await page.keyboard.press('Enter');
      assert.equal(await nav.getByRole('button', { name: /Тренажёр-Студия/ })
        .getAttribute('aria-current'), 'page');
      assert.equal(await page.locator('select').filter({
        has: page.locator('option[value="F"]')
      }).inputValue(), 'F');

      // Hanon and rhythm options must use native buttons, and activating
      // a Hanon card should load its exact preset.
      await nav.getByRole('button', { name: /Лаборатория/ }).click();
      await assertPageWidth('lab');
      assert.equal(await page.locator('[data-testid^="lab-hanon-"]').count(), 4);
      assert.equal(await page.locator('[data-testid^="lab-rhythm-"]').count(), 4);
      const rhythm = page.getByTestId('lab-rhythm-ta');
      await rhythm.focus();
      await page.keyboard.press('Space');
      assert.equal(await nav.getByRole('button', { name: /Лаборатория/ })
        .getAttribute('aria-current'), 'page', 'rhythm audio preview must not navigate');
      const hanon = page.getByTestId('lab-hanon-groups4');
      await hanon.focus();
      await page.keyboard.press('Enter');
      assert.equal(await nav.getByRole('button', { name: /Тренажёр-Студия/ })
        .getAttribute('aria-current'), 'page');
      assert.ok(await page.getByRole('button', { name: /8\. Ганон/ }).count() > 0);

      // Library still scrolls and has no document-level horizontal overflow.
      await nav.getByRole('button', { name: /Библиотека/ }).click();
      await assertPageWidth('library');
      assert.ok(await page.getByText(/Каталог пособий/).count() > 0);
      if (viewport.width <= 375) {
        const library = page.locator('main section');
        assert.ok(await library.evaluate(el => el.scrollHeight > el.clientHeight ||
          el.parentElement.scrollHeight > el.parentElement.clientHeight),
          'library text must remain vertically reachable on a small screen');
      }

      // Trainer must remain usable when navigating back after any of these.
      await nav.getByRole('button', { name: /Тренажёр-Студия/ }).click();
      await assertPageWidth('trainer');
      assert.equal(await page.getByRole('region', { name: 'Прокручиваемая клавиатура фортепиано' }).count(), 1);
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no uncaught Chrome errors during five-workspace navigation');
  console.log('Five-workspace responsive UAT passed: 320/375/768/1024/1440 widths, course/tonality/Hanon/rhythm keyboard controls.');
} finally {
  await browser.close();
}
