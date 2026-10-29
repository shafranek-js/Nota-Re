# Two-hand lessons 11–12: provisional repetition rubric

Status: **training-only**, NEVER official course certification.
Tracking: https://github.com/shafranek-js/Nota-Re/issues/3

## Published lesson requirements versus this mini-study

| Lesson | Published requirement | Published repetitions | Accuracy | Reaction criterion |
|---|---|---:|---:|---:|
| 11 | Both-hand reading, G-shaped gaze, bass beat 1 and RH melody beats 2–4 | 15 consecutive pieces | 92% | 580 ms |
| 12 | Hanon fingering, four-note blocks, RH legato eighths and LH staccato quarters | 20 pieces | 94% | 500 ms |

The training catalog now provides **15 original two-bar mini-studies for
lesson 11 and 20 for lesson 12**, each with a distinct MIDI/MusicXML score.
Lesson 11 varies RH rhythms, melodic contour and LH bass; lesson 12 varies
the independently phrased RH eighth-note blocks and LH staccato pitches.

**These are still short preparatory mini-studies**, not the specified published
lesson repertoire or proof of fingering, gaze or expressive legato. Completing
all 15/20 training variants must never be mistaken for official graduation.

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
Each timed run has a session-only monotonic attempt ID **and a canonical
study index** (0–14 or 0–19). The score and onset map must match that exact
index; a performance of score 1 cannot be credited as score 2. Repeating a
previously accepted study **does not increase the distinct-study counter**.
For the consecutive lesson-11 series, such a duplicate resets the training
streak just like a wrong attempt. A stopped or incorrect attempt cannot
advance to the next uncompleted study automatically.

The UI displays the current score number and supports explicit selection
of another study for practice. The "Следующий этюд" action selects the first
study not already accepted in the current series. An interrupted run stays
uncredited; the user can retry the same written score. This progression
exists only in React memory and resets when leaving the trainer.

The shadow counter is reset on navigating away or explicitly using
"Сбросить тренировочную серию". No data is saved. The score, official
completedLessons, lesson certification and saved progress remain untouched.

## Before formal certification may be implemented

- Review these original varied preparatory mini-studies, then approve actual
  source repertoire and evidence for lessons 11/12; variation alone is
  insufficient for formal certification.
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
