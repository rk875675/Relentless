import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';

export default function MacTeaserScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.95)).current;
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    const delay = setTimeout(() => {
      Animated.parallel([
        Animated.timing(cardFade, { toValue: 1, duration: 340, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
      ]).start();
    }, 200);
    return () => clearTimeout(delay);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar
        step={ONBOARDING_PROGRESS.macTeaser}
        total={ONBOARDING_TOTAL_STEPS}
        onBack={onPop}
      />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.inner, { opacity: fade, transform: [{ translateX: shellTranslateX }] }]}>

          <View style={styles.topSpacer} />

          <View style={styles.content}>
            <Text style={styles.headline}>Here's how{'\n'}we tap into it.</Text>
            <Text style={styles.sub}>
              We use a framework called MAC — built by sport psychologists and used by elite athletes to unlock consistent mental performance.
            </Text>

            <Animated.View
              style={[styles.card, { opacity: cardFade, transform: [{ scale: cardScale }] }]}
            >
              <View style={styles.pillarsRow}>
                {[
                  { letter: 'M', label: 'Mindfulness', color: colors.ringMindfulness },
                  { letter: 'A', label: 'Acceptance', color: colors.ringAcceptance },
                  { letter: 'C', label: 'Commitment', color: colors.ringCommitment },
                ].map((p) => (
                  <View key={p.letter} style={styles.pillarItem}>
                    <View style={[styles.badge, { borderColor: p.color, backgroundColor: p.color + '18' }]}>
                      <Text style={[styles.badgeLetter, { color: p.color }]}>{p.letter}</Text>
                    </View>
                    <Text style={styles.pillarLabel}>{p.label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.cardDivider} />

              <Text style={styles.cardHint}>
                You'll discover what each pillar means — and why it matters to your game — as you train.
              </Text>
            </Animated.View>
          </View>

          <View style={styles.bottom}>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(onboarding)/onboarding-intake' as any);
              }}
            >
              <Text style={styles.buttonText}>Let's Go</Text>
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
  inner: {
    flex: 1,
    flexDirection: 'column',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },

  topSpacer: { flex: 1 },
  content: { flex: 6 },

  headline: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.white,
    lineHeight: 42,
    marginBottom: spacing.lg,
  },
  sub: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.xl,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  pillarsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  pillarItem: {
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLetter: {
    fontSize: 20,
    fontWeight: '900',
  },
  pillarLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  cardHint: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  bottom: { paddingTop: spacing.xl },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
