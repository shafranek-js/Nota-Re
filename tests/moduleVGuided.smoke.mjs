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
      const input={id:'module-v-midi',state:'connected',onmidimessage:null};
      Object.defineProperty(navigator,'requestMIDIAccess',{
        configurable:true,
        value:async()=>({inputs:new Map([[input.id,input]]),onstatechange:null})
      });
      window.__moduleVMidi = { input, send(bytes) {
        if(typeof input.onmidimessage!=='function')throw Error('MIDI handler missing');
        input.onmidimessage({data:Uint8Array.from(bytes)});
      }};
    });
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.__moduleVMidi.input.onmidimessage==='function');
    const previous = await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)
      .filter(([key]) => /course|completion|lesson|certificate|shadow/i.test(key))));
    assert.equal(await page.getByTestId('course-lesson-12').count(),1);
    await page.getByTestId('course-module-V').click();
    await page.getByTestId('module-v-workspace').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-testid^="module-v-stage-"]').count(),5);
    assert.equal(await page.getByTestId('module-v-start-v1').count(),1);
    assert.match(await page.getByTestId('module-v-practice-status').innerText(),/пока не зарегистрирована/);
    assert.equal(await page.getByTestId('course-lesson-12').count(),0,
      'separate module page, not a renamed legacy lesson');

    await page.getByTestId('module-v-start-v1').click();
    await page.getByTestId('two-hand-practice').waitFor({state:'visible'});
    assert.match(await page.getByTestId('module-v-guided-intro').innerText(),/V1.*5\/3/);
    assert.equal(await page.getByTestId('chord-notes').innerText(),'C4 · E4 · G4');
    assert.equal(await page.getByTestId('two-hand-family').count(),0,
      'the guided score cannot secretly become a free exercise');
    assert.equal(await page.getByTestId('chord-inversion').count(),0);
    assert.equal(await page.getByTestId('two-hand-start-tempo').count(),0);
    assert.match(await page.getByTestId('module-v-midi-evidence').innerText(),/ожидаются четыре/);
    await page.locator('[aria-label="Независимые партии двух рук OpenSheetMusicDisplay"] svg')
      .first().waitFor({state:'visible',timeout:45000});
    await page.getByTestId('vertical-chord-reading').locator('summary').click();
    assert.match(await page.getByTestId('vertical-chord-guide-list').innerText(),/C мажор.*5\/3/);
    const step=page.getByTestId('two-hand-step-index');
    for (let index=0;index<4;index++){
      await page.evaluate(()=>{
        for(const midi of [60,64,67])window.__moduleVMidi.send([0x90,midi,100]);
      });
      if (index < 3) {
        await page.waitForFunction(expected => document.querySelector(
          '[data-testid="two-hand-step-index"]')?.textContent === String(expected),index+2);
      }
      await page.evaluate(()=>{
        for(const midi of [60,64,67])window.__moduleVMidi.send([0x80,midi,0]);
      });
    }
    await page.waitForFunction(() => document.querySelector('[data-testid="module-v-midi-evidence"]')
      ?.textContent?.includes('зарегистрирована'));
    assert.equal(await step.innerText(),'4');
    const after = await page.evaluate(()=>({
      old: Object.fromEntries(Object.entries(localStorage)
        .filter(([key])=>/course|completion|lesson|certificate|shadow/i.test(key))),
      moduleV:localStorage.getItem('notare_module_v_practice_v1')
    }));
    assert.deepEqual(after.old,previous,'Module V cannot alter official course ledgers');
    assert.deepEqual(JSON.parse(after.moduleV).completedFixtures,['C-major-5-3']);
    await page.getByTestId('module-v-return').click();
    await page.getByTestId('module-v-workspace').waitFor({state:'visible'});
    assert.match(await page.getByTestId('module-v-practice-status').innerText(),/выполнены ранее/);
    await page.getByTestId('module-v-back').click();
    assert.equal(await page.getByTestId('course-lesson-12').count(),1,
      'legacy course is still accessible');

    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByTestId('course-module-V').click();
    assert.match(await page.getByTestId('module-v-practice-status').innerText(),/выполнены ранее/,
      'isolated ungraded study evidence survives reload');
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Module V V1 Chrome: 375/1440 OSMD, real MIDI, return, reload and legacy-grade isolation PASS.');
} finally {
  await browser.close();
}
