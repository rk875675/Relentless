import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 12;

export default function TutorialLibraryDetailScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={9} total={TOTAL_STEPS} />
      <Animated.View style={[styles.inner, { opacity: fade }]}>
        <Text style={styles.screenLabel}>Library Screen</Text>

        <View style={styles.mockup}>
          {/* Category header */}
          <View style={styles.catHeader}>
            <View style={[styles.catDot, { backgroundColor: colors.ringMindfulness }]} />
            <Text style={styles.catHeaderText}>Mindfulness</Text>
          </View>

          {/* Mock exercise rows */}
          <View style={styles.exerciseRow}>
            <View style={styles.exerciseInfo}>
              <Text style={styles.exerciseName}>Box Breathing</Text>
              <Text style={styles.exerciseMeta}>3 min</Text>
            </View>
            <Ionicons name="play-circle-outline" size={22} color={colors.textMuted} />
          </View>
          <View style={styles.exerciseRow}>
            <View style={styles.exerciseInfo}>
              <Text style={styles.exerciseName}>Box Breathing</Text>
              <Text style={styles.exerciseMeta}>8 min</Text>
            </View>
            <Ionicons name="play-circle-outline" size={22} color={colors.textMuted} />
          </View>
          <View style={styles.exerciseRow}>
            <View style={styles.exerciseInfo}>
              <Text style={styles.exerciseName}>Body Scan</Text>
              <Text style={styles.exerciseMeta}>5 min</Text>
            </View>
            <Ionicons name="play-circle-outline" size={22} color={colors.textMuted} />
          </View>

          {/* Annotation */}
          <View style={styles.annotation}>
            <Ionicons name="information-circle" size={16} color={colors.accent} />
            <Text style={styles.annotationText}>
              Each exercise comes in short and long versions so you can pick what fits your schedule.
            </Text>
          </View>

          {/* Second callout */}
          <View style={styles.callout}>
            <Ionicons name="refresh-outline" size={14} color={colors.accentLight} />
            <Text style={styles.calloutText}>Revisit past WODs here to reinforce what you learned</Text>
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
              router.push('/(onboarding)/tutorial-profile' as any);
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
  catHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md,
    paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catHeaderText: { fontSize: 18, fontWeight: '700', color: colors.white },
  exerciseRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.background, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  exerciseInfo: { gap: 2 },
  exerciseName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  exerciseMeta: { fontSize: 12, color: colors.textMuted },
  annotation: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.06)', borderRadius: 12,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.accent,
    marginTop: spacing.sm, marginBottom: spacing.sm,
  },
  annotationText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
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
