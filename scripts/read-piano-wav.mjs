import { readFile } from 'node:fs/promises';

/**
 * Bounded offline WAV decoder. Supports standard 1–2 channel PCM16/24/32
 * or IEEE float32, downmixed to mono. No network calls, uploads, or recording.
 * Other WAV formats (e.g. WAVE_FORMAT_EXTENSIBLE) must be converted beforehand.
 */
export async function readPianoWav(path) {
  const data = await readFile(path);
  if (data.length > 160_000_000) throw new Error('WAV exceeds 160 MB benchmark cap');
  if (data.length < 44 || data.toString('ascii', 0, 4) !== 'RIFF' ||
      data.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Expected standard RIFF/WAVE');

  let format = null;
  let pcm = null;
  for (let at = 12; at + 8 <= data.length;) {
    const name = data.toString('ascii', at, at + 4);
    const size = data.readUInt32LE(at + 4);
    const start = at + 8;
    const end = start + size;
    if (!Number.isSafeInteger(end) || end > data.length) throw new Error('Corrupt WAV chunk size');
    if (name === 'fmt ') {
      if (size < 16) throw new Error('Invalid WAV format chunk');
      format = {
        audioFormat: data.readUInt16LE(start),
        channels: data.readUInt16LE(start + 2),
        sampleRate: data.readUInt32LE(start + 4),
        byteRate: data.readUInt32LE(start + 8),
        blockAlign: data.readUInt16LE(start + 12),
        bits: data.readUInt16LE(start + 14)
      };
    }
    if (name === 'data' && pcm === null) pcm = { start, size };
    at = end + (size % 2);
  }

  if (!format || !pcm) throw new Error('WAV is missing fmt or data chunk');
  const { audioFormat, channels, sampleRate, blockAlign, bits, byteRate } = format;
  if (!Number.isSafeInteger(channels) || channels < 1 || channels > 2 ||
      sampleRate < 8000 || sampleRate > 192000 ||
      !((audioFormat === 1 && [16, 24, 32].includes(bits)) ||
        (audioFormat === 3 && bits === 32))) {
    throw new Error('Only standard 1–2ch PCM 16/24/32-bit or float32 WAV 8–192 kHz supported');
  }
  const sampleBytes = bits / 8;
  if (blockAlign !== sampleBytes * channels || byteRate !== sampleRate * blockAlign ||
      pcm.size === 0 || pcm.size % blockAlign !== 0) {
    throw new Error('Invalid WAV data alignment');
  }
  const samples = new Float32Array(pcm.size / blockAlign);
  for (let i = 0; i < samples.length; i++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      const p = pcm.start + i * blockAlign + channel * sampleBytes;
      let value;
      if (audioFormat === 3) value = data.readFloatLE(p);
      else if (bits === 16) value = data.readInt16LE(p) / 32768;
      else if (bits === 24) value = data.readIntLE(p, 3) / 8388608;
      else value = data.readInt32LE(p) / 2147483648;
      if (!Number.isFinite(value)) throw new Error('Non-finite audio sample');
      sum += value;
    }
    samples[i] = sum / channels;
  }
  return {
    samples, sampleRate, channels,
    durationSeconds: samples.length / sampleRate
  };
}
