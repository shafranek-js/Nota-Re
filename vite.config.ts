import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Identify the actual source revision of each compiled bundle. CI and
// Cloudflare provide their checkout SHA; local dev uses the current git HEAD.
// Do not use a time/random build ID: those cannot be traced back to code.
function getBuildRevision(): string {
  const ciRevision = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA;
  if (ciRevision && /^[a-f0-9]{7,40}$/i.test(ciRevision)) return ciRevision.slice(0, 7);
  try {
    const gitRevision = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: new URL('.', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (/^[a-f0-9]{7,40}$/i.test(gitRevision)) return gitRevision.slice(0, 7);
  } catch {
    // Source archives without .git must still be buildable.
  }
  return 'unknown';
}

export default defineConfig({
  plugins: [react()],
  define: {
    __NOTARE_APP_VERSION__: JSON.stringify(version),
    __NOTARE_BUILD_COMMIT__: JSON.stringify(getBuildRevision())
  }
});
