# Nota-Re — PitchPlease 3.1.0 offline benchmark adapter

Parent [#119](https://github.com/shafranek-js/Nota-Re/issues/119) / epic [#82](https://github.com/shafranek-js/Nota-Re/issues/82). This is a **lab**, not the app's microphone input and not evidence for course credit.

## What has been built

- `scripts/read-piano-wav.mjs`: bounded local-only RIFF WAV decoder (PCM 16/24/32 or IEEE float32; 1–2 channels; 8–192 kHz), output mono float samples.
- `src/core/audio/activationOnsetAdapter.ts`: converts per-frame active notes into estimated note attacks, without any score-informed filtering.
- `scripts/export-pitchplease-onsets.mjs`: uses the **pinned** `@markusstrasser/pitchplease@3.1.0` `piano` model and `analyze()` in Node. Does **not** import this library into production, request microphone permissions, store recordings, or change app input.
- `scripts/evaluate-piano-detector.mjs`: evaluates the exported event JSON against truth. Its notes, not the app's scoring engine, produce precision/recall/F1.

## Benchmark-only installation

Run from the project root, using Node 22+. The package is intentionally **not** in `package.json` or `package-lock.json` yet; it does not ship with the app. This explicit optional command affects local `node_modules` only:

```sh
npm ci
npm install --no-save --package-lock=false @markusstrasser/pitchplease@3.1.0
```

To run against a corpus, make an untracked manifest `my-piano/manifest.json` and a corresponding WAV:

```json
{
  "schemaVersion": 1,
  "onsetToleranceMs": 100,
  "cases": [
    {
      "id": "my-piano-c4-take1",
      "category": "single",
      "wav": "./c4.wav",
      "expected": [{ "midi": 60, "onsetMs": 1000 }]
    }
  ]
}
```

The physical attack in this example is **illustrative**, not an observed result. For a valid test it must be independently annotated or synchronized from a real reference recording, relative to the start of the WAV. If timestamps are not aligned, the report is meaningless.

```sh
node --experimental-strip-types scripts/export-pitchplease-onsets.mjs my-piano/manifest.json > my-piano/pitchplease-events.json
node --experimental-strip-types scripts/evaluate-piano-detector.mjs my-piano/pitchplease-events.json
```

The first command writes JSON to stdout, progress to stderr; no HTTP upload occurs. It records model revision from the library. **It does not include `emittedAtMs`**, since an offline computation cannot establish real-time end-to-end latency. That requires a separate live recorder and timing bridge.

## Precisely what baseline does and does not detect

The decoder's `frame.notes` contains pitches selected by PitchPlease, not physical strikes. The adapter counts a new attack only after an inactive gap (default 55 ms) and at least two observed active frames. It timestamps the **first active frame**, not the true hammer strike.

This is deliberately a **naive baseline**: it can detect chord pitches simultaneously but it will **miss a repeated attack of the same key while its pitch stays active** (including with sustain pedal); it can still produce false octave notes, which are counted as false positives rather than removed. The apparent onset time may be late compared with physical key down. Successful unit tests are not proof of acoustic accuracy.

Do not use this output for course certification, rhythm grading, automatic SoundFont playback or claims of `Note Off`. PitchPlease is only one candidate; the next adapters must independently validate ONNX online AMT and Basic Pitch on **the same WAVs and expected note-onset timestamps**.

## Required real-piano evidence

Before comparing or selecting detectors, collect consented recordings with independent ground truth: very low and high single notes, adjacent semitones, real octaves, major/minor chords, omitted chord members, repeated notes under pedal, RH/LH textures, pauses, room noise and metronome bleed. Record piano, microphone distance, device, OS/browser, sample rate, tuning, piano condition, model/kernel revision, and synchronize onset time origin.

For the comparison report, publish TP/FP/FN, event precision/recall/F1 by category and register, onset error P50/P95, independent live emission latency P50/P95, false alarms per minute, cold-start, CPU load and memory. No fixed accuracy threshold is declared met until these are measured. MAESTRO's non-commercial license means it is not bundled in Nota-Re.
