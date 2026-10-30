#!/usr/bin/env node
/**
 * Recover the full source ancestry before any production build. Cloudflare
 * Workers Builds currently checks out an incomplete Git history; a build
 * without the v3.0.0 anchor used to silently show v3.0.0+gSHA for the same
 * commit whose complete local checkout showed v3.0.51.
 *
 * Never derive a patch from the CI run number or the current wall clock.
 * Workers builds must fail rather than publish misleading version metadata
 * if the Git history cannot be recovered.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { RELEASE_BASELINE_COMMIT, resolveReleaseVersion } from './release-version.mjs';
import { readFileSync } from 'node:fs';

const SOURCE_REMOTE = 'https://github.com/shafranek-js/Nota-Re.git';
const SHA = /^[0-9a-f]{7,40}$/i;
const defaultGit = (args, cwd) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000
}).trim();

export function prepareReleaseHistory({
  cwd = fileURLToPath(new URL('../', import.meta.url)),
  env = process.env, runGit = defaultGit, logger = console
} = {}) {
  const cloudflare = env.WORKERS_CI === '1' || env.CF_PAGES === '1' ||
    Boolean(env.WORKERS_CI_COMMIT_SHA || env.CF_PAGES_COMMIT_SHA);
  const expectedCommit = env.WORKERS_CI_COMMIT_SHA || env.CF_PAGES_COMMIT_SHA ||
    env.NOTARE_BUILD_SHA || (env.GITHUB_ACTIONS === 'true' ? env.GITHUB_SHA : null);

  let actualCommit;
  try {
    actualCommit = runGit(['rev-parse', 'HEAD'], cwd);
    if (!SHA.test(actualCommit)) throw new Error('invalid Git revision');
  } catch (error) {
    if (cloudflare) throw new Error(
      'Cloudflare checkout has no Git metadata. Cannot generate an exact release version.', { cause: error });
    logger.info('Release history: no Git checkout; source archive uses +gSHA fallback.');
    return { source: 'archive', version: null };
  }

  if (expectedCommit && SHA.test(expectedCommit) &&
      !actualCommit.toLowerCase().startsWith(expectedCommit.toLowerCase()) &&
      !expectedCommit.toLowerCase().startsWith(actualCommit.toLowerCase())) {
    throw new Error('Build source revision does not match the Cloudflare/CI commit: refusing to mislabel it.');
  }

  let shallow;
  try { shallow = runGit(['rev-parse', '--is-shallow-repository'], cwd) === 'true'; }
  catch { shallow = true; }

  const verifyHistory = () => {
    if (runGit(['rev-parse', '--is-shallow-repository'], cwd) !== 'false')
      throw new Error('Git history is still shallow');
    runGit(['merge-base', '--is-ancestor', RELEASE_BASELINE_COMMIT, 'HEAD'], cwd);
    const baseVersion = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8')).version;
    const release = resolveReleaseVersion({ baseVersion, revision: actualCommit, cwd, runGit });
    if (release.source !== 'git-history') throw new Error('Release version cannot be verified');
    return release;
  };

  let firstFailure;
  try {
    const release = verifyHistory();
    logger.info(`Release version: v${release.version} · ${actualCommit.slice(0, 7)}`);
    return release;
  } catch (error) { firstFailure = error; }

  // A shallow clone must be deepened, but some build providers also present a
  // non-shallow truncated Git object database. Try the public source before
  // giving up, and never replace HEAD with the remote branch's latest commit.
  if (shallow || cloudflare) {
    const failures = [String(firstFailure.message ?? firstFailure)];
    for (const remote of ['origin', SOURCE_REMOTE]) {
      try {
        const stillShallow = runGit(['rev-parse', '--is-shallow-repository'], cwd) === 'true';
        const args = stillShallow
          ? ['fetch', '--unshallow', '--no-tags', remote]
          : ['fetch', '--no-tags', remote, 'main'];
        logger.info(`Release history: fetching missing ancestry from ${remote === 'origin' ? 'origin' : 'public GitHub'}...`);
        runGit(args, cwd);
        const release = verifyHistory();
        logger.info(`Release history recovered: v${release.version} · ${actualCommit.slice(0, 7)}`);
        return release;
      } catch (err) { failures.push(String(err.message ?? err)); }
    }
    throw new Error('Failed to recover release history; refusing to publish a divergent version. ' +
      failures.join('; '));
  }

  logger.warn('Release history is not anchored; using explicit +gSHA fallback for this local build.');
  return { source: 'unverified-history', version: null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { prepareReleaseHistory(); }
  catch (error) {
    console.error('[Nota Re release]', error.message);
    process.exitCode = 1;
  }
}
