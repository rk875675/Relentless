import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';

const BULLETS = [
  'Daily 3–5 min mental skills sessions',
  'Built by professional sport psychologists',
] as const;

export default function RelentlessIntroScreen() {
  const router = useRouter();

  const headlineFade = useRef(new Animated.Value(0)).current;
  const headlineY = useRef(new Animated.Value(12)).current;
  const bulletFades = BULLETS.map(() => useRef(new Animated.Value(0)).current);
  const bulletYs = BULLETS.map(() => useRef(new Animated.Value(10)).current);
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardY = useRef(new Animated.Value(10)).current;

  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

  useEffect(() => {
    // Headline
    Animated.parallel([
      Animated.timing(headlineFade, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(headlineY, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();

    // Bullets staggered
    bulletFades.forEach((fade, i) => {
      const delay = 220 + i * 110;
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(fade, { toValue: 1, duration: 360, useNativeDriver: true }),
          Animated.timing(bulletYs[i]!, { toValue: 0, duration: 360, useNativeDriver: true }),
        ]).start();
      }, delay);
    });

    // Stat card
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(cardFade, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(cardY, { toValue: 0, duration: 380, useNativeDriver: true }),
      ]).start();
    }, 560);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar
        step={ONBOARDING_PROGRESS.relentlessIntro}
        total={ONBOARDING_TOTAL_STEPS}
        onBack={onPop}
      />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.flex, { opacity: headlineFade, transform: [{ translateX: shellTranslateX }] }]}>

          <View style={styles.main}>
            {/* Headline */}
            <Animated.View style={{ transform: [{ translateY: headlineY }] }}>
              <Text style={styles.headline}>Train your mind.</Text>
              <Text style={styles.headlineDim}>Perform at your best.</Text>
            </Animated.View>

            {/* Bullets */}
            <View style={styles.bullets}>
              {BULLETS.map((text, i) => (
                <Animated.View
                  key={text}
                  style={[
                    styles.bulletRow,
                    { opacity: bulletFades[i], transform: [{ translateY: bulletYs[i]! }] },
                  ]}
                >
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{text}</Text>
                </Animated.View>
              ))}
            </View>

            {/* Stat card */}
            <Animated.View
              style={[styles.statCard, { opacity: cardFade, transform: [{ translateY: cardY }] }]}
            >
              <Text style={styles.cardEyebrow}>Research</Text>
              <Text style={styles.statNumber}>~23%</Text>
              <Text style={styles.statBody}>
                improvement in performance through mental training — with no extra physical work.
              </Text>
              <View style={styles.attributionRow}>
                <View style={styles.attributionLine} />
                <Text style={styles.attribution}>University of Chicago</Text>
              </View>
            </Animated.View>
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
    paddingTop: spacing.xl,
    justifyContent: 'center',
    gap: spacing.xl,
  },

  // Headline
  headline: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -1,
    lineHeight: 46,
  },
  headlineDim: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: -1,
    lineHeight: 46,
  },

  // Bullets
  bullets: {
    gap: spacing.md,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.accent,
    flexShrink: 0,
  },
  bulletText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 22,
    flex: 1,
  },

  // Stat card
  statCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.md + 2,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  statNumber: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -1.5,
    lineHeight: 42,
    marginBottom: 4,
  },
  statBody: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  attributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attributionLine: {
    width: 16,
    height: 1,
    backgroundColor: colors.textMuted,
  },
  attribution: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    fontStyle: 'italic',
  },

  // Footer
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 17, fontWeight: '700' },
});
