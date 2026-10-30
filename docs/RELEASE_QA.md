# Nota-Re — release verification checklist

This document distinguishes automated regression evidence from tests that
must be performed on an actual keyboard, speaker and mobile browser.

## Release identity

The bottom technical status bar and Settings expose a **monotonically
advancing release version** and a 7-character Git revision:
`v3.0.<patch> · сборка <commit>` (plus `dev`/`production` in Settings).
Both fields are injected at Vite startup/build, never from localStorage.

- `package.json` `3.0.0` is a **base version**, not a manually updated
  artifact number. The patch is the number of first-parent commits after
  the version epoch `f773eb938b36456859c092e1adada53c3e729e1e`
  (the last main version that displayed v3.0.0). Every merged main commit
  advances the displayed patch by one; the SHA identifies the exact files.
- Identical Git commits produce identical displayed versions in dev, CI and
  GitHub Pages. No clocks, CI run-number counters, dirty-worktree state,
  or manually maintained per-commit version edits are involved.
- Actions checkout uses `fetch-depth: 0` for complete version history.
  Cloudflare Workers Builds (`WORKERS_CI=1` / `WORKERS_CI_COMMIT_SHA`) and
  Cloudflare Pages (`CF_PAGES=1`) may provide only a shallow checkout.
  The standard `npm run build` first runs `scripts/prepare-release-history.mjs`,
  which fetches the missing commit ancestry from GitHub and verifies the
  build SHA and base release epoch before Vite injects the version.
  If this cannot be verified, **Cloudflare build fails** instead of serving
  `v3.0.0+g<sha>` while local and GitHub Pages show `v3.0.N`.
- Local source archives without Git history still support the explicit
  `v3.0.0+g<sha>` fallback. The numeric patch requires complete ancestry.
  A Cloudflare Worker must use the repository build command `npm run build`
  (not direct `vite build`), and then deploy the generated `dist`.
- To start a new minor or major series, update the base package version
  **and epoch** together in a reviewed release PR, with a matching npm
  lockfile update. The epoch must correspond to that new base release.
- Local dev reports the actual checked-out source commit. After
  `git pull --ff-only origin main`, **restart `npm run dev`** to refresh
  Vite's compile-time metadata. Updating the hosted site does not update
  an already-running local dev server. The `dev` label remains visible
  in Settings; an uncommitted edit is not represented by the SHA.
- Chrome checks 320 and 1440 px and verifies both exact current Git SHA
  and computed version in the status bar and Settings, including reload.
  Node unit tests cover baseline patch 0, successive commits, missing
  history, invalid package versions and independent source builds.

## Automated acceptance gates

Run from the repository root with Node.js 22:

```bash
npm ci
npm test
npm run build
```

GitHub Actions must pass both **CI** and **OSMD browser smoke** on the PR,
then again on the merged `main` commit. Chrome tests cover:

- Real SoundFont worklet PCM output (not just a successful bank load),
  switching banks, oscillator fallback, MIDI note-off/sustain/panic.
- Course grading, assisted-vs-scored steps, uninterrupted flow timing,
  pause/navigation behavior and saved preferences.
- OSMD engraving, note cursor, lookahead/photo masks and legacy fallback.
- 320, 375, 768, 1280 and 1920-pixel responsive behavior, modal focus,
  Escape, keyboard labels and vertical/horizontal scrolling.
- Exact build SHA visible in the bottom technical status bar, including after reload and in Zen Mode.

## Three destinations and Studio learning tools (Stage E)

- The global header exposes exactly **Курс**, **Студия**, **База знаний**.
  The former top-level Precheck and Lab screens are found under
  **Студия → Подготовка** and **Студия → Лаборатория**, reusing their
  original tonality cards, four Hanon/Czerny presets, rhythm demos and
  articulation preview.
- The Course **Продолжить** button is based on the first not-yet-certified
  lesson, not on whichever card was last viewed. Selecting a historical
  lesson does not silently increase course completion.
- Switching from a timed Course attempt into the embedded Lab or Precheck
  cancels rhythm deadlines and removes certification eligibility. Returning
  to **Практика** requires a new explicit start. Previewing a rhythm sample
  never increments graded attempts.
- Confirm navigation with Enter and Space on 320, 375, 768, 1024, 1440px.
  Verify the technical footer/build revision and Settings remain available
  in every destination. With Zen enabled, embedded reference sections must
  still show ordinary global navigation.
- The separate in-exercise **Анализ перед игрой** checklist and optional
  four-beat count-in remain intact; the Studio theory reference is not a
  second scoring implementation.

## Zen / Focus mode (Stage D)

- In Studio, **Start exercise** (or launch a Course lesson) automatically
  enters Zen. The saved checkbox **Вид → Автоматически включать Zen при
  начале упражнения** is enabled by default; users may opt out.
  The normal header, lesson banner and setup toolbar become a compact
  **Back / progress / tempo / audio / Settings / Stop / Exit** strip.
  The preference is migrated from the old v1 manual Zen toggle without
  losing key, tempo or MIDI settings. No audio/MIDI/grading clock changes.
- Esc dismisses Zen for only the current attempt without disabling the
  saved preference; a subsequent Start automatically re-enters focus.
  Choosing the checkbox during a running attempt never abruptly hides the
  interface. Count-in retains its four-beat preparation view with focused
  shell before the first actual notation appears; Precheck and Results
  never enter Zen, and visiting Studio alone never starts Zen.
- Check both OSMD and Classic on 320, 375, 768, 1024, 1440 and 1920px.
  In OSMD Zen, the notation renderer uses a responsive engraving zoom rather
  than the fixed effective 1.0 scale in a large blank white canvas. The screenshot matrix
  records physical notehead widths **before / during / after Zen** and fails
  if real glyphs do not grow at 768px+ or do not return to their standard
  size on exit. The zoom is unchanged at phone widths (baseline 12px
  noteheads), avoiding a readability regression from reapplying 0.8.
