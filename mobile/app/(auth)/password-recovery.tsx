import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { createRecoveryClient } from '@/lib/recovery-client';
import { parseAuthParamsFromUrl } from '@/lib/auth-redirects';
import { clearPendingRecoveryUrl, peekPendingRecoveryUrl } from '@/lib/recovery-link-store';
import { isCredentialHandled, markCredentialHandled } from '@/lib/auth-link-dedupe';
import { colors, spacing } from '@/lib/theme';
import { InlineErrorCard } from '@/components/InlineErrorCard';
import { friendlySignUpError, passwordMeetsComplexity } from '@/app/(auth)/signup';

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

function collectRouteParams(routeParams: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of AUTH_PARAM_KEYS) {
    const v = routeParams[key];
    const value = Array.isArray(v) ? v[0] : v;
    if (typeof value === 'string' && value) out[key] = value;
  }
  return out;
}

export default function PasswordRecoveryScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<Record<string, string | string[]>>();
  const [booting, setBooting] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const resolvedRef = useRef(false);
  // Isolated client so the recovery session never persists or logs the user in.
  const recoveryRef = useRef<ReturnType<typeof createRecoveryClient> | null>(null);
  if (!recoveryRef.current) recoveryRef.current = createRecoveryClient();
  const recovery = recoveryRef.current;

  const tryResolve = useCallback(async (params: Record<string, string>) => {
    if (resolvedRef.current) return;
    const { access_token, refresh_token, code, token_hash, type } = params;
    const linkError = params.error_description || params.error_code || params.error;
    const hasCredential = Boolean(token_hash || code || (access_token && refresh_token));
    // Nothing usable yet — wait for the link/params to arrive (effect re-runs).
    // Important: do NOT sign the user out here. A bare mount/reload with no link
    // must leave any existing app session intact.
    if (!hasCredential && !linkError) return;

    const cred = token_hash || code || access_token || null;
    // Already resolved this exact link before (e.g. the app's stale launch URL
    // re-opens this screen on reload). Don't re-process or show an error — just
    // leave. RouteGuard sends a still-signed-in user into the app; otherwise
    // they land on login.
    if (cred && (await isCredentialHandled(cred))) {
      resolvedRef.current = true;
      router.replace('/(auth)/login' as any);
      return;
    }

    resolvedRef.current = true;

    if (linkError) {
      setLoadError(`${decodeURIComponent(linkError).replace(/\+/g, ' ')}`);
      setBooting(false);
      void markCredentialHandled(cred);
      return;
    }
    if (type && type !== 'recovery') {
      setLoadError('This link is invalid or expired. Request a new one from sign in.');
      setBooting(false);
      void markCredentialHandled(cred);
      return;
    }

    let sessionErr: { message: string } | null = null;
    if (token_hash) {
      ({ error: sessionErr } = await recovery.auth.verifyOtp({ token_hash, type: 'recovery' }));
    } else if (access_token && refresh_token) {
      ({ error: sessionErr } = await recovery.auth.setSession({ access_token, refresh_token }));
    } else if (code) {
      ({ error: sessionErr } = await recovery.auth.exchangeCodeForSession(code));
    }
    if (sessionErr) {
      setLoadError(sessionErr.message);
      setBooting(false);
      // Only mark the credential handled if Supabase definitively rejected the
      // token (expired/invalid/already used) — a transient network/fetch
      // failure must leave it unmarked so a relaunch from the same email link
      // retries instead of being silently skipped (mirrors the confirm.tsx fix).
      if (!isAuthRetryableFetchError(sessionErr)) {
        void markCredentialHandled(cred);
      }
      return;
    }
    // Valid recovery link confirmed. Now clear any stale app session so that,
    // after the reset, the user lands on login instead of being bounced into
    // the app. (Recovery itself runs on an isolated in-memory client.)
    void supabase.auth.signOut();
    void markCredentialHandled(cred);
    clearPendingRecoveryUrl();
    setSessionReady(true);
    setBooting(false);
  }, [recovery, router]);

  // The token_hash deep link delivers creds in the query string, which
  // expo-router parses into route params. This re-runs when they populate.
  // Fallbacks cover #fragment links and warm starts.
  useEffect(() => {
    void (async () => {
      let params = collectRouteParams(routeParams);
      if (!params.token_hash && !params.code && !params.access_token && !params.error) {
        const url = (await Linking.getInitialURL()) ?? peekPendingRecoveryUrl();
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
        setBooting(false);
        setLoadError('Open the reset link from your email on this device, or request a new one from sign in.');
      }
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  const savePassword = async () => {
    if (!password || !confirm) return;
    // Mirrors signup.tsx's requirement so recovery doesn't accept a password
    // signup would reject.
    if (password.length < 8) {
      setSaveError('Password must be at least 8 characters.');
      return;
    }
    if (!passwordMeetsComplexity(password)) {
      setSaveError('Password must include uppercase, lowercase, and a number.');
      return;
    }
    if (password !== confirm) {
      setSaveError('Passwords do not match.');
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const { error: upErr } = await recovery.auth.updateUser({ password });
      if (upErr) {
        // Same sanitisation as signup — never show Supabase's raw
        // character-class list here either.
        setSaveError(friendlySignUpError(upErr.message));
        return;
      }
      // Discard the in-memory recovery session, then show a success screen with
      // an explicit "Sign in" button instead of bouncing the user away.
      await recovery.auth.signOut();
      setDone(true);
    } finally {
      setSaving(false);
    }
  };

  if (booting) {
    return (
      <View style={styles.center}>
        <Text style={styles.logo}>RELENTLESS</Text>
        <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.centerPadded}>
        <Text style={styles.logo}>RELENTLESS</Text>
        <Text style={styles.errTitle}>Couldn't open link</Text>
        <Text style={styles.sub}>{loadError}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/forgot-password' as any)}>
          <Text style={styles.buttonText}>Request new link</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/(auth)/login' as any)} style={styles.textBtn}>
          <Text style={styles.muted}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!sessionReady) {
    return null;
  }

  if (done) {
    return (
      <View style={styles.centerPadded}>
        <Text style={styles.logo}>RELENTLESS</Text>
        <Text style={styles.title}>Password updated</Text>
        <Text style={styles.sub}>Your password has been changed. Sign in with your new password to continue.</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/login' as any)}>
          <Text style={styles.buttonText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.title}>Choose a new password</Text>
          <Text style={styles.subLabel}>At least 8 characters, with uppercase, lowercase, and a number.</Text>

          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="password-new"
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor={colors.textMuted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="password-new"
          />
          {saveError ? <InlineErrorCard message={saveError} /> : null}
          <TouchableOpacity style={styles.button} onPress={savePassword} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.buttonText}>Update password</Text>
            )}
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  centerPadded: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  logo: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  subLabel: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 20 },
  errTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', marginTop: 8 },
  input: {
    backgroundColor: colors.surface,
    color: colors.white,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: '700' },
  textBtn: { marginTop: 20, alignItems: 'center' },
  muted: { color: colors.textSecondary, fontSize: 14 },
});
