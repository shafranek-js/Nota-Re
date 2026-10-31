/** Studio-only opt-in microphone diagnostics. This module never grades lessons.
 * No raw audio, device identities or sequences may appear in export.
 */
export type PitchNote = { midi: number; prob: number };
export type PitchFrame = { time: number; notes: PitchNote[] };
export type DiagnosticEvent = { midi: number; atMs: number; confidence?: number };
export type MidiAgreement = {
  matchedAttacks:number; missedMidiAttacks:number; unmatchedMicrophoneAttacks:number;
  medianMidiToCallbackMs:number|null; p95MidiToCallbackMs:number|null;
};
export const MAX_EVENTS=1500;
const isFinitePositive=(v:number)=>Number.isFinite(v)&&v>=0;
const isPianoMidi=(v:number)=>Number.isSafeInteger(v)&&v>=21&&v<=108;

export function createStreamingNoteTracker() {
  const states=new Map<number,{ firstMs:number; lastMs:number; count:number; peak:number; emitted:boolean }>();
  let lastFrame=-Infinity;
  return {
    push(frame:PitchFrame) {
      if(!frame||!isFinitePositive(frame.time)||frame.time*1000<=lastFrame||
        !Array.isArray(frame.notes))throw Error('Incorrect streaming audio frame');
      lastFrame=frame.time*1000;
      const seen=new Set<number>();
      const attacks:{midi:number;confidence:number}[]=[];
      for(const note of frame.notes){
        if(!isPianoMidi(note.midi)||!isFinitePositive(note.prob)||note.prob>1||
          seen.has(note.midi))throw Error('Invalid or duplicated piano note');
        seen.add(note.midi);
        let state=states.get(note.midi);
        if(!state||lastFrame-state.lastMs>55){
          state={firstMs:lastFrame,lastMs:lastFrame,count:0,peak:0,emitted:false};
          states.set(note.midi,state);
        }
        state.lastMs=lastFrame;state.count++;state.peak=Math.max(state.peak,note.prob);
        if(!state.emitted&&state.count>=2){
          attacks.push({midi:note.midi,confidence:state.peak});
          state.emitted=true;
        }
      }
      for(const [key,state] of states)if(!seen.has(key)&&lastFrame-state.lastMs>55)states.delete(key);
      return attacks;
    },
    reset(){states.clear();lastFrame=-Infinity;}
  };
}

export function compareDiagnosticMidi(reference:DiagnosticEvent[],observed:DiagnosticEvent[]):MidiAgreement{
  if(!Array.isArray(reference)||!Array.isArray(observed)||
    reference.length>MAX_EVENTS||observed.length>MAX_EVENTS||
    [...reference,...observed].some(x=>!isPianoMidi(x.midi)||!isFinitePositive(x.atMs))) {
    throw Error('Invalid MIDI comparison');
  }
  // Order-preserving bounded one-to-one matching, preferring fewest misses,
  // then smallest lag. Never count one detected event twice.
  const lags:number[]=[];
  for(let pitch=21;pitch<=108;pitch++){
    const a=reference.filter(x=>x.midi===pitch).sort((x,y)=>x.atMs-y.atMs);
    const b=observed.filter(x=>x.midi===pitch).sort((x,y)=>x.atMs-y.atMs);
    const n=a.length,m=b.length;
    const dp=Array.from({length:n+1},()=>Array.from({length:m+1},
      ()=>({count:0,lag:0,step:0})));
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--){
      let best={...dp[i+1][j],step:1};
      const skip={...dp[i][j+1],step:2};
      if(skip.count>best.count||(skip.count===best.count&&skip.lag<best.lag))best=skip;
      const delta=b[j].atMs-a[i].atMs;
      if(delta>=0&&delta<=1000){
        const following=dp[i+1][j+1];
        const hit={count:following.count+1,lag:following.lag+delta,step:3};
        if(hit.count>best.count||(hit.count===best.count&&hit.lag<best.lag))best=hit;
      }
      dp[i][j]=best;
    }
    let i=0,j=0;
    while(i<n&&j<m){
      if(dp[i][j].step===1)i++;
      else if(dp[i][j].step===2)j++;
      else{lags.push(b[j].atMs-a[i].atMs);i++;j++;}
    }
  }
  lags.sort((a,b)=>a-b);
  const q=(p:number)=>lags.length?lags[Math.ceil(p*lags.length)-1]:null;
  return {matchedAttacks:lags.length,missedMidiAttacks:reference.length-lags.length,
    unmatchedMicrophoneAttacks:observed.length-lags.length,
    medianMidiToCallbackMs:q(.5),p95MidiToCallbackMs:q(.95)};
}
export function createMicrophoneReport(input:{
  startedAtIso:string;durationMs:number;frameCount:number;observed:DiagnosticEvent[];
  midiReference:DiagnosticEvent[];usesSameInstrumentMidi:boolean;
  pedalEventCount:number;modelKernel:string|null;modelCpuLoad:number|null;
}){
  const {startedAtIso,durationMs,frameCount,observed,midiReference,usesSameInstrumentMidi,
    pedalEventCount,modelKernel,modelCpuLoad}=input;
  if(!/^\\d{4}-\\d\\d-\\d\\dT/.test(startedAtIso)||!isFinitePositive(durationMs)||
    durationMs>130000||!Number.isSafeInteger(frameCount)||frameCount<0||
    !Number.isSafeInteger(pedalEventCount)||pedalEventCount<0||
    !Array.isArray(observed)||observed.length>MAX_EVENTS||
    !Array.isArray(midiReference)||midiReference.length>MAX_EVENTS||
    !isFinitePositive(modelCpuLoad??0))throw Error('Invalid microphone diagnostics');
  const independent=usesSameInstrumentMidi&&midiReference.length>0;
  return {
    schemaVersion:1,experiment:'R0E-in-app-microphone-diagnostics-v1',
    researchOnly:true,officialCredit:false,audioRecorded:false,audioUploaded:false,
    startedAtIso,durationMs,model:'PitchPlease 3.1.0 / piano',
    frameCount,recognizedAttackCount:observed.length,
    engine:{kernel:modelKernel,cpuLoad:modelCpuLoad},
    independentMidiReference:independent,
    referenceMidiAttackCount:independent?midiReference.length:null,
    pedalCc64EventCount:independent?pedalEventCount:null,
    midiToCallbackAgreement:independent?compareDiagnosticMidi(midiReference,observed):null,
    warning:'No measured acoustic-piano keystrike or microphone input latency. MIDI comparison is only browser MIDI dispatch → JS callback; without same-instrument MIDI no objective accuracy.',
  };
}
