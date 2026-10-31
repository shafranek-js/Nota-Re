/** Opt-in local microphone experiment. NOT imported by Nota-Re Academy. */
import { createStreamingAttackTracker } from '/tracker.mjs';
import { compareMicrophoneWithMidi, createPrivacyReport,
  safeDiagnosticEvent, MAX_DIAGNOSTIC_EVENTS } from '/report.mjs';
const $ = id => document.getElementById(id);
const startButton = $('start'), stopButton = $('stop'), exportButton = $('export');
const midiButton = $('midi-enable'), midiSelect = $('midi-input');
const settings = Object.freeze({
  echoCancellation:false, noiseSuppression:false, autoGainControl:false
});
let access=null, attachedInput=null, detector=null, mediaStream=null;
let session=null, timer=null, epoch=0, starting=false;
let finishReport=null;
const notesView=[];
function status(msg) { $('status').textContent=msg; }
function midiTime(event) {
  const received=performance.now();
  return Number.isFinite(event.timeStamp) && Math.abs(event.timeStamp-received)<10000
    ? event.timeStamp : received;
}
function attachInput(input) {
  if(attachedInput)attachedInput.removeEventListener('midimessage',onMidi);
  attachedInput=input;
  if(attachedInput)attachedInput.addEventListener('midimessage',onMidi);
}
function onMidi(event) {
  if(!session || !attachedInput || !event?.data)return;
  const [statusByte=0,pitch=0,velocity=0]=event.data;
  const kind=statusByte&0xf0;
  if(kind===0xb0&&pitch===64) {
    session.pedalEvents++;
  } else if(kind===0x90&&velocity>0&&pitch>=21&&pitch<=108&&
      session.midiAttacks.length<MAX_DIAGNOSTIC_EVENTS) {
    session.midiAttacks.push(safeDiagnosticEvent({midi:pitch,atMs:midiTime(event)},'midi'));
    $('midi-count').textContent=String(session.midiAttacks.length);
  }
}
function refreshMidi() {
  if(!access)return;
  const selected=midiSelect.value;
  const inputs=[...access.inputs.values()];
  midiSelect.replaceChildren(new Option('Нет независимого MIDI-эталона',''));
  for(const input of inputs) midiSelect.add(new Option(input.name||'MIDI-вход',input.id));
  if(inputs.some(input=>input.id===selected))midiSelect.value=selected;
  midiSelect.disabled=inputs.length===0||Boolean(session)||starting;
  attachInput(inputs.find(x=>x.id===midiSelect.value)||null);
}
midiButton.addEventListener('click',async()=>{
  if(!navigator.requestMIDIAccess){status('Web MIDI не поддерживается. Можно тестировать только микрофон.');return;}
  midiButton.disabled=true;
  try{
    access=await navigator.requestMIDIAccess({sysex:false});
    access.addEventListener('statechange',refreshMidi);
    refreshMidi();
    status('MIDI доступен. При необходимости выберите вход, соответствующий звучащему инструменту.');
  }catch(error){
    status('Нет доступа к MIDI: '+(error?.message||String(error)));
    midiButton.disabled=false;
  }
});
midiSelect.addEventListener('change',()=>{if(!session)refreshMidi();});
function updateCounts(){
  if(!session)return;
  $('frames').textContent=String(session.frames);
  $('detected').textContent=String(session.detectedAttacks.length);
  $('elapsed').textContent=Math.round((performance.now()-session.startWall)/1000)+' с';
}
function clearTimer(){if(timer!==null){clearTimeout(timer);timer=null;}}
function stop(reason='Сессия остановлена. Микрофон отключён.'){
  ++epoch;
  clearTimer();
  try{detector?.stop();}catch{}
  detector=null;
  mediaStream?.getTracks().forEach(track=>track.stop());
  mediaStream=null;
  const completed=session;
  session=null;
  starting=false;
  startButton.disabled=false;stopButton.disabled=true;
  midiSelect.disabled=!access || access.inputs.size===0;
  if(completed){
    const durationMs=Math.min(130000,Math.max(0,performance.now()-completed.startWall));
    try{
      finishReport=createPrivacyReport({
        engine:'pitchplease@3.1.0:piano / incremental-2-frame',
        startedAtIso:completed.startedAtIso,durationMs,frames:completed.frames,
        microphoneSettings:settings,micAvailable:true,
        midiSelected:completed.midiSelected,midiAttacks:completed.midiAttacks,
        detectorAttacks:completed.detectedAttacks,
        pedalEvents:completed.pedalEvents,
        warnings:completed.warnings
      });
      exportButton.disabled=false;
      $('elapsed').textContent=Math.round(durationMs/1000)+' с';
    }catch(error){
      finishReport=null;
      exportButton.disabled=true;
      status('Ошибка проверки отчёта: '+(error?.message||error));
      return;
    }
  }
  status(reason);
}
stopButton.addEventListener('click',()=>stop());
function noteName(midi){
  const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','H'];
  return names[midi%12]+(Math.floor(midi/12)-1);
}
startButton.addEventListener('click',async()=>{
  if(starting||session)return;
  starting=true;const myEpoch=++epoch;
  finishReport=null;exportButton.disabled=true;
  notesView.length=0;$('notes').textContent='—';
  $('frames').textContent='0';$('detected').textContent='0';
  $('midi-count').textContent=attachedInput?'0':'—';$('elapsed').textContent='0 с';
  startButton.disabled=true;stopButton.disabled=false;
  midiSelect.disabled=true;
  status('Запрашивается доступ к микрофону...');
  let acquired=null, created=null;
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Микрофон недоступен: нужен HTTPS или localhost.');
    // Only this explicit Start button may request microphone access.
    acquired=await navigator.mediaDevices.getUserMedia({audio:settings,video:false});
    if(myEpoch!==epoch){acquired.getTracks().forEach(t=>t.stop());return;}
    const pkg=await import('/pitchplease.js');
    if(pkg.version!=='3.1.0'||!pkg.models.some(x=>x.id==='piano'))throw Error('Неверная версия ML-модели.');
    const tracker=createStreamingAttackTracker();
    const now=performance.now();
    const current={
      startWall:now,startedAtIso:new Date().toISOString(),
      frames:0,detectedAttacks:[],midiAttacks:[],
      pedalEvents:0, midiSelected:Boolean(attachedInput),
      warnings:[],tracker
    };
    session=current;
    created=pkg.create({
      model:'piano',
      onNotes(notes,frame){
        if(session!==current)return;
        try{
          current.frames++;
          const delivery=performance.now();
          const attacks=tracker.push({time:frame.time,notes});
          for(const attack of attacks) {
            if(current.detectedAttacks.length>=MAX_DIAGNOSTIC_EVENTS)continue;
            current.detectedAttacks.push(safeDiagnosticEvent({
              midi:attack.midi,atMs:delivery,confidence:attack.confidence
            },'detected'));
            notesView.unshift(noteName(attack.midi)+'   '+Math.round(attack.confidence*100)+'%');
          }
          if(notesView.length>12)notesView.length=12;
          if(attacks.length)$('notes').textContent=notesView.join('\n');
          if(current.frames%8===0)updateCounts();
        }catch(error){
          current.warnings.push('Model callback error: '+(error?.message||String(error)));
          stop('Ошибка обработки аудиокадра. Микрофон отключён.');
        }
      },
      onError(error){
        if(session===current){
          current.warnings.push('AudioWorklet: '+(error?.message||String(error)));
          stop('Ошибка потокового движка. Микрофон отключён.');
        }
      }
    });
    detector=created;mediaStream=acquired;
    if(!await detector.start(acquired))throw Error('AudioWorklet не начал обработку.');
    if(myEpoch!==epoch)return;
    starting=false;
    status('Идёт локальное распознавание. Аудио не сохраняется.');
    timer=setTimeout(()=>stop('Лимит 120 секунд. Микрофон автоматически отключён.'),120000);
    const tracks=acquired.getAudioTracks();
    tracks.forEach(track=>track.addEventListener('ended',()=>{
      if(session===current)stop('Микрофон отключился. Сессия остановлена.');
    },{once:true}));
  }catch(error){
    if(myEpoch!==epoch){acquired?.getTracks().forEach(t=>t.stop());return;}
    try{created?.stop();}catch{}
    acquired?.getTracks().forEach(t=>t.stop());
    // An unsuccessful permission/model setup must not produce a report.
    session=null;mediaStream=null;detector=null;starting=false;
    startButton.disabled=false;stopButton.disabled=true;
    midiSelect.disabled=!access||access.inputs.size===0;
    status('Запуск не выполнен: '+(error?.message||String(error)));
  }
});
exportButton.addEventListener('click',()=>{
  if(!finishReport||session)return;
  // This button is the only way a report leaves the tab. No fetch/telemetry.
  const blob=new Blob([JSON.stringify(finishReport,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download='notare-r0e-local-diagnostic.json';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&(session||starting))stop('Вкладка скрыта. Микрофон автоматически отключён.');
});
window.addEventListener('pagehide',()=>{
  if(session||starting)stop('Вкладка закрыта. Микрофон отключён.');
});
