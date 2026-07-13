import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  ImageSourcePropType,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '@/lib/api';
import { getCached, setCached, bustCache } from '@/lib/api-cache';
import { LessonListSkeleton } from '@/components/Skeleton';
import { colors, spacing } from '@/lib/theme';
import { approxLessonMinutes } from '@/lib/approx-lesson-minutes';

const GRANT_PHOTO = require('../../assets/images/grant_chiasson_hero.png') as ImageSourcePropType;

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
  coach_avatar_url?: string | null;
};

type LessonsResponse = {
  items: Lesson[];
  page: number;
  limit: number;
  total: number;
};

type ProgramBubble = {
  program_id: string;
  program_title: string;
  coach_name: string;
  coach_avatar_url: string | null;
  wod_count: number;
};

const MAC_LABELS: Record<string, string> = {
  mindfulness: 'Mindfulness',
  acceptance: 'Acceptance',
  commitment: 'Commitment',
};

const MAC_COLORS: Record<string, string> = {
  mindfulness: colors.ringMindfulness,
  acceptance: colors.ringAcceptance,
  commitment: colors.ringCommitment,
};

type ListItem =
  | { kind: 'lesson'; lesson: Lesson }
  | { kind: 'divider' }
  | { kind: 'program-bubble'; bubble: ProgramBubble };

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const label = MAC_LABELS[id ?? ''] ?? id ?? '';
  const categoryColor = MAC_COLORS[id ?? ''] ?? colors.accentLight;

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const lessonsCacheKey = '/lessons?limit=50';

  const applyLessons = (items: Lesson[]) => {
    setLessons(
      items.filter(
        (l) =>
          l.lesson_type !== 'onboarding-sample' &&
          l.categories.includes(id ?? ''),
      ),
    );
  };

  const fetchLessons = async (isPull = false) => {
    setError('');
    if (isPull) {
      setRefreshing(true);
      bustCache(lessonsCacheKey);
    } else {
      const cachedLessons = getCached<LessonsResponse>(lessonsCacheKey);
      if (cachedLessons) {
        applyLessons(cachedLessons.items);
        setLoading(false);
        return;
      }
    }

    const lessonsRes = await apiFetch<LessonsResponse>(lessonsCacheKey);

    if (lessonsRes.error) {
      setError(lessonsRes.error);
    } else if (lessonsRes.data) {
      applyLessons(lessonsRes.data.items);
      setCached(lessonsCacheKey, lessonsRes.data);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchLessons();
  }, [id]);

  const regularLessons = lessons.filter((l) => !l.program_day);
  const wodLessons = lessons.filter((l) => !!l.program_day);

  // One bubble per distinct program that has at least one eligible/completed
  // lesson in this category. A pack's cover only appears in the Library once the
  // user has done a lesson from it (no "Coming soon" preview bubbles).
  const programBubbles: ProgramBubble[] = [];
  const seenProgramIds = new Set<string>();

  for (const w of wodLessons) {
    const pid = w.program_id ?? 'unknown';
    if (!seenProgramIds.has(pid)) {
      seenProgramIds.add(pid);
      programBubbles.push({
        program_id: pid,
        program_title: w.program_title ?? 'Past WODs',
        coach_name: w.coach_name ?? '',
        coach_avatar_url: w.coach_avatar_url ?? null,
        wod_count: wodLessons.filter((x) => (x.program_id ?? 'unknown') === pid).length,
      });
    }
  }

  const listData: ListItem[] = [
    ...regularLessons.map((l): ListItem => ({ kind: 'lesson', lesson: l })),
    ...(programBubbles.length > 0
      ? [
          { kind: 'divider' } as ListItem,
          ...programBubbles.map((b): ListItem => ({ kind: 'program-bubble', bubble: b })),
        ]
      : []),
  ];

  const renderLesson = (lesson: Lesson) => {
    const mins = approxLessonMinutes(lesson.duration_seconds);
    const isLibrary =
      lesson.lesson_type === 'library' || lesson.lesson_type === 'library_long';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => router.push(`/lesson/${lesson.id}` as any)}
      >
        <View style={styles.cardRow}>
          <View style={styles.cardLeft}>
            <Text style={styles.cardTitle}>{lesson.title}</Text>
            {!isLibrary && <Text style={styles.cardTime}>{mins} min</Text>}
          </View>
          <View style={[
            styles.cardDurationPill,
            { backgroundColor: `${categoryColor}1e`, borderColor: `${categoryColor}55` },
          ]}>
            <Text style={[styles.cardDurationText, { color: categoryColor }]}>{mins} min</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderProgramBubble = (bubble: ProgramBubble) => (
    <TouchableOpacity
      style={styles.programBubble}
      activeOpacity={0.8}
      onPress={() =>
        router.push(`/program-wods/${bubble.program_id}?category=${id}` as any)
      }
    >
      {bubble.coach_avatar_url || bubble.coach_name === 'Grant Chiasson' ? (
        <Image
          source={bubble.coach_avatar_url ? { uri: bubble.coach_avatar_url } : GRANT_PHOTO}
          style={styles.programBubbleAvatar}
        />
      ) : (
        <View style={[styles.programBubbleAvatar, styles.programBubbleAvatarPlaceholder]} />
      )}
      <View style={styles.programBubbleLeft}>
        <Text style={styles.programBubbleTitle}>{bubble.program_title}</Text>
        <Text style={styles.programBubbleMeta}>
          {bubble.coach_name ? `${bubble.coach_name} · ` : ''}
          {bubble.wod_count > 0
            ? `${bubble.wod_count} ${bubble.wod_count === 1 ? 'lesson' : 'lessons'}`
            : 'Coming soon'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <>
      <Stack.Screen options={{ title: label }} />
      <FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          !loading && (error || lessons.length === 0) && styles.listCentered,
        ]}
        data={listData}
        keyExtractor={(item, index) => {
          if (item.kind === 'divider') return `divider-${index}`;
          if (item.kind === 'program-bubble') return `prog-${item.bubble.program_id}`;
          return item.lesson.id;
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchLessons(true)}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          /* UX-PERF: skeleton loader replaces blank list while loading */
          loading ? (
            <LessonListSkeleton />
          ) : error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchLessons()}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.emptyText}>
              No {label.toLowerCase()} lessons available yet.
            </Text>
          )
        }
        renderItem={({ item }) => {
          if (item.kind === 'divider') {
            return (
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerLabel}>Lesson Packs</Text>
                <View style={styles.dividerLine} />
              </View>
            );
          }
          if (item.kind === 'program-bubble') {
            return renderProgramBubble(item.bubble);
          }
          return renderLesson(item.lesson);
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
  cardTime: {
    fontSize: 12,
    color: colors.textMuted,
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  programBubble: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  programBubbleAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  programBubbleAvatarPlaceholder: {
    backgroundColor: colors.surfaceLight,
  },
  programBubbleLeft: {
    flex: 1,
  },
  programBubbleTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  programBubbleMeta: {
    fontSize: 13,
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
