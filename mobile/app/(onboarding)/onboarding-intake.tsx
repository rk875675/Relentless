import { useState, useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { colors, spacing } from '@/lib/theme';

type StepDef = {
  title: string;
  options: readonly string[];
};

const STEPS: StepDef[] = [
  {
    title: 'How important is mental toughness in your sport?',
    options: ['Not very', 'Somewhat', 'Quite important', 'Very important', 'Extremely important'],
  },
  {
    title: "What's your current long-term goal? (college, D1, pro, etc.)",
    options: ['High school / getting recruited', 'College athletics', 'D1 or higher', 'Pro / elite trajectory', 'Still figuring it out'],
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
      'If you performed at 100% mental toughness every time, how different would your results be?',
    options: ['Not much', 'A little', 'Somewhat', 'A lot', 'Completely different'],
  },
  {
    title: 'How different would your life be if you reached your full potential?',
    options: ['Not much', 'A little', 'Somewhat', 'A lot', 'Completely different'],
  },
  {
    title: 'How strongly do you want that level of performance?',
    options: ['Not much', 'A little', 'Somewhat', 'Strongly', 'More than anything'],
  },
  {
    title: "Are you willing to commit to reaching that level, even if it's not easy?",
    options: ['Yes', "I'm not sure yet", 'Not right now'],
  },
];

export default function OnboardingIntakeScreen() {
  const router = useRouter();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>(() => Array(STEPS.length).fill(null));
  const fade = useRef(new Animated.Value(1)).current;

  const step = STEPS[questionIndex]!;
  const selected = answers[questionIndex];

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [questionIndex]);

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
      setQuestionIndex((i) => i - 1);
    } else {
      router.back();
    }
  };

  const handleContinue = () => {
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (questionIndex < STEPS.length - 1) {
      setQuestionIndex((i) => i + 1);
    } else {
      router.push('/(onboarding)/mac-framework' as any); // TEMP: reviews hidden — restore to '/(onboarding)/unlocked-potential'
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
      <Animated.View style={[styles.inner, { opacity: fade }]}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
