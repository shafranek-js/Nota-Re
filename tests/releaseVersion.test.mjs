import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RELEASE_BASELINE_COMMIT, composeReleaseVersion, resolveReleaseVersion
} from '../scripts/release-version.mjs';

const revision = 'fedcba9876543210fedcba9876543210fedcba98';

test('automatic patch versions increase by one for each first-parent commit', () => {
  assert.deepEqual(composeReleaseVersion('3.0.0', 0, revision), {
    version: '3.0.0', source: 'git-history', firstParentCommits: 0
  });
  assert.equal(composeReleaseVersion('3.0.0', 1, revision).version, '3.0.1');
  assert.equal(composeReleaseVersion('3.0.0', 17, revision).version, '3.0.17');
  assert.equal(composeReleaseVersion('3.1.8', 5, revision).version, '3.1.13');
  assert.equal(composeReleaseVersion('4.0.0', 9, revision).version, '4.0.9');
});

test('release identity uses the v3.0.0 epoch and first-parent Git count', () => {
  const calls = [];
  const runGit = args => {
    calls.push(args);
    if (args[0] === 'rev-parse') return 'false';
    if (args[0] === 'merge-base') return '';
    if (args[0] === 'rev-list') return '21';
    throw new Error('unexpected git query');
  };
  const v = resolveReleaseVersion({ baseVersion: '3.0.0', revision, runGit });
  assert.equal(v.version, '3.0.21');
  assert.deepEqual(calls, [
    ['rev-parse', '--is-shallow-repository'],
    ['merge-base', '--is-ancestor', RELEASE_BASELINE_COMMIT, 'HEAD'],
    ['rev-list', '--first-parent', '--count', `${RELEASE_BASELINE_COMMIT}..HEAD`]
  ]);
});

test('same commit produces same release across independent builds', () => {
  const runGit = args => args[0] === 'rev-parse' ? 'false' :
    args[0] === 'rev-list' ? '37' : '';
  assert.deepEqual(
    resolveReleaseVersion({ baseVersion: '3.0.0', revision, runGit }),
    resolveReleaseVersion({ baseVersion: '3.0.0', revision, runGit })
  );
});

test('shallow and missing history never silently claim the stale base version', () => {
  const cases = [
    () => 'true',
    () => { throw new Error('git missing'); },
    args => args[0] === 'merge-base' ? (() => { throw new Error('not ancestor'); })() : 'false',
    args => args[0] === 'rev-list' ? 'broken' : 'false'
  ];
  for (const runGit of cases) {
    const v = resolveReleaseVersion({ baseVersion: '3.0.0', revision, runGit });
    assert.deepEqual(v, {
      version: '3.0.0+gfedcba9',
      source: 'unverified-history',
      firstParentCommits: null
    });
  }
  assert.equal(composeReleaseVersion('3.0.0', null, null).version, '3.0.0+gunknown');
});

test('release version rejects corrupt version strings and invalid increments', () => {
  for (const value of ['3.0', 'v3.0.0', '3.0.x', '3.0.0-rc.1', '03.0.0']) {
    assert.throws(() => composeReleaseVersion(value, 0, revision), /Invalid package/);
  }
  for (const n of [-1, 0.5, Number.NaN, Infinity]) {
    const v = composeReleaseVersion('3.0.0', n, revision);
    assert.equal(v.source, 'unverified-history');
    assert.equal(v.version, '3.0.0+gfedcba9');
  }
});
