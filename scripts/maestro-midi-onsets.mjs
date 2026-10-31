/**
 * Read note-on reference events from a Standard MIDI File (SMF 0 or 1)
 * without turning note-off, pedal or model predictions into piano attacks.
 * With optional release envelopes, model key-up and CC64 controller-lift
 * times, NOT physical acoustic decay. Ambiguous same-pitch overlap is flagged;
 * channels without CC64 remain unknown.
 * MAESTRO MIDI/audio must already be aligned; any residual acoustic offset
 * needs independent calibration before onset timing is trusted.
 */
export function parseMidiReference(bytes, { withReleases = false } = {}) {
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
  const noteReleases = [];
  const pedalChanges = [];
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
          attacks.push({ tick, midi: pitchOrData, channel: status & 0x0f, serial: serial++ });
        }
        // SMF Note Off and velocity-zero Note On both release a key.
        if (withReleases && (kind === 0x80 || (kind === 0x90 && velocityOrData === 0)) &&
            pitchOrData >= 21 && pitchOrData <= 108) {
          noteReleases.push({ tick, midi: pitchOrData, channel: status & 0x0f, serial: serial++ });
        }
        if (kind === 0xb0 && pitchOrData === 64) {
          pedalChanges.push({ tick, value: velocityOrData, channel: status & 0x0f, serial: serial++ });
        }
      } else throw new Error('Unsupported MIDI system message');
    }
    position = end;
  }
  tempoChanges.sort((a, b) => a.tick - b.tick || a.serial - b.serial);
  attacks.sort((a, b) => a.tick - b.tick || a.serial - b.serial);
  pedalChanges.sort((a, b) => a.tick - b.tick || a.serial - b.serial);

  let tempo = 500_000;
  let lastTick = 0;
  let elapsedMicros = 0;
  let tempoIndex = 0;
  const msAtTick = tick => {
    while (tempoIndex < tempoChanges.length && tempoChanges[tempoIndex].tick <= tick) {
      const change = tempoChanges[tempoIndex++];
      elapsedMicros += (change.tick - lastTick) * tempo / ticksPerQuarter;
      lastTick = change.tick;
      tempo = change.microsPerQuarter;
    }
    return (elapsedMicros + (tick - lastTick) * tempo / ticksPerQuarter) / 1000;
  };
  // MIDI controller messages are channel-scoped. If a channel never records
  // CC64, its pedal state is unknown rather than silently declared "up".
  const channelsWithPedal = new Set(pedalChanges.map(x => x.channel));
  const state = new Map();
  const timeline = [
    ...attacks.map(x => ({ ...x, type: 'attack' })),
    ...noteReleases.map(x => ({ ...x, type: 'release' })),
    ...pedalChanges.map(x => ({ ...x, type: 'pedal' }))
  ].sort((a, b) => a.tick - b.tick || a.serial - b.serial);
  const annotated = [];
  const convertedPedal = [];
  const openKeys = new Map();
  const heldByPedal = new Map();
  let unmatchedNoteOffs = 0;
  const key = (channel, midi) => channel + ':' + midi;
  for (const event of timeline) {
    const onsetMs = msAtTick(event.tick);
    if (event.type === 'pedal') {
      const down = event.value >= 64;
      const wasDown = state.get(event.channel) ?? false;
      state.set(event.channel, down);
      convertedPedal.push({ onsetMs, value: event.value, channel: event.channel });
      if (withReleases && wasDown && !down) {
        for (const note of heldByPedal.get(event.channel) ?? []) {
          note.midiControlEndMs = onsetMs;
        }
        heldByPedal.set(event.channel, []);
      }
    } else if (event.type === 'release') {
      const id = key(event.channel, event.midi);
      const active = openKeys.get(id) ?? [];
      if (!active.length) {
        unmatchedNoteOffs++;
        continue;
      }
      // FIFO is deterministic, but overlapping key-down instances of the
      // same channel/pitch cannot be unambiguously paired with note-offs.
      const note = active.shift();
      if (active.length || note.ambiguousRelease) {
        note.ambiguousRelease = true;
        for (const other of active) other.ambiguousRelease = true;
      }
      note.keyReleaseMs = onsetMs;
      if (!channelsWithPedal.has(event.channel)) {
        note.pedalHeldAfterRelease = null;
      } else if (state.get(event.channel) ?? false) {
        note.pedalHeldAfterRelease = true;
        const pending = heldByPedal.get(event.channel) ?? [];
        pending.push(note);
        heldByPedal.set(event.channel, pending);
      } else {
        note.pedalHeldAfterRelease = false;
        note.midiControlEndMs = onsetMs;
      }
    } else {
      const note = {
        midi: event.midi, onsetMs,
        pedalDownAtOnset: channelsWithPedal.has(event.channel)
          ? (state.get(event.channel) ?? false) : null
      };
      if (withReleases) {
        note.keyReleaseMs = null;
        note.midiControlEndMs = null;
        note.pedalHeldAfterRelease = null;
        note.ambiguousRelease = false;
        const id = key(event.channel, event.midi);
        const active = openKeys.get(id) ?? [];
        if (active.length) {
          note.ambiguousRelease = true;
          for (const other of active) other.ambiguousRelease = true;
        }
        // A reattack while CC64 keeps an earlier released pitch sounding
        // makes the acoustic fate of that earlier pitch uncertain.
        for (const previous of heldByPedal.get(event.channel) ?? []) {
          if (previous.midi === event.midi) previous.ambiguousRelease = true;
        }
        active.push(note);
        openKeys.set(id, active);
      }
      annotated.push(note);
    }
  }
  return withReleases
    ? { attacks: annotated, pedalChanges: convertedPedal, unmatchedNoteOffs }
    : { attacks: annotated, pedalChanges: convertedPedal };
}

/** Backward-compatible note-on-only reference: CC64 is never treated as a note. */
export function parseMidiOnsets(bytes) {
  return parseMidiReference(bytes).attacks.map(x => ({ midi: x.midi, onsetMs: x.onsetMs }));

}

/** Select a WAV clip's MIDI reference window and rebase to clip-local milliseconds. */
export function selectMidiAttacksForAudioClip(events, { startMs, durationMs }) {
  if (!Number.isFinite(startMs) || startMs < 0 ||
      !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('Invalid clip start/duration');
  }
  return events
    .filter(item => item.onsetMs >= startMs && item.onsetMs < startMs + durationMs)
    .map(item => ({
      midi: item.midi, onsetMs: item.onsetMs - startMs,
      ...('pedalDownAtOnset' in item ? { pedalDownAtOnset: item.pedalDownAtOnset } : {}),
      ...('keyReleaseMs' in item ? {
        keyReleaseMs: item.keyReleaseMs === null ? null : item.keyReleaseMs - startMs,
        midiControlEndMs: item.midiControlEndMs === null ? null : item.midiControlEndMs - startMs,
        pedalHeldAfterRelease: item.pedalHeldAfterRelease,
        ambiguousRelease: item.ambiguousRelease
      } : {})
    }));
}
