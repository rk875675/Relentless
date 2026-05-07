import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { markInAppAuthHubEntry } from '@/lib/auth-hub-entry';
import { useAuth } from '@/lib/auth-context';
import { colors, spacing } from '@/lib/theme';
import { SUPERWALL_ENABLED, SUPERWALL_ONBOARDING_PLACEMENT } from '@/lib/superwall-config';
import { SubscriptionLegalDisclosure } from '@/components/onboarding/SubscriptionLegalDisclosure';
import { restorePurchasesViaStoreKit } from '@/lib/iap-restore';
import { clearOnboardingProgress, saveOnboardingProgress } from '@/lib/onboarding-local-state';
import { subscribeTrustedPaywallPurchase } from '@/lib/trusted-paywall-purchase';

let useSuperwall: any = () => ({
  registerPlacement: async () => {},
  preloadPaywalls: async () => {},
  isConfigured: false,
});
if (SUPERWALL_ENABLED) {
  try { useSuperwall = require('expo-superwall').useSuperwall; } catch {}
}

// Lock window to defeat Continue/Restore button-spam (StoreKit + Superwall both
// tolerate a single in-flight presentation; multiple back-to-back taps can race
// the entitlement state update). Long enough to cover the time between tap and
// Superwall sheet visible, short enough to not feel broken.
const PRESENTATION_LOCK_MS = 1500;

type PaywallSuperwallProps = {
  sport?: string;
  competitionDate?: string;
};

