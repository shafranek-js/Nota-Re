/**
 * Browser smoke test for the OSMD migration.
 * Run via the GitHub Actions workflow, which supplies Chrome + Playwright.
 * This tests real Vite/React/OSMD integration rather than only TypeScript.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    const input = { id: 'two-hand-smoke', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([['two-hand-smoke', input]]), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true, value: async () => access
    });
    window.__twoHandMidi = {
      input,
      send(bytes) {
        if (!input.onmidimessage) throw new Error('No MIDI handler');
        input.onmidimessage({ data: Uint8Array.from(bytes) });
      }
    };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Тренажёр-Студия/ }).click();

  const svg = page.locator('[aria-label="Нотная партитура OpenSheetMusicDisplay"] svg').first();
  await svg.waitFor({ state: 'visible', timeout: 45000 });
  assert.ok(await svg.locator('path, line, text').count() > 0, 'OSMD should engrave staff symbols');

  const renderError = page.getByText('Ошибка нотного движка:', { exact: false });
  assert.equal(await renderError.count(), 0, 'OSMD must not show an error on first load');
  // OSMD may clear and rebuild its SVG asynchronously after a resize.
  // Wait for a NEW completed engraving epoch plus a restored overlay, rather
  // than observing the old overlay just before it disappears.
  const epoch = async () => Number(await page.getByTestId('osmd-score').getAttribute('data-osmd-render-epoch'));
  const waitForOverlayRender = async (selector, previousEpoch) => {
    await page.waitForFunction(({ selector, previousEpoch }) => {
      const score = document.querySelector('[data-testid="osmd-score"]');
      return Number(score?.getAttribute('data-osmd-render-epoch')) > previousEpoch &&
        Boolean(score?.querySelector(selector));
    }, { selector, previousEpoch }, { timeout: 20000 });
  };

  const indexBefore = Number(await page.getByTestId('osmd-score').getAttribute('data-active-note-index'));

  // Explicitly enter ungraded tabletop mode to advance cursor in smoke
  // tests; regular Space no longer auto-enters a correct pitch.
  await page.getByRole('button', { name: /Режим «Стол»/ }).click();
  await page.getByRole('region', { name: 'Прокручиваемая клавиатура фортепиано' }).focus();
  await page.keyboard.press('Space');
  assert.ok(await svg.isVisible(), 'Notation must remain after note input');
  const indexAfter = Number(await page.getByTestId('osmd-score').getAttribute('data-active-note-index'));
  assert.equal(indexAfter, indexBefore + 1, 'exercise should advance exactly one step');

  await page.getByRole('button', { name: /2\. Ритмослоги/ }).click();
  await svg.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await renderError.count(), 0, 'OSMD rhythm mode must load');

  // Lookahead should mask only notes already played, on OSMD's own SVG.
  await page.getByRole('button', { name: /3\. Бегунок/ }).click();
  await svg.waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('region', { name: 'Прокручиваемая клавиатура фортепиано' }).focus();
  await page.keyboard.press('Space');
  await page.locator('[data-notare-masked="true"]').first().waitFor({ state: 'attached', timeout: 10000 });
  assert.ok(await page.getByTestId('osmd-score').isVisible(), 'lookahead must use OSMD');
  assert.equal(await page.locator('[data-notare-masked="true"]').first().evaluate(el => getComputedStyle(el).visibility),
    'hidden', 'the graphical note group must really be invisible');

  // Photo exercise must first reveal the score, then hide actual note SVGs
  // after the existing exposure timer. "Flash" must reveal them again.
  await page.getByRole('button', { name: /4\. Фото-память/ }).click();
  await svg.waitFor({ state: 'visible', timeout: 30000 });
  await page.getByTestId('photo-masked-notice').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-notare-masked="true"]').first().waitFor({ state: 'attached', timeout: 10000 });
  await page.getByRole('button', { name: 'Вспышка такта' }).click();
  await page.getByTestId('photo-masked-notice').waitFor({ state: 'hidden', timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-notare-masked="true"]').length === 0);

  // Interval guides are anchored to OSMD's own engraved note positions.
  await page.getByRole('button', { name: /5\. Интервалы/ }).click();
  await page.getByTestId('osmd-score').waitFor({ state: 'visible' });
  const arc = page.locator('[data-notare-interval-overlay="true"]');
  await arc.first().waitFor({ state: 'attached', timeout: 15000 });
  assert.ok(await arc.count() > 0, 'interval guides must attach to OSMD SVG notes');
  assert.equal(await renderError.count(), 0, 'OSMD interval guides should not fail');
  const beforeIntervalResize = await epoch();
  await page.setViewportSize({ width: 768, height: 900 });
  await waitForOverlayRender('[data-notare-interval-overlay="true"]', beforeIntervalResize);
  assert.ok(await arc.count() > 0, 'interval guides remain after responsive resize');

  // G-pattern uses the real OSMD staff with bass-to-treble gaze paths.
  await page.getByRole('button', { name: /6\. Буква «Г»/ }).click();
  await page.getByTestId('osmd-score').waitFor({ state: 'visible' });
  const gaze = page.locator('[data-notare-gaze-overlay="true"]');
  await gaze.first().waitFor({ state: 'attached', timeout: 15000 });
  assert.ok(await gaze.count() > 0, 'G-pattern must draw gaze paths on OSMD notes');
  const firstPath = gaze.first().locator('path');
  const firstPathD = await firstPath.getAttribute('d');
  assert.match(firstPathD, /^M [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+$/);
  const coords = firstPathD.match(/-?\d+(?:\.\d+)?/g).map(Number);
  assert.ok(coords[1] > coords[3], 'gaze starts at lower bass and travels up to treble');
  assert.ok(coords[4] > coords[2], 'gaze then travels right toward treble melody');
  assert.equal(await renderError.count(), 0, 'G-pattern should not show OSMD renderer errors');
  const beforeGazeResize = await epoch();
  await page.setViewportSize({ width: 375, height: 900 });
  await waitForOverlayRender('[data-notare-gaze-overlay="true"]', beforeGazeResize);
  assert.ok(await gaze.count() > 0, 'G-pattern must reanchor after narrow viewport rerender');
  const beforeRegenerate = await epoch();
  await page.getByRole('button', { name: 'Новый', exact: true }).click();
  await waitForOverlayRender('[data-notare-gaze-overlay="true"]', beforeRegenerate);
  assert.ok(await gaze.count() > 0, 'G-pattern must survive regenerating notes');

  // Hanon now uses OSMD's engraved fingering, articulation and syllables,
  // with four-note block brackets anchored to the real notehead positions.
  await page.getByRole('button', { name: /8\. Ганон/ }).click();
  await page.getByTestId('osmd-score').waitFor({ state: 'visible' });
  const hanonBlock = page.locator('[data-notare-hanon-block="true"]');
  await hanonBlock.first().waitFor({ state: 'attached', timeout: 20000 });
  assert.ok(await hanonBlock.count() >= 2, 'Hanon OSMD should have multiple real block guides');
  assert.equal(await hanonBlock.first().getAttribute('data-notare-hanon-number'), '1');
  assert.ok(await hanonBlock.first().locator('path').count() > 0,
    'Hanon block must use a real SVG bracket');
  assert.equal(await renderError.count(), 0, 'Hanon OSMD should not fail');

  const beforeHanonResize = await epoch();
  await page.setViewportSize({ width: 768, height: 900 });
  await waitForOverlayRender('[data-notare-hanon-block="true"]', beforeHanonResize);
  // Hanon sequences are deterministic: regenerating can produce exactly
  // the same MusicXML, so OSMD should NOT need an extra engraving pass.
  // Advance an ungraded tabletop step, then verify regeneration resets it
  // while the existing block annotations remain attached.
  await page.getByRole('region', { name: 'Прокручиваемая клавиатура фортепиано' }).focus();
  await page.keyboard.press('Space');
  assert.equal(Number(await page.getByTestId('osmd-score').getAttribute('data-active-note-index')), 1);
  await page.getByRole('button', { name: 'Новый', exact: true }).click();
  await page.waitForFunction(() => {
    const score = document.querySelector('[data-testid="osmd-score"]');
    return score?.getAttribute('data-active-note-index') === '0' &&
      !!score.querySelector('[data-notare-hanon-block="true"]');
  }, null, { timeout: 15000 });
  assert.ok(await hanonBlock.count() > 0, 'Hanon brackets survive exercise reset');

  // Explicit Classic choice still works on narrow screens even in Hanon.
  await page.setViewportSize({ width: 375, height: 900 });
  await page.getByRole('button', { name: 'Классический', exact: true }).click();
  const classicSvg = page.locator('svg[viewBox="0 0 1720 305"]');
  await classicSvg.waitFor({ state: 'visible', timeout: 15000 });
  const classicBox = await classicSvg.boundingBox();
  assert.ok(classicBox && classicBox.height > 80 && classicBox.width > 0,
    'Classic staff must retain actual drawing area on 375px phones');
  await page.getByRole('button', { name: 'OSMD', exact: true }).click();
  await hanonBlock.first().waitFor({ state: 'attached', timeout: 20000 });

  // F3 and G2 landmarks must overlay OSMD's true bass stave and must not
  // force the old renderer or trigger a new MusicXML engraving.
  const beforeLandmarks = await epoch();
  await page.getByRole('button', { name: /Маяки баса/ }).click();
  const bassMarks = page.locator('[data-notare-bass-landmark="true"]');
  await bassMarks.first().waitFor({ state: 'attached', timeout: 15000 });
  assert.ok(await bassMarks.count() >= 2, 'both bass landmarks should be visible');
  assert.equal(await epoch(), beforeLandmarks, 'toggling a bass guide must not re-engrave notes');
  assert.ok(await page.getByTestId('osmd-score').isVisible(), 'OSMD remains the active renderer');
  assert.equal(await classicSvg.count(), 0, 'landmarks must not switch to Classic');
  const coordinates = await bassMarks.evaluateAll(groups =>
    groups.slice(0, 2).map(el => ({
      pitch: el.getAttribute('data-landmark-pitch'),
      staffIndex: el.getAttribute('data-staff-line-index'),
      source: el.getAttribute('data-origin'),
      x1: Number(el.querySelector('line').getAttribute('x1')),
      x2: Number(el.querySelector('line').getAttribute('x2')),
      y1: Number(el.querySelector('line').getAttribute('y1')),
      y2: Number(el.querySelector('line').getAttribute('y2'))
    }))
  );
  assert.deepEqual(coordinates.map(({ pitch, staffIndex, source }) =>
    [pitch, staffIndex, source]), [
    ['F3', '1', 'vexflow-stave'],
    ['G2', '4', 'vexflow-stave']
  ]);
  assert.ok(coordinates.every(({ x1, x2, y1, y2 }) =>
    x2 > x1 && y1 === y2), 'landmark guides must be horizontal staff-line overlays');
  assert.ok(coordinates[0].y1 < coordinates[1].y1,
    'F3 line must be above G2 on the actual bass clef');

  const beforeBassResize = await epoch();
  await page.setViewportSize({ width: 768, height: 900 });
  await waitForOverlayRender('[data-notare-bass-landmark="true"]', beforeBassResize);
  assert.ok(await bassMarks.count() >= 2, 'landmarks follow OSMD layout after responsive resize');

  await page.getByRole('button', { name: /Маяки баса/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-notare-bass-landmark="true"]').length === 0);
  assert.ok(await page.getByTestId('osmd-score').isVisible(), 'disabling landmarks keeps OSMD visible');
  await page.getByRole('button', { name: /Маяки баса/ }).click();
  await bassMarks.first().waitFor({ state: 'attached', timeout: 15000 });

  // A mode switch with landmarks enabled retains OSMD and recreates the guides.
  await page.getByRole('button', { name: /1\. Рефлекс/ }).click();
  await page.getByTestId('osmd-score').waitFor({ state: 'visible' });
  await bassMarks.first().waitFor({ state: 'attached', timeout: 15000 });
  assert.equal(await renderError.count(), 0, 'bass landmarks must never show OSMD renderer errors');
  await page.getByRole('button', { name: /Маяки баса/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-notare-bass-landmark="true"]').length === 0);

  await page.getByRole('button', { name: /1\. Рефлекс/ }).click();
  await svg.waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('button', { name: 'Классический', exact: true }).click();
  assert.ok(await page.locator('svg[viewBox="0 0 1720 305"]').isVisible());

  await page.getByRole('button', { name: 'OSMD', exact: true }).click();
  await svg.waitFor({ state: 'visible', timeout: 30000 });

  // Experimental two-hand MIDI practice: the RH and LH scores start together,
  // but ONLY physically overlapping MIDI note-ons advance a shared onset.
  await page.waitForFunction(() => typeof window.__twoHandMidi.input.onmidimessage === 'function');
  await page.getByRole('button', { name: /Две руки одновременно · MIDI/ }).click();
  await page.getByTestId('two-hand-practice').waitFor({ state: 'visible' });
  await page.locator('[aria-label="Независимые партии двух рук OpenSheetMusicDisplay"] svg')
    .first().waitFor({ state: 'visible', timeout: 45000 });
  const polyStep = page.getByTestId('two-hand-step-index');
  assert.equal(await polyStep.innerText(), '1');
  assert.match(await page.getByTestId('two-hand-expected').innerText(), /C3.*C4/);
  const beforePolyAttempts = await page.getByTitle('Точность попаданий в текущей сессии').innerText();
  await page.evaluate(() => window.__twoHandMidi.send([0x92, 48, 100]));
  assert.equal(await polyStep.innerText(), '1', 'bass note alone does not complete a chord');
  await page.evaluate(() => window.__twoHandMidi.send([0x90, 60, 100]));
  await page.waitForFunction(() => document.querySelector('[data-testid="two-hand-step-index"]')?.textContent === '2');
  await page.evaluate(() => {
    window.__twoHandMidi.send([0x80, 60, 0]);
    window.__twoHandMidi.send([0x90, 62, 100]);
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="two-hand-step-index"]')?.textContent === '3');
  await page.evaluate(() => {
    window.__twoHandMidi.send([0x80, 62, 0]);
    window.__twoHandMidi.send([0x90, 64, 100]);
    window.__twoHandMidi.send([0x92, 55, 100]);
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="two-hand-step-index"]')?.textContent === '4');
  assert.equal(await page.getByTitle('Точность попаданий в текущей сессии').innerText(),
    beforePolyAttempts, 'polyphonic trial must never add ordinary lesson attempts');
  await page.getByRole('button', { name: 'Вернуться к тренажёру' }).click();
  await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 30000 });

  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/osmd-trainer.png', fullPage: true });
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('Browser smoke passed: OSMD loaded, cursor advanced, rhythm rendered, legacy fallback worked.');
} finally {
  if (page) {
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/osmd-last-state.png', fullPage: true }).catch(() => {});
  }
  await browser.close();
}
