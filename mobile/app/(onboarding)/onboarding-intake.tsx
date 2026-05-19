import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { loadOnboardingAnswers, saveOnboardingAnswers } from '@/lib/onboarding-local-state';
import { trackOnboardingButtonClicked, trackOnboardingOptionSelected } from '@/lib/onboarding-analytics';
import { colors, spacing } from '@/lib/theme';
import { useWizardSwipeBackRight } from '@/lib/use-wizard-swipe-back';

const MENTAL_RESULTS_OPTIONS = [
  'Completely different',
  'A lot',
  'Somewhat',
  'A little',
  'Not much',
] as const;

const HOLD_MS = 2300;
const FINGER_SIZE = 112;
const RING_PAD = 8;
const RING_STROKE = 4;
const RING_D = FINGER_SIZE + RING_PAD * 2;
const RING_CX = RING_D / 2;
const RING_R = (RING_D - RING_STROKE) / 2 - 1;
const RING_CIRC = 2 * Math.PI * RING_R;
const SCRIM = 'rgba(0,0,0,0.5)';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ChoiceStep = { type: 'choice'; title: string; options: readonly string[] };
type HoldStep = { type: 'hold'; title: string; overlayLine: string; successLine: string; holdDurationMs: number };
type QuoteStep = { type: 'quote' };
type GapStep = { type: 'gap' };
type StepDef = ChoiceStep | HoldStep | QuoteStep | GapStep;

const STEPS: StepDef[] = [
  {
    type: 'choice',
    title: 'How important is mental toughness in your sport?',
    options: ['Extremely important', 'Very important', 'Quite important', 'Somewhat', 'Not very'],
  },
  {
    type: 'choice',
    title: 'How often do you feel you could have done more after a comp?',
    options: ['Always', 'Often', 'Sometimes', 'Rarely', 'Never'],
  },
  { type: 'quote' },
  {
    type: 'choice',
    title: "How different would your results be if you gave it 100% mentally?",
    options: [...MENTAL_RESULTS_OPTIONS],
  },
  { type: 'gap' },
  {
    type: 'choice',
    title: 'How different would your life be if you reached your full potential?',
    options: [...MENTAL_RESULTS_OPTIONS],
  },
  {
    type: 'choice',
    title: 'How strongly do you want that level of performance?',
    options: ['More than anything', 'Strongly', 'Somewhat', 'A little', 'Not much'],
  },
];

// VAULTED: can be restored to STEPS if the commitment lock-in step is brought back.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _VAULTED_HOLD_STEP: HoldStep = {
  type: 'hold',
  title: "Progress isn't easy, are you ready to commit?",
  overlayLine: 'Locking in your commitment',
  successLine: "You're in",
  holdDurationMs: HOLD_MS,
};

type HoldUiPhase = 'idle' | 'holding' | 'success';

type HoldToCommitBlockProps = {
  title: string;
  durationMs: number;
  overlayLine: string;
  successLine: string;
  onLockedIn: () => void;
  onInteractingChange: (v: boolean) => void;
};

