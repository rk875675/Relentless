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
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthSocialSignInButtons } from '@/components/auth/AuthSocialSignInButtons';
import { markInAppAuthHubEntry } from '@/lib/auth-hub-entry';
import { useAuth, type SocialSignInResult } from '@/lib/auth-context';
import { analytics } from '@/lib/analytics';
import { bustCache } from '@/lib/api-cache';
import { fetchJwsForTransaction, restorePurchasesViaStoreKit } from '@/lib/iap-restore';
import { clearOnboardingProgress } from '@/lib/onboarding-local-state';
import { ONBOARDING_PROGRESS } from '@/lib/onboarding-progress';
import { syncSubscriptionWithBackend } from '@/lib/purchases-sync';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';
import { getLastTrustedPaywallPurchase } from '@/lib/trusted-paywall-purchase';

/**
 * Per-attempt timeout for a single call to the backend (syncSubscriptionWithBackend
 * or restorePurchasesViaStoreKit). Must be long enough for the server's own Apple
 * retry loop to complete: the /purchases/restore edge function retries the Apple
 * Sandbox Server API up to 3 times with 3 s gaps (~11-14 s total server time).
 * The previous value of 8 s cut off the server mid-retry; 15 s lets the full
 * server cycle finish on the very first client attempt.
 */
const POST_PAYWALL_RESTORE_TIMEOUT_MS = 15_000;

/**
 * Hard ceiling on the entire post-paywall sync. Budget breakdown (worst case):
 *   • 5 s AUTHENTICATED_SETTLE_MS (authenticated path only — spinner already showing)
 *   • 15 s first sync attempt (server retries Apple up to 3× internally)
 *   • 2 s settle before restorePurchasesViaStoreKit
 *   • 15 s second sync attempt via StoreKit (Apple indexed by now)
 *   • 4 s retry delay + 6 s final attempt (only if StoreKit path also fails)
 * Total: 5 + 15 + 2 + 15 = 37 s typical; 47 s absolute worst case.
 * Set to 40 s so the second StoreKit attempt always completes before the hard cap.
 */
const POST_PAYWALL_TOTAL_TIMEOUT_MS = 40_000;

/**
 * Settle delay before the first sync attempt for authenticated users who
 * auto-start the post-paywall setup without a natural form-filling pause.
 * Apple's sandbox Server API can take several seconds to index a brand-new
 * transaction; this window lets it catch up before the first verify call.
 * POST_PAYWALL_TOTAL_TIMEOUT_MS is raised by the same amount so the effective
 * sync window (35 s) stays proportional.
 */
const AUTHENTICATED_SETTLE_MS = 5_000;

