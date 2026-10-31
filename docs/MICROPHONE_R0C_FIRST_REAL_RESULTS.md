# R0C: first real acoustic-piano detector comparison — 2026-10-31

**Evidence:** [GitHub Actions run 41192412508](https://github.com/shafranek-js/Nota-Re/actions/runs/41192412508) (success), JSON-only artifact `maestro-validation-pilot-reports` (7-day retention). This is a **one-take pilot**, not a detector ranking or permission to grade lessons.

## Verified source and methodology

- Dataset: [MAESTRO v3.0.0](https://magenta.tensorflow.org/datasets/maestro), **validation** split (test split remains untouched), source year **2015**.
- Piece: **Franz Liszt — Transcendental Étude No. 1, “Preludio”**.
- Source path: `2015/MIDI-Unprocessed_R1_D1-1-8_mid--AUDIO-from_mp3_06_R1_2015_wav--3.wav`.
- Source MIDI and audio independently provided by MAESTRO and aligned by the dataset; source metadata and SHA-256 are included in the workflow artifact.
- Selected clip duration **14 s**, mono PCM16 **22050 Hz**. Both models received the **same exact WAV bytes**, SHA-256 `a6fc999b06a3f4b2b8be345c6a3cad93c00c3f0474e6a3a8833bee61e3d300cb`.
- Ground-truth **223 MIDI Note On** events, about **15.9 attacks per second**, including dense polyphony. Comparisons use exact MIDI pitch and a fixed inclusive **100 ms** onset tolerance.
- PitchPlease 3.1.0 `piano` revision `28bf7933b9c5` with the R0 frame-activation onset converter. Spotify Basic Pitch 1.0.1 / TFJS 3.21.0, model SHA-256 `05b1841066b99dbacaed788987144c5d8184bff150e34a6684ec26b20747c4e5`, fixed postprocessing 0.25/0.25/5.

## Actual model results

| Metric | PitchPlease 3.1.0 | Spotify Basic Pitch 1.0.1 |
|---|---:|---:|
| Recognized event hypotheses | 309 | 370 |
| True positives | **182** | 164 |
| False positives | **127** | 206 |
| False negatives | **41** | 59 |
| Precision | **58.9%** | 44.3% |
| Recall | **81.6%** | 73.5% |
| Event F1 | **68.4%** | 55.3% |
| Median absolute onset error, **matched notes only** | 17.7 ms | 7.7 ms |
| P95 absolute onset error, **matched notes only** | 62.4 ms | 50.9 ms |
| False attack hypotheses / minute of this clip | 544 | 883 |
| Measured live microphone latency | **not measured** | **not measured** |

PitchPlease has better attack precision and recall for **this one dense passage**. Basic Pitch timestamps **matched** attacks more precisely but has more missed and extra notes. Its lower matched-onset error does **not** establish better live feedback latency.

## Exploratory failure pattern (descriptive, not a proven root cause)

Replaying the same one-to-one pitch/time matching on the exported event lists:

- Of PitchPlease's 127 unmatched detections, **53** occur within ±100 ms of a *reference* pitch exactly **12 semitones** away. For Basic Pitch, **77** of its 206 unmatched detections do. These are **octave-adjacent coincidences**, not confirmed overtone aliases; the piano may genuinely contain simultaneous octaves.
- Within ±100 ms of *any* reference attack, there are **122/127** PitchPlease and **206/206** Basic Pitch false positives. Many extra events appear inside busy musical moments rather than in silences.
- Median **signed** matched attack offset is approximately **+17 ms** for PitchPlease and **+6 ms** for Basic Pitch; those are not microphone I/O latencies.
- This clip is a high-density Liszt etude; it is not representative of early Nota-Re lessons or an untreated room/mobile microphone.

The octave-coincidence counts are exploratory; the formal evaluator's original TP/FP/FN metrics above remain the sole benchmark truth. **Do not remove a weaker note solely because it is an octave above another**: it may be a genuinely played octave.

## Engineering implications / next decision gates

1. Maintain independent source detection: score-aware matching may prioritize expected attacks but must still expose genuinely detected wrong/extraneous notes, not inject targets into model outputs.
2. Before threshold tuning, obtain additional **validation** excerpts with different onset densities, isolated notes, real octaves, repeated same-note hammer strikes, low bass, pedal, and silence. Report per-condition confidence intervals; do not use the final `test` split for tuning.
3. Examine fresh-note onset evidence rather than pitch-active frames only; especially re-attacks while another piano tone is still decaying.
4. Evaluate the streaming **Online AMT** candidate and measure runtime cost and actual live microphone-to-feedback latency on representative browser/device combinations.
5. Continue to bar formal course credit from experimental microphone input; current MIDI grading remains authoritative.

**Scientific boundaries:** one excerpt, a professional recording, one operating point per model, no P50/P95 of true device latency, no blinded held-out comparison, no proof that octave-adjacent predictions are physically caused by harmonics. No third-party audio is committed to or served by Nota-Re.
