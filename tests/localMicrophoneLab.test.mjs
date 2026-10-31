import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMicrophoneWithMidi, createPrivacyReport, MAX_DIAGNOSTIC_EVENTS
} from '../scripts/local-microphone-report.mjs';
import { resolveLabAsset } from '../scripts/serve-local-microphone-lab.mjs';
const base={
  engine:'pitchplease@3.1.0:piano / incremental-2-frame',
  startedAtIso:'2026-10-31T15:00:00.000Z', durationMs:15000,
  frames:1250, microphoneSettings:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},
  micAvailable:true, midiSelected:false,midiAttacks:[],detectorAttacks:[],
  pedalEvents:0
};
const note=(midi,atMs,confidence=.7)=>({midi,atMs,confidence});
test('microphone without independent MIDI does not fabricate scoring or delay',()=>{
 const report=createPrivacyReport({...base,
   detectorAttacks:[note(60,100),note(64,200)],
   warnings:['No independent synchronized truth']});
 assert.equal(report.midiComparison,null);
 assert.equal(report.independentMidiReference,false);
 assert.equal(report.counts.estimatedAttacks,2);
 assert.equal(report.counts.referenceMidiAttacks,null);
 assert.equal(report.audioUploaded,false);
 assert.equal(report.audioStored,false);
 assert.equal(report.officialCourseCredit,false);
 const serialized=JSON.stringify(report);
 for(const forbidden of ['detectorAttacks','midiAttacks','rawAudio','deviceId','atMs','midiEvents',
   'referenceNotes','sourceWav','trackLabel']) assert.ok(!serialized.includes('"' + forbidden + '"'),forbidden);
});
test('one-to-one MIDI reference matching handles repeated pitches and unmatched attacks',()=>{
 const midi=[note(60,100),note(60,500),note(64,600)];
 const detected=[note(60,140),note(60,580),note(60,1250),note(65,650)];
 const result=compareMicrophoneWithMidi(midi,detected,{maxLagMs:200});
 assert.deepEqual([result.matchedAttacks,result.unmatchedMidiAttacks,
   result.unmatchedDetectorAttacks],[2,1,2]);
 assert.equal(result.medianMidiToCallbackMs,40);
 assert.equal(result.p95MidiToCallbackMs,80);
 const report=createPrivacyReport({...base,midiSelected:true,midiAttacks:midi,
   detectorAttacks:detected,pedalEvents:3});
 assert.equal(report.midiComparison.matchedAttacks,2);
 assert.equal(report.counts.pedalCc64Events,3);
 assert.ok(!JSON.stringify(report).includes('"midiAttacks"'));
});
test('rejects timestamp injection, invalid MIDI pitches and oversized diagnostic buffers',()=>{
 for(const bad of [note(0,0),note(60,-1),note(64,NaN),note(70,0,1.01)]){
  assert.throws(()=>compareMicrophoneWithMidi([note(60,0)],[bad]),/Invalid/);
 }
 assert.throws(()=>compareMicrophoneWithMidi([],[],{maxLagMs:0}),/Invalid/);
 assert.throws(()=>compareMicrophoneWithMidi([],new Array(MAX_DIAGNOSTIC_EVENTS+1).fill(note(60,0))),/Invalid/);
 assert.throws(()=>createPrivacyReport({...base,durationMs:180000}),/Invalid/);
});
test('local server only resolves hardcoded app routes, never arbitrary paths',async()=>{
 assert.match(await resolveLabAsset('/'),/local-microphone-lab\.html$/);
 assert.match(await resolveLabAsset('/report.mjs'),/local-microphone-report\.mjs$/);
 assert.match(await resolveLabAsset('/local-microphone-lab.css'),/local-microphone-lab\\.css$/);
 for(const uri of ['/package.json','/src/main.tsx','/../../README.md',
  '/engine/../package.json','/models/%2e%2e','/unrelated','/engine/foo/bar',
  '/engine\\processor.js']){
  assert.equal(await resolveLabAsset(uri),null,uri);
 }
});
