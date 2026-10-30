import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Issue #77: mobile score may scroll locally, but lesson titles, rhythm
// labels and the rest of the app must remain reachable and correctly aligned.
const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});
const errors = [];
try {
  for (const width of [320, 375, 768]) {
    const page = await browser.newPage({ viewport: { width, height: width < 400 ? 740 : 860 } });
    page.on('pageerror', e => errors.push(`${width}: ${e.message}`));
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('navigation', { name: 'Рабочие пространства' })
        .getByRole('button', { name: /^Студия$/ }).click();

      const banner = page.getByTestId('trainer-banner');
      const title = banner.getByTestId('trainer-lesson-title');
      assert.ok((await title.innerText()).trim().length > 0, 'lesson title must be present');
      assert.equal(await title.getAttribute('title'), (await title.innerText()).trim(),
        'whole lesson name must be available on hover as well as to screen readers');

      const score = page.getByTestId('osmd-score');
      const scroll = page.getByTestId('osmd-scroll-region');
      const svg = score.locator('[aria-label="Нотная партитура OpenSheetMusicDisplay"] svg').first();
      await svg.waitFor({ state: 'visible', timeout: 45000 });
      await page.waitForFunction(() => Boolean(
        document.querySelector('[data-testid="osmd-pedagogy-layer"] [data-notare-pedagogy="syllable"]')
      ));

      const measurements = await page.evaluate(() => {
        const banner = document.querySelector('[data-testid="trainer-banner"]');
        const title = document.querySelector('[data-testid="trainer-lesson-title"]');
        const scroller = document.querySelector('[data-testid="osmd-scroll-region"]');
        const overlay = document.querySelector('[data-testid="osmd-pedagogy-layer"]');
        const labels = [...overlay.querySelectorAll('[data-notare-pedagogy="syllable"]')];
        const boxes = labels.map(el => el.getBoundingClientRect());
        const overlapping = [];
        for (let a = 0; a < boxes.length; a++) {
          for (let b = a + 1; b < boxes.length; b++) {
            const x = Math.min(boxes[a].right, boxes[b].right) - Math.max(boxes[a].left, boxes[b].left);
            const y = Math.min(boxes[a].bottom, boxes[b].bottom) - Math.max(boxes[a].top, boxes[b].top);
            if (x > 2 && y > 2) overlapping.push([a, b, Math.round(x), Math.round(y)]);
          }
        }
        return {
          viewport: document.documentElement.clientWidth,
          pageWidth: document.documentElement.scrollWidth,
          titleRight: title.getBoundingClientRect().right,
          bannerRight: banner.getBoundingClientRect().right,
          titleEllipsis: getComputedStyle(title).textOverflow,
          scoreVisibleWidth: scroller.clientWidth,
          scoreContentWidth: scroller.scrollWidth,
          labels: boxes.length,
          overlapping
        };
      });
      assert.ok(measurements.pageWidth <= measurements.viewport + 1,
        `${width}: no page-wide horizontal scroll ${JSON.stringify(measurements)}`);
      assert.ok(measurements.titleRight <= measurements.bannerRight + 1,
        `${width}: full lesson name must stay inside banner`);
      assert.notEqual(measurements.titleEllipsis, 'ellipsis',
        `${width}: visible lesson title must not be silently truncated`);
      assert.ok(measurements.labels >= 4, `${width}: rhythm overlays must render`);
      assert.deepEqual(measurements.overlapping, [],
        `${width}: rhythm labels must not collide or cover adjacent system`);
      if (width < 400) {
        assert.ok(measurements.scoreContentWidth > measurements.scoreVisibleWidth + 100,
          `${width}: use local horizontal scroll for the wider readable OSMD engraving`);
        assert.equal(await scroll.getAttribute('tabindex'), '0',
          'score scroller must be keyboard focusable');
        await scroll.focus();
        assert.equal(await scroll.evaluate(el => el === document.activeElement), true);
        await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth - el.clientWidth; });
        assert.ok(await scroll.evaluate(el => el.scrollLeft > 50),
          'readers must be able to reach later measures without scrolling the whole page');
        // On a manually panned score the NEXT played note must automatically
        // become visible. Without following, later noteheads disappear offscreen.
        const rightmost = await scroll.evaluate(el => el.scrollLeft);
        const oldIndex = Number(await score.getAttribute('data-active-note-index'));
        const currentNote = (await page.getByTestId('active-target-note').innerText()).trim();
        assert.match(currentNote, /^[A-G][#b]?[0-9]$/);
        await page.getByRole('button', { name: `Клавиша ${currentNote}`, exact: true }).click();
        await page.waitForFunction(previousIndex => {
          const host = document.querySelector('[data-testid="osmd-score"]');
          const viewport = document.querySelector('[data-testid="osmd-scroll-region"]');
          const ring = host?.querySelector('[data-notare-active-ring="true"]');
          if (!host || !viewport || !ring ||
              Number(host.getAttribute('data-active-note-index')) <= previousIndex) return false;
          const b = ring.getBoundingClientRect(), v = viewport.getBoundingClientRect();
          const center = (b.left + b.right) / 2;
          return center >= v.left + 8 && center <= v.right - 8;
        }, oldIndex, { timeout: 7000 });
        assert.ok(await scroll.evaluate(el => el.scrollLeft) < rightmost,
          `${width}: advancing to the next target must pan away from a stale rightmost view`);
      }
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'no browser JS errors');
} finally {
  await browser.close();
}
