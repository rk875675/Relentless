import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 6;
const AUTO_SWIPE_MS = 4000;
const CARD_WIDTH = Dimensions.get('window').width - spacing.xl * 2;

// PLACEHOLDER: Replace before production — this stat needs verification.
const TEMP_PLACEHOLDER_STAT = {
  number: '93%',
  context:
    'of athletes using structured mental training report improved competitive focus and composure.',
};

// PLACEHOLDER: Replace before production — these are temporary demo testimonials.
const TEMP_PLACEHOLDER_TESTIMONIALS = [
  {
    quote: 'Relentless completely changed how I show up on race day. I used to freeze at the start line — now I feel locked in.',
    name: 'Marcus T.',
    detail: 'D1 Sprinter, USC',
  },
  {
    quote: "I've tried meditation apps before but nothing clicked until this. The exercises actually feel relevant to my sport.",
    name: 'Ava R.',
    detail: 'D1 Hurdler, Oregon',
  },
  {
    quote: "My coach noticed the difference before I did. I'm calmer, more focused, and way more consistent in meets.",
    name: 'Jordan K.',
    detail: 'D1 Distance, Michigan',
  },
  {
    quote: "I was skeptical about mental training. After two weeks I PR'd. Coincidence? Maybe. But I'm not stopping.",
    name: 'Dani L.',
    detail: 'D1 Jumps, Florida',
  },
];

function Stars() {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name="star" size={14} color="#f59e0b" />
      ))}
    </View>
  );
}

export default function SocialProofScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % TEMP_PLACEHOLDER_TESTIMONIALS.length;
        scrollRef.current?.scrollTo({ x: next * (CARD_WIDTH + spacing.md), animated: true });
        return next;
      });
    }, AUTO_SWIPE_MS);
    return () => clearInterval(timer);
  }, []);

  const onScroll = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + spacing.md));
    if (idx !== activeIdx && idx >= 0 && idx < TEMP_PLACEHOLDER_TESTIMONIALS.length) {
      setActiveIdx(idx);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={1} total={TOTAL_STEPS} />
      <Animated.View style={[styles.inner, { opacity: fadeIn }]}>
        <View style={styles.topSection}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{TEMP_PLACEHOLDER_STAT.number}</Text>
            <Text style={styles.statContext}>{TEMP_PLACEHOLDER_STAT.context}</Text>
          </View>

          <Text style={styles.title}>Trusted by D1 Athletes</Text>

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + spacing.md}
            decelerationRate="fast"
            contentContainerStyle={styles.cardRow}
            onMomentumScrollEnd={onScroll}
          >
            {TEMP_PLACEHOLDER_TESTIMONIALS.map((t, i) => (
              <View key={i} style={[styles.card, { width: CARD_WIDTH }]}>
                <Stars />
                <Text style={styles.quote}>{`"${t.quote}"`}</Text>
                <Text style={styles.name}>{t.name}</Text>
                <Text style={styles.detail}>{t.detail}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.bottom}>
          <View style={styles.dots}>
            {TEMP_PLACEHOLDER_TESTIMONIALS.map((_, i) => (
              <View key={i} style={[styles.dot, i === activeIdx && styles.dotActive]} />
            ))}
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/(onboarding)/goals')}
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
  inner: { flex: 1, justifyContent: 'space-between' },
  topSection: { flex: 1, justifyContent: 'center', paddingTop: spacing.md },
  statCard: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  statNumber: {
    fontSize: 52,
    fontWeight: '900',
    color: colors.accentLight,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  statContext: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    marginBottom: spacing.lg,
    lineHeight: 36,
    paddingHorizontal: spacing.xl,
  },
  cardRow: { paddingHorizontal: spacing.xl, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  stars: { flexDirection: 'row', gap: 3, marginBottom: spacing.md },
  quote: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 23,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  name: { fontSize: 14, fontWeight: '700', color: colors.white },
  detail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  bottom: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.lg },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.lg,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accentLight, width: 24 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