function HoldToCommitBlock({
  title,
  durationMs,
  overlayLine,
  successLine,
  onLockedIn,
  onInteractingChange,
}: HoldToCommitBlockProps) {
  const [phase, setPhase] = useState<HoldUiPhase>('idle');
  const holdProgress = useRef(new Animated.Value(0)).current;
  const animRunning = useRef<ReturnType<typeof Animated.timing> | null>(null);
  const tickersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completedRef = useRef(false);
  const navigatedRef = useRef(false);
  const onLockedInRef = useRef(onLockedIn);
  onLockedInRef.current = onLockedIn;

  const clearTicks = useCallback(() => {
    tickersRef.current.forEach(clearTimeout);
    tickersRef.current = [];
  }, []);

  const hardReset = useCallback(() => {
    completedRef.current = false;
    navigatedRef.current = false;
    if (animRunning.current) {
      (animRunning.current as { stop?: () => void }).stop?.();
      animRunning.current = null;
    }
    clearTicks();
    holdProgress.stopAnimation();
    holdProgress.setValue(0);
    setPhase('idle');
  }, [clearTicks, holdProgress]);

  useEffect(() => {
    onInteractingChange(false);
  }, [onInteractingChange]);

  // Reliable navigation + avoids Strict Mode / stuck modal (single exit path)
  useEffect(() => {
    if (phase !== 'success' || navigatedRef.current) return;
    const t = setTimeout(() => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      onLockedInRef.current();
    }, 300);
    return () => {
      clearTimeout(t);
    };
  }, [phase]);

  const scheduleTicks = useCallback((ms: number) => {
    /** Ticks track ring fill ~linearly so feedback matches the arc; intensity ramps at the end. */
    const n = 10;
    const styles = [
      Haptics.ImpactFeedbackStyle.Light,
      Haptics.ImpactFeedbackStyle.Light,
      Haptics.ImpactFeedbackStyle.Medium,
      Haptics.ImpactFeedbackStyle.Medium,
      Haptics.ImpactFeedbackStyle.Medium,
      Haptics.ImpactFeedbackStyle.Heavy,
      Haptics.ImpactFeedbackStyle.Heavy,
      Haptics.ImpactFeedbackStyle.Heavy,
      Haptics.ImpactFeedbackStyle.Heavy,
      Haptics.ImpactFeedbackStyle.Rigid,
    ] as const;
    tickersRef.current = Array.from({ length: n }, (_, i) => {
      const u = n <= 1 ? 1 : i / (n - 1);
      const p = 0.1 + 0.86 * u;
      return setTimeout(() => void Haptics.impactAsync(styles[i]!), ms * p);
    });
  }, []);

  const onPressIn = useCallback(() => {
    if (phase !== 'idle' || navigatedRef.current) return;
    completedRef.current = false;
    holdProgress.setValue(0);
    setPhase('holding');
    onInteractingChange(true);
    clearTicks();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scheduleTicks(durationMs);
    const anim = Animated.timing(holdProgress, {
      toValue: 1,
      duration: durationMs,
      useNativeDriver: false,
      easing: Easing.linear,
    });
    animRunning.current = anim;
    anim.start(({ finished }) => {
      if (!finished) return;
      if (!animRunning.current) return;
      animRunning.current = null;
      if (completedRef.current) return;
      completedRef.current = true;
      clearTicks();
      setPhase('success');
      onInteractingChange(false);
      tickersRef.current = [
        setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 0),
        setTimeout(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 140),
      ];
    });
  }, [phase, holdProgress, durationMs, onInteractingChange, scheduleTicks, clearTicks]);

  const onPressOut = useCallback(() => {
    if (navigatedRef.current) return;
    if (completedRef.current) return;
    onInteractingChange(false);
    clearTicks();
    if (animRunning.current) {
      (animRunning.current as { stop?: () => void }).stop?.();
      animRunning.current = null;
    }
    holdProgress.stopAnimation();
    holdProgress.setValue(0);
    setPhase('idle');
  }, [holdProgress, onInteractingChange, clearTicks]);

  useEffect(() => {
    return () => {
      if (animRunning.current) (animRunning.current as { stop?: () => void }).stop?.();
      clearTicks();
    };
  }, [clearTicks]);

  const dashOffset = holdProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRC, 0],
  });
  const showScrim = phase === 'holding' || phase === 'success';
  const centerLine = phase === 'success' ? successLine : overlayLine;

  return (
    <View style={holdStyles.holdPage}>
      {showScrim ? <View style={holdStyles.scrim} pointerEvents="none" /> : null}

      <View style={holdStyles.midFill} pointerEvents="box-none">
        {phase === 'idle' ? (
          <View style={holdStyles.titleCluster}>
            <Text style={holdStyles.titleMatch}>{title}</Text>
          </View>
        ) : (
          <View style={holdStyles.centerCluster} pointerEvents="box-none">
            <View style={holdStyles.lockPill}>
              <Text
                style={phase === 'success' ? holdStyles.lockTextSuccess : holdStyles.lockTextHolding}
                numberOfLines={4}
              >
                {centerLine}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={holdStyles.dock} pointerEvents="box-none">
        {phase === 'idle' ? (
          <Text style={holdStyles.hint}>Press and hold the fingerprint to commit</Text>
        ) : null}
        <View style={holdStyles.fingerprintStack}>
          <View style={holdStyles.ringHost}>
            <Svg width={RING_D} height={RING_D} style={holdStyles.ringSvg}>
              <G transform={`rotate(-90 ${RING_CX} ${RING_CX})`}>
                <Circle
                  cx={RING_CX}
                  cy={RING_CX}
                  r={RING_R}
                  stroke={colors.border}
                  strokeWidth={RING_STROKE}
                  fill="none"
                />
                <AnimatedCircle
                  cx={RING_CX}
                  cy={RING_CX}
                  r={RING_R}
                  stroke={colors.accent}
                  strokeWidth={RING_STROKE}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
                  strokeDashoffset={dashOffset}
                />
              </G>
            </Svg>
            <View style={holdStyles.fpButtonWrap}>
              <Pressable
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                style={({ pressed }) => [holdStyles.fpButton, pressed && holdStyles.fpButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel="Commit by pressing and holding"
                hitSlop={12}
              >
                <MaterialIcons name="fingerprint" size={64} color={colors.accent} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const holdStyles = StyleSheet.create({
  holdPage: {
    flex: 1,
    width: '100%',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SCRIM,
  },
  /** Match choice-step title placement: centered in the same vertical band as other intake questions. */
  midFill: { flex: 1, zIndex: 2, justifyContent: 'center' },
  titleCluster: { paddingHorizontal: spacing.xs, width: '100%' },
  titleMatch: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 36,
    textAlign: 'center',
  },
  centerCluster: { flex: 1, width: '100%', justifyContent: 'center' },
  lockPill: {
    alignSelf: 'center',
    maxWidth: 340,
    width: '100%',
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.4)',
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 22,
  },
  lockTextHolding: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.accentLight,
    textAlign: 'center',
    lineHeight: 40,
  },
  lockTextSuccess: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    lineHeight: 40,
  },
  dock: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
    zIndex: 3,
  },
  hint: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.md,
    textAlign: 'center',
    maxWidth: 300,
  },
  fingerprintStack: { alignItems: 'center' },
  ringHost: { width: RING_D, height: RING_D, alignItems: 'center', justifyContent: 'center' },
  ringSvg: { position: 'absolute' },
  fpButtonWrap: { width: FINGER_SIZE, height: FINGER_SIZE, alignItems: 'center', justifyContent: 'center' },
  fpButton: {
    width: FINGER_SIZE,
    height: FINGER_SIZE,
    borderRadius: FINGER_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fpButtonPressed: { opacity: 0.92 },
});

