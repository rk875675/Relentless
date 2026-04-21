import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 12;

export default function TutorialHomeScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={6} total={TOTAL_STEPS} />
      <Animated.View style={[styles.inner, { opacity: fade }]}>
        <Text style={styles.screenLabel}>Home Screen</Text>

        <View style={styles.mockup}>
          {/* Top content flows naturally */}
          <View>
            <View style={styles.mockHeader}>
              <Text style={styles.mockBrand}>RELENTLESS</Text>
              <View style={styles.mockStreak}>
                <Text style={styles.mockStreakNum}>0</Text>
                <Ionicons name="flame" size={14} color="#f59e0b" />
              </View>
            </View>

            {/* Streak callout */}
            <View style={styles.callout}>
              <Ionicons name="flame" size={14} color="#f59e0b" />
              <Text style={styles.calloutText}>Your streak — complete a workout every day to keep it going</Text>
            </View>

            {/* Mock rings */}
            <View style={styles.mockRingsRow}>
              {[
                { l: 'M', label: 'Mindfulness' },
                { l: 'A', label: 'Acceptance' },
                { l: 'C', label: 'Commitment' },
              ].map((r) => (
                <View key={r.l} style={styles.ringCol}>
                  <View style={styles.mockRing}>
                    <Text style={styles.mockRingPct}>0%</Text>
                  </View>
                  <Text style={styles.ringLabel}>{r.label}</Text>
                </View>
              ))}
            </View>

            {/* Callout for rings — tight to rings */}
            <View style={styles.callout}>
              <Ionicons name="pie-chart-outline" size={14} color={colors.accentLight} />
              <Text style={styles.calloutText}>Your MAC scores grow as you train</Text>
            </View>

            {/* Mock WOD card */}
            <View style={styles.mockWod}>
              <Text style={styles.mockWodLabel}>THE 30-DAY SPRINT</Text>
              <Text style={styles.mockWodDay}>DAY 1/30</Text>
              <Text style={styles.mockWodTitle}>What MAC Training Actually Is</Text>
              <View style={styles.mockWodMeta}>
                <Text style={styles.mockWodMetaText}>3 min</Text>
              </View>
            </View>

            {/* Mock journal */}
            <View style={styles.mockJournal}>
              <Text style={styles.mockJournalLabel}>PRE-WORKOUT JOURNAL</Text>
              <View style={styles.mockJournalInput}>
                <Text style={styles.mockJournalPlaceholder}>What do you want to focus on today?</Text>
              </View>
            </View>
          </View>

          {/* Tab bar pinned to bottom */}
          <View style={styles.mockTabBar}>
            <View style={styles.mockTab}><Ionicons name="book-outline" size={18} color={colors.textMuted} /><Text style={styles.mockTabText}>Library</Text></View>
            <View style={styles.mockTab}><Ionicons name="home" size={18} color={colors.accentLight} /><Text style={[styles.mockTabText, { color: colors.accentLight }]}>Home</Text></View>
            <View style={styles.mockTab}><Ionicons name="person-outline" size={18} color={colors.textMuted} /><Text style={styles.mockTabText}>Profile</Text></View>
          </View>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(onboarding)/tutorial-home-detail' as any);
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
    borderColor: colors.border, paddingHorizontal: spacing.md, paddingTop: 20, paddingBottom: 12,
    justifyContent: 'space-between',
  },
  mockHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  mockBrand: { fontSize: 15, fontWeight: '900', color: colors.white, letterSpacing: 3 },
  mockStreak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mockStreakNum: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  callout: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.border, marginBottom: 6,
  },
  calloutText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  mockRingsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 6 },
  ringCol: { alignItems: 'center', gap: 3 },
  mockRing: {
    width: 46, height: 46, borderRadius: 23, borderWidth: 3,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  mockRingPct: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  ringLabel: { fontSize: 9, color: colors.textMuted },
  mockWod: {
    backgroundColor: colors.background, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginTop: 4,
  },
  mockWodLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 1.5, marginBottom: 2 },
  mockWodDay: { fontSize: 20, fontWeight: '800', color: colors.white, marginBottom: 4 },
  mockWodTitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  mockWodMeta: {
    backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  mockWodMetaText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  mockJournal: {
    backgroundColor: colors.background, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.border, marginTop: 6,
  },
  mockJournalLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, marginBottom: 6 },
  mockJournalInput: {
    backgroundColor: colors.surface, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  mockJournalPlaceholder: { fontSize: 12, color: colors.textMuted },
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
