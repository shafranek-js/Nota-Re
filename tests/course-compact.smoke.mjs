import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});
await mkdir('artifacts', { recursive: true });
const errors = [];
try {
  for (const width of [320, 375, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width < 400 ? 720 : 900 } });
    page.on('pageerror', e => errors.push(`${width}: ${e.message}`));
    await page.addInitScript(() => {
      localStorage.setItem('notare_course_completed_v3', '[1,2]');
    });
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      const toolbar = page.getByTestId('course-toolbar');
      const resume = page.getByTestId('course-continue');
      const selectedStart = page.getByTestId('course-start-selected');
      assert.match(await resume.innerText(), /Продолжить: Модуль I, Урок 3/);
      const heroHeight = (await toolbar.boundingBox())?.height ?? 1000;
      assert.ok(heroHeight < (width < 400 ? 150 : 82),
        `compact course banner at ${width}px: ${heroHeight}px`);
      const info = page.getByTestId('course-methodology');
      await info.click();
      assert.match(await page.getByRole('note').innerText(), /Каждый урок настраивает тренажёр/);
      await info.click();

      const moduleFilter = page.getByRole('navigation', { name: 'Фильтр модулей курса' });
      assert.equal(await moduleFilter.getByRole('button').count(), 5);
      await page.getByTestId('course-filter-IV').click();
      assert.equal(await page.locator('button[data-testid^="course-lesson-"]').count(), 3);
      assert.equal(await page.getByTestId('course-lesson-10').getAttribute('aria-current'), 'true',
        'module filter selects first lesson in module if prior selection is outside it');
      assert.match(await selectedStart.innerText(), /урок 10/i);
      assert.match(await resume.innerText(), /Урок 3/,
        'filtering selected lesson must not override next incomplete certified lesson');
      await page.getByTestId('course-filter-all').click();
      assert.equal(await page.locator('button[data-testid^="course-lesson-"]').count(), 12);

      await page.getByTestId('course-lesson-3').click();
      assert.match(await selectedStart.innerText(), /урок 3/i);
      const bounds = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        footer: document.querySelector('[data-testid="status-bar"]').getBoundingClientRect().bottom,
        windowHeight: innerHeight,
        action: document.querySelector('[data-testid="course-start-selected"]').getBoundingClientRect(),
        header: document.querySelector('[data-testid="course-lesson-header"]').getBoundingClientRect()
      }));
      assert.ok(bounds.scroll <= bounds.width + 1, `no horizontal page overflow at ${width}px`);
      assert.ok(Math.abs(bounds.footer - bounds.windowHeight) <= 2);
      assert.ok(bounds.action.top < bounds.windowHeight - 40,
        `start selected lesson must be visible without scrolling at ${width}px`);
      if (width >= 1024) {
        assert.ok(bounds.header.top >= 45, 'lesson header is in a readable top position');
      }
      await page.screenshot({ path: `artifacts/course-compact-${width}.png` });
      await selectedStart.click();
      await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 30000 });
      assert.match(await page.getByTestId('course-credit-mode').innerText(), /Зачётная попытка/);
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no browser errors during course layout journey');
  console.log('Compact course UAT passed: module tabs, selected launch, independent continuation, responsive layout.');
} finally {
  await browser.close();
}
