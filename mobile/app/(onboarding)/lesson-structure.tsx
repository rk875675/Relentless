import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';
import { trackOnboardingButtonClicked } from '@/lib/onboarding-analytics';

export default function LessonStructureScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.94)).current;
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    const delay = setTimeout(() => {
      Animated.parallel([
        Animated.timing(cardFade, { toValue: 1, duration: 340, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
      ]).start();
    }, 160);
    return () => clearTimeout(delay);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar
        step={ONBOARDING_PROGRESS.lessonStructure}
        total={ONBOARDING_TOTAL_STEPS}
        onBack={onPop}
      />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.inner, { opacity: fade, transform: [{ translateX: shellTranslateX }] }]}>

          <View style={styles.topSpacer} />

          <View style={styles.contentGroup}>
            <View style={styles.headlineCluster}>
              <Text style={styles.headline}>Here is how our{'\n'}lessons are structured.</Text>
              <Text style={styles.subheadline}>
                With real mental performance coaches.
              </Text>
            </View>

            <Animated.View
              style={[styles.card, { opacity: cardFade, transform: [{ scale: cardScale }] }]}
            >
              <View style={styles.featureRow}>
                <View style={[styles.iconCircle, { backgroundColor: colors.accent + '18', borderColor: colors.accent }]}>
                  <Ionicons name="headset" size={20} color={colors.accent} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>Coach-led audio</Text>
                  <Text style={styles.featureBody}>Lessons recorded by real mental performance coaches</Text>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.featureRow}>
                <View style={[styles.iconCircle, { backgroundColor: colors.ringMindfulness + '18', borderColor: colors.ringMindfulness }]}>
                  <Ionicons name="fitness" size={20} color={colors.ringMindfulness} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>Interactive exercises</Text>
                  <Text style={styles.featureBody}>Hands-on mental skills practice, not just theory</Text>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.featureRow}>
                <View style={[styles.iconCircle, { backgroundColor: colors.ringCommitment + '18', borderColor: colors.ringCommitment }]}>
                  <Ionicons name="journal" size={20} color={colors.ringCommitment} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>Personal journal</Text>
                  <Text style={styles.featureBody}>Guided by real coach prompts</Text>
                </View>
              </View>
            </Animated.View>
          </View>

          <View style={styles.bottom}>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                trackOnboardingButtonClicked({
                  step_key: 'lesson_structure',
                  step_index: ONBOARDING_PROGRESS.lessonStructure,
                  button_key: 'continue',
                });
                router.push('/(onboarding)/grant-intro' as any);
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
  inner: {
    flex: 1,
    flexDirection: 'column',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },

  topSpacer: { flex: 1 },
  contentGroup: { flex: 6 },

  headlineCluster: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 40,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subheadline: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: 0,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 3,
  },
  featureBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
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
