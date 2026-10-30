# ScoreDocument v1 — musical data boundary

This is the first **independent, unconnected** implementation step for [Issue #78](https://github.com/shafranek-js/Nota-Re/issues/78). It does **not** yet import arbitrary MusicXML into the training engine, modify course scoring, or enable repertoire exercises.

## Identity and time

- `ScoreDocument` contains `parts`, `measures`, `events` and quarter-note tempo changes.
- A measure has a **stable ID** (separate from its printed measure number), an exact global start/duration, and its own meter and key context.
- Each event has a stable ID, `partId`, `measureId`, **one-based** staff number, independent `voice`, onset and duration, optional pitch/spelling or an explicit rest, and an optional forward tie link.
- The unit of score time is the **quarter note** as a reduced rational `{numerator, denominator}`, not fixed `TICKS_PER_MEASURE=16`. For example 6/8 occupies 3 quarter notes, a triplet can be 1/3 quarter, and 3/4 occupies 3 quarter notes.
- Operations use exact BigInt cross-products and reduce to safe integer numerators/denominators. Excessively large/unrepresentable values are rejected, not silently rounded.
- A chord consists of distinct pitches with the **same onset and duration within one voice**. Overlapping events with distinct onsets on a staff must have distinct voice IDs.
- Ties require matching pitch **spelling** and MIDI value, staff/voice/part and exact contiguous time. A tie is not a slur and does not trigger another note attack.
- Events cannot extend outside their owning measure. A note spanning a barline must be represented as separate tied note segments; this is done by the legacy bridge.
- Pickup/partial bars are explicit and shorter than or equal to the current meter. Meter changes are measure-local.

## Capability policy

`getScoreCapabilities(document)` returns separate eligibility objects for display, teaching overlays and performance assessment. **Eligibility is not success**: the actual OSMD file load still has to work.

**Imported repertoire remains view-only**, even when its notes happen to be simple. A valid score structure does **not** authorize grading or certification. Initially, generated `ScoreDocument` values are also excluded from grading and overlays because the new model is not wired into the existing exercise engine. The old generated-score flow continues unaffected.

`InputEvidence` is source-tagged: MIDI, PC keyboard, microphone and assisted. Confidence and valid pitch measurements may make a microphone observation usable for diagnostics, but **not eligible for course certification**. An assisted observation never qualifies as pitch evidence.

## Integration & compatibility

`fromLegacyExerciseScore()` adapts existing `ExerciseScore` to this model, splitting events at 4/4 barlines and linking the segments. Existing `musicXml.ts`, `osmdGeometryAdapter.ts`, `scoreMasks.ts`, `polyphonicAssessment.ts`, and the course state are **unchanged**.

This bridge keeps the legacy semitone-based enharmonic mapping (including B-flat in F major) only for the *generated* scores. Imported MusicXML must preserve its original note spelling.

`selectScoreMeasures()` builds an immutable A–B selection with **source time and event IDs unchanged**. It is **not yet a playback loop**. A real loop will need transport timing, repeats/voltas, tempo changes and a stop boundary.

## Next integrations

1. Build a separate MusicXML/MXL → ScoreDocument parser for supported score structures with explicit unsupported-feature reports, avoiding reuse of OSMD's SVG geometry as a parser.
2. Map imported events to actual engraved noteheads by stable source identities; reject impossible/ambiguous mappings.
3. Enable individual teaching overlays only when that mode's note/time/voice assumptions hold.
4. Add non-certifying one-note practice transport and measure range; only later assess supported polyphonic input.
5. Add a versioned attempt observation store for the adaptive generator in #80.

## Regression verification

`tests/scoreDocument.test.mjs` covers: rational tuplets, mixed 3/4 → 6/8 → 4/4, two-voice overlap, three-note chord, independent bass, tied notes, error cases, staff/measure/tempo validation, immutable A–B selection, capability locks, input source checks and conversion of an existing simultaneous-hands score across a barline.

Run `npm test`, `npm run build`, and the unchanged Chrome smoke suites. Do not replace existing 12-lesson certification with this model until separately accepted.
