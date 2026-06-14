import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { getCached, setCached, bustCache } from '@/lib/api-cache';
import { LessonListSkeleton } from '@/components/Skeleton';
import { colors, spacing } from '@/lib/theme';
import { approxLessonMinutes } from '@/lib/approx-lesson-minutes';

type Lesson = {
  id: string;
  title: string;
  duration_seconds: number;
  lesson_type: string;
  categories: string[];
  program_day?: number | null;
  program_id?: string | null;
  program_title?: string | null;
  coach_name?: string | null;
};

type LessonsResponse = {
  items: Lesson[];
  page: number;
  limit: number;
  total: number;
};

const MAC_COLORS: Record<string, string> = {
  mindfulness: colors.ringMindfulness,
  acceptance: colors.ringAcceptance,
  commitment: colors.ringCommitment,
};

export default function ProgramWodsScreen() {
  const { programId, category } = useLocalSearchParams<{
    programId: string;
    category: string;
  }>();
  const router = useRouter();
  const categoryColor = MAC_COLORS[category ?? ''] ?? colors.accentLight;

  const [wods, setWods] = useState<Lesson[]>([]);
  const [programTitle, setProgramTitle] = useState('');
  const [coachName, setCoachName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const cacheKey = '/lessons?limit=50';

  const applyItems = (items: Lesson[]) => {
    const filtered = items.filter(
      (l) =>
        l.lesson_type !== 'onboarding-sample' &&
        !!l.program_day &&
        (l.program_id ?? 'unknown') === (programId ?? '') &&
        (category ? l.categories.includes(category) : true),
    );
    setWods(filtered);
    if (filtered.length > 0) {
      setProgramTitle(filtered[0].program_title ?? '');
      setCoachName(filtered[0].coach_name ?? '');
    }
  };

  const fetchLessons = async (isPull = false) => {
    setError('');
    if (isPull) {
      setRefreshing(true);
      bustCache(cacheKey);
    } else {
      const cached = getCached<LessonsResponse>(cacheKey);
      if (cached) {
        applyItems(cached.items);
        setLoading(false);
        return;
      }
    }
    const { data, error: err } = await apiFetch<LessonsResponse>(cacheKey);
    if (err) {
      setError(err);
    } else if (data) {
      applyItems(data.items);
      setCached(cacheKey, data);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchLessons();
  }, [programId, category]);

  const screenTitle = programTitle || 'Past WODs';

  return (
    <>
      <Stack.Screen
        options={{
          title: screenTitle,
          headerBackTitle: 'Back',
        }}
      />
      <FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          !loading && (error || wods.length === 0) && styles.listCentered,
        ]}
        data={wods}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchLessons(true)}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          coachName
            ? () => <Text style={styles.coachLabel}>{coachName}</Text>
            : null
        }
        ListEmptyComponent={
          loading ? (
            <LessonListSkeleton />
          ) : error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => void fetchLessons()}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.emptyText}>No past WODs available yet.</Text>
          )
        }
        renderItem={({ item: lesson }) => {
          const mins = approxLessonMinutes(lesson.duration_seconds);
          const dayLabel = lesson.program_day ? `DAY ${lesson.program_day}` : null;

          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push(`/lesson/${lesson.id}` as any)}
            >
              {dayLabel && <Text style={styles.cardDayLabel}>{dayLabel}</Text>}
              <View style={styles.cardRow}>
                <View style={styles.cardLeft}>
                  <Text style={styles.cardTitle}>{lesson.title}</Text>
                </View>
                <View
                  style={[
                    styles.cardDurationPill,
                    {
                      backgroundColor: `${categoryColor}1e`,
                      borderColor: `${categoryColor}55`,
                    },
                  ]}
                >
                  <Text style={[styles.cardDurationText, { color: categoryColor }]}>
                    {mins} min
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coachLabel: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 16,
  },
  errorWrap: {
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: 12,
  },
  cardDayLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardLeft: {
    flex: 1,
    minHeight: 38,
    justifyContent: 'flex-start',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardDurationPill: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: 12,
  },
  cardDurationText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
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
