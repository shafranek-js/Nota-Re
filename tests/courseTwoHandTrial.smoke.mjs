import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1480, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.addInitScript(() => {
    const input = { id: 'two-hand-course-trial-test', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([[input.id, input]]), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true, value: async () => access
    });
    window.__courseTrialMidi = {
      input,
      send(data) {
        if (typeof input.onmidimessage !== 'function') throw new Error('MIDI handler unavailable');
        input.onmidimessage({ data: Uint8Array.from(data) });
      }
    };
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__courseTrialMidi.input.onmidimessage === 'function');

  const courseProgress = page.getByText('0 / 12 (0%)', { exact: true });
  await courseProgress.waitFor({ state: 'visible' });

  // Lesson 10 must not offer a polyphonic trial: its pedagogy is different.
  await page.getByTestId('course-lesson-10').click();
  assert.equal(await page.getByTestId('course-two-hand-trial-launch').count(), 0);

  await page.getByTestId('course-lesson-11').click();
  await page.getByTestId('course-two-hand-trial-launch').click();
  const trial = page.getByTestId('two-hand-practice');
  await trial.waitFor({ state: 'visible', timeout: 30000 });
  assert.match(await page.getByTestId('two-hand-trial-context').innerText(), /Урок 11/);
  assert.equal(await page.getByTestId('two-hand-active-bpm').innerText(), '58');
  assert.equal(await page.getByTestId('two-hand-active-tonality').innerText(), 'C');
  assert.equal(await page.getByTestId('two-hand-pattern').inputValue(), 'staggered');
  assert.equal(await page.getByTestId('two-hand-step-index').innerText(), '1');
  await page.locator('[aria-label="Независимые партии двух рук OpenSheetMusicDisplay"] svg')
    .first().waitFor({ state: 'visible', timeout: 45000 });

  // A real MIDI key press is useful practice but never creates course credit.
  await page.evaluate(() => window.__courseTrialMidi.send([0x90, 48, 100]));
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="two-hand-step-index"]')?.textContent === '2'
  );
  assert.equal(await page.getByTestId('two-hand-expected').innerText(), 'C4');
  await page.evaluate(() => window.__courseTrialMidi.send([0x80, 48, 0]));

  await page.getByTestId('two-hand-back-to-course').click();
  await courseProgress.waitFor({ state: 'visible' });
  assert.equal(await page.getByTestId('course-lesson-11').getAttribute('aria-current'), 'true');
  assert.equal(await page.getByTestId('two-hand-practice').count(), 0);

  await page.getByTestId('course-lesson-12').click();
  await page.getByTestId('course-two-hand-trial-launch').click();
  await trial.waitFor({ state: 'visible' });
  assert.match(await page.getByTestId('two-hand-trial-context').innerText(), /Урок 12/);
  assert.match(await page.getByTestId('two-hand-trial-context').innerText(), /не оцениваются/);
  assert.equal(await page.getByTestId('two-hand-active-bpm').innerText(), '68');
  assert.equal(await page.getByTestId('two-hand-active-tonality').innerText(), 'C');
  assert.equal(await page.getByTestId('two-hand-pattern').inputValue(), 'eighth-rests');
  await page.getByTestId('two-hand-back-to-course').click();
  await courseProgress.waitFor({ state: 'visible' });

  // Existing official lesson launch still routes to the usual monophonic
  // preset. The new examples do not silently replace course certification.
  await page.getByRole('button', { name: /Запустить этот урок в тренажёре/ }).click();
  await page.getByTestId('two-hand-practice').waitFor({ state: 'detached' });
  await page.getByTestId('course-credit-mode').waitFor({ state: 'visible' });
  assert.equal(await page.getByTestId('course-credit-mode').innerText(), 'Зачётная попытка');
  assert.deepEqual(errors, []);
  console.log('Course trial smoke passed: lesson-linked RH/LH presets, real MIDI, no credit, original lesson preserved.');
} finally {
  await browser.close();
}
