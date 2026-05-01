import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthSocialSignInButtons } from '@/components/auth/AuthSocialSignInButtons';
import { markInAppAuthHubEntry } from '@/lib/auth-hub-entry';
import { useAuth, type SocialSignInResult } from '@/lib/auth-context';
import { analytics } from '@/lib/analytics';
import { restorePurchasesViaStoreKit } from '@/lib/iap-restore';
import { clearOnboardingProgress } from '@/lib/onboarding-local-state';
import { ONBOARDING_PROGRESS } from '@/lib/onboarding-progress';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';

/** expo-iap getAvailablePurchases() can stall in sandbox; cap so we never block the user. */
const POST_PAYWALL_RESTORE_TIMEOUT_MS = 8_000;

/** Hard ceiling on the entire post-paywall sync. If anything beyond restore stalls
 *  (slow Supabase, missing profile row, etc.), we still drop the user into the app
 *  and let the route guard reconcile rather than show a forever spinner. */
const POST_PAYWALL_TOTAL_TIMEOUT_MS = 15_000;

/** Supabase email sign-up error when the account already exists (retry with password sign-in). */
function isAccountAlreadyExistsMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('already registered') ||
    m.includes('user already registered') ||
    m.includes('email address is already registered') ||
    m.includes('already been registered')
  );
}

function isSocialCancelled(r: SocialSignInResult): boolean {
  return r.ok === false && 'cancelled' in r && r.cancelled === true;
}

