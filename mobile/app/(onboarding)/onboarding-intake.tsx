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
type StepDef = ChoiceStep | HoldStep;

const STEPS: StepDef[] = [
  {
    type: 'choice',
    title: 'How important is mental toughness in your sport?',
    options: ['Extremely important', 'Very important', 'Quite important', 'Somewhat', 'Not very'],
  },
  {
    type: 'choice',
    title: "What's your current long-term goal?",
    options: [
      'Pro',
      'D1 or college athletics',
      'Win state or nationals',
      'Make varsity',
      'Still figuring it out',
    ],
  },
  {
    type: 'choice',
    title: 'How often do you think about your goals?',
    options: ['Often', 'Sometimes', 'Rarely'],
  },
  {
    type: 'choice',
    title: 'How often do you feel you could have done more after a comp?',
    options: ['Always', 'Often', 'Sometimes', 'Rarely', 'Never'],
  },
  {
    type: 'choice',
    title: "How different would your results be if you gave it 100% mentally?",
    options: [...MENTAL_RESULTS_OPTIONS],
  },
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
  {
    type: 'hold',
    title: 'Are you willing to commit to reaching that level?',
    overlayLine: 'Locking in your commitment',
    successLine: "You're in",
    holdDurationMs: HOLD_MS,
  },
];

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
    const t1 = setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), ms * 0.25);
    const t2 = setTimeout(() => void Haptics.selectionAsync(), ms * 0.5);
    const t3 = setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), ms * 0.75);
    tickersRef.current = [t1, t2, t3];
  }, []);

  const onPressIn = useCallback(() => {
    if (phase !== 'idle' || navigatedRef.current) return;
    completedRef.current = false;
    holdProgress.setValue(0);
    setPhase('holding');
    onInteractingChange(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    color: colors.success,
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
  useEffect(() => {
    holdInteractingRef.current = holdInteracting;
  }, [holdInteracting]);

  useFocusEffect(
    useCallback(() => {
      setHoldInteracting(false);
    }, []),
  );

  const step = STEPS[questionIndex]!;
  const isHoldStep = step.type === 'hold';
  const selected = answers[questionIndex];
  const holdCompleted = isHoldStep && selected === 'Committed';

  const goNext = useCallback(
    (fromIndex: number) => {
      if (fromIndex < STEPS.length - 1) {
        setQuestionIndex((i) => i + 1);
      } else {
        router.push('/(onboarding)/unlocked-potential' as any);
      }
    },
    [router],
  );

  const onHoldLockedIn = useCallback(() => {
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndexRef.current] = 'Committed';
      return next;
    });
    transitionDirRef.current = 'fwd';
    router.push('/(onboarding)/unlocked-potential' as any);
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
        if (i === 7) setHoldBlockReset((k) => k + 1);
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
      questionIndexRef.current > 0 &&
      !(
        STEPS[questionIndexRef.current]!.type === 'hold' && holdInteractingRef.current
      ),
    runWizardBack,
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
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = opt;
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

  const handleContinue = () => {
    if (isHoldStep && !holdCompleted) return;
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    transitionDirRef.current = 'fwd';
    if (holdCompleted) {
      router.push('/(onboarding)/unlocked-potential' as any);
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
