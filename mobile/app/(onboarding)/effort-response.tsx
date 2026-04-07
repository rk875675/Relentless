import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 12;

const COPY: Record<string, { headline: string; body: string }> = {
  Often: {
    headline: 'You have untapped potential.',
    body: 'Review of Relentless helping user make the most of every competition.',
  },
  Sometimes: {
    headline: "Let's close that gap.",
    body: 'Review of Relentless making an athlete more consistent in their performance.',
  },
  Rarely: {
    headline: "Let's make sure you never leave anything on the table again.",
    body: "Relentless can further strengthen your mindset so you don't choke when it means everything.",
  },
};

export default function EffortResponseScreen() {
  const router = useRouter();
  const { answer } = useLocalSearchParams<{ answer: string }>();
  const fade = useRef(new Animated.Value(0)).current;

  const content = COPY[answer ?? ''] ?? COPY.Often;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={5} total={TOTAL_STEPS} />
      <Animated.View style={[styles.inner, { opacity: fade }]}>
        <View style={styles.topSection}>
          <Text style={styles.headline}>{content.headline}</Text>
          <Text style={styles.body}>{content.body}</Text>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/(onboarding)/why-relentless')}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
