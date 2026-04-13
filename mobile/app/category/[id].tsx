import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, spacing } from '@/lib/theme';

type Lesson = {
  id: string;
  title: string;
  duration_seconds: number;
  lesson_type: string;
  categories: string[];
  program_day?: number | null;
};

type LessonsResponse = {
  items: Lesson[];
  page: number;
  limit: number;
  total: number;
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
  | { kind: 'divider' };

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const label = MAC_LABELS[id ?? ''] ?? id ?? '';
  const categoryColor = MAC_COLORS[id ?? ''] ?? colors.accentLight;

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fetchLessons = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await apiFetch<LessonsResponse>(
      '/lessons?limit=50',
    );
    if (err) {
      setError(err);
    } else if (data) {
      setLessons(
        data.items.filter(
          (l) =>
            l.lesson_type !== 'onboarding-sample' &&
            l.categories.includes(id ?? ''),
        ),
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLessons();
  }, [id]);

  // Split into regular library lessons and past WODs; server already sorts them
  // but we insert a visual divider between the two groups.
  const regularLessons = lessons.filter((l) => !l.program_day);
  const wodLessons = lessons.filter((l) => !!l.program_day);

  const listData: ListItem[] = [
    ...regularLessons.map((l): ListItem => ({ kind: 'lesson', lesson: l })),
    ...(wodLessons.length > 0
      ? [
          { kind: 'divider' } as ListItem,
          ...wodLessons.map((l): ListItem => ({ kind: 'lesson', lesson: l })),
        ]
      : []),
  ];

  const renderLesson = (lesson: Lesson) => {
    const mins = Math.ceil(lesson.duration_seconds / 60);
    const dayLabel = lesson.program_day ? `DAY ${lesson.program_day}` : null;
    const isLibrary =
      lesson.lesson_type === 'library' || lesson.lesson_type === 'library_long';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => router.push(`/lesson/${lesson.id}` as any)}
      >
        {dayLabel && (
          <Text style={styles.cardDayLabel}>{dayLabel}</Text>
        )}
        <View style={styles.cardRow}>
          <View style={styles.cardLeft}>
            <Text style={styles.cardTitle}>{lesson.title}</Text>
            {!isLibrary && <Text style={styles.cardTime}>{mins} min</Text>}
          </View>
          <View style={[
            styles.cardDurationPill,
            isLibrary && {
              backgroundColor: `${categoryColor}1e`,
              borderColor: `${categoryColor}55`,
            },
          ]}>
            <Text style={[
              styles.cardDurationText,
              isLibrary && { color: categoryColor },
            ]}>~{mins} min</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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
        keyExtractor={(item, index) =>
          item.kind === 'divider' ? `divider-${index}` : item.lesson.id
        }
        ListEmptyComponent={
          loading ? null : error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={fetchLessons}>
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
                <Text style={styles.dividerLabel}>Past WODs</Text>
                <View style={styles.dividerLine} />
              </View>
            );
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
  cardTime: {
    fontSize: 12,
    color: colors.textMuted,
  },
  cardBadge: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    marginLeft: 12,
  },
  cardBadgeShort: {
    backgroundColor: 'rgba(96,165,250,0.12)',
    borderColor: 'rgba(96,165,250,0.3)',
  },
  cardBadgeLong: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderColor: 'rgba(139,92,246,0.3)',
  },
  cardBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  cardBadgeTextShort: {
    color: colors.ringMindfulness,
  },
  cardBadgeTextLong: {
    color: colors.accentLight,
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
