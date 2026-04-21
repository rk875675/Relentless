import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';

const TOTAL_STEPS = 12;

const COPY: Record<string, { headline: string; body: string }> = {
  M: {
    headline: 'Focus is trainable.',
    body: 'Most athletes try to lock in only when the pressure hits. This exercise helps you practice getting centered before that moment comes.',
  },
  A: {
    headline: "Resistance doesn't have to control you.",
    body: 'Pressure, doubt, and hesitation show up for everyone. This exercise is about noticing that resistance and learning how to respond better in the moment.',
  },
  C: {
    headline: 'Clarity changes how you perform.',
    body: 'When you know exactly who you want to become, it gets easier to act like that person now. This exercise is about making that future version of you more real.',
  },
};

const EXERCISE_ROUTES: Record<string, string> = {
  M: '/(onboarding)/exercise-m',
  A: '/(onboarding)/exercise-a',
  C: '/(onboarding)/exercise-c',
};

export default function MacSetupScreen() {
  const router = useRouter();
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const fade = useRef(new Animated.Value(0)).current;
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

  const content = COPY[tag ?? ''] ?? COPY.M;
  const nextRoute = EXERCISE_ROUTES[tag ?? ''] ?? EXERCISE_ROUTES.M;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={9} total={TOTAL_STEPS} onBack={onPop} />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.inner, { opacity: fade, transform: [{ translateX: shellTranslateX }] }]}>
        <View style={styles.topSection}>
          <Text style={styles.headline}>{content.headline}</Text>
          <Text style={styles.body}>{content.body}</Text>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push(nextRoute as any)}
          >
            <Text style={styles.buttonText}>Try a Quick Exercise</Text>
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
  inner: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  topSection: { flex: 1, justifyContent: 'center' },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 38,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  body: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    textAlign: 'center',
  },
  bottom: { paddingBottom: spacing.xl },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
