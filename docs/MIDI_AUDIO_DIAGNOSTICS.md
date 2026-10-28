# MIDI / Audio diagnostics and hardware acceptance

The **Settings → MIDI / Audio — диагностика задержки** section provides
local measurements for investigating sluggish notes and stuck sustain voices.

## What is measured

- **JS → audio dispatch**: elapsed time from entry into the Web MIDI message
  handler to return from the sound-engine `noteOn` invocation. This measures
  synchronous main-thread work and command dispatch only. The rolling window
  retains the latest **128 note-ons**. Median, 95th percentile and maximum
  are computed from this bounded window.
- **SoundFont / oscillator counts**: number of successfully dispatched note-ons
  by each path since the last diagnostics reset. Loading a bank may temporarily
  route a note to the oscillator; this is counted by its actual route.
- **Tracked MIDI voices / peak**: the keys/oscillator voices tracked by
  `AudioEngine`. SoundFont's release tails and internal CC64-sustained sample
  voices are not exposed by SpessaSynth and are not included.
- **Pedal channels**: count of MIDI channels whose CC64 value is at least 64.
- **AudioContext state and sample rate**: browser Web Audio context metadata.
- **baseLatency/outputLatency**: estimates from the browser when available;
  `—` means unavailable. They are not acoustic measurements.

All measurements remain in memory; reloading resets them. No note pitches,
device IDs or event logs are persisted or transmitted. The Reset button clears
measurements without altering lesson progress, notes or audio output.

**This panel does not measure the time from a human pressing a key until the
sound leaves the speakers.** The USB and MIDI transport, worklet render delay,
driver buffering, OS mixer, speaker latency and human perception are not included.
Do not sum the displayed figures and label the result “actual latency.”

## Guided physical hardware self-check (PR #16)

In **Settings → MIDI / Audio — диагностика задержки**, expand the section
and select **Начать проверку MIDI**. Perform the four visible steps:

1. Play and release one physical note (a matching Note Off is required).
2. Hold two physical keys simultaneously (two successive single taps do not count).
3. If a compatible pedal is connected, hold sustain (CC64), play and release a
   key on the same MIDI channel, then release the pedal.
4. Optionally hold one key and disconnect the controller to verify the
   disconnect panic resets active voices. Reconnect afterward.

Results are shown live; select **Завершить проверку**, then **Скачать отчёт JSON**.
The report contains only check booleans, counts and the diagnostics aggregates
already shown in the panel. No key numbers, velocities, device IDs, raw MIDI
messages or per-event times appear in the file. Nothing is uploaded.

**Important:** while Settings are open, MIDI still plays sound but no notes
count toward lesson grading. Opening Settings pauses any running flow; closing
the drawer does not silently resume it. This makes the check safe during a
course session. Marked "Пройдено" means the browser received the expected MIDI
event sequence, **not** that physical sound quality or key-to-speaker latency
has been measured. Pedal and unplug tests can remain "Не проверено" on
hardware without those features.

## Physical keyboard UAT (manual)

1. Open Nota-Re in a Chromium browser, connect a MIDI keyboard, and permit Web
   MIDI. Select **Синтезатор**, open the MIDI / Audio diagnostics section,
   reset measurements, and play one note at several velocity levels. Check
   that the measured sample count grows and that the oscillator responds
   audibly to velocity without double-scoring releases.
2. Hold as many keys as the controller allows, then release them. Voice count
   should rise and return to zero. Repeat while pressing sustain (CC64 ≥64);
   release keys, then release the pedal (CC64 <64). No oscillator should remain
   audible afterward. A keyboard with no sustain interface cannot complete
   this step without a compatible controller/pedal.
3. Choose **SoundFont (по умолчанию)** and confirm the bank reports Ready.
   Repeat short and long notes at different velocities, a chord, repeated
   strikes at the same pitch and sustain. The output-route counter should
   indicate SoundFont rather than oscillator after readiness.
4. Unplug a MIDI device during a held chord. Playback should stop via panic
   and the connected-port count should update. Reconnect and try again.
5. Test a quiet room with headphones and built-in speakers separately.
   Record browser, OS, keyboard model, audio interface and bank source,
   then report *perceived* delays or clicks separately from the JS timing
   panel. Compare browser audio estimates only across equivalent setups.

The CI exercise in `tests/midi-stress.smoke.mjs` simulates 24 simultaneous
held notes, CC64 release, 150 quick retriggers, MIDI channel independence,
SoundFont voice cleanup and hardware-disconnect panic in a real Chrome browser.
This checks the software state machine, **not physical output quality**.

## Remaining engineering work

- Capture actual key-to-speaker latency with an external loopback or calibrated
  recording rig. Web MIDI timestamps + `AudioContext.getOutputTimestamp()`
  may help attribute software timing, but cannot provide absolute acoustic
  latency without measurement of the emitted sound.
- Validate long-session memory growth, worklet underruns, actual hardware
  pedal behavior, mobile audio constraints and simultaneous channel-16
  reference playback.
