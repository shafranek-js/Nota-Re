import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const XML = `<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0">
<movement-title>Barline ties MIDI practice</movement-title>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
<measure number="1">
 <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>
 <clef number="1"><sign>G</sign><line>2</line></clef>
 <clef number="2"><sign>F</sign><line>4</line></clef></attributes>
 <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
 <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration>
 <tie type="start"/><voice>1</voice><type>half</type><staff>1</staff><notations><tied type="start"/></notations></note>
 <backup><duration>4</duration></backup>
 <note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
</measure>
<measure number="2">
 <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration>
 <tie type="stop"/><voice>1</voice><type>half</type><staff>1</staff><notations><tied type="stop"/></notations></note>
 <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
 <backup><duration>4</duration></backup>
 <note><pitch><step>A</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
</measure>
</part>
</score-partwise>`;

const browser=await chromium.launch({
 headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox']
});
try{
 for(const width of [375,1440]){
  const page=await browser.newPage({viewport:{width,height:850}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.addInitScript(()=>{
     const port={id:'tie-midi',state:'connected',onmidimessage:null};
     Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,
       value:async()=>({inputs:new Map([[port.id,port]]),onstatechange:null})});
     window.__tieMidi={send(data){port.onmidimessage({data:Uint8Array.from(data)});}};
   });
   await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.__tieMidi);
   await page.getByRole('button',{name:/^Студия$/}).click();
   const before=await page.evaluate(()=>localStorage.getItem('notare_course_completed_v3'));
   await page.getByTestId('repertoire-file-input').setInputFiles({
     name:'tie-across-measure.musicxml',mimeType:'text/xml',buffer:Buffer.from(XML)});
   await page.getByTestId('repertoire-timeline').waitFor({state:'visible',timeout:35000});
   const score=page.getByTestId('repertoire-score');
   await score.locator('svg').first().waitFor({state:'visible'});
   const timeline=page.getByTestId('repertoire-timeline');
   assert.equal(await timeline.getAttribute('data-ties'),'1');
   const ab=page.getByTestId('repertoire-ab-controls');
   await ab.getByLabel('Конечный такт B').fill('2');
   await ab.getByRole('button',{name:'Выделить'}).click();
   const mode=page.getByTestId('repertoire-practice-mode');
   const toggle=page.getByTestId('repertoire-trial-toggle');
   const status=page.getByTestId('repertoire-trial-status');
   await mode.selectOption('both');
   await page.waitForFunction(()=>!document.querySelector('[data-testid="repertoire-trial-toggle"]').disabled);
   await toggle.click();
   await page.waitForFunction(()=>document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Группа 1/4'));
   await page.evaluate(()=>window.__tieMidi.send([0x90,55,100]));
   await page.waitForFunction(()=>document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Группа 2/4'));
   await page.evaluate(()=>window.__tieMidi.send([0x90,60,100]));
   await page.waitForFunction(()=>document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Группа 3/4'));
   await page.evaluate(()=>window.__tieMidi.send([0x90,57,100]));
   await page.waitForFunction(()=>document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Группа 4/4'));
   await page.evaluate(()=>window.__tieMidi.send([0x90,62,100]));
   await page.waitForFunction(()=>document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Пройдены 4 группы'));
   assert.match(await status.innerText(),/Пройдены 4 группы · ошибок: 0/);
   // A second attempt with an early C4 release must NOT earn that group.
   await toggle.click();
   await page.evaluate(()=>{
     for(const n of [55,60,57,62])window.__tieMidi.send([0x80,n,0]);
   });
   await page.evaluate(()=>window.__tieMidi.send([0x90,55,99]));
   await page.waitForFunction(()=>document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Группа 2/4'));
   await page.evaluate(()=>{
      window.__tieMidi.send([0x90,60,99]);
      window.__tieMidi.send([0x80,60,0]);
      window.__tieMidi.send([0x90,57,99]);
   });
   await page.waitForFunction(()=>document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Группа 4/4'));
   assert.match(await status.innerText(),/верно: 2 · ошибок: 1/);
   await toggle.click();
   // Selecting only bar 2 cuts the incoming tie; the exercise must fail closed.
   await ab.getByLabel('Начальный такт A').fill('2');
   await ab.getByRole('button',{name:'Выделить'}).click();
   assert.match(await status.innerText(),/разрывает связующую лигу/);
   assert.equal(await toggle.isDisabled(),true);
   assert.equal(await page.evaluate(()=>localStorage.getItem('notare_course_completed_v3')),before);
   assert.deepEqual(errors,[]);
  }finally{await page.close();}
 }
 console.log('Repertoire ties: barline continuation never re-attacked, physical hold, truncated A-B disabled, Chrome 375/1440 PASS');
}finally{await browser.close();}
