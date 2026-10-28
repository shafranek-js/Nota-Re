#!/usr/bin/env node
/**
 * Same pinned MuseScore General bank as PianoMotion Studio. Split into
 * static 12 MiB parts for hosts with a 25 MiB individual asset limit.
 * No binary is committed; generated assets belong to the release build.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'assets/soundfonts/MuseScore_General.sf3');
const destination = resolve(root, 'public/soundfonts/musescore-general');
const SHA256 = '5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3';
const SIZE = 39_900_972;
const PART_SIZE = 12 * 1024 * 1024;
const sources = [
  'https://ftp-osl.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3',
  'https://huggingface.co/MuScriptor/assets/resolve/7755beb2da7cb1d3c663ff4a9ad0d0e99437f78f/MuseScore_General.sf3'
];

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validate(bytes) {
  if (bytes.length !== SIZE || digest(bytes) !== SHA256 ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'sfbk') {
    throw new Error('Bundled MuseScore General source failed size, RIFF or SHA-256 validation.');
  }
}

async function sourceBytes() {
  try {
    const bytes = await readFile(source);
    validate(bytes);
    return bytes;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  let lastError;
  for (const url of sources) {
    try {
      console.log('Fetching pinned MuseScore General bank:', url);
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      validate(bytes);
      await mkdir(resolve(root, 'assets/soundfonts'), { recursive: true });
      await writeFile(source, bytes);
      return bytes;
    } catch (error) {
      lastError = error;
      console.warn('SoundFont source failed:', String(error));
    }
  }
  throw new Error('Could not prepare the included SoundFont: ' + String(lastError));
}

async function sameBytes(path, bytes) {
  try {
    const info = await stat(path);
    if (info.size !== bytes.length) return false;
    return (await readFile(path)).equals(bytes);
  } catch { return false; }
}

const bytes = await sourceBytes();
await mkdir(destination, { recursive: true });
const parts = [];
for (let offset = 0, i = 0; offset < bytes.length; offset += PART_SIZE, i++) {
  const name = 'part-' + String(i).padStart(2, '0') + '.bin';
  const part = bytes.subarray(offset, Math.min(bytes.length, offset + PART_SIZE));
  const path = resolve(destination, name);
  if (!(await sameBytes(path, part))) await writeFile(path, part);
  parts.push({ name, byteLength: part.length });
}
const manifest = {
  schemaVersion: 1,
  name: 'MuseScore General v0.2',
  format: 'sf3',
  license: 'MIT',
  sha256: SHA256,
  byteLength: SIZE,
  parts
};
await writeFile(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await copyFile(resolve(root, 'docs/licenses/MuseScore_General_License.md'),
  resolve(destination, 'LICENSE.md'));
console.log('Prepared MuseScore General v0.2:', parts.length, 'static parts, SHA-256', SHA256);
