#!/usr/bin/env node
/**
 * Only the pinned piano inference assets are installed with the app.
 * No model fetch happens during app startup; WebAudio and model weight
 * downloads occur only when the user clicks Start in Studio -> Lab.
 */
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const source=resolve(root,'node_modules/@markusstrasser/pitchplease');
const dest=resolve(root,'public/pitchplease');
const meta=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
if(meta.version!=='3.1.0')throw Error('Expected pinned PitchPlease 3.1.0');
const assets=['engine/worklet.js','engine/incport.wasm',
  'engine/incport-relaxed.wasm','models/piano.bin'];
for(const name of assets){
  const out=join(dest,name);
  await mkdir(resolve(out,'..'),{recursive:true});
  await copyFile(join(source,name),out);
}
console.log('Prepared pinned PitchPlease 3.1.0 piano AudioWorklet and WASM assets (lazy activation only).');
