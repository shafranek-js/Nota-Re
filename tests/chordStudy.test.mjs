import test from 'node:test';
import assert from 'node:assert/strict';
import { createChordStudy } from '../src/core/training/chordStudy.ts';
import { toMusicXml } from '../src/core/notation/musicXml.ts';
import { MIDI_NOTE_MAP } from '../src/data/notes.ts';
import { initialChordPractice, reduceChordPractice } from '../src/core/training/twoHandPractice.ts';

const cases = [
  { key: 'C', fifths: 0, quality: 'major', root: 'C', pitch: ['C4','E4','G4'] },
  { key: 'C', fifths: 0, quality: 'minor', root: 'A', pitch: ['A4','C5','E5'] },
  { key: 'G', fifths: 1, quality: 'major', root: 'G', pitch: ['G4','B4','D5'] },
  { key: 'G', fifths: 1, quality: 'minor', root: 'E', pitch: ['E4','G4','B4'] },
  { key: 'F', fifths: -1, quality: 'major', root: 'F', pitch: ['F4','A4','C5'] },
  { key: 'F', fifths: -1, quality: 'minor', root: 'D', pitch: ['D4','F4','A4'] },
  { key: 'D', fifths: 2, quality: 'major', root: 'D', pitch: ['D4','F#4','A4'] },
  { key: 'D', fifths: 2, quality: 'minor', root: 'B', pitch: ['B4','D5','F#5'] }
];
const semitones = (notes) => notes.map(n => MIDI_NOTE_MAP[n].midi).sort((a,b) => a-b);

for (const item of cases) {
  test(`${item.root} ${item.quality} in key ${item.key}: 3 inversions, exact spellings and real simultaneous MusicXML`, () => {
    for (const inversion of [0,1,2]) {
      const study = createChordStudy(item.key,item.quality,inversion);
      const same = createChordStudy(item.key,item.quality,inversion);
      assert.deepEqual(study,same, 'deterministic chord study');
      assert.equal(study.inversion,inversion);
      assert.equal(study.tonicName,item.root);
      assert.equal(study.score.mode,item.quality);
      assert.equal(study.score.fifths,item.fifths,
        'relative minor has signature of relative major, not parallel major');
      assert.equal(study.score.notes.length,12);
      assert.equal(study.steps.length,4);
      assert.deepEqual(study.pitchNames.map(n=>MIDI_NOTE_MAP[n].midi % 12).sort((a,b)=>a-b),
        semitones(item.pitch).map(n=>n%12).sort((a,b)=>a-b));
      const sorted=study.pitchNames.map(n=>MIDI_NOTE_MAP[n].midi);
      assert.ok(sorted[0]<sorted[1] && sorted[1]<sorted[2]);
      assert.ok(sorted[2]-sorted[0]<=12);
      for(let i=0;i<4;i++){
        const notes=study.score.notes.filter(note=>note.onsetTicks===i*4);
        assert.equal(notes.length,3);
        assert.ok(notes.every(note=>note.staff===1 && note.durationTicks===4));
        assert.deepEqual([...study.steps[i].expectedMidi],sorted);
        assert.equal(study.steps[i].durationTicks,4);
      }
      assert.equal(study.score.notes.filter(n=>n.staff===2).length,0,
        'no invented left-hand voice');
      const xml=toMusicXml(study.score);
      assert.match(xml,new RegExp(`<key><fifths>${item.fifths}<\\/fifths><mode>${item.quality}<\\/mode><\\/key>`));
      assert.equal((xml.match(/<chord\/>/g)||[]).length,8);
      assert.equal((xml.match(/<measure number="/g)||[]).length,1);
      assert.equal((xml.match(/<voice>1<\/voice>/g)||[]).length,12);
      assert.equal((xml.match(/<voice>2<\/voice>/g)||[]).length,1);
      assert.ok(!xml.includes('<fingering>'), 'do not invent fingering');
    }
  });
}

test('exact notes distinguish scale key from chord mode and inversion',()=>{
  assert.deepEqual(createChordStudy('C','major',0).pitchNames,['C4','E4','G4']);
  assert.deepEqual(createChordStudy('C','major',1).pitchNames,['E4','G4','C5']);
  assert.deepEqual(createChordStudy('C','major',2).pitchNames,['G4','C5','E5']);
  assert.deepEqual(createChordStudy('G','minor',0).pitchNames,['E4','G4','B4']);
  assert.deepEqual(createChordStudy('F','minor',1).pitchNames,['F4','A4','D5']);
  assert.deepEqual(createChordStudy('D','major',0).pitchNames,['D4','F#4','A4']);
  assert.deepEqual(createChordStudy('D','minor',0).pitchNames,['B4','D5','F#5']);
  for(const invalid of [
    ['X','major',0], ['C','dominant',0],['D','major',3],['G','minor',-1]
  ])assert.throws(()=>createChordStudy(...invalid),/Unsupported/);
});

test('3-note chord requires actual overlap within 180ms, rejects detached or repeated note-ons',()=>{
  const study=createChordStudy('C','major',0);
  let state=initialChordPractice();
  const on=(note,t)=>({type:'note-on',note,channel:0,receivedAtMs:t});
  const off=note=>({type:'note-off',note,channel:0});
  state=reduceChordPractice(state,study.steps,on(60,1000));
  assert.equal(state.stepIndex,0);
  state=reduceChordPractice(state,study.steps,on(60,1010));
  assert.equal(state.stepIndex,0,'repeated MIDI on while held does not count as another chord member');
  state=reduceChordPractice(state,study.steps,on(64,1070));
  assert.equal(state.stepIndex,0);
  state=reduceChordPractice(state,study.steps,on(67,1170));
  assert.equal(state.stepIndex,1,'all three held within window');
  state=reduceChordPractice(state,study.steps,on(60,1200));
  assert.equal(state.stepIndex,1,'cannot press a held key twice to skip repeated chord');
  for(const note of [60,64,67]) state=reduceChordPractice(state,study.steps,off(note));
  state=reduceChordPractice(state,study.steps,on(60,1400));
  state=reduceChordPractice(state,study.steps,off(60));
  state=reduceChordPractice(state,study.steps,on(64,1410));
  state=reduceChordPractice(state,study.steps,on(67,1440));
  assert.equal(state.stepIndex,1,'disjoint NoteOns cannot form a chord');
  state=reduceChordPractice(state,study.steps,{type:'panic'});
  state=reduceChordPractice(state,study.steps,on(60,1600));
  state=reduceChordPractice(state,study.steps,on(64,1700));
  state=reduceChordPractice(state,study.steps,on(67,1850));
  assert.equal(state.stepIndex,1,'wide uncoordinated onset outside 180ms');
});
