# OSMD performance baseline

Issue: https://github.com/shafranek-js/Nota-Re/issues/39

This is a **measurement**, not an optimization or performance guarantee.
Do not introduce Rollup manualChunks solely to suppress a 500 kB warning.

## Reproduce

1. Build a clean checkout with npm ci and npm run build.
2. Start the Vite production preview on http://127.0.0.1:4173/.
3. Install a test-only Playwright client and provide a Chrome executable,
   exactly as defined in .github/workflows/osmd-smoke.yml.
4. Run tests/performance-baseline.smoke.mjs with CHROME_PATH configured.
5. Read artifacts/performance-baseline.json, which CI also uploads.

The benchmark records four cold-browser-context trials: two at 1440px and
two at 375px. Each enters Trainer and waits for a REAL engraved OSMD SVG.
It records click-to-render elapsed time, OSMD resource timing, and raw/gzip
sizes of production JavaScript assets. It reports a descriptive median,
not a pass threshold.

## Interpretation and limitations

- Shared GitHub-hosted headless Chromium is not production network RTT,
  an actual user's device, Web MIDI input latency, or Core Web Vitals.
- Compare medians across multiple workflow runs on comparable runners.
  A single slow CI run is not proof that the application is slow.
- Resource transferSize can be zero due to browser instrumentation or cache;
  artifact raw and gzip sizes are separately computed from built JS files.
- openTrainerToEngravedMs includes React navigation, dynamic import, score
  creation and engraving. It is NOT OSMD's internal render duration.
- Only change bundle splitting after measured improvements, maintaining
  full Chrome tests, physical MIDI and sound, and stable score rendering.

## Next potential checks

Use User Timing marks to split dynamic import, JS evaluation and engraving,
if this broad baseline indicates an actual problem. Physical MIDI latency
requires a user-device test; Chrome emulation cannot prove it.
