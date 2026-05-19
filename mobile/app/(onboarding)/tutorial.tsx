import { useRef, useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgressRing, ScoreDelta } from '@/components/ProgressRing';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { colors, spacing } from '@/lib/theme';
const SCREEN_W = Dimensions.get('window').width;

// Tooltip visual constants — distinct from the mock UI surfaces
const TOOLTIP_BG = '#160e24';
const TOOLTIP_BG_DECAY = '#1a0808';
const TOOLTIP_BORDER = 'rgba(139,92,246,0.60)';
const TOOLTIP_BORDER_DECAY = 'rgba(239,68,68,0.58)';

const INNER_W = SCREEN_W - 32;
const CARET_OFFSETS = {
  left: INNER_W * 0.14,
  center: INNER_W * 0.45,
};

const SWIPE_THRESHOLD = 50;

type TooltipContent = { title: string; body: string };

type RingValues = { m: number; a: number; c: number; decay?: boolean };

type TutorialStep = {
  tab: 'home' | 'library';
  variant: 'rings' | 'wod' | 'library';
  rings: RingValues;
  streak: number;
  tooltip: TooltipContent;
  progressStep: number;
  caretPosition: 'left' | 'center';
  tooltipNudgeY?: number;
  pinToBottom?: boolean;
};

const STEPS: TutorialStep[] = [
  {
    tab: 'home',
    variant: 'rings',
    rings: { m: 20, a: 20, c: 20 },
    streak: 0,
    tooltip: {
      title: 'YOUR MAC RINGS',
      body: 'You just earned +20 in each ring from your first workout. Train every day to keep filling them up.',
    },
    progressStep: 16,
    caretPosition: 'center',
    tooltipNudgeY: -166,
  },
  {
    tab: 'home',
    variant: 'wod',
    rings: { m: 20, a: 20, c: 20 },
    streak: 0,
    tooltip: {
      title: "GRANT'S DAILY WOD",
      body: "A new session from Grant every day. 3–5 minutes — show up, do the work.",
    },
    progressStep: 17,
    caretPosition: 'center',
  },
  {
    tab: 'library',
    variant: 'library',
    rings: { m: 20, a: 20, c: 20 },
    streak: 0,
    tooltip: {
      title: 'THE RELENTLESS LIBRARY',
      body: 'For days you want to go deeper — extra sessions organized by pillar, available anytime.',
    },
    progressStep: 18,
    caretPosition: 'center',
    tooltipNudgeY: -10,
  },
];

// VAULTED steps — can be restored above if the tutorial is expanded.
// { tab: 'home', variant: 'decay', progressStep: 18,
//   tooltip: { title: 'STAY CONSISTENT', body: 'Miss a day and every ring drops.' } },
// { tab: 'library', variant: 'overview', progressStep: 19, ... }
// { tab: 'library', variant: 'category', progressStep: 20, ... }
// { tab: 'profile', variant: 'stats', progressStep: 21, ... }

