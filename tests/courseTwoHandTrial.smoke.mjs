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

  const courseProgress = page.getByTestId('course-module-all');
  assert.match(await courseProgress.innerText(), /0\/12/, 'compact module toolbar retains course progress');
  await courseProgress.waitFor({ state: 'visible' });

  // Lesson 10 must not offer a polyphonic trial: its pedagogy is different.
  await page.getByTestId('course-lesson-10').click();
  assert.equal(await page.getByTestId('course-two-hand-trial-launch').count(), 0);

  await page.getByTestId('course-lesson-11').click();
  assert.match(await page.getByTestId('two-hand-certification-policy').innerText(), /Автоматический зачёт отключён/);
  await page.getByTestId('course-launch-selected').click();
  const trial = page.getByTestId('two-hand-practice');
  await trial.waitFor({ state: 'visible', timeout: 30000 });
  assert.match(await page.getByTestId('two-hand-trial-context').innerText(), /Урок 11/);
  assert.equal(await page.getByTestId('two-hand-active-bpm').innerText(), '58');
  assert.equal(await page.getByTestId('two-hand-active-tonality').innerText(), 'C');
  assert.equal(await page.getByTestId('two-hand-pattern').inputValue(), 'staggered');
  assert.equal(await page.getByTestId('two-hand-step-index').innerText(), '1');
  assert.equal((await page.getByTestId('two-hand-shadow-progress').innerText()).trim(), '0/15');
  assert.equal(await page.getByTestId('two-hand-study-select').locator('option').count(), 15);
  assert.match(await page.getByTestId('two-hand-study-label').innerText(), /Этюд 1\/15/);
  assert.match(await page.getByTestId('two-hand-shadow-series').innerText(), /подряд/);
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
  await page.getByTestId('course-launch-selected').click();
  await trial.waitFor({ state: 'visible' });
  assert.match(await page.getByTestId('two-hand-trial-context').innerText(), /Урок 12/);
  assert.match(await page.getByTestId('two-hand-trial-context').innerText(), /аппликатуру/);
  assert.equal(await page.getByTestId('two-hand-active-bpm').innerText(), '68');
  assert.equal(await page.getByTestId('two-hand-active-tonality').innerText(), 'C');
  assert.equal(await page.getByTestId('two-hand-pattern').inputValue(), 'eighth-rests');
  assert.match(await page.getByTestId('two-hand-lesson-score').innerText(), /staccato четвертями/);
  assert.equal(await page.getByTestId('two-hand-pattern').isDisabled(), true);
  assert.equal((await page.getByTestId('two-hand-shadow-progress').innerText()).trim(), '0/20');
  assert.equal(await page.getByTestId('two-hand-study-select').locator('option').count(), 20);
  const study0Expected = await page.getByTestId('two-hand-expected').innerText();
  await page.getByTestId('two-hand-study-select').selectOption('1');
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="two-hand-study-label"]')?.textContent?.includes('Этюд 2/20')
  );
  const study1Expected = await page.getByTestId('two-hand-expected').innerText();
  assert.notEqual(study1Expected, study0Expected,
    'selecting a distinct study must change expected MIDI pitches, not just the label');
  assert.equal((await page.getByTestId('two-hand-shadow-progress').innerText()).trim(), '0/20',
    'switching to a different study cannot create course credit or practice repetitions');
  await page.getByTestId('two-hand-study-select').selectOption('0');
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="two-hand-study-label"]')?.textContent?.includes('Этюд 1/20')
  );
  assert.equal(await page.getByTestId('two-hand-expected').innerText(), study0Expected);
  // No physical MIDI activity means that the complete two-bar lesson
  // contains zero verified NoteOff events, and never awards course credit.
  await page.getByTestId('two-hand-start-tempo').click();
  await page.getByTestId('two-hand-release-evidence')
    .waitFor({ state: 'visible', timeout: 25000 });
  assert.match(await page.getByTestId('two-hand-release-evidence').innerText(),
    /Физические отпускания:\s*0\/24/);
  assert.match(await page.getByTestId('two-hand-release-verdict').innerText(),
    /Не все отпускания/);
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="two-hand-shadow-series"]')?.textContent?.includes('Всего попыток: 1;')
  );
  assert.equal((await page.getByTestId('two-hand-shadow-progress').innerText()).trim(),
    '0/20', 'silence must not count as a clean study');
  assert.match(await page.getByTestId('two-hand-shadow-last-result').innerText(),
    /не соответствует/);
  assert.equal(await page.getByTestId('two-hand-shadow-target').count(), 0);

  // New run is independent; explicit Stop is an aborted attempt, never a
  // successful repetition. Reset affects this session only.
  await page.getByTestId('two-hand-start-tempo').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="two-hand-mode"]')?.textContent?.trim() === 'Ритм · метроном'
  );
  await page.getByRole('button', { name: 'Заново / Стоп' }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="two-hand-shadow-series"]')?.textContent?.includes('прервано: 1')
  );
  assert.equal((await page.getByTestId('two-hand-shadow-progress').innerText()).trim(), '0/20');
  await page.getByTestId('two-hand-shadow-reset').click();
  assert.match(await page.getByTestId('two-hand-shadow-series').innerText(), /Всего попыток: 0/);
  await page.getByTestId('two-hand-back-to-course').click();
  await courseProgress.waitFor({ state: 'visible' });

  // Default launch no longer pretends that single-note grading certifies two hands.
  await page.getByTestId('course-launch-selected').click();
  await page.getByTestId('two-hand-practice').waitFor({ state: 'visible' });
  assert.equal(await page.getByTestId('course-credit-mode').count(), 0);
  assert.match(await page.getByTestId('two-hand-trial-context').innerText(), /Урок 12/);
  // Stored training evidence is visible on reload but not official lesson credit.
  await page.getByTestId('two-hand-back-to-course').click();
  await page.evaluate(() => {
    localStorage.setItem('notare_two_hand_shadow_v1', JSON.stringify({
      version: 1, lessons: {
        11: { attempts: 2, accepted: 2, rejected: 0, aborted: 0,
          cleanStreak: 2, successfulStudies: [0, 1], lastAttemptId: 2 },
        12: { attempts: 1, accepted: 1, rejected: 0, aborted: 0,
          cleanStreak: 1, successfulStudies: [0], lastAttemptId: 1 }
      }
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('course-lesson-11').click();
  assert.match(await page.getByTestId('two-hand-saved-progress').innerText(), /2\/15/);
  await page.getByTestId('course-launch-selected').click();
  assert.equal((await page.getByTestId('two-hand-shadow-progress').innerText()).trim(), '2/15');
  assert.match(await page.getByTestId('two-hand-study-label').innerText(), /Этюд 3\/15/);
  await page.getByTestId('two-hand-back-to-course').click();
  await page.getByTestId('course-lesson-12').click();
  assert.match(await page.getByTestId('two-hand-saved-progress').innerText(), /1\/20/);
  await page.getByTestId('course-launch-selected').click();
  assert.equal((await page.getByTestId('two-hand-shadow-progress').innerText()).trim(), '1/20');
  assert.match(await page.getByTestId('two-hand-study-label').innerText(), /Этюд 2\/20/);
  await page.getByTestId('two-hand-shadow-reset').click();
  await page.getByTestId('two-hand-back-to-course').click();
  assert.match(await page.getByTestId('two-hand-saved-progress').innerText(), /0\/20/);
  assert.match(await courseProgress.innerText(), /0\/12/);
  assert.deepEqual(errors, []);
  console.log('Course trial smoke passed: lesson-linked RH/LH presets, real MIDI, no credit, lesson launches polyphonic practice.');
} finally {
  await browser.close();
}
