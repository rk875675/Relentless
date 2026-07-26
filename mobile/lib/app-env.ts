/**
 * Build environment detection for client-only feature gating.
 *
 * `EXPO_PUBLIC_APP_ENV` is injected per EAS build profile (see `mobile/eas.json`):
 *   development | preview | production
 *
 * Fail-safe rule: anything we do not explicitly recognize as a non-production
 * environment resolves to "production". A release build can therefore never
 * accidentally enable a non-production-only feature, even if the flag is
 * missing or misconfigured.
 */

export type AppEnv = 'development' | 'preview' | 'production';

function resolveAppEnv(): AppEnv {
  const raw = (process.env.EXPO_PUBLIC_APP_ENV ?? '').trim().toLowerCase();
  if (raw === 'development' || raw === 'preview' || raw === 'production') {
    return raw;
  }
  // No explicit flag set: Metro / dev-client (__DEV__) is development; any
  // other build (preview/production release without the flag) fails safe to
  // production so non-prod features stay off.
  return __DEV__ ? 'development' : 'production';
}

export const APP_ENV: AppEnv = resolveAppEnv();

export const isProductionBuild = APP_ENV === 'production';
