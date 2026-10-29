/**
 * Visual-review artifact matrix, not a claim of subjective visual acceptance.
 * Capture real OSMD/Classic UI and report physical SVG notehead dimensions.
 * A larger score container alone is NOT evidence of readable notes.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});

const artifacts = 'artifacts';
await mkdir(artifacts, { recursive: true });
const metrics = [];
const errors = [];
const sizes = [320, 375, 768, 1024, 1440, 1920];
const modes = [
  ['reflex', /1\. Рефлекс/],
  ['rhythm', /2\. Ритмослоги/],
  ['lookahead', /3\. Бегунок/],
  ['photo', /4\. Фото-память/],
  ['intervals', /5\. Интервалы/],
  ['gpattern', /6\. Буква «Г»/],
  ['blind', /7\. Вслепую/],
  ['hanon', /8\. Ганон/]
];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Рабочие пространства' })
    .getByRole('button', { name: 'Студия' }).click();

  const ready = async () => {
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-testid="osmd-score"]');
      return !!node && Number(node.getAttribute('data-osmd-render-epoch')) > 0 &&
        !!node.querySelector('[aria-label="Нотная партитура OpenSheetMusicDisplay"] svg');
    }, null, { timeout: 35000 });
  };
  const checkWidth = async context => {
    const x = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
      buildRight: document.querySelector('[data-testid="build-version"]')?.getBoundingClientRect().right,
      footerBottom: document.querySelector('[data-testid="status-bar"]')?.getBoundingClientRect().bottom,
      height: window.innerHeight
    }));
    assert.ok(x.page <= x.client + 1, `${context}: no page-wide horizontal overflow ${JSON.stringify(x)}`);
    assert.ok(x.buildRight <= x.client + 1 && Math.abs(x.footerBottom - x.height) <= 2,
      `${context}: footer/build stays visible`);
    return x;
  };
  const osmdGeometry = () => page.evaluate(() => {
    const host = document.querySelector('[aria-label="Нотная партитура OpenSheetMusicDisplay"]');
    const heads = [...host.querySelectorAll('.vf-notehead, [class*="notehead"]')]
      .filter(el => !el.closest('[data-notare-interval-overlay],[data-notare-hanon-block]'))
      .map(el => el.getBoundingClientRect())
      .filter(r => Number.isFinite(r.width) && r.width >= 2 && r.height >= 2);
    const score = document.querySelector('[data-testid="studio-score-area"]');
    const view = document.querySelector('[data-testid="osmd-score"] .overflow-auto');
    const values = heads.map(x => x.width).sort((a, b) => a - b);
    return {
      noteheadCount: values.length,
      medianHeadWidthPx: values.length ? Math.round(values[Math.floor(values.length / 2)] * 10) / 10 : 0,
      minimumHeadWidthPx: values.length ? Math.round(values[0] * 10) / 10 : 0,
      scoreAreaHeightPx: Math.round(score.getBoundingClientRect().height),
      scoreViewportHeightPx: Math.round(view.getBoundingClientRect().height),
      hasHorizontalScoreScroll: view.scrollWidth > view.clientWidth + 1,
      hasVerticalScoreScroll: view.scrollHeight > view.clientHeight + 1
    };
  });

  for (const width of sizes) {
    await page.setViewportSize({ width, height: width <= 375 ? 720 : 900 });
    await ready();
    await checkWidth(`OSMD ${width}`);
    const normal = await osmdGeometry();
    assert.ok(normal.noteheadCount > 0, `OSMD ${width}: actual rendered noteheads required`);
    assert.ok(normal.medianHeadWidthPx >= 3, `OSMD ${width}: no microscopic noteheads`);
    await page.screenshot({ path: `${artifacts}/stage-f-osmd-${width}.png` });
    await page.getByTestId('toolbar-zen-toggle').click();
    await page.getByTestId('zen-control-strip').waitFor({ state: 'visible' });
    await checkWidth(`Zen ${width}`);
    const zen = await osmdGeometry();
    assert.ok(zen.noteheadCount > 0, `Zen ${width}: notes must not disappear`);
    if (width >= 768) {
      assert.ok(zen.scoreAreaHeightPx > normal.scoreAreaHeightPx + 30,
        `Zen ${width}: reclaimed vertical space expected`);
    }
    await page.screenshot({ path: `${artifacts}/stage-f-zen-${width}.png` });
    await page.getByTestId('zen-exit').click();
    await page.getByRole('button', { name: 'Классический' }).click();
    const classic = page.locator('#staff-notes-layer');
    await classic.waitFor({ state: 'visible' });
    await checkWidth(`Classic ${width}`);
    assert.ok(await classic.locator('g').count() >= 8, `Classic ${width}: notes visible`);
    await page.screenshot({ path: `${artifacts}/stage-f-classic-${width}.png` });
    metrics.push({ width, osmd: normal, zen });
    await page.getByRole('button', { name: 'OSMD', exact: true }).click();
    await ready();
  }

  // Check each teaching mode at a consistent desktop width. These screenshots
  // are inspectable evidence, not auto-approved legibility or hardware latency.
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [mode, selector] of modes) {
    await page.getByTestId('toolbar-trigger-mode').click();
    await page.getByRole('button', { name: selector }).click();
    await ready();
    assert.equal(await page.getByText('Ошибка нотного движка:', { exact: false }).count(), 0,
      `${mode}: no OSMD engraving failure`);
    await page.screenshot({ path: `${artifacts}/stage-f-mode-${mode}.png` });
  }
  await writeFile(`${artifacts}/stage-f-stave-metrics.json`,
    JSON.stringify({ note: 'Automated geometry only. Physical visual assessment remains open.', metrics }, null, 2));
  assert.deepEqual(errors, [], 'no browser page errors');
  console.log('Stage F visual matrix passed: 6 breakpoints, OSMD/Classic/Zen, 8 modes; metrics and screenshots saved.');
} finally {
  await browser.close();
}
