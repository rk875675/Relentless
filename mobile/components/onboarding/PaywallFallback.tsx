import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { markInAppAuthHubEntry } from '@/lib/auth-hub-entry';
import { useAuth } from '@/lib/auth-context';
import { colors, spacing } from '@/lib/theme';
import { SubscriptionLegalDisclosure } from '@/components/onboarding/SubscriptionLegalDisclosure';
import { clearOnboardingProgress, saveOnboardingProgress } from '@/lib/onboarding-local-state';

const isExpoGo = Constants.appOwnership === 'expo';

type PaywallFallbackProps = {
  sport?: string;
  competitionDate?: string;
};

/** Used when Superwall is not configured (e.g. web or missing EXPO_PUBLIC_SUPERWALL_IOS_API_KEY). */
export function PaywallFallback({ sport, competitionDate }: PaywallFallbackProps) {
  const router = useRouter();
  const { session, signOut } = useAuth();

  useEffect(() => {
    saveOnboardingProgress({ sport, competitionDate });
  }, [sport, competitionDate]);

  const buildNote = () => {
    if (isExpoGo) {
      return 'You are in Expo Go, which does not include the native Superwall module. In-app purchases are not available here. Use a development build (expo run:ios or EAS) to test the real paywall.';
    }
    if (__DEV__) {
      return 'In-app purchases need a native build with Superwall. For local dev, set EXPO_PUBLIC_SUPERWALL_IOS_API_KEY in mobile/.env and run a dev client (not Expo Go).';
    }
    return 'Subscriptions are not available in this build.';
  };

  const handleAuthPress = () => {
    if (session) {
      void signOut();
      return;
    }
    markInAppAuthHubEntry();
    router.push({ pathname: '/(auth)' as any, params: { from: 'app' } });
  };

  /** X always returns the user to competition-date. See PaywallSuperwall.handleClose. */
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
          <Text style={styles.note}>{buildNote()}</Text>
        </View>

        <View style={styles.bottomSection}>
          <SubscriptionLegalDisclosure purchaseUnavailable />

          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.footerLink}
              onPress={handleAuthPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={session ? 'Sign out' : 'Sign in'}
            >
              <Text style={styles.footerLinkText}>{session ? 'Sign out' : 'Sign in'}</Text>
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
  note: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  bottomSection: { marginTop: spacing.xl },
  footerRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
  },
  footerLink: {
    paddingVertical: 4,
    minWidth: 100,
    alignItems: 'center',
  },
  footerLinkText: { color: colors.textMuted, fontSize: 14 },
});
