import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { DEMO_XML, makeMxl } from './repertoireFixtures.mjs';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    const postRequests = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('request', req => { if (req.method() !== 'GET') postRequests.push(req.url()); });
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^Студия$/ }).click();
      const targetBefore = await page.getByTestId('active-target-note').innerText();
      const progressBefore = await page.evaluate(() => localStorage.getItem('notare_course_completed_v3'));
      const filePicker = page.getByTestId('repertoire-file-input');
      assert.ok(await page.getByTestId('repertoire-upload').isVisible());

      // A real file is passed to OSMD without rewriting notes into trainer state.
      await filePicker.setInputFiles({ name: 'piano.musicxml',
        mimeType: 'application/vnd.recordare.musicxml+xml', buffer: Buffer.from(DEMO_XML) });
      const preview = page.getByTestId('repertoire-preview');
      await preview.waitFor({ state: 'visible', timeout: 35000 });
      assert.match(await preview.innerText(), /Только просмотр · без зачёта/);
      await page.getByTestId('repertoire-score').locator('svg').first()
        .waitFor({ state: 'visible', timeout: 45000 });
      assert.equal(await page.getByTestId('studio-score-area').count(), 0,
        'training score must not remain active under preview');

      // Light-theme switch must repaint the isolated preview.
      await page.getByTestId('theme-toggle').click();
      const lightScore = page.locator('.osmd-light-theme svg').first();
      await lightScore.waitFor({ state: 'visible', timeout: 45000 });
      assert.equal(await lightScore.evaluate(el => getComputedStyle(el).backgroundColor),
        'rgb(255, 255, 255)');
      await mkdir('artifacts', { recursive: true });
      await page.screenshot({ path: `artifacts/repertoire-preview-${width}.png`, fullPage: true });

      await preview.getByRole('button', { name: 'Вернуться к упражнению' }).click();
      await page.getByTestId('studio-score-area').waitFor({ state: 'visible' });
      assert.equal(await page.getByTestId('active-target-note').innerText(), targetBefore);
      assert.equal(await page.evaluate(() => localStorage.getItem('notare_course_completed_v3')),
        progressBefore);
      assert.equal(await page.getByTestId('repertoire-preview').count(), 0);

      // Invalid / unsafe XML is rejected before it reaches OSMD.
      await filePicker.setInputFiles({ name: 'invalid.musicxml', mimeType: 'text/xml',
        buffer: Buffer.from('<!DOCTYPE score-partwise [<!ENTITY x SYSTEM "https://invalid/evil">]><score-partwise/>') });
      await page.getByTestId('repertoire-import-error').waitFor({ state: 'visible' });
      assert.match(await page.getByTestId('repertoire-import-error').innerText(), /DTD/);
      assert.equal(await page.getByTestId('repertoire-preview').count(), 0);

      // Exercise renderer still works after invalid upload.
      assert.ok(await page.getByTestId('studio-score-area').isVisible());

      if (width === 1440) {
        // ZIP container rootfile is deliberately nested rather than the first
        // entry. OSMD 2.2.1 must handle the original File directly.
        await filePicker.setInputFiles({ name: 'nested.mxl',
          mimeType: 'application/vnd.recordare.musicxml', buffer: makeMxl() });
        await preview.waitFor({ state: 'visible', timeout: 35000 });
        await page.getByTestId('repertoire-score').locator('svg').first()
          .waitFor({ state: 'visible', timeout: 45000 });
        assert.ok(await page.getByTestId('repertoire-score').locator('svg').count() > 0);
        await preview.getByRole('button', { name: 'Вернуться к упражнению' }).click();

        // Broken MXL must show an actionable error and preserve trainer.
        await filePicker.setInputFiles({ name: 'broken.mxl',
          mimeType: 'application/vnd.recordare.musicxml',
          buffer: Buffer.from('this is not a ZIP') });
        await page.getByTestId('repertoire-import-error').waitFor({ state: 'visible' });
        assert.equal(await page.getByTestId('repertoire-preview').count(), 0);
      }
      assert.deepEqual(postRequests, [], 'local repertoire must never be POSTed to a server');
      assert.deepEqual(errors, [], 'no browser exceptions during repertoire import');
    } finally {
      await page.close();
    }
  }
  console.log('Repertoire smoke: MusicXML/MXL view-only, validation, return, light theme, privacy at 375/1440px.');
} finally {
  await browser.close();
}
