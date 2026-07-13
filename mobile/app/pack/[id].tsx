import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { apiFetch } from '@/lib/api';
import { bustCache, getCached, setCached } from '@/lib/api-cache';
import { coachAvatarSource } from '@/lib/coach-photo';
import { approxLessonMinutes } from '@/lib/approx-lesson-minutes';
import { HOME_PROGRAM_ANCHOR_HEADERS } from '@/lib/device-calendar';
import { trackPackCtaClicked } from '@/lib/core-analytics';
import { selectProgram } from '@/lib/switch-program';
import { LessonListSkeleton } from '@/components/Skeleton';
import { colors, spacing } from '@/lib/theme';

type PackLesson = {
  id: string;
  title: string;
  duration_seconds: number;
  day: number;
  completed: boolean;
  is_current: boolean;
};

type LessonPackSummary = {
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

type PackDetail = LessonPackSummary & {
  completed_count?: number;
  lessons: PackLesson[];
};

type LessonsListItem = {
  id: string;
  title: string;
  duration_seconds: number;
  program_id?: string | null;
  program_day?: number | null;
};

function packLessons(detail: PackDetail): PackLesson[] {
  return Array.isArray(detail.lessons) ? detail.lessons : [];
}

function completedCount(detail: PackDetail): number {
  if (typeof detail.completed_count === 'number') return detail.completed_count;
  return packLessons(detail).filter((l) => l.completed).length;
}

function totalDays(detail: PackDetail): number {
  const fromMeta = detail.total_days ?? 0;
  const fromLessons = packLessons(detail).length;
  return Math.max(fromMeta, fromLessons);
}

/**
 * A previously-finished pack the user restarted and is actively redoing:
 * show live day progress (ACTIVE badge + day counter) instead of the sticky
 * COMPLETED state. Mirrors the Library tab's isActivelyRedoing.
 */
function isActivelyRedoing(detail: PackDetail): boolean {
  const total = totalDays(detail);
  return (
    detail.is_active === true &&
    detail.completed === true &&
    typeof detail.current_day === 'number' &&
    total > 0 &&
    detail.current_day < total
  );
}

function progressFraction(detail: PackDetail): number {
  if (detail.completed && !isActivelyRedoing(detail)) return 1;
  const total = totalDays(detail);
  if (!total) return 0;
  if (isActivelyRedoing(detail)) {
    const day = typeof detail.current_day === 'number' ? detail.current_day : 1;
    return Math.min(1, Math.max(0, (day - 1) / total));
  }
  return Math.min(1, Math.max(0, completedCount(detail) / total));
}

function progressLabel(detail: PackDetail): string {
  const total = totalDays(detail);
  if (isActivelyRedoing(detail)) {
    return total ? `Day ${detail.current_day} of ${total}` : `Day ${detail.current_day}`;
  }
  if (detail.completed) return 'Completed';
  const done = completedCount(detail);
  if (!detail.started || done === 0) return total ? `0 of ${total} lessons` : 'Not started';
  if (typeof detail.current_day === 'number' && total) {
    return `${done} of ${total} completed · Day ${detail.current_day}`;
  }
  return total ? `${done} of ${total} completed` : `${done} completed`;
}

function packImageSource(detail: PackDetail): ImageSourcePropType | null {
  if (detail.cover_image && /^https?:\/\//i.test(detail.cover_image)) {
    return { uri: detail.cover_image };
  }
  return coachAvatarSource(detail.coach_avatar_url, detail.coach_name);
}

function coachLine(detail: PackDetail): string {
  return `${detail.coach_name}${detail.coach_sport ? ` (${detail.coach_sport})` : ''}`;
}

function lessonIsPlayable(lesson: PackLesson, detail: PackDetail): boolean {
  if (lesson.id.includes('-day-')) return false;
  if (detail.completed) return true;
  if (lesson.completed) return true;
  return detail.is_active === true && lesson.is_current === true;
}

function currentLessonFromDetail(detail: PackDetail): PackLesson | undefined {
  return packLessons(detail).find((l) => l.is_current && !l.id.includes('-day-'));
}

function isPackDetailResponse(data: unknown): data is PackDetail {
  if (!data || typeof data !== 'object') return false;
  const row = data as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.title === 'string' && Array.isArray(row.lessons);
}

function buildLessonsFromSummary(
  pack: LessonPackSummary,
  knownLessons: LessonsListItem[],
): PackLesson[] {
  const byDay = new Map<number, LessonsListItem>();
  for (const lesson of knownLessons) {
    if (lesson.program_id === pack.id && typeof lesson.program_day === 'number') {
      byDay.set(lesson.program_day, lesson);
    }
  }

  const total = pack.total_days ?? (byDay.size > 0 ? Math.max(...byDay.keys()) : 0);
  if (!total) return [];

  const lessons: PackLesson[] = [];
  for (let day = 1; day <= total; day += 1) {
    const known = byDay.get(day);
    const completed = pack.completed
      ? true
      : pack.started && typeof pack.current_day === 'number'
        ? day < pack.current_day
        : false;
    lessons.push({
      id: known?.id ?? `${pack.id}-day-${day}`,
      title: known?.title ?? `Day ${day}`,
      duration_seconds: known?.duration_seconds ?? 0,
      day,
      completed,
      is_current: pack.is_active === true && pack.current_day === day,
    });
  }
  return lessons;
}

async function fetchPackDetailFallback(programId: string): Promise<PackDetail | null> {
  const [packsRes, lessonsRes] = await Promise.all([
    apiFetch<{ items: LessonPackSummary[] }>('/programs?include_active=1'),
    apiFetch<{ items: LessonsListItem[] }>('/lessons?limit=50'),
  ]);

  const pack = packsRes.data?.items?.find((p) => p.id === programId);
  if (!pack) return null;

  const lessons = buildLessonsFromSummary(pack, lessonsRes.data?.items ?? []);
  return {
    ...pack,
    completed_count: lessons.filter((l) => l.completed).length,
    lessons,
  };
}

export default function PackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [detail, setDetail] = useState<PackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false);

  const cacheKey = `/programs/${id ?? ''}`;
  const heroWidth = windowWidth - 40;
  const heroHeight = Math.round(heroWidth / 1.2);

  const fetchDetail = useCallback(async (isPull = false) => {
    if (!id) return;
    setError('');
    if (isPull) {
      setRefreshing(true);
      bustCache(cacheKey);
    } else {
      const cached = getCached<PackDetail>(cacheKey);
      if (cached && isPackDetailResponse(cached)) {
        setDetail(cached);
        setLoading(false);
      }
    }

    const { data, error: err } = await apiFetch<PackDetail>(cacheKey);
    if (isPackDetailResponse(data)) {
      setDetail(data);
      setCached(cacheKey, data);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const fallback = await fetchPackDetailFallback(id);
    if (fallback) {
      setDetail(fallback);
      setCached(cacheKey, fallback);
      setError('');
    } else if (err) {
      setError(err);
    } else {
      setError('Could not load this lesson pack.');
    }

    setLoading(false);
    setRefreshing(false);
  }, [cacheKey, id]);

  useFocusEffect(
    useCallback(() => {
      void fetchDetail();
    }, [fetchDetail]),
  );

  const applySwitch = useCallback(
    async (mode: 'continue' | 'restart', action: 'activate' | 'continue' | 'restart') => {
      if (!detail || switching) return;
      trackPackCtaClicked({
        program_id: detail.id,
        program_title: detail.title,
        coach_name: detail.coach_name,
        action,
        source_screen: 'pack_detail',
      });
      setSwitching(true);
      const err = await selectProgram(detail.id, mode);
      setSwitching(false);
      if (err) {
        Alert.alert('Could not switch pack', err);
        return;
      }
      bustCache(cacheKey, '/programs?include_active=1');
      void fetchDetail(true);
    },
    [cacheKey, detail, fetchDetail, switching],
  );

  const confirmRestart = useCallback(() => {
    if (!detail) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      detail.title,
      'Restart this pack from day 1? Your completed lessons stay in your Library.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restart', style: 'destructive', onPress: () => void applySwitch('restart', 'restart') },
      ],
    );
  }, [applySwitch, detail]);

  const confirmStart = useCallback(() => {
    if (!detail) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      detail.title,
      'Make this your daily workout pack? It will replace your current program as your daily workout.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start', onPress: () => void applySwitch('restart', 'activate') },
      ],
    );
  }, [applySwitch, detail]);

  const handleContinue = useCallback(() => {
    if (!detail) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void applySwitch('continue', 'continue');
  }, [applySwitch, detail]);

  const handleStartTodayWorkout = useCallback(async () => {
    if (!detail?.is_active) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    trackPackCtaClicked({
      program_id: detail.id,
      program_title: detail.title,
      coach_name: detail.coach_name,
      action: 'start_today_workout',
      source_screen: 'pack_detail',
    });

    const fromDetail = currentLessonFromDetail(detail);
    if (fromDetail) {
      bustCache('/lessons/next', '/progress', '/streak');
      router.push(`/lesson/${fromDetail.id}` as any);
      return;
    }

    type NextLessonCache = {
      data: { id: string } | null;
      rawBody?: Record<string, unknown>;
    };
    const cached = getCached<NextLessonCache>('/lessons/next');
    let targetId = cached?.data?.id
      ?? (cached?.rawBody?.repeat_lesson as { id?: string } | undefined)?.id;

    if (!targetId) {
      const { data, rawBody } = await apiFetch<{ id: string }>('/lessons/next', {
        headers: { ...HOME_PROGRAM_ANCHOR_HEADERS },
      });
      targetId = data?.id ?? (rawBody?.repeat_lesson as { id?: string } | undefined)?.id;
    }

    if (!targetId) {
      Alert.alert('No workout ready', 'Check back tomorrow for your next lesson.');
      return;
    }

    bustCache('/lessons/next', '/progress', '/streak');
    router.push(`/lesson/${targetId}` as any);
  }, [detail, router]);

  const renderActionButtons = () => {
    if (!detail || detail.is_active) {
      return (
        <TouchableOpacity
          style={[styles.primaryBtn, switching && styles.btnDisabled]}
          activeOpacity={0.85}
          disabled={switching}
          onPress={() => void handleStartTodayWorkout()}
        >
          <Ionicons name="play" size={16} color={colors.white} />
          <Text style={styles.primaryBtnText}>Start today&apos;s workout</Text>
        </TouchableOpacity>
      );
    }

    if (detail.completed) {
      return (
        <TouchableOpacity
          style={[styles.primaryBtn, switching && styles.btnDisabled]}
          activeOpacity={0.85}
          disabled={switching}
          onPress={confirmRestart}
        >
          <Text style={styles.primaryBtnText}>{switching ? 'Switching…' : 'Restart'}</Text>
        </TouchableOpacity>
      );
    }

    if (detail.started) {
      return (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.secondaryBtn, switching && styles.btnDisabled]}
            activeOpacity={0.85}
            disabled={switching}
            onPress={confirmRestart}
          >
            <Text style={styles.secondaryBtnText}>Restart</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.actionRowPrimary, switching && styles.btnDisabled]}
            activeOpacity={0.85}
            disabled={switching}
            onPress={handleContinue}
          >
            <Text style={styles.primaryBtnText}>{switching ? 'Switching…' : 'Continue'}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.primaryBtn, switching && styles.btnDisabled]}
        activeOpacity={0.85}
        disabled={switching}
        onPress={confirmStart}
      >
        <Text style={styles.primaryBtnText}>{switching ? 'Switching…' : 'Start'}</Text>
      </TouchableOpacity>
    );
  };

  const renderLesson = (lesson: PackLesson) => {
    const mins = approxLessonMinutes(lesson.duration_seconds);
    const playable = detail ? lessonIsPlayable(lesson, detail) : false;

    return (
      <TouchableOpacity
        style={[
          styles.lessonCard,
          lesson.is_current && styles.lessonCardCurrent,
          !playable && styles.lessonCardLocked,
        ]}
        activeOpacity={playable ? 0.8 : 1}
        disabled={!playable}
        onPress={() => {
          if (!playable) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/lesson/${lesson.id}` as any);
        }}
      >
        <View style={styles.lessonLeft}>
          <View
            style={[
              styles.lessonStatus,
              lesson.completed && styles.lessonStatusDone,
              lesson.is_current && !lesson.completed && styles.lessonStatusCurrent,
            ]}
          >
            {lesson.completed ? (
              <Ionicons name="checkmark" size={14} color={colors.accentLight} />
            ) : lesson.is_current ? (
              <Ionicons name="play" size={12} color={colors.accentLight} />
            ) : (
              <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
            )}
          </View>
          <View style={styles.lessonText}>
            <Text style={styles.lessonTitle} numberOfLines={2}>{lesson.title}</Text>
            <Text style={styles.lessonDay}>Day {lesson.day}</Text>
          </View>
        </View>
        {lesson.duration_seconds > 0 ? (
          <View style={styles.lessonDurationPill}>
            <Text style={styles.lessonDurationText}>{mins} min</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const lessons = detail ? packLessons(detail) : [];

  const ListHeader = detail ? (
    <View style={styles.headerBlock}>
      <View style={[styles.heroWrap, { width: heroWidth, height: heroHeight }]}>
        {packImageSource(detail) ? (
          <Image
            source={packImageSource(detail)!}
            style={{ width: heroWidth, height: heroWidth }}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons name="person" size={64} color={colors.textSecondary} />
          </View>
        )}
        <Text style={styles.heroCoach}>{coachLine(detail)}</Text>
      </View>

      <View style={styles.metaSection}>
        <Text style={styles.packTitle}>{detail.title}</Text>
        <View style={styles.badgesRow}>
          {detail.completed && !isActivelyRedoing(detail) ? (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={11} color={colors.accentLight} />
              <Text style={styles.completedBadgeText}>COMPLETED</Text>
            </View>
          ) : detail.is_active ? (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>ACTIVE</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${progressFraction(detail) * 100}%` },
          ]}
        />
      </View>
      <Text style={styles.progressLabel}>{progressLabel(detail)}</Text>

      {renderActionButtons()}

      <Text style={styles.sectionHeader}>Lessons</Text>
    </View>
  ) : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: detail?.title ?? 'Lesson Pack',
        }}
      />
      <FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          !loading && (error || lessons.length === 0) && styles.listCentered,
        ]}
        data={lessons}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchDetail(true)}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          loading ? (
            <LessonListSkeleton />
          ) : error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchDetail()}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.emptyText}>No lessons in this pack yet.</Text>
          )
        }
        renderItem={({ item }) => renderLesson(item)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  listCentered: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBlock: {
    marginBottom: 8,
  },
  heroWrap: {
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  heroPlaceholder: {
    width: '100%' as any,
    height: '100%' as any,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  heroCoach: {
    position: 'absolute',
    top: 18,
    left: 0,
    right: 0,
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  metaSection: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  packTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 8,
  },
  badgesRow: {
    minHeight: 22,
  },
  activeBadge: {
    backgroundColor: colors.accentSubtle,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.accentLight,
    letterSpacing: 0.6,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accentSubtle,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  completedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.accentLight,
    letterSpacing: 0.6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceLight,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%' as any,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.lg,
  },
  actionRowPrimary: {
    flex: 1,
    marginBottom: 0,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
    marginBottom: spacing.lg,
  },
  secondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.textMuted,
    marginBottom: 12,
  },
  lessonCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lessonCardCurrent: {
    borderColor: 'rgba(167, 139, 250, 0.5)',
  },
  lessonCardLocked: {
    opacity: 0.72,
  },
  lessonLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 12,
  },
  lessonStatus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lessonStatusDone: {
    backgroundColor: colors.accentSubtle,
    borderColor: 'rgba(167, 139, 250, 0.4)',
  },
  lessonStatusCurrent: {
    backgroundColor: colors.accentSubtle,
    borderColor: 'rgba(167, 139, 250, 0.4)',
  },
  lessonText: {
    flex: 1,
  },
  lessonDay: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 3,
  },
  lessonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  lessonDurationPill: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lessonDurationText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  errorWrap: {
    alignItems: 'center',
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
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
});
