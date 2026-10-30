/**
 * Real-Chrome smoke for bundled bank and user-local SF3 preferences.
 * The bank fixture is the build-verified MuseScore General source.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// Headless Chrome has no speakers. Tap only the SoundFont AudioWorklet's
// actual main output, then check samples for non-zero PCM. A "ready" bank
// without a connected worklet previously passed all existing UI tests.
await page.addInitScript(() => {
  const nativeConnect = AudioNode.prototype.connect;
  window.__soundFontProbe = { connections: 0, analyser: null, peakRms: 0, oscillatorCalls: 0 };
  const createOscillator = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function (...args) {
    window.__soundFontProbe.oscillatorCalls++;
    return createOscillator.apply(this, args);
  };
  AudioNode.prototype.connect = function (destination, ...args) {
    if (this instanceof AudioWorkletNode && destination === this.context.destination) {
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 2048;
      nativeConnect.call(this, analyser, ...args);
      nativeConnect.call(analyser, destination);
      window.__soundFontProbe.connections++;
      window.__soundFontProbe.analyser = analyser;
      return destination;
    }
    return nativeConnect.call(this, destination, ...args);
  };
});
// Hold the bank's first part to simulate a cold/slow startup. The initial
// key must NOT play through the wrong synth while the chosen SoundFont loads.
let releaseFirstPart = () => {};
const firstPartGate = new Promise(resolve => { releaseFirstPart = resolve; });
await page.route('**/soundfonts/musescore-general/part-00.bin', async route => {
  await firstPartGate;
  await route.continue();
});
try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('status-audio').getByText(/SoundFont: загрузка/)
    .waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /^Студия$/ }).click();
  await page.getByRole('button', { name: 'Клавиша C4', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__soundFontProbe.oscillatorCalls), 0,
    'a key before bank readiness must not play the wrong oscillator timbre');
  releaseFirstPart();
  await page.getByTestId('status-audio').getByText(/SoundFont: готов/)
    .waitFor({ timeout: 120000 });
  await page.unroute('**/soundfonts/musescore-general/part-00.bin');
  await page.getByTitle('Открыть настройки').click();
  const panel = page.getByTestId('piano-sound-settings');
  await panel.waitFor();
  assert.equal(await panel.getByRole('button', { name: 'SoundFont (по умолчанию)' }).getAttribute('aria-pressed'), 'true');
  await panel.getByText('Звуковой банк готов к воспроизведению.').waitFor({ timeout: 120000 });
  assert.match(await panel.innerText(), /MuseScore General v0.2/);

  // Real signal test: the first clicked key must produce non-silent PCM
  // from SpessaSynth, not an unrelated oscillator or metronome click.
  assert.equal(await page.evaluate(() => window.__soundFontProbe.connections), 1,
    'SpessaSynth worklet must connect its main stereo output to the browser');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: /^Студия$/ }).click();
  await page.evaluate(() => {
    const probe = window.__soundFontProbe;
    probe.peakRms = 0;
    const end = performance.now() + 1800;
    const sample = () => {
      if (probe.analyser) {
        const data = new Float32Array(probe.analyser.fftSize);
        probe.analyser.getFloatTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length);
        probe.peakRms = Math.max(probe.peakRms, rms);
      }
      if (performance.now() < end) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByRole('button', { name: 'Клавиша C4', exact: true }).click();
  await page.waitForFunction(() => window.__soundFontProbe.peakRms > 0.0003, null,
    { timeout: 2500 });
  const observedRms = await page.evaluate(() => window.__soundFontProbe.peakRms);
  assert.ok(observedRms > 0.0003, 'SoundFont sample must generate audible-range waveform');
  console.log('SoundFont PCM output verified (worklet signal RMS peak):', observedRms);

  await page.getByTitle('Открыть настройки').click();
  await panel.getByRole('button', { name: 'Синтезатор' }).click();
  assert.equal(await panel.getByRole('button', { name: 'Синтезатор' }).getAttribute('aria-pressed'), 'true');
  await panel.getByRole('button', { name: 'SoundFont (по умолчанию)' }).click();

  // An already validated built-in SF3 can also be a user-provided bank.
  await panel.locator('input[type="file"]').setInputFiles('assets/soundfonts/MuseScore_General.sf3');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="piano-sound-settings"]');
    return el?.textContent?.includes('MuseScore_General.sf3') &&
      el.textContent.includes('Звуковой банк готов к воспроизведению.');
  }, null, { timeout: 120000 });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTitle('Открыть настройки').click();
  const restored = page.getByTestId('piano-sound-settings');
  assert.equal(await restored.getByRole('button', { name: 'SoundFont (по умолчанию)' }).getAttribute('aria-pressed'), 'true');
  await restored.getByRole('button', { name: 'SoundFont (по умолчанию)' }).click();
  await restored.getByText('Звуковой банк готов к воспроизведению.').waitFor({ timeout: 120000 });
  assert.match(await restored.innerText(), /MuseScore_General.sf3/);

  await restored.getByRole('button', { name: 'Встроенный банк' }).click();
  await restored.getByText('Звуковой банк готов к воспроизведению.').waitFor({ timeout: 120000 });
  assert.match(await restored.innerText(), /MuseScore General v0.2/);

  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/soundfont-settings.png', fullPage: true });
  assert.deepEqual(errors, [], 'No uncaught JS errors');
  console.log('SoundFont browser smoke passed: real PCM output, default, oscillator switch, custom SF3, reload and default reset.');
} finally {
  releaseFirstPart();
  await browser.close();
}
