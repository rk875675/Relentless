import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { MAC_PILLAR_BY_TAG, MAC_PILLARS_ORDER } from '@/lib/mac-pillar-onboarding';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';

export default function MacFrameworkScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar
        step={ONBOARDING_PROGRESS.macFramework}
        total={ONBOARDING_TOTAL_STEPS}
        onBack={onPop}
      />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.inner, { opacity: fade, transform: [{ translateX: shellTranslateX }] }]}>
        <View style={styles.top}>
          <Text style={styles.title}>MAC</Text>
          <Text style={styles.sub}>Mindfulness, acceptance, commitment.</Text>

          <View style={styles.list}>
            {MAC_PILLARS_ORDER.map((tag) => {
              const p = MAC_PILLAR_BY_TAG[tag];
              return (
                <View
                  key={tag}
                  style={[styles.row, { borderLeftColor: p.color, borderLeftWidth: 3 }]}
                >
                  <View style={[styles.badge, { borderColor: p.color, backgroundColor: p.color + '14' }]}>
                    <Text style={[styles.letter, { color: p.color }]}>{p.letter}</Text>
                  </View>
                  <View style={styles.pillarCopy}>
                    <Text style={styles.pillarName}>{p.name}</Text>
                    <Text style={styles.pillarLine}>{p.tagline}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(onboarding)/mac-question' as any);
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  top: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: spacing.sm,
  },
  sub: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    paddingLeft: 11,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  letter: { fontSize: 15, fontWeight: '900' },
  pillarCopy: { flex: 1, minWidth: 0 },
  pillarName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 4,
  },
  pillarLine: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 20,
  },
  bottom: {
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
