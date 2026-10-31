# Spotify Basic Pitch — independent offline reference for Nota-Re

Research: [#119](https://github.com/shafranek-js/Nota-Re/issues/119) / [#82](https://github.com/shafranek-js/Nota-Re/issues/82).

This adds a **second model runner** to the standalone, offline microphone-research toolkit. It is not included in the application runtime and has no connection to `useAppStore`, lesson grades or certificates.

## Install pinned benchmark-only dependencies

Requires Node 22+, the repository root, and an authorized local audio corpus.

```sh
npm ci
npm install --no-save --package-lock=false @spotify/basic-pitch@1.0.1 @tensorflow/tfjs@3.21.0 @markusstrasser/pitchplease@3.1.0
```

No production dependency or lockfile changes are committed. Basic Pitch uses the bundled TensorFlow.js GraphModel and weight shards, loaded directly from local files into TensorFlow.js using an in-memory IO handler. There is **no model download** at runtime from a third-party URL. For parity, both model exporters run on the same WAV bytes with the same `expected[]` annotations, and each export records its model revision/hash.

**Sample rate:** This first Basic Pitch runner requires the input WAV to already be **22050 Hz**. Convert each complete source recording/clip once (for example with `ffmpeg -i input.wav -ar 22050 -ac 1 -c:a pcm_s16le corpus/clip.wav`) and then run **both** PitchPlease and Basic Pitch on that *same* converted file. The comparison tool refuses a mismatch in source audio SHA-256. Do not compare one model using the 48 kHz original and another using a 22.05 kHz resampled copy, or infer acoustic timing from resampling alone.

## One common manifest and two exports

Prepare local `corpus/manifest.json`, with independent MIDI note-on references aligned to each WAV. `scripts/create-piano-reference-case.mjs` writes the reference attacks, clip duration, and SHA-256. See [the corpus guide](MICROPHONE_REFERENCE_CORPUS.md).

```sh
node --experimental-strip-types scripts/export-pitchplease-onsets.mjs corpus/manifest.json > corpus/pitchplease-events.json
node --experimental-strip-types scripts/export-basic-pitch-onsets.mjs corpus/manifest.json > corpus/basicpitch-events.json
node --experimental-strip-types scripts/compare-piano-detectors.mjs corpus/pitchplease-events.json corpus/basicpitch-events.json > corpus/comparison.json
```

Basic Pitch is pinned to `@spotify/basic-pitch@1.0.1` and `@tensorflow/tfjs@3.21.0` and converts postprocessed model `outputToNotesPoly(frames,onsets,0.25,0.25,5)` into note-onset hypotheses. It **does not** infer physical releases, use score targets during transcription, inject correct notes, or suppress potentially genuine octaves. End-to-end latency is **not available from offline inference**; null remains null.

## Caveats and next validation gate

- The optional GraphModel runner is not exercised by the default CI because its packages are intentionally not installed in the application lockfile. Its live model/runtime operation is **not yet demonstrated** on the user's piano, and must be validated independently on actual recordings before acceptance.
- Local note-event adapter and comparison rules have deterministic tests only; these are **not recognizer accuracy tests**.
- This first version uses a single fixed transcription operating point, not a swept threshold grid. Do not tune against the final held-out test set.
- The corpus must contain silence, repeated strikes without a quiet gap, genuine octaves, harmonic octave ghosts, mixed hand chords, low bass, pedal and metronome bleed; reports require false attacks per minute and P50/P95 of observed onset offsets. The same acoustic alignment and sample rate must be recorded and checked for both candidates.
- Model weights and training dataset licenses must be considered separately from the package's Apache-2.0 license. No copyrighted piano recordings are committed, uploaded or sent to a remote service by these scripts.

**Still outside scope:** actual microphone permission, browser live latency, inference CPU profiling, acoustic piano acceptance and graded course credit.