- Verify the *actual staves, clefs, accidentals, noteheads, pedagogical guides
  and keyboard* remain readable and scrollable after the change. Automated
  dimensions cannot replace the real display legibility inspection.
- In Photo Mode, the mask must still hide target pitches from all captions,
  with the **Вспышка такта** action available while in Zen.
  In Rhythm mode, the relevant sample and speech options remain reachable.
- **Esc** in Zen exits to the normal toolbar; when Settings is open, the
  first Esc dismisses Settings without leaving Zen. Click **Стоп** to
  leave playing and reach setup without crediting a partial lesson.
- Results, count-in, precheck and independent two-hand practice do not
  show Zen, even when its preference is enabled. The technical footer
  remains present and the build ID is never clipped.

## Compact Studio setup (Stage F follow-up)

- In **Студия → Практика**, the optional **Анализ** action sits beside
  **Начать упражнение**, not alone on a full-width row. The prior static
  setup message is conveyed by the toolbar action group’s accessible
  label instead of a permanent information band.
- The OSMD / Classic notation-engine picker is available under **Вид**,
  and the automatic Zen-at-start option is there as well. Normal playing
  remains graded by the same note/timer engine and the standalone
  preplay checklist still has five steps.
- Verify 320/375/1024/1440px Chrome layout, the absence of an extra
  toolbar row, Precheck → Setup → Start → Zen → Escape and notes/staff
  switching without a full-page horizontal overflow.

## Stage F — inspectable notation and error-feedback evidence

- `tests/stage-f-feedback.smoke.mjs` plays a wrong pitch in an actual
  rhythmic exercise, lets later slots expire, and checks distinctly
  labelled **Неверная нота / Пропуск** result rows. Pure `late` events
  are covered separately by deterministic outcome/description unit tests:
  browser scheduler jitter must not fabricate an intentional "late" strike.
- `tests/stage-f-visual.smoke.mjs` saves screenshots of the actual UI at
  320/375/768/1024/1440/1920px for OSMD, Classic and Zen, plus all eight
  OSMD methodologies at 1440px. `artifacts/stage-f-stave-metrics.json`
  reports measured SVG noteheads, their median physical width, and notation
  area dimensions. These are **measurements**, not proof that stave spacing,
  clefs, fingering, annotations or scrolling are pleasant/readable.
- In the GitHub Actions **OSMD browser smoke** run, download the
  `osmd-browser-diagnostics` artifact and inspect each screenshot for clipped
  ledger lines, accidental placement, obscured notes, tiny clefs, overly
  compressed keyboard and narrow-screen overflow. Keep real phone and
  desktop visual acceptance open until inspected.
- On the physical MIDI instrument, perform two-octave scales with overlapping
  key releases, repeat a note rapidly, reconnect USB, test sustained
  notes/pedal if supported, and compare the latency and piano timbre over
  headphones. Browser event mocks do not validate electrical/hardware latency.
- For incorrect input, inspect one actual wrong note, one late correct-pitch
  answer and one silent missed beat. A late pitch must not be explained as
  wrong pitch, and the UI must not guess the reason for a user's mistake.
  Verify both Chrome and the physical instrument before signing off.

## Manual acceptance still required

- **Sound on real speakers/headphones:** check SoundFont piano and
  oscillator volume, first-note audio unlock, no silences after reload,
  input device/USB reconnection and continuous playing.
- **Real MIDI hardware:** sustain pedal (if available), simultaneous notes,
  all channels used by the device, disconnect panic and subjective latency;
  save the optional local hardware self-check report. Headless Chrome does
  not validate physical keyboard or acoustic delay.
- **Course and grading:** run at least one full manual/graded lesson,
  intentionally play incorrect notes and verify certification cannot be
  earned via silence, assisted steps or closing Settings.
- **Mobile and assistive technology:** test touch and landscape/portrait
  scrolling on a physical phone; navigate every workspace, and use a
  screen reader to verify modal announcements and note-button labels.
- **Browser updates/offline:** confirm the new SHA is visible after
  refresh and compare built-in SoundFont loading online and offline
  after caching, noting browser-specific limitations.
- **Notation parity:** compare all eight teaching modes and both clefs
  visually to the old renderer; retain the fallback until equivalent.

Do not mark issues #3, #4, #5 or #6 fully accepted based solely on CI.
Track remaining physical-device and visual UAT evidence in the issues.

## Lesson 1: note recognition versus speed (2026-10-30)

- Lesson 1 automatically certifies on **10 complete unassisted graded exercises**
  with **at least 90% series pitch accuracy**. Reaction speed is measured but
  is **not** a certification gate for this introductory lesson; the numerical
  800ms goal is an optional training benchmark, not a validated diagnostic.
- Lessons 2–10 retain their existing speed + accuracy + complete timing
  evidence gates, pending a separate pedagogical review.
- The Results screen explains each criterion and its measured status. An
  optional **Отдельная проверка скорости (без зачёта)** replays the same notes,
  requires all correct notes and finite input timestamps, and never changes
  persisted course evidence or marks the lesson complete.
- An older completed series that was blocked by speed is not silently
  retro-certified on page reload. Another *fully graded* lesson-1 exercise
  evaluates the already-saved evidence under the new criterion.
- Browser regression `tests/lesson-one-credit.smoke.mjs` uses pre-existing
  slow-but-accurate evidence, completes genuine on-screen notes, verifies
  certification and a separate no-credit speed attempt. Unit regressions
  cover missing/assisted/wrong inputs, speed evidence and policy boundaries.
