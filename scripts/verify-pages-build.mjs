#!/usr/bin/env node
/**
 * Validates the deployment artifact, not merely TypeScript compilation.
 * Must be run after a Vite build with NOTARE_PUBLIC_BASE=/Nota-Re/.
 */
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.NOTARE_PUBLIC_BASE;
assert.equal(base, '/Nota-Re/', 'Pages must be built for /Nota-Re/');
const dist = resolve(import.meta.dirname, '../dist');
const exists = async path => (await stat(resolve(dist, path))).isFile();

const html = await readFile(resolve(dist, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="(\/Nota-Re\/assets\/[^"]+)"/g)]
  .map(match => match[1]);
assert.ok(assets.some(path => /\.js$/.test(path)), 'index.html needs a base-prefixed JS bundle');
assert.ok(assets.some(path => /\.css$/.test(path)), 'index.html needs base-prefixed CSS');
assert.ok(!/(?:src|href)="\/assets\//.test(html), 'root-relative Vite assets would break on Pages');
for (const path of assets) {
  assert.ok(await exists(path.slice(base.length)), `Missing built asset: ${path}`);
}

assert.ok(await exists('.nojekyll'), 'Pages must not run Jekyll on dist');
assert.ok(await exists('spessasynth_processor.min.js'), 'SoundFont AudioWorklet is missing');
const manifestPath = 'soundfonts/musescore-general/manifest.json';
const manifest = JSON.parse(await readFile(resolve(dist, manifestPath), 'utf8'));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.sha256,
  '5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3');
assert.equal(manifest.byteLength, 39_900_972);
let total = 0;
for (const [index, part] of manifest.parts.entries()) {
  assert.equal(part.name, `part-${String(index).padStart(2, '0')}.bin`);
  assert.equal((await stat(resolve(dist, 'soundfonts/musescore-general', part.name))).size,
    part.byteLength, 'SoundFont part size mismatch');
  total += part.byteLength;
}
assert.equal(total, manifest.byteLength, 'SoundFont parts must be complete');
console.log('GitHub Pages bundle verified:', base, assets.length,
  'Vite assets, SoundFont', manifest.parts.length, 'parts, AudioWorklet');
