import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1920, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.addInitScript(() => {
    // For the treble_oct2 pool, starting at index 4 and taking +2
    // deterministically makes the first F-major target Bb4.
    Math.random = () => 0.999999;
    const input = { id: 'enharmonic-test-midi', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([[input.id, input]]), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true, value: async () => access
    });
    window.__enharmonicMidi = { input, send(bytes) {
      if (typeof input.onmidimessage !== 'function') throw new Error('No MIDI input handler');
      input.onmidimessage({ data: Uint8Array.from(bytes) });
    } };
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__enharmonicMidi.input.onmidimessage);
  await page.getByRole('button', { name: /Тренажёр-Студия/ }).click();
  await page.getByTestId('toolbar-trigger-material').click();
  await page.getByRole('button', { name: /2-я окт/ }).click();
  await page.locator('select').filter({ has: page.locator('option[value="F"]') })
    .first().selectOption('F');
  const target = page.getByTestId('active-target-note');
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="active-target-note"]')?.textContent?.trim() === 'Bb4'
  );
  const score = page.getByTestId('osmd-score');
  await score.waitFor({ state: 'visible', timeout: 45000 });

  const attempts = async () => Number(/\((\d+)\)/.exec(
    await page.getByTitle('Точность попаданий в текущей сессии').innerText()
  )?.[1]);

  assert.equal(await attempts(), 0);
  // The physical black key retains the A#4 event name internally,
  // but the F-major target is engraved/labeled as Bb4.
  await page.getByRole('button', { name: 'Клавиша Bb4', exact: true }).click();
  assert.equal(await attempts(), 1);
  assert.equal(Number(await score.getAttribute('data-active-note-index')), 1);
  assert.match(await page.getByTitle('Точность попаданий в текущей сессии').innerText(),
    /100%/, 'clicked A#-backed Bb key must not be graded wrong');

  // Re-create the same score and send the MIDI 70 NoteOn, which must use
  // exactly the same pitch judgment as a clicked black piano key.
  await page.getByTestId('toolbar-trigger-actions').click();
  await page.getByRole('button', { name: 'Новый', exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="active-target-note"]')?.textContent?.trim() === 'Bb4'
  );
  assert.equal(Number(await score.getAttribute('data-active-note-index')), 0);
  const beforeMidi = await attempts();
  await page.evaluate(() => window.__enharmonicMidi.send([0x90, 70, 100]));
  await page.waitForFunction(() =>
    Number(document.querySelector('[data-testid="osmd-score"]')?.getAttribute('data-active-note-index')) === 1
  );
  assert.equal(await attempts(), beforeMidi + 1);
  assert.match(await page.getByTitle('Точность попаданий в текущей сессии').innerText(), /100%/,
    'physical MIDI 70 must count as correct Bb4, not as an A# spelling error');
  await page.evaluate(() => window.__enharmonicMidi.send([0x80, 70, 0]));

  assert.deepEqual(errors, []);
  console.log('Enharmonic Chrome smoke passed: clicked and physical MIDI A#4 score as F-major Bb4.');
} finally {
  await browser.close();
}
