import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const errors = [];
try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const input = { id: 'chord-study-midi', state: 'connected', onmidimessage: null };
      const access = { inputs: new Map([[input.id, input]]), onstatechange: null };
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        configurable: true, value: async () => access
      });
      window.__chordStudyMidi = {
        input,
        send(bytes) {
          if (typeof input.onmidimessage !== 'function') throw Error('No MIDI handler');
          input.onmidimessage({ data: Uint8Array.from(bytes) });
        }
      };
    });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.__chordStudyMidi.input.onmidimessage === 'function');
    const before = await page.evaluate(() => ({
      course: Object.fromEntries(Object.entries(localStorage).filter(([key]) =>
        /course|completion|lesson|certificate|shadow/i.test(key)))
    }));
    await page.getByRole('button', { name: /^Студия$/ }).click();
    const attemptCount = async () => {
      const value = await page.getByTitle('Точность попаданий в текущей сессии').innerText();
      return Number(/\((\d+)\)/.exec(value)?.[1]);
    };
    assert.equal(await attemptCount(), 0);
    await page.getByTestId('toolbar-trigger-rhythm').click();
    await page.getByTestId('open-chord-study').click();
    await page.getByTestId('two-hand-practice').waitFor({ state: 'visible' });
    assert.equal(await page.getByTestId('two-hand-family').inputValue(), 'chords');
    assert.equal(await page.getByTestId('two-hand-start-tempo').count(), 0);
    assert.equal(await page.getByTestId('two-hand-shadow-series').count(), 0);
    assert.match(await page.getByTestId('chord-study-description').innerText(), /Без метронома и без зачёта/);
    assert.equal(await page.getByTestId('chord-notes').innerText(), 'C4 · E4 · G4');
    await page.locator('[aria-label="Независимые партии двух рук OpenSheetMusicDisplay"] svg')
      .first().waitFor({ state: 'visible', timeout: 45000 });
    const step = page.getByTestId('two-hand-step-index');
    assert.equal(await step.innerText(), '1');

    // Three genuine NoteOn messages at once, still physically held.
    await page.evaluate(() => {
      window.__chordStudyMidi.send([0x90, 60, 110]);
      window.__chordStudyMidi.send([0x90, 64, 110]);
    });
    assert.equal(await step.innerText(), '1', 'two notes cannot substitute for a triad');
    await page.evaluate(() => window.__chordStudyMidi.send([0x90, 67, 110]));
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="two-hand-step-index"]')?.textContent === '2');
    assert.equal(await attemptCount(), 0);

    // The same held keys cannot be interpreted as a fresh repeated triad.
    await page.evaluate(() => {
      window.__chordStudyMidi.send([0x90, 60, 110]);
      window.__chordStudyMidi.send([0x90, 64, 110]);
      window.__chordStudyMidi.send([0x90, 67, 110]);
    });
    assert.equal(await step.innerText(), '2');
    await page.evaluate(() => {
      for (const note of [60, 64, 67]) window.__chordStudyMidi.send([0x80, note, 0]);
      window.__chordStudyMidi.send([0x90, 61, 95]);
      for (const note of [60, 64, 67]) window.__chordStudyMidi.send([0x90, note, 100]);
    });
    assert.equal(await step.innerText(), '2',
      'extra held pitch disqualifies strict one-hand chord');
    await page.evaluate(() => {
      for (const note of [60, 61, 64, 67]) window.__chordStudyMidi.send([0x80, note, 0]);
      for (const note of [60, 64, 67]) window.__chordStudyMidi.send([0x90, note, 105]);
    });
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="two-hand-step-index"]')?.textContent === '3');

    // Change true music mode and inversion; both must change expected pitches.
    await page.getByTestId('chord-quality').selectOption('minor');
    await page.getByTestId('chord-inversion').selectOption('1');
    assert.equal(await step.innerText(), '1');
    assert.equal(await page.getByTestId('chord-notes').innerText(), 'C4 · E4 · A4');
    assert.match(await page.getByTestId('chord-study-details').innerText(), /A-moll/);
    await page.locator('[aria-label="Независимые партии двух рук OpenSheetMusicDisplay"] svg')
      .first().waitFor({ state: 'visible', timeout: 45000 });
    assert.equal(await attemptCount(), 0);
    const after = await page.evaluate(() => ({
      course: Object.fromEntries(Object.entries(localStorage).filter(([key]) =>
        /course|completion|lesson|certificate|shadow/i.test(key)))
    }));
    assert.deepEqual(after, before, 'chord practice must not change course or shadow evidence');
    await page.getByRole('button', { name: 'Вернуться к тренажёру' }).click();
    assert.equal(await page.getByTestId('two-hand-practice').count(), 0);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Chord study Chrome passed: 375/1440px, OSMD triads, 3 MIDI keys, inversion, mode and no course credits.');
} finally {
  await browser.close();
}
