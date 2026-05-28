import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';

const TOTAL_STEPS = 12;

export default function StudyBScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={2} total={TOTAL_STEPS} onBack={onPop} />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.inner, { opacity: fade, transform: [{ translateX: shellTranslateX }] }]}>
        <View style={styles.topSection}>
          <Text style={styles.body}>
            Their perceived effort was significantly higher — even though
            their bodies were equally capable.
          </Text>
          <Text style={styles.highlight}>
            The difference wasn{"'"}t physical. It was mental.
          </Text>
          <Text style={styles.body}>
            Our minds are the secret to unlocking our performance potential.
          </Text>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(onboarding)/social-proof');
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
  inner: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  topSection: { flex: 1, justifyContent: 'center' },
  body: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 30,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  highlight: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.accentLight,
    lineHeight: 32,
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
