import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 12;

const CATEGORIES = [
  { label: 'Mindfulness', color: colors.ringMindfulness },
  { label: 'Acceptance', color: colors.ringAcceptance },
  { label: 'Commitment', color: colors.ringCommitment },
];

export default function TutorialLibraryScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={8} total={TOTAL_STEPS} />
      <Animated.View style={[styles.inner, { opacity: fade }]}>
        <Text style={styles.screenLabel}>Library Screen</Text>

        <View style={styles.mockup}>
          <View style={styles.mockHeader}>
            <Text style={styles.mockBrand}>RELENTLESS</Text>
            <View style={styles.mockStreak}>
              <Text style={styles.mockStreakNum}>0</Text>
              <Ionicons name="flame" size={14} color="#f59e0b" />
            </View>
          </View>

          <View style={styles.mockRingsRow}>
            {['M', 'A', 'C'].map((l) => (
              <View key={l} style={styles.mockRing}><Text style={styles.mockRingLabel}>{l}</Text></View>
            ))}
          </View>

          {/* Callout: what the library is */}
          <View style={styles.annotation}>
            <Ionicons name="book" size={14} color={colors.accent} />
            <Text style={styles.annotationText}>
              Relentless is split into 3 categories. Each one targets a different part of your mental game.
            </Text>
          </View>

          {/* Mock category rows */}
          {CATEGORIES.map((cat) => (
            <View key={cat.label} style={styles.mockCategory}>
              <View style={[styles.catAccent, { backgroundColor: cat.color }]} />
              <Text style={styles.catLabel}>{cat.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          ))}

          {/* Callout */}
          <View style={styles.callout}>
            <Ionicons name="fitness-outline" size={14} color={colors.accentLight} />
            <Text style={styles.calloutText}>Use these anytime — before practice, on game day, or as extra reps</Text>
          </View>

          <View style={styles.mockTabBar}>
            <View style={styles.mockTab}><Ionicons name="book" size={18} color={colors.accentLight} /><Text style={[styles.mockTabText, { color: colors.accentLight }]}>Library</Text></View>
            <View style={styles.mockTab}><Ionicons name="home-outline" size={18} color={colors.textMuted} /><Text style={styles.mockTabText}>Home</Text></View>
            <View style={styles.mockTab}><Ionicons name="person-outline" size={18} color={colors.textMuted} /><Text style={styles.mockTabText}>Profile</Text></View>
          </View>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(onboarding)/tutorial-library-detail' as any);
            }}
          >
            <Text style={styles.buttonText}>Next</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  screenLabel: {
    fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 1,
    textTransform: 'uppercase', textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.md,
  },
  mockup: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: spacing.md, paddingTop: 28, paddingBottom: 12,
    justifyContent: 'space-between',
  },
  mockHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm,
  },
  mockBrand: { fontSize: 15, fontWeight: '900', color: colors.white, letterSpacing: 3 },
  mockStreak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mockStreakNum: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  mockRingsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.sm },
  mockRing: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 3,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  mockRingLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  annotation: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.06)', borderRadius: 12,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.accent, marginBottom: spacing.sm,
  },
  annotationText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  mockCategory: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background,
    borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  catAccent: { width: 4, height: 22, borderRadius: 2, marginRight: 12 },
  catLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  callout: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  calloutText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  mockTabBar: {
    flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.background,
    borderRadius: 20, paddingVertical: 8, borderWidth: 1, borderColor: colors.border,
  },
  mockTab: { alignItems: 'center', gap: 2 },
  mockTabText: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
  bottom: { paddingTop: spacing.md, paddingBottom: spacing.xl },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
