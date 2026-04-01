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
  const router = useRouter();
  const label = MAC_LABELS[id ?? ''] ?? id ?? '';

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [libraryLocked, setLibraryLocked] = useState(false);

  const fetchLessons = async () => {
    setLoading(true);
    setError('');
    setLibraryLocked(false);
    const progRes = await apiFetch<{
      library_unlocked?: boolean;
      library_lock_reason?: string | null;
      library_lock_remaining?: number;
    }>('/progress');
    if (progRes.error) {
      setError(progRes.error);
      setLoading(false);
      return;
    }
    if (progRes.data?.library_unlocked !== true) {
      setLibraryLocked(true);
      setLessons([]);
      setLoading(false);
      return;
    }
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
          !loading && (error || libraryLocked || lessons.length === 0) && styles.listCentered,
        ]}
        data={lessons}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          loading ? null : libraryLocked ? (
            <View style={styles.errorWrap}>
              <Text style={styles.emptyText}>
                Complete your Daily Workout(s) on the Home tab to catch up and unlock the library.
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
                <Text style={styles.retryText}>Go back</Text>
              </TouchableOpacity>
            </View>
          ) : error ? (
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
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push(`/lesson/${lesson.id}` as any)}
            >
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
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    letterSpacing: 0.3,
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