function MockTabBar({ active, onSwitch }: { active: string; onSwitch: (t: string) => void }) {
  const tabs = [
    { id: 'library', label: 'Library', outline: 'book-outline' as const, filled: 'book' as const },
    { id: 'home', label: 'Home', outline: 'home-outline' as const, filled: 'home' as const },
    { id: 'profile', label: 'Profile', outline: 'person-outline' as const, filled: 'person' as const },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((t) => (
        <TouchableOpacity key={t.id} style={styles.tabItem} onPress={() => onSwitch(t.id)}>
          <View style={[styles.tabIconWrap, active === t.id && styles.tabIconWrapActive]}>
            <Ionicons
              name={active === t.id ? t.filled : t.outline}
              size={20}
              color={active === t.id ? colors.accentLight : colors.textMuted}
            />
          </View>
          <Text style={[styles.tabLabel, active === t.id && { color: colors.accentLight }]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

type RingDeltas = { m?: ScoreDelta; a?: ScoreDelta; c?: ScoreDelta };

function RingsRow({ rings, deltas }: { rings: RingValues; deltas?: RingDeltas }) {
  const decayDelta = rings.decay
    ? { amount: -2.0, reason: '1 day without training' }
    : undefined;

  return (
    <View style={styles.ringsRow}>
      <ProgressRing
        percentage={rings.m}
        label="Mindfulness"
        ringColor={colors.ringMindfulness}
        delta={deltas?.m ?? decayDelta}
      />
      <ProgressRing
        percentage={rings.a}
        label="Acceptance"
        ringColor={colors.ringAcceptance}
        delta={deltas?.a ?? decayDelta}
      />
      <ProgressRing
        percentage={rings.c}
        label="Commitment"
        ringColor={colors.ringCommitment}
        delta={deltas?.c ?? decayDelta}
      />
    </View>
  );
}

const MAC_CATS = [
  { label: 'Mindfulness', color: colors.ringMindfulness },
  { label: 'Acceptance', color: colors.ringAcceptance },
  { label: 'Commitment', color: colors.ringCommitment },
] as const;

function LibraryMockScreen({ rings, streak }: { rings: RingValues; streak: number }) {
  const anims = useRef(
    MAC_CATS.map(() => ({
      opacity: new Animated.Value(0),
      slide: new Animated.Value(16),
    }))
  ).current;

  useEffect(() => {
    // Wait for the step slide-in to finish before staggering rows in
    const timers: ReturnType<typeof setTimeout>[] = [];
    MAC_CATS.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(anims[i].opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(anims[i].slide, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]).start();
        }, 200 + i * 110)
      );
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <ScrollView
      style={styles.screenScroll}
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
    >
      <View style={styles.screenHeader}>
        <Text style={styles.screenBrand}>RELENTLESS</Text>
        <View style={styles.streakPill}>
          <Text style={styles.streakNum}>{streak}</Text>
          <Ionicons name="flame" size={16} color="#f59e0b" />
        </View>
      </View>

      <RingsRow rings={rings} />

      {MAC_CATS.map((cat, i) => (
        <Animated.View
          key={cat.label}
          style={[
            styles.libCategoryRow,
            { opacity: anims[i].opacity, transform: [{ translateY: anims[i].slide }] },
          ]}
        >
          <View style={[styles.categoryAccent, { backgroundColor: cat.color }]} />
          <Text style={styles.categoryLabel}>{cat.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Animated.View>
      ))}
    </ScrollView>
  );
}

function AnimatedWodCard({ active }: { active: boolean }) {
  const cardScale = useRef(new Animated.Value(1)).current;
  const cardOpacity = useRef(new Animated.Value(0.08)).current;
  const glowOpacity = useRef(new Animated.Value(0.25)).current;
  const authorOpacity = useRef(new Animated.Value(0)).current;
  const authorSlide = useRef(new Animated.Value(10)).current;
  const badgeScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      cardOpacity.setValue(0.08);
      authorOpacity.setValue(0);
      authorSlide.setValue(10);
      glowOpacity.setValue(0.25);
      return;
    }

    cardScale.setValue(0.94);
    Animated.parallel([
      Animated.timing(cardScale, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();

    const authorTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(authorOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(authorSlide, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }, 340);

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 0.7, duration: 950, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.25, duration: 950, useNativeDriver: true }),
      ])
    );
    glowLoop.start();

    const badgeLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(badgeScale, { toValue: 1.2, duration: 650, useNativeDriver: true }),
        Animated.timing(badgeScale, { toValue: 1.0, duration: 650, useNativeDriver: true }),
      ])
    );
    badgeLoop.start();

    return () => {
      clearTimeout(authorTimer);
      glowLoop.stop();
      badgeLoop.stop();
    };
  }, [active]);

  return (
    <Animated.View
      style={[
        styles.wodCard,
        styles.wodCardHighlight,
        { transform: [{ scale: cardScale }], opacity: cardOpacity },
      ]}
    >
      {/* Pulsing glow overlay */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: 16, backgroundColor: 'rgba(139,92,246,0.09)', opacity: glowOpacity },
        ]}
      />

      <View style={styles.wodHeaderRow}>
        <Text style={styles.wodLabel}>WORKOUT OF THE DAY</Text>
        <Animated.View style={[styles.wodNewBadge, { transform: [{ scale: badgeScale }] }]}>
          <View style={styles.wodNewDot} />
          <Text style={styles.wodNewText}>NEW</Text>
        </Animated.View>
      </View>

      <Text style={styles.wodDayBadge}>Day 1 of 30</Text>
      <Text style={styles.wodTitle}>What MAC Training Actually Is</Text>

      {/* Grant attribution — staggered fade + slide in */}
      <Animated.View
        style={[
          styles.wodAuthorRow,
          { opacity: authorOpacity, transform: [{ translateY: authorSlide }] },
        ]}
      >
        <Image
          source={require('../../assets/images/grant_chiasson.png')}
          style={styles.wodAuthorPhoto}
        />
        <View>
          <Text style={styles.wodAuthorName}>Grant Chiasson</Text>
          <Text style={styles.wodAuthorCred}>Sport Psychologist</Text>
        </View>
      </Animated.View>

      <View style={styles.wodMetaPill}>
        <Text style={styles.wodMeta}>3 min</Text>
      </View>
    </Animated.View>
  );
}

