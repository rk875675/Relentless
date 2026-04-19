import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { colors, spacing } from '@/lib/theme';
import { SUPERWALL_ENABLED, SUPERWALL_ONBOARDING_PLACEMENT } from '@/lib/superwall-config';

let useSuperwall: any = () => ({ registerPlacement: async () => {} });
if (SUPERWALL_ENABLED) {
  try { useSuperwall = require('expo-superwall').useSuperwall; } catch {}
}

export function PaywallSuperwall() {
  const {
    completeOnboarding,
    completeOnboardingDevBypass,
    hasPremiumAccess,
    isDevAccount,
    signOut,
  } = useAuth();
  // #region agent log — visible on-screen debug (temporary)
  const [dbg, setDbg] = useState('idle');
  // #endregion

  const { registerPlacement } = useSuperwall((s: any) => ({
    registerPlacement: s.registerPlacement,
  }));

  // When SuperwallPurchaseSync flips hasPremiumAccess → complete onboarding.
  // The RouteGuard will then navigate to /(tabs).
  useEffect(() => {
    if (hasPremiumAccess) {
      setDbg('access-granted');
      completeOnboarding().catch(() => {});
    }
  }, [hasPremiumAccess, completeOnboarding]);

  // No usePlacement, no useSuperwallEvents, no busy state.
  // Fire-and-forget — the native promise only resolves on purchase/skip,
  // but we don't care; SuperwallPurchaseSync handles the subscription change
  // and the RouteGuard handles navigation.
  const openPaywall = () => {
    setDbg('opening');
    registerPlacement(SUPERWALL_ONBOARDING_PLACEMENT).catch(() => {
      setDbg('error');
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.topSection}>
          <Text style={styles.badge}>RELENTLESS PREMIUM</Text>
          <Text style={styles.title}>Unlock Relentless</Text>
          <Text style={styles.body}>
            Get full access to daily mindset training, MAC progress tracking, and tools to help you
            compete with confidence.
          </Text>
        </View>

        <View style={styles.bottomSection}>
          {/* Temporary visible debug line */}
          <Text style={styles.debugLine}>
            {`${dbg} | access=${hasPremiumAccess}`}
          </Text>

          <View style={styles.dots}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
          </View>

          <TouchableOpacity style={styles.button} onPress={openPaywall}>
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.restoreButton} onPress={openPaywall}>
            <Text style={styles.restoreText}>Restore purchases</Text>
          </TouchableOpacity>

          {(__DEV__ || isDevAccount) && (
            <TouchableOpacity
              style={styles.devSkip}
              onPress={() => completeOnboardingDevBypass()}
            >
              <Text style={styles.devSkipText}>Skip for development</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  topSection: { flex: 1, justifyContent: 'center' },
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
  debugLine: { color: '#555', fontSize: 10, textAlign: 'center', marginBottom: 8 },
  bottomSection: { paddingBottom: spacing.xl },
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
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  restoreButton: { marginTop: spacing.md, alignItems: 'center' },
  restoreText: { color: colors.textMuted, fontSize: 14 },
  devSkip: { marginTop: spacing.lg, alignItems: 'center' },
  devSkipText: { color: colors.textMuted, fontSize: 12 },
  signOutButton: { marginTop: spacing.md, alignItems: 'center' },
  signOutText: { color: colors.textMuted, fontSize: 12 },
});
