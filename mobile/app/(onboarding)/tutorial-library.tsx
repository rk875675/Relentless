import { useRef, useEffect } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';

const TOTAL_STEPS = 12;

const CATEGORIES = [
  { label: 'Mindfulness', color: colors.ringMindfulness },
  { label: 'Acceptance', color: colors.ringAcceptance },
  { label: 'Commitment', color: colors.ringCommitment },
];

export default function TutorialLibraryScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={8} total={TOTAL_STEPS} onBack={onPop} />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.inner, { opacity: fade, transform: [{ translateX: shellTranslateX }] }]}>
        <Text style={styles.screenLabel}>Library Screen</Text>

        <View style={styles.mockupOuter}>
          <ScrollView
            style={styles.mockupScroll}
            contentContainerStyle={styles.mockupScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.mockHeader}>
              <Text style={styles.mockBrand}>RELENTLESS</Text>
              <View style={styles.mockStreak}>
                <Text style={styles.mockStreakNum}>0</Text>
                <Ionicons name="flame" size={14} color="#f59e0b" />
              </View>
            </View>

            {/* M + callout (Mindfulness); A/C barely visible on their own row */}
            <View style={styles.mindTipRow}>
              <View style={styles.mColumn}>
                <View style={styles.mRingFull}>
                  <Text style={styles.mRingText}>M</Text>
                </View>
              </View>
              <View style={styles.annotation}>
                <Ionicons name="book" size={14} color={colors.accent} />
                <Text style={styles.annotationText}>
                  Relentless is split into 3 categories. Each one targets a different part of your mental game.
                </Text>
              </View>
            </View>
            <View style={styles.faintRingsRow}>
              <View style={[styles.mockRing, styles.ringFaint]}>
                <Text style={[styles.mockRingLabel, styles.ringFaintText]}>A</Text>
              </View>
              <View style={[styles.mockRing, styles.ringFaint]}>
                <Text style={[styles.mockRingLabel, styles.ringFaintText]}>C</Text>
              </View>
            </View>

            {CATEGORIES.map((cat) => (
              <View key={cat.label} style={styles.mockCategory}>
                <View style={[styles.catAccent, { backgroundColor: cat.color }]} />
                <Text style={styles.catLabel}>{cat.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            ))}

            <View style={styles.callout}>
              <Ionicons name="fitness-outline" size={14} color={colors.accentLight} />
              <Text style={styles.calloutText}>
                Use these anytime — before practice, on game day, or as extra reps
              </Text>
            </View>
          </ScrollView>

          <View style={styles.mockTabBar}>
            <View style={styles.mockTab}>
              <Ionicons name="book" size={18} color={colors.accentLight} />
              <Text style={[styles.mockTabText, { color: colors.accentLight }]}>Library</Text>
            </View>
            <View style={styles.mockTab}>
              <Ionicons name="home-outline" size={18} color={colors.textMuted} />
              <Text style={styles.mockTabText}>Home</Text>
            </View>
            <View style={styles.mockTab}>
              <Ionicons name="person-outline" size={18} color={colors.textMuted} />
              <Text style={styles.mockTabText}>Profile</Text>
            </View>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  inner: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  screenLabel: {
    fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 1,
    textTransform: 'uppercase', textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.md,
  },
  mockupOuter: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 20, 0.99)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  mockupScroll: { flex: 1 },
  mockupScrollContent: { paddingHorizontal: spacing.md, paddingTop: 20, paddingBottom: 12, flexGrow: 1 },
  mockHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md,
  },
  mockBrand: { fontSize: 15, fontWeight: '900', color: colors.white, letterSpacing: 3 },
  mockStreak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mockStreakNum: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  mindTipRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8,
  },
  mColumn: { alignItems: 'center' },
  mRingFull: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: colors.ringMindfulness,
    backgroundColor: 'rgba(96, 165, 250, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mRingText: { fontSize: 12, fontWeight: '800', color: colors.ringMindfulness },
  faintRingsRow: { flexDirection: 'row', justifyContent: 'center', gap: 32, marginBottom: spacing.md },
  mockRing: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 3,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  /** Just barely read A and C; bump slightly if too ghosted */
  ringFaint: { opacity: 0.55 },
  ringFaintText: { opacity: 0.9 },
  mockRingLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  annotation: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.08)', borderRadius: 12,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.accent, alignSelf: 'flex-start',
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
    borderTopWidth: 1, borderColor: colors.border, paddingTop: 10, paddingBottom: 12, paddingHorizontal: 4,
  },
  mockTab: { alignItems: 'center', gap: 2 },
  mockTabText: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
  bottom: { paddingTop: spacing.md, paddingBottom: spacing.xl },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
