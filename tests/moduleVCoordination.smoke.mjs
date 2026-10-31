import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const errors=[];
try {
  for (const width of [375, 1440]) {
    const page=await browser.newPage({viewport:{width,height:850}});
    page.on('pageerror', error=>errors.push(error.message));
    await page.addInitScript(() => {
      const input={id:'module-v4-midi',state:'connected',onmidimessage:null};
      Object.defineProperty(navigator,'requestMIDIAccess',{
        configurable:true,value:async()=>({inputs:new Map([[input.id,input]]),onstatechange:null})
      });
      window.__v4Midi={input,send(bytes){
        if(typeof input.onmidimessage!=='function')throw Error('MIDI handler not installed');
        input.onmidimessage({data:Uint8Array.from(bytes)});
      }};
    });
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
    await page.getByTestId('course-module-V').click();
    await page.getByTestId('module-v-open-v4').click();
    await page.getByTestId('module-v-v4-practice').waitFor({state:'visible'});
    const score=page.getByTestId('module-v-v4-score');
    await score.locator('svg').first().waitFor({state:'visible',timeout:45000});
    const start=page.getByTestId('module-v-v4-start');
    await start.waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.querySelector('[data-testid="module-v-v4-start"]').disabled);
    assert.equal(await page.getByTestId('module-v-v4-count-in').count(),0,
      'count-in cannot precede displayed score');
    assert.equal(await page.getByTestId('module-v-v4-result').count(),0);
    assert.match(await page.getByTestId('module-v-v4-coaching').innerText(),/Правая рука удерживает/);
    const old=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)
      .filter(([key])=>/course|completion|lesson|certificate|shadow|module_v_practice_v1|module_v_inversions_v2|module_v_left_textures_v3/i.test(key))));
    await page.getByTestId('module-v-v4-metronome').uncheck();
    await page.getByTestId('module-v-v4-tempo').selectOption('100');
    await start.click();
    const count=page.getByTestId('module-v-v4-count-in');
    await count.waitFor({state:'visible',timeout:8000});
    assert.ok(await score.locator('svg').first().isVisible(),
      'score remains visible during count-in');
    assert.match(await page.getByTestId('module-v-v4-count-beat').innerText(),/^[1-3]$/);
    const before=await page.getByTestId('module-v-v4-hits').innerText();
    await page.evaluate(()=>{window.__v4Midi.send([0x90,48,95]);window.__v4Midi.send([0x80,48,0]);});
    assert.equal(await page.getByTestId('module-v-v4-hits').innerText(),before,
      'pre-count MIDI cannot grant a hit');
    await page.getByTestId('module-v-v4-stop').click();
    assert.equal(await page.getByTestId('module-v-v4-count-in').count(),0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('notare_module_v_coordination_v4')),null,
      'stopped attempt cannot be recorded');
    await start.click();
    await page.getByTestId('module-v-v4-count-in').waitFor({state:'visible'});
    await page.getByTestId('module-v-v4-count-in').waitFor({state:'hidden',timeout:10000});
    await page.getByTestId('module-v-v4-result').waitFor({state:'visible',timeout:12000});
    assert.match(await page.getByTestId('module-v-v4-misses').innerText(),/Пропуски: [1-9]/);
    const saved=await page.evaluate(()=>({
      journal:JSON.parse(localStorage.getItem('notare_module_v_coordination_v4')),
      old:Object.fromEntries(Object.entries(localStorage)
        .filter(([key])=>/course|completion|lesson|certificate|shadow|module_v_practice_v1|module_v_inversions_v2|module_v_left_textures_v3/i.test(key)))
    }));
    assert.equal(saved.journal.schemaVersion,4);
    assert.equal(saved.journal.attempts.length,1);
    assert.equal(saved.journal.attempts[0].clean,false);
    assert.deepEqual(saved.old,old,'V4 does not mutate earlier evidence');
    await page.getByTestId('module-v-v4-next').click();
    await page.getByTestId('module-v-v4-score').locator('svg').first()
      .waitFor({state:'visible',timeout:45000});
    await page.waitForFunction(()=>!document.querySelector('[data-testid="module-v-v4-start"]').disabled);
    assert.match(await page.getByTestId('module-v-v4-coaching').innerText(),/первую долю/);
    assert.match(await page.getByTestId('module-v-v4-practice').innerText(),/4\/4/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+4));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByTestId('course-module-V').click();
    await page.getByTestId('module-v-open-v4').click();
    assert.match(await page.getByTestId('module-v-v4-practice').innerText(),/Учебных попыток: 1/);
    await page.evaluate(()=>localStorage.setItem('notare_module_v_coordination_v4','{invalid'));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByTestId('course-module-V').click();
    await page.getByTestId('module-v-open-v4').click();
    assert.match(await page.getByTestId('module-v-v4-practice').innerText(),/Учебных попыток: 0/);
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Module V V4 Chrome: visible OSMD before count-in, two-hand metered practice, cancellation, independent journal, 375/1440 PASS');
} finally {await browser.close();}
