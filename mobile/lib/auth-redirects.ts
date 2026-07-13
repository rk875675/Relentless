import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';

const scheme =
  (Constants.expoConfig?.scheme as string | undefined) ??
  process.env.EXPO_PUBLIC_APP_URL_SCHEME ??
  'relentless';

/** User override for staging (Supabase “Redirect URLs” must include the same string). */
const explicitRedirect = process.env.EXPO_PUBLIC_AUTH_REDIRECT_BASE?.replace(/\/$/, '') ?? null;

/**
 * Google OAuth (PKCE) callback — add this exact value to Supabase Auth → URL configuration.
 */
export function getOAuthRedirectUrl(): string {
  if (explicitRedirect) return `${explicitRedirect}/auth-callback`;
  return AuthSession.makeRedirectUri({ scheme, path: 'auth-callback' });
}

/**
 * Deep link for password reset email — add to Supabase allow list and email templates.
 */
export function getPasswordRecoveryRedirectUrl(): string {
  if (explicitRedirect) return `${explicitRedirect}/password-recovery`;
  return AuthSession.makeRedirectUri({ scheme, path: 'password-recovery' });
}

/**
 * Deep link for the signup email-confirmation flow. Passed as `emailRedirectTo`
 * on signUp and forwarded by the `auth-redirect` edge function bridge. Must be
 * added to Supabase Auth → URL configuration → Redirect URLs.
 */
export function getEmailConfirmRedirectUrl(): string {
  if (explicitRedirect) return `${explicitRedirect}/auth-confirm`;
  return AuthSession.makeRedirectUri({ scheme, path: 'auth-confirm' });
}

/** Auth params from Supabase email / deep link (hash and/or query). */
export function parseAuthParamsFromUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const afterHash = url.includes('#') ? url.split('#').slice(1).join('#') : '';
  const afterQ = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  for (const part of [afterHash, afterQ].filter(Boolean)) {
    const sp = new URLSearchParams(part);
    sp.forEach((v, k) => {
      if (v) out[k] = v;
    });
  }
  return out;
}

function codeOrErrorFromHash(hash: string | undefined | null, key: 'code' | 'error'): string | null {
  if (!hash || !hash.startsWith('#')) return null;
  const sp = new URLSearchParams(hash.slice(1));
  return sp.get(key);
}

export function parseOAuthCallbackUrl(resultUrl: string): { code: string | null; error: string | null } {
  try {
    const u = new URL(resultUrl);
    const err = u.searchParams.get('error') || codeOrErrorFromHash(u.hash, 'error');
    if (err) return { code: null, error: err };
    const code = u.searchParams.get('code') || codeOrErrorFromHash(u.hash, 'code');
    return { code, error: null };
  } catch {
    const codeM = /[?&#]code=([^&#]+)/.exec(resultUrl);
    const errM = /[?&#]error=([^&#]+)/.exec(resultUrl);
    return {
      code: codeM ? decodeURIComponent(codeM[1]) : null,
      error: errM ? decodeURIComponent(errM[1]) : null,
    };
  }
}
