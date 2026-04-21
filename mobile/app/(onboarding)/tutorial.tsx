import { useRef, useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgressRing } from '@/components/ProgressRing';
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
  tab: 'home' | 'library' | 'profile';
  variant: 'rings' | 'wod' | 'decay' | 'overview' | 'category' | 'stats';
  rings: RingValues;
  streak: number;
  tooltip: TooltipContent;
  progressStep: number;
  caretPosition: 'left' | 'center';
};

const STEPS: TutorialStep[] = [
  {
    tab: 'home',
    variant: 'rings',
    rings: { m: 72, a: 58, c: 45 },
    streak: 6,
    tooltip: {
      title: 'YOUR MAC SCORE',
      body: 'Three rings — Mindfulness, Acceptance, Commitment. Every lesson you complete fills them.',
    },
    progressStep: 15,
    caretPosition: 'center',
  },
  {
    tab: 'home',
    variant: 'wod',
    rings: { m: 72, a: 58, c: 45 },
    streak: 6,
    tooltip: {
      title: 'WORKOUT OF THE DAY',
      body: 'A short guided session, delivered daily. Finish any lesson to keep your streak alive.',
    },
    progressStep: 16,
    caretPosition: 'center',
  },
  {
    tab: 'home',
    variant: 'decay',
    rings: { m: 48, a: 36, c: 41, decay: true },
    streak: 0,
    tooltip: {
      title: 'STAY CONSISTENT',
      body: 'Miss a day and every ring drops −2 pts. Miss enough and your streak breaks — plus you owe a reflection.',
    },
    progressStep: 17,
    caretPosition: 'left',
  },
  {
    tab: 'library',
    variant: 'overview',
    rings: { m: 72, a: 58, c: 45 },
    streak: 6,
    tooltip: {
      title: 'THE LIBRARY',
      body: 'Browse exercises by MAC category — use them before practice, on game day, or as extra reps.',
    },
    progressStep: 18,
    caretPosition: 'left',
  },
  {
    tab: 'library',
    variant: 'category',
    rings: { m: 72, a: 58, c: 45 },
    streak: 6,
    tooltip: {
      title: 'PICK AN EXERCISE',
      body: 'Each category has a set of exercises with estimated times. Tap any one — before practice, on game day, or whenever you need a reset.',
    },
    progressStep: 19,
    caretPosition: 'center',
  },
  {
    tab: 'profile',
    variant: 'stats',
    rings: { m: 72, a: 58, c: 45 },
    streak: 6,
    tooltip: {
      title: 'YOUR PROGRESS',
      body: 'Track your streak, personal best, and total lessons. Set your competition countdown to stay locked in.',
    },
    progressStep: 20,
    caretPosition: 'center',
  },
];

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

function RingsRow({ rings }: { rings: RingValues }) {
  const decayDelta = rings.decay
    ? { amount: -2.0, reason: '1 day without training' }
    : undefined;

  return (
    <View style={styles.ringsRow}>
      <ProgressRing
        percentage={rings.m}
        label="Mindfulness"
        ringColor={colors.ringMindfulness}
        delta={decayDelta}
      />
      <ProgressRing
        percentage={rings.a}
        label="Acceptance"
        ringColor={colors.ringAcceptance}
        delta={decayDelta}
      />
      <ProgressRing
        percentage={rings.c}
        label="Commitment"
        ringColor={colors.ringCommitment}
        delta={decayDelta}
      />
    </View>
  );
}