function HomeScreen({
  variant,
  rings,
  streak,
  deltas,
  viewportBoundScroll = false,
}: {
  variant: string;
  rings: RingValues;
  streak: number;
  deltas?: RingDeltas;
  viewportBoundScroll?: boolean;
}) {
  const isDecay = variant === 'decay';

  return (
    <ScrollView
      style={[styles.screenScroll, viewportBoundScroll && styles.screenScrollFill]}
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
    >
      <View style={styles.screenHeader}>
        <Text style={styles.screenBrand}>RELENTLESS</Text>
        <View style={styles.headerRight}>
          <View style={styles.countdownPill}>
            <MaterialCommunityIcons name="bullseye-arrow" size={14} color={colors.textMuted} />
            <Text style={styles.countdownText}>12d</Text>
          </View>
          <View style={[styles.streakPill, isDecay && styles.streakPillBroken]}>
            <Text style={[styles.streakNum, isDecay && { color: colors.error }]}>{streak}</Text>
            <Ionicons name="flame" size={16} color={isDecay ? colors.error : '#f59e0b'} />
          </View>
        </View>
      </View>

      <View style={{ opacity: variant === 'wod' ? 0.08 : 1 }}>
        <RingsRow rings={rings} deltas={deltas} />
      </View>

      {isDecay && (
        <>
          <View style={styles.missedCard}>
            <View style={styles.missedAccentBar} />
            <View style={styles.missedCardInner}>
              <View style={styles.missedHeader}>
                <Text style={styles.missedLabel}>MISSED</Text>
                <Text style={styles.missedDay}>Day 7 of 30</Text>
              </View>
              <Text style={styles.missedTitle}>What MAC Training Actually Is</Text>
              <View style={styles.missedDecayRow}>
                <Ionicons name="trending-down" size={13} color={colors.error} />
                <Text style={styles.missedDecayText}>−2 pts per ring · streak reset</Text>
              </View>
            </View>
          </View>

          <View style={styles.reflectionCard}>
            <View style={styles.reflectionHeader}>
              <Ionicons name="journal-outline" size={13} color={colors.error} />
              <Text style={styles.reflectionLabel}>REFLECTION</Text>
            </View>
            <View style={styles.reflectionInputMock}>
              <Text style={styles.reflectionPlaceholder}>Why did you miss today?</Text>
            </View>
          </View>
        </>
      )}

      {!isDecay && <AnimatedWodCard active={variant === 'wod'} />}
    </ScrollView>
  );
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.stepDots}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.stepDot, i === current && styles.stepDotActive]} />
      ))}
    </View>
  );
}

function Tooltip({
  content,
  stepIdx,
  total,
  anim,
  isDecay,
  caretPosition,
  nudgeY = 0,
  pinToBottom = false,
}: {
  content: TooltipContent;
  stepIdx: number;
  total: number;
  anim: Animated.Value;
  isDecay?: boolean;
  caretPosition: 'left' | 'center';
  nudgeY?: number;
  /** Pushes the tooltip to the bottom of the screen area (e.g. library overview). */
  pinToBottom?: boolean;
}) {
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const bg = isDecay ? TOOLTIP_BG_DECAY : TOOLTIP_BG;
  const borderColor = isDecay ? TOOLTIP_BORDER_DECAY : TOOLTIP_BORDER;
  const accentColor = isDecay ? colors.error : colors.accentLight;
  const caretLeft = CARET_OFFSETS[caretPosition];
  const marginTop = pinToBottom ? 'auto' : nudgeY;

  return (
    <Animated.View
      style={[
        styles.tooltipWrap,
        { marginTop, opacity: anim, transform: [{ translateY }] },
      ]}
    >
      {/* border triangle — slightly larger, rendered behind fill */}
      <View
        style={[
          styles.tooltipCaretBorder,
          { left: caretLeft - 1, borderBottomColor: borderColor },
        ]}
      />
      {/* fill triangle — sits on top, matches tooltip background */}
      <View
        style={[
          styles.tooltipCaretFill,
          { left: caretLeft, borderBottomColor: bg },
        ]}
      />
      <View
        style={[
          styles.tooltip,
          {
            backgroundColor: bg,
            borderColor,
            shadowColor: isDecay ? colors.error : colors.accent,
          },
        ]}
      >
        <View style={[styles.tooltipAccentBar, { backgroundColor: accentColor }]} />
        <View style={styles.tooltipBody}>
          <Text style={[styles.tooltipTitle, { color: accentColor }]}>{content.title}</Text>
          <Text style={styles.tooltipText}>{content.body}</Text>
          <StepDots total={total} current={stepIdx} />
        </View>
      </View>
    </Animated.View>
  );
}

