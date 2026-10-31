import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const errors = [];
try {
  for(const width of [375,1440]) {
    const page = await browser.newPage({viewport:{width,height:850}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      const input={id:'accompaniment-midi',state:'connected',onmidimessage:null};
      const access={inputs:new Map([[input.id,input]]),onstatechange:null};
      Object.defineProperty(navigator,'requestMIDIAccess',{
        configurable:true,value:async()=>access
      });
      window.__accompanimentMidi={
        input,
        send(bytes){
          if(typeof input.onmidimessage!=='function')throw Error('MIDI handler unavailable');
          input.onmidimessage({data:Uint8Array.from(bytes)});
        }
      };
    });
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.__accompanimentMidi.input.onmidimessage==='function');
    const courseSnapshot=async()=>page.evaluate(()=>Object.fromEntries(
      Object.entries(localStorage).filter(([key])=>
        /course|completion|lesson|certificate|shadow/i.test(key))
    ));
    const before=await courseSnapshot();
    await page.getByRole('button',{name:/^Студия$/}).click();
    await page.getByTestId('toolbar-trigger-rhythm').click();
    await page.getByTestId('open-accompaniment-study').click();
    await page.getByTestId('two-hand-practice').waitFor({state:'visible'});
    assert.equal(await page.getByTestId('two-hand-family').inputValue(),'accompaniment');
    assert.equal(await page.getByTestId('accompaniment-texture').inputValue(),'alberti');
    assert.equal(await page.getByTestId('accompaniment-hands').inputValue(),'left');
    assert.match(await page.getByTestId('accompaniment-description').innerText(),/Без автоматического зачёта/);
    assert.match(await page.getByTestId('accompaniment-details').innerText(),/4\/4/);
    assert.equal(await page.getByTestId('accompaniment-left-notes').innerText(),'C3 · E3 · G3');
    assert.equal(await page.getByTestId('accompaniment-right-notes').count(),0);
    await page.locator('[aria-label="Независимые партии двух рук OpenSheetMusicDisplay"] svg')
      .first().waitFor({state:'visible',timeout:45000});
    const step=page.getByTestId('two-hand-step-index');
    assert.equal(await step.innerText(),'1');
    await page.evaluate(()=>window.__accompanimentMidi.send([0x90,48,100]));
    await page.waitForFunction(()=>document.querySelector('[data-testid="two-hand-step-index"]')?.textContent==='2');
    await page.evaluate(()=>{
      window.__accompanimentMidi.send([0x80,48,0]);
      window.__accompanimentMidi.send([0x90,55,100]);
    });
    await page.waitForFunction(()=>document.querySelector('[data-testid="two-hand-step-index"]')?.textContent==='3');

    await page.getByTestId('accompaniment-texture').selectOption('waltz');
    assert.equal(await step.innerText(),'1');
    assert.match(await page.getByTestId('accompaniment-details').innerText(),/3\/4/);
    assert.match(await page.getByTestId('two-hand-start-tempo').innerText(),/3 доли/);
    await page.locator('[aria-label="Независимые партии двух рук OpenSheetMusicDisplay"] svg')
      .first().waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>window.__accompanimentMidi.send([0x90,48,100]));
    await page.waitForFunction(()=>document.querySelector('[data-testid="two-hand-step-index"]')?.textContent==='2');
    await page.evaluate(()=>{
      window.__accompanimentMidi.send([0x80,48,0]);
      window.__accompanimentMidi.send([0x90,52,100]);
      window.__accompanimentMidi.send([0x90,55,100]);
    });
    await page.waitForFunction(()=>document.querySelector('[data-testid="two-hand-step-index"]')?.textContent==='3');
    await page.getByTestId('accompaniment-hands').selectOption('both');
    assert.equal(await step.innerText(),'1');
    assert.equal(await page.getByTestId('accompaniment-right-notes').innerText(),'C4 · E4 · G4');
    await page.evaluate(()=>{
      for(const note of [48,52,55,60,64,67])
        window.__accompanimentMidi.send([0x80,note,0]);
      window.__accompanimentMidi.send([0x90,48,110]);
    });
    assert.equal(await step.innerText(),'1','bass alone cannot substitute for RH inversion');
    await page.evaluate(()=>{
      for(const note of [60,64,67])window.__accompanimentMidi.send([0x90,note,110]);
    });
    await page.waitForFunction(()=>document.querySelector('[data-testid="two-hand-step-index"]')?.textContent==='2');
    await page.getByTestId('chord-inversion').selectOption('1');
    assert.equal(await step.innerText(),'1');
    assert.equal(await page.getByTestId('accompaniment-right-notes').innerText(),'E4 · G4 · C5');
    await page.getByTestId('accompaniment-texture').selectOption('arpeggio');
    assert.match(await page.getByTestId('accompaniment-details').innerText(),/4\/4/);
    await page.getByTestId('chord-key').selectOption('D');
    await page.getByTestId('chord-quality').selectOption('minor');
    assert.equal(await page.getByTestId('accompaniment-left-notes').innerText(),'B2 · D3 · F#3');
    assert.equal(await page.getByTestId('accompaniment-right-notes').innerText(),'D4 · F#4 · B4');
    await page.locator('[aria-label="Независимые партии двух рук OpenSheetMusicDisplay"] svg')
      .first().waitFor({state:'visible',timeout:45000});
    assert.deepEqual(await courseSnapshot(),before,'neither hand mode may change graded course records');
    assert.equal(await page.getByTestId('two-hand-shadow-series').count(),0);
    await page.getByRole('button',{name:'Вернуться к тренажёру'}).click();
    await page.getByTestId('two-hand-practice').waitFor({state:'detached'});
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Accompaniment Chrome: 375/1440 OSMD, Alberti, true 3/4 waltz, both hands, inversions, arpeggio and course isolation.');
} finally { await browser.close(); }
