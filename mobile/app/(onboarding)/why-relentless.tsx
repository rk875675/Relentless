import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 12;

export default function WhyRelentlessScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={6} total={TOTAL_STEPS} />
      <Animated.View style={[styles.inner, { opacity: fade }]}>
        <View style={styles.topSection}>
          <Text style={styles.body}>Most athletes understand this.</Text>
          <Text style={styles.body}>Many have felt it.</Text>
          <Text style={styles.bodySpaced}>
            They know they have more to give, but don{"'"}t know how to access it.
          </Text>
          <Text style={styles.highlight}>Which is why we built Relentless.</Text>
          <Text style={styles.body}>
            We spend hours training our bodies, why not a few minutes for our
            minds?
          </Text>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/(onboarding)/how-it-works')}
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
  body: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 30,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  bodySpaced: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 30,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  highlight: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.accentLight,
    lineHeight: 34,
    textAlign: 'center',
    marginBottom: spacing.lg,
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
