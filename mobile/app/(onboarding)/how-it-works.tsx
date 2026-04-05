import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 6;

const PILLARS = [
  {
    letter: 'M',
    name: 'Mindfulness',
    desc: 'Stay present and aware during competition.',
  },
  {
    letter: 'A',
    name: 'Acceptance',
    desc: 'Handle discomfort without letting it control you.',
  },
  {
    letter: 'C',
    name: 'Commitment',
    desc: "Act on your values even when it's hard.",
  },
];

export default function HowItWorksScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={3} total={TOTAL_STEPS} />
      <View style={styles.inner}>
        <View style={styles.topSection}>
          <Text style={styles.badge}>THE METHOD</Text>
          <Text style={styles.title}>Built on the MAC framework</Text>
          <Text style={styles.body}>
            Used by elite sport psychologists to help athletes perform under pressure.
          </Text>

          <View style={styles.pillars}>
            {PILLARS.map((p) => (
              <View key={p.letter} style={styles.pillarRow}>
                <View style={styles.letterBadge}>
                  <Text style={styles.letter}>{p.letter}</Text>
                </View>
                <View style={styles.pillarText}>
                  <Text style={styles.pillarName}>{p.name}</Text>
                  <Text style={styles.pillarDesc}>{p.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.footer}>
            Daily sessions, 3-5 minutes, guided by sport psychologists
          </Text>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/(onboarding)/sample-exercise')}
          >
            <Text style={styles.buttonText}>Try a Quick Exercise</Text>
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
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
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
    marginBottom: spacing.xl,
  },
  pillars: { gap: 20 },
  pillarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  letterBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: { fontSize: 20, fontWeight: '800', color: colors.accentLight },
  pillarText: { flex: 1 },
  pillarName: { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 2 },
  pillarDesc: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  footer: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    letterSpacing: 0.3,
  },
  bottom: { paddingBottom: spacing.xl },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
