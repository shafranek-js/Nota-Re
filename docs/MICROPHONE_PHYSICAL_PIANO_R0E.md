# R0E — Locally controlled physical piano microphone research

**Scope:** Development/research-only, no Nota-Re course credit and **not** shipped
as part of the Vite/Cloudflare/GitHub Pages app. It needs a user's actual
laptop/desktop microphone for the remaining empirical work. CI uses Chrome's
fake microphone and **must never be described as a physical acoustic test**.

## Run on your computer

Use a recent Chrome or Edge with microphone access and Node.js >=22. From
the Nota-Re repository root:

```sh
npm ci
npm install --no-save --package-lock=false @markusstrasser/pitchplease@3.1.0
node scripts/serve-local-microphone-lab.mjs
```

Open **http://127.0.0.1:4318/**. The server binds to loopback only;
it does not allow remote connections, has no audio upload endpoint, and
serves only allowlisted local PitchPlease model assets and research scripts.
Access to your microphone is a browser permission gated by the explicit
**Начать с микрофоном** button; you may deny or revoke permission at any time.
Audio is routed only to the pinned PitchPlease 3.1.0 AudioWorklet. There is
no MediaRecorder or audio upload. Click **Остановить и отключить** to
release all audio tracks. Hiding the tab, closing it, errors and the
120-second time limit also terminate the session.

Microphone input is requested with echo cancellation, auto gain and noise
suppression **disabled**; browsers/drivers can override constraints. This
mode is **not** available in the normal course or published site and never
changes official grades. The report must be downloaded explicitly. Export
contains only counts, timing summary when independently warranted, and
configuration flags — *no sound bytes, MIDI event sequence, note list,
device ID or device name*. No report is automatically transmitted.

## First physical piano test — without independent synchronized MIDI

1. Set the laptop microphone about 30–60 cm from an acoustic piano,
   move away from loud fans, and record **no third-party speech**.
2. Test isolated bass/middle/treble notes, held notes, repeated notes,
   C/E/G chords and pedaled passages. Start the microphone first so the
   model can initialize. Each group can be a separate session.
3. Observe **only detected attack count and displayed candidate notes**.
   Export the summary JSON for session length, number of callbacks and
   candidate attacks.
4. Repeat at different distances and with/without an intentional
   background-noise source, noting the test conditions separately.

**Without an instrument-generated synchronized MIDI reference, this
experiment cannot honestly measure precision, recall, missed notes,
polyphonic errors, key-strike-to-screen latency or absolute onset timing.**
A manual button press, separate unsynchronized recording or unrelated
MIDI keyboard is **not** independent ground truth for an acoustic piano.
Do not turn displayed notes into graded lessons.

## Optional MIDI-reference protocol (only when the MIDI key is the same sounding key)

For a hybrid/digital instrument, a verified instrument-provided sensor or
an independently instrumented piano, click **Подключить MIDI-эталон**,
choose its MIDI input and **confirm that the MIDI originates from the
same instrument and performance actually heard by the microphone**.
The instrument's own built-in speakers should be the acoustic source.
Do not use another keyboard while playing the acoustic piano as a
substitute for time-synchronized ground truth. Repeated pitches, chords,
pedal-down/up can then be observed in the same local browser session.

The JSON's optional MIDI comparison uses one-to-one same-pitch matching
with a **0–1000 ms MIDI-dispatch-to-browser-callback** acceptance window,
and reports matched/unmatched counts and lag percentiles. This is a
diagnostic agreement metric, **not calibrated acoustic onset delay**:
MIDI device timestamp, hammer strike, air propagation, input capture,
AudioWorklet processing and browser dispatch have distinct timing
offsets. MIDI CC64 counts are descriptive only and do not independently
measure damping or audible sustain.

## Safety and acceptance

- Nothing is requested or recorded before the user's Start click.
- The selected MIDI reference is optional and requires a separate gesture;
  without it all agreement and latency metrics are `null`.
- Every new session clears previous note history. At most 5,000 local
  diagnostic events per type are kept; exports never include those events.
- A stopped stream must show `MediaStreamTrack.readyState === 'ended'`.
- The research-only Chrome smoke uses a fake OS input to verify permission,
  real AudioWorklet frames, cleanup, local-only HTTP requests and
  aggregate-only JSON. It is not a real-world physical piano measurement.
- A future field study still requires multiple microphones, controlled
  rooms, separately validated hardware synchronization, aligned
  reference MIDI, false-positive/negative analysis, chord/retrigger/pedal
  conditions, and repeatable device latency calibration.

The earlier R0D controlled WebAudio stream generated F1 .654/.741/.730
across three selected MAESTRO performances and did not measure a physical
microphone. Thus neither the R0D numbers nor this R0E diagnostic user
interface authorize microphone-based lesson credit.
