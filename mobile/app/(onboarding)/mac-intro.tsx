import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing } from '@/lib/theme';

const PILLARS = [
  {
    letter: 'M',
    name: 'Mindfulness',
    description: 'Stay present and aware during competition.',
  },
  {
    letter: 'A',
    name: 'Acceptance',
    description: 'Handle discomfort without letting it control you.',
  },
  {
    letter: 'C',
    name: 'Commitment',
    description: "Act on your values even when it's hard.",
  },
];

export default function MacIntroScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.topSection}>
          <Text style={styles.title}>The MAC framework</Text>
          <Text style={styles.body}>
            Your training is built on three pillars used by elite sport
            psychologists.
          </Text>

          <View style={styles.pillars}>
            {PILLARS.map((p) => (
              <View key={p.letter} style={styles.pillarRow}>
                <View style={styles.letterBadge}>
                  <Text style={styles.letter}>{p.letter}</Text>
                </View>
                <View style={styles.pillarText}>
                  <Text style={styles.pillarName}>{p.name}</Text>
                  <Text style={styles.pillarDesc}>{p.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bottomSection}>
          <View style={styles.dots}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/(onboarding)/sample-exercise')}
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
  bottomSection: { paddingBottom: spacing.xl },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.lg,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accentLight, width: 24 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
