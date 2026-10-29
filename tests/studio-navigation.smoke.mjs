import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});

const errors = [];
try {
  for (const width of [320, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 320 ? 720 : 920 } });
    page.on('pageerror', error => errors.push(`${width}: ${error.message}`));
    await page.addInitScript(() => {
      localStorage.setItem('notare_course_completed_v3', '[1,2]');
    });
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      const nav = page.getByRole('navigation', { name: 'Рабочие пространства' });
      assert.deepEqual(await nav.getByRole('button').allTextContents(),
        ['Курс', 'Студия', 'База знаний'],
        'no fourth or fifth top-level destination');
      const status = page.getByTestId('status-bar');
      const build = status.getByTestId('build-version');
      assert.ok(await build.isVisible());

      const resume = page.getByTestId('course-continue');
      assert.match(await resume.innerText(), /Продолжить: Модуль I, Урок 3/);
      await page.getByTestId('course-lesson-8').click();
      assert.match(await resume.innerText(), /Урок 3/,
        'opening lesson 8 should not change the certified progression');
      await resume.click();
      await page.getByTestId('zen-control-strip').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      // The lesson continues graded after the view-only dismissal.
      const sections = page.getByRole('navigation', { name: 'Разделы Студии' });
      assert.deepEqual(await sections.getByRole('button').allTextContents(),
        ['Практика', 'Подготовка', 'Лаборатория']);
      assert.equal(await nav.getByRole('button', { name: 'Студия' }).getAttribute('aria-current'), 'page');
      assert.match(await page.getByTestId('course-credit-mode').innerText(), /Зачётная попытка/);
      await page.getByRole('button', { name: 'Поток: ИДЁТ' }).waitFor();
      const attempts = async () => Number(/\((\d+)\)/.exec(
        await status.getByTitle('Точность попаданий в текущей сессии').innerText())?.[1] ?? '-1');

      // Leaving graded rhythmic play for the embedded Lab must cancel
      // background misses, clear formal course eligibility and keep audio
      // preview demonstrations available.
      await sections.getByRole('button', { name: 'Лаборатория' }).click();
      assert.equal(await sections.getByRole('button', { name: 'Лаборатория' }).getAttribute('aria-current'), 'page');
      assert.equal(await page.locator('[data-testid^="lab-hanon-"]').count(), 4);
      assert.equal(await page.locator('[data-testid^="lab-rhythm-"]').count(), 4);
      const count = await attempts();
      await page.getByTestId('lab-rhythm-ta').click();
      await page.waitForTimeout(1300);
      assert.equal(await attempts(), count, 'no hidden course scoring while viewing Studio Lab');
      assert.ok(await build.isVisible(), 'footer survives embedded lab');

      // Existing Preset cards load their exact generator settings, not a new
      // imitation of the already-tested Hanon machinery.
      await page.getByTestId('lab-hanon-groups4').click();
      assert.equal(await sections.getByRole('button', { name: 'Практика' }).getAttribute('aria-current'), 'page');
      await page.getByTestId('toolbar-trigger-mode').click();
      assert.equal(await page.getByRole('button', { name: /8\. Ганон/ }).getAttribute('aria-pressed'), 'true');
      await page.getByTestId('toolbar-trigger-material').click();
      assert.equal(await page.getByRole('button', { name: /Черни · блоки по 4 ноты/ })
        .getAttribute('aria-pressed'), 'true');

      // Hanon preset entered ungraded setup when returning from the Lab.
      // Explicit start is required before Zen becomes eligible.
      await page.getByTestId('trainer-start-stop').click();
      // Starting the exercise focuses notation automatically.
      await page.getByTestId('zen-control-strip').waitFor({ state: 'visible' });
      await page.getByTestId('zen-exit').click();
      await sections.getByRole('button', { name: 'Подготовка' }).click();
      assert.ok(await nav.isVisible());
      assert.equal(await page.getByTestId('zen-control-strip').count(), 0);
      assert.equal(await page.getByTestId('precheck-tonality-F').count(), 1);
      await page.getByTestId('precheck-tonality-F').click();
      await page.getByTestId('trainer-setup').waitFor({ state: 'visible' });
      await page.getByTestId('toolbar-trigger-material').click();
      assert.equal(await page.getByRole('combobox', { name: 'Тональность' }).inputValue(), 'F');

      await nav.getByRole('button', { name: 'База знаний' }).click();
      assert.ok(await page.getByText(/Каталог пособий/).count() > 0);
      assert.ok(await build.isVisible());
      await nav.getByRole('button', { name: 'Курс' }).click();
      assert.match(await page.getByTestId('course-continue').innerText(), /Урок 3/);

      const bounds = await page.evaluate(() => ({
        screen: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
        footerBottom: document.querySelector('[data-testid="status-bar"]').getBoundingClientRect().bottom,
        height: innerHeight
      }));
      assert.ok(bounds.page <= bounds.screen + 1, `no page-wide overflow at ${width}`);
      assert.ok(Math.abs(bounds.footerBottom - bounds.height) <= 2);
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no JS errors in three-destination journey');
  console.log('Three-destination Studio acceptance passed: continuation, lab, rhythm, Hanon, precheck, Zen and 320/768/1440.');
} finally {
  await browser.close();
}
