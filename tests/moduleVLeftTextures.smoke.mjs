import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const failures = [];
try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    page.on('pageerror', error => failures.push(error.message));
    await page.addInitScript(() => {
      const input = { id: 'v3-physical-midi', state: 'connected', onmidimessage: null };
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        configurable: true, value: async () => ({ inputs: new Map([[input.id, input]]), onstatechange: null })
      });
      window.__v3Midi = {
        input, send(bytes) {
          if (typeof input.onmidimessage !== 'function') throw Error('No hardware MIDI handler');
          input.onmidimessage({ data: Uint8Array.from(bytes) });
        }
      };
    });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.__v3Midi.input.onmidimessage === 'function');
    const old = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)
      .filter(([k]) => /course|completion|lesson|certificate|shadow|module_v_practice_v1|module_v_inversions_v2/i.test(k))));
    await page.getByTestId('course-module-V').click();
    await page.getByTestId('module-v-open-v3').click();
    await page.getByTestId('module-v-v3-practice').waitFor({ state: 'visible' });
    await page.getByTestId('module-v-v3-score').locator('svg').first()
      .waitFor({ state: 'visible', timeout: 45000 });
    assert.equal(await page.getByTestId('module-v-v3-feedback').count(), 0);
    assert.equal(await page.getByTestId('module-v-v3-midi').count(), 0);
    assert.doesNotMatch(await page.getByTestId('module-v-v3-practice').innerText(), /Записано:|нижний — верхний — средний|бас на первую долю/);
    assert.equal(await page.getByTestId('module-v-v3-options').locator('button').count(), 3);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 4));
    const svg = await page.getByTestId('module-v-v3-score').locator('svg').first().evaluate(x => x.outerHTML);
    assert.doesNotMatch(svg, /Alberti|waltz|arpeggio|Бас Альберти|Вальс|Ломаное арпеджио/i);
    assert.doesNotMatch(await page.getByTestId('module-v-v3-score').getAttribute('aria-label'), /alberti|waltz|arpeggio/i);

    await page.getByTestId('module-v-v3-method').click();
    assert.match(await page.getByTestId('module-v-v3-method-content').innerText(), /сильную долю/);
    await page.getByTestId('module-v-v3-hint').click();
    assert.match(await page.getByTestId('module-v-v3-feedback').innerText(), /Разбор с подсказкой/);
    await page.getByTestId('module-v-v3-answer-alberti').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('notare_module_v_left_textures_v3')).attempts[0].usedHint), true);
    await page.getByTestId('module-v-v3-independent').click();
    await page.getByTestId('module-v-v3-score').locator('svg').first()
      .waitFor({ state: 'visible', timeout: 45000 });
    assert.equal(await page.getByTestId('module-v-v3-hint').count(), 0);
    assert.equal(await page.getByTestId('module-v-v3-feedback').count(), 0);
    assert.equal(await page.getByTestId('module-v-v3-midi').count(), 0);
    await page.getByTestId('module-v-v3-answer-waltz').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.getByTestId('module-v-v3-feedback').innerText(), /Пока неверно/);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('notare_module_v_left_textures_v3')));
    assert.equal(before.attempts[1].mode, 'independent');
    assert.equal(before.attempts[1].usedHint, false);

    await page.getByTestId('module-v-v3-octave').selectOption('12');
    await page.getByTestId('module-v-v3-score').locator('svg').first()
      .waitFor({ state: 'visible', timeout: 45000 });
    await page.getByTestId('module-v-v3-midi-start').click();
    await page.evaluate(() => {
      window.__v3Midi.send([0x90, 54, 100]);
      window.__v3Midi.send([0x80, 54, 0]);
    });
    assert.match(await page.getByTestId('module-v-v3-step').innerText(), /Событие 1 из 16/);
    // F-major Alberti from index 2, octave-up bass: F3–C4–A3–C4.
    await page.evaluate(() => {
      for (const note of [...[53,60,57,60,53,60,57,60], ...[53,60,57,60,53,60,57,60]]) {
        window.__v3Midi.send([0x90, note, 100]);
        window.__v3Midi.send([0x80, note, 0]);
      }
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="module-v-v3-expected"]')
      ?.textContent?.includes('Все записанные атаки'), { timeout: 15000 });
    const progress = await page.evaluate(() => ({
      journal: JSON.parse(localStorage.getItem('notare_module_v_left_textures_v3')),
      old: Object.fromEntries(Object.entries(localStorage)
        .filter(([k]) => /course|completion|lesson|certificate|shadow|module_v_practice_v1|module_v_inversions_v2/i.test(k)))
    }));
    assert.ok(progress.journal.midiRehearsals.includes('v3-02:12'));
    assert.deepEqual(progress.old, old);
    await page.getByTestId('module-v-v3-retry').click();
    assert.equal(await page.getByTestId('module-v-v3-feedback').count(), 0);
    await page.getByTestId('module-v-v3-next').click();
    assert.equal(await page.getByTestId('module-v-v3-feedback').count(), 0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('course-module-V').click();
    await page.getByTestId('module-v-open-v3').click();
    assert.match(await page.getByTestId('module-v-v3-practice').innerText(), /Ответов: 2 · MIDI-репетиций: 1/);
    await page.evaluate(() => localStorage.setItem('notare_module_v_left_textures_v3', '{broken'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('course-module-V').click();
    await page.getByTestId('module-v-open-v3').click();
    assert.match(await page.getByTestId('module-v-v3-practice').innerText(), /Ответов: 0 · MIDI-репетиций: 0/);
    await page.close();
  }
  assert.deepEqual(failures, []);
  console.log('Module V3 Chrome: OSMD 375/1440, no answer leaks, guided/independent, real MIDI LH octave and legacy isolation PASS');
} finally { await browser.close(); }
