import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 10;

const DETAIL: Record<string, { letter: string; name: string; color: string; tagline: string; body: string }> = {
  M: {
    letter: 'M',
    name: 'Mindfulness',
    color: colors.ringMindfulness,
    tagline: 'Stay present when it matters most.',
    body: 'Notice where your attention is — and choose where it goes. Instead of spiraling before competition, you learn to stay locked in on what matters right now.',
  },
  A: {
    letter: 'A',
    name: 'Acceptance',
    color: colors.ringAcceptance,
    tagline: 'Feel it. Don\u2019t fight it.',
    body: "Discomfort is part of competing. The skill isn\u2019t avoiding it — it\u2019s learning to keep going when doubt, pain, or frustration show up.",
  },
  C: {
    letter: 'C',
    name: 'Commitment',
    color: colors.ringCommitment,
    tagline: 'Know why you show up.',
    body: "Connect to the reasons you compete. When you know who you want to become, it\u2019s easier to show up — even when you don\u2019t feel like it.",
  },
};

export default function MacDetailScreen() {
  const router = useRouter();
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const fade = useRef(new Animated.Value(0)).current;
  const scaleCard = useRef(new Animated.Value(0.95)).current;

  const content = DETAIL[tag ?? ''] ?? DETAIL.M;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(scaleCard, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={4} total={TOTAL_STEPS} />
      <Animated.View style={[styles.inner, { opacity: fade }]}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
