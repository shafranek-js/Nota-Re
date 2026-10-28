# Nota-Re modernization plan

Tracking issue: https://github.com/shafranek-js/Nota-Re/issues/1

## Principles

1. Keep React 19, TypeScript, Vite, Tailwind and Zustand: replace only parts that do not scale.
2. Separate **musical time** (ticks/beats) from view coordinates, event input and audio scheduling.
3. Reuse mature notation/audio engines. OSMD handles MusicXML engraving; a SoundFont sampler handles instrument sound. Nota-Re owns exercise generation, training modes and grading.
4. Use feature flags and compare with the original standalone HTML before deleting its implementation.
5. Keep grading data honest: previews, step buttons, assisted modes and missed notes cannot count as verified performance.

## Milestones and acceptance

| Order | Deliverable | Acceptance |
|---|---|---|
| 1 | Canonical score model and MusicXML export | Export well-formed score including 4/4 measures, bass/treble staff, keys, rests, note durations and ties; tests run in CI |
| 2 | OSMD score viewer | SVG fallback remains until 8 modes, cursor, key signatures, multi-staff, resize, photo/lookahead mask pass UAT |
| 3 | SoundFont piano | SF2/SF3 sampler, legal piano bank, velocity, note-off, sustain, polyphony, lazy loading and latency checked |
| 4 | MIDI and grading | Input normalized, flow repaired, musical timing graded independently, no false lesson completion |
| 5 | Persistence and UX | User settings survive refresh; accessible and responsive layout; README and release gate updated |

## First incremental slice: MusicXML

- Source: `src/core/notation/musicXml.ts` has no React, Web Audio or SVG dependencies.
- `createScoreFromExercise()` converts a flat sequence to notes with 16th-note tick offsets.
- `toMusicXml()` writes a Piano part with two staves, rests in idle staff, key/time signature, note values and ties across measures.
- Trainer's **MusicXML** button saves an .musicxml file for testing in notation software.
- `npm test` runs Node's built-in test runner (Node 22+); PR CI additionally runs `npm run build`.

### Important current limitations

The original exercise generator is a **flat sequence**, not a complete polyphonic score. The XML adapter preserves the sequence order and assigns the existing quarter-note-based durations. It can display successive notes on treble/bass staves, but does **not invent simultaneous notes or an independent left-hand part**. Simultaneous hands, dynamic measures, rests, note-off and precise grading will be introduced in the canonical score model before removing the legacy renderer.

The existing SVG notation and oscillator audio remain active in milestone 1. OSMD and SoundFont are deliberately **not yet installed** in this PR. Pin package versions and regenerate the NPM lockfile in their dedicated PRs.

## Engineering requirements

- Favor `midi` numbers and musical events over `noteName` strings or fixed pixel coordinates.
- Avoid putting timer handles, AudioContext instances or MIDI I/O into serializable Zustand state.
- Provide one lifecycle-controlled input subscription per source.
- A passing test means it has actually run, not merely that a test was committed.

## Second incremental slice: OSMD score viewer (PR #8)

- `opensheetmusicdisplay@2.2.1` is an **exact** production dependency; the generated `package-lock.json` is committed.
- OSMD is dynamically imported only when the trainer uses it. The preferred renderer (OSMD or Classic) is saved in `localStorage`.
- The OSMD viewer consumes `src/core/notation/musicXml.ts` output, uses a compact SVG score, and positions the cursor using musical timestamps.
- SVG fallback is automatic for `lookahead`, `photo`, `intervals`, `gpattern`, `hanon` and when bass landmarks are enabled, because those modes require custom overlays.
- The classic renderer is **not removed**. In particular, this PR does **not** assert feature parity for all eight modes.
- New browser smoke verification: `tests/osmd.smoke.mjs`, running through `.github/workflows/osmd-smoke.yml` in headless Chrome. Screenshots are attached to each workflow run.

### Known gaps before retiring the old SVG

- Reimplement photo masks and lookahead curtains against real OSMD measure/staff geometry.
- Reimplement intervals and G-pattern guidance without drawing noteheads or staffs by hand.
- Support genuinely polyphonic exercises in the canonical model (currently serialized sequentially).
- Test visual layout on narrow screens and verify cursor and notehead alignment across multiple systems.
- Keep teaching affordances such as optional bass landmarks and photo mode access without losing them in OSMD.
