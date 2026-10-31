import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStreamingNoteTracker, compareDiagnosticMidi,
  createMicrophoneReport, MAX_EVENTS
} from '../src/core/audio/microphoneLab.ts';

test('streaming tracker observes actual frames once and counts retriggers after a silence',()=>{
 const tracker=createStreamingNoteTracker();
 const detections=[];
 for(let i=1;i<=100;i++){
  const notes=i<40||i>55?[{midi:60,prob:.8}]:[];
  detections.push(...tracker.push({time:i*.011,notes}));
 }
 assert.deepEqual(detections.map(n=>n.midi),[60,60]);
 assert.throws(()=>tracker.push({time:100*.011,notes:[]}),/Incorrect/);
});
test('same-pitch MIDI truth matches one-to-one without counting duplicates',()=>{
 const midi=[{midi:60,atMs:100},{midi:60,atMs:500},{midi:64,atMs:600}];
 const mic=[{midi:60,atMs:150},{midi:60,atMs:600},{midi:65,atMs:700}];
 const matched=compareDiagnosticMidi(midi,mic);
 assert.equal(matched.matchedAttacks,2);
 assert.equal(matched.missedMidiAttacks,1);
 assert.equal(matched.unmatchedMicrophoneAttacks,1);
 assert.equal(matched.medianMidiToCallbackMs,50);
 assert.equal(matched.p95MidiToCallbackMs,100);
});
test('aggregate-only JSON excludes note timelines and no reference means no latency claim',()=>{
 const common={
  startedAtIso:'2026-10-31T16:00:00.000Z',durationMs:12000,
  frameCount:999,observed:[{midi:60,atMs:1000,confidence:.9}],
  midiReference:[{midi:60,atMs:900}],usesSameInstrumentMidi:false,
  pedalEventCount:2,modelKernel:'wasm-relaxed',modelCpuLoad:.3
 };
 const noTruth=createMicrophoneReport(common);
 assert.equal(noTruth.midiToCallbackAgreement,null);
 assert.equal(noTruth.independentMidiReference,false);
 assert.equal(noTruth.referenceMidiAttackCount,null);
 assert.equal(noTruth.officialCredit,false);
 assert.equal(noTruth.audioRecorded,false);
 assert.equal(noTruth.audioUploaded,false);
 const trusted=createMicrophoneReport({...common,usesSameInstrumentMidi:true});
 assert.equal(trusted.midiToCallbackAgreement?.matchedAttacks,1);
 for(const report of [trusted,noTruth]){
  const exported=JSON.stringify(report);
  for(const forbidden of ['"observed"','"midiReference"','"midi":','"atMs":',
    '"audioBytes"','"deviceId"','"userAgent"'])assert.ok(!exported.includes(forbidden),forbidden);
 }
 assert.throws(()=>createMicrophoneReport({...common,durationMs:999999}),/Invalid/);
 assert.throws(()=>compareDiagnosticMidi([],new Array(MAX_EVENTS+1).fill({midi:60,atMs:100})),/Invalid/);
});
