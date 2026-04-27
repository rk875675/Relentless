import { useEffect, useRef, useState } from 'react';
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
import { ONBOARDING_TESTIMONIALS, ONBOARDING_TRUST_HEADLINE } from '@/lib/onboarding-testimonials';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';

const TOTAL_STEPS = 10;
const AUTO_SWIPE_MS = 4000;
const CARD_WIDTH = Dimensions.get('window').width - spacing.xl * 2;

function Stars() {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name="star" size={18} color="#f59e0b" />
      ))}
    </View>
  );
}

export default function SocialProofScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade({ swipeFromEdgeOnly: true });

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % ONBOARDING_TESTIMONIALS.length;
        scrollRef.current?.scrollTo({ x: next * (CARD_WIDTH + 12), animated: true });
        return next;
      });
    }, AUTO_SWIPE_MS);
    return () => clearInterval(timer);
  }, []);

  const onScroll = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + 12));
    if (idx !== activeIdx && idx >= 0 && idx < ONBOARDING_TESTIMONIALS.length) {
      setActiveIdx(idx);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={2} total={TOTAL_STEPS} onBack={onPop} />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.inner, { opacity: fadeIn, transform: [{ translateX: shellTranslateX }] }]}>
          <View style={styles.content}>
            <View style={styles.divider}>
              <Text style={styles.title}>{ONBOARDING_TRUST_HEADLINE}</Text>
            </View>

            <View style={styles.cardArea}>
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
                {ONBOARDING_TESTIMONIALS.map((t, i) => (
                  <View key={i} style={[styles.card, { width: CARD_WIDTH }]}>
                    <Stars />
                    <Text style={styles.quote}>{`\u201C${t.quote}\u201D`}</Text>
                    <View style={styles.cardFooter}>
                      <View style={styles.avatarWrap}>
                        <Image source={t.avatar} style={styles.avatar} resizeMode="cover" />
                      </View>
                      <View style={styles.cardFooterText}>
                        <Text style={styles.name}>{t.name}</Text>
                        <Text style={styles.detail}>{t.detail}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>

          <View style={styles.bottom}>
            <View style={styles.dots}>
              {ONBOARDING_TESTIMONIALS.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeIdx && styles.dotActive]} />
              ))}
            </View>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  inner: { flex: 1, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', marginTop: -24 },

  divider: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 28,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: spacing.sm,
  },

  cardArea: {},
  cardRow: { paddingHorizontal: spacing.xl, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  stars: { flexDirection: 'row', gap: 3, marginBottom: 14 },
  quote: {
    fontSize: 17,
    color: colors.textSecondary,
    lineHeight: 26,
    marginBottom: 40,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 56,
    height: 56,
  },
  cardFooterText: { flex: 1, flexShrink: 1 },
  name: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  detail: { fontSize: 14, color: colors.textMuted, marginTop: 2 },

  bottom: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.md },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.md,
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