function HomeScreen({ variant, rings, streak }: { variant: string; rings: RingValues; streak: number }) {
  const isDecay = variant === 'decay';

  return (
    <ScrollView
      style={styles.screenScroll}
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
        <RingsRow rings={rings} />
      </View>

      {variant === 'rings' && (
        <View style={styles.macLegend}>
          <View style={styles.macLegendRow}>
            <View style={[styles.macDot, { backgroundColor: colors.ringMindfulness }]} />
            <Text style={styles.macLegendLabel}>M — Mindfulness</Text>
          </View>
          <View style={styles.macLegendRow}>
            <View style={[styles.macDot, { backgroundColor: colors.ringAcceptance }]} />
            <Text style={styles.macLegendLabel}>A — Acceptance</Text>
          </View>
          <View style={styles.macLegendRow}>
            <View style={[styles.macDot, { backgroundColor: colors.ringCommitment }]} />
            <Text style={styles.macLegendLabel}>C — Commitment</Text>
          </View>
        </View>
      )}

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

      {!isDecay && (
        <View style={[styles.wodCard, variant === 'wod' && styles.wodCardHighlight, { opacity: variant === 'rings' ? 0.08 : 1 }]}>
          <Text style={styles.wodLabel}>WORKOUT OF THE DAY</Text>
          <Text style={styles.wodDayBadge}>Day 7 of 30</Text>
          <Text style={styles.wodTitle}>What MAC Training Actually Is</Text>
          <View style={styles.wodMetaPill}>
            <Text style={styles.wodMeta}>3 min</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function LibraryScreen({ variant, rings, streak }: { variant: string; rings: RingValues; streak: number }) {
  const categories = [
    { label: 'Mindfulness', color: colors.ringMindfulness },
    { label: 'Acceptance', color: colors.ringAcceptance },
    { label: 'Commitment', color: colors.ringCommitment },
  ];
  return (
    <ScrollView
      style={styles.screenScroll}
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
    >
      <View style={styles.screenHeader}>
        <Text style={styles.screenBrand}>RELENTLESS</Text>
        <View style={styles.headerRight}>
          <View style={styles.streakPill}>
            <Text style={styles.streakNum}>{streak}</Text>
            <Ionicons name="flame" size={16} color="#f59e0b" />
          </View>
        </View>
      </View>

      <View style={{ opacity: variant === 'overview' ? 0.08 : 1 }}>
        <RingsRow rings={rings} />
      </View>

      {categories.map((cat) => {
        const isHighlighted = variant === 'overview' && cat.label === 'Mindfulness';
        return (
          <View
            key={cat.label}
            style={[
              styles.categoryBtn,
              isHighlighted && styles.categoryBtnHighlight,
              !isHighlighted && variant === 'overview' && { opacity: 0.12 },
            ]}
          >
            <View style={[styles.categoryAccent, { backgroundColor: cat.color }]} />
            <Text style={styles.categoryLabel}>{cat.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={isHighlighted ? colors.accentLight : colors.textMuted} />
          </View>
        );
      })}

      {variant !== 'overview' && (
        <View style={styles.ctaCard}>
          <Text style={styles.ctaTitle}>Want to go deeper?</Text>
          <Text style={styles.ctaByline}>Sessions with Grant</Text>
          <Text style={styles.ctaSub}>
            Personalized coaching for your specific goals
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function LibraryCategoryScreen() {
  const lessons = [
    { title: 'Box Breathing', mins: '3 min' },
    { title: 'The Tunnel', mins: '4 min' },
    { title: 'Pre-Game Focus Reset', mins: '3 min' },
    { title: 'Body Scan Grounding', mins: '5 min' },
  ];
  return (
    <ScrollView
      style={styles.screenScroll}
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
    >
      <View style={styles.catDetailHeader}>
        <Ionicons name="chevron-back" size={18} color={colors.accentLight} />
        <View style={[styles.catDetailAccentBar, { backgroundColor: colors.ringMindfulness }]} />
        <Text style={styles.catDetailTitle}>Mindfulness</Text>
      </View>

      <Text style={styles.catDetailSubtitle}>
        Exercises that sharpen present-moment focus and quiet mental noise.
      </Text>

      {lessons.map((l) => (
        <View key={l.title} style={styles.lessonCard}>
          <View style={styles.lessonCardInner}>
            <Text style={styles.lessonTitle}>{l.title}</Text>
          </View>
          <View style={[styles.lessonTimePill, styles.lessonTimePillMindfulness]}>
            <Text style={[styles.lessonTimeText, styles.lessonTimeTextMindfulness]}>{l.mins}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function ProfileScreen({ rings, streak }: { rings: RingValues; streak: number }) {
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

      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color={colors.accent} />
        </View>
        <Text style={styles.avatarName}>You</Text>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statCol}>
          <Ionicons name="flame" size={16} color="#f59e0b" />
          <Text style={styles.statVal}>{streak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Ionicons name="trophy-outline" size={16} color={colors.accentLight} />
          <Text style={styles.statVal}>{streak}</Text>
          <Text style={styles.statLabel}>Best</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
          <Text style={styles.statVal}>14</Text>
          <Text style={styles.statLabel}>Lessons</Text>
        </View>
      </View>

      <View style={styles.settingsRow}>
        <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
        <Text style={styles.settingsLabel}>Competition Date</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
      <View style={styles.settingsRow}>
        <Ionicons name="journal-outline" size={16} color={colors.textMuted} />
        <Text style={styles.settingsLabel}>Journal Entries</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
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
}: {
  content: TooltipContent;
  stepIdx: number;
  total: number;
  anim: Animated.Value;
  isDecay?: boolean;
  caretPosition: 'left' | 'center';
}) {
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const bg = isDecay ? TOOLTIP_BG_DECAY : TOOLTIP_BG;
  const borderColor = isDecay ? TOOLTIP_BORDER_DECAY : TOOLTIP_BORDER;
  const accentColor = isDecay ? colors.error : colors.accentLight;
  const caretLeft = CARET_OFFSETS[caretPosition];

  return (
    <Animated.View style={[styles.tooltipWrap, { opacity: anim, transform: [{ translateY }] }]}>
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
  const [stepIdx, setStepIdx] = useState(0);

  // Refs so PanResponder callbacks always have the latest values without recreating the handler
  const stepIdxRef = useRef(0);
  stepIdxRef.current = stepIdx;

  const stepAnim = useRef(new Animated.Value(0)).current;
  const slideX = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);

  const step = STEPS[stepIdx];

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
        } else {
          // Snap back if threshold not met
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
          <View>
            {step.tab === 'home' && (
              <HomeScreen variant={step.variant} rings={step.rings} streak={step.streak} />
            )}
            {step.tab === 'library' && step.variant === 'category'
              ? <LibraryCategoryScreen />
              : step.tab === 'library' && (
                  <LibraryScreen variant={step.variant} rings={step.rings} streak={step.streak} />
                )}
            {step.tab === 'profile' && (
              <ProfileScreen rings={step.rings} streak={step.streak} />
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

  screenArea: { flex: 1 },
  screenScroll: {},
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

  // MAC legend (rings step only)
  macLegend: {
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1,
    borderColor: colors.border, padding: 14, marginBottom: 14, gap: 8,
  },
  macLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  macDot: { width: 10, height: 10, borderRadius: 5 },
  macLegendLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },

  // WOD card
  wodCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: 20, alignItems: 'center', marginBottom: 12,
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
  wodLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1.5, marginBottom: 4 },
  wodDayBadge: { fontSize: 12, fontWeight: '600', color: colors.accentLight, marginBottom: 6 },
  wodTitle: { fontSize: 18, fontWeight: '700', color: colors.white, marginBottom: 8, textAlign: 'center' },
  wodMetaPill: {
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

  // Library category detail
  catDetailHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
  },
  catDetailAccentBar: { width: 4, height: 20, borderRadius: 2 },
  catDetailTitle: { fontSize: 20, fontWeight: '800', color: colors.white, letterSpacing: 0.5 },
  catDetailSubtitle: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 18,
  },
  lessonCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: 16, marginBottom: 10,
  },
  lessonCardInner: { flex: 1 },
  lessonTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  lessonTimePill: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: 12,
  },
  lessonTimeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  lessonTimePillMindfulness: {
    backgroundColor: 'rgba(96,165,250,0.12)',
    borderColor: 'rgba(96,165,250,0.33)',
  },
  lessonTimeTextMindfulness: {
    color: colors.ringMindfulness,
  },

  // Profile
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentSubtle,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    borderWidth: 2, borderColor: colors.accent,
  },
  avatarName: { fontSize: 18, fontWeight: '700', color: colors.white },
  statsCard: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16,
    padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'space-around', alignItems: 'center',
  },
  statCol: { alignItems: 'center', gap: 4 },
  statVal: { fontSize: 20, fontWeight: '800', color: colors.white },
  statLabel: { fontSize: 11, color: colors.textMuted },
  statDivider: { width: 1, height: 32, backgroundColor: colors.border },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  settingsLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.textPrimary },

  // Tooltip container — paddingTop makes room for the caret arrow
  tooltipWrap: {
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
