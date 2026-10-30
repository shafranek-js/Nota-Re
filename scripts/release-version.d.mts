export declare const RELEASE_BASELINE_COMMIT: string;
export interface ReleaseIdentity {
  readonly version: string;
  readonly source: 'git-history' | 'unverified-history';
  readonly firstParentCommits: number | null;
}
export declare function composeReleaseVersion(
  baseVersion: string, firstParentCommits: number | null, revision?: string | null
): ReleaseIdentity;
export declare function resolveReleaseVersion(input: {
  baseVersion: string;
  revision?: string | null;
  cwd?: string;
  runGit?: (args: string[], cwd: string) => string;
}): ReleaseIdentity;
