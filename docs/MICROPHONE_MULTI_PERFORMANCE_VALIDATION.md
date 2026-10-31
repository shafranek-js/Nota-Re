# R0C — independent MAESTRO validation performances (Issue #129)

This is a **research-only** extension of the verified 14 s real-piano pilot.
It does not enable microphone input, modify MIDI grading, or make a certification claim.

## What is different

The opt-in GitHub Actions workflow `.github/workflows/maestro-real-piano-corpus.yml`
downloads **three distinct MAESTRO v3.0.0 validation performances from different
composers**, with unique WAV hashes, and creates an aligned 14 s clip from each.
Selection uses only the published metadata (duration and filenames) and source
accessibility, **never prediction outputs**. It takes the shortest available
three distinct-composer recordings among the first 60 duration-sorted candidates.
This is an intentionally convenience-biased pilot sample, not random sampling.

Both pinned research-only detectors process the exact same 22,050 Hz mono PCM16
WAVs, while the optimal one-to-one pitch/onset matcher scores all MIDI Note On
attacks at a fixed exploratory ±100 ms tolerance. MAESTRO's `test` split is
not read. Avoid tuning on the evaluation set.

The source audit records upstream metadata and original WAV/MIDI SHA-256,
plus the derived clip's SHA-256. The workflow uploads **JSON only**, with no
audio, MIDI files, model weights or application microphone capture.

## Run and inspect

Open **GitHub Actions → Microphone R0C — multi-performance MAESTRO validation**,
and select **Run workflow**; changes to the research paths also trigger a
pull-request run. Download the short-lived artifact
`maestro-validation-multi-performance-json` after a successful run.

Artifacts:

- `download-audit.json`, `corpus-source-audit.json`: source provenance,
  declared selection method, year/title/composer and independent reference count.
- `manifest.json`: clip-local independent MIDI Note On reference events.
- `pitchplease.json`, `basicpitch.json`: **unaltered** model predictions.
- `comparison.json`: shared scored matcher, micro-aggregate and category results.
- `diagnosis.json`: unassigned octave/partial coincidences, **not acoustic causes**.
- `conditions.json`: per-performance TP/FP/FN, precision/recall/F1, timing
  error, false notes by register and reference-derived recall conditions.

Conditions are defined *before viewing predictions*: bass MIDI 21–47, middle
48–71, treble 72–108; a simultaneous attack has another **different-pitch
MIDI truth attack** within ±50 ms; a repeated attack has an earlier same-pitch
MIDI truth attack 51–500 ms earlier. Attack density equals the reference
attack count divided by clip seconds. These conditions are not mutually
exclusive; report condition-level **recall**, not fabricated condition
precision or F1 for predictions that have no unambiguous condition label.

`pairedMacroF1` includes a reproducible, paired performance-resampling
interval for the difference between the first and second model's macro-F1.
It is **exploratory**, not an interval proving generalization. Three selected
performances are too few to declare one model superior.

Missing measurements are explicitly `null`: live microphone latency,
model cold-start/runtime, pedal condition. Do not call offline onset-time
errors live I/O latency. Pedal-specific work requires independent MIDI CC64
ground truth and independent alignment. The next phase should add pedal
annotations, more diverse passages, noise conditions, and an actual
phone/laptop microphone with calibrated reference timing.

## Safeguards and limitations

MAESTRO is [CC BY-NC-SA 4.0](https://magenta.tensorflow.org/datasets/maestro).
It is a research dataset, not a commercial redistribution asset. Treat JSON
with MIDI-derived labels as research output too.

The three sources are distinct performances/compositions, but not necessarily
different pianos, rooms, microphones, playing styles, or attack-density strata.
A 14 s excerpt is also not a whole performance. This stage tests pipeline
reproducibility and error patterns, **not** the production quality gate.
Keep the microphone epic #82 and acoustic follow-up #129 open; course credit
remains MIDI-only until an independent device validation supports it.
