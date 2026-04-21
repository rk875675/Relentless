import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { getMacPillarForTag } from '@/lib/mac-pillar-onboarding';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';

export default function MacDetailScreen() {
  const router = useRouter();
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const fade = useRef(new Animated.Value(0)).current;
  const scaleCard = useRef(new Animated.Value(0.95)).current;
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

  const content = getMacPillarForTag(tag);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(scaleCard, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar
        step={ONBOARDING_PROGRESS.macDetail}
        total={ONBOARDING_TOTAL_STEPS}
        onBack={onPop}
      />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.inner, { opacity: fade, transform: [{ translateX: shellTranslateX }] }]}>
        <View style={styles.topSection}>
          {/* Glowing badge */}
          <View style={[styles.glowWrap, { shadowColor: content.color }]}>
            <View style={[styles.letterBadge, { borderColor: content.color, backgroundColor: content.color + '10' }]}>
              <Text style={[styles.letter, { color: content.color }]}>{content.letter}</Text>
            </View>
          </View>

          <Text style={styles.headline}>{content.name}</Text>

          {/* Card with accent border */}
          <Animated.View style={[styles.card, { borderColor: content.color + '40', transform: [{ scale: scaleCard }] }]}>
            <View style={[styles.accentBar, { backgroundColor: content.color }]} />
            <Text style={[styles.tagline, { color: content.color }]}>{content.tagline}</Text>
            <Text style={styles.body}>{content.body}</Text>
          </Animated.View>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(onboarding)/we-can-train' as any);
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
  topSection: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  glowWrap: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
    marginBottom: spacing.lg,
  },
  letterBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontSize: 30,
    fontWeight: '900',
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.xl,
    width: '100%',
  },
  accentBar: {
    width: 32,
    height: 3,
    borderRadius: 1.5,
    marginBottom: spacing.md,
  },
  tagline: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.md,
    lineHeight: 26,
  },
  body: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 23,
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
