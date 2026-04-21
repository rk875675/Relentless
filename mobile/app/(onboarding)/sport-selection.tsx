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
import { MAX_SPORT_LEN, OTHER_SENTINEL, PRESET_SPORTS } from '@/lib/sport-presets';
import { colors, spacing } from '@/lib/theme';

export default function SportSelectionScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);

  const isOther = selected === OTHER_SENTINEL;
  const resolvedSport = isOther ? otherText.trim() : selected?.trim() ?? '';
  const canContinue =
    resolvedSport.length > 0 &&
    (!isOther || otherText.trim().length >= 2) &&
    resolvedSport.length <= MAX_SPORT_LEN;

  const pick = (opt: string) => {
    Haptics.selectionAsync();
    setSelected(opt);
    if (opt !== OTHER_SENTINEL) setOtherText('');
  };

  const handleContinue = () => {
    if (!canContinue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/(onboarding)/competition-date' as any,
      params: { sport: resolvedSport.slice(0, MAX_SPORT_LEN) },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={ONBOARDING_PROGRESS.sportSelection} total={ONBOARDING_TOTAL_STEPS} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.inner, { opacity: fade }]}>
            <View style={styles.topSection}>
              <Text style={styles.title}>{"What's your sport?"}</Text>
              <Text style={styles.body}>
                {"We'll show this on your profile so the app feels personal to how you train."}
              </Text>

              <View style={styles.options}>
                {PRESET_SPORTS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.optionBtn, selected === opt && styles.optionBtnActive]}
                    onPress={() => pick(opt)}
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

              {isOther ? (
                <TextInput
                  style={styles.otherInput}
                  placeholder="Type your sport"
                  placeholderTextColor={colors.textMuted}
                  value={otherText}
                  onChangeText={setOtherText}
                  maxLength={MAX_SPORT_LEN}
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