export function PaywallSuperwall({ sport, competitionDate }: PaywallSuperwallProps) {
  const router = useRouter();
  const { session, signOut, completeOnboarding, hasPremiumAccess, refreshUserState } = useAuth();

  const [isOpening, setIsOpening] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  /**
   * Set true the moment the user taps Continue. The navigate-to-signup effect
   * below requires this — it stops a passive entitlement grant (e.g. Superwall
   * detecting an existing sandbox sub during preload) from skipping the paywall
   * and dumping the user straight into signup before they ever interacted.
   */
  const [userOpenedPaywall, setUserOpenedPaywall] = useState(false);
  const lockUntil = useRef(0);

  useEffect(() => {
    saveOnboardingProgress({ sport, competitionDate });
  }, [sport, competitionDate]);

  const { registerPlacement, preloadPaywalls, isConfigured } = useSuperwall((s: any) => ({
    registerPlacement: s.registerPlacement,
    preloadPaywalls: s.preloadPaywalls,
    isConfigured: s.isConfigured,
  }));

  // Preload the onboarding paywall whenever this screen mounts and Superwall
  // is configured. After a sign-out + reset, the SDK's cached paywall config
  // can go stale — registerPlacement then fires `triggerFire` and
  // `paywallPresentationRequest` but never `paywallOpen`, so tapping Continue
  // looks like nothing happens. Calling preloadPaywalls keeps it ready.
  useEffect(() => {
    if (!isConfigured || !preloadPaywalls) return;
    preloadPaywalls([SUPERWALL_ONBOARDING_PLACEMENT]).catch(() => {});
  }, [isConfigured, preloadPaywalls]);

  const navigatedToSignup = useRef(false);

  const navigateToSignup = () => {
    if (navigatedToSignup.current) return;
    navigatedToSignup.current = true;
    router.replace({
      pathname: '/(onboarding)/signup' as any,
      params: {
        postPaywall: 'true',
        ...(sport ? { sport } : {}),
        ...(competitionDate ? { competitionDate } : {}),
      },
    });
  };

  // Only a trusted purchase event (emitted from SuperwallInner after the Apple
  // sheet was observed) may move an unauthenticated user to signup. Raw
  // `hasPremiumAccess` / ACTIVE state is not enough because monthly sandbox
  // sticky subscriptions can emit ACTIVE without a new payment sheet.
  useEffect(() => {
    return subscribeTrustedPaywallPurchase(() => {
      if (!userOpenedPaywall) return;
      if (session) {
        completeOnboarding({ requireUser: true }).catch(() => {});
      } else {
        navigateToSignup();
      }
    });
  }, [userOpenedPaywall, session, completeOnboarding, router, sport, competitionDate]);

  // Authenticated users can still be routed by the normal local entitlement
  // state. Unauthenticated users are intentionally excluded here to prevent
  // no-payment monthly ACTIVE events from skipping the paywall.
  // Guard: if this component already sent the user to signup, do not call
  // completeOnboarding here — signup.tsx owns that step and will only call it
  // after the purchase is verified. Calling it here first would mark
  // onboarding_completed=true in the DB before entitlement is confirmed,
  // trapping the user in a paywall loop on the next cold start.
  useEffect(() => {
    if (!hasPremiumAccess) return;
    if (navigatedToSignup.current) return;
    if (session) {
      completeOnboarding({ requireUser: true }).catch(() => {});
    }
  }, [hasPremiumAccess, session, completeOnboarding]);

  const acquireLock = (): boolean => {
    const now = Date.now();
    if (now < lockUntil.current) return false;
    lockUntil.current = now + PRESENTATION_LOCK_MS;
    return true;
  };

  const openPaywall = () => {
    // Mark that the user actually tapped Continue. The navigate-to-signup
    // useEffect above keys off this so passive grants can't auto-skip.
    setUserOpenedPaywall(true);
    if (!acquireLock()) return;
    setIsOpening(true);
    registerPlacement(SUPERWALL_ONBOARDING_PLACEMENT)
      .catch((err: unknown) => {
        // Previously swallowed silently — a dropped presentation looked like a
        // frozen Continue button. Surface it so the user knows to retry.
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'Could not open the subscription options. Please try again.';
        Alert.alert('Subscription unavailable', msg, [{ text: 'OK' }]);
      })
      .finally(() => {
        setTimeout(() => setIsOpening(false), PRESENTATION_LOCK_MS);
      });
  };

  const handleRestore = () => {
    if (isRestoring || isOpening) return;
    if (!session) {
      Alert.alert(
        'Sign in to restore',
        'Restore purchases requires an existing account. Please sign in first.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => {
              markInAppAuthHubEntry();
              router.push({ pathname: '/(auth)' as any, params: { from: 'app' } });
            },
          },
        ],
      );
      return;
    }
    if (!acquireLock()) return;
    setIsRestoring(true);
    void (async () => {
      try {
        const res = await restorePurchasesViaStoreKit();
        if (res.ok) {
          await refreshUserState().catch(() => {});
        } else {
          const message =
            res.reason === 'no_purchases' || res.reason === 'no_original_tx_id'
              ? 'No active subscription was found on this Apple ID. Tap Continue to start a free trial.'
              : res.reason === 'unsupported_platform'
                ? 'Restore is only available on iOS.'
                : res.reason === 'sdk_unavailable'
                  ? 'Restore is unavailable in this build. Please try again from a release build.'
                  : 'Could not verify your purchase. Please check your connection and try again.';
          Alert.alert('Restore purchases', message);
        }
      } finally {
        setIsRestoring(false);
      }
    })();
  };

  const handleAuthPress = () => {
    if (isOpening) return;
    if (session) {
      void signOut();
      return;
    }
    markInAppAuthHubEntry();
    router.push({ pathname: '/(auth)' as any, params: { from: 'app' } });
  };

  const continueDisabled = isOpening;

  /**
   * X always returns the user to competition-date with full back history when possible.
   * Push from competition-date → router.back() pops cleanly. For replace-style entries
   * (cold start saved progress, dev "Jump to Paywall"), fall back to a fresh replace.
   * Clear the saved reachedPaywall flag so the next reload doesn't bounce them back.
   */
  const handleClose = () => {
    void clearOnboardingProgress();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({
      pathname: '/(onboarding)/competition-date' as any,
      params: sport ? { sport } : {},
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerSpacer} />
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={28} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topSection}>
          <Text style={styles.badge}>RELENTLESS PREMIUM</Text>
          <Text style={styles.title}>Unlock Relentless</Text>
          <Text style={styles.body}>
            Get full access to daily mindset training, MAC progress tracking, and tools to help you
            compete with confidence.
          </Text>
        </View>

        <View style={styles.bottomSection}>
          <SubscriptionLegalDisclosure />

          <View style={styles.dots}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
          </View>

          <TouchableOpacity
            style={[styles.button, continueDisabled && styles.buttonDisabled]}
            onPress={openPaywall}
            disabled={continueDisabled}
            activeOpacity={0.85}
          >
            {isOpening ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.footerLink}
              onPress={handleAuthPress}
              disabled={isOpening}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={session ? 'Sign out' : 'Sign in'}
            >
              <Text style={styles.footerLinkText}>{session ? 'Sign out' : 'Sign in'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.footerLink}
              onPress={handleRestore}
              disabled={isRestoring || isOpening}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Restore purchases"
            >
              {isRestoring ? (
                <ActivityIndicator color={colors.textMuted} />
              ) : (
                <Text style={styles.footerLinkText}>Restore purchases</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 4,
  },
  headerSpacer: { flex: 1 },
  closeBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  topSection: { paddingTop: spacing.lg },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    marginBottom: spacing.md,
    lineHeight: 36,
  },
  body: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  bottomSection: { marginTop: spacing.xl },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.lg,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accentLight, width: 24 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  footerRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  footerLink: {
    paddingVertical: 4,
    minWidth: 100,
    alignItems: 'center',
  },
  footerLinkText: { color: colors.textMuted, fontSize: 14 },
});
