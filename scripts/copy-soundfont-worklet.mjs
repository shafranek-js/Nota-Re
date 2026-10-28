#!/usr/bin/env node
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'node_modules/spessasynth_lib/dist/spessasynth_processor.min.js');
const destination = resolve(root, 'public/spessasynth_processor.min.js');
await mkdir(resolve(root, 'public'), { recursive: true });
await copyFile(source, destination);
console.log('Copied matching SpessaSynth AudioWorklet processor');
