import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const errors = [];
const key = 'notare_module_v_inversions_v2';
try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    const before = await page.evaluate(() => Object.fromEntries(
      Object.entries(localStorage).filter(([name]) => /course|completion|lesson|certificate|shadow|module_v_practice_v1/i.test(name))
    ));
    await page.getByTestId('course-module-V').click();
    await page.getByTestId('module-v-open-v2').click();
    await page.getByTestId('module-v-v2-practice').waitFor({ state: 'visible' });
    await page.getByTestId('module-v-v2-score').locator('svg').first()
      .waitFor({ state: 'visible', timeout: 45000 });

    assert.equal(await page.getByTestId('module-v-v2-feedback').count(), 0);
    assert.equal(await page.getByTestId('module-v-v2-method-content').count(), 0);
    assert.equal(await page.getByTestId('module-v-v2-reveal').count(), 1);
    await page.getByTestId('module-v-v2-independent').click();
    await page.getByTestId('module-v-v2-score').locator('svg').first()
      .waitFor({ state: 'visible', timeout: 45000 });
    assert.equal(await page.getByTestId('module-v-v2-reveal').count(), 0);
    assert.equal(await page.getByTestId('module-v-v2-method').count(), 0);
    assert.equal(await page.getByTestId('module-v-v2-feedback').count(), 0);

    const preanswer = await page.getByTestId('module-v-v2-practice').innerText();
    assert.doesNotMatch(preanswer, /Правильный ответ:|Бас:|В басу (основной тон|терция|квинта)/);
    const accessibility = await page.getByTestId('module-v-v2-score').getAttribute('aria-label');
    assert.doesNotMatch(accessibility, /5\/3|6\/4|Первое обращение|Второе обращение|правильный/i);
    const svg = await page.getByTestId('module-v-v2-score').locator('svg').first().evaluate(node => node.outerHTML);
    assert.doesNotMatch(svg, /Первое обращение|Второе обращение|Основной вид|6\/4|5\/3/);

    const metrics = await page.evaluate(() => ({
      screenWidth: innerWidth, docWidth: document.documentElement.scrollWidth,
      options: document.querySelectorAll('[data-testid="module-v-v2-options"] button').length
    }));
    assert.equal(metrics.options, 3);
    assert.ok(metrics.docWidth <= metrics.screenWidth + 4,
      'Module V must not cause horizontal page overflow at ' + width);

    await page.getByTestId('module-v-v2-answer-first').focus();
    await page.keyboard.press('Enter');
    const feedback = await page.getByTestId('module-v-v2-feedback').innerText();
    assert.match(feedback, /Правильный ответ:|Бас:/);
    assert.equal(await page.getByTestId('module-v-v2-options').locator('button:enabled').count(), 0);
    const state = await page.evaluate(k => ({
      v2: JSON.parse(localStorage.getItem(k)),
      legacy: Object.fromEntries(Object.entries(localStorage)
        .filter(([name]) => /course|completion|lesson|certificate|shadow|module_v_practice_v1/i.test(name)))
    }), key);
    assert.equal(state.v2.schemaVersion, 2);
    assert.equal(state.v2.attempts.length, 1);
    assert.equal(state.v2.attempts[0].mode, 'independent');
    assert.deepEqual(state.legacy, before, 'independent questions cannot change V1 or certified course');
    await page.getByTestId('module-v-v2-retry').click();
    assert.equal(await page.getByTestId('module-v-v2-feedback').count(), 0);
    await page.getByTestId('module-v-v2-next').click();
    assert.equal(await page.getByTestId('module-v-v2-feedback').count(), 0);
    await page.getByTestId('module-v-v2-guided').click();
    await page.getByTestId('module-v-v2-reveal').click();
    assert.match(await page.getByTestId('module-v-v2-feedback').innerText(), /Разбор с подсказкой/);
    await page.getByTestId('module-v-v2-answer-root').click();
    assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).attempts[1].usedHint, key), true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('course-module-V').click();
    await page.getByTestId('module-v-open-v2').click();
    assert.match(await page.getByTestId('module-v-v2-practice').innerText(), /Ответов в учебном журнале: 2/);
    await page.evaluate(k => localStorage.setItem(k, 'broken-json'), key);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('course-module-V').click();
    await page.getByTestId('module-v-open-v2').click();
    assert.match(await page.getByTestId('module-v-v2-practice').innerText(), /Ответов в учебном журнале: 0/);
    await page.close();
  }
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log('Module V V2: independent OSMD, no answer leaks, keyboard, hints, 375/1440 and storage isolation PASS');
} finally {
  await browser.close();
}
