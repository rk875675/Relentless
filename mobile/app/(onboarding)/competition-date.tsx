import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 12;

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
  const [date, setDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');

  const today = new Date();

  const onChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected) setDate(selected);
  };

  const goToSignup = (compDate?: string) => {
    router.push({
      pathname: '/(onboarding)/signup' as any,
      params: compDate ? { competitionDate: compDate } : {},
    });
  };

  const saveAndContinue = () => {
    goToSignup(date ? toISODate(date) : undefined);
  };

  const skip = () => goToSignup();

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={11} total={TOTAL_STEPS} />
      <View style={styles.inner}>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
