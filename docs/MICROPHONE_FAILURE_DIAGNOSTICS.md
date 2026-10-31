# R0C diagnostic follow-up — classify false note hypotheses, do not suppress them

Tracking [#129](https://github.com/shafranek-js/Nota-Re/issues/129) and [#119](https://github.com/shafranek-js/Nota-Re/issues/119).

After the verified MAESTRO validation pilot showed **127 PitchPlease** and **206 Basic Pitch** unmatched note attacks in a dense 14 s Liszt etude, it became important to distinguish what is measured from what we merely suspect.

The new `microphoneFailureAnalysis.ts` calls Nota-Re's existing **optimal one-to-one note-onset evaluator** to obtain the *exact same matched/unmatched indices*. It never reassigns match identities, modifies incoming note observations or adds target notes to any recognizer.

Run locally on the exported benchmark files:

```sh
node --experimental-strip-types scripts/diagnose-piano-errors.mjs corpus/pitchplease.json corpus/basicpitch.json > corpus/diagnosis.json
```

The next real-piano pilot workflow also produces `diagnosis.json` (JSON-only GitHub artifact; no audio), with:

- True positives, false positives and missed attacks split by bass (MIDI 21–47), middle (48–71), treble (72–108).
- Number of **unmatched** predicted attacks whose timestamps lie within the scoring tolerance of **any** independent MIDI attack.
- Within the same time tolerance, octave coincidences at 12 and 24 semitones and higher partial-related offsets at 19 and 28 semitones.
- Same-pitch extra predictions at 1–2 scoring tolerances from a reference (potential timing misalignment / duplicated attack).
- Median **signed** onset-estimation bias for matched attacks, not live microphone-to-screen latency.

### What these diagnostics do NOT mean

A pitch 12 semitones above a simultaneous reference attack is not necessarily an acoustic harmonic. A player can perform genuine octaves, a chord can contain coincident pitches, and overlap can be musically intentional. Counts may overlap categories and must not be summed as if they were mutually exclusive. No octave filtering or score-aware sanitization is implemented here.

These diagnostics apply to model predictions **after** matching against independent MIDI ground truth and should never be used to hide wrong notes in the app. This remains a research tool, not a lesson-grade change.

A single 14-second etude is inadequate to select thresholds, a production model or course certification rules. The correct next dataset is several independent MAESTRO **validation** performances (and eventually actual mobile-phone/room microphone recordings), with the final MAESTRO test split untouched until choices are frozen.
