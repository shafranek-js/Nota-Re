import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPianoWav } from '../scripts/read-piano-wav.mjs';

function makeWav({ format = 1, bits = 16, channels = 1, rate = 48000, frames = 4 } = {}) {
  const width = bits / 8;
  const align = channels * width;
  const size = frames * align;
  const buffer = Buffer.alloc(44 + size);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(format, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * align, 28);
  buffer.writeUInt16LE(align, 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(size, 40);
  for (let i = 0; i < frames; i++) for (let channel = 0; channel < channels; channel++) {
    const p = 44 + i * align + channel * width;
    const sample = channel ? -0.25 : 0.5;
    if (format === 3) buffer.writeFloatLE(sample, p);
    else if (bits === 16) buffer.writeInt16LE(sample * 32768, p);
    else if (bits === 24) buffer.writeIntLE(sample * 8388608, p, 3);
    else buffer.writeInt32LE(sample * 2147483648, p);
  }
  return buffer;
}

test('decodes 16/24/32-bit PCM and float32, and downmixes stereo', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'notare-wav-'));
  try {
    for (const [format, bits] of [[1, 16], [1, 24], [1, 32], [3, 32]]) {
      for (const channels of [1, 2]) {
        const path = join(dir, `pcm-${format}-${bits}-${channels}.wav`);
        await writeFile(path, makeWav({ format, bits, channels }));
        const result = await readPianoWav(path);
        assert.equal(result.sampleRate, 48000);
        assert.equal(result.samples.length, 4);
        assert.ok(Math.abs(result.samples[0] - (channels === 1 ? 0.5 : 0.125)) < 0.0001);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects non-WAV headers and truncated data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'notare-wav-'));
  try {
    const path = join(dir, 'bad.wav');
    await writeFile(path, Buffer.alloc(44));
    await assert.rejects(readPianoWav(path));
    const buffer = makeWav();
    buffer.writeUInt32LE(999999, 40);
    await writeFile(path, buffer);
    await assert.rejects(readPianoWav(path));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
