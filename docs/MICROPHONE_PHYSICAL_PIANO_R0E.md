# R0E — Acoustic piano microphone diagnostics inside Nota-Re

This diagnostic is **part of the real Nota-Re app**, not a standalone
server or separate laboratory. Find it in:

**Студия → Лаборатория → Акустическое пианино · Микрофон → Открыть диагностику.**

The feature is explicitly opt-in, for ungraded research/practice only.
Official lesson certification is unchanged and still uses MIDI alone.

## How to try it on a real acoustic piano

1. Open the deployed HTTPS Nota-Re app in recent Chrome/Edge, or run
   `npm ci && npm run dev` locally and visit the Vite localhost URL.
   You do **not** need a separate server, URL, installation step or
   standalone microphone app.
2. Select **Студия** and the existing **Лаборатория** tab. Expand
   **Акустическое пианино · Микрофон**.
3. Put a laptop/external mic around 30–60 cm from the acoustic instrument.
   Limit fan/background noise. Stop other Nota-Re audio demonstrations;
   they can trigger microphone detections.
4. Click **Начать прослушивание** and grant the browser's microphone
   permission. PitchPlease 3.1.0 piano assets are hosted by the same
   app and loaded only after an explicit Start gesture. Test isolated notes,
   same-pitch retriggers, C/E/G chords, bass/treble, and pedal use.
5. Click **Остановить**. Optionally download an aggregate diagnostic JSON,
   then vary mic distance or room noise and compare sessions.

There is no audio recorder, no background upload, no note timeline in
the downloadable JSON, and no requirement to use an unrelated MIDI
keyboard. Microphone capture is terminated on Stop, after 120 seconds,
when the document is hidden, or when Studio/Lab is left.

## Optional same-instrument MIDI reference

Expand the optional MIDI-reference section, explicitly connect a MIDI
input and affirm that the **same sounding piano** generates that MIDI.
This applies to verified sensor-equipped acoustic pianos, hybrids or
digital pianos whose built-in speakers are audible to the microphone.
It does **not** apply to unrelated MIDI keyboards playing alongside an
acoustic piano.

Only with valid same-instrument MIDI are browser MIDI-to-JS-callback
agreement and lag percentiles reported. They are **not** calibrated
hammer-strike-to-microphone or true note-to-screen latency.
Without independent MIDI, all accuracy/latency fields are intentionally
`null`, and only attack count and frame activity are available.
The diagnostic never supplies course credit or changes the MIDI scorer.

## Implementation and verification boundaries

- Runtime: lazy-loaded pinned `@markusstrasser/pitchplease@3.1.0`,
  its piano model/AudioWorklet/WASM copied into the real Vite app's
  `public/pitchplease` assets during `npm run dev` and `npm run build`.
  Paths are resolved against Vite's `BASE_URL` for Cloudflare or
  GitHub Pages. It cannot trigger microphone access on normal app load.
- UX: `src/components/workspaces/MicrophoneResearchPanel.tsx` is
  mounted only when a user opens the card in `LabWorkspace.tsx`.
  Unmount destroys the detector and microphone stream.
- Data: `src/core/audio/microphoneLab.ts` contains bounded note
  detection and aggregate, privacy-filtered diagnostic reporting.
- Acceptance: `tests/microphoneInStudio.test.mjs` and
  `tests/microphone-in-studio.smoke.mjs` verify no passive capture,
  genuine ML AudioWorklet frames using a fake Chrome OS microphone,
  explicit Stop, track release when leaving Studio, and aggregate-only
  download. A fake Chrome microphone is **not** an acoustic piano test.

Remaining work in [Issue #129](https://github.com/shafranek-js/Nota-Re/issues/129):
physical piano measurements in different rooms and device combinations,
independent reference synchronization, polyphonic and pedaled accuracy
under real acoustic conditions, and calibrated physical-input-to-screen
latency. Do not enable microphone grading based on these initial tests.
