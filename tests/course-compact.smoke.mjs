import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const errors = [];
await mkdir('artifacts', { recursive: true });

try {
  for (const viewport of [
    { width: 320, height: 568 }, { width: 375, height: 667 },
    { width: 1024, height: 768 }, { width: 1440, height: 900 }
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', error => errors.push(`${viewport.width}: ${error.message}`));
    await page.addInitScript(() => {
      localStorage.setItem('notare_course_completed_v3', '[1,2]');
    });
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      const toolbar = page.getByTestId('course-toolbar');
      const tabs = page.getByRole('navigation', { name: 'Модули курса' });
      const launch = page.getByTestId('course-launch-selected');
      const list = page.getByTestId('course-lesson-list');
      assert.equal(await tabs.getByRole('button').count(), 5);
      assert.match(await page.getByTestId('course-module-all').innerText(), /2\/12/);
      assert.match(await page.getByTestId('course-module-I').innerText(), /2\/3/);
      assert.equal(await page.locator('[data-testid^="course-lesson-"]').count(), 12);
      assert.equal(await page.getByText('Общий прогресс курса:').count(), 0,
        'old redundant course progress panel has been removed');
      assert.match(await page.getByTestId('course-continue').innerText(), /Продолжить: Модуль I, Урок 3/);
      const geometry = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        toolbarHeight: document.querySelector('[data-testid="course-toolbar"]').getBoundingClientRect().height,
        visibleLessons: (() => {
          const area = document.querySelector('[data-testid="course-lesson-list"]').getBoundingClientRect();
          return [...document.querySelectorAll('[data-testid^="course-lesson-"]')]
            .filter(el => el.getBoundingClientRect().bottom <= area.bottom + 1).length;
        })()
      }));
      assert.ok(geometry.document <= geometry.viewport + 1,
        `${viewport.width}px document must never overflow: ${JSON.stringify(geometry)}`);
      if (viewport.width >= 1024) {
        assert.ok(geometry.toolbarHeight <= 84,
          `${viewport.width}px course toolbar must be one row, actual ${geometry.toolbarHeight}px`);
      }
      if (viewport.width === 1440) {
        assert.ok(geometry.visibleLessons >= 11,
          `most of the 12 lesson cards must fit on a laptop: ${JSON.stringify(geometry)}`);
      }

      const about = page.getByTestId('course-methodology');
      await about.locator('summary').click();
      assert.equal(await about.getAttribute('open'), '');
      assert.match(await about.getByRole('note').innerText(), /Ф\. Брянская/);
      await about.locator('summary').click();
      assert.equal(await about.getAttribute('open'), null);
      await page.getByTestId('course-lesson-3').click();
      assert.match(await page.getByTestId('course-selected-header').innerText(), /Урок 3/);
      assert.match(await launch.innerText(), /Запустить урок 3/);
      assert.match(await page.getByTestId('course-continue').innerText(), /Урок 3/);

      // Filter the list AND align the selected detail to a visible lesson.
      await page.getByTestId('course-module-II').click();
      assert.equal(await page.getByTestId('course-module-II').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-testid^="course-lesson-"]').count(), 3);
      assert.equal(await page.getByTestId('course-lesson-4').getAttribute('aria-current'), 'true');
      assert.match(await launch.innerText(), /Запустить урок 4/);
      await page.getByRole('button', { name: /Вперёд/ }).click();
      assert.equal(await page.getByTestId('course-lesson-5').getAttribute('aria-current'), 'true');
      await page.getByTestId('course-module-IV').click();
      assert.equal(await page.locator('[data-testid^="course-lesson-"]').count(), 3);
      assert.equal(await page.getByTestId('course-lesson-10').getAttribute('aria-current'), 'true');
      await page.getByTestId('course-module-all').click();
      assert.equal(await page.locator('[data-testid^="course-lesson-"]').count(), 12);
      await page.getByTestId('course-lesson-3').click();

      if (viewport.width >= 1024) {
        // The details scroll independently. The launch button must remain
        // above it, not move behind the bottom of a long lesson.
        await page.getByTestId('course-detail-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
        const rect = await launch.boundingBox();
        const card = await page.getByTestId('course-lesson-panel').boundingBox();
        assert.ok(rect && card && rect.y >= card.y && rect.y + rect.height <= card.y + card.height,
          'start stays inside the selected card when its contents scroll');
      }
      await page.screenshot({ path: `artifacts/course-compact-${viewport.width}.png`, fullPage: false });
      await launch.scrollIntoViewIfNeeded();
      await launch.click();
      await page.getByTestId('course-credit-mode').waitFor({ state: 'visible', timeout: 15000 });
      assert.equal(await page.getByTestId('course-credit-mode').innerText(), 'Зачётная попытка');
      assert.equal(await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: 'Студия' }).getAttribute('aria-current'), 'page');
      // Existing uncompleted-lesson continuation does not silently certify
      // independently browsed lessons; the second CTA is an explicit action.
      await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: 'Курс' }).click();
      assert.match(await page.getByTestId('course-continue').innerText(), /Урок 3/);
      await page.getByTestId('course-lesson-8').click();
      assert.match(await page.getByTestId('course-continue').innerText(), /Урок 3/);
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log('Course compact acceptance passed: 320/375/1024/1440, filter, selected launch, certified continuation and readable layout.');
} finally {
  await browser.close();
}
