/**
 * Build metadata is injected by Vite at compile time.
 * Version patch advances automatically on every first-parent commit since
 * the v3.0.0 baseline; revision identifies the exact compiled checkout.
 * Local uncommitted edits are not represented by the Git SHA.
 */
export const BUILD_INFO = {
  version: __NOTARE_APP_VERSION__,
  revision: __NOTARE_BUILD_COMMIT__,
  environment: import.meta.env.DEV ? 'dev' : 'production'
} as const;

export const BUILD_LABEL = `v${BUILD_INFO.version} · сборка ${BUILD_INFO.revision}`;
export const BUILD_DETAILS = `${BUILD_LABEL} · ${BUILD_INFO.environment}`;