// ─── Quote interstitial ──────────────────────────────────────────────────────

function QuoteStep({ onContinue }: { onContinue: () => void }) {
  const quoteOp = useRef(new Animated.Value(0)).current;
  const attrOp = useRef(new Animated.Value(0)).current;
  const continueOp = useRef(new Animated.Value(0)).current;
  const [canContinue, setCanContinue] = useState(false);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const hapticTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    quoteOp.setValue(0);
    attrOp.setValue(0);
    continueOp.setValue(0);

    hapticTimersRef.current = [
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 600),
      setTimeout(() => void Haptics.selectionAsync(), 3000),
    ];
    const anim = Animated.sequence([
      Animated.timing(quoteOp, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.delay(300),
      Animated.timing(attrOp, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.delay(500),
      Animated.timing(continueOp, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]);
    animRef.current = anim;
    anim.start(() => setCanContinue(true));
    return () => {
      animRef.current?.stop();
      hapticTimersRef.current.forEach(clearTimeout);
      hapticTimersRef.current = [];
    };
  }, []);

  return (
    <View style={quoteStyles.container}>
      <View style={quoteStyles.content}>
        <Animated.Text style={[quoteStyles.quote, { opacity: quoteOp }]}>
          {
            '\u201cWhen they\u2019re at their best, athletes are focused on just being in the moment and executing their job.\u201d'
          }
        </Animated.Text>
        <Animated.View style={[quoteStyles.attrBlock, { opacity: attrOp }]}>
          <Text style={quoteStyles.attrName}>Kelli Moran-Miller · Stanford University</Text>
          <Text style={quoteStyles.stanfordRole}>Director of Sport Psychology, 2024</Text>
        </Animated.View>
      </View>
      <Animated.View style={[quoteStyles.bottom, { opacity: continueOp }]}>
        <TouchableOpacity
          style={[quoteStyles.button, !canContinue && quoteStyles.buttonDisabled]}
          disabled={!canContinue}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onContinue();
          }}
        >
          <Text style={quoteStyles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const quoteStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between' },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: 18,
  },
  quote: {
    fontSize: 24,
    fontWeight: '800',
    fontStyle: 'italic',
    color: colors.white,
    lineHeight: 34,
    textAlign: 'center',
  },
  attrBlock: { gap: 4 },
  attrName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accentLight,
    textAlign: 'center',
  },
  stanfordRole: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.textMuted,
    textAlign: 'center',
  },
  bottom: {
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});

