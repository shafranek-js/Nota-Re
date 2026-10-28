import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1920, height: 960 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.addInitScript(() => {
    const input = { id: 'virtual-hardware-uat', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([[input.id, input]]), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true, value: async () => access
    });
    window.__uat = {
      input, access,
      send(bytes) {
        if (typeof input.onmidimessage !== 'function') throw new Error('MIDI handler missing');
        input.onmidimessage({ data: Uint8Array.from(bytes) });
      },
      unplug() {
        input.state = 'disconnected';
        access.inputs.delete(input.id);
        access.onstatechange?.({});
      },
      replug() {
        input.state = 'connected';
        access.inputs.set(input.id, input);
        access.onstatechange?.({});
      }
    };
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__uat.input.onmidimessage === 'function');

  // Launch course preset with running flow. Settings must stop it.
  await page.getByText(/Урок 3:/).first().click();
  await page.getByRole('button', { name: /Запустить этот урок в тренажёре/ }).click();
  await page.getByRole('button', { name: 'Поток: ИДЁТ' }).waitFor();
  await page.getByTitle('Открыть настройки').click();
  await page.getByRole('button', { name: 'Синтезатор', exact: true }).click();
  const diag = page.getByTestId('midi-audio-diagnostics');
  await diag.locator('summary').click();
  const check = page.getByTestId('midi-hardware-check');
  await check.getByRole('button', { name: 'Начать проверку MIDI' }).click();

  const attempts = async () => Number(/\((\d+)\)/.exec(
    await page.getByTitle('Точность попаданий в текущей сессии').innerText()
  )?.[1]);
  const initialAttempts = await attempts();
  await page.evaluate(() => {
    window.__uat.send([0x90, 60, 85]);
    window.__uat.send([0x80, 60, 0]);
    window.__uat.send([0x90, 60, 85]);
    window.__uat.send([0x90, 64, 90]);
  });
  await page.getByTestId('hardware-step-0').getByText('Пройдено').waitFor();
  await page.getByTestId('hardware-step-1').getByText('Пройдено').waitFor();
  await page.evaluate(() => {
    window.__uat.send([0x80, 60, 0]);
    window.__uat.send([0x80, 64, 0]);
    window.__uat.send([0xb0, 64, 127]);
    window.__uat.send([0x90, 67, 92]);
    window.__uat.send([0x80, 67, 0]);
    window.__uat.send([0xb0, 64, 0]);
    window.__uat.send([0x90, 72, 75]);
    window.__uat.unplug();
  });
  await page.getByTestId('hardware-step-2').getByText('Пройдено').waitFor();
  await page.getByTestId('hardware-step-3').getByText('Пройдено').waitFor();
  await page.waitForTimeout(1300);
  assert.equal(await attempts(), initialAttempts,
    'hardware test and hidden-flow timeouts cannot change scoring while Settings is open');
  await check.getByRole('button', { name: 'Завершить проверку' }).click();
  const dl = page.waitForEvent('download');
  await check.getByRole('button', { name: 'Скачать отчёт JSON' }).click();
  const download = await dl;
  assert.equal(download.suggestedFilename(), 'nota-re-midi-hardware-check.json');
  const report = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.deepEqual(report.checks, {
    keyPressAndRelease: true,
    twoSimultaneousNotes: true,
    pedalSustainRelease: true,
    disconnectWhileHoldingNotes: true
  });
  assert.equal(report.aggregate.heldKeysAtStop, 0);
  assert.equal(report.aggregate.channelsWithPedalDownAtStop, 0);
  assert.ok(!JSON.stringify(report).includes('virtual-hardware-uat'),
    'report never includes device identity');

  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Поток: Пауза' }).waitFor();
  await page.evaluate(() => window.__uat.replug());
  await page.waitForFunction(() => typeof window.__uat.input.onmidimessage === 'function');
  await page.evaluate(() => window.__uat.send([0x90, 60, 70]));
  await page.waitForFunction(previous => {
    const el = document.querySelector('[title="Точность попаданий в текущей сессии"]');
    return Number(/\((\d+)\)/.exec(el?.textContent || '')?.[1]) > previous;
  }, initialAttempts);
  assert.equal(await attempts(), initialAttempts + 1,
    'physical MIDI remains graded in trainer after Settings closes');

  assert.deepEqual(errors, [], 'no unexpected errors');
  console.log('Hardware UAT browser smoke passed: guided key/chord/pedal/unplug, private JSON report, no false grading.');
} finally {
  await browser.close();
}