export default function TutorialScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [stepIdx, setStepIdx] = useState(0);
  const [step0Phase, setStep0Phase] = useState<'delta' | 'filled'>('delta');

  // Auto-play the +20 → filled ring animation on step 0
  useEffect(() => {
    if (stepIdx !== 0) return;
    setStep0Phase('delta');
    const t = setTimeout(() => setStep0Phase('filled'), 1400);
    return () => clearTimeout(t);
  }, [stepIdx]);

  const MAC_INTRO_GAIN: ScoreDelta = { amount: 20, reason: "Grant's intro workout complete" };

  // Refs so PanResponder callbacks always have the latest values without recreating the handler
  const stepIdxRef = useRef(0);
  stepIdxRef.current = stepIdx;

  const stepAnim = useRef(new Animated.Value(0)).current;
  const slideX = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);

  const step = STEPS[stepIdx];

  const step0Deltas: RingDeltas | undefined =
    stepIdx === 0 && step0Phase === 'delta'
      ? { m: MAC_INTRO_GAIN, a: MAC_INTRO_GAIN, c: MAC_INTRO_GAIN }
      : undefined;
  const displayRings =
    stepIdx === 0 && step0Phase === 'delta' ? { m: 0, a: 0, c: 0 } : step.rings;

  // Tooltip entrance animation — fires on every step change
  useEffect(() => {
    stepAnim.setValue(0);
    Animated.timing(stepAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [stepIdx]);

  const dimOpacity = stepAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.38] });

  // Slide the screen area to a new step with directional animation
  const goToStep = (newIdx: number) => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const direction = newIdx > stepIdxRef.current ? 'left' : 'right';
    Animated.timing(slideX, {
      toValue: direction === 'left' ? -SCREEN_W : SCREEN_W,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      stepIdxRef.current = newIdx;
      setStepIdx(newIdx);
      slideX.setValue(direction === 'left' ? SCREEN_W : -SCREEN_W);
      Animated.timing(slideX, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        isAnimating.current = false;
      });
    });
  };

  // Stable ref so PanResponder (created once) can always call the latest goToStep
  const goToStepRef = useRef(goToStep);
  goToStepRef.current = goToStep;

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (stepIdxRef.current <= 0) return;
      e.preventDefault();
      goToStepRef.current(stepIdxRef.current - 1);
    });
  }, [navigation]);

  const panResponder = useRef(
    PanResponder.create({
      // Only claim gesture when clearly horizontal (not competing with vertical scroll)
      onMoveShouldSetPanResponder: (_, gs) =>
        !isAnimating.current &&
        Math.abs(gs.dx) > 8 &&
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderMove: (_, gs) => {
        if (!isAnimating.current) {
          // Resistance factor 0.5 so it feels like dragging through light friction
          slideX.setValue(gs.dx * 0.5);
        }
      },
      onPanResponderRelease: (_, gs) => {
        const idx = stepIdxRef.current;
        if (gs.dx < -SWIPE_THRESHOLD && idx < STEPS.length - 1) {
          goToStepRef.current(idx + 1);
        } else if (gs.dx > SWIPE_THRESHOLD && idx > 0) {
          goToStepRef.current(idx - 1);
        } else if (gs.dx > SWIPE_THRESHOLD && idx === 0 && navigation.canGoBack()) {
          navigation.goBack();
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
          Animated.spring(slideX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 120,
            friction: 14,
          }).start();
        }
      },
    })
  ).current;

  const handleNext = () => {
    if (stepIdx >= STEPS.length - 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push('/(onboarding)/sport-selection' as any);
      return;
    }
    goToStep(stepIdx + 1);
  };

  const handleTabSwitch = (tab: string) => {
    Haptics.selectionAsync();
    const targetIdx = STEPS.findIndex((s) => s.tab === tab);
    if (targetIdx >= 0) goToStep(targetIdx);
  };

  const handleBack = () => {
    if (stepIdx > 0) {
      goToStep(stepIdx - 1);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.back();
    }
  };

  const isDecay = step.variant === 'decay';

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={step.progressStep} total={ONBOARDING_TOTAL_STEPS} onBack={handleBack} />
      <View style={styles.inner}>
        {/* Animated slide wrapper — responds to swipe gestures */}
        <Animated.View
          style={[styles.screenArea, { transform: [{ translateX: slideX }] }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.screenMockHostLoose}>
            {step.tab === 'library' ? (
              <LibraryMockScreen rings={step.rings} streak={step.streak} />
            ) : (
              <HomeScreen
                variant={step.variant}
                rings={displayRings}
                streak={step.streak}
                deltas={step0Deltas}
              />
            )}
            {/* Dim overlay separates mock screen from tooltip */}
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000000', opacity: dimOpacity }]}
            />
          </View>

          <Tooltip
            content={step.tooltip}
            stepIdx={stepIdx}
            total={STEPS.length}
            anim={stepAnim}
            isDecay={isDecay}
            caretPosition={step.caretPosition}
            nudgeY={step.tooltipNudgeY ?? 0}
            pinToBottom={step.pinToBottom ?? false}
          />
        </Animated.View>

        <MockTabBar active={step.tab} onSwitch={handleTabSwitch} />

        <View style={styles.bottom}>
          <TouchableOpacity style={styles.button} onPress={handleNext}>
            <Text style={styles.buttonText}>
              {stepIdx >= STEPS.length - 1 ? 'Continue' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1 },

  screenArea: { flex: 1, flexDirection: 'column' },
  /** Viewport-bound host (library + profile) so sibling tooltip stays on-screen. */
  screenMockHostClamp: { flex: 1, minHeight: 0 },
  /** Original loose host for home mocks — restores prior tooltip placement. */
  screenMockHostLoose: { position: 'relative' },
  screenScroll: {},
  screenScrollFill: { flex: 1 },
  // Library overview: fill area above the pinned bottom tooltip.
  screenScrollLibraryOverview: { flex: 1, minHeight: 0 },
  screenContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  screenHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  screenBrand: { fontSize: 18, fontWeight: '900', color: colors.white, letterSpacing: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countdownPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  countdownText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  streakPillBroken: {
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  streakNum: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },

  // Rings
  ringsRow: {
    flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16,
  },

  // WOD card
  wodCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: 20, marginBottom: 12,
  },
  wodCardHighlight: {
    borderColor: colors.accent,
    borderWidth: 1.5,
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  wodHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4,
  },
  wodNewBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)',
  },
  wodNewDot: {
    width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.accentLight,
  },
  wodNewText: {
    fontSize: 9, fontWeight: '800', color: colors.accentLight, letterSpacing: 1,
  },
  wodLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1.5 },
  wodDayBadge: { fontSize: 12, fontWeight: '600', color: colors.accentLight, marginBottom: 6, marginTop: 4 },
  wodTitle: { fontSize: 18, fontWeight: '700', color: colors.white, marginBottom: 14, textAlign: 'left' },
  wodAuthorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14,
  },
  wodAuthorPhoto: {
    width: 32, height: 32, borderRadius: 16,
  },
  wodAuthorName: {
    fontSize: 13, fontWeight: '700', color: colors.textPrimary,
  },
  wodAuthorCred: {
    fontSize: 11, fontWeight: '500', color: colors.accentLight, marginTop: 1,
  },
  wodMetaPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  wodMeta: { fontSize: 12, fontWeight: '600', color: colors.textMuted },

  // Pre-workout journal card
  journalCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: 16,
  },
  journalLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, marginBottom: 8 },
  journalInputMock: {
    backgroundColor: colors.surfaceLight, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  journalPlaceholder: { fontSize: 14, color: colors.textMuted },

  // Decay / Missed card
  missedCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    marginBottom: 12,
    overflow: 'hidden',
  },
  missedAccentBar: {
    width: 4,
    backgroundColor: colors.error,
  },
  missedCardInner: {
    flex: 1,
    padding: 16,
  },
  missedHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6,
  },
  missedLabel: {
    fontSize: 10, fontWeight: '800', color: colors.error, letterSpacing: 1.5,
  },
  missedDay: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
  },
  missedTitle: {
    fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 10,
  },
  missedDecayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  missedDecayText: {
    fontSize: 12, fontWeight: '600', color: colors.error,
  },

  // Reflection journal card (decay step)
  reflectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    padding: 16,
  },
  reflectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
  },
  reflectionLabel: {
    fontSize: 10, fontWeight: '800', color: colors.error, letterSpacing: 1.2,
  },
  reflectionInputMock: {
    backgroundColor: colors.surfaceLight, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  reflectionPlaceholder: { fontSize: 14, color: 'rgba(239,68,68,0.55)' },

  // Library mock — compact row (real library uses paddingVertical:32 which is too tall in tutorial)
  libCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 18,
    paddingHorizontal: spacing.lg,
    marginBottom: 10,
  },

  // Library overview
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 32,
    paddingHorizontal: spacing.lg,
    marginBottom: 12,
  },
  categoryBtnHighlight: {
    borderColor: colors.accent,
    borderWidth: 1.5,
    shadowColor: colors.accent,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  categoryAccent: { width: 4, height: 28, borderRadius: 2, marginRight: 16 },
  categoryLabel: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  ctaCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: 20, marginTop: 4,
  },
  ctaTitle: { fontSize: 18, fontWeight: '700', color: colors.white, textAlign: 'center', lineHeight: 24 },
  ctaByline: {
    fontSize: 15, fontWeight: '600', color: colors.accentLight, textAlign: 'center', marginTop: 10,
  },
  ctaSub: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 19, textAlign: 'center', marginTop: 6, maxWidth: 280, alignSelf: 'center',
  },

  // Library category mock (aligned with `category/[id].tsx` list rows)
  catScreenContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  catNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  catNavTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  catLessonCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: 12,
  },
  catLessonDayLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  catLessonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  catLessonLeft: {
    flex: 1,
    minHeight: 38,
    justifyContent: 'flex-start',
  },
  catLessonTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  catLessonDurationPill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    marginLeft: 12,
  },
  catLessonDurationText: {
    fontSize: 11,
    fontWeight: '600',
  },
  catWodDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  catWodDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  catWodDividerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // Profile tutorial mock (aligned with `(tabs)/profile.tsx`)
  profScreenContent: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 20,
  },
  profHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  profBrand: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 3,
  },
  profStreakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profStreakNum: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  profHero: {
    alignItems: 'center',
    marginBottom: 32,
  },
  profAvatarOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  profAvatarInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profUserName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  profSportLine: {
    fontSize: 13,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  profStatsCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 2,
    borderTopColor: 'rgba(139, 92, 246, 0.3)',
    paddingTop: 22,
    paddingBottom: 16,
    marginBottom: 36,
  },
  profStatsColumns: {
    flexDirection: 'row',
  },
  profStatCol: {
    flex: 1,
    alignItems: 'center',
  },
  profStatIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  profVerticalRule: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  profStatValue: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 36,
  },
  profStatCaption: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  profLastActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginHorizontal: 20,
  },
  profLastActiveText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  profCountdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 36,
  },
  profCountdownIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profCountdownTextCol: {
    flex: 1,
  },
  profCountdownDays: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  profCountdownSub: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 1,
  },
  profSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  profRowsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  profMockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  profMockRowLast: {
    borderBottomWidth: 0,
  },
  profMockRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  profMockRowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profMockRowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  profMockRowValue: {
    fontSize: 14,
    color: colors.textMuted,
  },

  // Tooltip container — paddingTop makes room for the caret arrow
  tooltipWrap: {
    zIndex: 4,
    elevation: 8,
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 12,
  },
  // Two-layer caret: border triangle behind, fill triangle on top
  tooltipCaretBorder: {
    position: 'absolute',
    top: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tooltipCaretFill: {
    position: 'absolute',
    top: 3,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tooltip: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1.5,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  tooltipAccentBar: {
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  tooltipBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  tooltipTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  tooltipText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 21,
    marginBottom: 10,
  },

  // Step dots
  stepDots: {
    flexDirection: 'row', gap: 5, alignSelf: 'flex-end',
  },
  stepDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: colors.border,
  },
  stepDotActive: {
    backgroundColor: colors.accent,
    width: 14,
    borderRadius: 2.5,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: colors.tabBarBg, borderTopWidth: 1, borderTopColor: colors.tabBarBorder,
    paddingVertical: 8, paddingBottom: 4,
  },
  tabItem: { alignItems: 'center', gap: 2 },
  tabIconWrap: {
    width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  tabIconWrapActive: { backgroundColor: colors.tabBarActive },
  tabLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.3 },

  // Bottom
  bottom: { paddingHorizontal: 20, paddingBottom: spacing.xl, paddingTop: spacing.sm },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
