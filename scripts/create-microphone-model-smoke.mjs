/** Small deterministic **synthetic** piano-like input for optional model smoke checks.
 * This verifies that model runtimes execute; it is NOT an accuracy benchmark.
 * No real recordings, user content or copyrighted audio are generated/uploaded.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] || '.microphone-smoke');
const sampleRate = 22050;
const durationSec = 3.2;
const frames = Math.floor(sampleRate * durationSec);
const wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); // PCM16
wav.writeUInt16LE(1, 22); // mono
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(frames * 2, 40);

function tone(seconds, frequency) {
  const elapsed = seconds - (seconds < 1.3 ? 0.4 : 1.7);
  const attack = Math.min(1, Math.max(0, elapsed / 0.02));
  const release = Math.min(1, Math.max(0, (0.8 - elapsed) / 0.06));
  return Math.sin(2 * Math.PI * frequency * seconds) * Math.max(0, attack * release);
}
for (let i = 0; i < frames; i++) {
  const t = i / sampleRate;
  const value = t >= 0.4 && t < 1.2
    ? 0.25 * tone(t, 261.625565)
    : t >= 1.7 && t < 2.5
      ? 0.12 * (tone(t, 261.625565) + tone(t, 329.627557) + tone(t, 391.995436))
      : 0;
  wav.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
}
await mkdir(root, { recursive: true });
await writeFile(join(root, 'synthetic.wav'), wav);
await writeFile(join(root, 'manifest.json'), JSON.stringify({
  schemaVersion: 1,
  onsetToleranceMs: 100,
  cases: [{
    id: 'synthetic-runtime-smoke',
    category: 'synthetic-not-acoustic',
    wav: './synthetic.wav',
    expected: [
      { midi: 60, onsetMs: 400 },
      { midi: 60, onsetMs: 1700 },
      { midi: 64, onsetMs: 1700 },
      { midi: 67, onsetMs: 1700 }
    ]
  }]
}, null, 2));
console.error('Generated synthetic model-runtime smoke only; not a real-piano evaluation');
