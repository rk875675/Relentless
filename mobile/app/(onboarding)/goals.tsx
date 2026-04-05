import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 6;

const OUTCOMES = [
  {
    icon: 'eye-outline' as const,
    title: 'Compete with unshakeable focus',
    desc: 'Stay locked in when it matters most — no distractions, no drift.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Stay composed under pressure',
    desc: 'Handle nerves and adversity without losing your edge.',
  },
  {
    icon: 'flash-outline' as const,
    title: 'Build bulletproof confidence',
    desc: 'Show up to every race knowing you belong at the line.',
  },
];

export default function GoalsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={2} total={TOTAL_STEPS} />
      <View style={styles.inner}>
        <View style={styles.topSection}>
          <Text style={styles.title}>What Relentless helps you achieve</Text>

          <View style={styles.outcomes}>
            {OUTCOMES.map((o) => (
              <View key={o.title} style={styles.row}>
                <View style={styles.iconWrap}>
                  <Ionicons name={o.icon} size={22} color={colors.accentLight} />
                </View>
                <View style={styles.textCol}>
                  <Text style={styles.rowTitle}>{o.title}</Text>
                  <Text style={styles.rowDesc}>{o.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/(onboarding)/how-it-works')}
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
    marginBottom: spacing.xl,
    lineHeight: 36,
  },
  outcomes: { gap: 24 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, paddingTop: 2 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 4 },
  rowDesc: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  bottom: { paddingBottom: spacing.xl },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
