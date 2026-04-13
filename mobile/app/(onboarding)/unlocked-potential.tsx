import { useRef, useEffect, useState } from 'react';
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
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 10;
const AUTO_SWIPE_MS = 4000;
const CARD_WIDTH = Dimensions.get('window').width - spacing.xl * 2;

const TESTIMONIALS = [
  {
    title: 'Locked in on race day',
    quote: 'I used to freeze at the start line. Relentless completely changed how I show up.',
    name: 'Marcus T.',
    detail: 'D1 Sprinter, USC',
  },
  {
    title: 'Actually built for athletes',
    quote: "The exercises here actually feel relevant to my sport and what I go through on game day.",
    name: 'Ava R.',
    detail: 'D1 Hurdler, Oregon',
  },
  {
    title: 'My coach noticed first',
    quote: "I'm calmer, more focused, and way more consistent in meets.",
    name: 'Jordan K.',
    detail: 'D1 Distance, Michigan',
  },
  {
    title: 'Skeptic turned believer',
    quote: "I was skeptical about mental training. After two weeks I PR'd.",
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

export default function UnlockedPotentialScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % TESTIMONIALS.length;
        scrollRef.current?.scrollTo({ x: next * (CARD_WIDTH + 12), animated: true });
        return next;
      });
    }, AUTO_SWIPE_MS);
    return () => clearInterval(timer);
  }, []);

  const onScroll = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + 12));
    if (idx !== activeIdx && idx >= 0 && idx < TESTIMONIALS.length) setActiveIdx(idx);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={2} total={TOTAL_STEPS} />
      <Animated.View style={[styles.inner, { opacity: fade }]}>
        {/* Top half — message */}
        <View style={styles.topHalf}>
          <Text style={styles.title}>You have untapped potential</Text>
          <Text style={styles.body}>This is exactly why we built Relentless.</Text>
          <Text style={styles.supporting}>
            We{"'"}re going to help you build a mental toughness routine you can
            actually stick to.
          </Text>
        </View>

        {/* Bottom half — reviews */}
        <View style={styles.bottomHalf}>
          <Text style={styles.reviewHeading}>Trusted by D1 Athletes</Text>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + 12}
            decelerationRate="fast"
            contentContainerStyle={styles.cardRow}
            onMomentumScrollEnd={onScroll}
          >
            {TESTIMONIALS.map((t, i) => (
              <View key={i} style={[styles.card, { width: CARD_WIDTH }]}>
                <View style={styles.cardTop}>
                  <Stars />
                  <Text style={styles.cardTitle}>{t.title}</Text>
                  <Text style={styles.quote}>{`\u201C${t.quote}\u201D`}</Text>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.name}>{t.name}</Text>
                  <Text style={styles.detail}>{t.detail}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.dots}>
            {TESTIMONIALS.map((_, i) => (
              <View key={i} style={[styles.dot, i === activeIdx && styles.dotActive]} />
            ))}
          </View>
        </View>

        {/* Button */}
        <View style={styles.btnArea}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(onboarding)/mac-question');
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
  inner: { flex: 1 },

  topHalf: {
    flex: 0.4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 36,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.accentLight,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  supporting: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },

  bottomHalf: {
    flex: 0.6,
    justifyContent: 'center',
  },
  reviewHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardRow: { paddingHorizontal: spacing.xl, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    justifyContent: 'space-between',
  },
  cardTop: {},
  stars: { flexDirection: 'row', gap: 2, marginBottom: 10 },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 8,
    lineHeight: 24,
  },
  quote: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  name: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  detail: { fontSize: 13, color: colors.textMuted },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accentLight, width: 20 },

  btnArea: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.sm },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
