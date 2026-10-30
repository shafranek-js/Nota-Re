# SoundFonts in Nota-Re

Nota-Re uses the same pinned default bank as PianoMotion Studio: **MuseScore General v0.2**,
SF3, 39,900,972 bytes, SHA-256 `5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3`.
The bank is MIT-licensed. Full mandatory attributions and license text: [MuseScore General license](licenses/MuseScore_General_License.md).
The piano preset is GM program 0 (Acoustic Grand Piano).

## User experience

Settings -> **Звук фортепиано** defaults to SoundFont with MuseScore General.
When SoundFont is selected, the app immediately downloads and prepares the bank from its own origin during startup. Browser autoplay policies can still require a user gesture to resume the AudioContext, but downloading does not wait for the first note.
While the bank initializes, early notes **do not silently switch** to a Web Audio oscillator: a physically held MIDI key can sound through SoundFont once ready, while released MIDI notes are never replayed late. Short virtual keys are not replayed after the musical moment has passed. The status bar and Settings show loading/ready/error. Only explicit **Синтезатор** selection or an actual bank failure permits oscillator fallback. Choosing the synthesizer skips SoundFont initialization.

Choose **Подключить свой SF2/SF3** to import a personal bank. The file is stored in IndexedDB
on the current browser/device and the source preference is saved in localStorage.
Nothing is uploaded to a server. **Встроенный банк** resets the preference to MuseScore General;
**Синтезатор** chooses the original oscillator.

Private browsing or storage eviction may remove a custom bank. If it is missing or broken,
the oscillator remains available, and the built-in bank can be restored.

## Build and license integrity

- `scripts/prepare-soundfont-assets.mjs` downloads the exact pinned bank from the official mirror or an identical SHA-256 mirror, validates RIFF/size/checksum, and generates four parts each <=12 MiB.
- Binary source and split assets are untracked generated build outputs; static deployments need no Worker or runtime CORS.
- `scripts/copy-soundfont-worklet.mjs` copies the AudioWorklet matching the installed SpessaSynth package.
- `npm run build` and `npm run dev` prepare the bank and worklet. For offline development, retain the verified local source in `assets/soundfonts`.
- `src/core/audio/SoundFontPiano.ts` hosts a lazy SpessaSynth WorkletSynthesizer and retains oscillator fallback.
- `src/core/audio/soundfontBank.ts` holds the built-in manifest validator and local storage adapter.

## Verification and known limits

`npm test` validates settings defaults and RIFF headers; `npm run build` verifies source SHA-256.
`tests/soundfont.smoke.mjs` tests built-in readiness, oscillator switch, personal SF3 import,
refresh and restoring the default in a real Chrome session.

## Audio timeline and cancellation

In PR #11, Nota-Re added full Note On/Off, MIDI velocity, CC64 sustain and
disconnect-panic handling for live MIDI channels 1–16. In PR #14, the metronome,
syllable demos, articulation demos, and score preview were moved from JavaScript
onset timers to **absolute AudioContext timestamps**. The preview queue runs a
short (120 ms) lookahead; its JS timer only queues future events.

SpessaSynth 4.4 accepts `{ time: audioContextTime }` in both `noteOn` and
`noteOff`. Preview samples use melodic channel 16 (zero-based 15), since
attempts to allocate a 17th channel emitted inconsistent channel-state
callbacks in Chrome. To avoid cutting a live note on MIDI channel 16, the
engine temporarily uses an independent Web Audio oscillator voice for that
channel during SoundFont previews; if that channel is already held, the preview
uses oscillators for its duration. Normal channel-1 hardware playback and the
built-in bank are unaffected.

New notes keep the fixed musical timeline rather than inheriting late
JavaScript callback times. The visual cursor is still advanced by small JS
wakeups, and background-tab or excessive main-thread stalls pause grading
rather than inventing missed responses.

`tests/audioTimeline.test.mjs` checks the onset grid, cancellation and
deadline calculations. `tests/audio-timeline.smoke.mjs` reads real scheduled
AudioContext oscillator start times in Chrome. Automated tests cannot judge
perceived piano tone, MIDI round-trip latency or all device/browser combinations.

**Remaining #4 / #5 work:** instrument latency measurements, hardware pedal
UAT and long-session performance (including browser throttling).
