import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { DEMO_XML, DEMO_MULTI_XML, makeMxl } from './repertoireFixtures.mjs';

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
      assert.match(await page.getByTestId('repertoire-import-error').innerText(), /(DOCTYPE|DTD|ENTITY)/);
      assert.equal(await page.getByTestId('repertoire-preview').count(), 0);

      // Exercise renderer still works after invalid upload.
      assert.ok(await page.getByTestId('studio-score-area').isVisible());

      if (width === 1440) {
        // Older MusicXML exports routinely contain the canonical Recordare
        // DTD. It is stripped before parsing, not rejected as a hostile file.
        const standardDtd = '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';
        const withDtd = DEMO_XML.replace('<score-partwise', standardDtd + '\n<score-partwise');
        await filePicker.setInputFiles({ name: 'classic-export.xml', mimeType: 'text/xml',
          buffer: Buffer.from(withDtd) });
        await preview.waitFor({ state: 'visible', timeout: 35000 });
        await page.getByTestId('repertoire-score').locator('svg').first()
          .waitFor({ state: 'visible', timeout: 45000 });
        await preview.getByRole('button', { name: 'Вернуться к упражнению' }).click();

        // A multi-part score is rendered without inventing an ExerciseNote
        // sequence, deleting a voice, or claiming it can be graded.
        await filePicker.setInputFiles({ name: 'two-parts.musicxml',
          mimeType: 'application/vnd.recordare.musicxml+xml',
          buffer: Buffer.from(DEMO_MULTI_XML) });
        await preview.waitFor({ state: 'visible', timeout: 35000 });
        assert.match(await preview.innerText(), /2 партий/);
        await page.getByTestId('repertoire-score').locator('svg').first()
          .waitFor({ state: 'visible', timeout: 45000 });
        await preview.getByRole('button', { name: 'Вернуться к упражнению' }).click();

        // Native HTML drag and drop exercises the same validation path.
        await page.evaluate(xml => {
          const payload = new DataTransfer();
          payload.items.add(new File([xml], 'dropped.musicxml', { type: 'text/xml' }));
          const studio = document.querySelector('[data-testid="studio-root"]');
          studio.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: payload }));
          studio.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: payload }));
        }, DEMO_XML);
        await preview.waitFor({ state: 'visible', timeout: 35000 });
        assert.match(await preview.innerText(), /dropped.musicxml/);
        await preview.getByRole('button', { name: 'Вернуться к упражнению' }).click();

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