// ─── Gap interstitial ────────────────────────────────────────────────────────

const BAR_MAX_H = 200;
const GAP_CURRENT_H: Record<string, number> = {
  'Completely different': Math.round(BAR_MAX_H * 0.20),
  'A lot': Math.round(BAR_MAX_H * 0.35),
  'Somewhat': Math.round(BAR_MAX_H * 0.52),
  'A little': Math.round(BAR_MAX_H * 0.70),
  'Not much': Math.round(BAR_MAX_H * 0.85),
};

function GapStep({ q5Answer, onContinue }: { q5Answer: string | null; onContinue: () => void }) {
  const targetH = q5Answer != null
    ? (GAP_CURRENT_H[q5Answer] ?? Math.round(BAR_MAX_H * 0.5))
    : Math.round(BAR_MAX_H * 0.5);

  const currentBarH = useRef(new Animated.Value(0)).current;
  const potentialBarH = useRef(new Animated.Value(0)).current;
  const taglineOp = useRef(new Animated.Value(0)).current;
  const continueOp = useRef(new Animated.Value(0)).current;
  const [canContinue, setCanContinue] = useState(false);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const hapticTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    hapticTimersRef.current = [
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 200),
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid), 1100),
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 1160),
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid), 1900),
      setTimeout(() => void Haptics.selectionAsync(), 2600),
    ];
    const anim = Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(currentBarH, {
          toValue: targetH,
          duration: 900,
          useNativeDriver: false,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(potentialBarH, {
          toValue: BAR_MAX_H,
          duration: 900,
          useNativeDriver: false,
          easing: Easing.out(Easing.cubic),
        }),
      ]),
      Animated.delay(300),
      Animated.timing(taglineOp, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(400),
      Animated.timing(continueOp, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]);
    animRef.current = anim;
    anim.start(() => setCanContinue(true));
    return () => {
      animRef.current?.stop();
      hapticTimersRef.current.forEach(clearTimeout);
      hapticTimersRef.current = [];
    };
  }, []);

  return (
    <View style={gapStyles.container}>
      <View style={gapStyles.content}>
        <View style={gapStyles.barsRow}>
          <View style={gapStyles.barCol}>
            <View style={gapStyles.barTrack}>
              <Animated.View style={[gapStyles.currentBar, { height: currentBarH }]} />
            </View>
            <Text style={gapStyles.barLabel}>You now</Text>
          </View>
          <View style={gapStyles.barCol}>
            <View style={gapStyles.barTrack}>
              <Animated.View style={[gapStyles.potentialBar, { height: potentialBarH }]} />
            </View>
            <Text style={gapStyles.barLabel}>Full potential</Text>
          </View>
        </View>
        <Animated.Text style={[gapStyles.tagline, { opacity: taglineOp }]}>
          {"That gap is trainable.\nThat's exactly what this is for."}
        </Animated.Text>
      </View>
      <Animated.View style={[gapStyles.bottom, { opacity: continueOp }]}>
        <TouchableOpacity
          style={[gapStyles.button, !canContinue && gapStyles.buttonDisabled]}
          disabled={!canContinue}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onContinue();
          }}
        >
          <Text style={gapStyles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const gapStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  barsRow: { flexDirection: 'row', gap: 40, justifyContent: 'center' },
  barCol: { alignItems: 'center' },
  barTrack: {
    width: 80,
    height: BAR_MAX_H,
    justifyContent: 'flex-end',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  currentBar: {
    width: '100%',
    backgroundColor: 'rgba(139, 92, 246, 0.35)',
    borderRadius: 10,
  },
  potentialBar: {
    width: '100%',
    backgroundColor: colors.accent,
    borderRadius: 10,
  },
  barLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  tagline: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    lineHeight: 32,
    marginTop: 40,
  },
  bottom: { paddingBottom: spacing.xl, paddingHorizontal: spacing.xl },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function OnboardingIntakeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>(() => Array(STEPS.length).fill(null));
  const [holdInteracting, setHoldInteracting] = useState(false);
  const [holdBlockReset, setHoldBlockReset] = useState(0);
  const holdInteractingRef = useRef(false);
  const fade = useRef(new Animated.Value(1)).current;
  const sheetTranslateX = useRef(new Animated.Value(0)).current;
  const questionIndexRef = useRef(questionIndex);
  questionIndexRef.current = questionIndex;
  const backingRef = useRef(false);
  const transitionDirRef = useRef<'fwd' | 'back'>('fwd');
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    loadOnboardingAnswers().then((saved) => {
      let rawAnswers = saved.intakeAnswers ?? [];
      let step = typeof saved.intakeStep === 'number' ? saved.intakeStep : 0;
      /** Pre–May 2026 intake had 10 steps including “how often … goals”; drop that slot when resuming. */
      if (rawAnswers.length >= 10) {
        rawAnswers = [...rawAnswers.slice(0, 2), ...rawAnswers.slice(3)];
        if (step > 2) step -= 1;
        step = Math.min(step, STEPS.length - 1);
        saveOnboardingAnswers({ intakeAnswers: rawAnswers as (string | null)[], intakeStep: step });
      }
      /** June 2026: long-term goal (was index 1) removed. Detect by checking the saved answer value. */
      const OLD_LONG_TERM_GOAL_OPTIONS = new Set(['Pro', 'D1 or college athletics', 'Win state or nationals', 'Make varsity', 'Other']);
      if (rawAnswers.length >= 2 && typeof rawAnswers[1] === 'string' && OLD_LONG_TERM_GOAL_OPTIONS.has(rawAnswers[1])) {
        rawAnswers = [rawAnswers[0]!, ...rawAnswers.slice(2)];
        if (step > 1) step -= 1;
        step = Math.min(step, STEPS.length - 1);
        saveOnboardingAnswers({ intakeAnswers: rawAnswers as (string | null)[], intakeStep: step });
      }
      const nextAnswers = [...rawAnswers];
      while (nextAnswers.length < STEPS.length) nextAnswers.push(null);
      if (nextAnswers.length) setAnswers(nextAnswers.slice(0, STEPS.length));
      if (step > 0) setQuestionIndex(Math.min(step, STEPS.length - 1));
    });
  }, []);

  useEffect(() => {
    holdInteractingRef.current = holdInteracting;
  }, [holdInteracting]);

  useFocusEffect(
    useCallback(() => {
      setHoldInteracting(false);
    }, []),
  );

  const step = STEPS[questionIndex]!;
  const isInterstitial = step.type === 'quote' || step.type === 'gap';
  const isHoldStep = step.type === 'hold';
  const selected = isInterstitial ? null : answers[questionIndex];
  const holdCompleted = isHoldStep && selected === 'Committed';

  const goNext = useCallback(
    (fromIndex: number) => {
      if (STEPS[fromIndex]?.type === 'gap') {
        // After the bar-graph screen, show the review/testimonial screen before continuing
        const next = fromIndex + 1;
        saveOnboardingAnswers({ intakeStep: next });
        router.push('/(onboarding)/unlocked-potential' as any);
      } else if (fromIndex < STEPS.length - 1) {
        const next = fromIndex + 1;
        setQuestionIndex(next);
        saveOnboardingAnswers({ intakeStep: next });
      } else {
        router.push('/(onboarding)/mac-question' as any);
      }
    },
    [router],
  );

  const onHoldLockedIn = useCallback(() => {
    trackOnboardingButtonClicked({
      step_key: 'intake_hold',
      step_index: ONBOARDING_PROGRESS.intakeStart + questionIndexRef.current,
      button_key: 'hold_committed',
    });
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndexRef.current] = 'Committed';
      saveOnboardingAnswers({ intakeAnswers: next });
      return next;
    });
    transitionDirRef.current = 'fwd';
    router.push('/(onboarding)/mac-question' as any);
  }, [router]);

  const runWizardBack = useCallback(() => {
    if (questionIndexRef.current <= 0 || backingRef.current) return;
    const currentStep = STEPS[questionIndexRef.current]!;
    if (currentStep.type === 'hold' && holdInteractingRef.current) return;
    backingRef.current = true;
    transitionDirRef.current = 'back';
    sheetTranslateX.setValue(0);
    Animated.timing(sheetTranslateX, {
      toValue: Dimensions.get('window').width,
      duration: 300,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start(({ finished }) => {
      if (!finished) {
        backingRef.current = false;
        return;
      }
      setQuestionIndex((i) => {
        if (i === STEPS.length - 1) setHoldBlockReset((k) => k + 1);
        return i - 1;
      });
    });
  }, [sheetTranslateX]);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (questionIndexRef.current <= 0) return;
      const s = STEPS[questionIndexRef.current]!;
      if (s.type === 'hold' && holdInteractingRef.current) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      runWizardBack();
    });
  }, [navigation, runWizardBack]);

  const swipeBackPan = useWizardSwipeBackRight(
    () =>
      !(STEPS[questionIndexRef.current]!.type === 'hold' && holdInteractingRef.current),
    () => {
      if (questionIndexRef.current <= 0) {
        router.back();
      } else {
        runWizardBack();
      }
    },
  );

  useEffect(() => {
    backingRef.current = false;
    fade.setValue(0);
    if (transitionDirRef.current === 'back') {
      sheetTranslateX.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: 360, useNativeDriver: true }).start();
    } else {
      Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    }
    transitionDirRef.current = 'fwd';
  }, [questionIndex, fade, sheetTranslateX]);

  const setSelected = (opt: string) => {
    Haptics.selectionAsync();
    trackOnboardingOptionSelected({
      step_key: `intake_q${questionIndex}`,
      step_index: ONBOARDING_PROGRESS.intakeStart + questionIndex,
      selected_option_key: opt,
    });
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = opt;
      saveOnboardingAnswers({ intakeAnswers: next });
      return next;
    });
  };

  const handleBack = () => {
    if (isHoldStep && holdInteractingRef.current) return;
    if (questionIndex > 0) {
      runWizardBack();
    } else {
      sheetTranslateX.setValue(0);
      Animated.timing(sheetTranslateX, {
        toValue: Dimensions.get('window').width,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start(({ finished }) => {
        if (finished) router.back();
      });
    }
  };

  const onInterstitialContinue = useCallback(() => {
    transitionDirRef.current = 'fwd';
    goNext(questionIndexRef.current);
  }, [goNext]);

  const handleContinue = () => {
    if (isHoldStep && !holdCompleted) return;
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackOnboardingButtonClicked({
      step_key: `intake_q${questionIndex}`,
      step_index: ONBOARDING_PROGRESS.intakeStart + questionIndex,
      button_key: holdCompleted ? 'hold_continue' : 'continue',
    });
    transitionDirRef.current = 'fwd';
    if (holdCompleted) {
      router.push('/(onboarding)/mac-question' as any);
      return;
    }
    goNext(questionIndex);
  };

  const progressStep = ONBOARDING_PROGRESS.intakeStart + questionIndex;

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar
        step={progressStep}
        total={ONBOARDING_TOTAL_STEPS}
        onBack={handleBack}
      />
      <View style={styles.swipeArea} {...swipeBackPan}>
        <Animated.View
          style={[styles.inner, { opacity: fade, transform: [{ translateX: sheetTranslateX }] }]}
        >
          {holdCompleted ? (
            <>
              <View style={styles.topSection}>
                <Text style={styles.title}>
                  {step.type === 'hold' ? step.successLine : ''}
                </Text>
              </View>
              <View style={styles.bottom}>
                <TouchableOpacity style={styles.button} onPress={handleContinue}>
                  <Text style={styles.buttonText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : isHoldStep ? (
            <HoldToCommitBlock
              key={holdBlockReset}
              title={step.title}
              durationMs={step.holdDurationMs}
              overlayLine={step.overlayLine}
              successLine={step.successLine}
              onLockedIn={onHoldLockedIn}
              onInteractingChange={setHoldInteracting}
            />
          ) : step.type === 'quote' ? (
            <QuoteStep onContinue={onInterstitialContinue} />
          ) : step.type === 'gap' ? (
            <GapStep
              q5Answer={answers[4] ?? null}
              onContinue={onInterstitialContinue}
            />
          ) : (
            <>
              <View style={styles.topSection}>
                <Text style={styles.title}>{step.title}</Text>

                <View style={styles.options}>
                  {step.type === 'choice' &&
                    step.options.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.optionBtn, selected === opt && styles.optionBtnActive]}
                        onPress={() => setSelected(opt)}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            selected === opt && styles.optionTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </View>
              <View style={styles.bottom}>
                <TouchableOpacity
                  style={[styles.button, !selected && styles.buttonDisabled]}
                  disabled={!selected}
                  onPress={handleContinue}
                >
                  <Text style={styles.buttonText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  swipeArea: { flex: 1 },
  inner: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  topSection: { flex: 1, justifyContent: 'center' },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 36,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  options: { gap: 12 },
  optionBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  optionBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  optionText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  optionTextActive: { color: colors.accentLight },
  bottom: { paddingBottom: spacing.xl },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
