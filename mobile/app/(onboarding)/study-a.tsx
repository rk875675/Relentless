import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 12;

export default function StudyAScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={1} total={TOTAL_STEPS} />
      <Animated.View style={[styles.inner, { opacity: fade }]}>
        <View style={styles.topSection}>
          <View style={styles.setupBlock}>
            <Text style={styles.setup}>
              In 2009, researchers split cyclists into two groups.
            </Text>
            <Text style={styles.setup}>
              One did mentally draining tasks. The other relaxed.
            </Text>
            <Text style={styles.setup}>
              Then both did the same endurance test.
            </Text>
          </View>

          <View style={styles.separator} />

          <Text style={styles.highlight}>
            The relaxed group lasted 15% longer — despite identical physical
            capacity.
          </Text>

          <Text style={styles.kicker}>So... why?</Text>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/(onboarding)/study-b')}
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
  setupBlock: { marginBottom: spacing.sm },
  setup: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 27,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  separator: {
    width: 40,
    height: 2,
    backgroundColor: colors.accent,
    alignSelf: 'center',
    marginVertical: spacing.lg,
    borderRadius: 1,
  },
  highlight: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 32,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  kicker: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accentLight,
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
