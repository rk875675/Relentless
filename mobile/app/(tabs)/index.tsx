import { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
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

export default function HomeScreen() {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const [journalText, setJournalText] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    setCompleted(false);
    const [lessonRes, progressRes, streakRes] = await Promise.all([
      apiFetch<Lesson>('/lessons/next'),
      apiFetch<Progress>('/progress'),
      apiFetch<Streak>('/streak'),
    ]);
    if (lessonRes.error && progressRes.error) {
      setError(lessonRes.error ?? 'Failed to load');
    }
    setLesson(lessonRes.data);
    setProgress(progressRes.data);
    setStreak(streakRes.data);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  const handleStartWorkout = async () => {
    if (!lesson) return;
    setCompleting(true);
    const { error: err } = await apiFetch(
      '/lessons/' + lesson.id + '/complete',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': `${lesson.id}-${Date.now()}` },
      },
    );
    setCompleting(false);
    if (err) {
      setError(err);
    } else {
      setCompleted(true);
    }
  };

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

  const mins = lesson ? Math.ceil(lesson.duration_seconds / 60) : 0;

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

      {/* Workout of the Day */}
      {completed ? (
        <View style={styles.workoutCard}>
          <Text style={styles.doneIcon}>✓</Text>
          <Text style={styles.workoutHeading}>Workout Complete</Text>
          <Text style={styles.workoutSub}>
            Nice work. The Library is now unlocked.
          </Text>
          <TouchableOpacity style={styles.nextBtn} onPress={fetchData}>
            <Text style={styles.nextBtnText}>Next Workout</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.workoutCard}
          activeOpacity={0.8}
          onPress={handleStartWorkout}
          disabled={!lesson || completing}
        >
          <Text style={styles.workoutHeading}>Workout of the Day:</Text>
          {lesson ? (
            <>
              <Text style={styles.workoutTitle}>{lesson.title}</Text>
              <Text style={styles.workoutMeta}>{mins}-min lesson</Text>
            </>
          ) : (
            <>
              <Text style={styles.workoutTitle}>All caught up!</Text>
              <Text style={styles.workoutMeta}>Check back tomorrow</Text>
            </>
          )}
          {completing && (
            <ActivityIndicator
              color={colors.white}
              style={{ marginTop: spacing.md }}
            />
          )}
        </TouchableOpacity>
      )}

      {/* Competition Countdown + Journal */}
      <View style={styles.journalCard}>
        <Text style={styles.competitionLabel}>
          Days until competition: —
        </Text>
        <TextInput
          style={styles.journalInput}
          placeholder="How are you feeling..?"
          placeholderTextColor={colors.textMuted}
          value={journalText}
          onChangeText={setJournalText}
          multiline
        />
      </View>
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
  workoutCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  workoutHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    marginBottom: spacing.sm,
  },
  workoutTitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  workoutMeta: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  workoutSub: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  doneIcon: {
    fontSize: 40,
    color: colors.success,
    marginBottom: spacing.sm,
  },
  nextBtn: {
    borderWidth: 1,
    borderColor: colors.surfaceLight,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: spacing.md,
  },
  nextBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  journalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
  },
  competitionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
    marginBottom: spacing.md,
  },
  journalInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 10,
    padding: spacing.md,
    color: colors.white,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
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
