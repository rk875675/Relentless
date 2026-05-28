import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';

const TOTAL_STEPS = 12;

const DELIVERABLES = [
  {
    icon: 'headset-outline' as const,
    title: 'Daily guided sessions',
    desc: 'Expert-led audio exercises tailored to competitive athletes.',
  },
  {
    icon: 'analytics-outline' as const,
    title: 'MAC progress tracking',
    desc: 'Watch your Mindfulness, Acceptance, and Commitment scores grow.',
  },
  {
    icon: 'person-outline' as const,
    title: 'Personalized to your sport',
    desc: 'Training that matches your challenges and competition schedule.',
  },
  {
    icon: 'time-outline' as const,
    title: 'Just 3-5 minutes a day',
    desc: 'Fits into any training schedule — no extra time commitment.',
  },
];

export default function WhatYouGetScreen() {
  const router = useRouter();
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={11} total={TOTAL_STEPS} onBack={onPop} />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.inner, { transform: [{ translateX: shellTranslateX }] }]}>
        <View style={styles.topSection}>
          <Text style={styles.title}>Your daily training</Text>
          <Text style={styles.subtitle}>
            {"Here's what you get with Relentless"}
          </Text>

          <View style={styles.items}>
            {DELIVERABLES.map((d) => (
              <View key={d.title} style={styles.row}>
                <View style={styles.iconWrap}>
                  <Ionicons name={d.icon} size={20} color={colors.accentLight} />
                </View>
                <View style={styles.textCol}>
                  <Text style={styles.rowTitle}>{d.title}</Text>
                  <Text style={styles.rowDesc}>{d.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(onboarding)/sport-selection' as any);
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
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    marginBottom: spacing.sm,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  items: { gap: 22 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, paddingTop: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: 3 },
  rowDesc: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  bottom: { paddingBottom: spacing.xl },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
