import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 12;

export default function TutorialProfileScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={10} total={TOTAL_STEPS} />
      <Animated.View style={[styles.inner, { opacity: fade }]}>
        <Text style={styles.screenLabel}>Profile Screen</Text>

        <View style={styles.mockup}>
          <View style={styles.mockHeader}>
            <Text style={styles.mockBrand}>RELENTLESS</Text>
            <View style={styles.mockStreak}>
              <Text style={styles.mockStreakNum}>0</Text>
              <Ionicons name="flame" size={14} color="#f59e0b" />
            </View>
          </View>

          {/* Avatar */}
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={24} color={colors.accent} />
            </View>
            <Text style={styles.avatarName}>You</Text>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="flame" size={14} color="#f59e0b" />
              <Text style={styles.statVal}>0</Text>
              <Text style={styles.statLabel}>Streak</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.stat}>
              <Ionicons name="trophy-outline" size={14} color={colors.accentLight} />
              <Text style={styles.statVal}>0</Text>
              <Text style={styles.statLabel}>Best</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.stat}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
              <Text style={styles.statVal}>0</Text>
              <Text style={styles.statLabel}>Lessons</Text>
            </View>
          </View>

          {/* Annotation for stats */}
          <View style={styles.callout}>
            <Ionicons name="stats-chart-outline" size={14} color={colors.accentLight} />
            <Text style={styles.calloutText}>Track your consistency and overall progress</Text>
          </View>

          {/* Settings rows */}
          <View style={styles.settingsRow}>
            <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
            <Text style={styles.settingsLabel}>Competition Date</Text>
          </View>
          <View style={styles.settingsRow}>
            <Ionicons name="journal-outline" size={15} color={colors.textMuted} />
            <Text style={styles.settingsLabel}>Journal Entries</Text>
          </View>

          <View style={styles.callout}>
            <Ionicons name="create-outline" size={14} color={colors.accentLight} />
            <Text style={styles.calloutText}>Set your competition date and review past journal entries</Text>
          </View>

          <View style={styles.mockTabBar}>
            <View style={styles.mockTab}><Ionicons name="book-outline" size={18} color={colors.textMuted} /><Text style={styles.mockTabText}>Library</Text></View>
            <View style={styles.mockTab}><Ionicons name="home-outline" size={18} color={colors.textMuted} /><Text style={styles.mockTabText}>Home</Text></View>
            <View style={styles.mockTab}><Ionicons name="person" size={18} color={colors.accentLight} /><Text style={[styles.mockTabText, { color: colors.accentLight }]}>Profile</Text></View>
          </View>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(onboarding)/competition-date');
            }}
          >
            <Text style={styles.buttonText}>Continue</Text>
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
  avatarRow: { alignItems: 'center', marginBottom: spacing.md },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accentSubtle,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  avatarName: { fontSize: 15, fontWeight: '700', color: colors.white },
  statsRow: {
    flexDirection: 'row', backgroundColor: colors.background, borderRadius: 14,
    padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'space-around', alignItems: 'center',
  },
  stat: { alignItems: 'center', gap: 3 },
  statVal: { fontSize: 16, fontWeight: '800', color: colors.white },
  statLabel: { fontSize: 10, color: colors.textMuted },
  statDiv: { width: 1, height: 28, backgroundColor: colors.border },
  callout: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  calloutText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.background, borderRadius: 12, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  settingsLabel: { fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
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
