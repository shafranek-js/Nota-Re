/**
 * Diagnostic-only performance baseline for Nota-Re's actual production build.
 *
 * No brittle pass/fail time budget: shared GitHub-hosted CPU and browser cache
 * can vary widely. Save inspectable results so bundle/OSMD optimizations can
 * be evaluated BEFORE changing Rollup manualChunks or React architecture.
 *
 * Requires an already running production preview and CHROME_PATH, exactly
 * like tests/osmd.smoke.mjs in .github/workflows/osmd-smoke.yml.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const PREVIEW_URL = 'http://127.0.0.1:4173/';
const RUNS_PER_VIEWPORT = 2;
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 }
];

const round = (value) => Math.round(value * 10) / 10;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2
    ? sorted[Math.floor(sorted.length / 2)]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};

async function bundleSizes() {
  const dir = 'dist/assets';
  const names = (await readdir(dir)).filter(name => name.endsWith('.js'));
  const files = await Promise.all(names.map(async name => {
    const bytes = await readFile(dir + '/' + name);
    return {
      name,
      bytes: bytes.byteLength,
      gzipBytes: gzipSync(bytes).byteLength
    };
  }));
  files.sort((a, b) => b.bytes - a.bytes);
  const total = files.reduce((acc, file) => ({
    bytes: acc.bytes + file.bytes,
    gzipBytes: acc.gzipBytes + file.gzipBytes
  }), { bytes: 0, gzipBytes: 0 });
  return {
    total,
    files: files.slice(0, 12),
    osmd: files.filter(file => /opensheetmusicdisplay/i.test(file.name)),
    spessasynth: files.filter(file => /spessasynth/i.test(file.name))
  };
}

async function measureOne(browser, viewport) {
  // browser.newPage() gets an isolated browser context. The measurements
  // are cold-navigation samples, not an unreliable mixture of cache states.
  const page = await browser.newPage({ viewport: {
    width: viewport.width, height: viewport.height
  } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const before = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: /Тренажёр-Студия/ }).click();
    const score = page.getByTestId('osmd-score');
    await score.waitFor({ state: 'visible', timeout: 45000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="osmd-score"]');
      return !!el && Number(el.getAttribute('data-osmd-render-epoch')) >= 1 &&
        !!el.querySelector('svg path, svg line, svg text');
    }, undefined, { timeout: 45000 });
    const after = await page.evaluate(() => performance.now());
    assert.equal(await page.getByText('Ошибка нотного движка:', { exact: false }).count(), 0,
      'performance must measure real OSMD, not the Classic fallback');
    assert.deepEqual(errors, [], 'unexpected browser error invalidates benchmark');

    const resources = await page.evaluate(() => performance.getEntriesByType('resource')
      .filter(item => item.name.includes('/assets/') && /\.js(?:$|\?)/.test(item.name))
      .map(item => ({
        name: item.name.split('/').pop()?.split('?')[0],
        durationMs: Math.round(item.duration * 10) / 10,
        transferBytes: item.transferSize,
        decodedBytes: item.decodedBodySize
      }))
    );
    const osmdResources = resources.filter(resource =>
      /opensheetmusicdisplay/i.test(resource.name ?? ''));

    // A missing OSMD chunk means the resource-level attribution cannot be
    // trusted; unlike timing, this is a correctness property of this probe.
    assert.ok(osmdResources.length > 0, 'no separate OSMD resource detected');

    return {
      viewport: viewport.name,
      width: viewport.width,
      height: viewport.height,
      openTrainerToEngravedMs: round(after - before),
      osmdResources,
      resourceCount: resources.length
    };
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox']
});
try {
  const samples = [];
  for (const viewport of VIEWPORTS) {
    for (let run = 0; run < RUNS_PER_VIEWPORT; run++) {
      samples.push(await measureOne(browser, viewport));
    }
  }
  const bundle = await bundleSizes();
  const summary = Object.fromEntries(VIEWPORTS.map(viewport => [
    viewport.name, {
      medianTrainerToEngravedMs: round(median(samples
        .filter(sample => sample.viewport === viewport.name)
        .map(sample => sample.openTrainerToEngravedMs))),
      samples: RUNS_PER_VIEWPORT
    }
  ]));
  const report = {
    schemaVersion: 1,
    timestampUtc: new Date().toISOString(),
    sourceCommit: process.env.GITHUB_SHA ?? 'local',
    methodology: 'Fresh isolated headless Chromium context for each sample; domcontentloaded, then click Trainer and wait for first real OSMD SVG engraving epoch.',
    limitations: 'Shared CI host; not real user Web MIDI latency, SoundFont first note, production network RTT, or real-device Web Vitals. Compare repeat medians on the same runner; no SLA inferred.',
    summary,
    bundle,
    samples
  };

  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/performance-baseline.json',
    JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log('Nota-Re production performance baseline:');
  console.log(JSON.stringify({ summary, osmdBundle: bundle.osmd,
    totalBundle: bundle.total, samples }, null, 2));
  console.log('Full report: artifacts/performance-baseline.json');
} finally {
  await browser.close();
}
