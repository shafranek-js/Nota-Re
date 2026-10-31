import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const XML=`<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0">
<movement-title>Independent same-staff voices and held accompaniment</movement-title>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1">
<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>
<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef>
<clef number="2"><sign>F</sign><line>4</line></clef></attributes>
<direction><sound tempo="30"/></direction>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
<note><rest/><duration>2</duration><voice>2</voice><type>half</type><staff>1</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>A</step><octave>3</octave></pitch><duration>4</duration><voice>3</voice><type>whole</type><staff>2</staff></note>
<backup><duration>4</duration></backup>
<note><rest/><duration>1</duration><voice>4</voice><type>quarter</type><staff>2</staff></note>
<note><pitch><step>G</step><octave>3</octave></pitch><duration>2</duration><voice>4</voice><type>half</type><staff>2</staff></note>
<note><rest/><duration>1</duration><voice>4</voice><type>quarter</type><staff>2</staff></note>
</measure></part></score-partwise>`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,
 args:['--no-sandbox']});
try {
 for(const width of [375,1440]) {
  const page=await browser.newPage({viewport:{width,height:850}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
   await page.addInitScript(()=>{
     localStorage.setItem('notare-piano-output-v1','oscillator');
     const port={id:'multi-voice-midi',state:'connected',onmidimessage:null};
     Object.defineProperty(navigator,'requestMIDIAccess',{
       configurable:true,value:async()=>({inputs:new Map([[port.id,port]]),onstatechange:null})
     });
     window.__voices={port,send(...notes){
       for(const midi of notes)port.onmidimessage({data:Uint8Array.from([0x90,midi,95])});
     }};
     window.__oscCount=0; window.__earlyStops=0;
     const original=AudioContext.prototype.createOscillator;
     AudioContext.prototype.createOscillator=function(...args) {
       const oscillator=original.apply(this,args);
       window.__oscCount++;
       const oldStop=oscillator.stop.bind(oscillator);
       let stops=0;
       oscillator.stop=function(...stopArgs){
         if(++stops>1)window.__earlyStops++;
         return oldStop(...stopArgs);
       };
       return oscillator;
     };
   });
   await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.__voices?.port?.onmidimessage);
   await page.getByRole('button',{name:/^Студия$/}).click();
   const prior=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)
      .filter(([key])=>/notare_course_(completed|recent|series)/.test(key))));
   await page.getByTestId('repertoire-file-input').setInputFiles({
     name:'independent-voices.musicxml',mimeType:'text/xml',buffer:Buffer.from(XML)
   });
   const score=page.getByTestId('repertoire-score');
   await score.locator('svg').first().waitFor({state:'visible',timeout:35000});
   const timeline=page.getByTestId('repertoire-timeline');
   await timeline.waitFor({state:'visible'});
   assert.equal(await timeline.getAttribute('data-voices'),'4');
   await page.getByTestId('repertoire-ab-controls').getByRole('button',{name:'Выделить'}).click();
   const mode=page.getByTestId('repertoire-practice-mode');
   await mode.selectOption('right');
   const toggle=page.getByTestId('repertoire-trial-toggle');
   const status=page.getByTestId('repertoire-trial-status');
   await page.waitForFunction(()=>!document.querySelector('[data-testid="repertoire-trial-toggle"]').disabled);
   await toggle.click();
   await page.waitForFunction(()=>document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Группа 1/3'));
   await page.evaluate(()=>window.__voices.send(60,64));
   await page.waitForFunction(()=>document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Группа 2/3'));
   await page.waitForFunction(()=>window.__oscCount>=2);
   const afterFirst=await page.evaluate(()=>({osc:window.__oscCount,stops:window.__earlyStops}));
   await page.evaluate(()=>window.__voices.send(67));
   await page.waitForFunction(()=>document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Группа 3/3'));
   await page.waitForFunction(previous=>window.__oscCount>=previous+2,afterFirst.osc);
   const afterSecond=await page.evaluate(()=>({osc:window.__oscCount,stops:window.__earlyStops}));
   assert.equal(afterSecond.stops,afterFirst.stops,
     'second independent accompaniment entry must not cancel the long first tone');
   await page.evaluate(()=>window.__voices.send(62));
   await page.waitForFunction(()=>document.querySelector('[data-testid="repertoire-trial-status"]')?.textContent?.includes('Пройдены 3 группы'));
   assert.match(await status.innerText(),/ошибок: 0/);
   await toggle.click();
   await page.waitForFunction(previous=>window.__earlyStops>previous,afterSecond.stops);
   const after=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)
      .filter(([key])=>/notare_course_(completed|recent|series)/.test(key))));
   assert.deepEqual(after,prior,'repertoire practice is strictly ungraded');
   assert.deepEqual(errors,[]);
  } finally {await page.close();}
 }
 console.log('Repertoire: 4 independent MusicXML voices, overlapping AudioContext accompaniment not cancelled, explicit stop and no grading, 375/1440 PASS');
} finally {await browser.close();}
