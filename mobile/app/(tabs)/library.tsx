import { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { apiFetch } from '@/lib/api';
import { ProgressRing } from '@/components/ProgressRing';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';

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

type Progress = {
  mindfulness_score: number;
  acceptance_score: number;
  commitment_score: number;
};

type Streak = {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
};

const MAC_ORDER = ['mindfulness', 'acceptance', 'commitment'] as const;

const MAC_LABELS: Record<string, string> = {
  mindfulness: 'Mindfulness',
  acceptance: 'Acceptance',
  commitment: 'Commitment',
};

export default function LibraryScreen() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    const [lessonsRes, progressRes, streakRes] = await Promise.all([
      apiFetch<LessonsResponse>('/lessons?limit=50'),
      apiFetch<Progress>('/progress'),
      apiFetch<Streak>('/streak'),
    ]);
    if (lessonsRes.error) {
      setError(lessonsRes.error);
    } else if (lessonsRes.data) {
      setLessons(
        lessonsRes.data.items.filter((l) => l.lesson_type !== 'onboarding-sample'),
      );
    }
    if (progressRes.data) setProgress(progressRes.data);
    if (streakRes.data) setStreak(streakRes.data);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.white} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const grouped = MAC_ORDER.map((cat) => ({
    category: cat,
    label: MAC_LABELS[cat],
    items: lessons.filter((l) => l.categories.includes(cat)),
  })).filter((g) => g.items.length > 0);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brand}>RELENTLESS</Text>
        <Text style={styles.streak}>{streak?.current_streak ?? 0}🔥</Text>
      </View>

      {/* MAC Progress Rings */}
      <View style={styles.ringsRow}>
        <ProgressRing
          percentage={progress?.mindfulness_score ?? 0}
          label="Mindfulness"
        />
        <ProgressRing
          percentage={progress?.acceptance_score ?? 0}
          label="Acceptance"
        />
        <ProgressRing
          percentage={progress?.commitment_score ?? 0}
          label="Commitment"
        />
      </View>

      {/* Lesson Cards */}
      {grouped.map((group) =>
        group.items.map((lesson) => {
          const mins = Math.floor(lesson.duration_seconds / 60);
          const secs = lesson.duration_seconds % 60;
          const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
          return (
            <TouchableOpacity
              key={lesson.id}
              style={styles.lessonCard}
              activeOpacity={0.8}
            >
              <Text style={styles.lessonCategory}>{group.label}:</Text>
              <Text style={styles.lessonInfo}>
                {timeStr} - {lesson.title}
              </Text>
            </TouchableOpacity>
          );
        }),
      )}

      {/* Coach CTA — PRD: subtle outbound path to coach for 1:1 help */}
      <TouchableOpacity style={styles.ctaCard} activeOpacity={0.8}>
        <Text style={styles.ctaTitle}>
          CTA - 1 on 1 lessons with Grant
        </Text>
        <Text style={styles.ctaSub}>
          (his specific offer for those looking for individuality)
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  brand: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 2,
  },
  streak: {
    fontSize: 22,
    color: colors.white,
    fontWeight: '700',
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  lessonCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  lessonCategory: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    marginBottom: spacing.xs,
  },
  lessonInfo: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  ctaCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  ctaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
  },
  ctaSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
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
