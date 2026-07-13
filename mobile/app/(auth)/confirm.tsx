import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Linking from 'expo-linking';
import { EmailOtpType, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { parseAuthParamsFromUrl } from '@/lib/auth-redirects';
import { clearPendingConfirmUrl, peekPendingConfirmUrl } from '@/lib/confirm-link-store';
import { markCredentialHandled } from '@/lib/auth-link-dedupe';
import { colors, spacing } from '@/lib/theme';

const AUTH_PARAM_KEYS = [
  'access_token',
  'refresh_token',
  'code',
  'token_hash',
  'type',
  'error',
  'error_code',
  'error_description',
] as const;

/** OTP types that mean "confirm this account/email" (handled on the main client). */
const CONFIRM_OTP_TYPES = new Set(['signup', 'email', 'email_change', 'magiclink', 'invite']);

function collectRouteParams(routeParams: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of AUTH_PARAM_KEYS) {
    const v = routeParams[key];
    const value = Array.isArray(v) ? v[0] : v;
    if (typeof value === 'string' && value) out[key] = value;
  }
  return out;
}

/**
 * Signup email-confirmation landing screen.
 *
 * Unlike password recovery (isolated in-memory client), confirmation must
 * establish a real, persisted session on the shared `supabase` client so the
 * user ends up signed in. verifyOtp consumes the `token_hash` from the email
 * link; RouteGuard then routes the now-signed-in user onward.
 */
export default function ConfirmScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<Record<string, string | string[]>>();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const resolvedRef = useRef(false);

  const tryResolve = useCallback(async (params: Record<string, string>) => {
    if (resolvedRef.current) return;
    const { access_token, refresh_token, code, token_hash, type } = params;
    const linkError = params.error_description || params.error_code || params.error;
    const hasCredential = Boolean(token_hash || code || (access_token && refresh_token));
    if (!hasCredential && !linkError) return;

    resolvedRef.current = true;
    const cred = token_hash || code || access_token || null;

    if (linkError) {
      setError(`${decodeURIComponent(linkError).replace(/\+/g, ' ')}`);
      // The link itself carries an error (expired/invalid) — it can never
      // succeed, so mark it handled to stop stale relaunches re-opening this
      // error screen (mirrors password-recovery.tsx).
      void markCredentialHandled(cred);
      return;
    }

    let sessionErr: { message: string } | null = null;
    if (token_hash) {
      const otpType: EmailOtpType =
        type && CONFIRM_OTP_TYPES.has(type) ? (type as EmailOtpType) : 'signup';
      ({ error: sessionErr } = await supabase.auth.verifyOtp({ token_hash, type: otpType }));
    } else if (access_token && refresh_token) {
      ({ error: sessionErr } = await supabase.auth.setSession({ access_token, refresh_token }));
    } else if (code) {
      ({ error: sessionErr } = await supabase.auth.exchangeCodeForSession(code));
    }

    if (sessionErr) {
      setError(sessionErr.message);
      // Definitive rejection (expired/invalid/already used): mark handled so a
      // stale relaunch of this same link doesn't keep re-opening the error
      // screen. A transient network/fetch failure stays UN-marked so a
      // relaunch retries instead of being silently skipped (mirrors
      // password-recovery.tsx).
      if (!isAuthRetryableFetchError(sessionErr)) {
        void markCredentialHandled(cred);
      }
      return;
    }

    // Success: persist the dedupe mark so a stale relaunch of this consumed
    // link is ignored.
    void markCredentialHandled(cred);
    clearPendingConfirmUrl();
    // Session is now persisted on the shared client. Stay on this screen (now
    // showing a success state) and let RouteGuard route the newly-signed-in
    // user to tabs / paywall / onboarding-resume once auth + profile state
    // propagate. Navigating to welcome here directly caused a flash of the
    // wrong screen before RouteGuard corrected it.
    setConfirmed(true);
  }, []);

  // Safety net: if RouteGuard hasn't moved us off this screen within 10s of a
  // successful confirmation (e.g. a stalled profile fetch), fall back to the
  // app root so nobody is stranded on the spinner.
  useEffect(() => {
    if (!confirmed) return;
    const t = setTimeout(() => {
      router.replace('/' as any);
    }, 10_000);
    return () => clearTimeout(t);
  }, [confirmed, router]);

  useEffect(() => {
    void (async () => {
      let params = collectRouteParams(routeParams);
      if (!params.token_hash && !params.code && !params.access_token && !params.error) {
        const url = (await Linking.getInitialURL()) ?? peekPendingConfirmUrl();
        if (url) params = { ...parseAuthParamsFromUrl(url), ...params };
      }
      await tryResolve(params);
    })();
  }, [routeParams, tryResolve]);

  // Warm start: the link can arrive via a `url` event after mount.
  useEffect(() => {
    const sub = Linking.addEventListener('url', (e) => {
      if (e.url) void tryResolve(parseAuthParamsFromUrl(e.url));
    });
    return () => sub.remove();
  }, [tryResolve]);

  // Don't spin forever if no link ever arrives.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!resolvedRef.current) {
        resolvedRef.current = true;
        setError('Open the confirmation link from your email on this device, or request a new one by signing up again.');
      }
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  if (error) {
    return (
      <View style={styles.centerPadded}>
        <Text style={styles.logo}>RELENTLESS</Text>
        <Text style={styles.errTitle}>Couldn't confirm your email</Text>
        <Text style={styles.sub}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/login' as any)}>
          <Text style={styles.buttonText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.logo}>RELENTLESS</Text>
      <Text style={styles.sub}>
        {confirmed ? 'Email confirmed — loading your training…' : 'Confirming your email…'}
      </Text>
      <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 20 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  centerPadded: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  logo: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 8,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  errTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', marginTop: 8 },
  button: {
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: '700' },
});
