import { useState, useRef, useEffect } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { loadOnboardingAnswers, saveOnboardingAnswers } from '@/lib/onboarding-local-state';
import {
  MAX_OTHER_SPORT_LEN,
  MAX_SPORT_LEN,
  OTHER_SENTINEL,
  PRESET_SPORTS,
  canSaveSports,
  joinSports,
  parseSports,
} from '@/lib/sport-presets';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';
import { trackOnboardingButtonClicked, trackOnboardingOptionSelected } from '@/lib/onboarding-analytics';

export default function SportSelectionScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');
  const fade = useRef(new Animated.Value(1)).current;
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    loadOnboardingAnswers().then((saved) => {
      if (saved.sport) {
        const parsed = parseSports(saved.sport);
        setSelected(parsed.selected);
        setOtherText(parsed.other);
      }
    });
  }, []);

  const isOther = selected.includes(OTHER_SENTINEL);
  const resolvedSport = joinSports(selected, otherText);
  const canContinue = canSaveSports(selected, otherText);

  const pick = (opt: string) => {
    Haptics.selectionAsync();
    const next = selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt];
    setSelected(next);
    if (next.includes(opt)) {
      trackOnboardingOptionSelected({
        step_key: 'sport_selection',
        step_index: ONBOARDING_PROGRESS.sportSelection,
        selected_option_key: opt,
      });
    }
    if (canSaveSports(next, otherText)) {
      saveOnboardingAnswers({ sport: joinSports(next, otherText) });
    }
  };

  const handleContinue = () => {
    if (!canContinue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackOnboardingButtonClicked({
      step_key: 'sport_selection',
      step_index: ONBOARDING_PROGRESS.sportSelection,
      button_key: 'continue',
      selected_option_key: resolvedSport.slice(0, MAX_SPORT_LEN),
    });
    saveOnboardingAnswers({ sport: resolvedSport.slice(0, MAX_SPORT_LEN) });
    router.push({
      pathname: '/(onboarding)/paywall' as any,
      params: { sport: resolvedSport.slice(0, MAX_SPORT_LEN) },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar
        step={ONBOARDING_PROGRESS.sportSelection}
        total={ONBOARDING_TOTAL_STEPS}
        onBack={onPop}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        {...panHandlers}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.inner, { opacity: fade, transform: [{ translateX: shellTranslateX }] }]}>
            <View style={styles.topSection}>
              <Text style={styles.title}>{"What's your sport?"}</Text>
              <Text style={styles.body}>
                {"We'll show this on your profile so the app feels personal to how you train."}
              </Text>
              <Text style={styles.hint}>Select all that apply</Text>

              <View style={styles.options}>
                {PRESET_SPORTS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.optionBtn, selected.includes(opt) && styles.optionBtnActive]}
                    onPress={() => pick(opt)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selected.includes(opt) && styles.optionTextActive,
                      ]}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {isOther ? (
                <TextInput
                  style={styles.otherInput}
                  placeholder="Type your sport"
                  placeholderTextColor={colors.textMuted}
                  value={otherText}
                  onChangeText={(t) => {
                    setOtherText(t);
                    if (canSaveSports(selected, t)) {
                      saveOnboardingAnswers({ sport: joinSports(selected, t) });
                    }
                  }}
                  maxLength={MAX_OTHER_SPORT_LEN}
                  autoCapitalize="words"
                  autoCorrect
                />
              ) : null}
            </View>

            <View style={styles.bottom}>
              <TouchableOpacity
                style={[styles.button, !canContinue && styles.buttonDisabled]}
                disabled={!canContinue}
                onPress={handleContinue}
              >
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  inner: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  topSection: { flex: 1, paddingTop: spacing.md },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 34,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
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
  otherInput: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  bottom: { paddingTop: spacing.lg },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
