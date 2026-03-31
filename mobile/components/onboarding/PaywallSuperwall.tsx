import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { colors, spacing } from '@/lib/theme';
import { SUPERWALL_ONBOARDING_PLACEMENT } from '@/lib/superwall-config';

export function PaywallSuperwall() {
  const { completeOnboarding, completeOnboardingDevBypass, refreshUserState } = useAuth();
  const [busy, setBusy] = useState(false);

  const { usePlacement } = require('expo-superwall');

  const finishAfterAccess = useCallback(async () => {
    await refreshUserState();
    await completeOnboarding();
  }, [refreshUserState, completeOnboarding]);

  const { registerPlacement } = usePlacement({
    onDismiss: async (_info: any, result: any) => {
      if (result.type === 'purchased' || result.type === 'restored') {
        await finishAfterAccess();
      }
    },
    onError: (err: string) => {
      console.warn('[Superwall] placement error', err);
    },
  });

  const openPaywall = async () => {
    setBusy(true);
    try {
      await registerPlacement({
        placement: SUPERWALL_ONBOARDING_PLACEMENT,
        feature: () => {
          void finishAfterAccess();
        },
      });
    } finally {
      setBusy(false);
    }
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
          <View style={styles.dots}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={openPaywall}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.restoreButton} onPress={openPaywall} disabled={busy}>
            <Text style={styles.restoreText}>Restore purchases</Text>
          </TouchableOpacity>

          {__DEV__ && (
            <TouchableOpacity
              style={styles.devSkip}
              onPress={() => completeOnboardingDevBypass()}
            >
              <Text style={styles.devSkipText}>Skip for development</Text>
            </TouchableOpacity>
          )}
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
});
