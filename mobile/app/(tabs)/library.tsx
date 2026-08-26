import { useCallback, useRef, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
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
import { coachAvatarSource } from '@/lib/coach-photo';
import { trackPackOpened } from '@/lib/core-analytics';
import { LessonPackListSkeleton } from '@/components/Skeleton';

type Progress = {
  mindfulness_score: number;
  acceptance_score: number;
  commitment_score: number;
  deltas?: MacDeltas | null;
};

/** Row from GET /programs?include_active=1 — the user's lesson packs with progress. */
type LessonPack = {
  id: string;
  title: string;
  coach_name: string;
  coach_sport?: string | null;
  coach_avatar_url?: string | null;
  cover_image?: string | null;
  day1_lesson_id?: string | null;
  started?: boolean;
  current_day?: number | null;
  is_active?: boolean;
  total_days?: number | null;
  completed?: boolean;
};

type LessonPacksResponse = { items: LessonPack[] };

const PACKS_CACHE_KEY = '/programs?include_active=1';

/** Active first, then in-progress (started, not completed), then completed, then never-started. */
function sortPacks(items: LessonPack[]): LessonPack[] {
  const rank = (p: LessonPack) => {
    if (p.is_active) return 0;
    if (p.started && !p.completed) return 1;
    if (p.completed) return 2;
    return 3;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/**
 * A previously-finished pack the user restarted and is actively redoing:
 * show live day progress (ACTIVE badge + "Day X of N") instead of the sticky
 * COMPLETED state, which would otherwise hide where they are in the re-run.
 */
function isActivelyRedoing(pack: LessonPack): boolean {
  return (
    pack.is_active === true &&
    pack.completed === true &&
    typeof pack.current_day === 'number' &&
    typeof pack.total_days === 'number' &&
    pack.total_days > 0 &&
    pack.current_day < pack.total_days
  );
}

/** 0..1 fraction of the pack completed, for the progress bar fill. */
function packProgressFraction(pack: LessonPack): number {
  if (pack.completed && !isActivelyRedoing(pack)) return 1;
  if (!pack.started || !pack.total_days || pack.total_days <= 0) return 0;
  const completedDays = Math.max((pack.current_day ?? 1) - 1, 0);
  return Math.min(1, Math.max(0, completedDays / pack.total_days));
}

function packProgressLabel(pack: LessonPack): string {
  if (pack.completed && !isActivelyRedoing(pack)) return 'Completed';
  if (!pack.started) return 'Not started';
  const day = pack.current_day ?? 1;
  return pack.total_days ? `Day ${day} of ${pack.total_days}` : `Day ${day}`;
}

/** cover_image is only ever a full URL when set; otherwise fall back to the
 * coach avatar (same hero pattern as the Programs screen / Home WOD card). */
function packImageSource(pack: LessonPack): ImageSourcePropType | null {
  if (pack.cover_image && /^https?:\/\//i.test(pack.cover_image)) {
    return { uri: pack.cover_image };
  }
  return coachAvatarSource(pack.coach_avatar_url, pack.coach_name);
}

type PackCardProps = {
  pack: LessonPack;
  onPress: () => void;
};

function PackCard({ pack, onPress }: PackCardProps) {
  const image = packImageSource(pack);
  const fraction = packProgressFraction(pack);

  return (
    <TouchableOpacity
      style={[styles.packCard, pack.is_active && styles.packCardActive]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.packImageWrap}>
        {image ? (
          <Image source={image} style={styles.packImage} resizeMode="cover" />
        ) : (
          <View style={styles.packImagePlaceholder}>
            <Ionicons name="person" size={24} color={colors.textSecondary} />
          </View>
        )}
      </View>

      <View style={styles.packBody}>
        <View style={styles.packCoachRow}>
          <Text style={styles.packCoachLine} numberOfLines={1}>
            {pack.coach_name}
          </Text>
          {pack.completed && !isActivelyRedoing(pack) ? (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={11} color={colors.accentLight} />
              <Text style={styles.completedBadgeText}>COMPLETED</Text>
            </View>
          ) : pack.is_active ? (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>ACTIVE</Text>
            </View>
          ) : null}
        </View>
        {pack.coach_sport ? (
          <Text style={styles.packSportLine} numberOfLines={1}>
            {pack.coach_sport}
          </Text>
        ) : null}
        <Text style={styles.packTitle} numberOfLines={1}>{pack.title}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
        </View>
        <Text style={styles.packProgressLabel}>{packProgressLabel(pack)}</Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

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
  /** null = not yet loaded this session (skeleton). */
  const [packs, setPacks] = useState<LessonPack[] | null>(null);
  const [packsError, setPacksError] = useState('');

  const fetchPacks = useCallback(async (isPull = false) => {
    setPacksError('');
    if (isPull) {
      bustCache(PACKS_CACHE_KEY);
    } else {
      const cached = getCached<LessonPacksResponse>(PACKS_CACHE_KEY);
      if (cached) setPacks(sortPacks(cached.items ?? []));
    }
    const { data, error: err } = await apiFetch<LessonPacksResponse>(PACKS_CACHE_KEY);
    if (err) {
      setPacksError(err);
    } else if (data) {
      setPacks(sortPacks(data.items ?? []));
      setCached(PACKS_CACHE_KEY, data);
    }
  }, []);

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
      void fetchPacks();
    }, [fetchPacks]),
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void fetchData(true);
            void fetchPacks(true);
          }}
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

      {/* Lesson Packs */}
      <Text style={styles.sectionHeader}>Lesson Packs</Text>
      {packs === null ? (
        <LessonPackListSkeleton />
      ) : packsError ? (
        <View style={styles.inlineError}>
          <Text style={styles.errorText}>{packsError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchPacks()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.packsList}>
          {packs.map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                trackPackOpened({
                  program_id: pack.id,
                  program_title: pack.title,
                  coach_name: pack.coach_name,
                  is_active: pack.is_active ?? false,
                  started: pack.started ?? false,
                  completed: pack.completed ?? false,
                  source_screen: 'library',
                });
                router.push(`/pack/${pack.id}` as any);
              }}
            />
          ))}
        </View>
      )}

      {/* Library */}
      <Text style={styles.sectionHeader}>Library</Text>

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
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.textMuted,
    marginBottom: 12,
  },
  packsList: {
    gap: spacing.sm,
    marginBottom: 28,
  },
  packCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  packCardActive: {
    borderColor: 'rgba(167, 139, 250, 0.5)',
  },
  packImageWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    overflow: 'hidden',
  },
  packImage: {
    width: '100%' as any,
    height: '100%' as any,
  },
  packImagePlaceholder: {
    width: '100%' as any,
    height: '100%' as any,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  packBody: {
    flex: 1,
  },
  packCoachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  packCoachLine: {
    flex: 1,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 0.2,
  },
  packSportLine: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accentLight,
    letterSpacing: 0.2,
    marginTop: -1,
    marginBottom: 2,
  },
  activeBadge: {
    flexShrink: 0,
    backgroundColor: colors.accentSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 6,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.accentLight,
    letterSpacing: 0.6,
  },
  completedBadge: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accentSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 6,
  },
  completedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.accentLight,
    letterSpacing: 0.6,
  },
  packTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceLight,
    overflow: 'hidden',
    marginBottom: 5,
  },
  progressFill: {
    height: '100%' as any,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  packProgressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 28,
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