const LOADING_PHRASES = [
  'Setting up your account...',
  'Preparing your training plan...',
  'Loading your dashboard...',
  'Almost there...',
  'Getting everything ready...',
];

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
  const navigation = useNavigation();
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
  const setupNavigationStarted = useRef(false);
  const setupNavigationRetry = useRef<ReturnType<typeof setInterval> | null>(null);
  const entitlementVerifiedRef = useRef(false);
  /** Prevents the already-authenticated auto-start effect from firing more than once. */
  const didAutoStartSetup = useRef(false);
  const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);

  useEffect(() => {
    if (!syncing || setupError) return;
    const t = setInterval(() => setLoadingPhraseIdx((i) => (i + 1) % LOADING_PHRASES.length), 2500);
    return () => clearInterval(t);
  }, [syncing, setupError]);

  useEffect(() => {
    if (!isPostPaywall || !syncing || setupComplete || setupError) return;
    const timer = setTimeout(() => {
      if (entitlementVerifiedRef.current) {
        setSetupComplete(true);
        return;
      }
      syncStarted.current = false;
      setSyncing(false);
      setSetupError('We could not verify your subscription yet. Please try again.');
    }, POST_PAYWALL_TOTAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isPostPaywall, syncing, setupComplete, setupError]);

  const navigateToTabsWithRetries = useCallback(() => {
    if (setupNavigationStarted.current) return;
    setupNavigationStarted.current = true;
    bustCache();

    // Full navigation reset instead of router.replace — after OAuth deep link
    // return (Google/Apple sign-in), router.replace silently fails because
    // expo-router's navigation context is corrupted by the deep link handler.
    // CommonActions.reset clears the entire stack reliably.
    const root = navigation.getParent() ?? navigation;
    const resetAction = CommonActions.reset({
      index: 0,
      routes: [{ name: '(tabs)' }],
    });

    let attempts = 0;
    const go = () => {
      attempts += 1;
      try {
        root.dispatch(resetAction);
      } catch {
        router.replace('/(tabs)' as any);
      }
    };
    go();
    const retry = setInterval(() => {
      if (attempts >= 5) {
        clearInterval(retry);
        if (setupNavigationRetry.current === retry) setupNavigationRetry.current = null;
        return;
      }
      go();
    }, 1000);
    setupNavigationRetry.current = retry;
  }, [router, navigation]);

  useEffect(() => {
    if (!setupComplete) return;
    navigateToTabsWithRetries();
  }, [setupComplete, navigateToTabsWithRetries]);

  useEffect(() => {
    return () => {
      if (setupNavigationRetry.current) clearInterval(setupNavigationRetry.current);
    };
  }, []);

  const finishSetupNavigation = useCallback(() => {
    navigateToTabsWithRetries();
    setSetupComplete(true);
  }, [navigateToTabsWithRetries]);

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
    entitlementVerifiedRef.current = false;
    setSyncing(true);
    setLoading(false);
    setError('');
    setSetupError('');

    let forceNavigated = false;
    const forceNavigateTimer = setTimeout(() => {
      if (syncStarted.current && !forceNavigated) {
        if (!entitlementVerifiedRef.current) {
          syncStarted.current = false;
          setSyncing(false);
          setSetupError('We could not verify your subscription yet. Please try again.');
          return;
        }
        forceNavigated = true;
        // Drop the user into the app even if Supabase writes are still pending.
        // State-driven navigation is more reliable from this nested signup flow.
        finishSetupNavigation();
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

      // Prefer the transaction Superwall saw before signup. This matches the
      // Google path's timing better and avoids relying only on sandbox restore.
      const trustedPurchase = getLastTrustedPaywallPurchase();
      let oid = trustedPurchase?.originalTransactionId;
      let signedTx = trustedPurchase?.signedTransactionInfo;

      // If Superwall didn't provide the JWS (common in sandbox), fetch it from
      // StoreKit before the first sync so we don't burn 15 s on a doomed
      // Apple-API-only attempt that will 404.
      if (!signedTx) {
        try {
          const jwsResult = await fetchJwsForTransaction(oid);
          if (jwsResult) {
            signedTx = jwsResult.signedTransactionInfo;
            if (!oid) oid = jwsResult.originalTransactionId;
            if (__DEV__) console.log('[signup][jwsFetched]', { oid: Boolean(oid), jws: Boolean(signedTx) });
          }
        } catch { /* degrade gracefully */ }
      }

      let purchaseSynced = false;
      let purchaseSyncError: string | null = null;
      /** True when StoreKit found a purchase but the backend sync still failed — a retry is warranted. */
      let storeKitFoundPurchase = false;
      if (oid) {
        try {
          const sync = await Promise.race([
            syncSubscriptionWithBackend(oid, signedTx || undefined),
            new Promise<{ ok: false; error: string }>((resolve) =>
              setTimeout(() => resolve({ ok: false, error: 'timeout' }), POST_PAYWALL_RESTORE_TIMEOUT_MS),
            ),
          ]);
          if (sync.ok) {
            purchaseSynced = true;
            entitlementVerifiedRef.current = true;
            optimisticGrantAccess();
          } else {
            purchaseSyncError = sync.error ?? 'Purchase could not be verified.';
            if (__DEV__) console.log('[signup][purchaseSyncFailed]', sync.error);
          }
        } catch {
          /* fall through to StoreKit restore */
        }
      } else if (__DEV__) {
        console.log('[signup][purchaseSyncSkipped]', 'missing original transaction id');
      }

      // Post-paywall signup must attach the Apple purchase to the newly
      // created Supabase user. Keep it bounded so StoreKit sandbox stalls never
      // trap the spinner.
      if (!purchaseSynced) {
        // Settle delay: Apple Sign In's native authentication sheet can briefly
        // leave StoreKit in a state where getAvailablePurchases() returns empty.
        // Waiting here also gives the Apple Server API a moment to index a
        // brand-new sandbox transaction before we query it.
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const r = await Promise.race([
            restorePurchasesViaStoreKit(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), POST_PAYWALL_RESTORE_TIMEOUT_MS),
            ),
          ]);
          if (r.ok) {
            purchaseSynced = true;
            entitlementVerifiedRef.current = true;
            optimisticGrantAccess();
          } else {
            // sync_failed means StoreKit found a purchase with a real Apple
            // transaction id but the backend verification call failed — the
            // Apple Server API may not have indexed the new transaction yet.
            storeKitFoundPurchase = r.reason === 'sync_failed';
            purchaseSyncError = r.error ?? r.reason;
            if (__DEV__) console.log('[signup][restorePurchasesFailed]', r.reason, r.error ?? '');
          }
        } catch (e) {
          purchaseSyncError = e instanceof Error ? e.message : 'Purchase restore failed.';
        }
      }

      // Last-chance retry: if StoreKit found a purchase but the Apple Server
      // API returned an error (sync_failed), wait a further 4 s and try the
      // backend sync one more time. The sandbox API is often ready by then.
      if (!purchaseSynced && storeKitFoundPurchase) {
        if (__DEV__) console.log('[signup][retryingSync]', 'waiting 4s for Apple API to index transaction');
        await new Promise((r) => setTimeout(r, 4000));
        // Try restorePurchasesViaStoreKit one final time — StoreKit gives us
        // the authoritative numeric originalTransactionIdentifierIOS and by
        // now the Apple Server API should have the new transaction indexed.
        try {
          const r2 = await Promise.race([
            restorePurchasesViaStoreKit(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 6_000),
            ),
          ]);
          if (r2.ok) {
            purchaseSynced = true;
            entitlementVerifiedRef.current = true;
            optimisticGrantAccess();
          } else {
            purchaseSyncError = r2.error ?? r2.reason;
          }
        } catch (e) {
          purchaseSyncError = e instanceof Error ? e.message : 'Purchase restore failed.';
        }
      }

      if (!purchaseSynced) {
        throw new Error(
          purchaseSyncError
            ? `We could not verify your subscription: ${purchaseSyncError}`
            : 'We could not verify your subscription yet. Please try again.',
        );
      }

      // Complete onboarding first (triggers the navPhase key change in
      // _layout.tsx that remounts the Stack). Bounded to 3 s so a stalled
      // query doesn't trap the spinner. refreshUserState is fire-and-forget
      // because it can stall after OAuth code exchange.
      bustCache();
      await Promise.race([
        completeOnboarding({ requireUser: true }),
        new Promise<void>((r) => setTimeout(r, 3_000)),
      ]).catch(() => {});

      clearTimeout(forceNavigateTimer);
      if (!forceNavigated) {
        finishSetupNavigation();
      }

      const comp = Array.isArray(competitionDate) ? competitionDate[0] : competitionDate;
      if (comp) updateCompetitionDate(comp).catch(() => {});
      const sportTrim = sportArg?.trim();
      if (sportTrim) updateSport(sportTrim).catch(() => {});
      refreshUserState().catch(() => {});
      clearOnboardingProgress().catch(() => {});

      if (!onboardingCompletedFiredRef.current) {
        onboardingCompletedFiredRef.current = true;
        analytics.capture('onboarding_completed', {
          step_key: 'signup',
          step_index: ONBOARDING_PROGRESS.competitionDate + 2,
          source_route: '/signup',
          post_paywall: true,
        });
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
    optimisticGrantAccess,
    hasPremiumAccess,
    finishSetupNavigation,
  ]);

  useEffect(() => {
    if (!isPostPaywall || !justSignedUp.current || !session || syncStarted.current) return;
    void finishPostPaywallSetup();
  }, [isPostPaywall, session, finishPostPaywallSetup]);

  // Auto-trigger for users who are already authenticated when they arrive here
  // with isPostPaywall=true. This handles the path where a signed-in user
  // purchased on the paywall and was routed to signup.tsx via the trusted
  // purchase event (instead of calling completeOnboarding() immediately).
  //
  // We show the spinner immediately (setSyncing) but delay the actual first
  // sync attempt by AUTHENTICATED_SETTLE_MS to give Apple's Server API time
  // to index the brand-new transaction. Unauthenticated users naturally spend
  // time filling out the signup form, so they don't need this delay.
  // POST_PAYWALL_TOTAL_TIMEOUT_MS is raised by the same amount so the
  // effective sync window (22 s) stays the same.
  useEffect(() => {
    if (!isPostPaywall || !session || didAutoStartSetup.current || syncStarted.current) return;
    didAutoStartSetup.current = true;
    setSyncing(true);
    const settleTimer = setTimeout(() => {
      justSignedUp.current = true;
      void finishPostPaywallSetup();
    }, AUTHENTICATED_SETTLE_MS);
    return () => clearTimeout(settleTimer);
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

  if (syncing || setupError || (isPostPaywall && syncStarted.current)) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.tagline}>
            {setupError ? 'Setup needs another try' : LOADING_PHRASES[loadingPhraseIdx]}
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
