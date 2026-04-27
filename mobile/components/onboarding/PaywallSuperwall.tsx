import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { markInAppAuthHubEntry } from '@/lib/auth-hub-entry';
import { useAuth } from '@/lib/auth-context';
import { colors, spacing } from '@/lib/theme';
import { SUPERWALL_ENABLED, SUPERWALL_ONBOARDING_PLACEMENT } from '@/lib/superwall-config';
import { SubscriptionLegalDisclosure } from '@/components/onboarding/SubscriptionLegalDisclosure';
import { restorePurchasesViaStoreKit } from '@/lib/iap-restore';
import { saveOnboardingProgress } from '@/lib/onboarding-local-state';
import { resetOnboardingStackNearPaywall } from '@/lib/reset-onboarding-stack-near-paywall';

let useSuperwall: any = () => ({ registerPlacement: async () => {} });
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
  const navigation = useNavigation();
  const { session, signOut, completeOnboarding, hasPremiumAccess, refreshUserState } = useAuth();

  const [isOpening, setIsOpening] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const lockUntil = useRef(0);

  useEffect(() => {
    saveOnboardingProgress({ sport, competitionDate });
  }, [sport, competitionDate]);

  const { registerPlacement } = useSuperwall((s: any) => ({
    registerPlacement: s.registerPlacement,
  }));

  // When entitlement flips to active (purchase or optimistic grant):
  // - Authenticated: mark onboarding complete; route guard navigates to /(tabs).
  // - Unauthenticated: navigate to signup so the user creates an account, then
  //   the signup handler syncs the purchase and completes onboarding.
  // We deliberately do NOT navigate from button presses — only from this effect —
  // so spamming Continue cannot bypass entitlement.
  const navigatedToSignup = useRef(false);
  useEffect(() => {
    if (!hasPremiumAccess) return;
    if (session) {
      completeOnboarding({ requireUser: true }).catch(() => {});
    } else if (!navigatedToSignup.current) {
      navigatedToSignup.current = true;
      router.replace({
        pathname: '/(onboarding)/signup' as any,
        params: {
          postPaywall: 'true',
          ...(sport ? { sport } : {}),
          ...(competitionDate ? { competitionDate } : {}),
        },
      });
    }
  }, [hasPremiumAccess, session, completeOnboarding, router, sport, competitionDate]);

  const acquireLock = (): boolean => {
    const now = Date.now();
    if (now < lockUntil.current) return false;
    lockUntil.current = now + PRESENTATION_LOCK_MS;
    return true;
  };

  const openPaywall = () => {
    if (hasPremiumAccess) return;
    if (!acquireLock()) return;
    setIsOpening(true);
    registerPlacement(SUPERWALL_ONBOARDING_PLACEMENT)
      .catch(() => {})
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

  const continueDisabled = isOpening || hasPremiumAccess;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerSpacer} />
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => {
            resetOnboardingStackNearPaywall(navigation, { sport });
          }}
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
