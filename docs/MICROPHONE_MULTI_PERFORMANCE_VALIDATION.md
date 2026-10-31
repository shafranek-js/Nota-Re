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

### R0C release-aware MIDI controller envelopes (follow-up to #138)

With `parseMidiReference(midiBytes, { withReleases: true })` the research
pipeline decodes both real Note Off (0x8n) and zero-velocity Note On (0x9n).
It pairs key-down and key-up by channel and pitch. Overlapping same-pitch
key-downs cannot be paired unambiguously, so the notes are flagged rather
than used in the clean release condition groups. A same-pitch reattack
during pedal-held release also makes the *earlier* control envelope
ambiguous. Unmatched Note Offs and missing key releases are audited.

For each reference *attack* the clip keeps `keyReleaseMs`,
`midiControlEndMs`, `pedalHeldAfterRelease` and `ambiguousRelease`.
When a key is released with CC64 up, the MIDI control end equals key-up.
When CC64 is down at key-up, the control end is the next CC64 pedal-up
event. A missing pedal-up is censored as `null`; absent CC64 on that MIDI
channel is **unknown**, never assumed to be pedal-up. The entire
original MIDI file is processed before cutting a 14-second excerpt:
relative key-up/control-end timestamps may exceed the excerpt duration.
They must not be clipped to its end or misread as observed audio there.

Research `conditions.json` adds *truth-defined* recall for complete
unambiguous key releases, pedal-held after release, and non-held key
releases; ambiguous/missing/unknown references remain separately counted.
MIDI controller-hold P50/P95 are durations between the key-up event
and later pedal-up, for complete unambiguous examples only. These are
**NOT acoustically measured decay or real-time delay**, and the models
still output note onsets rather than reliable note-off predictions.
Thus the extra data measures how *attack* detection behaves under
release/sustain conditions; it does not measure whether a model detects
key releases correctly.

The shared reference including these annotations must be byte-equivalent
between both model exporters. Invalid, unequal, or physically impossible
release-envelope annotations fail the comparison. The normal note-on
scoring, thresholds, and official MIDI course grading are unchanged.


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

## Reproducible offline computation timing (R0C next slice)

The research-only exporter scripts now attach an `offlineRuntime` object to
each model's JSON dataset. The optional three-performance workflow performs
**one first invocation plus one immediate warm repeat on the exact same
14-second source WAV** for each pinned detector. The first invocation's
actual output is the only one scored; the repeat is never injected into
the TP/FP/FN evaluation. Timing uses monotonic Node.js
`performance.now()`, and includes per-model:

- `modelInitializationMs`: in-process setup. For PitchPlease this covers
  importing/checking the pinned package; its piano weights may only load
  upon first inference. For Basic Pitch it includes reading and loading
  the locally bundled TensorFlow.js graph and weights. These two setup
  timings **are not directly equivalent**.
- Per-clip `wavReadDecodeMs`, `inferenceAndAdapterMs`, and
  `realtimeFactor` (processing milliseconds / WAV duration
  milliseconds); the first clip is marked `coldModelInvocation: true`.
- `firstClipWarmRepeat`: same source WAV and SHA-256, a second inference
  and postprocessing measurement, plus an exact-output-equality audit.
  Identical output is **checked and reported**, never assumed.
- Runner identity: Node version, OS/CPU architecture, logical CPU count,
  first CPU model, CI and GitHub Actions run ID.

`conditions.json` includes `offlineRuntimeProfiles`. Missing profiles
remain explicit `null`. The older single-number `modelRuntimeMs` and
`modelColdStartMs` stay `null`: no meaningful single value spans
different model initialization conventions and multiple case durations.
Runtime reports are validated against exact case IDs, WAV SHA-256 and
clip durations to prevent accidental cross-WAV comparisons.

**Scope:** Wall-clock *offline throughput* on a GitHub-hosted Ubuntu
runner. Results can change with noisy neighboring jobs, load and CPU
capacity; different exporters run in separate Node processes. They
do **not** measure live microphone capture latency, end-to-end
browser initialization, interactive MIDI feedback, onset-emission
delay, streaming performance or mobile-device throughput. Model
setup excludes `npm install`, workflow bootstrapping and remote
asset downloading; offline runtime excludes WAV downloading and
conversion. No latency/certification gate can be passed with these
numbers alone.

## Causal-window feasibility gate (experimental replay, not a streaming model)

The next research slice adds `scripts/causal-window-replay.mjs` and
`scripts/replay-pitchplease-windows.mjs`. Unlike whole-clip transcription,
the same pinned PitchPlease piano recognizer is run on **only the samples
already acquired**: 2,000 ms analysis context, 1,000 ms new-audio hop.
The first window evaluates 0–2 s; later overlapping windows own only the
newly acquired second. They never inspect future samples, and never
reassign false positives to ground truth. Window-local onset timestamps
are rebased to the absolute recording clock. The *old context* of a
window cannot emit duplicate attacks, but genuine later same-pitch
retriggers may be emitted again.

Each completed analysis is timed with a monotonic clock. A **virtual,
sequential single-worker queue** starts no earlier than acquisition of
its full window, and finishes after the measured computation time.
The reported `emittedAtMs` is that virtual finish, **not** a measured
hardware timestamp. The ordinary optimal MIDI pitch/onset matcher
supplies per-take TP/FP/FN and conditional timing errors;
`medianProcessingLatencyMs` and `p95ProcessingLatencyMs` here refer
to *synthetic offline replay emission lag*, not live latency. Every
window also records acquisition boundary, compute time, accepted
attacks and CPU backlog. A non-divisible tail is reported as
unprocessed rather than quietly scored as seen. The current MAESTRO
14-second clips are exactly divisible.

This is a *causal-window feasibility experiment*, **NOT a true
stateful Online AMT model**. Every 2 s slice is re-inferred independently;
the recognizer has no preserved acoustic recurrent state or tested
real-time capture path. We initially test PitchPlease only to establish
whether short-window inference and adapter behavior are meaningful;
Basic Pitch streaming, multiple window configurations and actual
device/browser measurements remain follow-ups. The result must not be
compared as if it were the same algorithm or operating point as
full-clip evaluation. No microphone permissions, certificates,
lesson scoring, front-end model bundles, or captured recordings are
introduced. The workflow uploads JSON-only causal diagnostics.

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
