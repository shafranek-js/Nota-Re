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
      const input={id:'harmonic-minor-midi',state:'connected',onmidimessage:null};
      const access={inputs:new Map([[input.id,input]]),onstatechange:null};
      Object.defineProperty(navigator,'requestMIDIAccess',{
        configurable:true,value:async()=>access
      });
      window.__harmonicMidi={
        input,
        send(bytes){
          if(typeof input.onmidimessage!=='function')throw Error('MIDI listener missing');
          input.onmidimessage({data:Uint8Array.from(bytes)});
        }
      };
    });
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.__harmonicMidi.input.onmidimessage==='function');
    const courseSnapshot=async()=>page.evaluate(()=>Object.fromEntries(
      Object.entries(localStorage).filter(([key])=>
        /course|completion|lesson|certificate|shadow/i.test(key))
    ));
    const before=await courseSnapshot();
    await page.getByRole('button',{name:/^Студия$/}).click();
    await page.getByTestId('toolbar-trigger-rhythm').click();
    await page.getByTestId('open-accompaniment-study').click();
    await page.getByTestId('two-hand-practice').waitFor({state:'visible'});
    assert.equal(await page.getByTestId('accompaniment-minor-form').count(),0,
      'major chord cannot silently activate harmonic minor');
    await page.getByTestId('chord-quality').selectOption('minor');
    assert.equal(await page.getByTestId('accompaniment-minor-form').inputValue(),'natural',
      'natural minor must remain explicit default');
    assert.equal(await page.getByTestId('accompaniment-left-notes').innerText(),'A2 · C3 · E3');
    await page.getByTestId('accompaniment-minor-form').selectOption('harmonic');
    assert.equal(await page.getByTestId('accompaniment-left-notes').innerText(),'E3 · G#3 · B3');
    assert.equal(await page.getByTestId('harmonic-resolution-left').innerText(),'A2 · C3 · E3');
    assert.match(await page.getByTestId('harmonic-cadence-details').innerText(),/G#/);
    assert.match(await page.getByTestId('harmonic-cadence-details').innerText(),/V/);
    await page.locator('[aria-label="Независимые партии двух рук OpenSheetMusicDisplay"] svg')
      .first().waitFor({state:'visible',timeout:45000});
    const step=page.getByTestId('two-hand-step-index');
    assert.equal(await step.innerText(),'1');
    await page.getByTestId('accompaniment-texture').selectOption('waltz');
    assert.match(await page.getByTestId('accompaniment-details').innerText(),/3\/4/);
    await page.getByTestId('accompaniment-hands').selectOption('both');
    assert.equal(await page.getByTestId('accompaniment-right-notes').innerText(),'E4 · G#4 · B4');
    assert.equal(await page.getByTestId('harmonic-resolution-right').innerText(),'A4 · C5 · E5');
    await page.getByTestId('vertical-chord-reading').locator('summary').click();
    const verticals = page.getByTestId('vertical-chord-guide-list').locator('li');
    assert.equal(await verticals.count(), 2, 'V and i are distinct actual RH verticals');
    assert.match(await verticals.nth(0).innerText(), /E мажор.*5\/3.*G♯/);
    assert.match(await verticals.nth(1).innerText(), /A минор.*5\/3/);
    await page.evaluate(()=>window.__harmonicMidi.send([0x90,52,100]));
    assert.equal(await step.innerText(),'1','bass alone never satisfies simultaneous V');
    await page.evaluate(()=>{
      for(const pitch of [64,68,71]) window.__harmonicMidi.send([0x90,pitch,100]);
    });
    await page.waitForFunction(()=>
      document.querySelector('[data-testid="two-hand-step-index"]')?.textContent==='2');
    await page.getByTestId('chord-key').selectOption('G');
    assert.equal(await step.innerText(),'1');
    assert.equal(await page.getByTestId('accompaniment-left-notes').innerText(),'B2 · D#3 · F#3');
    assert.equal(await page.getByTestId('accompaniment-right-notes').innerText(),'B4 · D#5 · F#5');
    assert.match(await page.getByTestId('harmonic-cadence-details').innerText(),/D#/);
    await page.getByTestId('chord-key').selectOption('F');
    assert.equal(await page.getByTestId('accompaniment-left-notes').innerText(),'A2 · C#3 · E3');
    assert.match(await page.getByTestId('harmonic-cadence-details').innerText(),/C#/);
    await page.getByTestId('chord-key').selectOption('D');
    assert.equal(await page.getByTestId('accompaniment-left-notes').innerText(),'F#2 · A#2 · C#3');
    assert.match(await page.getByTestId('harmonic-cadence-details').innerText(),/A#/);
    await page.getByTestId('accompaniment-hands').selectOption('left');
    await page.getByTestId('accompaniment-octave').selectOption('12');
    assert.equal(await page.getByTestId('accompaniment-left-notes').innerText(),'F#3 · A#3 · C#4');
    assert.equal(await page.getByTestId('harmonic-resolution-left').innerText(),'B3 · D4 · F#4');
    assert.equal(await page.getByTestId('accompaniment-right-notes').count(),0);
    await page.getByTestId('accompaniment-minor-form').selectOption('natural');
    assert.equal(await page.getByTestId('harmonic-cadence-details').count(),0);
    assert.equal(await page.getByTestId('accompaniment-left-notes').innerText(),'B3 · D4 · F#4');
    await page.getByTestId('chord-quality').selectOption('major');
    assert.equal(await page.getByTestId('accompaniment-minor-form').count(),0);
    await page.getByTestId('chord-quality').selectOption('minor');
    assert.equal(await page.getByTestId('accompaniment-minor-form').inputValue(),'natural',
      'switching tonality cannot secretly restore harmonic leading tone');
    await page.locator('[aria-label="Независимые партии двух рук OpenSheetMusicDisplay"] svg')
      .first().waitFor({state:'visible',timeout:45000});
    assert.deepEqual(await courseSnapshot(),before,'no harmonic-minor study grants course credit');
    assert.equal(await page.getByTestId('two-hand-shadow-series').count(),0);
    await page.getByRole('button',{name:'Вернуться к тренажёру'}).click();
    assert.equal(await page.getByTestId('two-hand-practice').count(),0);
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Harmonic minor Chrome: four minor keys, raised seventh, V-i MIDI, waltz 3/4, 25-key LH, 375/1440, course isolation.');
} finally {
  await browser.close();
}
