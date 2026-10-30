import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Release baseline: Nota Re displayed v3.0.0 at this main-branch commit.
 * Advance the patch number once per FIRST-PARENT commit after that baseline.
 * The same source commit therefore yields the same version in local dev,
 * CI, and GitHub Pages, without committing package-lock changes per PR.
 *
 * When moving to 3.1.0/4.0.0 intentionally, change package.json's base
 * version and this anchor together in one reviewed release PR.
 */
export const RELEASE_BASELINE_COMMIT = 'f773eb938b36456859c092e1adada53c3e729e1e';

const HEX_COMMIT = /^[0-9a-f]{7,40}$/i;
const SEMVER_CORE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function composeReleaseVersion(baseVersion, firstParentCommits, revision) {
  const match = SEMVER_CORE.exec(baseVersion);
  if (!match) throw new Error(`Invalid package.json base version: ${baseVersion}`);
  if (Number.isSafeInteger(firstParentCommits) && firstParentCommits >= 0) {
    return {
      version: `${match[1]}.${match[2]}.${Number(match[3]) + firstParentCommits}`,
      source: 'git-history',
      firstParentCommits
    };
  }

  // A shallow or source-archive checkout cannot prove sequential numbering.
  // Never silently claim the unchanged base is the current release. Build
  // metadata makes this explicit and still identifies distinct revisions.
  const shortSha = revision && HEX_COMMIT.test(revision) ? revision.slice(0, 7) : 'unknown';
  return {
    version: `${baseVersion}+g${shortSha}`,
    source: 'unverified-history',
    firstParentCommits: null
  };
}

const defaultGit = (args, cwd) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
}).trim();

/** Purely source-based build identity; does not depend on clock or CI run number. */
export function resolveReleaseVersion({
  baseVersion, revision, cwd = fileURLToPath(new URL('../', import.meta.url)), runGit = defaultGit
}) {
  try {
    if (runGit(['rev-parse', '--is-shallow-repository'], cwd) !== 'false') {
      throw new Error('shallow git history');
    }
    // Ensure the anchor exists in THIS checkout (not just an unrelated tag).
    runGit(['merge-base', '--is-ancestor', RELEASE_BASELINE_COMMIT, 'HEAD'], cwd);
    const raw = runGit(['rev-list', '--first-parent', '--count',
      `${RELEASE_BASELINE_COMMIT}..HEAD`], cwd);
    if (!/^(0|[1-9]\d*)$/.test(raw)) throw new Error('unavailable release count');
    const count = Number(raw);
    if (!Number.isSafeInteger(count)) throw new Error('release count overflow');
    return composeReleaseVersion(baseVersion, count, revision);
  } catch {
    return composeReleaseVersion(baseVersion, null, revision);
  }
}
