# Two-hand lessons 11–12: provisional repetition rubric

Status: **training-only**, NEVER official course certification.
Tracking: https://github.com/shafranek-js/Nota-Re/issues/3

## Published lesson requirements versus this mini-study

| Lesson | Published requirement | Published repetitions | Accuracy | Reaction criterion |
|---|---|---:|---:|---:|
| 11 | Both-hand reading, G-shaped gaze, bass beat 1 and RH melody beats 2–4 | 15 consecutive pieces | 92% | 580 ms |
| 12 | Hanon fingering, four-note blocks, RH legato eighths and LH staccato quarters | 20 pieces | 94% | 500 ms |

The current MIDI trial has one deterministic two-bar preparatory score per
lesson. Repeating the same score 15 or 20 times is NOT equivalent to 15/20
different lesson pieces, nor proof of fingering, gaze or expressive legato.

The published lesson reaction-time requirement is NOT equivalent to metronome
onset deviation. Those old norms must not be repurposed as new tolerances.

## Working (not approved) practice criteria

A timed two-bar study is accepted ONLY when it:
- Plays the exact canonical lesson pitch/timing content and lesson BPM.
- Ends the complete musical grid, hitting every expected note and chord of
  both hands with no wrong, missed, offbeat or extra attacks.
- Has a maximum average absolute onset deviation of 110ms and individual
  attacks within the current 160ms window. These are PRACTICE limits only.
- Has verified physical NoteOff for every accepted note, with no early/late
  release: legato full written duration, staccato between 20% and 65% of
  written duration, allowing the existing 120ms MIDI timing grace.
- Has no MIDI disconnect, panic or hidden-tab interruption.

Accepted practice performances increase only an ephemeral shadow counter.
Lesson 11 requires 15 consecutive clean repeats: a failed or aborted study
resets the shadow streak. Lesson 12 requires 20 clean repeats cumulatively.
Each trial has a session-only monotonic ID, so duplicate timer callbacks,
wrong-lesson results and stale events cannot increase counts.

The shadow counter is reset on navigating away or explicitly using
"Сбросить тренировочную серию". No data is saved. The score, official
completedLessons, lesson certification and saved progress remain untouched.

## Before formal certification may be implemented

- Approve actual varied material for lessons 11/12 (not one short study).
- Define and approve pass/retry rules for 15/20 distinct pieces, 92%/94%
  accuracy, and original 580/500ms reaction metrics.
- Resolve fingering and G-gaze observability: generic MIDI note events
  contain neither finger identity nor eye tracking.
- Approve how musical legato is evaluated beyond basic key-hold durations.
- Test real hardware: repeated notes, mixed channels, pedal, unplugging,
  hidden tabs and timer drift, plus manual sound and visual assessment.
- Exclude any possibility of silently awarding a course lesson via a trial,
  a missed event, assisted playback or synthetic input.

Official course-credit writes require a separate reviewed change after
these acceptance conditions have been satisfied.
