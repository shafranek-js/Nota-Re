# R0C — first acoustic piano validation pilot

Tracking: [#119](https://github.com/shafranek-js/Nota-Re/issues/119), parent [#82](https://github.com/shafranek-js/Nota-Re/issues/82).

## Why this pilot is different from the existing synthetic smoke

This workflow executes **both real models on a recording of a physical acoustic piano**, paired with independent time-aligned MIDI note-on reference events from Google's [MAESTRO v3.0.0](https://magenta.tensorflow.org/datasets/maestro). MAESTRO's own description reports audio/MIDI alignment of approximately 3 ms. It does not prove our two models' accuracy, or model generalization to phone microphones in untreated rooms.

The workflow intentionally uses one short **validation** split performance, preserving the MAESTRO `test` split for later blind evaluation. One clip can reveal serious failures, not establish a reliable overall ranking. The baseline note-activation adapter explicitly misses repeated attacks when the note remains active; this remains a known limitation. The test corpus is recorded close to a professional grand piano, unlike a typical built-in laptop or mobile microphone.

## Implementation

Files:
- `scripts/fetch-maestro-pilot.py` reads the public v3 CSV, selects the shortest accessible performance from the **validation** split under 400 seconds, and downloads the matching `.wav` and `.midi` to a short-lived GitHub Actions runner from the public `ddPn08/maestro-v3.0.0` mirror. The downloader is bounded to a 90 MB source WAV and checks file signatures. All original source names, URLs and SHA-256 hashes are included in the local provenance JSON.
- `scripts/prepare-maestro-pilot.mjs` uses the existing MIDI parser and `ffmpeg` to make a 14-second PCM16 mono 22050 Hz clip anchored near the first MIDI attack, constructs ground-truth note onsets and records the exact clipped WAV SHA-256.
- `.github/workflows/maestro-real-piano-pilot.yml` installs the already pinned optional detectors, runs both on **exactly the same converted WAV bytes**, checks they evaluated the same score/timing, and prints a preliminary note-onset comparison.

No external audio, user recording or soundfont is uploaded by the application. The runner downloads the licensed source recording for the research job and discards it after the job completes. The **only GitHub Actions artifacts** are small JSON audit/manifests/predictions/results, kept for seven days. No MAESTRO WAV or MIDI or weights are committed to the repository or attached to artifacts.

## Run

The workflow is triggered by changes to its defined research code paths in a pull request or can be started manually from GitHub Actions through `workflow_dispatch`. Its result must be read from the actual GitHub Actions log/artifact. Do not claim model success before the actual workflow has completed.

Measured pilot output: one category `maestro-acoustic-piano`, TP, FP, FN, note-onset precision/recall/F1 at an exploratory fixed 100 ms onset tolerance, P50/P95 matched onset error, false positives per clip minute. **Offline processing cannot produce reliable microphone-to-display live latency, which remains null.**

## Critical limits

- This is **one pilot clip**. The result is a preliminary check, not a model winner or a statistically robust comparison.
- The MAESTRO recording is professional piano audio. A later corpus must include user-device microphone recordings, low bass, clipped attacks, pedal, real octaves and silence/noise.
- The MIDI parser interprets MIDI Note On timestamps, not exact physical hammer strike or microphone sound propagation. The fixed 100 ms tolerance is a benchmark setting, not lesson-scoring policy.
- If the public mirror is inaccessible, source format differs, duration is outside limits, or model loading fails, the job **fails clearly**. No replacement synthetic audio or invented numbers are substituted.
- Upstream MAESTRO data is licensed **CC BY-NC-SA 4.0**. Preserve proper attribution, and do not redistribute audio in the commercial application.
- Test-split performance and final hyperparameters must be kept blind until a later separate, pre-registered, correctly held-out benchmark.
- Nothing here adds microphone permission prompts, modifies OSMD/MIDI/SoundFont, or grants course credit.
