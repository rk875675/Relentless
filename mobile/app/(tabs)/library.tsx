import { useCallback, useRef, useState } from 'react';
import {
  Linking,
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { apiFetch } from '@/lib/api';
import { getCached, setCached, bustCache } from '@/lib/api-cache';
import { getDeviceLocalCalendarYmd } from '@/lib/device-calendar';
import { ProgressRing, type ScoreDelta } from '@/components/ProgressRing';
import { getPendingGainDeltas, type MacDeltas } from '@/lib/pending-deltas';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';

type Progress = {
  mindfulness_score: number;
  acceptance_score: number;
  commitment_score: number;
  library_unlocked?: boolean;
  library_lock_reason?: string | null;
  library_lock_remaining?: number;
  deltas?: MacDeltas | null;
};

function safePct(n: number | undefined): number {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function ringBasePct(score: number | undefined, delta: ScoreDelta | undefined | null): number {
  const s = score ?? 0;
  if (delta && delta.amount > 0) return safePct(s - delta.amount);
  return safePct(s);
}

type Streak = {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
};

const MAC_CATEGORIES = [
  { id: 'mindfulness', label: 'Mindfulness', color: colors.ringMindfulness },
  { id: 'acceptance', label: 'Acceptance', color: colors.ringAcceptance },
  { id: 'commitment', label: 'Commitment', color: colors.ringCommitment },
] as const;

export default function LibraryScreen() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [activeDeltas, setActiveDeltas] = useState<MacDeltas | null>(null);
  const deltaDateRef = useRef<string | null>(null);

  const fetchData = async (isPull = false) => {
    setError('');
    if (isPull) {
      setRefreshing(true);
      bustCache('/progress', '/streak');
    } else {
      const cachedProgress = getCached<Progress>('/progress');
      const cachedStreak = getCached<Streak>('/streak');
      if (cachedProgress && cachedStreak) {
        setProgress(cachedProgress);
        setStreak(cachedStreak);
        const today = getDeviceLocalCalendarYmd();
        const gainDeltas = getPendingGainDeltas();
        if (gainDeltas) { setActiveDeltas(gainDeltas); deltaDateRef.current = today; }
        else if (cachedProgress.deltas && Object.keys(cachedProgress.deltas).length > 0) {
          setActiveDeltas(cachedProgress.deltas); deltaDateRef.current = today;
        } else if (deltaDateRef.current && deltaDateRef.current !== today) {
          setActiveDeltas(null); deltaDateRef.current = null;
        }
        setInitialLoadDone(true);
        return;
      }
    }
    const [progressRes, streakRes] = await Promise.all([
      apiFetch<Progress>('/progress'),
      apiFetch<Streak>('/streak'),
    ]);
    if (progressRes.error || streakRes.error) {
      setError([progressRes.error, streakRes.error].filter(Boolean).join(' · '));
    }
    const prog = progressRes.data ?? null;
    if (prog) setProgress(prog);
    if (streakRes.data) setStreak(streakRes.data);

    const today = getDeviceLocalCalendarYmd();
    const gainDeltas = getPendingGainDeltas();
    if (gainDeltas) {
      setActiveDeltas(gainDeltas);
      deltaDateRef.current = today;
    } else if (prog?.deltas && Object.keys(prog.deltas).length > 0) {
      setActiveDeltas(prog.deltas);
      deltaDateRef.current = today;
    } else if (deltaDateRef.current && deltaDateRef.current !== today) {
      setActiveDeltas(null);
      deltaDateRef.current = null;
    }

    if (prog && streakRes.data) {
      setCached('/progress', prog);
      setCached('/streak', streakRes.data);
    }

    setRefreshing(false);
    setInitialLoadDone(true);
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  const libraryUnlocked = true;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void fetchData(true)}
          tintColor={colors.accent}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brand}>RELENTLESS</Text>
        <View style={styles.streakPill}>
          <Text style={styles.streakNum}>{streak?.current_streak ?? 0}</Text>
          <Ionicons name="flame" size={16} color="#f59e0b" />
        </View>
      </View>

      {/* MAC Progress Rings */}
      <View style={styles.ringsRow}>
        <ProgressRing
          percentage={ringBasePct(progress?.mindfulness_score, activeDeltas?.mindfulness)}
          label="Mindfulness"
          delta={activeDeltas?.mindfulness}
          ringColor={colors.ringMindfulness}
        />
        <ProgressRing
          percentage={ringBasePct(progress?.acceptance_score, activeDeltas?.acceptance)}
          label="Acceptance"
          delta={activeDeltas?.acceptance}
          ringColor={colors.ringAcceptance}
        />
        <ProgressRing
          percentage={ringBasePct(progress?.commitment_score, activeDeltas?.commitment)}
          label="Commitment"
          delta={activeDeltas?.commitment}
          ringColor={colors.ringCommitment}
        />
      </View>

      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchData(false)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* MAC Category Bubbles */}
      {MAC_CATEGORIES.map((cat) => (
        <TouchableOpacity
          key={cat.id}
          style={styles.categoryBtn}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/category/${cat.id}`);
          }}
        >
          <View style={[styles.categoryAccent, { backgroundColor: cat.color }]} />
          <Text style={styles.categoryLabel}>{cat.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ))}

      {/* Coach CTA — PRD: subtle outbound path to coach for 1:1 help */}
      <TouchableOpacity
        style={styles.ctaCard}
        activeOpacity={0.8}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Linking.openURL('https://grantchiasson.com/home');
        }}
      >
        <Text style={styles.ctaTitle}>Want to go deeper?</Text>
        <Text style={styles.ctaByline}>Sessions with Grant</Text>
        <Text style={styles.ctaSub}>
          Personalized coaching for your specific goals
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  brand: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 3,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakNum: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 28,
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  lockedText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  categoryBtn: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 32,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBtnDisabled: {
    opacity: 0.45,
  },
  categoryAccent: {
    width: 4,
    height: 28,
    borderRadius: 2,
    marginRight: 16,
  },
  categoryLabel: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  ctaCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  ctaTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
  },
  ctaByline: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
    marginTop: 10,
  },
  ctaSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
  inlineError: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
});
