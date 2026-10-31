/**
 * R0D experimental browser test. Plays pinned MAESTRO WAV through an injected
 * MediaStream into actual PitchPlease 3.1.0 AudioWorklet.
 * It never invokes getUserMedia(), never changes Nota-Re's app bundle, never
 * saves WAV/MIDI to CI artifacts and never grants grade/course credit.
 */
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluatePianoBenchmarkCase } from '../src/core/audio/microphoneBenchmark.ts';
import { describeOfflineRunner } from './offline-model-timing.mjs';

const MIME = { '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
  '.wav': 'audio/wav', '.html': 'text/html; charset=utf-8' };
const expectedModelVersion = '3.1.0';

async function main(manifestPath) {
  const file = resolve(manifestPath);
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases) ||
      manifest.cases.length !== 3 || !Number.isFinite(manifest.onsetToleranceMs) ||
      manifest.onsetToleranceMs !== 100) throw new Error('Unexpected MAESTRO reference manifest');
  const packageDir = resolve('node_modules/@markusstrasser/pitchplease');
  const meta = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
  if (meta.version !== expectedModelVersion) throw new Error('PitchPlease 3.1.0 is required');
  const expected = [];
  for (const item of manifest.cases) {
    if (!/^maestro-validation-\d{2}$/.test(item.id) ||
        !/^[a-f0-9]{64}$/i.test(item.audioSha256) || !Array.isArray(item.expected) ||
        !Number.isFinite(item.durationMs) || item.durationMs < 1000) {
      throw new Error('Invalid independent MAESTRO case');
    }
    const path = await realpath(resolve(dirname(file), item.wav));
    const bytes = await readFile(path);
    if (createHash('sha256').update(bytes).digest('hex') !== item.audioSha256) {
      throw new Error('Independent source WAV SHA-256 mismatch: ' + item.id);
    }
    expected.push({ ...item, bytes });
  }
  const handler = async (req, res) => {
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      let bytes, ext;
      if (path === '/') { bytes = Buffer.from('<!doctype html><title>R0D streaming research</title>'); ext = '.html'; }
      else if (path === '/tracker.mjs') {
        bytes = await readFile(resolve('scripts/streaming-attack-tracker.mjs'));
        ext = '.mjs';
      } else if (/^\/audio\/[0-2]$/.test(path)) {
        bytes = expected[Number(path.slice(-1))].bytes;
        ext = '.wav';
      } else if (path === '/pitchplease.js' ||
          /^\/(?:engine|models)\/[A-Za-z0-9_.-]+$/.test(path)) {
        bytes = await readFile(join(packageDir, path.slice(1)));
        ext = extname(path);
      } else {
        res.writeHead(404); res.end('Not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin' });
      res.end(bytes);
    } catch (error) {
      res.writeHead(500); res.end('Fixture serving failed');
      console.error('Research asset error: ', error.message);
    }
  };
  const server = createServer((req, res) => { void handler(req, res); });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const results = [];
    for (let index = 0; index < expected.length; index++) {
      const observed = await page.evaluate(async ({ index }) => {
        const { create, models, version } = await import('/pitchplease.js');
        const { createStreamingAttackTracker } = await import('/tracker.mjs');
        if (version !== '3.1.0') throw new Error('Browser loaded wrong model version');
        const revision = models.find(m => m.id === 'piano')?.revision;
        if (!revision) throw new Error('Missing pinned model revision');
        const response = await fetch('/audio/' + index, { cache: 'no-store' });
        if (!response.ok) throw new Error('Missing verified WAV source');
        const wav = await response.arrayBuffer();
        const context = new AudioContext({ sampleRate: 48000 });
        const errors = [];
        const tracker = createStreamingAttackTracker();
        const raw = [];
        const anchorCandidates = [];
        let playing = false;
        let countFrames = 0;
        const detector = create({
          model: 'piano',
          onNotes(notes, frame) {
            countFrames++;
            const wallMs = performance.now();
            if (!playing && anchorCandidates.length < 64 && Number.isFinite(frame.emitTime)) {
              anchorCandidates.push(wallMs - frame.emitTime * 1000);
            }
            for (const onset of tracker.push({ time: frame.time, notes })) {
              raw.push({ ...onset, deliveredWallMs: wallMs });
            }
          },
          onError(error) { errors.push(error?.message ?? String(error)); }
        });
        const destination = context.createMediaStreamDestination();
        const source = context.createBufferSource();
        try {
          const buffer = await context.decodeAudioData(wav);
          source.buffer = buffer;
          source.connect(destination);
          await context.resume();
          if (!await detector.start(destination.stream)) throw new Error('AudioWorklet detector failed to start');
          // Establish cross-context clock alignment while the injected stream
          // carries silence, before replaying any copyrighted recording.
          await new Promise(r => setTimeout(r, 450));
          if (anchorCandidates.length < 3) {
            throw new Error('AudioWorklet produced no frames before source playback');
          }
          anchorCandidates.sort((a, b) => a - b);
          const sessionOriginWallMs = anchorCandidates[Math.floor(anchorCandidates.length / 2)];
          const futureContextTime = context.currentTime + 0.30;
          const stamp = context.getOutputTimestamp();
          const audioStartWallMs = Number.isFinite(stamp.performanceTime) && stamp.contextTime > 0
            ? stamp.performanceTime + (futureContextTime - stamp.contextTime) * 1000
            : performance.now() + (futureContextTime - context.currentTime) * 1000;
          const end = new Promise(resolve => { source.onended = resolve; });
          playing = true;
          source.start(futureContextTime);
          await end;
          await new Promise(r => setTimeout(r, 250));
          const runtime = { ...detector.stats };
          const output = raw.map(x => ({
            midi: x.midi,
            onsetMs: sessionOriginWallMs + x.onsetMs - audioStartWallMs,
            confirmedAtMs: sessionOriginWallMs + x.confirmedAtMs - audioStartWallMs,
            deliveredAtMs: x.deliveredWallMs - audioStartWallMs,
            confidence: x.confidence
          })).filter(x => x.onsetMs >= 0 && x.onsetMs < buffer.duration * 1000 &&
            x.deliveredAtMs >= 0);
          return { revision, modelVersion: version,
            decodedDurationMs: buffer.duration * 1000,
            audioContextSampleRate: context.sampleRate, frameCount: countFrames,
            modelStats: runtime, anchorSamples: anchorCandidates.length,
            detected: output, errors };
        } finally {
          detector.stop();
          try { source.disconnect(); } catch {}
          destination.stream.getTracks().forEach(track => track.stop());
          await context.close();
        }
      }, { index });
      if (observed.errors.length || pageErrors.length || observed.frameCount < 100 ||
          observed.anchorSamples < 3 ||
          Math.abs(observed.decodedDurationMs - expected[index].durationMs) > 50 ||
          !observed.modelStats || observed.modelStats.model !== 'piano') {
        throw new Error('Browser streaming experiment failed for ' + expected[index].id +
          ': ' + JSON.stringify({ errors: observed.errors, pageErrors, frameCount: observed.frameCount,
            modelStats: observed.modelStats }));
      }
      const detected = observed.detected.filter(item => item.onsetMs <= expected[index].durationMs);
      const score = evaluatePianoBenchmarkCase({
        id: expected[index].id, category: expected[index].category,
        expected: expected[index].expected,
        detected: detected.map(x => ({
          midi: x.midi, onsetMs: x.onsetMs, confidence: x.confidence
        }))
      }, manifest.onsetToleranceMs);
      const latency = score.matches.map(m =>
        detected[m.detectedIndex].deliveredAtMs - expected[index].expected[m.expectedIndex].onsetMs
      ).sort((a,b)=>a-b);
      const quantile = (q) => latency.length ? latency[Math.ceil(latency.length*q)-1] : null;
      results.push({
        id: expected[index].id, audioSha256: expected[index].audioSha256,
        referenceAttacks: expected[index].expected.length,
        frameCount: observed.frameCount, anchorSamples: observed.anchorSamples,
        cpuLoad: observed.modelStats.cpuLoad, kernel: observed.modelStats.kernel,
        framesPerSecond: observed.modelStats.framesPerSecond,
        decodedDurationMs: observed.decodedDurationMs,
        truePositives: score.truePositives, falsePositives: score.falsePositives,
        falseNegatives: score.falseNegatives, f1: score.f1,
        p50BrowserLoopbackDeliveryAfterReferenceMs: quantile(.5),
        p95BrowserLoopbackDeliveryAfterReferenceMs: quantile(.95),
        rawActivationAttacks: detected.length
      });
      console.error('Streaming browser ' + expected[index].id + ': ' + score.truePositives +
        '/' + expected[index].expected.length + ' reference attacks, F1=' +
        score.f1?.toFixed(3) + ', frameCount=' + observed.frameCount);
    }
    console.log(JSON.stringify({
      experiment: 'R0D-real-worklet-loopback-v1', model: 'pitchplease@3.1.0:piano',
      modelRevision: (await page.evaluate(async()=> (await import('/pitchplease.js')).models
        .find(x=>x.id==='piano').revision)),
      runner: describeOfflineRunner(),
      caveat: 'Real AudioWorklet, injected WebAudio MediaStream, not a physical microphone. Browser clock alignment is estimated from silent pre-roll; delivery is to JavaScript callback, not UI. Same three selected validation recordings; no certified grading or device-wide latency claim.',
      results
    }, null, 2));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
if (process.argv.length !== 3 || process.argv[2] === '--help') {
  console.error('Usage: node --experimental-strip-types scripts/streaming-pitchplease-browser.mjs <maestro-manifest.json>');
  process.exitCode = 2;
} else {
  try { await main(process.argv[2]); }
  catch (error) {
    console.error('R0D browser streaming research failed: ' +
      (error instanceof Error ? error.stack : String(error)));
    process.exitCode = 1;
  }
}
