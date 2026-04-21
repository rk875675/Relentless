import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';

const RELENTLESS_LINE =
  'Structured mental skills training for athletes: daily guided lessons built by professional sports psychologists using MAC principles.';

export default function RelentlessIntroScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar
        step={ONBOARDING_PROGRESS.relentlessIntro}
        total={ONBOARDING_TOTAL_STEPS}
        onBack={onPop}
      />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.flex, { opacity: fade, transform: [{ translateX: shellTranslateX }] }]}>
        <View style={styles.main}>
          <View style={styles.top}>
            <Text style={styles.screenTitle}>Relentless is</Text>
            <Text style={styles.lead}>{RELENTLESS_LINE}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.cardEyebrow}>Research</Text>
            <Text style={styles.statNumber}>~23%</Text>
            <Text style={styles.statBody}>
              improvement in performance through mental visualization — with no extra physical training.
            </Text>
            <Text style={styles.attribution}>— University of Chicago</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(onboarding)/onboarding-intake' as any);
            }}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  main: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    justifyContent: 'space-between',
  },
  top: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: spacing.xl,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.white,
    marginBottom: spacing.md,
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  lead: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 28,
    letterSpacing: -0.1,
  },
  statCard: {
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    opacity: 0.8,
  },
  statNumber: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.accentLight,
    letterSpacing: -1.5,
    lineHeight: 48,
    marginBottom: spacing.sm,
  },
  statBody: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
  attribution: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 17, fontWeight: '700' },
});
