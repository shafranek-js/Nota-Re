# Cross-detector comparison — identical piano recordings only

Tracking: [#119](https://github.com/shafranek-js/Nota-Re/issues/119), parent [#82](https://github.com/shafranek-js/Nota-Re/issues/82).

This offline comparator does **not** score Nota-Re lessons, validate a real microphone, or prove a model's accuracy. It rejects unfair comparisons before showing any ranking.

## Integrity requirements

Every exported case must contain:
- `id`, `category`, `expected[]`, `detected[]` and a common `onsetToleranceMs`.
- `audioSha256`: 64-digit hex SHA-256 of the **exact source WAV bytes**, not the original MIDI or a path string.
- `durationMs`: strictly positive duration of those exact WAV bytes, no more than 10 minutes per test clip.

All engines must have exactly the same case IDs, category labels, audio hashes, durations, and independent expected attacks (same MIDI pitch and onset timestamp; input ordering may differ). Each exported `engine` identity must be distinct and name its model/revision/adapter. Otherwise `comparePianoDetectors()` throws; it **does not silently drop unmatched cases**.

`scripts/export-pitchplease-onsets.mjs` computes hashes directly from the local WAV bytes and checks optional `audioSha256`/`durationMs` values supplied by the manifest. `scripts/create-piano-reference-case.mjs` now writes both metadata fields. This detects accidentally substituted recordings, but **cannot prove an audio/MIDI pair is synchronized**. Independent time-origin validation remains a separate scientific requirement.

## Usage

With the same unmodified corpus manifest:

```sh
node --experimental-strip-types scripts/export-pitchplease-onsets.mjs my-piano/manifest.json > my-piano/pitchplease-events.json
# Run a second independent model on the identical corpus into my-piano/second-engine.json.
node --experimental-strip-types scripts/compare-piano-detectors.mjs my-piano/pitchplease-events.json my-piano/second-engine.json > my-piano/comparison.json
```

The comparator needs two or more different detector datasets. It is not a replacement for running the models: no second model is included by this PR. An `example.json` with fabricated hashes does **not** provide empirical acoustic validation.

## Metrics

Each model receives a micro-averaged overall summary and individual category summaries. The same note-onset criterion and exact pitch are used for every model. It reports true/false positive and false negative attacks, precision, recall, F1, P50/P95 absolute onset error, P50/P95 detection-emission latency (null when not measured), number of latency observations, evaluated duration and false attacks per minute.

The denominator of false positives/minute is the sum of **all verified clip durations** in the group, including silence and notes with zero detections. It is **not** inferred from the number of annotated note onsets or from an arbitrary analysis window. Where an offline export has no `emittedAtMs`, its latency remains unknown; do not set it to zero or compare it with live latency measurements.

The comparator does not produce a winner, measure CPU or loading cost, rank tiny datasets, detect annotation mistakes or normalize different acoustic recording hardware. It cannot prevent data leakage across split subsets; the corpus collection process must enforce independent recordings and an untuned evaluation split. MAESTRO audio remains external and subject to its CC BY-NC-SA license.

## No training/certification integration

Do not import this module in `useAppStore`, `trainerSession`, `polyphonicAssessment` or the lesson credit pipeline. Recognition is experimental until manual/quantitative UAT explicitly authorizes a particular microphone-driven practice capability.
