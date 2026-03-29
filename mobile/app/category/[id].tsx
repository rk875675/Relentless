import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, spacing } from '@/lib/theme';

type Lesson = {
  id: string;
  title: string;
  duration_seconds: number;
  lesson_type: string;
  categories: string[];
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

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const label = MAC_LABELS[id ?? ''] ?? id ?? '';

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

  return (
    <>
      <Stack.Screen options={{ title: label }} />
      <FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          !loading && (error || lessons.length === 0) && styles.listCentered,
        ]}
        data={lessons}
        keyExtractor={(item) => item.id}
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
        renderItem={({ item: lesson }) => {
          const mins = Math.floor(lesson.duration_seconds / 60);
          const secs = lesson.duration_seconds % 60;
          const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
          return (
            <TouchableOpacity style={styles.card} activeOpacity={0.8}>
              <Text style={styles.cardTitle}>{lesson.title}</Text>
              <Text style={styles.cardMeta}>{timeStr}</Text>
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
    padding: spacing.lg,
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
    borderRadius: 14,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  cardMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
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
    borderColor: colors.surfaceLight,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    color: colors.white,
    fontSize: 14,
  },
});
