/**
 * Build metadata is injected by Vite at compile time.
 * Version changes only with package.json; revision changes on each commit.
 * A dirty/uncommitted dev worktree is not represented by the Git SHA.
 */
export const BUILD_INFO = {
  version: __NOTARE_APP_VERSION__,
  revision: __NOTARE_BUILD_COMMIT__,
  environment: import.meta.env.DEV ? 'dev' : 'production'
} as const;

export const BUILD_LABEL = `v${BUILD_INFO.version} · ${BUILD_INFO.revision}`;
export const BUILD_DETAILS = `${BUILD_LABEL} · ${BUILD_INFO.environment}`;
