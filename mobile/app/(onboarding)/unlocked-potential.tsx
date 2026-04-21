import { useRef, useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
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
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';
const AUTO_SWIPE_MS = 4000;
const CARD_WIDTH = Dimensions.get('window').width - spacing.xl * 2;

const TESTIMONIALS = [
  {
    title: 'Locked in on race day',
    quote:
      'I used to freeze at the start line. Relentless changed how I show up—I actually look forward to pressure now.',
    name: 'Marcus T.',
    detail: 'D1 Sprinter, USC',
    avatarUrl: 'https://i.pravatar.cc/256?img=12',
  },
  {
    title: 'Actually built for athletes',
    quote:
      "The exercises feel relevant to my sport and game day. Quick sessions between lifts, and it feels like prep—not generic mindfulness.",
    name: 'Ava R.',
    detail: 'D1 Hurdler, Oregon',
    avatarUrl: 'https://i.pravatar.cc/256?img=45',
  },
  {
    title: 'My coach noticed first',
    quote:
      "I'm calmer, more focused, and more consistent in meets—I bounce back faster on rough training weeks.",
    name: 'Jordan K.',
    detail: 'D1 Distance, Michigan',
    avatarUrl: 'https://i.pravatar.cc/256?img=33',
  },
  {
    title: 'Skeptic turned believer',
    quote:
      "I was skeptical about mental training. After two weeks I PR'd—and I trust my process when it counts.",
    name: 'Dani L.',
    detail: 'D1 Jumps, Florida',
    avatarUrl: 'https://i.pravatar.cc/256?img=68',
  },
];

function Stars() {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name="star" size={20} color="#f59e0b" />
      ))}
    </View>
  );
}

export default function UnlockedPotentialScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

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
      <ProgressBar
        step={ONBOARDING_PROGRESS.unlockedPotential}
        total={ONBOARDING_TOTAL_STEPS}
        onBack={onPop}
      />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.inner, { opacity: fade, transform: [{ translateX: shellTranslateX }] }]}>
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
                  <Image
                    source={{ uri: t.avatarUrl }}
                    style={styles.avatar}
                    resizeMode="cover"
                  />
                  <View style={styles.cardFooterText}>
                    <Text style={styles.name}>{t.name}</Text>
                    <Text style={styles.detail}>{t.detail}</Text>
                  </View>
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
              router.push('/(onboarding)/mac-framework' as any);
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
    paddingTop: 18,
    paddingBottom: 16,
    justifyContent: 'space-between',
  },
  cardTop: {},
  stars: { flexDirection: 'row', gap: 4, marginBottom: 14 },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 12,
    lineHeight: 26,
  },
  quote: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 24,
    letterSpacing: 0.15,
    marginBottom: 14,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.border,
  },
  cardFooterText: { flex: 1, flexShrink: 1 },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: 2,
  },
  detail: { fontSize: 15, fontWeight: '500', color: colors.textMuted, lineHeight: 20 },
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
