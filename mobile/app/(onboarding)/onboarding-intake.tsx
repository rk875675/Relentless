import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS, getIntakeProgressStep } from '@/lib/onboarding-progress';
import { loadOnboardingAnswers, saveOnboardingAnswers } from '@/lib/onboarding-local-state';
import {
  trackOnboardingButtonClicked,
  trackOnboardingOptionSelected,
  trackOnboardingWizardStepChanged,
} from '@/lib/onboarding-analytics';
import { colors, spacing } from '@/lib/theme';
import { useWizardSwipeBackRight } from '@/lib/use-wizard-swipe-back';

const MENTAL_RESULTS_OPTIONS = [
  'Completely different',
  'A lot',
  'Somewhat',
  'A little',
  'Not much',
] as const;

type ChoiceStep = { type: 'choice'; title: string; options: readonly string[] };
type StepDef = ChoiceStep;

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
  {
    type: 'choice',
    title: 'How different would your life be if you reached your full potential?',
    options: [...MENTAL_RESULTS_OPTIONS],
  },
];

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function OnboardingIntakeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>(() => Array(STEPS.length).fill(null));
  const fade = useRef(new Animated.Value(1)).current;
  const sheetTranslateX = useRef(new Animated.Value(0)).current;
  const questionIndexRef = useRef(questionIndex);
  questionIndexRef.current = questionIndex;
  const backingRef = useRef(false);
  const transitionDirRef = useRef<'fwd' | 'back'>('fwd');
  const restoredRef = useRef(false);
  const wizardClockRef = useRef<ReturnType<typeof trackOnboardingWizardStepChanged>>(null);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    loadOnboardingAnswers().then((saved) => {
      let rawAnswers = saved.intakeAnswers ?? [];
      let step = typeof saved.intakeStep === 'number' ? saved.intakeStep : 0;
      /** Pre–May 2026 intake had 10 steps including "how often … goals"; drop that slot when resuming. */
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
      /** Sep 2026: Simplified intake from 7 steps (with quote/gap interstitials) to 3 choice questions.
       *  Old layout: [Q0, Q1, quote, Q2-100%, gap, Q5-potential, Q6-strongly]
       *  New layout: [Q0, Q1, Q2(=old Q5)]
       *  Keep old answers for Q0 (idx 0) and Q1 (idx 1), remap old Q5 (idx 5) → new Q2 (idx 2). */
      if (rawAnswers.length > 3) {
        rawAnswers = [rawAnswers[0] ?? null, rawAnswers[1] ?? null, rawAnswers[5] ?? null];
        step = Math.min(step, STEPS.length - 1);
        saveOnboardingAnswers({ intakeAnswers: rawAnswers as (string | null)[], intakeStep: step });
      }
      const nextAnswers = [...rawAnswers];
      while (nextAnswers.length < STEPS.length) nextAnswers.push(null);
      if (nextAnswers.length) setAnswers(nextAnswers.slice(0, STEPS.length));
      if (step > 0) setQuestionIndex(Math.min(step, STEPS.length - 1));
    });
  }, []);

  const step = STEPS[questionIndex]!;
  const selected = answers[questionIndex];

  const goNext = useCallback(
    (fromIndex: number) => {
      if (fromIndex < STEPS.length - 1) {
        const next = fromIndex + 1;
        setQuestionIndex(next);
        saveOnboardingAnswers({ intakeStep: next });
      } else {
        router.push('/(onboarding)/unlocked-potential' as any);
      }
    },
    [router],
  );

  const runWizardBack = useCallback(() => {
    if (questionIndexRef.current <= 0 || backingRef.current) return;
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
        const next = i - 1;
        saveOnboardingAnswers({ intakeStep: next });
        return next;
      });
    });
  }, [sheetTranslateX]);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (questionIndexRef.current <= 0) return;
      e.preventDefault();
      runWizardBack();
    });
  }, [navigation, runWizardBack]);

  const swipeBackPan = useWizardSwipeBackRight(
    () => true,
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
    }
    Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    transitionDirRef.current = 'fwd';
  }, [questionIndex, fade, sheetTranslateX]);

  useEffect(() => {
    wizardClockRef.current = trackOnboardingWizardStepChanged({
      previous: wizardClockRef.current,
      next: {
        step_key: `intake_q${questionIndex}`,
        step_index: getIntakeProgressStep(questionIndex),
      },
    });
  }, [questionIndex]);

  useEffect(() => {
    return () => {
      wizardClockRef.current = trackOnboardingWizardStepChanged({
        previous: wizardClockRef.current,
        next: null,
      });
    };
  }, []);

  const setSelected = (opt: string) => {
    Haptics.selectionAsync();
    trackOnboardingOptionSelected({
      step_key: `intake_q${questionIndex}`,
      step_index: getIntakeProgressStep(questionIndex),
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
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackOnboardingButtonClicked({
      step_key: `intake_q${questionIndex}`,
      step_index: getIntakeProgressStep(questionIndex),
      button_key: 'continue',
    });
    transitionDirRef.current = 'fwd';
    goNext(questionIndex);
  };

  const progressStep = getIntakeProgressStep(questionIndex);

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
          <View style={styles.topSection}>
            <Text style={styles.title}>{step.title}</Text>

            <View style={styles.options}>
              {step.options.map((opt) => (
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
