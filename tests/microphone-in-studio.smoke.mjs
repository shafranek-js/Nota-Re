/** Real in-app Studio microphone acceptance. Chrome's OS mic is FAKE.
 * No external microphone, raw recordings, or lesson scoring.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser=await chromium.launch({
 headless:true,executablePath:process.env.CHROME_PATH,
 args:['--no-sandbox','--use-fake-device-for-media-stream',
   '--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']
});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
const page=await context.newPage();
const errors=[],postRequests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',req=>{if(req.method()!=='GET')postRequests.push(req.url());});
await page.addInitScript(()=>{
 window.__studioMicCalls=0;
 window.__studioMicTracks=[];
 const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 navigator.mediaDevices.getUserMedia=async (...args)=>{
   window.__studioMicCalls++;
   const stream=await original(...args);
   window.__studioMicTracks.push(...stream.getTracks());
   return stream;
 };
});
const base='http://127.0.0.1:4173/';
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});
 assert.equal(await page.evaluate(()=>window.__studioMicCalls),0);
 await page.getByRole('button',{name:'Студия'}).click();
 await page.getByTestId('studio-section-lab').click();
 await page.getByTestId('studio-microphone-toggle').click();
 await page.getByTestId('microphone-research-panel').waitFor();
 assert.equal(await page.evaluate(()=>window.__studioMicCalls),0,
   'opening the real app Laboratory must NOT request mic permission');
 assert.equal(await page.getByTestId('microphone-export').isDisabled(),true);
 await page.getByTestId('microphone-start').click();
 await page.waitForFunction(()=>{
   const msg=document.querySelector('[data-testid="microphone-status"]')?.textContent||'';
   return msg.includes('Прослушивание активно')||msg.includes('Запуск не удался');
 },null,{timeout:30000});
 const status=await page.getByTestId('microphone-status').textContent();
 assert.match(status,/Прослушивание активно/,status);
 assert.equal(await page.evaluate(()=>window.__studioMicCalls),1);
 await page.waitForFunction(()=>Number(document.querySelector('[data-testid="microphone-frames"]')?.textContent)>10,
   null,{timeout:20000});
 assert.equal(await page.getByTestId('microphone-start').isDisabled(),true);
 await page.getByTestId('microphone-stop').click();
 const states=await page.evaluate(()=>window.__studioMicTracks.map(t=>t.readyState));
 assert.ok(states.length>0 && states.every(s=>s==='ended'),
   'the app must stop all mic tracks immediately');
 assert.equal(await page.getByTestId('microphone-export').isEnabled(),true);
 const waiting=page.waitForEvent('download');
 await page.getByTestId('microphone-export').click();
 const download=await waiting;
 const json=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.equal(json.experiment,'R0E-in-app-microphone-diagnostics-v1');
 assert.equal(json.officialCredit,false);
 assert.equal(json.audioUploaded,false);
 assert.equal(json.audioRecorded,false);
 assert.equal(json.midiToCallbackAgreement,null);
 assert.equal(json.independentMidiReference,false);
 assert.ok(json.frameCount>10);
 const asJson=JSON.stringify(json);
 for(const secret of ['"midi"','"observed"','"atMs"','"deviceId"',
   '"rawAudio"','"audioBytes"','"sourceWav"'])
   assert.ok(!asJson.includes(secret),'report must never include '+secret);
 // Test navigation disposal with real live input, not merely a manual Stop.
 await page.getByTestId('microphone-start').click();
 await page.waitForFunction(()=>document.querySelector('[data-testid="microphone-status"]')
   ?.textContent?.includes('Прослушивание активно'),null,{timeout:30000});
 await page.getByRole('button',{name:'Курс'}).click();
 const gone=await page.evaluate(()=>window.__studioMicTracks.map(t=>t.readyState));
 assert.ok(gone.every(s=>s==='ended'), 'workspace exit MUST stop microphone capture');
 assert.deepEqual(postRequests,[], 'no outbound POST/data transmissions');
 assert.deepEqual(errors,[], 'no browser JS errors');
 console.log('Nota-Re Studio integrated microphone: consent, genuine AudioWorklet frames, stop, export, navigation cleanup PASSED');
}finally{await browser.close();}
