import { useState, useRef, useEffect, useCallback } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { colors, spacing } from '@/lib/theme';
import { useWizardSwipeBackRight } from '@/lib/use-wizard-swipe-back';

type StepDef = {
  title: string;
  options: readonly string[];
};

const STEPS: StepDef[] = [
  {
    title: 'How important is mental toughness in your sport?',
    options: ['Extremely important', 'Very important', 'Quite important', 'Somewhat', 'Not very'],
  },
  {
    title: "What's your current long-term goal? (college, D1, pro, etc.)",
    options: [
      'Pro / elite trajectory',
      'D1 or higher',
      'College athletics',
      'High school / getting recruited',
      'Still figuring it out',
    ],
  },
  {
    title: 'After a comp, could you have done more?',
    options: ['Often', 'Sometimes', 'Rarely'],
  },
  {
    title: 'How often do you think about your goals?',
    options: ['Often', 'Sometimes', 'Rarely'],
  },
  {
    title:
      'If you showed up mentally every time, how different would your results be?',
    options: ['Completely different', 'A lot', 'Somewhat', 'A little', 'Not much'],
  },
  {
    title: 'How different would your life be if you reached your full potential?',
    options: ['Completely different', 'A lot', 'Somewhat', 'A little', 'Not much'],
  },
  {
    title: 'How strongly do you want that level of performance?',
    options: ['More than anything', 'Strongly', 'Somewhat', 'A little', 'Not much'],
  },
  {
    title: "Are you willing to commit to reaching that level, even if it's not easy?",
    options: ['Yes', "I'm not sure yet", 'Not right now'],
  },
];

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

  const step = STEPS[questionIndex]!;
  const selected = answers[questionIndex];

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
      setQuestionIndex((i) => i - 1);
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
    () => questionIndexRef.current > 0,
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
    transitionDirRef.current = 'fwd';
    if (questionIndex < STEPS.length - 1) {
      setQuestionIndex((i) => i + 1);
    } else {
      router.push('/(onboarding)/unlocked-potential' as any);
    }
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
        <Animated.View style={[styles.inner, { opacity: fade, transform: [{ translateX: sheetTranslateX }] }]}>
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
