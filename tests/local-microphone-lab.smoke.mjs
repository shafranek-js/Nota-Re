/** Local R0E Chrome acceptance with fake OS microphone only. No physical mic. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createLabServer } from '../scripts/serve-local-microphone-lab.mjs';

const server=await createLabServer({port:0});
let browser;
try{
 browser=await chromium.launch({
  headless:true,executablePath:process.env.CHROME_PATH,
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required']
 });
 const context=await browser.newContext({acceptDownloads:true});
 const page=await context.newPage();
 const pageErrors=[];
 const requests=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 page.on('request',req=>requests.push({url:req.url(),method:req.method()}));
 await page.addInitScript(()=>{
   window.__micCalls=0;window.__stream=null;
   const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async (...args)=>{
     window.__micCalls++;
     const stream=await original(...args);
     window.__stream=stream;
     return stream;
   };
 });
 const base='http://127.0.0.1:'+server.address().port;
 await page.goto(base,{waitUntil:'domcontentloaded'});
 assert.equal(await page.evaluate(()=>window.__micCalls),0,'no microphone access before user click');
 assert.equal(await page.locator('#export').isDisabled(),true);
 assert.equal(await page.locator('#stop').isDisabled(),true);
 await page.locator('#start').click();
 await page.waitForFunction(()=>{
   const s=document.querySelector('#status')?.textContent||'';
   return /Идёт локальное распознавание/.test(s) || /Запуск не выполнен/.test(s);
 },null,{timeout:25000});
 const currentStatus=await page.locator('#status').textContent();
 assert.match(currentStatus,/Идёт локальное распознавание/,currentStatus);
 assert.equal(await page.evaluate(()=>window.__micCalls),1);
 await page.waitForFunction(()=>Number(document.querySelector('#frames')?.textContent)>10,
   null,{timeout:20000});
 await page.locator('#stop').click();
 const stopped=await page.evaluate(()=>({
   tracks:window.__stream.getTracks().map(t=>t.readyState), calls:window.__micCalls
 }));
 assert.ok(stopped.tracks.length>0);
 assert.ok(stopped.tracks.every(x=>x==='ended'),'tracks must stop promptly');
 assert.equal(await page.locator('#start').isEnabled(),true);
 assert.equal(await page.locator('#stop').isDisabled(),true);
 assert.equal(await page.locator('#export').isEnabled(),true);
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#export').click();
 const download=await downloadPromise;
 assert.equal(download.suggestedFilename(),'notare-r0e-local-diagnostic.json');
 const result=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.equal(result.experiment,'R0E-local-microphone-opt-in-v1');
 assert.equal(result.audioStored,false);assert.equal(result.audioUploaded,false);
 assert.equal(result.officialCourseCredit,false);
 assert.equal(result.independentMidiReference,false);
 assert.equal(result.midiComparison,null);
 assert.ok(result.frames>10);
 assert.equal(typeof result.counts.estimatedAttacks,'number');
 const json=JSON.stringify(result);
 for(const key of ['midiAttacks','detectorAttacks','sourceWav','audioBytes',
   'deviceId','noteTimeline','audioBuffer'])
   assert.ok(!json.includes('"'+key+'"'),key+' should not leave browser');
 assert.deepEqual(pageErrors,[]);
 assert.ok(requests.every(r=>r.method==='GET'&&r.url.startsWith(base+'/')),
   'never upload audio, requests or captured event data to remote hosts');
 // Consent is never silently acquired on page reload.
 await page.reload({waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('#start').isEnabled(),true);
 assert.equal(await page.locator('#export').isDisabled(),true);
 assert.equal(await page.evaluate(()=>window.__micCalls),0);
 console.log('R0E browser consent, real AudioWorklet frames, stop tracks and private download passed');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
