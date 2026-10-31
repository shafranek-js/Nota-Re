import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const POLY_XML = `<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0">
  <movement-title>Two hands, polyphonic rehearsal fixture</movement-title>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef></attributes>
      <direction><sound tempo="120"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>2</staff></note>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>2</staff></note>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>2</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.addInitScript(() => {
        localStorage.setItem('notare-piano-output-v1', 'oscillator');
        const port = { id: 'poly-midi', state: 'connected', onmidimessage: null };
        Object.defineProperty(navigator, 'requestMIDIAccess', {
          configurable: true, value: async () => ({
            inputs: new Map([['poly-midi', port]]), onstatechange: null
          })
        });
        window.__polyMidi = {
          port, send(bytes) {
            if (!port.onmidimessage) throw new Error('MIDI not initialized');
            port.onmidimessage({ data: Uint8Array.from(bytes) });
          }
        };
        window.__companionOscCount = 0;
        const original = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function (...args) {
          window.__companionOscCount++;
          return original.apply(this, args);
        };
      });
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__polyMidi?.port.onmidimessage);
      await page.getByRole('button', { name: /^Студия$/ }).click();
      const before = await page.evaluate(() => ({
        completed: localStorage.getItem('notare_course_completed_v3'),
        recent: localStorage.getItem('notare_course_recent_v2'),
        lifetime: localStorage.getItem('notare_course_series_v1')
      }));
      await page.getByTestId('repertoire-file-input').setInputFiles({
        name: 'two-staves.musicxml', mimeType: 'text/xml', buffer: Buffer.from(POLY_XML)
      });
      const preview = page.getByTestId('repertoire-preview');
      await preview.waitFor({ state: 'visible', timeout: 35000 });
      await page.getByTestId('repertoire-timeline').waitFor({ state: 'visible', timeout: 30000 });
      const controls = page.getByTestId('repertoire-ab-controls');
      await controls.getByRole('button', { name: 'Выделить' }).click();
      const mode = page.getByTestId('repertoire-practice-mode');
      const button = page.getByTestId('repertoire-trial-toggle');
      const status = page.getByTestId('repertoire-trial-status');
      await mode.selectOption('right');
      assert.ok(await button.isEnabled(), 'right-hand self-paced rehearsal is available on a grand staff');
      await button.click();
      await status.getByText(/Группа 1\/2/).waitFor({ state: 'visible' });
      const beforeAudio = await page.evaluate(() => window.__companionOscCount);
      await page.evaluate(() => {
        for (const [note, velocity] of [[60, 100], [64, 100], [67, 100]])
          window.__polyMidi.send([0x90, note, velocity]);
      });
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Группа 2/2'));
      await page.waitForFunction(min => window.__companionOscCount > min, beforeAudio);
      await page.evaluate(() => {
        for (const note of [60, 64, 67]) window.__polyMidi.send([0x80, note, 0]);
        window.__polyMidi.send([0x90, 62, 100]);
      });
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Пройдены 2 группы'));

      // Both hands: do not accept a chord until all notes are simultaneously held.
      await mode.selectOption('both');
      await button.click();
      await status.getByText(/Группа 1\/3/).waitFor({ state: 'visible' });
      await page.evaluate(() => {
        window.__polyMidi.send([0x90, 48, 100]);
        window.__polyMidi.send([0x90, 60, 100]);
        window.__polyMidi.send([0x80, 60, 0]);
        window.__polyMidi.send([0x90, 64, 100]);
        window.__polyMidi.send([0x90, 67, 100]);
      });
      assert.match(await status.innerText(), /Группа 1\/3/, 'released C4 must be re-attacked');
      await page.evaluate(() => window.__polyMidi.send([0x90, 60, 100]));
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Группа 2/3'));
      await button.click();

      // Other-hand practice: swapped staff assignment, still no course writes.
      await mode.selectOption('left');
      await button.click();
      await status.getByText(/Группа 1\/3/).waitFor({ state: 'visible' });
      await page.evaluate(() => window.__polyMidi.send([0x90, 48, 100]));
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Группа 2/3'));
      await button.click();
      await preview.getByRole('button', { name: 'Вернуться к упражнению' }).click();
      const after = await page.evaluate(() => ({
        completed: localStorage.getItem('notare_course_completed_v3'),
        recent: localStorage.getItem('notare_course_recent_v2'),
        lifetime: localStorage.getItem('notare_course_series_v1')
      }));
      assert.deepEqual(after, before, 'companion and real MIDI cannot award course credit');
      assert.equal(await page.getByTestId('attempt-results').count(), 0);
    } finally { await page.close(); }
    assert.deepEqual(errors, [], 'browser has no runtime errors');
  }
  console.log('Polyphonic A-B rehearsal and complementary hand passed on 375/1440px.');
} finally { await browser.close(); }
