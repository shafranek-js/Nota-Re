/**
 * Read note-on reference events from a Standard MIDI File (SMF 0 or 1)
 * without turning note-off, pedal or model predictions into piano attacks.
 * MAESTRO MIDI/audio must already be aligned; any residual acoustic offset
 * needs independent calibration before onset timing is trusted.
 */
export function parseMidiOnsets(bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  let position = 0;
  const requireBytes = length => {
    if (!Number.isSafeInteger(length) || length < 0 || position + length > data.length) {
      throw new Error('Truncated MIDI file');
    }
  };
  const read32 = () => {
    requireBytes(4);
    const value = data.readUInt32BE(position);
    position += 4;
    return value;
  };
  const read16 = () => {
    requireBytes(2);
    const value = data.readUInt16BE(position);
    position += 2;
    return value;
  };
  const readTag = () => {
    requireBytes(4);
    const tag = data.toString('ascii', position, position + 4);
    position += 4;
    return tag;
  };
  const readVariable = end => {
    let result = 0;
    for (let i = 0; i < 4; i++) {
      if (position >= end) throw new Error('Truncated MIDI variable-length integer');
      const byte = data[position++];
      result = (result << 7) | (byte & 127);
      if (!(byte & 128)) return result;
    }
    throw new Error('Oversized MIDI variable-length integer');
  };
  if (readTag() !== 'MThd') throw new Error('Missing MIDI header');
  const headerSize = read32();
  if (headerSize < 6) throw new Error('Invalid MIDI header');
  const format = read16();
  const trackCount = read16();
  const ticksPerQuarter = read16();
  if (format > 1 || trackCount < 1 || trackCount > 256 ||
      (ticksPerQuarter & 0x8000) || ticksPerQuarter === 0) {
    throw new Error('Only PPQ Standard MIDI Format 0/1 supported');
  }
  requireBytes(headerSize - 6);
  position += headerSize - 6;

  const attacks = [];
  const tempoChanges = [];
  let serial = 0;
  for (let track = 0; track < trackCount; track++) {
    if (readTag() !== 'MTrk') throw new Error('Missing MIDI track');
    const size = read32();
    const end = position + size;
    if (end > data.length) throw new Error('Truncated MIDI track');
    let tick = 0;
    let runningStatus = 0;
    while (position < end) {
      tick += readVariable(end);
      if (!Number.isSafeInteger(tick)) throw new Error('MIDI tick overflow');
      if (position >= end) throw new Error('Truncated MIDI status');
      let status = data[position];
      if (status >= 0x80) {
        position++;
        if (status < 0xf0) runningStatus = status;
        else runningStatus = 0;
      } else {
        if (runningStatus === 0) throw new Error('Invalid MIDI running status');
        status = runningStatus;
      }
      if (status === 0xff) {
        if (position >= end) throw new Error('Truncated MIDI meta event');
        const type = data[position++];
        const length = readVariable(end);
        if (position + length > end) throw new Error('Truncated MIDI meta data');
        if (type === 0x51 && length === 3) {
          const microsPerQuarter =
            (data[position] << 16) | (data[position + 1] << 8) | data[position + 2];
          if (microsPerQuarter <= 0) throw new Error('Invalid MIDI tempo');
          tempoChanges.push({ tick, microsPerQuarter, serial: serial++ });
        }
        position += length;
        if (type === 0x2f) { position = end; break; }
      } else if (status === 0xf0 || status === 0xf7) {
        const length = readVariable(end);
        if (position + length > end) throw new Error('Truncated MIDI SysEx');
        position += length;
      } else if (status >= 0x80 && status <= 0xef) {
        const kind = status & 0xf0;
        const length = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
        if (position + length > end) throw new Error('Truncated MIDI channel event');
        const pitchOrData = data[position++];
        const velocityOrData = length === 2 ? data[position++] : 0;
        if (pitchOrData > 127 || velocityOrData > 127) {
          throw new Error('Invalid MIDI data byte');
        }
        if (kind === 0x90 && velocityOrData > 0 &&
            pitchOrData >= 21 && pitchOrData <= 108) {
          attacks.push({ tick, midi: pitchOrData, serial: serial++ });
        }
      } else throw new Error('Unsupported MIDI system message');
    }
    position = end;
  }
  tempoChanges.sort((a, b) => a.tick - b.tick || a.serial - b.serial);
  attacks.sort((a, b) => a.tick - b.tick || a.serial - b.serial);

  let tempo = 500_000;
  let lastTick = 0;
  let elapsedMicros = 0;
  let tempoIndex = 0;
  const result = [];
  for (const attack of attacks) {
    while (tempoIndex < tempoChanges.length &&
           tempoChanges[tempoIndex].tick <= attack.tick) {
      const change = tempoChanges[tempoIndex++];
      elapsedMicros += (change.tick - lastTick) * tempo / ticksPerQuarter;
      lastTick = change.tick;
      tempo = change.microsPerQuarter;
    }
    const onsetMs =
      (elapsedMicros + (attack.tick - lastTick) * tempo / ticksPerQuarter) / 1000;
    result.push({ midi: attack.midi, onsetMs });
  }
  return result;
}

/** Select a WAV clip's MIDI reference window and rebase to clip-local milliseconds. */
export function selectMidiAttacksForAudioClip(events, { startMs, durationMs }) {
  if (!Number.isFinite(startMs) || startMs < 0 ||
      !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('Invalid clip start/duration');
  }
  return events
    .filter(item => item.onsetMs >= startMs && item.onsetMs < startMs + durationMs)
    .map(item => ({ midi: item.midi, onsetMs: item.onsetMs - startMs }));
}
