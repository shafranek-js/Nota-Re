# SoundFonts in Nota-Re

Nota-Re uses the same pinned default bank as PianoMotion Studio: **MuseScore General v0.2**,
SF3, 39,900,972 bytes, SHA-256 `5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3`.
The bank is MIT-licensed. Full mandatory attributions and license text: [MuseScore General license](licenses/MuseScore_General_License.md).
The piano preset is GM program 0 (Acoustic Grand Piano).

## User experience

Settings -> **Звук фортепиано** defaults to SoundFont with MuseScore General.
The bank loads from the same app origin on the first note or explicit settings action.
Until ready, the original lightweight oscillator can play notes, so training is never silent.
The status in Settings shows loading, ready, or an actionable error.

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

MIDI note-off, controller velocity, sustain and end-to-end audio scheduling are separate work
in #4/#5. Automated readiness checks do not prove perceived piano timbre or hardware latency.
