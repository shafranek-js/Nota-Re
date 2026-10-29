/**
 * Release-identity regression: proves that the app shows the actual version
 * from package.json and the exact code revision compiled by CI.
 * No manually maintained/hard-coded version badge is allowed.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const envSha = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA;
const revision = (envSha && /^[a-f0-9]{7,40}$/i.test(envSha)
  ? envSha : execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim()
).slice(0, 7);
const expected = `v${version} · ${revision} · production`;
const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']
});

try {
  for (const width of [320, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      const footer = page.getByTestId('status-bar');
      const visibleBuild = footer.getByTestId('build-version');
      await footer.waitFor({ state: 'visible' });
      await visibleBuild.waitFor({ state: 'visible' });
      assert.equal((await visibleBuild.innerText()).trim(), expected,
        `width ${width}: actual running bundle revision must be visible in the status bar`);

      await page.getByRole('button', { name: 'Открыть настройки' }).click();
      const inSettings = page.getByTestId('settings-build-version');
      assert.match(await inSettings.innerText(), /Версия приложения:/);
      assert.equal((await inSettings.innerText()).trim(), `Версия приложения: ${expected}`);
      await page.keyboard.press('Escape');

      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal((await page.getByTestId('build-version').innerText()).trim(), expected,
        'refresh should never display stale cached build metadata');
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  }
  console.log('Build version Chrome smoke passed:', expected, '(320 and 1440 px)');
} finally {
  await browser.close();
}
