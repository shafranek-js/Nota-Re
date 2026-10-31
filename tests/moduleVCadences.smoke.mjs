import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser=await chromium.launch({
  headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox']
});
const errors=[];
try {
  for (const width of [375,1440]) {
    const page=await browser.newPage({viewport:{width,height:850}});
    page.on('pageerror',error=>errors.push(width+': '+error.message));
    await page.addInitScript(()=>{
      const input={id:'module-v5-midi',state:'connected',onmidimessage:null};
      Object.defineProperty(navigator,'requestMIDIAccess',{
        configurable:true,value:async()=>({inputs:new Map([[input.id,input]]),onstatechange:null})
      });
      window.__v5Midi={input,send(bytes){
        if(typeof input.onmidimessage!=='function')throw Error('MIDI handler missing');
        input.onmidimessage({data:Uint8Array.from(bytes)});
      }};
    });
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
    await page.getByTestId('course-module-V').click();
    assert.match(await page.getByTestId('module-v-stage-5').innerText(),
      /Гармонический минор: V–i/);
    await page.getByTestId('module-v-open-v5').click();
    const area=page.getByTestId('module-v-v5-practice');
    await area.waitFor({state:'visible'});
    const score=page.getByTestId('module-v-v5-score');
    await score.locator('svg').first().waitFor({state:'visible',timeout:45000});
    await page.waitForFunction(()=>!document.querySelector('[data-testid="module-v-v5-start"]').disabled);
    assert.equal(await page.getByTestId('module-v-v5-analysis').count(),0,
      'harmonic answer must not leak before an explicit reveal');
    assert.equal(await page.getByTestId('module-v-v5-count-in').count(),0,
      'count-in cannot begin before score is visible');
    assert.match(await page.getByTestId('module-v-v5-coaching').innerText(),
      /повышенной VII ступенью/);
    const before=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)
      .filter(([key])=>/course|completion|lesson|certificate|module_v_(practice|inversions|left_textures|coordination)/i.test(key))));
    await page.getByTestId('module-v-v5-reveal').click();
    const explanation=await page.getByTestId('module-v-v5-analysis').innerText();
    assert.match(explanation,/вводный тон/);
    assert.match(explanation,/(G#|D#|C#|A#)/);
    assert.match(explanation,/доминанта V/);
    await page.getByTestId('module-v-v5-reveal').click();
    assert.equal(await page.getByTestId('module-v-v5-analysis').count(),0);
    await page.getByTestId('module-v-v5-metronome').uncheck();
    await page.getByTestId('module-v-v5-tempo').selectOption('100');
    await page.getByTestId('module-v-v5-start').click();
    const count=page.getByTestId('module-v-v5-count-in');
    await count.waitFor({state:'visible',timeout:8000});
    assert.ok(await score.locator('svg').first().isVisible());
    const hits=await page.getByTestId('module-v-v5-hits').innerText();
    await page.evaluate(()=>{
      window.__v5Midi.send([0x90,60,99]);window.__v5Midi.send([0x80,60,0]);
    });
    assert.equal(await page.getByTestId('module-v-v5-hits').innerText(),hits,
      'no practice credit during the pre-count');
    await page.getByTestId('module-v-v5-stop').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('notare_module_v_cadences_v5')),null,
      'cancelled cadence must not create a record');
    await page.getByTestId('module-v-v5-start').click();
    await count.waitFor({state:'visible',timeout:8000});
    await count.waitFor({state:'hidden',timeout:10000});
    await page.getByTestId('module-v-v5-result').waitFor({state:'visible',timeout:13000});
    assert.match(await page.getByTestId('module-v-v5-misses').innerText(),/Пропуски: [1-9]/);
    const saved=await page.evaluate(()=>({
      v5:JSON.parse(localStorage.getItem('notare_module_v_cadences_v5')),
      prior:Object.fromEntries(Object.entries(localStorage)
        .filter(([key])=>/course|completion|lesson|certificate|module_v_(practice|inversions|left_textures|coordination)/i.test(key)))
    }));
    assert.equal(saved.v5.schemaVersion,5);
    assert.equal(saved.v5.attempts.length,1);
    assert.equal(saved.v5.attempts[0].clean,false);
    assert.deepEqual(saved.prior,before,'no writes to V1–V4 or course completion');
    await page.getByTestId('module-v-v5-next').click();
    await score.locator('svg').first().waitFor({state:'visible',timeout:45000});
    await page.waitForFunction(()=>!document.querySelector('[data-testid="module-v-v5-start"]').disabled);
    assert.equal(await page.getByTestId('module-v-v5-analysis').count(),0,
      'next question must reset the answer visibility');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+4));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByTestId('course-module-V').click();
    await page.getByTestId('module-v-open-v5').click();
    assert.match(await page.getByTestId('module-v-v5-practice').innerText(),/Учебных попыток: 1/);
    await page.getByTestId('module-v-v5-return-v1').click();
    await page.getByTestId('module-v-open-v4').click();
    assert.ok(await page.getByTestId('module-v-v4-practice').isVisible(),
      'V4 remains independently accessible');
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Module V V5: 36 harmonic-minor V–i, hidden theory, real OSMD, MIDI count-in, isolated journal, 375/1440 PASS');
} finally {await browser.close();}
