import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReleaseHistory } from '../scripts/prepare-release-history.mjs';

const sha = 'a7babefe74e21aebe91c05db2e12f83ca528309d';
const env = { WORKERS_CI: '1', WORKERS_CI_COMMIT_SHA: sha };
const logger = { info() {}, warn() {} };

function gitFixture({ shallow = true, missing = false, brokenOrigin = false, truncated = false } = {}) {
  const calls = [];
  let isShallow = shallow;
  let hasHistory = !shallow && !truncated;
  const runGit = args => {
    calls.push(args);
    if (missing) throw Error('git not installed');
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return sha;
    if (args[0] === 'rev-parse' && args[1] === '--is-shallow-repository')
      return isShallow ? 'true' : 'false';
    if (args[0] === 'fetch') {
      if (brokenOrigin && args.includes('origin')) throw Error('origin unavailable');
      isShallow = false;
      hasHistory = true;
      return '';
    }
    if (args[0] === 'merge-base') {
      if (!hasHistory) throw Error('anchor unavailable');
      return '';
    }
    if (args[0] === 'rev-list') {
      if (!hasHistory) throw Error('no ancestry');
      return '51';
    }
    throw Error('unexpected git: ' + args.join(' '));
  };
  return { calls, runGit };
}

test('full Cloudflare checkout uses the same v3.0.51 as local for exact SHA', () => {
  const fixture = gitFixture({ shallow: false });
  assert.equal(prepareReleaseHistory({ env, runGit: fixture.runGit, logger }).version, '3.0.51');
  assert.equal(fixture.calls.some(x => x[0] === 'fetch'), false);
});

test('Workers Builds shallow checkout fetches ancestry and restores numeric patch', () => {
  const fixture = gitFixture();
  const result = prepareReleaseHistory({ env, runGit: fixture.runGit, logger });
  assert.equal(result.version, '3.0.51');
  assert.ok(fixture.calls.some(x => x.join(' ') === 'fetch --unshallow --no-tags origin'));
});

test('fallback public GitHub fetch when Cloudflare origin is not accessible', () => {
  const fixture = gitFixture({ brokenOrigin: true });
  assert.equal(prepareReleaseHistory({ env, runGit: fixture.runGit, logger }).version, '3.0.51');
  assert.ok(fixture.calls.some(x => x.join(' ') ===
    'fetch --unshallow --no-tags https://github.com/shafranek-js/Nota-Re.git'));
});

test('a truncated non-shallow checkout is recovered without invalid --unshallow', () => {
  const fixture = gitFixture({ shallow: false, truncated: true });
  assert.equal(prepareReleaseHistory({ env, runGit: fixture.runGit, logger }).version, '3.0.51');
  assert.ok(fixture.calls.some(x => x.join(' ') === 'fetch --no-tags origin main'));
});

test('a Cloudflare build fails rather than publishing v3.0.0+gSHA when Git is unavailable', () => {
  assert.throws(() => prepareReleaseHistory({
    env, runGit: gitFixture({ missing: true }).runGit, logger
  }), /Cloudflare checkout has no Git metadata/);
});

test('Cloudflare does not publish if repository history cannot be fetched', () => {
  const fixture = gitFixture();
  const denyFetch = args => {
    if (args[0] === 'fetch') throw Error('network disabled');
    return fixture.runGit(args);
  };
  assert.throws(() => prepareReleaseHistory({ env, runGit: denyFetch, logger }),
    /Failed to recover release history/);
});

test('Cloudflare cannot label the wrong checkout as the advertised source commit', () => {
  assert.throws(() => prepareReleaseHistory({
    env: { WORKERS_CI: '1', WORKERS_CI_COMMIT_SHA: '1234567890abcdef1234567890abcdef12345678' },
    runGit: gitFixture({ shallow: false }).runGit, logger
  }), /does not match/);
});

test('local source archives without a Git checkout preserve explicit fallback support', () => {
  const result = prepareReleaseHistory({
    env: {}, runGit: gitFixture({ missing: true }).runGit, logger
  });
  assert.deepEqual(result, { source: 'archive', version: null });
});
