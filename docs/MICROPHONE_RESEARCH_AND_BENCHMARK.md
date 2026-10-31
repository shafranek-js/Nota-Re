# Acoustic piano microphone input — reuse-first roadmap (v3.2+)

Tracking: [Epic #82](https://github.com/shafranek-js/Nota-Re/issues/82) and [comparison #119](https://github.com/shafranek-js/Nota-Re/issues/119). Depends on [#78 input evidence](https://github.com/shafranek-js/Nota-Re/issues/78); [#81 polyphonic grading](https://github.com/shafranek-js/Nota-Re/issues/81) has its own safety gate.

## Architectural decision

We should **not** write a proprietary polyphonic DSP / ML recognizer until reusable projects are compared on the same recordings. The goal is to assess played notes against a **known MusicXML score**, with wrong notes and repeated attacks observable too. This is not generic transcription and not a complete emulation of physical MIDI Note Off / sustain. All recognition stays local, microphone permission requires a user action, and official lesson certificates remain inaccessible to unverified microphone input.

## Reuse candidate research

| Candidate | Reuse | Qualification risk |
| --- | --- | --- |
| [PitchPlease](https://github.com/markusstrasser/pitchplease) 3.1.0 (MIT) | Primary lightweight baseline: browser AudioWorklet/WASM, piano/fast models, 88-key per-frame probabilities, offline analyze() | Model author reports piano *frame* F1 0.729 and median note onset latency 40 ms on held-out MAESTRO excerpts. **Not verified in Nota-Re**; mobile CPU and actual microphone latency unknown. Note/chord naming is not proof of all fresh attacks. |
| [Piano Transcription Engine](https://github.com/fschuh/piano-transcription-engine) (MIT; exact commit to pin) | Streaming ONNX AMT; study/use independent ExactChordMatcher with duplicate, overtone-alias, carry-over and incomplete-chord checks | ~72 MB ONNX weights; Git-installed private npm package (not public npm registry), initialization and browser resources need testing; do not copy upstream thresholds without measurement. |
| [Spotify Basic Pitch TS](https://github.com/spotify/basic-pitch-ts) (Apache-2.0) | Offline polypitch reference from recorded chunks | Buffer-inference latency and onset timing need a separate streaming approach. |
| [Matchmaker](https://github.com/pymatchmaker/matchmaker) + [demo](https://github.com/pymatchmaker/matchmaker-demo) | Later: score-following / tempo changes / cursor alignment | Python/server-centric, not a drop-in browser dependency. |
| [Pianly](https://github.com/KeerCode/Pianly) (MIT) | UX reference for MusicXML + MIDI + microphone | Its Basic Pitch path uses 0.5 s buffer and a 250 ms inference loop; strong-octave removal would reject genuinely played octaves. Do not copy unchanged. |

When shipping, verify the **model weights'** and training-data terms separately from the library/package license. Pin artifact hashes and full model revisions, not floating Git HEAD or latest npm.

## Execution roadmap

**R0A — standardized evaluator (first incremental PR).** Pure TS input event schema, case-aware one-to-one comparison, attack precision/recall/F1 and separate onset-timestamp vs detection-emission latency percentiles. Synthetic unit fixtures only. No runtime dependencies, microphone permission, app UI or changes to course credit.

**R0B — frozen recording corpus and offline adapters.** Verify physical note attacks against independently time-aligned MIDI or other reliable reference. Store microphone, room, piano, placement, sample rate, tuned A4, pedal, browser/device, model version/weights and runtime kernel. Build *isolated* import/export adapters for PitchPlease `analyze()`, Basic Pitch and Online AMT to produce the same note-onset JSON. Compare equal recordings and disjoint calibration/test splits. Never use another model's transcription as ground truth.

**R0C — candidate decision.** Compare identical real-piano takes: isolated bass/treble notes, neighboring semitones, genuine octaves, partial/full chords, omitted members, repeated attacks, separate hands, sustain pedal, room noise and metronome/speaker bleed. Measure precision, recall, F1, separate p50/p95 onset error and end-to-end latency, false attacks per minute, model download/init, CPU, memory and audio underruns. Test desktop Chrome/Firefox, Android Chrome and Safari where available. Upstream **frame-F1 is not comparable** to our note-onset F1. Publish results and limitations before selecting a dependency.

**R1 — permissioned live diagnostics.** Explicit PC / MIDI / Microphone (experimental) choice; browser support and permission states; input meters, onset and confidence display; proper stop/revoke/cleanup. A normalized `PianoAudioInput` emits microphone-source evidence into a non-graded practice path. No fabricated Note Off/pedal, no SoundFont echo for mic notes.

**R2 — score-informed mono then polyphony.** Compare the detector's independently recognized attacks with ScoreDocument targets plus unexpected pitches. Separate pitch/onset/active and inconclusive states. Adapt an exact chord matcher only after testing the full set of chord members, duplicates, stale piano tails, genuine octaves and wrong extra notes. Key-release/articulation gates must be disabled for acoustic input unless independently validated.

**R3 — optional grading only after independent UAT.** Quantify false acceptances and timing error by register, device and pedal use. Provide a capability matrix per lesson. Any measurement we cannot prove stays in free practice or requires Web MIDI. Do not rewrite past certificates or silently score unverified microphone events.

## Benchmark format and execution

The evaluator intentionally operates on **note-onset events**, not held-pitch frames. Both truth and predicted attacks must use the same calibrated recording clock, in milliseconds. `emittedAtMs` records when the algorithm actually returned a prediction, distinct from its estimated `onsetMs`. Absence of emission timing means **unknown latency**, never zero. The evaluator requires MIDI 21..108 and verifies time/confidence ranges.

```json
{
  "schemaVersion": 1,
  "engine": "pitchplease@3.1.0:piano:<model-revision>",
  "onsetToleranceMs": 100,
  "cases": [{
    "id": "take-0001",
    "category": "single",
    "expected": [{ "midi": 60, "onsetMs": 1000 }],
    "detected": [{ "midi": 60, "onsetMs": 1015, "emittedAtMs": 1070, "confidence": 0.9 }]
  }]
}
```

To smoke-test the evaluator on **synthetic data, NOT a model or piano result**:

```bash
node --experimental-strip-types scripts/evaluate-piano-detector.mjs tests/fixtures/microphone-benchmark-example.json
npm test
```

For a real export:

```bash
node --experimental-strip-types scripts/evaluate-piano-detector.mjs path/to/model-events.json
```

The output is machine-readable JSON. Matching is exact MIDI pitch, inclusive onset tolerance, **maximum-cardinality and minimum-total-timing-error one-to-one assignment per pitch**. A duplicate prediction cannot satisfy two repeated notes; octave ghosts are distinct false positives; missing chord members are false negatives. `onsetToleranceMs:100` is an *experiment setting*, not a certified rhythm window.

Metrics:
- **TP/FP/FN** count attack events, including all members of chords; **precision** = TP/(TP+FP), **recall** = TP/(TP+FN), **F1** = 2TP/(2TP+FP+FN). Undefined denominators yield null, not perfect accuracy.
- **Onset error** = detector-estimated onset minus ground-truth attack (absolute P50/P95 on matches). Misses remain visible in recall.
- **Processing latency** = prediction emission timestamp minus ground-truth attack (P50/P95 for matches with emission recorded only). Hardware microphone/capture delay requires an independent calibration.
- Overall counts are **micro-averaged**; `overall.matches` indices refer to their individual cases and must not be interpreted as global array indices.
- The evaluator does **not** measure frame-based activations, confidence calibration, CPU, physical key release, real acoustics or latency for missing detections. These require other diagnostics.

## Licensing and privacy

Do not bundle MAESTRO recordings into Nota-Re; the dataset is CC BY-NC-SA and controlled recordings may have additional permissions. Use explicit owner permission for user-recorded reference samples, avoid uploading audio without consent, and keep the initial benchmark fixtures as synthetic event JSON. Upstream thresholds and README benchmark claims are starting hypotheses, **not evidence of real-piano acceptance**.

## Invariants

The R0 evaluator is not imported by `useAppStore`, `exerciseAttempt`, `polyphonicAssessment` or the course scoring engine. No microphone detection is allowed to invoke the existing MIDI Note On grading path until a separate evidence capability gate has been tested and explicitly accepted.
