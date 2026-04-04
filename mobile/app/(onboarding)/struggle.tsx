import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 8;

const STRUGGLES = [
  'Pre-race anxiety',
  'Choking under pressure',
  'Losing focus',
  'Self-doubt',
  'Bouncing back after bad races',
  'Staying consistent',
];

export default function StruggleScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (item: string) => {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={7} total={TOTAL_STEPS} />
      <View style={styles.inner}>
        <View style={styles.topSection}>
          <Text style={styles.title}>What gets in your way most?</Text>
          <Text style={styles.body}>
            Pick the biggest challenge you want to improve first.
          </Text>

          <View style={styles.options}>
            {STRUGGLES.map((s) => {
              const active = selected.includes(s);
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => toggle(s)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {s}
                  </Text>
                  <View style={[styles.check, active && styles.checkActive]}>
                    {active && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[styles.button, selected.length === 0 && styles.buttonDisabled]}
            onPress={() => router.push('/(onboarding)/competition-date')}
            disabled={selected.length === 0}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
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
  options: { gap: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  pillActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  pillText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  pillTextActive: { color: colors.white, fontWeight: '600' },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkMark: { fontSize: 12, color: colors.white, fontWeight: '700' },
  bottomSection: { paddingBottom: spacing.xl },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
