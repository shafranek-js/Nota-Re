# Nota-Re — release verification checklist

This document distinguishes automated regression evidence from tests that
must be performed on an actual keyboard, speaker and mobile browser.

## Release identity

The header shows `v<package version> · <short Git commit> · dev/production`.
The same identity is available at the bottom of **Settings** even on a
320-pixel screen. The application version comes from `package.json` and
the short revision from the commit used during Vite compilation.

- Locally, confirm `git rev-parse --short=7 HEAD` matches the header;
  restart `npm run dev` after pulling changes to refresh build metadata.
- In CI, `GITHUB_SHA` identifies the exact compiled checkout. On Cloudflare
  Pages, `CF_PAGES_COMMIT_SHA` identifies the deployed source.
- For uncommitted edits, the revision is the last committed source, **not**
  a checksum of unsaved working-tree changes; the `dev` indicator makes
  this distinction clear. Source archives without Git may show `unknown`.
- The package version may remain unchanged across maintenance commits.
  Use **both** the version and short SHA to determine whether a fix is loaded.

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
- Exact build SHA visible in the header and Settings, including after reload.

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
