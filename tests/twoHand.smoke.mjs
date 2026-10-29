import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.addInitScript(() => {
    const input = { id: 'two-hand-test', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([['two-hand-test', input]]), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true, value: async () => access
    });
    window.__twoHandMidi = {
      input,
      send(bytes) {
        if (!input.onmidimessage) throw new Error('No MIDI listener');
        input.onmidimessage({ data: Uint8Array.from(bytes) });
      }
    };
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__twoHandMidi.input.onmidimessage === 'function');
  await page.getByRole('button', { name: /^Студия$/ }).click();
  const attempts = async () => {
    const value = await page.getByTitle('Точность попаданий в текущей сессии').innerText();
    return Number(/\((\d+)\)/.exec(value)?.[1]);
  };
  assert.equal(await attempts(), 0);
  await page.getByTestId('toolbar-trigger-rhythm').click();
  await page.getByRole('button', { name: /Две руки одновременно · MIDI/ }).click();

  const score = page.getByTestId('two-hand-practice');
  await score.waitFor({ state: 'visible' });
  await page.locator('[aria-label="Независимые партии двух рук OpenSheetMusicDisplay"] svg')
    .first().waitFor({ state: 'visible', timeout: 45000 });
  const step = page.getByTestId('two-hand-step-index');
  const target = page.getByTestId('two-hand-expected');
  assert.equal(await step.innerText(), '1');
  assert.match(await target.innerText(), /C3.*C4/);
  assert.equal(await attempts(), 0);

  // First chord: two channels can overlap. C3 alone must not pass.
  await page.evaluate(() => window.__twoHandMidi.send([0x92, 48, 110]));
  assert.equal(await step.innerText(), '1');
  assert.match(await page.getByTestId('two-hand-feedback').innerText(), /Одна нота/);
  await page.evaluate(() => window.__twoHandMidi.send([0x90, 60, 100]));
  await page.waitForFunction(() => document.querySelector('[data-testid="two-hand-step-index"]')?.textContent === '2');
  assert.equal(await attempts(), 0, 'physical MIDI practice must not certify course targets');
  assert.equal(await target.innerText(), 'D4');

  // A sustained bass note continues while right hand alone re-attacks D4.
  await page.evaluate(() => {
    window.__twoHandMidi.send([0x80, 60, 0]);
    window.__twoHandMidi.send([0x90, 62, 105]);
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="two-hand-step-index"]')?.textContent === '3');
  assert.match(await target.innerText(), /E4.*G3|G3.*E4/);

  // Next genuine simultaneous onset at tick 8: LH changes to G3.
  await page.evaluate(() => {
    window.__twoHandMidi.send([0x80, 62, 0]);
    window.__twoHandMidi.send([0x90, 64, 100]);
    window.__twoHandMidi.send([0x92, 55, 105]);
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="two-hand-step-index"]')?.textContent === '4');

  // Wrong pitch must not advance or produce course attempts.
  await page.evaluate(() => window.__twoHandMidi.send([0x90, 70, 110]));
  assert.equal(await step.innerText(), '4');
  assert.equal(await attempts(), 0);

  await page.getByRole('button', { name: 'Заново', exact: true }).click();
  assert.equal(await step.innerText(), '1');
  // Disjoint NoteOns (first already released) must never be a chord.
  await page.evaluate(() => {
    window.__twoHandMidi.send([0x82, 48, 0]);
    window.__twoHandMidi.send([0x90, 48, 90]);
    window.__twoHandMidi.send([0x80, 48, 0]);
    window.__twoHandMidi.send([0x80, 60, 0]);
    window.__twoHandMidi.send([0x90, 60, 90]);
  });
  assert.equal(await step.innerText(), '1', 'sequential nonoverlapping taps are not a chord');
  assert.equal(await attempts(), 0);

  await page.getByRole('button', { name: 'Вернуться к тренажёру' }).click();
  await page.getByTestId('osmd-score').waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await attempts(), 0);
  assert.deepEqual(errors, [], 'no unhandled browser errors');
  console.log('Two-hand MIDI smoke passed: concurrent RH/LH OSMD score, held chord, release, cursor, grading isolation.');
} finally {
  await browser.close();
}
