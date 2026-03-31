import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { colors, spacing } from '@/lib/theme';

/** Used when Superwall is not configured (e.g. web or missing EXPO_PUBLIC_SUPERWALL_IOS_API_KEY). */
export function PaywallFallback() {
  const { completeOnboardingDevBypass, signOut } = useAuth();

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
          <Text style={styles.note}>
            In-app purchases require a native build with Superwall configured. Set
            EXPO_PUBLIC_SUPERWALL_IOS_API_KEY in your environment for iOS.
          </Text>
        </View>

        <View style={styles.bottomSection}>
          {__DEV__ ? (
            <TouchableOpacity
              style={styles.devSkip}
              onPress={() => completeOnboardingDevBypass()}
            >
              <Text style={styles.devSkipText}>Skip for development</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.devSkip} onPress={signOut}>
              <Text style={styles.devSkipText}>Sign out</Text>
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
  note: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  bottomSection: { paddingBottom: spacing.xl },
  devSkip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  devSkipText: { color: colors.textMuted, fontSize: 14 },
});
