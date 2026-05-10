import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { loadOnboardingAnswers, saveOnboardingAnswers } from '@/lib/onboarding-local-state';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';

function formatDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function toISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function CompetitionDateScreen() {
  const router = useRouter();
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();
  const { sport: sportParam } = useLocalSearchParams<{ sport?: string | string[] }>();
  const sportFromPrev = Array.isArray(sportParam) ? sportParam[0] : sportParam;
  const [date, setDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');

  useEffect(() => {
    loadOnboardingAnswers().then((saved) => {
      if (saved.competitionDate) setDate(new Date(saved.competitionDate));
    });
  }, []);

  const today = new Date();

  const onChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected) {
      setDate(selected);
      saveOnboardingAnswers({ competitionDate: toISODate(selected) });
    }
  };

  const goToPaywall = (compDate?: string) => {
    const sport = sportFromPrev?.trim();
    router.push({
      pathname: '/(onboarding)/paywall' as any,
      params: {
        ...(compDate ? { competitionDate: compDate } : {}),
        ...(sport ? { sport } : {}),
      },
    });
  };

  const saveAndContinue = () => {
    goToPaywall(date ? toISODate(date) : undefined);
  };

  const skip = () => goToPaywall();

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar
        step={ONBOARDING_PROGRESS.competitionDate}
        total={ONBOARDING_TOTAL_STEPS}
        onBack={onPop}
      />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.inner, { transform: [{ translateX: shellTranslateX }] }]}>
        <View style={styles.topSection}>
          <Text style={styles.title}>{"When's your next competition?"}</Text>
          <Text style={styles.body}>
            {"We'll use this to build your countdown and keep your training on track. You can skip this and add it later."}
          </Text>

          {Platform.OS === 'android' && !showPicker && (
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowPicker(true)}
            >
              <Text style={date ? styles.dateText : styles.datePlaceholder}>
                {date ? formatDate(date) : 'Select a date'}
              </Text>
            </TouchableOpacity>
          )}

          {Platform.OS === 'ios' && date && (
            <Text style={styles.selectedLabel}>{formatDate(date)}</Text>
          )}

          {showPicker && (
            <DateTimePicker
              value={date ?? today}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={today}
              onChange={onChange}
              themeVariant="dark"
              textColor={colors.white}
            />
          )}
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={styles.button}
            onPress={date ? saveAndContinue : skip}
          >
            <Text style={styles.buttonText}>
              {date ? 'Save & Continue' : 'Skip'}
            </Text>
          </TouchableOpacity>
          {date ? (
            <TouchableOpacity style={styles.skipButton} onPress={skip}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  inner: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  topSection: { flex: 1, justifyContent: 'center' },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    marginBottom: spacing.sm,
    lineHeight: 36,
  },
  body: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  dateButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dateText: { fontSize: 18, color: colors.white, letterSpacing: 1 },
  datePlaceholder: { fontSize: 16, color: colors.textMuted },
  selectedLabel: {
    fontSize: 14,
    color: colors.accentLight,
    textAlign: 'center',
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  bottomSection: { paddingBottom: spacing.xl },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  skipButton: { marginTop: spacing.md, alignItems: 'center' },
  skipText: { color: colors.textMuted, fontSize: 14 },
});
