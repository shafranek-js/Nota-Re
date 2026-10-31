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

### R0C pedal and genuine-octave attribution (follow-up to #131)

The next research slice parses **independent channel-specific MIDI CC64** from each
original MAESTRO MIDI file. It uses the full recording's controller history
even when the evaluated audio clip begins mid-performance, preserving pedal
state at the first selected note. The note-on-only parser remains backward
compatible. CC64 never creates an extra note attack.

A MIDI channel containing no CC64 messages is annotated
`pedalDownAtOnset: null` (unknown). On channels where CC64 is present, the
MIDI default before its first controller event is pedal-up; CC64 values 64–127
are down and 0–63 are up. Same-tick ordering follows the raw SMF event order
and may be ambiguous across independent MIDI tracks. These flags indicate
**controller state at note onset**, not audible sustain duration, acoustic
damping, or proof the physical piano used an identical pedal mechanism.

`conditions.json` now describes three extra reference-derived note-recall
conditions: `genuineOctaveWithin50Ms`, `pedalDownAtOnset` and
`pedalUpAtOnset`; a separate `pedalUnknownAtOnset` counts unannotated
attacks. Both ends of a genuine octave can be counted because these are
reference **note attacks**, not an octave-pair count. Model FPs cannot be
reassigned to these truth conditions and are still scored only in the main
one-to-one benchmark. The output keeps independent octave-truth conditions
strictly separate from *unmatched* prediction/octave coincidences.

The exact CC64 annotations are propagated through both offline exported
datasets; their equality is enforced by `comparePianoDetectors` along with
matching note attacks, WAV SHA-256 and clip duration. Invalid or conflicting
CC64 labels fail the comparison. All original WAV/MIDI remain runner-local;
only JSON truth annotations, source audit and summary are uploaded.

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

Missing measurements remain explicitly `null`: live microphone latency,
model cold-start/runtime, and **acoustic sustain behavior**. Do not call
offline onset-time errors live I/O latency. A reference-derived CC64 label
must not be called a measurement of audible pedal resonance. The next phase
should add note-off/release-aware sustain windows, more diverse passages,
noise conditions, and an actual phone/laptop microphone with calibrated
reference timing.

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
