/** R0E — bounded, privacy-first microphone/MIDI diagnostic summaries.
 * No score, no audio persistence, no course credit, no causal calibration.
 */
const isMidi = v => Number.isSafeInteger(v) && v >= 21 && v <= 108;
const finite = n => typeof n === 'number' && Number.isFinite(n);
export const MAX_DIAGNOSTIC_EVENTS = 5000;

export function safeDiagnosticEvent(event, kind) {
  if (!event || !isMidi(event.midi) || !finite(event.atMs) || event.atMs < 0 ||
      (kind === 'detected' && (!finite(event.confidence) ||
       event.confidence < 0 || event.confidence > 1))) {
    throw new Error('Invalid diagnostic event');
  }
  return kind === 'detected'
    ? { midi: event.midi, atMs: event.atMs, confidence: event.confidence }
    : { midi: event.midi, atMs: event.atMs };
}

/**
 * One-to-one matches in the same DOMHighResTimeStamp epoch, restricted to
 * positive, plausible MIDI-dispatch -> JS callback lag. This is diagnostic
 * agreement, NOT the acoustic latency of an analog piano keystrike.
 */
export function compareMicrophoneWithMidi(midiEvents, detectedEvents, { maxLagMs = 1000 } = {}) {
  if (!Array.isArray(midiEvents) || !Array.isArray(detectedEvents) ||
      midiEvents.length > MAX_DIAGNOSTIC_EVENTS ||
      detectedEvents.length > MAX_DIAGNOSTIC_EVENTS ||
      !finite(maxLagMs) || maxLagMs <= 0 || maxLagMs > 2000) {
    throw new Error('Invalid diagnostic comparison');
  }
  const midi = midiEvents.map(x => safeDiagnosticEvent(x, 'midi'));
  const detected = detectedEvents.map(x => safeDiagnosticEvent(x, 'detected'));
  let matchCount = 0;
  const lags = [];
  for (let pitch = 21; pitch <= 108; pitch++) {
    const truth = midi.filter(x => x.midi === pitch).sort((a,b)=>a.atMs-b.atMs);
    const output = detected.filter(x => x.midi === pitch).sort((a,b)=>a.atMs-b.atMs);
    const n = truth.length, m = output.length;
    // Optimal order-preserving one-to-one matching: maximize count first,
    // minimize lag second, never score one repeated note twice.
    const dp = Array.from({length:n+1},()=>Array.from({length:m+1},
      ()=>({count:0,lag:0,move:0})));
    for (let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--){
      let best={...dp[i+1][j],move:1};
      const skip={...dp[i][j+1],move:2};
      if(skip.count>best.count || (skip.count===best.count&&skip.lag<best.lag))best=skip;
      const delta=output[j].atMs-truth[i].atMs;
      if(delta>=0&&delta<=maxLagMs){
        const next=dp[i+1][j+1];
        const hit={count:next.count+1,lag:next.lag+delta,move:3};
        if(hit.count>best.count||(hit.count===best.count&&hit.lag<best.lag))best=hit;
      }
      dp[i][j]=best;
    }
    let i=0,j=0;
    while(i<n&&j<m){
      const direction=dp[i][j].move;
      if(direction===1){i++;continue;}
      if(direction===2){j++;continue;}
      lags.push(output[j].atMs-truth[i].atMs);matchCount++;i++;j++;
    }
  }
  lags.sort((a,b)=>a-b);
  const quantile=q=>lags.length?lags[Math.ceil(lags.length*q)-1]:null;
  return {
    referenceMidiAttacks:midi.length,detectorAttacks:detected.length,
    matchedAttacks:matchCount,unmatchedMidiAttacks:midi.length-matchCount,
    unmatchedDetectorAttacks:detected.length-matchCount,
    medianMidiToCallbackMs:quantile(.5),p95MidiToCallbackMs:quantile(.95),
    maxMatchLagMs:maxLagMs,
    caveat:'MIDI message -> browser JS callback agreement. NOT physical piano mic onset latency, calibrated capture delay, or certified accuracy.'
  };
}

export function createPrivacyReport({ engine, startedAtIso, durationMs, frames,
  microphoneSettings, micAvailable, midiSelected, midiAttacks, detectorAttacks,
  pedalEvents, warnings=[] }) {
  if (!finite(durationMs)||durationMs<0||durationMs>130000 ||
      !Number.isSafeInteger(frames)||frames<0||
      !Array.isArray(midiAttacks)||!Array.isArray(detectorAttacks)||
      !Number.isSafeInteger(pedalEvents)||pedalEvents<0||
      typeof startedAtIso!=='string'||!/^\d{4}-\d\d-\d\dT/.test(startedAtIso)||
      typeof engine!=='string'||!engine.trim()||
      typeof micAvailable!=='boolean'||typeof midiSelected!=='boolean'||
      !Array.isArray(warnings)||warnings.some(w=>typeof w!=='string')) {
    throw new Error('Invalid privacy report');
  }
  const compare = midiSelected && midiAttacks.length
    ? compareMicrophoneWithMidi(midiAttacks,detectorAttacks)
    : null;
  return {
    schemaVersion:1,experiment:'R0E-local-microphone-opt-in-v1',
    researchOnly:true,officialCourseCredit:false,audioStored:false,audioUploaded:false,
    startedAtIso,durationMs,engine,frames,
    audioCapture: { enabledByUser:micAvailable,
      requestedProcessingConstraints:microphoneSettings },
    independentMidiReference: midiSelected && midiAttacks.length>0,
    counts: { estimatedAttacks:detectorAttacks.length,
      referenceMidiAttacks:midiSelected?midiAttacks.length:null,
      pedalCc64Events:midiSelected?pedalEvents:null },
    midiComparison:compare,
    warnings:[...warnings,
      'Raw microphone audio is not recorded or exported.',
      'Without a synchronized MIDI reference, onset precision, recall and latency cannot be determined.',
      'MIDI reference measures browser MIDI dispatch, NOT mechanically synchronized physical keystrike or microphone input delay.'],
    // Never include per-note timelines, note sequences, raw audio, device IDs
    // or personally identifying browser/device labels in exported reports.
  };
}