export default function OnboardingSignupScreen() {
  const router = useRouter();
  const { competitionDate, sport: sportParam, postPaywall } = useLocalSearchParams<{
    competitionDate?: string | string[];
    sport?: string | string[];
    postPaywall?: string;
  }>();
  const sportArg = Array.isArray(sportParam) ? sportParam[0] : sportParam;
  const isPostPaywall = postPaywall === 'true';
  const {
    session,
    signUp,
    signInWithGoogle,
    signInWithApple,
    updateCompetitionDate,
    updateSport,
    completeOnboarding,
    refreshUserState,
    optimisticGrantAccess,
    hasPremiumAccess,
  } = useAuth();

  const [mode, setMode] = useState<'hub' | 'email'>('hub');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [setupComplete, setSetupComplete] = useState(false);

  const syncStarted = useRef(false);
  const justSignedUp = useRef(false);
  const onboardingCompletedFiredRef = useRef(false);

  const resetToTabs = useCallback(() => {
    // Leave the nested onboarding stack before replacing with the root URL.
    // Reload proves `/` resolves into the app once auth/onboarding/premium are
    // set, while direct tab URLs from this nested stack have produced black or
    // not-found intermediate screens.
    try {
      router.dismissAll();
    } catch {
      // dismissAll is best-effort; replace below is the actual navigation.
    }
    router.replace('/' as any);
  }, [router]);

  useEffect(() => {
    if (setupComplete) resetToTabs();
  }, [setupComplete, resetToTabs]);

  /**
   * Post-paywall reliability:
   * - Navigate immediately after writes — do not defer only with InteractionManager (can hang).
   * - Do not set syncing=false before replace on success (avoids form flash + stuck syncStarted).
   * - Already-registered: signInWithPassword then retry setup.
   * - Skip restore when entitlement already active (Superwall + backend already synced).
   * - Hard total-timeout: if anything stalls, force-navigate to /(tabs); the route
   *   guard reconciles entitlement / onboarding state on its own. Better than spinner.
   */
  const finishPostPaywallSetup = useCallback(async () => {
    if (syncStarted.current) return;
    syncStarted.current = true;
    setSyncing(true);
    setLoading(false);
    setError('');
    setSetupError('');

    let forceNavigated = false;
    const forceNavigateTimer = setTimeout(() => {
      if (syncStarted.current && !forceNavigated) {
        forceNavigated = true;
        // Drop the user into the app even if Supabase writes are still pending.
        // Reset the root stack to the real `(tabs)` route instead of pushing a
        // URL from inside the nested onboarding stack; URL redirects here can
        // leave the navigator on a black intermediate screen.
        setSetupComplete(true);
        resetToTabs();
      }
    }, POST_PAYWALL_TOTAL_TIMEOUT_MS);

    try {
      const { data: { session: active } } = await supabase.auth.getSession();
      if (!active?.user) {
        clearTimeout(forceNavigateTimer);
        syncStarted.current = false;
        setSyncing(false);
        setNeedsConfirmation(true);
        return;
      }

      // Post-paywall signup must attach the Apple purchase to the newly
      // created Supabase user. `hasPremiumAccess` may only be optimistic local
      // state from Superwall before an account existed, so do not skip this.
      // Keep it bounded so StoreKit sandbox stalls never trap the spinner.
      try {
        const r = await Promise.race([
          restorePurchasesViaStoreKit(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), POST_PAYWALL_RESTORE_TIMEOUT_MS),
          ),
        ]);
        if (r.ok) optimisticGrantAccess();
      } catch {
        /* restore hung or failed — continue; refreshUserState may still reflect entitlement */
      }

      await refreshUserState().catch(() => {});

      const comp = Array.isArray(competitionDate) ? competitionDate[0] : competitionDate;
      if (comp) await updateCompetitionDate(comp).catch(() => {});
      const sportTrim = sportArg?.trim();
      if (sportTrim) await updateSport(sportTrim).catch(() => {});

      await completeOnboarding({ requireUser: true });

      if (!onboardingCompletedFiredRef.current) {
        onboardingCompletedFiredRef.current = true;
        analytics.capture('onboarding_completed', {
          step_key: 'signup',
          step_index: ONBOARDING_PROGRESS.competitionDate + 2,
          source_route: '/signup',
          post_paywall: true,
        });
      }

      await clearOnboardingProgress();
      clearTimeout(forceNavigateTimer);
      if (!forceNavigated) {
        setSetupComplete(true);
        resetToTabs();
      }
    } catch (e) {
      clearTimeout(forceNavigateTimer);
      if (forceNavigated) return; // Already in /(tabs); don't surface the error.
      syncStarted.current = false;
      setSyncing(false);
      setSetupError(e instanceof Error ? e.message : 'Could not finish setup. Please try again.');
    }
  }, [
    competitionDate,
    sportArg,
    refreshUserState,
    updateCompetitionDate,
    updateSport,
    completeOnboarding,
    resetToTabs,
    optimisticGrantAccess,
    hasPremiumAccess,
  ]);

  useEffect(() => {
    if (!isPostPaywall || !justSignedUp.current || !session || syncStarted.current) return;
    void finishPostPaywallSetup();
  }, [isPostPaywall, session, finishPostPaywallSetup]);

  const handleSignup = async () => {
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    const err = await signUp(email.trim(), password);

    if (err) {
      if (isPostPaywall && isAccountAlreadyExistsMessage(err)) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr) {
          setLoading(false);
          setError(signInErr.message);
          return;
        }
        justSignedUp.current = true;
        setLoading(false);
        syncStarted.current = false;
        void finishPostPaywallSetup();
        return;
      }
      setLoading(false);
      setError(err);
      return;
    }

    if (isPostPaywall) {
      justSignedUp.current = true;
      setSyncing(true);
      setLoading(false);
      syncStarted.current = false;
      void finishPostPaywallSetup();
      return;
    }

    setLoading(false);
    if (competitionDate) {
      const comp = Array.isArray(competitionDate) ? competitionDate[0] : competitionDate;
      if (comp) await updateCompetitionDate(comp).catch(() => {});
    }
    const sportTrim = sportArg?.trim();
    if (sportTrim) {
      await updateSport(sportTrim).catch(() => {});
    }
    setTimeout(() => {
      router.push('/(onboarding)/paywall');
    }, 300);
  };

  const handleSocial = async (
    provider: () => Promise<SocialSignInResult>,
    setBusy: (v: boolean) => void,
  ) => {
    setError('');
    setSetupError('');
    setBusy(true);
    try {
      const r = await provider();
      if (isSocialCancelled(r)) return;
      if (!r.ok) {
        const message = 'error' in r && r.error ? r.error : 'Could not sign in.';
        if (isPostPaywall) {
          setSetupError(message);
        } else {
          setError(message);
        }
        return;
      }
      if (isPostPaywall) {
        // Trigger the same post-paywall setup as the email path so the StoreKit
        // purchase is attached to the new account and we land in the app.
        justSignedUp.current = true;
        setSyncing(true);
        syncStarted.current = false;
        void finishPostPaywallSetup();
        return;
      }
      // Pre-paywall (rare path) — let RouteGuard / useSocialSignIn-style routing happen
      // via session change. Nothing else to do here.
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not sign in.';
      if (isPostPaywall) {
        setSetupError(message);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (needsConfirmation) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.successText}>
            Check your email to confirm your account, then sign in.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() =>
              router.replace({ pathname: '/(auth)' as any, params: { from: 'confirm' } })
            }
          >
            <Text style={styles.buttonText}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (syncing || setupError) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.tagline}>
            {setupError ? 'Setup needs another try' : 'Setting up your account...'}
          </Text>
          {setupError ? (
            <>
              <Text style={[styles.error, { marginTop: 8 }]}>{setupError}</Text>
              <TouchableOpacity
                style={[styles.button, { marginTop: 24 }]}
                onPress={() => {
                  setSetupError('');
                  syncStarted.current = false;
                  void finishPostPaywallSetup();
                }}
              >
                <Text style={styles.buttonText}>Try Again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 24 }} />
          )}
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Hub mode: 3 options (Google, Apple, Continue with Email) — mirrors (auth)/index.tsx
  // ---------------------------------------------------------------------------
  if (mode === 'hub') {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.tagline}>Create your account to continue</Text>

          <AuthSocialSignInButtons
            variant="hub"
            onGoogle={() => handleSocial(signInWithGoogle, setGoogleLoading)}
            onApple={() => handleSocial(signInWithApple, setAppleLoading)}
            googleLoading={googleLoading}
            appleLoading={appleLoading}
          />

          <TouchableOpacity
            style={styles.emailBtn}
            onPress={() => {
              setError('');
              setMode('email');
            }}
            activeOpacity={0.85}
            disabled={googleLoading || appleLoading}
          >
            <Text style={styles.emailBtnText}>Continue with Email</Text>
          </TouchableOpacity>

          {/* Post-paywall: no "already have an account" link — the user just paid,
              they should create the account that owns the new purchase. The legacy
              non-postPaywall path (rare) keeps the link below. */}
          {!isPostPaywall ? (
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => {
                markInAppAuthHubEntry();
                router.push({ pathname: '/(auth)' as any, params: { from: 'app' } });
              }}
            >
              <Text style={styles.linkText}>Already have an account? Sign In</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Email mode: form + back arrow returning to hub
  // ---------------------------------------------------------------------------
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable
        style={styles.backBtn}
        onPress={() => {
          setError('');
          setMode('hub');
        }}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Back to sign-up options"
      >
        <Ionicons name="chevron-back" size={28} color={colors.textSecondary} />
      </Pressable>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.tagline}>Create your account to continue</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="none"
            autoComplete="off"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="oneTimeCode"
            autoComplete="off"
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.textMuted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            textContentType="oneTimeCode"
            autoComplete="off"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {!isPostPaywall ? (
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => {
                markInAppAuthHubEntry();
                router.push({ pathname: '/(auth)' as any, params: { from: 'app' } });
              }}
            >
              <Text style={styles.linkText}>Already have an account? Sign In</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 32,
    left: spacing.md,
    padding: 4,
    zIndex: 2,
  },
  logo: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
  },
  successText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: 32,
    lineHeight: 24,
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.white,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  emailBtn: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emailBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
